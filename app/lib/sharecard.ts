import { priceText } from '@/lib/board';
import { formatNear, pricePerMillion } from '@/lib/format';
import { type BoxState, type LaunchBox } from '@/lib/launchpad';

export type CardCopy = { kicker: string; label: string; value: string; sub: string; tone: 'live' | 'open' | 'failed' };

/**
 * The words on a box's share card. A card is cached by whoever receives the link, so it carries only what does not
 * go stale: the state's name, the minimum raise, the final clearing price. No countdown, no running total.
 */
export function cardCopy(box: LaunchBox, state: BoxState): CardCopy {
  if (state === 'open' && box.opening) {
    return { kicker: 'OPEN', label: 'Cleared at', value: `${priceText(pricePerMillion(box.opening.price))} Ⓝ per 1M`, sub: 'Everyone paid this one price.', tone: 'open' };
  }
  if (state === 'failed') {
    return { kicker: 'REFUNDED', label: 'Minimum not reached', value: `${formatNear(box.min_raise, 0)} Ⓝ needed`, sub: 'Every bid was refunded in full.', tone: 'failed' };
  }
  const kicker = state === 'bidding' ? 'BIDDING' : state === 'reveal' ? 'REVEALING' : 'OPENING';
  return { kicker, label: 'Minimum raise', value: `${formatNear(box.min_raise, 0)} Ⓝ`, sub: 'The price stays sealed until the box opens.', tone: 'live' };
}
