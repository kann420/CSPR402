// Developer page - demo-safe integration notes. Webhook delivery will return
// after the Casper payment demo is stable, so this page avoids calling webhook
// endpoints during the hackathon walkthrough.

'use client';

import { Card } from '../_ui/Card';
import { Pill } from '../_ui/Pill';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import { useToast } from '../_ui/Toast';

export default function DeveloperPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Developer"
        subtitle="CSPR402 agent integration snippets. Webhook delivery is staged for the next pass."
      />

      <Card title="Webhooks" actions={<Pill tone="neutral">Coming soon</Pill>}>
        <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          The dashboard shell keeps this area visible for the full operator workflow, but webhook
          delivery logs and test sends are intentionally disabled for the Casper MVP demo. The
          backend payment path is still live through order creation, Casper testnet verification,
          and mock virtual card fulfillment.
        </div>
      </Card>

      <Card title="Integration snippets">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--fg-muted)',
              lineHeight: 1.55,
            }}
          >
            The <code>cspr402</code> npm package ships a CLI for onboarding and a TypeScript SDK for
            Casper testnet payment verification. Keep API keys in environment variables or the local
            CLI config, never in source code.
          </div>
          <Snippet title="Install" code={`npm install cspr402@latest`} />
          <Snippet
            title="Onboard an agent"
            code={`npx -y cspr402@latest onboard --claim <claim-code>
# Optional, on the first run if available:
#   --casper-public-key <hex>`}
          />
          <Snippet
            title="Create a CSPR order"
            code={`import { CSPR402Client } from 'cspr402';

const client = new CSPR402Client({
  apiKey: process.env.CSPR402_API_KEY!,
});

const order = await client.createOrder({
  amount_usdc: '10.00',
  payment_asset: 'cspr_casper',
  payer_public_key: '<casper public key>',
});

console.log(order.payment.transfer_id);
console.log(order.payment.recipient_public_key);`}
          />
          <Snippet
            title="Verify a Casper deploy"
            code={`await client.verifyCasperPayment(order.order_id, '<deploy hash>', {
  senderPublicKey: '<casper public key>',
});`}
          />
        </div>
      </Card>
    </PageContainer>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  const toast = useToast();
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.35rem',
        }}
      >
        <div
          style={{
            fontSize: '0.66rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--fg-dim)',
          }}
        >
          {title}
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            toast.push('Copied', 'success');
          }}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--fg-dim)',
            fontSize: '0.66rem',
            padding: '0.15rem 0.5rem',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Copy
        </button>
      </div>
      <pre
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          margin: 0,
          fontSize: '0.72rem',
          fontFamily: 'var(--font-mono)',
          overflow: 'auto',
          lineHeight: 1.5,
          color: 'var(--fg)',
        }}
      >
        {code}
      </pre>
    </div>
  );
}
