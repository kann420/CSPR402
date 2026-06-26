import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/', '/portal/'],
      },
    ],
    sitemap: 'https://cspr402.xyz/sitemap.xml',
    host: 'https://cspr402.xyz',
  };
}
