import { NextResponse, type NextRequest } from 'next/server';
import { getBackendBaseUrl } from '@/app/lib/admin-session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendBaseUrl()}/auth/wallet/challenge`, {
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

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
