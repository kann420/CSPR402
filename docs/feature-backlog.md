# CSPR402 feature backlog

Unprioritised brain-dump of ideas that would be worth considering. Written after
the phase 1–3 site build on 2026-04-14. Tagged by surface area so we can slice
this into a real roadmap later.

## Status at loop 13

Items that have since shipped during the audit loops:

- ✅ `/blog` pipeline — 4 real posts published, drafts pipeline emptied:
  - How we built non-custodial mock card issuance on Casper (10 min)
  - Anatomy of a CSPR402 order (8 min)
  - Why SSE beats polling for agent-facing APIs (6 min)
  - Claim codes: credentials that never touch the transcript (7 min)
- ✅ `/changelog` with tagged entries + RSS + auto-discovery
- ✅ SEO foundation: sitemap, robots, manifest, og image,
  `llms.txt`, `security.txt`, `humans.txt`, `skill.md`, verification
  metadata stub
- ✅ Custom 404 + route error boundary + global-error boundary
- ✅ All docs/content surfaces cross-checked against real SDK +
  backend source (32 drift bugs caught across 13 loops)
- ✅ Structured data: Organization, WebSite, SoftwareApplication,
  Product, FAQPage, JobPosting, BlogPosting, ItemList, HowTo,
  BreadcrumbList, TechArticle
- ✅ Keyboard a11y: skip link, focus-visible, aria-label on icon
  buttons
- ✅ Three copy buttons on every code block, Python + curl siblings
  next to TypeScript
- ✅ SSE + polling fallback documented end-to-end
- ✅ Every webhook event type documented with correct shapes
- ✅ All error codes match real backend emit sites

The iteration-by-iteration detail is in the commit history; this
list is the summary for any future session picking up the project.

**Loop 16 note on OpenAPI:** the repo already ships an OpenAPI
spec at `api/agent-api.openapi.yaml` which I discovered
in loop 16. It was drifted against the backend in three places
(webhook payload enum, amount cap, intro copy) and I fixed those
in loop 16 — but the bigger backlog item is: **wire the spec
into CI as a contract test against the real backend**. The
manual drift audits in loops 1–15 caught 32 bugs that an
OpenAPI-based contract test would have caught automatically
the same day the drift was introduced. Until that test exists,
the spec is a snapshot that can itself go stale — which is
exactly what happened.

**Loop 18 status:** 3 more drift bugs caught and fixed, all in
upstream inputs rather than generated content:

- `examples/README.md` had `npx -y cards402/mcp` which is not a
  valid package spec. The CLI default subcommand is `mcp`
  (`sdk/src/cli.ts:17`) so `npx -y cards402` is correct. Added a
  paragraph explaining the default-subcommand convention.
- `web/README.md` still referenced `admin/page.tsx` and the Geist
  font. Admin was renamed to `dashboard/` months ago; the brand
  refresh replaced Geist with Fraunces + IBM Plex Sans/Mono.
  Rewrote the structure list and fonts note.
- Root `README.md` called the web app "marketing/admin" and
  pointed agents at `/agents.txt`. Updated to "marketing +
  dashboard" and promoted `/docs/quickstart` + `/skill.md` as
  the entry points.

Also deleted the stale `project_architecture_v2.md` memory —
it described an "agent pays VCC direct" design that never
shipped; the real flow in `payment-handler.js:7` is
agent→cards402 Soroban receiver→cards402 treasury pays VCC.
The `_status.md` memory that describes the correct flow is
now the single source in MEMORY.md.

Remaining low-value drift surfaces I've checked in this loop
and believe are clean:
`api/vcc-internal.openapi.yaml`, `ARCHITECTURE.md §vcc
interface + §security model`.

**Loop 19 note — agent-onboarding root-cause fix:** the dashboard
"create agent" flow stalled at "Claim redeemed" and never reached
"Awaiting deposit" because `onboard` only reported
`state='awaiting_funding'` + a `wallet_public_key` when the operator
passed `--casper-public-key` — a fresh agent had no Casper key, so
the stepper had nothing to advance on. Fixed across three layers:

- **SDK `onboard` auto-keygen (zero new deps):** `onboard --claim
<code>` now generates an Ed25519 Casper mainnet keypair via Node's
  built-in `crypto`, writes a PKCS8 PEM (0600) at
  `~/.cspr402/keys/<agent>_secret_key.pem`, and reports
  `awaiting_funding` + the derived public key. Idempotent — re-running
  on the same machine reuses the existing PEM (re-derives the pubkey)
  so funds are never stranded. `--casper-public-key` stays as an
  optional override. PEM byte-compatibility with `casper-js-sdk`
  `PrivateKey.fromPem` verified empirically (Node crypto keygen ==
  sdk keygen, same PEM, same pubkey).
- **Backend Casper funding poller:** `jobs.js::checkAgentFundingStatus`
  now branches on `PAYMENT_PROVIDER` (default `casper`) and queries
  the Casper node JSON-RPC (struct params, node api_version 2.0.0)
  via new `payments/casper-balance.js`. A freshly-onboarded key has
  no on-chain account until its first deposit — `state_get_account_info`
  returns `-32009 "No such account"`, surfaced as a quiet "still
  awaiting" (NOT an outage); `motes>0` flips `agent_state='funded'`
  with `agent_state_detail='cspr=<x>'`. RPC errors dedup to one
  `funding.casper_rpc_error` bizEvent per outage + `casper_recovered`
  on the first successful response.
- **Web stepper + snippet + skill.md:** the 'funded' step was dead
  code (relied on a never-fetched `walletBalances` map) AND regressed
  to 'wallet' when jobs.js flipped funded. Stepper is now purely
  server-state-driven; the funded detail shows the real `cspr=<x>`
  from `agent_state_detail`. Dropped the harmful
  `--casper-public-key <hex>` line from the copy-snippet (agents
  pasted `<hex>` verbatim → regex exit 2). Synced the detailed root
  `skill.md` → `web/public/skill.md` (the file served at
  cspr402.xyz/skill.md, previously a 52-line stub) via
  `scripts/sync-skill-md.mjs` wired into `web` `prebuild` so it can't
  drift again.
- **SDK `wallet balance` RPC fix (discovered):** was sending legacy
  `[{name,value}]` array params rejected by node 2.0.0 with `-32602`.
  Switched to struct params; verified live against
  `https://casper-mainnet.gateway.tatum.io/rpc` (funded validator returns real
  CSPR; fresh key returns "account not funded yet / cspr: 0").

`purchase` external-signing behavior unchanged (out of scope; no
`casper-js-sdk` dep added to the SDK). Tests: SDK 108 pass, web 57
pass, backend 1168 pass (incl. 6 new Casper poller cases + existing
Stellar cases now explicitly `PAYMENT_PROVIDER=stellar`).

## Core product

### Cards

- **Reloadable cards.** Current reward cards are non-reloadable. Add a
  reloadable tier (different Pathward product) so agents that need a persistent
  card for subscription-style spending aren't forced to re-issue weekly.
- **Physical cards with agent-addressable shipping.** Let an agent pass a
  shipping address as an order parameter and receive a real plastic card by
  mail. Useful for machine-to-meatspace workflows (airport kiosks, POS without
  NFC, etc.).
- **Card networks beyond Visa.** Add Mastercard and Discover tiers for
  merchants that don't accept Visa Reward cards reliably (some online
  subscription gateways are picky).
- **Single-use card.** A card that auto-closes after the first successful
  charge, for one-shot agent purchases where you want the strongest blast
  radius containment.
- **Pre-funded card bundles.** Operators buy a batch of cards in advance (e.g.
  10 × $25) and hand each to a different agent. Claim-code flow already exists,
  just needs a bundle UX.
- **Agent-addressable card metadata.** Attach structured tags to a card at
  issuance time (merchant category, max per-txn, expiry override) and enforce
  them on our side via a decline callback.

### Payments

- **Additional Casper assets.** Beyond native CSPR and mockUSDC CEP-18,
  support other CEP-18 test tokens or a CEP-78 NFT-gated payment rail for
  gated order flows.
- **Other chains.** EVM (Base/Arbitrum/Polygon) or Lightning as alternative
  rails for agents whose wallet story is pinned elsewhere.
- **Multi-currency cards.** Issue cards denominated in EUR or GBP directly
  instead of USD, so agents in the EU avoid the $2 + 2% conversion on every
  purchase.
- **Native stablecoin settlement.** Let merchants that hold a stablecoin
  natively receive settlement directly in stablecoin, bypassing the card
  network entirely. Much cheaper and no FX fee.

### Fulfillment

- **Multi-supplier card pool.** Current pipeline uses one supplier. Route each
  order to the best supplier by live inventory, fee, and success rate. Already
  architected for this — just needs the routing layer.
- **Pre-warmed card reserve.** For low-latency use cases, pre-fulfill a pool of
  unclaimed cards and hand them out on-demand. Sub-1s card delivery for
  agents that can't wait 30s.
- **Retry with alternative supplier on failure.** If one supplier fails, auto
  retry against another before giving up. Currently we refund on first failure.

## Developer experience

### SDK

- **Python SDK.** Node.js SDK exists; a lot of agent frameworks (CrewAI,
  LangGraph, autogen) run on Python. High-leverage.
- **Go SDK.** For infrastructure agents and backend integrators.
- **Rust SDK.** Same, plus natively aligns with Casper contract tooling.
- **`cspr402 dev` local emulator.** A local server that mimics the API so
  agent developers can test without burning real mainnet CSPR. Fake cards,
  fake Casper deploys, fast iteration.
- **Time-travel debugging in the CLI.** `cspr402 orders inspect <id>` shows a
  full timeline of the order with every internal state transition, webhook,
  on-chain event, and scrape attempt. Very useful for "why did this fail".

### MCP server

- **Server-side policy.** Operators set allow/deny rules for an agent's
  spending in the dashboard (max per day, allowed merchant categories,
  required human approval over $N). The MCP tool honours them server-side
  so a malicious prompt can't override.
- **Multi-agent budget sharing.** One parent account can grant sub-agents
  sub-budgets that roll up into the parent's total. "My research agent has
  $500/mo, but within that my shopping agent has $50/mo."
- **Tool-level receipts.** After each purchase, the MCP returns a structured
  receipt that the LLM can cite in its next turn. Better audit trail and
  better retrieval for future calls.

### Docs

- **Interactive playground.** A hosted REPL on `/docs/playground` where a
  visitor can paste an API key, hit the endpoints, and see real responses.
- **Copy-as-cURL + copy-as-fetch buttons** next to every code sample in the
  docs.
- **"Walk me through my first order" video.** Three-minute screen record from
  `npm install` to PAN. Embed on `/docs/quickstart`.
- **Recipe index.** `/docs/recipes/...` with one tiny runnable example per
  common workflow: "shopping agent", "subscription revoker", "travel booking",
  "research gift card".
- **Auto-generated SDK reference.** Right now `/docs` is the HTTP API. Add
  `/docs/sdk` with autogenerated method-level docs pulled from the SDK's TSDoc
  comments at build time.

## Operator dashboard

### Policy

- **Budget envelopes.** Assign monthly spend caps per agent or per team, with
  alerts at 50/80/100 %.
- **Merchant allowlist / denylist.** Block cards from working at specific
  merchants or whole categories (gambling, adult, crypto).
- **Approval workflow.** For purchases over $N, require a human to click
  approve in the dashboard. Existing approvals system already there, just
  needs to be surfaced at issuance instead of post-hoc.
- **Time-boxed keys.** API keys that auto-revoke at a specific datetime.

### Observability

- **Live stream of agent activity.** A WebSocket-backed feed in the dashboard
  that shows every order, webhook, and refund in real time. Excellent for
  live monitoring of a new agent.
- **Per-agent spend chart.** Drill into a specific agent's timeline and see
  every card it's issued.
- **Anomaly detection.** Flag orders that deviate from an agent's normal
  pattern (bigger amounts, unusual merchants, bursts). Email + webhook alert.
- **Cost explorer.** Break down spend by tag, agent, date range. Export to
  CSV/JSON.

### Team

- **Multi-seat accounts.** Right now it's single-user. Add team membership,
  roles (owner, admin, viewer), and per-seat API keys.
- **SSO via SAML / OAuth (Google Workspace, Okta).** Table stakes for any
  enterprise operator.
- **Audit log of dashboard activity.** Every admin action timestamped and
  filterable. Already partially built — finish and surface it.

### Financial

- **Invoice generation.** Automatically roll up a month of spend into a PDF
  invoice with your company details at the top, ready to expense.
- **Accounting export.** Direct push to QuickBooks, Xero, FreshBooks.
- **Card-level P&L attribution.** Tag each order with a cost center so
  finance can split card spend across projects.

## Trust & compliance

- **SOC 2 Type I (then II).** The biggest single thing that blocks enterprise
  adoption. 4–6 months of engagement with a firm like Vanta.
- **Penetration test** by an independent firm. Published summary on the
  Security page.
- **Status page.** `status.cspr402.xyz` is referenced in the Terms already —
  actually build it. Self-hosted Status.io clone or Instatus.
- **Public postmortems.** When something goes wrong, publish a short writeup
  on `/changelog` within 72 hours. Builds trust more than any marketing copy.
- **Proof-of-reserves / on-chain transparency.** Publish a public Casper
  account address holding the operational float, so anyone can verify
  CSPR402 is solvent in real time. Strongest possible signal for a
  non-custodial platform.
- **Bug bounty on HackerOne or Intigriti.** Current security page says we
  pay bounties — make it a real, public program.

## Growth & distribution

- **MCP marketplace / directory presence.** As the MCP ecosystem consolidates
  into directories, make sure CSPR402 is listed in every major one with
  working tool definitions.
- **Agent framework integrations.** Write first-party adapters for LangChain,
  LlamaIndex, CrewAI, autogen, and Claude Agent SDK. One file each. Open PRs
  into their repos.
- **Public fulfillment benchmarks.** Every week, run a live benchmark of
  order-to-card time and publish it as a public tweet. "Current avg: 47s".
- **Referenceable customers.** Three early adopters willing to be on the
  record. Huge for the Company / press pages.
- **Developer-focused content series.** Weekly technical post:
  "How we built non-custodial mock card issuance on Casper",
  "Anatomy of a CSPR402 order",
  "Why SSE is better than polling for agent-facing APIs",
  etc.
- **Changelog RSS.** So registered developers can follow changes in their
  feed reader without visiting the site.
- **Hacker News "Show HN" launch** with the non-custodial angle as the hook.

## Site / marketing surface

- **Interactive pricing calculator.** "Enter your expected monthly volume,
  see your total cost including foreign txn and inactivity fees."
- **Comparison page.** "CSPR402 vs Ramp vs Lithic for agent workloads."
  Honest table — where we win, where we lose.
- **Public live counter.** "12,843 cards issued · $417k moved through".
  Real-time ticker on the homepage pulled from the backend.
- **OG image per page.** Currently the opengraph-image route is generic.
  Per-page variants that show the page title in big Fraunces would punch
  harder on Twitter/LinkedIn.
- **RSS/Atom feeds for `/changelog`, `/docs/recipes/`, `/blog/`.**
- **A real blog.** Not "content marketing" — engineering-honest posts about
  what we're building. Same voice as the Company page.
- **Shareable code snippets.** Every code block on `/docs` gets a permalink
  that highlights it when loaded, so Slack / Discord linking works.
- **Internationalisation.** English-only today. Spanish, Portuguese, and
  Japanese would cover most of the agent-developer demand we see.

## Surfaces added during loop iteration 7 (backlog extensions)

### Documentation hardening

- **OpenAPI spec still top-of-mind.** Iterations 1–7 have found
  19 distinct drift bugs between /docs and the real
  sdk/backend. Pattern remains: hand-written docs always drift
  against code, even when both are edited by the same person
  in the same week. Rest of the backlog assumes this item
  eventually ships.
- **docs + sdk + backend compile-tested together in CI.** The
  hardest class of bug caught this iteration was "the docs
  document a 201 response, but the backend can also return a
  202 with a completely different shape on the approval path".
  An integration test that hits both branches with the SDK
  error classes matched against the docs table would have
  caught it instantly.
- **Tests for SDK error type dispatch.** sdk/src/errors.ts has
  a parseApiError switch that maps HTTP bodies to typed errors.
  A test that POSTs every documented error code from the docs
  table through parseApiError and asserts the result is the
  matching subclass would verify the code/class mapping stays
  in sync with docs.

### Backend observability for agents

- **`GET /v1/policy/check` is real but undocumented.** Agents
  with approval-gated policies could use it to preflight an
  amount before burning a rate-limit slot on POST /v1/orders
  that returns 202. Would pair well with a new SDK method
  \`client.checkPolicy(amountUsdc)\`.
- **Surface \`refund_pending\` as a public phase** or document
  that the public "failed" phase can linger for minutes-to-
  hours before transitioning to "refunded" when the refund
  settles. Today the docs imply it's instant.

### Content

- **Agent framework quickstarts.** Beyond the raw SDK,
  targeted quickstarts for LangChain, CrewAI, autogen, Claude
  Agent SDK, and the Claude Desktop MCP host would eat the
  first-week integration curve for each framework.
- **Receipt format spec.** When an agent completes a card
  purchase, a stable "receipt" structure it can cite in its
  own output (back to the human operator, or to another agent)
  would be genuinely useful. ItemList JSON-LD + our own
  thin wrapper.

## Surfaces added during loop iteration 5 (backlog extensions)

### More auto-sync candidates

The SDK/docs drift audit continues to find real bugs every
iteration. Five more this loop alone (wrong param name, 1000
ceiling missed, three missing error codes, wrong CLI default
asset, two undocumented endpoints). Reinforces the need for:

- **API source of truth as OpenAPI.** Generate both the
  docs page's error/endpoint tables AND the SDK's type
  definitions from a single OpenAPI file in the backend repo.
  The web app can read the spec at build time and render it
  into JSX. Nothing is typed twice.
- **`spec/openapi.yaml` in the backend repo** — start hand-
  written since it's smaller than the code, use it as
  authority going forward.

### Dashboard / operator ergonomics

Unchecked items from prior iterations that are still worth
doing:

- **Budget bar** on dashboard pages that shows current
  \`budget.remaining_usdc\` relative to \`budget.limit_usdc\`.
  Uses the /v1/usage endpoint I just documented.
- **Policy preview tool** that calls /v1/policy/check?amount=X
  as the user types so they can see in real time whether an
  order of $X would be allowed under the current spend policy.
- **Order list page filter by \`status\`** — the list endpoint
  already supports the query param, the dashboard's order table
  just doesn't surface it yet.

### Agent UX

- **Delta polling** via \`since_updated_at\` (already supported
  by the backend). Reference implementation snippet in the docs
  showing an agent that rehydrates from the last seen
  \`updated_at\` — better than polling a specific order id when
  the agent is managing many orders.
- **POST /v1/policy/check documentation** — it's a GET not a
  POST, and I chose not to add it to /docs this iteration, but
  it's useful for agents that want to pre-flight large
  purchases without burning a rate-limit slot on a failed POST.

## Surfaces added during loop iteration 4 (backlog extensions)

### SDK / docs sync

- **Auto-generated SDK reference docs.** Loops 1–4 have caught four
  separate drift bugs where the hand-written docs referenced
  made-up or renamed SDK symbols (`npx cards402 revoke`,
  `cards402-mcp`, `asset:` vs `paymentAsset`, `createWallet` vs
  `createOWSWallet`). Wire a TypeDoc (or api-extractor) pass that
  generates `/docs/sdk` from the SDK's TSDoc at build time. Once
  `/docs/sdk` is the canonical reference, the hand-written pages
  shrink to narrative guides that link into it — and drift stops
  happening altogether.
- **Integration test that scrapes the web app's code samples** and
  `tsc`-compiles them against the real SDK types. Any hand-written
  snippet that references an imported identifier the SDK doesn't
  export would fail CI. Drop-in catch for every class of bug this
  loop found.

### Structured data audits

- **Rich Results Test** run against the production deploy after
  shipping the recent JSON-LD additions (Organization, WebSite,
  SoftwareApplication, Product, FAQPage, JobPosting, BlogPosting,
  ItemList, HowTo, BreadcrumbList). Google's validator is the
  ground truth for "does the SERP actually render this".
- **`schema-dts` typing on the JSON-LD objects.** Drop-in that
  typechecks every structured-data object against the canonical
  schema.org vocabulary. Catches "I spelled articleBody wrong"
  at compile time rather than in a rich-results test.

### Error surface

- **`loading.tsx` for the marketing surface** — non-critical since
  most routes are prerendered static, but the dashboard transitions
  would benefit from a branded loading shimmer.
- **Sentry / self-hosted reporter wired to app/error.tsx and
  global-error.tsx.** Both surfaces currently `console.error` and
  rely on the user emailing support with the digest. First real
  telemetry hook into error events.

## Surfaces added during loop iteration 3 (backlog extensions)

### Blog

- **Pagination** on /blog once there are > 10 posts. Sort/filter by
  tag and paginate at 10 per page.
- **Related posts** section at the bottom of each post, ranked by
  shared tags. Trivial once we have > 3 posts.
- **Post lead images**. The anatomy post is pure text; visual lead
  images (screenshots, architecture sketches) would make the post
  cards on /blog much stronger.
- **Table of contents** inside long blog posts using the same
  sticky-toc pattern as the legal pages. Only needed > ~1200
  words, the anatomy post borderline.
- **Author / team page.** The anatomy post is bylined "CSPR402
  engineering". When real contributors land, wire them to
  `/team/<handle>` with individual author pages.

### Announcement banner

- **Wire it to remote state.** The banner is currently unmounted —
  mount it in MarketingChrome with an optional prop controlled by
  a backend flag so launches can go up without a deploy.
- **Slot for scheduled announcements** via cron so marketing can
  schedule a launch banner to appear at a specific time.

### Structured data saturation

- **TechArticle JSON-LD on /docs** (as well as the existing HowTo
  on /docs/quickstart). Google uses TechArticle as a soft hint for
  dev-tool documentation pages.
- **Service JSON-LD on /status** — Schema.org `Service` with a
  `provider` pointing at the Organization.
- **AboutPage / ContactPage / PrivacyPage wrappers** on the
  matching pages. Tiny SEO uplift, zero visual change.
- **Review / AggregateRating** once we have real testimonials to
  cite. Don't fake this.

### Pipeline + data

- **Git-driven changelog.** Source CHANGELOG_ENTRIES from the
  actual git history (filter by conventional-commit type) instead
  of maintaining it by hand. Keeps page + feed always in sync.
- **Search over /blog + /docs.** Pagefind builds a static JSON
  index at build time, then a client-side fuzzy search. No server
  dependency, works offline, ~20kb gzipped.

## Surfaces added during loop iteration 2 (backlog extensions)

### Docs

- **ToC on /docs** like the one on the legal pages. 10 code blocks
  deserves section navigation.
- **Interactive API explorer.** Hit `POST /v1/orders` from the page
  itself with a real key. Similar to Stripe's docs.
- **Dark ↔ light toggle on marketing surface.** The dashboard has one;
  marketing pages currently force dark. Honour `prefers-color-scheme`
  and let visitors flip it.
- **Search.** Pagefind (static index) or Algolia DocSearch for the
  docs and blog once content exists.
- **Command palette on marketing pages.** The dashboard already has
  a `⌘K` palette; extend it to marketing with shortcuts to the key
  routes.

### Content

- **Comparison pages.** `/compare/ramp`, `/compare/lithic`,
  `/compare/privacy-com`. Honest tables of where we win / lose
  per use case.
- **Integration gallery.** `/built-with` showcasing agents built on
  CSPR402 with real screenshots and code snippets.
- **A real blog post.** Ship one under /blog to validate the pipeline
  end-to-end before accumulating drafts.

### Social / distribution

- **Announcement banner.** Component with dismissible state (saved
  to localStorage) for launches and incidents. Uses a top-of-nav slot.
- **"Powered by CSPR402" badge** that third-party integrators can
  drop into their own UIs, with a UTM-tagged backlink.
- **Changelog email digest.** Weekly summary to a mailing list of
  subscribed operators — opt-in via the dashboard.

### Engineering ergonomics

- **Preview deploys per PR.** Vercel-style preview URLs that Turbopack
  builds on every push. Currently we go straight to prod.
- **Visual regression tests.** Playwright snapshot tests for every
  top-level marketing route across three viewports. Guards the
  editorial design against random content edits.
- **Bundle analyzer.** Next.js has `@next/bundle-analyzer` — wire it
  into a CI check and alert if the client bundle crosses 200kb gzip.
- **Error reporter.** The new `app/error.tsx` logs to the console.
  Pipe into a real telemetry backend (self-hosted GlitchTip?) so
  route-level errors reach an oncall inbox.

### Site trust

- **Public live metrics on the homepage.** "X cards issued, Y USDC
  moved" pulled from the backend in real time. Strong credibility
  signal.
- **Proof-of-reserves dashboard.** Surface the on-chain treasury
  balance publicly so anyone can verify CSPR402 is solvent. Pairs
  with the non-custodial architecture story.
- **Per-page OG images** using `opengraph-image.tsx` at each segment,
  with the page title rendered in a base64-embedded Fraunces so the
  social card doesn't fall back to Georgia.

## Speculative / far-future

- **Programmable card lifecycle via Casper contract.** Let an operator
  deploy their own contract that gates card issuance on arbitrary on-chain
  state. ("Mint a card only if this NFT is held by the sender.")
- **Cards for agent-to-agent payments.** A card issued to agent A that only
  works at merchants owned by agent B. Acts as a bearer credit note, settled
  on card rails.
- **Card-backed credit line.** Agents with a proven history get a small
  pre-funded credit line that they can draw down without needing to settle
  the Casper payment first. High-trust, limited blast radius.
- **Zero-knowledge privacy for agent identity.** Issue a card where the
  agent's identity is provable to CSPR402 but not disclosed to the
  merchant, beyond the Pathward BIN. Privacy-preserving agent commerce.
- **Merchant-side acceptance SDK.** The mirror of our current SDK — a drop-in
  that merchants embed to gate content/services behind an agent card
  payment. HTTP 402 going the other way.

## Loop 19 additions

### Nav + chrome

- **Command palette on marketing pages too.** The dashboard already has
  a Cmd+K palette via `_shell/CommandPalette.tsx`. Port a lightweight
  version to the marketing chrome so visitors can jump between Pricing /
  Docs / Compare without hunting the More menu. Seed it with every
  route in the sitemap + every section anchor from /docs.
- **Active-section highlight in the docs sidebar.** The docs page has
  a sticky section list; hook it up to an IntersectionObserver so the
  current heading is highlighted as the user scrolls. Same pattern
  the legal ToC uses.
- **Skip-to-content anchor on the dashboard.** We added a skip link
  on the marketing chrome in loop 6; the dashboard layout doesn't
  have one yet. Keyboard users tabbing through the sidebar have to
  hit every nav item before reaching page content.

### Docs polish

- **Inline type definitions.** Clicking a type name in a code block
  (`OrderOptions`, `CardDetails`) should pop a tooltip with the real
  type from the SDK's `.d.ts`, not a separate reference page. Same
  idea as shiki's TwoSlash — we'd render it at build time from the
  published .d.ts so it stays current by construction.
- **"Try it" panel next to each endpoint.** Clicking the `POST /v1/orders`
  section should open a mini playground with the sample body and a
  Send button that hits the real API with a dev key. Keep the key
  scoped to the sandbox ledger so there's no risk.
- **Per-endpoint SSE viewer.** A live log tail embedded in the docs
  that shows an anonymised sample of real orders completing in real
  time. Demonstrates the <60s claim without asking visitors to sign
  up first.

### Content

- **Case study format.** One-page interview with an operator who
  shipped a real agent on CSPR402 — problem, solution, metrics. Lives
  under `/case-studies/<slug>` and gets an Article JSON-LD with the
  operator's logo as the `publisher.logo`.
- **Calculator: "how much does this card cost me?"** Interactive
  widget on /pricing that lets you set card amount, expected FX,
  and months until spend, then tells you the true out-the-door
  cost including Pathward's $2 + 2% FX and $2.50/month inactivity.
  Saves every operator the same mental arithmetic.
- **Glossary of agent payment terms.** `/docs/glossary` — SSE,
  PAN, CVV, CEP-18, Casper deploy hash, non-custodial, PSP,
  BIN, claim code, webhook signature. Hashed anchor per term so docs
  can link inline.

### Dev-loop correctness

- **Type tests for the SDK public surface.** `.tst.ts` files that
  pin the shape of `purchaseCardOWS`, `createOrder`, `waitForCard`
  against frozen expected types. Catches breaking-change accidents
  in releases without having to run real calls.
- **Playwright visual snapshots at 375 / 768 / 1280.** One test
  per marketing route, takes a full-page screenshot, diffs against
  main. Would have caught the loop-1 fix(web) iteration on the
  hero card before it shipped.
- **OpenAPI contract test.** Already in the backlog above but worth
  repeating: run the spec against a dev backend in CI. Even a
  single `for path in spec.paths: requests.request(method, dev_url+path)`
  loop would catch most of the drift we've been manually chasing.

## Loop 14 — per-order virtual card + mainnet support

Shipped 2026-06-27 for the hackathon demo (mainnet pivot, tight deadline):

- ✅ **Unique virtual card per order** (`backend/src/lib/virtual-card.js`). Replaced the single shared hardcoded `4242…` mock card with a fresh Luhn-valid 16-digit Visa-pattern PAN + 3-digit CVV + ~3-year-future expiry, generated per fulfilled order and sealed via the existing card-vault. Each agent now receives a distinct card; re-verify returns the persisted card (idempotent). Branded `CSPR402 Virtual Card` (added a `normalize-card` passthrough rule). Still a SIMULATED demo artifact — not bank-issued / not spendable; the real demo value is the on-chain CSPR payment + deploy verification.
- ✅ **Mainnet env support.** `env.js` zod enums widened: `CASPER_NETWORK` accepts `mainnet|testnet`, `CASPER_CHAIN_NAME` accepts `casper|casper-test`, with a boot-time network↔chain consistency check. The RPC contract is identical across networks, so flipping to mainnet is config-only (`CASPER_NETWORK=mainnet`, `CASPER_CHAIN_NAME=casper`, `CASPER_NODE_RPC_URL=<mainnet node>`); `MOCK_USDC_ENABLED` stays `false` on mainnet (CEP-18 mockUSDC is testnet-only). `.env.casper.example` documents the mainnet block.
- ✅ SDK CLI/MCP card label `Mock card:` → `Virtual card:` (bumped to 0.4.9; user republishes).
- ✅ **`CASPER_NODE_RPC_AUTH` support** so the backend (verify + funding poller) and the SDK `wallet balance` can talk to an authenticated RPC provider (CSPR.cloud `node.cspr.cloud`, raw access token, no `Bearer `). Unblocks mainnet without the free-tier 5 req/min limit (Tatum gateway). Sent on every Casper RPC call; unset for free no-auth endpoints.
- ✅ **"mock card" → "virtual card" rebrand** across all user-facing display prose (README, AGENTS, ARCHITECTURE, skill.md, SDK README/skills/CLI/MCP, web docs/legal/privacy/pricing/press/portal/hero/dashboard, node-agent example, video). Wire-format enum values kept stable to avoid breaking the API contract/tests: `card_mode: 'mock'`, the `mock_card_mode` boolean, the `MOCK_CARD_MODE` env var, the `order.fulfilled_mock_casper` bizEvent, and the normalize-card `mock` rule (legacy brand handling). The simulated/not-spendable disclosure substance is preserved in the legal + privacy pages.

Follow-ups (not deadline-feasible): real spendable virtual cards (Pathward/ctx.com, Lithic, Stripe Issuing) need issuer partnership + KYC. Wire-format `card_mode: 'mock'` could be renamed to `'virtual'` in a contract-breaking revision if desired (currently kept for API stability).
