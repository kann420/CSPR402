// Same-origin Casper JSON-RPC relay. See app/lib/casper-rpc.ts for the full
// rationale — short version: the browser cannot POST a signed transaction to
// a Casper node (no endpoint answers the CORS preflight), so it posts here and
// the server makes the node call.

import { NextResponse, type NextRequest } from 'next/server';
import {
  MAX_RELAY_ATTEMPTS,
  MAX_RPC_BODY_BYTES,
  RELAY_NODE_TIMEOUT_MS,
  clientKeyFromHeaders,
  createRateLimiter,
  resolveAllowedOrigin,
  resolveRelayNodeUrls,
  shouldFailOver,
  validateRpcRequest,
} from '@/app/lib/casper-rpc';

export const runtime = 'nodejs';

// 60 relayed calls per minute per IP. A full demo run (submit + a handful of
// status polls) is well under this; a scraper reusing us as free RPC is not.
const limiter = createRateLimiter(60, 60_000);

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = resolveAllowedOrigin(process.env, req.headers.get('origin'));
  if (!origin) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(req: NextRequest, body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { ...corsHeaders(req), 'Cache-Control': 'no-store' },
  });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** Liveness probe for the demo runbook. Deliberately leaks no node URLs. */
export async function GET(req: NextRequest) {
  return json(
    req,
    {
      ok: true,
      relay: 'casper-json-rpc',
      nodes: resolveRelayNodeUrls(process.env).length,
      configured: Boolean(process.env.CASPER_NODE_RPC_URL?.trim()),
    },
    200,
  );
}

export async function POST(req: NextRequest) {
  if (!limiter.take(clientKeyFromHeaders(req.headers))) {
    return json(
      req,
      { error: 'rate_limited', message: 'Too many Casper RPC calls. Try again in a minute.' },
      429,
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_RPC_BODY_BYTES) {
    return json(
      req,
      { error: 'payload_too_large', message: 'JSON-RPC request body is too large.' },
      413,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(req, { error: 'invalid_json', message: 'Request body is not valid JSON.' }, 400);
  }

  const validation = validateRpcRequest(parsed);
  if (!validation.ok) {
    return json(req, { error: validation.code, message: validation.message }, 400);
  }

  const auth = process.env.CASPER_NODE_RPC_AUTH?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // CSPR.cloud wants the raw token with no `Bearer ` prefix — same contract as
  // backend/src/payments/casper-rpc-headers.js. It never reaches the browser.
  if (auth) headers.Authorization = auth;

  const nodes = resolveRelayNodeUrls(process.env).slice(0, MAX_RELAY_ATTEMPTS);
  const failures: string[] = [];

  for (const nodeUrl of nodes) {
    try {
      const upstream = await fetch(nodeUrl, {
        method: 'POST',
        headers,
        body: raw,
        cache: 'no-store',
        signal: AbortSignal.timeout(RELAY_NODE_TIMEOUT_MS),
      });

      if (!upstream.ok) {
        // Transport-level rejection (auth, rate limit, node down) — try the
        // next node. Re-sending the SAME signed transaction is idempotent on
        // chain (dedup by hash), so failover cannot double-spend.
        failures.push(`HTTP ${upstream.status}`);
        continue;
      }

      const text = await upstream.text();
      if (shouldFailOver(text)) {
        // Endpoint doesn't implement this method (a read-only gateway asked
        // to accept a transaction) — nothing executed, so move on.
        failures.push('method not served');
        continue;
      }

      // Any other JSON-RPC error is the node's real answer ("invalid
      // transaction", "duplicate") — pass it straight through so the portal
      // shows the actual reason instead of a generic relay failure.
      return new NextResponse(text, {
        status: 200,
        headers: {
          ...corsHeaders(req),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  return json(
    req,
    {
      error: 'node_unreachable',
      message:
        `No Casper node accepted the ${validation.method} call ` +
        `(${nodes.length} endpoint(s) tried). Set CASPER_NODE_RPC_URL on the web service ` +
        `to a reachable node, then retry.`,
      attempts: failures.slice(0, nodes.length),
    },
    502,
  );
}
