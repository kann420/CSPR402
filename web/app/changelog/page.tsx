import type { Metadata } from 'next';
import { PageHero } from '@/app/components/MarketingPage';
import { ogForPage, twitterForPage } from '@/app/lib/seo';
import { CHANGELOG_ENTRIES as ENTRIES, type ChangelogTag as Tag } from './entries';

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Everything shipped to CSPR402. API changes, dashboard polish, security fixes, and Casper-first MVP updates - chronologically.',
  alternates: {
    canonical: 'https://cards402.com/changelog',
    types: {
      'application/rss+xml': 'https://cards402.com/changelog/feed.xml',
    },
  },
  openGraph: ogForPage({
    title: 'Changelog - CSPR402',
    description: 'Everything shipped to CSPR402, chronologically.',
    path: '/changelog',
  }),
  twitter: twitterForPage({
    title: 'Changelog - CSPR402',
    description: 'Everything shipped to CSPR402, chronologically.',
  }),
};

const TAG_STYLES: Record<Tag, { color: string; bg: string; border: string }> = {
  feature: {
    color: 'var(--green)',
    bg: 'var(--green-muted)',
    border: 'var(--green-border)',
  },
  fix: {
    color: 'var(--yellow)',
    bg: 'var(--yellow-muted)',
    border: 'var(--yellow-border)',
  },
  api: {
    color: 'var(--blue)',
    bg: 'var(--blue-muted)',
    border: 'var(--blue-border)',
  },
  security: {
    color: 'var(--red)',
    bg: 'var(--red-muted)',
    border: 'var(--red-border)',
  },
  infra: {
    color: 'var(--purple)',
    bg: 'var(--purple-muted)',
    border: 'var(--purple-border)',
  },
};

function TagChip({ tag }: { tag: Tag }) {
  const s = TAG_STYLES[tag];
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.62rem',
        fontWeight: 600,
        padding: '0.2rem 0.55rem',
        borderRadius: 999,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </span>
  );
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const changelogJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: ENTRIES.map((e, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'BlogPosting',
      headline: e.version ? `v${e.version} - ${e.title}` : e.title,
      datePublished: e.date,
      description: e.body,
      url: `https://cards402.com/changelog#${e.date}-${slug(e.title)}`,
      author: { '@type': 'Organization', name: 'CSPR402' },
      publisher: {
        '@type': 'Organization',
        name: 'CSPR402',
        logo: {
          '@type': 'ImageObject',
          url: 'https://cards402.com/icon.png',
        },
      },
    },
  })),
};

export default function ChangelogPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(changelogJsonLd) }}
      />
      <PageHero
        eyebrow="Changelog"
        title="Everything we've"
        accent="shipped"
        intro="CSPR402 is a narrow but fast-moving MVP, so every change matters. This page is updated the same day a change lands in the repo. Security-sensitive fixes are disclosed here after the patch is out. Breaking API changes are always announced before they take effect."
      />

      <section style={{ padding: '3rem 1.35rem 6rem' }}>
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
          }}
        >
          {ENTRIES.map((e, i) => (
            <article
              id={`${e.date}-${slug(e.title)}`}
              key={e.date + e.title}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 140px) minmax(0, 1fr)',
                gap: '2rem',
                padding: '2.25rem 0',
                borderBottom: i === ENTRIES.length - 1 ? 'none' : '1px solid var(--border)',
                scrollMarginTop: 80,
              }}
              className="changelog-entry"
            >
              <div>
                <time
                  dateTime={e.date}
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    color: 'var(--fg)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {new Date(e.date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
                {e.version && (
                  <div
                    style={{
                      marginTop: '0.35rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: 'var(--fg-dim)',
                    }}
                  >
                    v{e.version}
                  </div>
                )}
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                    marginBottom: '0.7rem',
                  }}
                >
                  {e.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.45rem',
                    fontWeight: 500,
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    margin: '0 0 0.7rem',
                    color: 'var(--fg)',
                  }}
                >
                  {e.title}
                </h2>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.92rem',
                    lineHeight: 1.75,
                    color: 'var(--fg-muted)',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {e.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
