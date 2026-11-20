/**
 * Stuck-box checks for the watch job. Pure, so they can be tested: each returns a line a human can
 * act on. Thresholds are generous; the hourly run should stay quiet unless something needs a person.
 */
export const REVEAL_NS = 60_000_000_000;
const MIN_NS = 60_000_000_000;
const EPOCH_NS = 3_600_000_000_000;
/** A closed room nobody opened: `open` is permissionless but only the app's visitors call it. */
export const UNOPENED_AFTER_NS = 10 * MIN_NS;
/** Pool setup normally takes seconds; after this someone must call `retry_open`. */
export const OPENING_AFTER_NS = 30 * MIN_NS;
/** The keeper harvests hourly, so this many missed epochs means it is failing. */
export const STALE_EPOCHS = 3;

export type WatchedBox = { id: number; phase: string; close_at: number; open_at: number; sealed_count: number; last_harvest_epoch: number };

function minutes(ns: number): number {
  return Math.floor(ns / MIN_NS);
}

/** The problem with one box right now, or null. */
export function problem(b: WatchedBox, nowNs: number): string | null {
  if (b.phase === 'Bidding') {
    const late = nowNs - (b.close_at + (b.sealed_count > 0 ? REVEAL_NS : 0));
    return late > UNOPENED_AFTER_NS ? `box ${b.id}: closed ${minutes(late)} min ago and nobody has called open` : null;
  }
  if (b.phase === 'Opening') {
    const late = nowNs - b.close_at;
    return late > OPENING_AFTER_NS ? `box ${b.id}: opening for ${minutes(late)} min, call retry_open` : null;
  }
  if (b.phase === 'Open') {
    const last = b.last_harvest_epoch || Math.floor(b.open_at / EPOCH_NS);
    const missed = Math.floor(nowNs / EPOCH_NS) - last;
    return missed > STALE_EPOCHS ? `box ${b.id}: no harvest for ${missed} hours` : null;
  }
  return null;
}

export function problems(boxes: WatchedBox[], nowNs: number): string[] {
  return boxes.map((b) => problem(b, nowNs)).filter((p): p is string => p !== null);
}
