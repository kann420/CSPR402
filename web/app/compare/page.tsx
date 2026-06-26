import type { Metadata } from 'next';
import { PageHero, PageSection } from '@/app/components/MarketingPage';

export const metadata: Metadata = {
  title: 'Compare',
  description:
    'What CSPR402 currently is, what the upstream Stellar fork was, and what still remains to be built.',
};

const rows = [
  ['Payment rail', 'Casper testnet native CSPR', 'Stellar / Soroban copy and flows'],
  [
    'Verification',
    'Backend checks deploy recipient, amount, transfer_id, success',
    'Watcher-driven Stellar assumptions',
  ],
  ['Fulfillment', 'Mock card only', 'Real issuer language in copy'],
  [
    'Secrets handling',
    '.env.local and local key paths',
    'Legacy docs suggested upstream hosted flows',
  ],
  ['Demo surface', 'Local portal for create -> verify', 'Dashboard-first product marketing'],
];

export default function ComparePage() {
  return (
    <>
      <PageHero
        eyebrow="Compare"
        title="What this fork is"
        accent="today"
        intro="This page compares the current CSPR402 MVP against the assumptions inherited from the original fork. The goal is to make the gap explicit, not hand-wave it."
      />

      <PageSection>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>CSPR402 now</th>
                <th>Legacy fork assumption</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]}>
                  <td style={{ fontWeight: 600 }}>{row[0]}</td>
                  <td style={{ color: 'var(--fg-muted)' }}>{row[1]}</td>
                  <td style={{ color: 'var(--fg-muted)' }}>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      <PageSection background="surface" eyebrow="Bottom line" title="The tradeoff is intentional.">
        <div
          style={{ maxWidth: 760, color: 'var(--fg-muted)', lineHeight: 1.7, fontSize: '0.95rem' }}
        >
          We traded upstream breadth for a narrower but verifiable Casper flow. That means less
          polished production language, but much better truthfulness for the current demo.
        </div>
      </PageSection>
    </>
  );
}
