import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, PageSection } from '@/app/components/MarketingPage';
import { ogForPage, twitterForPage } from '@/app/lib/seo';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Engineering-honest writing from the CSPR402 team. Architecture, incidents, and what we learned adapting legacy payment rails into a Casper-first MVP for AI agents.',
  alternates: { canonical: 'https://cspr402.xyz/blog' },
  openGraph: ogForPage({
    title: 'Blog - CSPR402',
    description:
      'Engineering-honest writing from the CSPR402 team. Architecture, incidents, and what we learned adapting legacy payment rails into a Casper-first MVP for AI agents.',
    path: '/blog',
  }),
  twitter: twitterForPage({
    title: 'Blog - CSPR402',
    description: 'Engineering-honest writing from the CSPR402 team.',
  }),
};

type Post = {
  date: string;
  title: string;
  excerpt: string;
  tags: string[];
  slug?: string;
};

const PUBLISHED: Post[] = [
  {
    date: '2026-04-16',
    slug: 'what-we-found-auditing-our-own-code',
    title: 'What we found auditing our own code',
    excerpt:
      '~95 commits in two days: treasury-loss races, silent auth bypasses, circuit breaker defeats, and 550 new tests. A walkthrough of the worst bugs, the three recurring patterns behind them, and what the audit did not cover.',
    tags: ['security', 'engineering'],
  },
  {
    date: '2026-04-14',
    slug: 'claim-codes-credentials-that-never-touch-the-transcript',
    title: 'Claim codes: credentials that never touch the transcript',
    excerpt:
      "Raw API keys aren't insecure - they're insecure when the operator is going to paste them into an LLM chat. Why CSPR402 onboards agents with single-use claim codes, the threat model, and the exchange flow that avoids every credential-in-prompt failure we could think of.",
    tags: ['security', 'onboarding'],
  },
  {
    date: '2026-04-14',
    slug: 'non-custodial-card-issuance-on-casper',
    title: 'How we built non-custodial card issuance on Casper',
    excerpt:
      'Architecture note: why CSPR402 agents pay a receiver contract directly on Casper, and how the backend watches on-chain events instead of touching customer funds.',
    tags: ['architecture'],
  },
  {
    date: '2026-04-14',
    slug: 'anatomy-of-a-cspr402-order',
    title: 'Anatomy of a CSPR402 order',
    excerpt:
      "Walk-through of the CSPR402 order pipeline. Every millisecond from the agent's first API call to a usable PAN, with the median timings we see in production.",
    tags: ['engineering'],
  },
  {
    date: '2026-04-14',
    slug: 'sse-beats-polling-for-agent-apis',
    title: 'Why SSE beats polling for agent-facing APIs',
    excerpt:
      'Server-Sent Events are still a useful primitive for long-lived order tracking with autonomous agents. This post remains relevant to the current CSPR402 production story.',
    tags: ['api', 'engineering'],
  },
];

const PIPELINE: Post[] = [];

export default function BlogIndexPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Honest writing directly from our engineering"
        accent="team"
        intro="We don't do content marketing. The posts below document CSPR402's Casper-native architecture, the failure modes we found, and what we learned building payment infrastructure for AI agents. Every post cross-posts to the changelog RSS."
      />

      <PageSection eyebrow="Published" title="Posts.">
        <div
          style={{
            display: 'grid',
            gap: '0',
            borderTop: '1px solid var(--border)',
          }}
        >
          {PUBLISHED.map((p) => (
            <article
              key={p.title}
              style={{
                padding: '2rem 0',
                borderBottom: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: 'minmax(110px, 130px) minmax(0, 1fr)',
                gap: '2rem',
                alignItems: 'baseline',
              }}
              className="blog-pipeline-row"
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                {new Date(p.date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.35rem',
                    fontWeight: 500,
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    margin: '0 0 0.65rem',
                    color: 'var(--fg)',
                  }}
                >
                  {p.slug ? (
                    <Link href={`/blog/${p.slug}`} className="link-subtle">
                      {p.title}
                    </Link>
                  ) : (
                    p.title
                  )}
                </h2>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.9rem',
                    color: 'var(--fg-muted)',
                    lineHeight: 1.7,
                    margin: '0 0 0.9rem',
                    maxWidth: 700,
                  }}
                >
                  {p.excerpt}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {p.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        color: 'var(--fg-dim)',
                        border: '1px solid var(--border)',
                        borderRadius: 999,
                        padding: '0.22rem 0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </PageSection>

      {PIPELINE.length > 0 ? (
        <PageSection background="surface" eyebrow="Pipeline" title="Drafts.">
          <div />
        </PageSection>
      ) : null}
    </>
  );
}
