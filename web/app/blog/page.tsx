import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, PageSection } from '@/app/components/MarketingPage';
import { ogForPage, twitterForPage } from '@/app/lib/seo';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Engineering-honest writing from the CSPR402 team. Architecture, incidents, and what we learned adapting legacy payment rails into a Casper-first MVP for AI agents.',
  alternates: { canonical: 'https://cards402.com/blog' },
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
      "Raw API keys aren't insecure - they're insecure when the operator is going to paste them into an LLM chat. Why Cards402 onboards agents with single-use claim codes, the threat model, and the exchange flow that avoids every credential-in-prompt failure we could think of.",
    tags: ['security', 'onboarding'],
  },
  {
    date: '2026-04-14',
    slug: 'non-custodial-card-issuance-on-soroban',
    title: 'How we built non-custodial card issuance on Soroban',
    excerpt:
      'Legacy upstream architecture note: why the original Cards402 agents paid a receiver contract on Stellar, and what that design taught us before the Casper-first fork.',
    tags: ['architecture', 'legacy'],
  },
  {
    date: '2026-04-14',
    slug: 'anatomy-of-a-cards402-order',
    title: 'Anatomy of a Cards402 order',
    excerpt:
      'Legacy upstream walk-through of the old order pipeline. Useful as reference material, but not the current Casper-first MVP path.',
    tags: ['engineering', 'legacy'],
  },
  {
    date: '2026-04-14',
    slug: 'sse-beats-polling-for-agent-apis',
    title: 'Why SSE beats polling for agent-facing APIs',
    excerpt:
      'Server-Sent Events are still a useful primitive for long-lived order tracking with autonomous agents. This post remains relevant even though the repo moved away from the original production story.',
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
        intro="We don't do content marketing. Some of the posts below document the old upstream Cards402/Stellar architecture; newer ones explain what changed as this repo became a Casper-first MVP. Every post cross-posts to the changelog RSS."
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
