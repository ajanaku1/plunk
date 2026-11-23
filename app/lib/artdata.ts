const ART_TYPES = /^image\/(png|jpeg|gif)$/;
const MAX_ART = 1_000_000;

/** A coin's picture as a data URI for the share card, or null when it is missing, too big, the wrong type, or slow. A card must never fail over a picture. */
export async function artUri(url: string): Promise<string | null> {
  try {
    if (/^data:image\/(png|jpeg|svg\+xml)[;,]/.test(url)) return url.length < 300_000 ? url : null;
    if (!/^https:\/\//.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0];
    if (!res.ok || !ART_TYPES.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_ART) return null;
    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  }
}
