'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  type ApiKey,
  type ApprovalRequest,
  type DashboardInfo,
  type Order,
  type User,
  type WalletBalance,
} from './types';
import { API_BASE } from './types';
import { fetchAgents, fetchApprovals, fetchDashboard, fetchMe, fetchOrders } from './api';

interface DashboardState {
  loading: boolean;
  authError: string | null;
  user: User | null;
  info: DashboardInfo | null;
  agents: ApiKey[];
  orders: Order[];
  approvals: ApprovalRequest[];
  walletBalances: Record<string, WalletBalance>;
  refresh: () => Promise<void>;
}

const DashboardCtx = createContext<DashboardState | null>(null);

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardCtx);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return ctx;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [info, setInfo] = useState<DashboardInfo | null>(null);
  const [agents, setAgents] = useState<ApiKey[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [walletBalances, setWalletBalances] = useState<Record<string, WalletBalance>>({});
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return refreshInFlight.current;
    }
    async function runOnce() {
      const [infoRes, agentsRes, ordersRes, approvalsRes] = await Promise.allSettled([
        fetchDashboard(),
        fetchAgents(),
        fetchOrders(200),
        fetchApprovals(),
      ]);
      if (infoRes.status === 'fulfilled') setInfo(infoRes.value ?? null);
      if (agentsRes.status === 'fulfilled') {
        setAgents(Array.isArray(agentsRes.value?.api_keys) ? agentsRes.value.api_keys : []);
      }
      if (ordersRes.status === 'fulfilled') {
        setOrders(Array.isArray(ordersRes.value?.orders) ? ordersRes.value.orders : []);
      }
      if (approvalsRes.status === 'fulfilled') {
        setApprovals(
          Array.isArray(approvalsRes.value?.approval_requests)
            ? approvalsRes.value.approval_requests
            : [],
        );
      }
    }
    const run = (async () => {
      do {
        refreshQueued.current = false;
        await runOnce();
      } while (refreshQueued.current);
    })();
    refreshInFlight.current = run;
    try {
      await run;
    } finally {
      refreshInFlight.current = null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user: u } = await fetchMe();
        if (!alive) return;
        setUser(u);
        await refresh();
      } catch (err) {
        if (alive) setAuthError((err as Error).message || 'not authenticated');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    let closed = false;
    let abort: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const safety = setInterval(() => {
      void refresh();
    }, 60_000);

    function scheduleRefresh() {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 250);
    }

    async function openStream() {
      if (closed) return;
      abort = new AbortController();
      try {
        const res = await fetch(`${API_BASE}/dashboard/stream`, {
          headers: { Accept: 'text/event-stream' },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream http ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const event = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (event.includes('data:')) scheduleRefresh();
          }
          if (buf.length > 1024 * 1024) buf = '';
        }
      } catch {
        /* reconnect */
      } finally {
        if (!closed) timer = setTimeout(openStream, 2000);
      }
    }

    void openStream();
    return () => {
      closed = true;
      abort?.abort();
      if (timer) clearTimeout(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(safety);
    };
  }, [user, refresh]);

  useEffect(() => {
    setWalletBalances((prev) => {
      const next: Record<string, WalletBalance> = {};
      for (const agent of agents) {
        next[agent.id] = prev[agent.id] || { cspr: '0', usdc: '0' };
      }
      return next;
    });
  }, [agents]);

  const value = useMemo<DashboardState>(
    () => ({
      loading,
      authError,
      user,
      info,
      agents,
      orders,
      approvals,
      walletBalances,
      refresh,
    }),
    [loading, authError, user, info, agents, orders, approvals, walletBalances, refresh],
  );

  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>;
}
