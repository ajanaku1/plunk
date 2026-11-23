import { afterEach, describe, expect, it, vi } from 'vitest';
import { artUri, gatewayHost } from '@/lib/artdata';

const reply = (type: string, bytes = 4, ok = true) => ({ ok, headers: { get: () => type }, arrayBuffer: async () => new ArrayBuffer(bytes) });

afterEach(() => vi.unstubAllGlobals());

describe('artUri', () => {
  it('passes small image data URIs through', async () => {
    const u = 'data:image/png;base64,AAAA';
    expect(await artUri(u)).toBe(u);
  });
  it('refuses plain http, other schemes and script data', async () => {
    expect(await artUri('http://x.test/a.png')).toBeNull();
    expect(await artUri('javascript:alert(1)')).toBeNull();
    expect(await artUri('data:text/html;base64,AAAA')).toBeNull();
  });
  it('fetches an https picture into a data URI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('image/png; charset=x')));
    expect(await artUri('https://x.test/a.png')).toMatch(/^data:image\/png;base64,/);
  });
  it('returns null for a wrong type, a big file, a bad status or a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('text/html')));
    expect(await artUri('https://x.test/a')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply('image/png', 2_000_000)));
    expect(await artUri('https://x.test/a')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply('image/png', 4, false)));
    expect(await artUri('https://x.test/a')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await artUri('https://x.test/a')).toBeNull();
  });
});

describe('artUri on our server', () => {
  it('never follows a redirect', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => reply('image/png'));
    vi.stubGlobal('fetch', f);
    await artUri('https://x.test/a.png');
    expect(f.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });
  it('fetches only from the allowed host when one is given', async () => {
    const f = vi.fn(async () => reply('image/png'));
    vi.stubGlobal('fetch', f);
    expect(await artUri('https://evil.test/a.png', 'gw.mypinata.cloud')).toBeNull();
    expect(await artUri('https://gw.mypinata.cloud.evil.test/a.png', 'gw.mypinata.cloud')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await artUri('https://GW.mypinata.cloud/ipfs/x', 'gw.mypinata.cloud')).toMatch(/^data:image\/png/);
  });
  it('rejects on a declared size over 1 MB without reading the body', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(4));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: { get: (k: string) => (k === 'content-length' ? '5000000' : 'image/png') }, arrayBuffer })));
    expect(await artUri('https://x.test/a.png')).toBeNull();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it('stops reading a streamed body that passes 1 MB', async () => {
    const big = new Response(new Uint8Array(1_200_000), { headers: { 'content-type': 'image/png' } });
    big.headers.delete('content-length');
    vi.stubGlobal('fetch', vi.fn(async () => big));
    expect(await artUri('https://x.test/a.png')).toBeNull();
    const small = new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    vi.stubGlobal('fetch', vi.fn(async () => small));
    expect(await artUri('https://x.test/a.png')).toBe('data:image/png;base64,AQID');
  });
});

describe('gatewayHost', () => {
  it('reduces the configured gateway to a bare host', () => {
    expect(gatewayHost('https://GW.mypinata.cloud/')).toBe('gw.mypinata.cloud');
    expect(gatewayHost('gw.mypinata.cloud')).toBe('gw.mypinata.cloud');
    expect(gatewayHost(undefined)).toBeUndefined();
    expect(gatewayHost('')).toBeUndefined();
  });
});
