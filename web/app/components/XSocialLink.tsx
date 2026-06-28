'use client';

import type { MouseEvent } from 'react';

// Official CSPR402 X (formerly Twitter) handle. Linked from the marketing
// header nav and the footer so visitors can follow the project.
const X_URL = 'https://x.com/CSPR402';

/**
 * Icon-only external link to CSPR402 on X. Styled to match the surrounding
 * marketing links: muted at rest, brightens to --fg on hover. The X logo is
 * rendered as currentColor so it inherits the link color.
 */
export function XSocialLink({ size = 15 }: { size?: number }) {
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="CSPR402 on X"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--fg-muted)',
        textDecoration: 'none',
        transition: 'color 0.3s var(--ease-out)',
      }}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) =>
        (e.currentTarget.style.color = 'var(--fg)')
      }
      onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) =>
        (e.currentTarget.style.color = 'var(--fg-muted)')
      }
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  );
}
