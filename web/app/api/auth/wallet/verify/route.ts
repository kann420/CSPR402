import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  SESSION_TTL_MS,
  getBackendBaseUrl,
  signSession,
} from '@/app/lib/admin-session';

export const runtime = 'nodejs';

interface BackendWalletVerifyResponse {
  token?: string;
  user?: unknown;
  dashboard?: unknown;
  error?: string;
  message?: string;
  debug?: unknown;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendBaseUrl()}/auth/wallet/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify(body),
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

  const data: BackendWalletVerifyResponse = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data.token) {
    return NextResponse.json(
      {
        error: data.error ?? 'wallet_verify_failed',
        message: data.message,
        ...(process.env.NODE_ENV !== 'production' && data.debug ? { debug: data.debug } : {}),
      },
      { status: upstream.status || 401 },
    );
  }

  let sessionCookie: string;
  try {
    sessionCookie = signSession(data.token);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'session_config_error',
        message:
          err instanceof Error ? err.message : 'CSPR402 web session is not configured correctly.',
      },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ user: data.user, dashboard: data.dashboard });
  res.cookies.set(ADMIN_SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
  return res;
}
