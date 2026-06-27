import type { Metadata } from 'next';
import { LegalBody, PageHero } from '@/app/components/MarketingPage';

export const metadata: Metadata = {
  title: 'Virtual card disclosure',
  description:
    'What the simulated card payload means in the CSPR402 MVP, and what it does not mean.',
  alternates: { canonical: 'https://cspr402.xyz/legal/cardholder-agreement' },
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Virtual card disclosure',
      item: 'https://cspr402.xyz/legal/cardholder-agreement',
    },
  ],
};

export default function CardholderAgreementPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <PageHero
        eyebrow="Legal · Virtual card disclosure"
        title="Virtual card"
        accent="disclosure"
        intro={
          <>
            CSPR402 does <strong style={{ color: 'var(--fg)' }}>not</strong> currently issue a real
            Visa card or any other live payment instrument. This page explains what the simulated
            card payload in the hackathon MVP means, and what it does not mean.
          </>
        }
      />

      <LegalBody
        intro={
          <>
            Last updated 25 June 2026. This route remains available because older copy and links in
            the repo referenced a cardholder agreement. In the current MVP, it should be read as a
            disclosure page, not as an issuer contract.
          </>
        }
        sections={[
          {
            heading: '1. What the returned card means',
            body: (
              <>
                <p>
                  The API returns a simulated virtual card object after a Casper payment has been
                  verified for the order. That object exists to demonstrate downstream agent
                  behavior and receipt handling. It is not a live card, not a balance account, and
                  not a production payment credential.
                </p>
              </>
            ),
          },
          {
            heading: '2. What is not promised',
            body: (
              <>
                <ul>
                  <li>No production Visa issuance</li>
                  <li>No stored-value account</li>
                  <li>No ATM, cash, or merchant acceptance</li>
                  <li>No issuer-backed refund or dispute process</li>
                  <li>No claim that virtual card details can be spent anywhere</li>
                </ul>
              </>
            ),
          },
          {
            heading: '3. What the MVP does verify',
            body: (
              <>
                <p>
                  Before the virtual card payload is returned, the backend verifies the Casper
                  payment deploy against the order. That includes deploy success, deploy hash,
                  recipient, amount, transfer_id, expiration window, and idempotent order state.
                </p>
              </>
            ),
          },
          {
            heading: '4. Handling the simulated card data',
            body: (
              <>
                <p>
                  Even though the payload is simulated data, treat it like sensitive demo output. Do
                  not paste it into random logs, screenshots, or public issues. The product language
                  is explicit because ambiguous demos become security and trust problems later.
                </p>
              </>
            ),
          },
          {
            heading: '5. Disclaimer',
            body: (
              <>
                <p>
                  This page is a product-scope disclosure for the current MVP. It is not legal
                  advice, not issuer terms, and not evidence of production card issuance.
                </p>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
