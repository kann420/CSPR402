# CSPR402 — Web frontend

Next.js 16 app for [cspr402.xyz](https://cspr402.xyz). Marketing site, API docs, and admin dashboard.

## Development

```bash
npm run dev -w web        # start dev server on :3000
npm run build -w web      # production build
npm run typecheck -w web  # TypeScript check
npm run lint              # ESLint (run from monorepo root)
```

## Environment variables

| Variable                   | Required        | Description                                          |
| -------------------------- | --------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Production only | Backend API base URL, e.g. `https://api.cspr402.xyz` |

In development the dashboard defaults to `http://localhost:4000` for its API base.

### Casper JSON-RPC relay

`/api/casper-rpc` is the only Casper endpoint the browser is allowed to call.
A browser cannot POST a signed transaction to a Casper node — no public node
answers the CORS preflight — so the portal posts here and the server makes the
node call. All optional; the relay works out of the box against a built-in pool
of public mainnet 2.x nodes.

| Variable                       | Description                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `CASPER_NODE_RPC_URL`          | Preferred node endpoint(s), comma-separated. Tried first.                                         |
| `CASPER_NODE_RPC_AUTH`         | Raw access token for an authenticated provider (CSPR.cloud — no `Bearer ` prefix). Server-only.   |
| `CASPER_NODE_RPC_FALLBACK_IPS` | Replaces the built-in failover pool. Bare IPs become `http://IP:7777/rpc`.                        |
| `CASPER_RPC_RELAY_DEFAULTS`    | `0` disables the built-in pool for strict endpoint control.                                       |
| `CASPER_RPC_RELAY_ORIGINS`     | CORS allowlist. Defaults to `*` — the caller may be the CSPR.click iframe, not just our own page. |

> Note: the `casper-mainnet.gateway.tatum.io` gateway used in the backend's
> `.env` examples answers reads but does **not** implement
> `account_put_transaction`. The relay detects that (JSON-RPC `-32601`) and
> fails over to a submit-capable node, so it is safe to keep it configured.

## Structure

```
app/
  page.tsx             Marketing landing page
  docs/                HTTP API reference + quickstart
  dashboard/           Operator dashboard (email OTP auth, redirects to /overview)
  pricing/ company/    Marketing pages (careers, press, security, etc.)
  blog/ changelog/     Editorial surface + RSS feed
  legal/ privacy/ terms/  Legal pages
  components/          Shared UI components
  globals.css          Global styles + brand CSS variables
  layout.tsx           Root layout: fonts, metadata template, JSON-LD
  sitemap.ts robots.ts manifest.ts opengraph-image.tsx
public/
  skill.md             Agent-facing setup guide
  llms.txt             Machine-readable service index
  logo-light.svg       Brand logo (dark-bg variant)
```

## Notes

- Uses `next/font/google` for Fraunces (display), IBM Plex Sans (body), and IBM Plex Mono (data). The build downloads font files from Google Fonts at build time — ensure outbound HTTPS access is available in your build environment.
- The dashboard authenticates via email OTP (6-digit code), session cookie is `sameSite: strict`. The marketing surface is fully public.
- Next.js 16 file conventions are in force: middleware lives in `proxy.ts` at the web root (the old `middleware.ts` name is deprecated and logs a migration notice in the dev server).
