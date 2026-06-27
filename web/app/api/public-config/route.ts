import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(
    {
      csprclick_app_id:
        process.env.CSPRCLICK_APP_ID?.trim() ||
        process.env.NEXT_PUBLIC_CSPRCLICK_APP_ID?.trim() ||
        null,
      csprclick_cdn_version: process.env.NEXT_PUBLIC_CSPRCLICK_CDN_VERSION?.trim() || null,
      csprclick_providers: process.env.NEXT_PUBLIC_CSPRCLICK_PROVIDERS?.trim() || null,
      casper_node_rpc_url: process.env.NEXT_PUBLIC_CASPER_NODE_RPC_URL?.trim() || null,
      casper_chain_name: process.env.NEXT_PUBLIC_CASPER_CHAIN_NAME?.trim() || 'casper',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
