import type { Metadata } from 'next';

export const SITE_URL = 'https://cspr402.xyz';
export const SITE_NAME = 'CSPR402';

const OG_IMAGE_URL = `${SITE_URL}/opengraph-image`;

export const SHARED_OG: Metadata['openGraph'] = {
  siteName: SITE_NAME,
  locale: 'en_GB',
  type: 'website',
  images: [
    {
      url: OG_IMAGE_URL,
      width: 1200,
      height: 630,
      alt: 'CSPR402 - Casper testnet payment demo',
    },
  ],
};

export function ogForPage(args: {
  title: string;
  description: string;
  path: string;
}): Metadata['openGraph'] {
  return {
    ...SHARED_OG,
    title: args.title,
    description: args.description,
    url: `${SITE_URL}${args.path}`,
  };
}

export const SHARED_TWITTER: Metadata['twitter'] = {
  card: 'summary_large_image',
};

export function twitterForPage(args: { title: string; description: string }): Metadata['twitter'] {
  return {
    ...SHARED_TWITTER,
    title: args.title,
    description: args.description,
  };
}
