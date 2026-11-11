import { describe, expect, it } from 'vitest';
import { checkFile, type Deps, gatewayUrl, handleUpload, MAX_BYTES } from './handler';

const png = (size = 10) => new File([new Uint8Array(size)], 'a.png', { type: 'image/png' });

function deps(over: Partial<Deps> = {}): Deps & { forms: FormData[] } {
  const forms: FormData[] = [];
  return {
    forms,
    jwt: 'jwt',
    gateway: 'example-gateway.mypinata.cloud',
    pin: async (form) => {
      forms.push(form);
      return { status: 200, json: { data: { cid: 'bafyCID' } } };
    },
    ...over,
  };
}

function formWith(file: File | string): FormData {
  const f = new FormData();
  f.set('file', file);
  return f;
}

describe('box art upload', () => {
  it('accepts only small images', () => {
    expect(checkFile(png())).toBeInstanceOf(File);
    expect(checkFile('x')).toMatch(/"file"/);
    expect(checkFile(new File([new Uint8Array(5)], 'a.svg', { type: 'image/svg+xml' }))).toMatch(/PNG/);
    expect(checkFile(png(MAX_BYTES + 1))).toMatch(/1 MB/);
    expect(checkFile(png(0))).toMatch(/empty/);
  });

  it('builds a gateway url from host or origin', () => {
    expect(gatewayUrl('https://g.mypinata.cloud/', 'bafy')).toBe('https://g.mypinata.cloud/ipfs/bafy');
    expect(gatewayUrl('g.mypinata.cloud', 'bafy')).toBe('https://g.mypinata.cloud/ipfs/bafy');
  });

  it('pins to the public network and returns the gateway url', async () => {
    const d = deps();
    const r = await handleUpload(formWith(png()), d);
    expect(r).toEqual({ status: 200, body: { url: 'https://example-gateway.mypinata.cloud/ipfs/bafyCID' } });
    expect(d.forms[0].get('network')).toBe('public');
    expect(d.forms[0].get('file')).toBeInstanceOf(File);
  });

  it('fails closed without configuration or when pinata refuses', async () => {
    expect((await handleUpload(formWith(png()), deps({ jwt: undefined }))).status).toBe(503);
    expect((await handleUpload(formWith('nope'), deps())).status).toBe(400);
    expect((await handleUpload(formWith(png()), deps({ pin: async () => ({ status: 401, json: { error: 'x' } }) }))).status).toBe(502);
    expect((await handleUpload(null, deps())).status).toBe(400);
  });
});
