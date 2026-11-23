import { afterEach, describe, expect, it, vi } from 'vitest';
import { artUri } from '@/lib/artdata';

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
