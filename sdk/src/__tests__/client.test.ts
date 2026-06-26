import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Allow http:// base URLs in tests (assertSafeBaseUrl rejects them otherwise)
process.env.CARDS402_ALLOW_INSECURE_BASE_URL = '1';

import { Cards402Client } from '../client';
import {
  AuthError,
  SpendLimitError,
  RateLimitError,
  ServiceUnavailableError,
  InvalidAmountError,
  OrderFailedError,
  WaitTimeoutError,
} from '../errors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function client() {
  return new Cards402Client({ baseUrl: 'http://localhost:3000/v1', apiKey: 'cards402_test_key' });
}

const ORDER_RESPONSE = {
  order_id: 'ord_abc',
  status: 'pending_payment',
  payment: {
    type: 'soroban_contract' as const,
    contract_id: 'CARDS402CONTRACTIDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    order_id: 'ord_abc',
    usdc: {
      amount: '10.00',
      asset: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    },
    xlm: { amount: '72.00' },
  },
  poll_url: '/v1/orders/ord_abc',
  budget: { spent_usdc: '0.00', limit_usdc: null, remaining_usdc: null },
};

const CASPER_ORDER_RESPONSE = {
  order_id: 'ord_casper',
  status: 'pending_payment',
  payment: {
    type: 'casper_cspr_transfer' as const,
    network: 'testnet' as const,
    chain_name: 'casper-test' as const,
    recipient: '01' + 'a'.repeat(64),
    order_id: 'ord_casper',
    amount_usdc: '10.00',
    amount_cspr: '1000.000000000',
    amount_motes: '1000000000000',
    transfer_id: 100000,
    expires_at: '2026-01-01T00:00:00.000Z',
  },
  poll_url: '/v1/orders/ord_casper',
  budget: { spent_usdc: '0.00', limit_usdc: null, remaining_usdc: null },
};

const MOCK_USDC_ORDER_RESPONSE = {
  order_id: 'ord_mock_usdc',
  status: 'pending_payment',
  payment: {
    type: 'casper_cep18_transfer' as const,
    asset: 'mockUSDC' as const,
    decimals: 6 as const,
    network: 'testnet' as const,
    chain_name: 'casper-test' as const,
    contract_package_hash: 'f'.repeat(64),
    contract_hash: 'e'.repeat(64),
    sender_public_key: '01' + 'b'.repeat(64),
    recipient_public_key: '01' + 'a'.repeat(64),
    order_id: 'ord_mock_usdc',
    amount: '10.00',
    amount_base_units: '10000000',
    expires_at: '2026-01-01T00:00:00.000Z',
    verify_url: 'https://api.cards402.test/v1/orders/ord_mock_usdc/verify-payment',
  },
  poll_url: '/v1/orders/ord_mock_usdc',
  budget: { spent_usdc: '0.00', limit_usdc: null, remaining_usdc: null },
};

const ORDER_STATUS_PENDING = {
  order_id: 'ord_abc',
  status: 'pending_payment',
  phase: 'awaiting_payment' as const,
  amount_usdc: '10.00',
  payment_asset: 'usdc',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const ORDER_STATUS_READY = {
  ...ORDER_STATUS_PENDING,
  status: 'delivered',
  phase: 'ready' as const,
  card: { number: '4111111111111111', cvv: '123', expiry: '12/27', brand: 'Visa' },
};

// ── createOrder ───────────────────────────────────────────────────────────────

describe('Cards402Client.createOrder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a USDC order and returns response', async () => {
    mockFetch(201, ORDER_RESPONSE);
    const res = await client().createOrder({ amount_usdc: '10.00' });
    expect(res.order_id).toBe('ord_abc');
    expect(res.payment.type).toBe('soroban_contract');
    if (res.payment.type !== 'soroban_contract') throw new Error('expected soroban payment');
    expect(res.payment.contract_id).toBe(
      'CARDS402CONTRACTIDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    );
    expect(res.payment.order_id).toBe('ord_abc');
    expect(res.budget.spent_usdc).toBe('0.00');
  });

  it('creates a Casper CSPR order and preserves transfer instructions', async () => {
    mockFetch(201, CASPER_ORDER_RESPONSE);
    const res = await client().createOrder({ amount_usdc: '10.00' });
    expect(res.payment.type).toBe('casper_cspr_transfer');
    if (res.payment.type !== 'casper_cspr_transfer') throw new Error('expected Casper payment');
    expect(res.payment.chain_name).toBe('casper-test');
    expect(res.payment.amount_motes).toBe('1000000000000');
    expect(res.payment.transfer_id).toBe(100000);
  });

  it('sends correct headers and body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ORDER_RESPONSE });
    global.fetch = fetchMock;

    await client().createOrder({ amount_usdc: '10.00' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/orders');
    expect((opts.headers as Record<string, string>)['X-Api-Key']).toBe('cards402_test_key');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(opts.body as string);
    expect(parsed.amount_usdc).toBe('10.00');
  });

  it('creates a mockUSDC order and sends the payer public key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => MOCK_USDC_ORDER_RESPONSE });
    global.fetch = fetchMock;

    const payer = '01' + 'b'.repeat(64);
    const res = await client().createOrder({
      amount_usdc: '10.00',
      payment_asset: 'mock_usdc_cep18',
      payer_public_key: payer,
    });

    expect(res.payment.type).toBe('casper_cep18_transfer');
    if (res.payment.type !== 'casper_cep18_transfer') throw new Error('expected CEP-18 payment');
    expect(res.payment.amount_base_units).toBe('10000000');
    expect(res.payment.contract_package_hash).toBe('f'.repeat(64));

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(opts.body as string);
    expect(parsed.payment_asset).toBe('mock_usdc_cep18');
    expect(parsed.payer_public_key).toBe(payer);
  });

  it('throws AuthError on 401', async () => {
    mockFetch(401, { error: 'invalid_api_key' });
    await expect(client().createOrder({ amount_usdc: '10.00' })).rejects.toThrow(AuthError);
  });

  it('throws SpendLimitError on 403 spend_limit_exceeded', async () => {
    mockFetch(403, { error: 'spend_limit_exceeded', limit: '50.00', spent: '50.00' });
    const err = await client()
      .createOrder({ amount_usdc: '10.00' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SpendLimitError);
    expect(err.limit).toBe('50.00');
  });

  it('throws RateLimitError on 429', async () => {
    mockFetch(429, { error: 'rate_limit_exceeded' });
    await expect(client().createOrder({ amount_usdc: '10.00' })).rejects.toThrow(RateLimitError);
  });

  it('throws ServiceUnavailableError on 503', async () => {
    mockFetch(503, { error: 'service_temporarily_unavailable' });
    await expect(client().createOrder({ amount_usdc: '10.00' })).rejects.toThrow(
      ServiceUnavailableError,
    );
  });

  it('throws InvalidAmountError on 400 invalid_amount', async () => {
    mockFetch(400, { error: 'invalid_amount' });
    await expect(client().createOrder({ amount_usdc: '0' })).rejects.toThrow(InvalidAmountError);
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ORDER_RESPONSE });
    global.fetch = fetchMock;
    const c = new Cards402Client({ baseUrl: 'http://localhost:3000/v1/', apiKey: 'k' });
    await c.createOrder({ amount_usdc: '10.00' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/v1/orders');
  });
});

// ── getOrder ──────────────────────────────────────────────────────────────────

describe('Cards402Client.getOrder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns order status with phase', async () => {
    mockFetch(200, ORDER_STATUS_PENDING);
    const order = await client().getOrder('ord_abc');
    expect(order.order_id).toBe('ord_abc');
    expect(order.phase).toBe('awaiting_payment');
    expect(order.status).toBe('pending_payment');
  });

  it('returns card details for delivered order', async () => {
    mockFetch(200, ORDER_STATUS_READY);
    const order = await client().getOrder('ord_abc');
    expect(order.phase).toBe('ready');
    expect(order.card?.number).toBe('4111111111111111');
  });

  it('throws AuthError on 401', async () => {
    mockFetch(401, { error: 'invalid_api_key' });
    await expect(client().getOrder('ord_abc')).rejects.toThrow(AuthError);
  });
});

// ── waitForCard ───────────────────────────────────────────────────────────────

describe('Cards402Client.verifyCasperPayment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts deploy_hash to the Casper verify endpoint', async () => {
    const deployHash = 'a'.repeat(64);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        receipt: {
          type: 'casper_cspr_receipt',
          order_id: 'ord_casper',
          payment_asset: 'cspr_casper',
          network: 'testnet',
          chain_name: 'casper-test',
          deploy_hash: deployHash,
          sender_public_key: '01' + 'b'.repeat(64),
          recipient: '01' + 'a'.repeat(64),
          transfer_id: 100000,
          amount_motes: '1000000000000',
          verified_at: '2026-01-01T00:00:00.000Z',
          card_mode: 'mock',
        },
        order: ORDER_STATUS_READY,
      }),
    });
    global.fetch = fetchMock;

    const res = await client().verifyCasperPayment('ord_casper', deployHash);

    expect(res.receipt.deploy_hash).toBe(deployHash);
    expect(res.order.phase).toBe('ready');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/v1/orders/ord_casper/verify-payment');
    expect((opts.headers as Record<string, string>)['X-Api-Key']).toBe('cards402_test_key');
    expect(JSON.parse(opts.body as string)).toEqual({ deploy_hash: deployHash });
  });

  it('posts sender_public_key and parses mockUSDC receipts', async () => {
    const deployHash = 'a'.repeat(64);
    const senderPublicKey = '01' + 'b'.repeat(64);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        receipt: {
          type: 'casper_mock_usdc_receipt',
          order_id: 'ord_mock_usdc',
          payment_asset: 'mock_usdc_cep18',
          network: 'testnet',
          chain_name: 'casper-test',
          deploy_hash: deployHash,
          sender_public_key: senderPublicKey,
          asset: 'mockUSDC',
          decimals: 6,
          contract_package_hash: 'f'.repeat(64),
          contract_hash: 'e'.repeat(64),
          recipient_public_key: '01' + 'a'.repeat(64),
          recipient_account_hash: 'account-hash-' + 'c'.repeat(64),
          amount_base_units: '10000000',
          verified_at: '2026-01-01T00:00:00.000Z',
          card_mode: 'mock',
        },
        order: ORDER_STATUS_READY,
      }),
    });
    global.fetch = fetchMock;

    const res = await client().verifyCasperPayment('ord_mock_usdc', deployHash, {
      senderPublicKey,
    });

    expect(res.receipt.type).toBe('casper_mock_usdc_receipt');
    if (res.receipt.type !== 'casper_mock_usdc_receipt') {
      throw new Error('expected mockUSDC receipt');
    }
    expect(res.receipt.amount_base_units).toBe('10000000');
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string)).toEqual({
      deploy_hash: deployHash,
      sender_public_key: senderPublicKey,
    });
  });

  it('validates deploy hash shape client-side', async () => {
    await expect(client().verifyCasperPayment('ord_casper', 'bad')).rejects.toThrow(
      /Invalid Casper deploy hash/,
    );
  });
});

describe('Cards402Client.waitForCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns card immediately when order is already ready', async () => {
    mockFetch(200, ORDER_STATUS_READY);
    const card = await client().waitForCard('ord_abc', { timeoutMs: 5000, intervalMs: 100 });
    expect(card.number).toBe('4111111111111111');
  });

  it('polls until ready', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ORDER_STATUS_PENDING })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ORDER_STATUS_READY });
    global.fetch = fetchMock;

    const promise = client().waitForCard('ord_abc', { timeoutMs: 10000, intervalMs: 50 });
    // Advance timers to allow polling
    await vi.runAllTimersAsync();
    const card = await promise;
    expect(card.number).toBe('4111111111111111');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws OrderFailedError when phase=failed', async () => {
    mockFetch(200, {
      ...ORDER_STATUS_PENDING,
      phase: 'failed',
      status: 'failed',
      error: 'supplier unavailable',
    });
    await expect(
      client().waitForCard('ord_abc', { timeoutMs: 5000, intervalMs: 100 }),
    ).rejects.toThrow(OrderFailedError);
  });

  it('throws OrderFailedError with refund info when phase=refunded', async () => {
    mockFetch(200, {
      ...ORDER_STATUS_PENDING,
      phase: 'refunded',
      status: 'refunded',
      refund: { stellar_txid: 'txid_xyz' },
    });
    const err = await client()
      .waitForCard('ord_abc', { timeoutMs: 5000, intervalMs: 100 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(OrderFailedError);
    expect(err.refund).toEqual({ stellar_txid: 'txid_xyz' });
  });

  it('throws OrderFailedError when phase=expired', async () => {
    mockFetch(200, {
      ...ORDER_STATUS_PENDING,
      phase: 'expired',
      status: 'expired',
    });
    const err = await client()
      .waitForCard('ord_abc', { timeoutMs: 5000, intervalMs: 100 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(OrderFailedError);
    expect(err.message).toContain('expired');
  });

  it('throws WaitTimeoutError after deadline', async () => {
    mockFetch(200, ORDER_STATUS_PENDING);

    // Attach .catch BEFORE advancing timers so the rejection is handled synchronously
    const errPromise = client()
      .waitForCard('ord_abc', { timeoutMs: 100, intervalMs: 50 })
      .catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await errPromise;
    expect(err).toBeInstanceOf(WaitTimeoutError);
    expect(err.orderId).toBe('ord_abc');
  });
});

// ── listOrders ────────────────────────────────────────────────────────────────

describe('Cards402Client.listOrders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns list of orders', async () => {
    // List endpoint returns { id, status, amount_usdc, payment_asset, created_at, updated_at }
    const listItems = [
      {
        id: 'ord_abc',
        status: 'pending_payment',
        amount_usdc: '10.00',
        payment_asset: 'usdc',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'ord_def',
        status: 'delivered',
        amount_usdc: '10.00',
        payment_asset: 'usdc',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];
    mockFetch(200, listItems);
    const orders = await client().listOrders();
    expect(orders).toHaveLength(2);
    expect(orders[0]?.id).toBe('ord_abc');
  });

  it('sends status filter as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = fetchMock;
    await client().listOrders({ status: 'delivered' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('status=delivered');
  });

  it('sends limit as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = fetchMock;
    await client().listOrders({ limit: 5 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('limit=5');
  });

  it('returns empty array when no orders', async () => {
    mockFetch(200, []);
    const orders = await client().listOrders();
    expect(orders).toEqual([]);
  });

  it('throws on error status', async () => {
    mockFetch(401, { error: 'invalid_api_key' });
    await expect(client().listOrders()).rejects.toThrow();
  });
});

// ── getUsage ──────────────────────────────────────────────────────────────────

describe('Cards402Client.getUsage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const USAGE = {
    api_key_id: 'key_1',
    label: 'my-agent',
    budget: { spent_usdc: '10.00', limit_usdc: '100.00', remaining_usdc: '90.00' },
    orders: { total: 3, delivered: 2, failed: 1, refunded: 0, in_progress: 0 },
  };

  it('returns usage summary', async () => {
    mockFetch(200, USAGE);
    const usage = await client().getUsage();
    expect(usage.budget.spent_usdc).toBe('10.00');
    expect(usage.orders.total).toBe(3);
    expect(usage.orders.delivered).toBe(2);
  });

  it('handles unlimited budget (null fields)', async () => {
    mockFetch(200, {
      ...USAGE,
      budget: { spent_usdc: '0.00', limit_usdc: null, remaining_usdc: null },
    });
    const usage = await client().getUsage();
    expect(usage.budget.limit_usdc).toBeNull();
    expect(usage.budget.remaining_usdc).toBeNull();
  });

  it('throws on error status', async () => {
    mockFetch(401, {});
    await expect(client().getUsage()).rejects.toThrow();
  });
});
