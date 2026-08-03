import { describe, expect, it } from 'vitest';
import {
  ALLOWED_RPC_METHODS,
  CASPER_RPC_RELAY_PATH,
  DEFAULT_CASPER_NODE_IPS,
  DEFAULT_RELAY_NODE_URL,
  clientKeyFromHeaders,
  createRateLimiter,
  normalizeNodeEntry,
  resolveAllowedOrigin,
  resolveRelayNodeUrls,
  shouldFailOver,
  validateRpcRequest,
} from './casper-rpc';

describe('normalizeNodeEntry', () => {
  it('wraps a bare IP as the conventional Casper RPC URL', () => {
    expect(normalizeNodeEntry('51.79.77.160')).toBe('http://51.79.77.160:7777/rpc');
  });

  it('passes through http and https URLs verbatim', () => {
    expect(normalizeNodeEntry(' https://node.cspr.cloud/rpc ')).toBe('https://node.cspr.cloud/rpc');
    expect(normalizeNodeEntry('http://10.0.0.5:7777/rpc')).toBe('http://10.0.0.5:7777/rpc');
  });

  it('rejects blanks and non-http schemes', () => {
    expect(normalizeNodeEntry('   ')).toBeNull();
    expect(normalizeNodeEntry('file:///etc/passwd')).toBeNull();
    expect(normalizeNodeEntry('ftp://node.example/rpc')).toBeNull();
  });
});

describe('resolveRelayNodeUrls', () => {
  it('serves the built-in 2.x pool when nothing is configured', () => {
    const urls = resolveRelayNodeUrls({});
    expect(urls[0]).toBe(`http://${DEFAULT_CASPER_NODE_IPS[0]}:7777/rpc`);
    expect(urls).toContain(DEFAULT_RELAY_NODE_URL);
  });

  it('puts operator endpoints first, in order', () => {
    const urls = resolveRelayNodeUrls({
      CASPER_NODE_RPC_URL: 'https://a.example/rpc, https://b.example/rpc',
    });
    expect(urls.slice(0, 2)).toEqual(['https://a.example/rpc', 'https://b.example/rpc']);
  });

  it('keeps submit-capable nodes behind an operator gateway that cannot submit', () => {
    // The exact production shape: the Tatum gateway from the .env examples
    // answers reads but has no account_put_transaction, so the pool must not
    // stop there or every payment strands.
    const urls = resolveRelayNodeUrls({
      CASPER_NODE_RPC_URL: DEFAULT_RELAY_NODE_URL,
    });
    expect(urls[0]).toBe(DEFAULT_RELAY_NODE_URL);
    expect(urls.length).toBeGreaterThan(1);
    expect(urls[1]).toBe(`http://${DEFAULT_CASPER_NODE_IPS[0]}:7777/rpc`);
  });

  it('lets CASPER_NODE_RPC_FALLBACK_IPS replace the built-in pool', () => {
    expect(
      resolveRelayNodeUrls({
        CASPER_NODE_RPC_URL: 'https://a.example/rpc',
        CASPER_NODE_RPC_FALLBACK_IPS: '1.2.3.4, https://a.example/rpc',
      }),
    ).toEqual(['https://a.example/rpc', 'http://1.2.3.4:7777/rpc', DEFAULT_RELAY_NODE_URL]);
  });

  it('honours CASPER_RPC_RELAY_DEFAULTS=0 for strict endpoint control', () => {
    expect(
      resolveRelayNodeUrls({
        CASPER_NODE_RPC_URL: 'https://a.example/rpc',
        CASPER_RPC_RELAY_DEFAULTS: '0',
      }),
    ).toEqual(['https://a.example/rpc', DEFAULT_RELAY_NODE_URL]);
  });

  it('never returns an empty pool when every entry is junk', () => {
    const urls = resolveRelayNodeUrls({
      CASPER_NODE_RPC_URL: 'file:///x, , ftp://y',
      CASPER_RPC_RELAY_DEFAULTS: '0',
    });
    expect(urls).toEqual([DEFAULT_RELAY_NODE_URL]);
  });
});

describe('shouldFailOver', () => {
  it('moves on when the endpoint does not implement the method', () => {
    expect(
      shouldFailOver(
        '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found: account_put_transaction"}}',
      ),
    ).toBe(true);
  });

  it('returns the node verdict for a real rejection', () => {
    expect(
      shouldFailOver(
        '{"jsonrpc":"2.0","id":1,"error":{"code":-32016,"message":"Invalid transaction"}}',
      ),
    ).toBe(false);
  });

  it('returns successful results untouched', () => {
    expect(shouldFailOver('{"jsonrpc":"2.0","id":1,"result":{"api_version":"2.0.0"}}')).toBe(false);
  });

  it('moves on when a 200 body is not JSON at all', () => {
    expect(shouldFailOver('<html>gateway error</html>')).toBe(true);
  });
});

describe('validateRpcRequest', () => {
  it('accepts the submit method the portal depends on', () => {
    expect(
      validateRpcRequest({ jsonrpc: '2.0', id: 1, method: 'account_put_transaction' }),
    ).toEqual({ ok: true, method: 'account_put_transaction' });
  });

  it('rejects batch requests so one call cannot fan out', () => {
    const result = validateRpcRequest([{ method: 'info_get_status' }]);
    expect(result).toMatchObject({ ok: false, code: 'batch_not_supported' });
  });

  it('rejects methods outside the allowlist', () => {
    expect(validateRpcRequest({ method: 'speculative_exec' })).toMatchObject({
      ok: false,
      code: 'method_not_allowed',
    });
  });

  it('rejects non-objects and missing methods', () => {
    expect(validateRpcRequest('account_put_deploy')).toMatchObject({ ok: false });
    expect(validateRpcRequest(null)).toMatchObject({ ok: false, code: 'invalid_body' });
    expect(validateRpcRequest({ id: 1 })).toMatchObject({ ok: false, code: 'invalid_method' });
  });

  it('allows every method it advertises', () => {
    for (const method of ALLOWED_RPC_METHODS) {
      expect(validateRpcRequest({ method })).toEqual({ ok: true, method });
    }
  });
});

describe('resolveAllowedOrigin', () => {
  it('defaults to * so the CSPR.click iframe can call the relay too', () => {
    expect(resolveAllowedOrigin({}, 'https://accounts.cspr.click')).toBe('*');
    expect(resolveAllowedOrigin({ CASPER_RPC_RELAY_ORIGINS: '*' }, null)).toBe('*');
  });

  it('echoes back only allowlisted origins when narrowed', () => {
    const env = { CASPER_RPC_RELAY_ORIGINS: 'https://cspr402.xyz, https://accounts.cspr.click' };
    expect(resolveAllowedOrigin(env, 'https://cspr402.xyz')).toBe('https://cspr402.xyz');
    expect(resolveAllowedOrigin(env, 'https://evil.example')).toBeNull();
    expect(resolveAllowedOrigin(env, null)).toBeNull();
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit inside a window, then blocks', () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 10)).toBe(true);
    expect(limiter.take('a', 20)).toBe(false);
  });

  it('keys buckets independently', () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('b', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
  });

  it('resets once the window rolls over', () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 999)).toBe(false);
    expect(limiter.take('a', 1000)).toBe(true);
  });
});

describe('clientKeyFromHeaders', () => {
  it('uses only the first X-Forwarded-For hop', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' });
    expect(clientKeyFromHeaders(headers)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip, then a constant', () => {
    expect(clientKeyFromHeaders(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientKeyFromHeaders(new Headers())).toBe('unknown');
  });
});

describe('CASPER_RPC_RELAY_PATH', () => {
  it('is same-origin — the whole point of the relay', () => {
    expect(CASPER_RPC_RELAY_PATH.startsWith('/')).toBe(true);
  });
});
