const ART_TYPES = /^image\/(png|jpeg|gif)$/;
const MAX_ART = 1_000_000;

/** The response body, or null once it passes `max` bytes. Stops reading there instead of buffering the rest. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > max ? null : buf;
  }
  const reader = res.body.getReader();
  const out = new Uint8Array(max);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out.subarray(0, size);
    if (size + value.byteLength > max) {
      await reader.cancel();
      return null;
    }
    out.set(value, size);
    size += value.byteLength;
  }
}

/** `PINATA_GATEWAY` as a bare host, the form `gatewayUrl` in the upload handler builds links from. */
export function gatewayHost(gateway: string | undefined): string | undefined {
  return gateway?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase() || undefined;
}

/**
 * A coin's picture as a data URI for the share card, or null when it is missing, too big, the wrong type, or slow.
 * A card must never fail over a picture. The URL is whatever the box creator typed and this runs on our server, so:
 * https only, no redirects, at most 1 MB read, and when `onlyHost` is given (our upload gateway) no other host.
 */
export async function artUri(url: string, onlyHost?: string): Promise<string | null> {
  try {
    if (/^data:image\/(png|jpeg|svg\+xml)[;,]/.test(url)) return url.length < 300_000 ? url : null;
    if (!/^https:\/\//.test(url)) return null;
    if (onlyHost && new URL(url).host.toLowerCase() !== onlyHost) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    const type = (res.headers.get('content-type') ?? '').split(';')[0];
    if (!res.ok || !ART_TYPES.test(type)) return null;
    if (Number(res.headers.get('content-length')) > MAX_ART) return null;
    const bytes = await readCapped(res, MAX_ART);
    return bytes && `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}
