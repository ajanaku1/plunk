'use client';

import { useState } from 'react';
import { launchpadId } from '@/config';
import { messageOf } from '@/lib/errors';
import { tgas } from '@/lib/gas';
import type { LaunchBox } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

/** The one place that opens a box or carries the opening on. Used by the Opening panel and the stage. */
export function useOpenBox(box: LaunchBox, onStep: () => Promise<void>) {
  const { accountId, signIn, call } = useNear();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = box.phase === 'Opening';

  const nudge = async () => {
    setError('');
    if (!accountId) return void signIn().catch((e: unknown) => setError(messageOf(e)));
    setBusy(true);
    try {
      await call({ contractId: launchpadId, method: started ? 'retry_open' : 'open', args: { box_id: box.id }, gas: tgas(300) });
      await onStep();
      notify(started ? 'Nudged. If the box is still Opening, nudge again: each nudge runs one or two steps.' : 'Opening started. Nudge until all four steps are done.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const label = !accountId ? 'Connect wallet' : busy ? 'Signing…' : started ? 'Nudge it along' : 'Open the box';
  return { nudge, busy, error, label, started };
}
