/**
 * RPC with fallback endpoints. near-api-js's FailoverRpcProvider retries every error, including
 * contract panics and "account does not exist", and replaces the message; this one moves to the
 * next endpoint only when the endpoint itself is down, so chain errors keep their meaning.
 */
import { JsonRpcProvider } from 'near-api-js';

export type Rpc = Pick<JsonRpcProvider, 'callFunction' | 'viewAccount'>;

const DOWN_STATUS = new Set([408, 429, 500, 502, 503, 504]);
/** Also matches near-api-js's errors for a reply that isn't NEAR RPC (e.g. a discontinued endpoint answering
 * 410 with a plain-string error): real RPC errors are structured and never parse to "Unknown RPC error". */
const NETWORK_FAILURE = /fetch failed|failed to fetch|fetcherror|networkerror|load failed|RetriesExceeded|must include either|unknown rpc error/i;
/** Per-endpoint retries when there is a fallback; near-api-js's default of 12 would delay the switch for minutes. */
const RETRIES_WITH_FALLBACK = 3;

/** True when the endpoint failed (HTTP 408/429/5xx or no response), not when the chain returned an error. */
export function isEndpointDown(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (typeof e.cause === 'number' && DOWN_STATUS.has(e.cause)) return true;
  const type = (e as { type?: unknown }).type;
  return NETWORK_FAILURE.test(`${e.name} ${e.message} ${typeof type === 'string' ? type : ''}`);
}

/** Tries each endpoint in turn, starting from the last one that worked. */
export function fallback(providers: Rpc[]): Rpc {
  let current = 0;
  async function run<T>(call: (p: Rpc) => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < providers.length; i++) {
      const idx = (current + i) % providers.length;
      try {
        const result = await call(providers[idx]);
        current = idx;
        return result;
      } catch (e) {
        if (!isEndpointDown(e)) throw e;
        last = e;
      }
    }
    throw last;
  }
  return {
    callFunction: ((params) => run((p) => p.callFunction(params))) as Rpc['callFunction'],
    viewAccount: (params) => run((p) => p.viewAccount(params)),
  };
}

export function makeRpc(urls: string[]): Rpc {
  if (urls.length === 1) return new JsonRpcProvider({ url: urls[0] });
  return fallback(urls.map((url) => new JsonRpcProvider({ url }, { retries: RETRIES_WITH_FALLBACK })));
}
