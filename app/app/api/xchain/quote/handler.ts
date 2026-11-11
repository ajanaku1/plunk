/**
 * The quote proxy's logic, separated from Next's request plumbing so it can be tested with fakes.
 * Checks (FR-027): the box is still bidding and more than 5 minutes from close, and the NEAR
 * account that will receive the coins exists. Then forwards the quote to 1Click.
 */
import type { LaunchBox } from '@/lib/launchpad';
import { beforeCutoff, ONE_CLICK, type Quote, type QuoteBody, type QuoteInput, quoteBody, validAccountId } from '@/lib/xchain';

export type Deps = {
  launchpadId: string;
  wnear: string;
  getBox: (id: number) => Promise<LaunchBox | null>;
  accountExists: (id: string) => Promise<boolean>;
  oneClick: (body: QuoteBody) => Promise<{ status: number; json: unknown }>;
  now: () => number;
};

export type Reply = { status: number; body: unknown };

const bad = (message: string, status = 400): Reply => ({ status, body: { error: message } });

export function parseInput(raw: unknown): QuoteInput | string {
  if (!raw || typeof raw !== 'object') return 'body must be JSON';
  const r = raw as Record<string, unknown>;
  const boxId = Number(r.boxId);
  if (!Number.isInteger(boxId) || boxId < 0) return 'boxId must be a non-negative integer';
  for (const k of ['originAsset', 'amount', 'refundTo', 'recipient'] as const) {
    if (typeof r[k] !== 'string' || !(r[k] as string).trim()) return `${k} is required`;
  }
  if (!/^\d+$/.test(r.amount as string)) return 'amount must be in smallest units';
  if (!validAccountId(r.recipient as string)) return 'recipient must be a NEAR account id';
  return { boxId, originAsset: r.originAsset as string, amount: r.amount as string, refundTo: r.refundTo as string, recipient: r.recipient as string, dry: r.dry === true };
}

export async function handleQuote(raw: unknown, d: Deps): Promise<Reply> {
  const input = parseInput(raw);
  if (typeof input === 'string') return bad(input);
  const box = await d.getBox(input.boxId);
  if (!box) return bad('no such box', 404);
  if (box.phase !== 'Bidding') return bad('box is not taking bids');
  const now = d.now();
  if (!beforeCutoff(box.close_at, now)) return bad('cross-chain quotes stop 5 minutes before close');
  if (!(await d.accountExists(input.recipient))) return bad(`${input.recipient} does not exist on NEAR; coins need an existing account`);
  const body = quoteBody(input, d.launchpadId, d.wnear, box.close_at, now);
  const r = await d.oneClick(body);
  if (r.status !== 200 && r.status !== 201) return { status: 502, body: { error: '1Click rejected the quote', detail: r.json } };
  const j = r.json as { quote?: Quote };
  return { status: 200, body: { quote: j.quote ?? null, request: body, raw: j } };
}

export async function postOneClick(body: QuoteBody): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`${ONE_CLICK}/v0/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
