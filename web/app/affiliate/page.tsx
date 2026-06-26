import type { Metadata } from 'next';
import { PageHero, PageSection } from '@/app/components/MarketingPage';

export const metadata: Metadata = {
  title: 'Affiliate',
  description: 'Affiliate is not active for this CSPR402 hackathon MVP.',
};

export default function AffiliatePage() {
  return (
    <>
      <PageHero
        eyebrow="Affiliate"
        title="Not part of this"
        accent="MVP"
        intro="The affiliate page from upstream implied a future business program that does not exist in this fork. We are keeping the route, but resetting the expectation."
      />

      <PageSection>
        <div
          style={{ maxWidth: 760, color: 'var(--fg-muted)', lineHeight: 1.7, fontSize: '0.95rem' }}
        >
          CSPR402 is focused on local Casper testnet payment verification. There is currently no
          referral program, payout system, or white-label affiliate flow attached to this repo.
        </div>
      </PageSection>
    </>
  );
}
