/**
 * Image upload for box art: checks the file, pins it to public IPFS through Pinata's v3 Files API
 * and returns a gateway URL the contract stores in `meta.image`. Pure of Next plumbing so it is testable.
 */

export const MAX_BYTES = 1_048_576;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export const PINATA_UPLOAD = 'https://uploads.pinata.cloud/v3/files';

export type Deps = {
  /** PINATA_JWT: a key scoped to org:files:write. */
  jwt: string | undefined;
  /** PINATA_GATEWAY: the account's gateway host, e.g. example-gateway.mypinata.cloud. */
  gateway: string | undefined;
  pin: (form: FormData, jwt: string) => Promise<{ status: number; json: unknown }>;
};

export type Reply = { status: number; body: { url: string } | { error: string } };

const bad = (error: string, status = 400): Reply => ({ status, body: { error } });

export function checkFile(file: unknown): File | string {
  if (!(file instanceof File)) return 'send the image as the "file" field';
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'PNG, JPG, GIF or WebP only';
  if (file.size === 0) return 'the file is empty';
  if (file.size > MAX_BYTES) return 'images are capped at 1 MB';
  return file;
}

export function gatewayUrl(gateway: string, cid: string): string {
  return `https://${gateway.replace(/^https?:\/\//, '').replace(/\/$/, '')}/ipfs/${cid}`;
}

export async function handleUpload(form: FormData | null, d: Deps): Promise<Reply> {
  if (!d.jwt || !d.gateway) return bad('image uploads are not configured on this server', 503);
  const file = checkFile(form?.get('file'));
  if (typeof file === 'string') return bad(file);
  const out = new FormData();
  out.set('file', file, file.name || 'box-art');
  out.set('network', 'public');
  out.set('name', `plunk-${Date.now()}`);
  const r = await d.pin(out, d.jwt);
  const cid = (r.json as { data?: { cid?: unknown } } | null)?.data?.cid;
  if (r.status >= 300 || typeof cid !== 'string') return bad('the image host refused the upload', 502);
  return { status: 200, body: { url: gatewayUrl(d.gateway, cid) } };
}

export async function pinToPinata(form: FormData, jwt: string): Promise<{ status: number; json: unknown }> {
  const r = await fetch(PINATA_UPLOAD, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form });
  return { status: r.status, json: await r.json().catch(() => null) };
}
