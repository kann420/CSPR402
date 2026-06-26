'use client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#050505',
          color: '#f4f4f4',
          fontFamily: 'Georgia, "Times New Roman", serif, -apple-system, BlinkMacSystemFont',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#ff7a7a',
              marginBottom: 20,
            }}
          >
            CSPR402 · HTTP 500 · Fatal
          </div>
          <h1
            style={{
              fontSize: 56,
              letterSpacing: '-0.03em',
              fontWeight: 500,
              lineHeight: 0.96,
              margin: '0 0 18px',
              color: '#f4f4f4',
            }}
          >
            Something&nbsp;
            <span style={{ fontStyle: 'italic', color: '#ff7a7a' }}>really</span>
            &nbsp;broke.
          </h1>
          <p
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
              fontSize: 16,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.66)',
              margin: '0 0 28px',
            }}
          >
            The page failed before our regular error handler could recover. This is our fault;
            we&apos;ve logged it. Email{' '}
            <a
              href="mailto:support@cards402.com"
              style={{
                color: '#f4f4f4',
                textDecoration: 'none',
                borderBottom: '1px solid rgba(255, 122, 122, 0.4)',
              }}
            >
              support@cards402.com
            </a>{' '}
            if it keeps happening
            {error?.digest ? (
              <>
                {' '}
                and include this reference ID:{' '}
                <code
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: '0.86em',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 4,
                    padding: '0.1em 0.4em',
                  }}
                >
                  {error.digest}
                </code>
              </>
            ) : null}
            .
          </p>
        </div>
      </body>
    </html>
  );
}
