// Shared layout for the /docs section. Puts a sticky section-anchor
// sidebar on the left and the page content on the right. Both /docs and
// /docs/quickstart render their content as `children` inside the right
// column; the sidebar reads the current pathname to show that page's
// sections (see DocsSidebar + app/docs/docs-nav.ts).
//
// The page components keep their own maxWidth + vertical padding, so this
// layout only owns the two-column shell + the horizontal gutters.

import type { ReactNode } from 'react';
import { DocsSidebar } from '@/app/components/DocsSidebar';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="docs-shell"
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: '0 1.35rem',
        display: 'flex',
        gap: '3rem',
        alignItems: 'flex-start',
      }}
    >
      <DocsSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
