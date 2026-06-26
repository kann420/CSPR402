// Overview — default dashboard landing. Shows the highest-value
// signals in one glance: KPI tiles (spend + fleet health), spend
// chart, system health card, recent activity feed.

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useDashboard } from '../_lib/DashboardProvider';
import { KpiTile, KpiRow } from '../_ui/KpiTile';
import { Card } from '../_ui/Card';
import { Pill } from '../_ui/Pill';
import { EmptyState } from '../_ui/EmptyState';
import { SpendChart } from '../_ui/SpendChart';
import { OrderStatusPill } from '../_ui/OrderStatusPill';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import { formatUsd, parseTimestamp, timeAgo, bucketSpendByDay } from '../_lib/format';
import { IN_FLIGHT_ORDER_STATUSES } from '../_lib/constants';

export default function OverviewPage() {
  const { info, agents, orders } = useDashboard();

  const stats = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    const in24h = orders.filter((o) => now - parseTimestamp(o.created_at) < DAY);
    const in7d = orders.filter((o) => now - parseTimestamp(o.created_at) < 7 * DAY);
    const delivered7d = in7d.filter((o) => o.status === 'delivered');
    const failed7d = in7d.filter((o) => o.status === 'failed' || o.status === 'refunded');
    const spend24h = in24h
      .filter((o) => o.status === 'delivered')
      .reduce((s, o) => s + (parseFloat(o.amount_usdc) || 0), 0);
    const spend7d = delivered7d.reduce((s, o) => s + (parseFloat(o.amount_usdc) || 0), 0);
    const successRate =
      in7d.length > 0
        ? (delivered7d.length / (delivered7d.length + failed7d.length || 1)) * 100
        : 100;
    const activeAgents = agents.filter(
      (a) => a.agent?.state === 'active' || a.agent?.state === 'funded',
    ).length;
    const inFlight = orders.filter((o) => IN_FLIGHT_ORDER_STATUSES.has(o.status)).length;

    // Top 5 spenders over the 7d window — surfaced to regular users in
    // place of the platform-level System health card.
    return {
      spend24h,
      spend7d,
      successRate,
      activeAgents,
      inFlight,
      delivered7d: delivered7d.length,
    };
  }, [orders, agents]);

  const chartData = useMemo(() => bucketSpendByDay(orders, 14), [orders]);

  const recentActivity = useMemo(() => orders.slice(0, 10), [orders]);

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        subtitle={
          info?.created_at
            ? `${info.name || 'Dashboard'} · created ${timeAgo(info.created_at)}`
            : info?.name || 'Dashboard'
        }
      />

      <KpiRow>
        <KpiTile
          label="Spend 24h"
          value={formatUsd(stats.spend24h)}
          hint={`${stats.delivered7d} delivered (7d)`}
        />
        <KpiTile
          label="Spend 7d"
          value={formatUsd(stats.spend7d)}
          hint={`${orders.filter((o) => parseTimestamp(o.created_at) > Date.now() - 7 * 86400000).length} orders`}
        />
        <KpiTile
          label="Success rate 7d"
          value={`${stats.successRate.toFixed(1)}%`}
          hint="delivered / attempted"
        />
        <KpiTile label="Active agents" value={stats.activeAgents} hint={`${agents.length} total`} />
        <KpiTile label="In flight" value={stats.inFlight} hint="awaiting payment or delivery" />
      </KpiRow>

      <div
        className="overview-split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: '1.25rem',
        }}
      >
        <Card
          title="Spend - last 14 days"
          actions={
            <span style={{ fontSize: '0.72rem', color: 'var(--fg-dim)' }}>Analytics soon</span>
          }
        >
          <SpendChart data={chartData} height={220} />
        </Card>

        <Card title="System health">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <HealthRow
              label="Order intake"
              ok={!info?.frozen}
              okLabel="Accepting orders"
              failLabel="Paused"
            />
            <HealthRow
              label="Casper verifier"
              ok={info?.payment_provider === 'casper'}
              okLabel="Casper testnet"
              failLabel="Legacy mode"
            />
            <HealthRow
              label="Mock issuer"
              ok={info?.mock_card_mode !== false}
              okLabel="Ready"
              failLabel="Unknown"
            />
            <HealthRow
              label="mockUSDC CEP-18"
              ok={!!info?.mock_usdc?.enabled && !!info?.mock_usdc?.configured}
              okLabel="Enabled"
              failLabel={info?.mock_usdc?.enabled ? 'Needs package hash' : 'Disabled'}
            />
          </div>
        </Card>
      </div>

      <Card
        title="Recent activity"
        actions={
          <Link
            href="/dashboard/orders"
            style={{ fontSize: '0.72rem', color: 'var(--fg-dim)', textDecoration: 'none' }}
          >
            View all orders →
          </Link>
        }
        padding={0}
      >
        {recentActivity.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Orders from your agents will appear here as they flow through the system."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Amount</th>
                <th>Rail</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                    {o.api_key_label || o.api_key_id.slice(0, 8)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{formatUsd(o.amount_usdc)}</td>
                  <td style={{ color: 'var(--fg-dim)', fontSize: '0.72rem' }}>
                    {o.payment_asset === 'mock_usdc_cep18'
                      ? 'mockUSDC'
                      : o.payment_asset === 'cspr_casper'
                        ? 'CSPR'
                        : o.payment_asset}
                  </td>
                  <td>
                    <OrderStatusPill status={o.status} />
                  </td>
                  <td style={{ color: 'var(--fg-dim)' }}>{timeAgo(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}

function HealthRow({
  label,
  ok,
  okLabel,
  failLabel,
}: {
  label: string;
  ok: boolean;
  okLabel: string;
  failLabel: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
      }}
    >
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <Pill tone={ok ? 'green' : 'red'}>{ok ? okLabel : failLabel}</Pill>
    </div>
  );
}
