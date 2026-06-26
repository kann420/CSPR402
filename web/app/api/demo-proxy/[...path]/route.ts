import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  ADMIN_SESSION_COOKIE,
  PORTAL_API_KEY_COOKIE,
  SESSION_TTL_MS,
  getBackendBaseUrl,
  openSealedSecret,
  sealSecret,
  verifySession,
} from '@/app/lib/admin-session';

export const runtime = 'nodejs';

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const cookieStore = await cookies();
  const session = verifySession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  let apiKey = req.headers.get('x-api-key');
  let sealedPortalKey: string | null = null;

  if (!apiKey) {
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    apiKey = openSealedSecret(cookieStore.get(PORTAL_API_KEY_COOKIE)?.value);
    if (!apiKey) {
      let keyRes: Response;
      try {
        keyRes = await fetch(`${getBackendBaseUrl()}/auth/portal-key`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
            'X-Forwarded-Proto': 'https',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        return NextResponse.json(
          {
            error: 'backend_unavailable',
            message:
              err instanceof Error
                ? `CSPR402 backend is not reachable: ${err.message}`
                : 'CSPR402 backend is not reachable.',
          },
          { status: 502 },
        );
      }
      const keyBody = await keyRes.json().catch(() => ({}));
      if (!keyRes.ok || typeof keyBody?.api_key !== 'string') {
        return NextResponse.json(
          { error: keyBody?.error || 'portal_key_failed', message: keyBody?.message },
          { status: keyRes.status || 502 },
        );
      }
      const mintedApiKey = keyBody.api_key as string;
      apiKey = mintedApiKey;
      sealedPortalKey = sealSecret(mintedApiKey);
    }
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'missing_api_key' }, { status: 401 });
  }

  const { path } = await params;
  if (
    path.some((p) => p === '..' || p === '.' || p === '' || p.includes('\0') || p.includes('/'))
  ) {
    return NextResponse.json({ error: 'bad_path' }, { status: 400 });
  }

  const upstreamUrl = new URL(`${getBackendBaseUrl()}/v1/${path.join('/')}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    'X-Api-Key': apiKey,
    Accept: req.headers.get('accept') || 'application/json',
  };

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type');
    if (contentType) headers['Content-Type'] = contentType;
    body = await req.text();
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await upstream.json().catch(() => ({}));
      const response = NextResponse.json(data, { status: upstream.status });
      if (sealedPortalKey) {
        response.cookies.set(PORTAL_API_KEY_COOKIE, sealedPortalKey, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: SESSION_TTL_MS / 1000,
          path: '/',
        });
      }
      return response;
    }

    const text = await upstream.text();
    const response = new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': contentType || 'text/plain; charset=utf-8' },
    });
    if (sealedPortalKey) {
      response.cookies.set(PORTAL_API_KEY_COOKIE, sealedPortalKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_TTL_MS / 1000,
        path: '/',
      });
    }
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'upstream_fetch_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
