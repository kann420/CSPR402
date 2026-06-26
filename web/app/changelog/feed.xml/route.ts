import { CHANGELOG_ENTRIES as ENTRIES } from '../entries';

const SITE = 'https://cards402.com';
const SITE_NAME = 'CSPR402';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc822(iso: string): string {
  return new Date(iso + 'T09:00:00Z').toUTCString();
}

export async function GET() {
  const newest = ENTRIES[0];
  const lastBuild = newest ? rfc822(newest.date) : new Date().toUTCString();
  const items = ENTRIES.map((e) => {
    const guid = `${SITE}/changelog#${e.date}-${e.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;
    const titlePrefix = e.version ? `v${e.version} - ` : '';
    return `
    <item>
      <title>${escapeXml(titlePrefix + e.title)}</title>
      <link>${SITE}/changelog</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <category>${e.tags.map(escapeXml).join(', ')}</category>
      <description>${escapeXml(e.body)}</description>
    </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} changelog</title>
    <link>${SITE}/changelog</link>
    <atom:link href="${SITE}/changelog/feed.xml" rel="self" type="application/rss+xml" />
    <description>Everything shipped to CSPR402. API changes, dashboard polish, security fixes, and Casper-first MVP updates - chronologically.</description>
    <language>en-GB</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <generator>CSPR402 changelog route</generator>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
