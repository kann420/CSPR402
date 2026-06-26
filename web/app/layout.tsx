import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { MarketingChrome } from '@/app/components/MarketingChrome';
import './globals.css';

const displayFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz', 'SOFT'],
  style: ['normal', 'italic'],
});

// Inter — the UI/body face. A modern, neutral grotesque that's tighter
// and more refined than IBM Plex Sans, tuned for screens and small UI
// labels. Carries the whole app chrome; pairs with Fraunces (display)
// and JetBrains Mono (numeric/code) for the editorial + engineering
// contrast that fits the Casper red-black product vibe.
const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

// JetBrains Mono — the numeric/code face. Crisper and more legible than
// IBM Plex Mono at small sizes, with a developer-tool character that
// matches the on-chain/Casper context. Used for KPI values, keys,
// addresses, and the spend chart.
const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-next',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const SITE_URL = 'https://cspr402.xyz';
const SITE_NAME = 'CSPR402';
const SITE_DESCRIPTION =
  'Verify a single on-chain Casper payment and return a ready-to-use virtual card for AI agents. No custodial wallet, no off-chain trust, no manual reconciliation.';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — On-chain Casper payments, verified into cards`,
    template: `%s - ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: 'Next.js',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
    languages: {
      'en-GB': SITE_URL,
      'x-default': SITE_URL,
    },
  },
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — On-chain Casper payments, verified into cards`,
    description:
      'AI agents pay in CSPR on Casper. CSPR402 verifies the deploy on-chain and returns a ready-to-use virtual card — no custodial wallet, no off-chain trust.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — On-chain Casper payments, verified into cards`,
    description:
      'AI agents pay in CSPR on Casper. CSPR402 verifies the deploy on-chain and returns a ready-to-use virtual card — no custodial wallet, no off-chain trust.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
};

export const viewport: Viewport = {
  themeColor: '#050505',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

const jsonLdOrg = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  description: SITE_DESCRIPTION,
};

const jsonLdSite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  publisher: { '@id': `${SITE_URL}#organization` },
  inLanguage: 'en-GB',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const hdrs = await headers();
  const host = hdrs.get('host') || '';
  const isStatusSubdomain = host === 'status.cspr402.xyz' || host.startsWith('status.cspr402.xyz:');

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body
        style={{
          background: 'var(--bg)',
          color: 'var(--fg)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 0,
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <script
          id="cspr402-jsonld"
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([jsonLdOrg, jsonLdSite]),
          }}
        />
        <div
          id="app"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div id="csprclick-ui" />
          {isStatusSubdomain ? children : <MarketingChrome>{children}</MarketingChrome>}
        </div>
      </body>
    </html>
  );
}
