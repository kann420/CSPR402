// Operator settings. Most of what's here is client-side preference —
// backend-persisted settings (team members, org branding, real audit
// log) land in Phase 2.5 once the backend has user/org tables.

'use client';

import { useEffect, useState } from 'react';
import { useDashboard } from '../_lib/DashboardProvider';
import { Card } from '../_ui/Card';
import { Toggle } from '../_ui/Toggle';
import { Button } from '../_ui/Button';
import { Pill } from '../_ui/Pill';
import { useToast } from '../_ui/Toast';
import { applyTheme, loadTheme, saveTheme, type Theme } from '../_ui/theme';
import { timeAgo } from '../_lib/format';
import { fetchPlatformWallet } from '../_lib/api';

const NOTIF_PREF_KEY = 'cspr402.notifications';
const DENSITY_KEY = 'cspr402.density';

type NotifPrefs = {
  browserOnAuthDead: boolean;
  browserOnFailed: boolean;
  browserOnApprovalNeeded: boolean;
};

const DEFAULT_NOTIF: NotifPrefs = {
  browserOnAuthDead: true,
  browserOnFailed: false,
  browserOnApprovalNeeded: true,
};

export default function SettingsPage() {
  const { user, info } = useDashboard();
  const isPlatformOwner = !!user?.is_platform_owner;
  const toast = useToast();

  // Appearance (theme + density) is hidden — the dashboard runs dark-only
  // to match the landing's red-black vibe, and the theme toggle is hidden
  // in the header too. The Appearance card below is kept behind this flag
  // so restoring it is a one-line flip (the theme/density state stays
  // wired and is just never rendered).
  const SHOW_APPEARANCE = false;

  // Theme preference
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(loadTheme());
  }, []);

  function pickTheme(next: Theme) {
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
    toast.push(`Theme: ${next}`, 'success');
  }

  // Density preference
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    if (stored === 'compact' || stored === 'comfortable') setDensity(stored);
  }, []);

  function pickDensity(next: 'comfortable' | 'compact') {
    setDensity(next);
    window.localStorage.setItem(DENSITY_KEY, next);
    toast.push(`Density: ${next}`, 'success');
  }

  // Notification preferences
  const [notifs, setNotifs] = useState<NotifPrefs>(DEFAULT_NOTIF);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NOTIF_PREF_KEY);
      if (raw) setNotifs({ ...DEFAULT_NOTIF, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);

  function updateNotif(key: keyof NotifPrefs, value: boolean) {
    const next = { ...notifs, [key]: value };
    setNotifs(next);
    window.localStorage.setItem(NOTIF_PREF_KEY, JSON.stringify(next));
  }

  async function requestBrowserPermission() {
    if (typeof Notification === 'undefined') {
      toast.push('Browser notifications not supported here', 'error');
      return;
    }
    if (Notification.permission === 'granted') {
      toast.push('Already granted', 'success');
      return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      toast.push('Notifications enabled', 'success');
    } else {
      toast.push('Permission denied', 'error');
    }
  }

  function exportData() {
    // Client-side export of agent groups + prefs so operators can move
    // their local config between browsers while we don't have a sync.
    const data = {
      schema: 1,
      exportedAt: new Date().toISOString(),
      theme: loadTheme(),
      density: window.localStorage.getItem(DENSITY_KEY),
      notifications: window.localStorage.getItem(NOTIF_PREF_KEY),
      agentGroups: window.localStorage.getItem('cspr402.agent_groups'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cspr402-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push('Settings exported', 'success');
  }

  function clearLocalData() {
    if (!confirm('Remove all local preferences and group assignments? This cannot be undone.')) {
      return;
    }
    window.localStorage.removeItem('cspr402.agent_groups');
    window.localStorage.removeItem(NOTIF_PREF_KEY);
    window.localStorage.removeItem(DENSITY_KEY);
    window.localStorage.removeItem('cspr402.theme');
    toast.push('Local data cleared', 'success');
    setTimeout(() => window.location.reload(), 400);
  }

  return (
    <div
      style={{
        padding: '1.5rem 1.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: 820,
      }}
    >
      <div>
        <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
          Settings
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--fg-dim)' }}>
          Account, notifications, and local data.
        </div>
      </div>

      <Card title="Account" padding="1.25rem 1.5rem">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Row label="Email">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              {user?.email || '—'}
            </span>
          </Row>
          <Row label="Role">
            <Pill tone="green">{user?.role || 'operator'}</Pill>
          </Row>
          <Row label="Organisation">
            <span style={{ fontSize: '0.8rem' }}>{info?.name || '—'}</span>
          </Row>
          <Row label="Member since">
            <span style={{ fontSize: '0.8rem', color: 'var(--fg-dim)' }}>
              {timeAgo(info?.created_at)}
            </span>
          </Row>
        </div>
      </Card>

      {isPlatformOwner && <PlatformTreasuryCard />}

      {/* Hidden: Appearance (theme + density). See SHOW_APPEARANCE above. */}
      {SHOW_APPEARANCE && (
        <Card title="Appearance" padding="1.25rem 1.5rem">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Row label="Theme" description="Dark is default. System follows your OS preference.">
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(['dark', 'light', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => pickTheme(t)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 6,
                      border: `1px solid ${theme === t ? 'var(--fg)' : 'var(--border)'}`,
                      background: theme === t ? 'var(--surface-2)' : 'transparent',
                      color: theme === t ? 'var(--fg)' : 'var(--fg-muted)',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      fontWeight: theme === t ? 600 : 500,
                      textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              label="Density"
              description="Compact trims row padding for denser tables. Comfortable is the default."
            >
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(['comfortable', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => pickDensity(d)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: 6,
                      border: `1px solid ${density === d ? 'var(--fg)' : 'var(--border)'}`,
                      background: density === d ? 'var(--surface-2)' : 'transparent',
                      color: density === d ? 'var(--fg)' : 'var(--fg-muted)',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      fontWeight: density === d ? 600 : 500,
                      textTransform: 'capitalize',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Row>
          </div>
        </Card>
      )}

      <Card title="Notifications" padding="1.25rem 1.5rem">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--fg-dim)',
              padding: '0.7rem 0.85rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <span>
              Browser notifications need permission first. Email and webhook delivery are staged for
              the next demo pass.
            </span>
            <Button size="sm" onClick={requestBrowserPermission}>
              Enable
            </Button>
          </div>
          {/* Mock issuer health is a platform-operator concern, not a user one. */}
          {isPlatformOwner && (
            <Toggle
              checked={notifs.browserOnAuthDead}
              onChange={(v) => updateNotif('browserOnAuthDead', v)}
              label="Mock issuer issue"
              description="Fires a browser notification when the mock fulfillment circuit needs attention."
            />
          )}
          <Toggle
            checked={notifs.browserOnApprovalNeeded}
            onChange={(v) => updateNotif('browserOnApprovalNeeded', v)}
            label="Approval needed"
            description="Alert when an order is waiting for your review."
          />
          <Toggle
            checked={notifs.browserOnFailed}
            onChange={(v) => updateNotif('browserOnFailed', v)}
            label="Order failed"
            description="Alert on every fulfillment failure (can be noisy)."
          />
        </div>
      </Card>

      <Card title="Local data" padding="1.25rem 1.5rem">
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--fg-dim)',
            marginBottom: '0.85rem',
            lineHeight: 1.5,
          }}
        >
          Agent groups and notification preferences are stored in this browser. Export to move them
          to another machine, or clear everything to reset.
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button onClick={exportData}>Export settings</Button>
          <Button variant="danger" onClick={clearLocalData}>
            Clear local data
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Platform-owner-only treasury card. CSPR402 Day 2 only needs to
// surface the configured treasury identity. We deliberately avoid
// speculative balance widgets here because CSPR402 verifies Casper
// testnet transfers against the configured treasury public key.
function PlatformTreasuryCard() {
  const toast = useToast();
  const [wallet, setWallet] = useState<{
    public_key: string;
    network: string;
    chain_name?: string;
    payment_provider?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformWallet()
      .then((w) => {
        if (cancelled) return;
        setWallet(w);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyAddress() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.public_key);
    toast.push('Address copied', 'success');
  }

  return (
    <Card title="Casper treasury" padding="1.25rem 1.5rem">
      <div
        style={{
          fontSize: '0.74rem',
          color: 'var(--fg-dim)',
          marginBottom: '0.85rem',
          lineHeight: 1.5,
        }}
      >
        CSPR402 verifies Casper transfers against one configured treasury public key. This panel
        shows that local configuration. Live treasury balances are not wired into the dashboard yet.
      </div>
      {error && (
        <div
          style={{
            background: 'var(--red-muted)',
            border: '1px solid var(--red-border)',
            padding: '0.6rem 0.8rem',
            borderRadius: 6,
            color: 'var(--red)',
            fontSize: '0.74rem',
          }}
        >
          {error}
        </div>
      )}
      {wallet && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <Row label="Public key">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--fg)',
                wordBreak: 'break-all',
              }}
            >
              {wallet.public_key}
            </span>
          </Row>
          <Row label="Network">
            <Pill tone="neutral">{wallet.network}</Pill>
          </Row>
          {wallet.chain_name && (
            <Row label="Chain">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                {wallet.chain_name}
              </span>
            </Row>
          )}
          <Row label="Provider">
            <Pill tone="green">{wallet.payment_provider || 'casper'}</Pill>
          </Row>
          <Row label="Balance telemetry">
            <span style={{ fontSize: '0.75rem', color: 'var(--fg-dim)' }}>Not wired yet</span>
          </Row>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button onClick={copyAddress}>Copy address</Button>
          </div>
        </div>
      )}
      {!wallet && !error && (
        <div style={{ fontSize: '0.74rem', color: 'var(--fg-dim)' }}>Loading treasury…</div>
      )}
    </Card>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: description ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--fg)', fontWeight: 500 }}>{label}</div>
        {description && (
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--fg-dim)',
              marginTop: '0.2rem',
              lineHeight: 1.45,
              maxWidth: 420,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
