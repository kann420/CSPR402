import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyCodeBlock } from '@/app/components/CopyCodeBlock';

export const metadata: Metadata = {
  title: 'Quickstart',
  description:
    'Five minutes from cold clone to a verified Casper testnet deploy: set env, faucet two keys, boot backend and web, create an order, send CSPR, and verify the deploy for a mock card.',
};

const envSample = `PAYMENT_PROVIDER=casper
CASPER_NETWORK=testnet
CASPER_CHAIN_NAME=casper-test
CASPER_NODE_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_EVENT_STREAM_URL=https://node.testnet.casper.network/events
CASPER_TREASURY_PUBLIC_KEY=<your treasury public key>
CASPER_TREASURY_PRIVATE_KEY_PATH=<ignored local key path if needed later>
CSPR402_API_KEY=<optional for curl/agent debug; portal provisions one after wallet login>
ADMIN_SESSION_KEY=<openssl rand -hex 32>
MOCK_CARD_MODE=true
VIRTUAL_CARD_PROVIDER=mock`;

const bootCommands = `cd backend
npm start

# new terminal
cd web
npm run dev`;

const agentSend = `cd sdk
npx tsx src/agent-demo.ts`;

const verifyCurl = `curl -X POST http://127.0.0.1:4000/v1/orders/<order_id>/verify-payment ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Key: %CSPR402_API_KEY%" ^
  -d "{\\"deploy_hash\\":\\"<casper deploy hash>\\",\\"sender_public_key\\":\\"<payer public key>\\"}"`;

const steps = [
  {
    n: 'Step 01',
    title: 'Set local env',
    body: (
      <>
        <p>
          Put real values in <code>backend/.env.local</code> — not in source. RPC URLs, the treasury
          public key, and the admin session key all live here. Nothing should be hardcoded into the
          repo.
        </p>
        <CopyCodeBlock label=".env.local">{envSample}</CopyCodeBlock>
      </>
    ),
  },
  {
    n: 'Step 02',
    title: 'Prepare treasury and agent wallets',
    body: (
      <>
        <p>
          Treasury is the configured recipient public key the backend verifies against. Agent is a
          separate local keypair that sends the Casper testnet transfer. Faucet both on{' '}
          <code>casper-test</code> before you run the smoke flow.
        </p>
        <p>
          Reuse any local keypair files you already generated with this repo. No trustline setup is
          needed for the CSPR402 demo — settlement is native CSPR on Casper testnet.
        </p>
      </>
    ),
  },
  {
    n: 'Step 03',
    title: 'Boot backend and web',
    body: (
      <>
        <p>
          Start the backend with the local env, then boot the Next.js app in a second terminal. The
          root script can also open both windows for you.
        </p>
        <CopyCodeBlock label="Boot">{bootCommands}</CopyCodeBlock>
      </>
    ),
  },
  {
    n: 'Step 04',
    title: 'Create order and send CSPR',
    body: (
      <>
        <p>
          Use the agent demo script or the <Link href="/portal">portal demo</Link> to create an
          order. The payment instruction gives you the exact treasury recipient, amount, and{' '}
          <code>transfer_id</code> to send — pay it exactly. The portal path logs in with Casper
          Wallet and never asks you to paste an API key.
        </p>
        <CopyCodeBlock label="Agent demo">{agentSend}</CopyCodeBlock>
      </>
    ),
  },
  {
    n: 'Step 05',
    title: 'Verify deploy and inspect receipt',
    body: (
      <>
        <p>
          Once the transfer lands, submit the deploy hash back to the backend. A successful verify
          returns a Casper receipt and a mock card payload. Do it in the portal, or by HTTP with the
          curl below.
        </p>
        <CopyCodeBlock label="Manual verify">{verifyCurl}</CopyCodeBlock>
      </>
    ),
  },
];

export default function QuickstartPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '4.5rem 1.75rem 6rem' }}>
      <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '1rem' }}>
        Docs - Quickstart
      </div>
      <h1
        className="type-display"
        style={{ fontSize: 'clamp(2.3rem, 4vw + 0.5rem, 3.4rem)', margin: '0 0 1.2rem' }}
      >
        From local env to verified Casper deploy.
      </h1>
      <p
        className="type-body"
        style={{ maxWidth: 680, fontSize: '1rem', color: 'var(--fg-muted)' }}
      >
        Five minutes from a cold clone to a verified Casper testnet deploy. You will set local env,
        faucet two testnet keys, boot the backend and web, create an order, send exact CSPR, then
        verify the deploy for a mock card. For the interactive path, open{' '}
        <Link href="/portal" style={{ color: 'var(--fg)' }}>
          /portal
        </Link>{' '}
        after both apps are running.
      </p>

      {steps.map((step, index) => (
        <section
          key={step.n}
          id={`step-${step.n.split(' ')[1]}`}
          style={{
            scrollMarginTop: 96,
            paddingTop: index === 0 ? '2rem' : '2.8rem',
            marginTop: index === 0 ? '1rem' : 0,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', marginBottom: '1rem' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--green)',
                letterSpacing: '0.1em',
              }}
            >
              {step.n}
            </span>
            <h2
              className="type-display-tight"
              style={{ fontSize: 'clamp(1.5rem, 2.2vw + 0.4rem, 2rem)', margin: 0 }}
            >
              {step.title}
            </h2>
          </div>
          <div className="quickstart-body" style={{ color: 'var(--fg-muted)', lineHeight: 1.7 }}>
            {step.body}
          </div>
        </section>
      ))}

      <section
        style={{
          marginTop: '4rem',
          padding: '2.2rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
        }}
      >
        <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '0.85rem' }}>
          Check after boot
        </div>
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          {[
            'Backend starts without missing-env errors.',
            'Portal can log in with Casper Wallet and create an order without API key paste.',
            'Agent sends a real Casper testnet deploy.',
            'verify-payment returns ok: true and a receipt.',
            'Order becomes delivered exactly once.',
          ].map((item) => (
            <div key={item} style={{ fontSize: '0.92rem', color: 'var(--fg-muted)' }}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .quickstart-body p { margin: 0 0 1rem; }
        .quickstart-body p:last-child { margin-bottom: 0; }
        .quickstart-body a {
          color: var(--fg);
          text-decoration: none;
          border-bottom: 1px solid var(--green-border);
        }
      `}</style>
    </div>
  );
}
