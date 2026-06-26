import type { Metadata } from 'next';
import { PageHero, PageSection } from '@/app/components/MarketingPage';

export const metadata: Metadata = {
  title: 'Status',
  description:
    'Local status page for the CSPR402 hackathon build: backend reachability, payment mode, and circuit-breaker health.',
};

export const dynamic = 'force-dynamic';

interface BackendStatus {
  ok: boolean;
  payment_provider?: string;
  frozen: boolean;
  consecutive_failures: number;
  orders: {
    pending_payment: number;
    in_progress: number;
    refund_pending: number;
  };
  last_24h: {
    total: number;
    delivered: number;
    failed: number;
    refunded: number;
    expired: number;
    success_rate: number | null;
  };
  stellar_watcher?: {
    enabled?: boolean;
    age_seconds?: number | null;
  };
  process: {
    uptime_seconds: number;
    started_at: string;
  };
  generated_at: string;
}

async function fetchBackendStatus(): Promise<BackendStatus | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4000';
  const url = `${base.replace(/\/v1\/?$/, '').replace(/\/$/, '')}/status`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as BackendStatus;
  } catch {
    return null;
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default async function StatusPage() {
  const status = await fetchBackendStatus();

  return (
    <>
      <PageHero
        eyebrow="Status"
        title="Local backend health"
        intro="This page reports the actual local hackathon backend state. It does not pretend the old Stellar watcher or real card issuer stack is still the product."
      />

      <PageSection>
        {status ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {[
              ['Backend', status.ok ? 'Reachable' : 'Degraded'],
              ['Provider', status.payment_provider || 'casper'],
              ['Frozen', status.frozen ? 'YES' : 'no'],
              ['Uptime', formatUptime(status.process.uptime_seconds)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: '1.2rem',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  background: 'var(--surface)',
                }}
              >
                <div
                  className="type-eyebrow"
                  style={{ color: 'var(--fg-dim)', marginBottom: '0.6rem' }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: '1.35rem',
                    color: 'var(--fg)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '1.2rem',
              border: '1px solid var(--red-border)',
              borderRadius: 14,
              background: 'var(--red-muted)',
              color: 'var(--red)',
            }}
          >
            Could not reach the backend <code>/status</code> endpoint. Make sure the local backend
            is running with the current env.
          </div>
        )}
      </PageSection>

      {status && (
        <PageSection background="surface" eyebrow="Signals" title="What the backend is telling us.">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
            }}
          >
            <StatusCard
              title="Order queue"
              body={`pending_payment: ${status.orders.pending_payment}, in_progress: ${status.orders.in_progress}, refund_pending: ${status.orders.refund_pending}`}
            />
            <StatusCard
              title="24h outcomes"
              body={`total: ${status.last_24h.total}, delivered: ${status.last_24h.delivered}, failed: ${status.last_24h.failed}, refunded: ${status.last_24h.refunded}, expired: ${status.last_24h.expired}`}
            />
            <StatusCard
              title="Circuit breaker"
              body={`consecutive_failures: ${status.consecutive_failures}, frozen: ${status.frozen ? 'true' : 'false'}`}
            />
            <StatusCard
              title="Legacy watcher telemetry"
              body={
                status.stellar_watcher?.enabled
                  ? `enabled, age_seconds=${status.stellar_watcher.age_seconds ?? 'n/a'}`
                  : 'disabled in Casper mode'
              }
            />
          </div>
        </PageSection>
      )}
    </>
  );
}

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: '1.2rem',
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: 'var(--bg)',
      }}
    >
      <div className="type-eyebrow" style={{ color: 'var(--green)', marginBottom: '0.7rem' }}>
        {title}
      </div>
      <div style={{ fontSize: '0.92rem', color: 'var(--fg-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
