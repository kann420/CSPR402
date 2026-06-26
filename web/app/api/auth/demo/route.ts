import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  SESSION_TTL_MS,
  getBackendBaseUrl,
  signSession,
} from '@/app/lib/admin-session';

export const runtime = 'nodejs';

interface BackendDemoLoginResponse {
  token?: string;
  user?: unknown;
  dashboard?: unknown;
  error?: string;
  message?: string;
}

export async function POST() {
  let upstream: Response;
  try {
    upstream = await fetch(`${getBackendBaseUrl()}/auth/demo-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      body: '{}',
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

  const data: BackendDemoLoginResponse = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data.token) {
    return NextResponse.json(
      {
        error: data.error ?? 'demo_login_failed',
        message: data.message ?? 'Demo dashboard login is not enabled.',
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
