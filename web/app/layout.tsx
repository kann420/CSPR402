import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
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

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono-next',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const SITE_URL = 'https://cspr402.xyz';
const SITE_NAME = 'CSPR402';
const SITE_DESCRIPTION =
  'Hackathon MVP for Casper testnet transfers, backend deploy verification, and simulated virtual card fulfillment.';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} - Casper testnet payment demo`,
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
    title: `${SITE_NAME} - Casper testnet payment demo`,
    description:
      'Create an order, send Casper testnet CSPR, verify the deploy, and receive a simulated virtual card receipt.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} - Casper testnet payment demo`,
    description:
      'Create an order, send Casper testnet CSPR, verify the deploy, and receive a simulated virtual card receipt.',
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
  sameAs: ['https://github.com/CTX-com/Cards402'],
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
