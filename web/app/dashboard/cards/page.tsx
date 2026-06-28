// Virtual cards — masked projection of the tenant's delivered orders.
// Shows brand / last4 / expiry / amount / linked order / status / created.
// No PAN or CVV is ever surfaced here (backend lib/card-vault.js maskCard).

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageContainer } from '../_ui/PageContainer';
import { PageHeader } from '../_ui/PageHeader';
import { Card } from '../_ui/Card';
import { EmptyState } from '../_ui/EmptyState';
import { OrderStatusPill } from '../_ui/OrderStatusPill';
import { fetchCards } from '../_lib/api';
import type { Card as CardRow } from '../_lib/types';
import { timeAgo, formatUsd } from '../_lib/format';

export default function CardsPage() {
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchCards();
        if (!cancelled) setRows(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Virtual cards"
        subtitle={`Issued cards from your delivered orders${rows ? ` — ${rows.length} total` : ''}.`}
      />

      <Card title="Cards" padding={0}>
        {error ? (
          <div style={{ color: 'var(--red)', padding: '1rem', fontSize: '0.8rem' }}>{error}</div>
        ) : rows === null ? (
          <EmptyState title="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No cards yet"
            description="Cards appear here once an order is delivered."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Last 4</th>
                <th>Expiry</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Order</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.order_id}>
                  <td style={{ fontSize: '0.76rem' }}>{c.brand || '—'}</td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.76rem',
                      color: 'var(--fg)',
                    }}
                  >
                    {c.last4 ? `•••• ${c.last4}` : '—'}
                  </td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      color: 'var(--fg-muted)',
                    }}
                  >
                    {c.expiry || '—'}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.76rem',
                    }}
                  >
                    {formatUsd(parseFloat(c.amount_usdc || '0'))}
                  </td>
                  <td>
                    <Link
                      href="/dashboard/orders"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: 'var(--fg)',
                        textDecoration: 'none',
                      }}
                    >
                      {c.order_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td>
                    <OrderStatusPill status={c.status} />
                  </td>
                  <td style={{ color: 'var(--fg-dim)', fontSize: '0.72rem' }}>
                    {timeAgo(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}
