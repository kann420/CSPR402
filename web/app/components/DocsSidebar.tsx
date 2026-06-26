'use client';

// Left sidebar for the /docs section. Two jobs:
//   1. A page switcher (API Reference / Quickstart) with an active state
//      driven by usePathname.
//   2. An "On this page" list of section anchors for the current page,
//      read from app/docs/docs-nav.ts, with the active section highlighted
//      via an IntersectionObserver as the reader scrolls.
//
// The sidebar is sticky in the left column of the docs layout
// (app/docs/layout.tsx) and collapses away below 860px via the
// `.docs-sidebar` rule in globals.css. On mobile a separate, collapsible
// "On this page" disclosure (`.docs-toc-mobile`, shown only <=860px)
// keeps section-jump navigation available — the section ids and their
// scroll-margin-top are the same, so native anchor jumps land below the
// sticky nav and honour the global prefers-reduced-motion override.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DOCS_PAGES, type DocPage } from '@/app/docs/docs-nav';

// Prefer an exact pathname match, then fall back to a segment-prefix match,
// then the first page. Exact-first matters because '/docs' is a string prefix
// of '/docs/': without it, the '/docs' entry would steal the '/docs/quickstart'
// route (Array.find returns the first match) and the sidebar would render the
// wrong page's sections on the quickstart page.
function findCurrent(pathname: string): DocPage {
  return (
    DOCS_PAGES.find((p) => pathname === p.href) ??
    DOCS_PAGES.find((p) => pathname.startsWith(p.href + '/')) ??
    DOCS_PAGES[0]!
  );
}

export function DocsSidebar() {
  const pathname = usePathname();
  const current = findCurrent(pathname);
  const [activeId, setActiveId] = useState<string>('');

  // Re-establish the active-section observer whenever the page changes.
  // The layout persists across client-side navigations between /docs and
  // /docs/quickstart, so without pathname in the deps the observer would
  // keep watching the previous page's sections.
  useEffect(() => {
    setActiveId('');
    const sections = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
    if (sections.length === 0) return;

    // Track the pixel area each section occupies inside the active band
    // (top of viewport below the 88px sticky nav, down through the top 45%).
    // Comparing pixel area — not the IntersectionObserver's ratio — is what
    // makes this robust: ratio is measured against each section's own size, so
    // a short, fully-visible section (ratio 1) would otherwise outrank a tall
    // section that fills the band (ratio <1) even though the tall section is
    // the one being read. Area is apples-to-apples regardless of section
    // height.
    const areas = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const a = entry.intersectionRect.width * entry.intersectionRect.height;
            areas.set(entry.target.id, a);
          } else {
            areas.delete(entry.target.id);
          }
        }
        let best = '';
        let bestArea = -1;
        for (const [id, area] of areas) {
          if (area > bestArea) {
            bestArea = area;
            best = id;
          }
        }
        if (best) setActiveId(best);
      },
      { rootMargin: '-88px 0px -55% 0px', threshold: [0, 0.1, 0.25, 0.5, 1] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  // Smooth-scroll to the section on click and reflect it in the URL hash
  // without a full navigation. scrollIntoView honours the section's
  // scroll-margin-top so it lands below the sticky nav rather than under it.
  // Respect prefers-reduced-motion: the CSS scroll-behavior override does not
  // apply to the JS ScrollOptions API, so we check the media query ourselves.
  function onSectionClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    history.replaceState(null, '', `#${id}`);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  const sectionList = (
    <nav
      aria-label="On this page"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}
    >
      {current.groups.map((g) => (
        <div key={g.group} style={{ marginBottom: '0.6rem' }}>
          <div className="docs-nav-group">{g.group}</div>
          {g.items.map((item) => {
            const active = activeId === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="docs-nav-section"
                data-active={active || undefined}
                aria-current={active ? 'location' : undefined}
                onClick={(e) => onSectionClick(e, item.id)}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside
        className="docs-sidebar"
        aria-label="Documentation sections"
        style={{
          position: 'sticky',
          top: 88,
          flexShrink: 0,
          width: 200,
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          paddingTop: '4.5rem',
          paddingBottom: '2rem',
          paddingRight: '0.5rem',
        }}
      >
        <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '0.85rem' }}>
          Docs
        </div>

        {/* Page switcher */}
        <nav
          aria-label="Docs pages"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}
        >
          {DOCS_PAGES.map((p) => {
            const active = p.href === current.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                className="docs-nav-page"
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>

        {/* On this page */}
        <div className="type-eyebrow docs-nav-heading" style={{ color: 'var(--fg-muted)' }}>
          On this page
        </div>

        {sectionList}
      </aside>

      {/* Mobile in-page navigation. The desktop sidebar is hidden <=860px,
          so without this a mobile reader has no way to jump to sections on a
          long reference page. Native <a href="#id"> jumps honour each
          section's scroll-margin-top (lands below the sticky nav) and the
          global prefers-reduced-motion scroll-behavior override — no JS
          needed here. */}
      <details className="docs-toc-mobile">
        <summary>On this page</summary>
        <nav aria-label="On this page">
          {current.groups.map((g) => (
            <div key={g.group} className="docs-toc-mobile-group">
              <div className="docs-toc-mobile-label">{g.group}</div>
              {g.items.map((item) => (
                <a key={item.id} href={`#${item.id}`} className="docs-toc-mobile-item">
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </details>

      <style>{`
        .docs-nav-page {
          display: block;
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          font-family: var(--font-body);
          font-size: 0.84rem;
          font-weight: 500;
          color: var(--fg-muted);
          text-decoration: none;
          transition: color 0.3s var(--ease-out), background 0.3s var(--ease-out);
        }
        .docs-nav-page:hover { color: var(--fg); background: var(--surface-hover); }
        .docs-nav-page[data-active] { color: var(--fg); background: var(--surface-hover); }

        .docs-nav-heading {
          font-size: 0.6rem;
          margin-top: 1.6rem;
          margin-bottom: 0.5rem;
          margin-left: 0.6rem;
        }
        .docs-nav-group {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-muted);
          margin: 0.5rem 0 0.25rem 0.6rem;
        }
        .docs-nav-section {
          display: block;
          padding: 0.3rem 0.6rem 0.3rem 0.95rem;
          font-family: var(--font-body);
          font-size: 0.8rem;
          color: var(--fg-muted);
          text-decoration: none;
          border-left: 1px solid var(--border);
          transition: color 0.25s var(--ease-out), border-color 0.25s var(--ease-out);
        }
        .docs-nav-section:hover { color: var(--fg); }
        .docs-nav-section[data-active] {
          color: var(--green);
          border-left-color: var(--green);
        }

        /* Mobile in-page TOC — hidden on desktop, shown only <=860px (the
           same breakpoint that hides the desktop sidebar). */
        .docs-toc-mobile { display: none; }
        .docs-toc-mobile summary {
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-muted);
          padding: 0.65rem 0;
          list-style: none;
        }
        .docs-toc-mobile summary::-webkit-details-marker { display: none; }
        .docs-toc-mobile[open] summary { color: var(--fg); }
        .docs-toc-mobile-group { margin: 0.4rem 0; }
        .docs-toc-mobile-label {
          font-family: var(--font-mono);
          font-size: 0.58rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-muted);
          margin: 0.5rem 0 0.25rem;
        }
        .docs-toc-mobile-item {
          display: block;
          padding: 0.3rem 0;
          font-family: var(--font-body);
          font-size: 0.86rem;
          color: var(--fg-muted);
          text-decoration: none;
        }
        .docs-toc-mobile-item:hover { color: var(--fg); }
        @media (max-width: 860px) {
          .docs-toc-mobile {
            display: block;
            margin: 4.5rem 0 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border);
          }
        }
      `}</style>
    </>
  );
}
