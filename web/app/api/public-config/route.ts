import { NextResponse } from 'next/server';
import { CASPER_RPC_RELAY_PATH } from '@/app/lib/casper-rpc';

export const runtime = 'nodejs';

// NB: no Casper node RPC URL is published here any more. The browser talks
// only to the same-origin relay (app/lib/casper-rpc.ts) — handing it a real
// node URL is what caused the CORS failure on transaction submit, and it would
// also leak an authenticated endpoint into page source.
export async function GET() {
  return NextResponse.json(
    {
      csprclick_app_id:
        process.env.CSPRCLICK_APP_ID?.trim() ||
        process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID?.trim() ||
        null,
      csprclick_cdn_version: process.env.NEXT_PUBLIC_CSPRCLICK_CDN_VERSION?.trim() || null,
      csprclick_providers: process.env.NEXT_PUBLIC_CSPRCLICK_PROVIDERS?.trim() || null,
      casper_rpc_relay_path: CASPER_RPC_RELAY_PATH,
      casper_chain_name: process.env.NEXT_PUBLIC_CASPER_CHAIN_NAME?.trim() || 'casper',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
