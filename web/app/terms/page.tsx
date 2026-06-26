import type { Metadata } from 'next';
import { PageHero, LegalBody } from '@/app/components/MarketingPage';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'Hackathon terms and product-scope notes for CSPR402. Casper testnet only, mock fulfillment only.',
};

export default function TermsPage() {
  return (
    <>
      <PageHero
        eyebrow="Legal - Hackathon terms"
        title="Use this fork with"
        accent="precision"
        intro="These terms are intentionally narrow. This project is a local hackathon MVP for Casper testnet payments and simulated virtual card fulfillment."
      />

      <LegalBody
        intro={
          <>
            <strong>Last updated 24 June 2026.</strong> CSPR402 is not a production card program. If
            the implementation and the copy ever disagree, the implementation wins.
          </>
        }
        sections={[
          {
            heading: '1. Product scope',
            body: (
              <>
                <p>
                  This fork demonstrates a payment flow: create an order, send Casper testnet CSPR,
                  verify the deploy, and return a simulated virtual card plus receipt.
                </p>
                <p>
                  It does <strong>not</strong> represent real Visa issuance, mainnet settlement,
                  production USDC support, or spendable card balances.
                </p>
              </>
            ),
          },
          {
            heading: '2. Testnet only',
            body: (
              <>
                <p>
                  Use Casper testnet only. Do not treat returned addresses, deploy hashes, or mock
                  card data as production-ready financial infrastructure.
                </p>
              </>
            ),
          },
          {
            heading: '3. Secrets and keys',
            body: (
              <>
                <p>
                  Keep API keys, RPC endpoints with credentials, and private key files in ignored
                  local env or local key paths only. Do not commit secrets to source control.
                </p>
              </>
            ),
          },
          {
            heading: '4. Verification behavior',
            body: (
              <>
                <p>
                  Backend verification is intentionally strict. A payment can be rejected if the
                  recipient, amount, transfer id, deploy hash, execution result, or order state does
                  not match the expected order instruction.
                </p>
              </>
            ),
          },
          {
            heading: '5. No warranty of production readiness',
            body: (
              <>
                <p>
                  This repository is provided as a hackathon prototype. There is no promise of
                  completeness, security review, uptime, or production fitness.
                </p>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
