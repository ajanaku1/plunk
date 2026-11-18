import { describe, expect, it, vi } from 'vitest';
import { fallback, isEndpointDown, type Rpc } from './rpc';

const down = () => new Error('https://a.example unavailable', { cause: 503 });
const contractPanic = () => new Error('Smart contract panicked: no such box');

function fake(call: () => Promise<unknown>): Rpc & { calls: () => number } {
  const fn = vi.fn(call);
  return {
    callFunction: fn as unknown as Rpc['callFunction'],
    viewAccount: fn as unknown as Rpc['viewAccount'],
    calls: () => fn.mock.calls.length,
  };
}

describe('isEndpointDown', () => {
  it('treats HTTP 408/429/5xx and network failures as down', () => {
    expect(isEndpointDown(down())).toBe(true);
    expect(isEndpointDown(new Error('rate limited', { cause: 429 }))).toBe(true);
    expect(isEndpointDown(new TypeError('fetch failed'))).toBe(true);
    expect(isEndpointDown(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('treats a non-RPC reply (a discontinued endpoint) as down', () => {
    expect(isEndpointDown(new Error('JSON RPC response must include either "result", or "error" property'))).toBe(true);
    expect(isEndpointDown(new Error('Unknown RPC error'))).toBe(true);
  });
  it('does not treat chain errors as down', () => {
    expect(isEndpointDown(contractPanic())).toBe(false);
    expect(isEndpointDown(new Error('account plunk.testnet does not exist'))).toBe(false);
    expect(isEndpointDown('nope')).toBe(false);
  });
});

describe('fallback', () => {
  const args = { contractId: 'plunk.testnet', method: 'get_box', args: { id: 0 } };

  it('moves to the next endpoint when one is down', async () => {
    const a = fake(() => Promise.reject(down()));
    const b = fake(() => Promise.resolve('box'));
    expect(await fallback([a, b]).callFunction(args)).toBe('box');
  });

  it('passes chain errors through without trying another endpoint', async () => {
    const a = fake(() => Promise.reject(contractPanic()));
    const b = fake(() => Promise.resolve('box'));
    await expect(fallback([a, b]).callFunction(args)).rejects.toThrow('no such box');
    expect(b.calls()).toBe(0);
  });

  it('throws the last endpoint error when all are down', async () => {
    const a = fake(() => Promise.reject(down()));
    const b = fake(() => Promise.reject(new TypeError('fetch failed')));
    await expect(fallback([a, b]).viewAccount({ accountId: 'x.testnet' })).rejects.toThrow('fetch failed');
  });

  it('keeps using the endpoint that worked', async () => {
    const a = fake(() => Promise.reject(down()));
    const b = fake(() => Promise.resolve('box'));
    const rpc = fallback([a, b]);
    await rpc.callFunction(args);
    await rpc.callFunction(args);
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(2);
  });
});
