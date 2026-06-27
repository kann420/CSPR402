'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '../../_lib/DashboardProvider';
import { PageContainer } from '../../_ui/PageContainer';
import { PageHeader } from '../../_ui/PageHeader';
import { Card } from '../../_ui/Card';
import { KpiRow, KpiTile } from '../../_ui/KpiTile';
import { Button } from '../../_ui/Button';
import { useToast } from '../../_ui/Toast';
import { fetchPlatformWallet } from '../../_lib/api';

export default function PlatformTreasuryPage() {
  const router = useRouter();
  const { user } = useDashboard();
  const toast = useToast();
  const [data, setData] = useState<{
    public_key: string;
    network: string;
    chain_name?: string;
    payment_provider?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !user.is_platform_owner) router.replace('/dashboard/overview');
  }, [user, router]);

  useEffect(() => {
    if (!user?.is_platform_owner) return;
    let cancelled = false;
    fetchPlatformWallet()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.is_platform_owner]);

  if (!user?.is_platform_owner) return null;

  return (
    <PageContainer>
      <PageHeader
        title="Treasury"
        subtitle="Configured Casper treasury destination for Day 2 payment verification"
      />

      {error && (
        <Card title="Error">
          <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{error}</div>
        </Card>
      )}

      {data && (
        <>
          <KpiRow>
            <KpiTile label="Provider" value={data.payment_provider || 'casper'} />
            <KpiTile label="Network" value={data.network} />
            <KpiTile label="Chain" value={data.chain_name || 'casper-test'} />
            <KpiTile label="Telemetry" value="Config only" hint="live balance not wired yet" />
          </KpiRow>

          <Card title="Treasury public key">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                wordBreak: 'break-all',
                color: 'var(--fg)',
              }}
            >
              {data.public_key}
            </div>
            <div
              style={{
                marginTop: '0.9rem',
                fontSize: '0.8rem',
                color: 'var(--fg-dim)',
                lineHeight: 1.6,
              }}
            >
              Backend verification expects every Day 2 Casper payment to target this exact
              recipient. A deploy with the right amount but the wrong recipient will be rejected.
            </div>
            <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.5rem' }}>
              <Button
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(data.public_key);
                  toast.push('Treasury public key copied', 'success');
                }}
              >
                Copy public key
              </Button>
            </div>
          </Card>

          <Card title="Verification checklist">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {[
                'Recipient equals configured treasury public key.',
                'Transfer is on Casper testnet.',
                'Deploy execution succeeded.',
                'Amount and transfer_id match the order.',
                'Order has not expired and has not already been fulfilled.',
              ].map((item) => (
                <div
                  key={item}
                  style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', lineHeight: 1.55 }}
                >
                  {item}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Telemetry roadmap">
            <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              Live CSPR balances and recent incoming deploys are intentionally hidden for now — the
              legacy on-chain widgets aren't accurate for the current Casper deployment. We'll add
              Casper-native treasury telemetry in the next pass.
            </div>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
