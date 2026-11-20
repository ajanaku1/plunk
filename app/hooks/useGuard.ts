'use client';

import { useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import type { Guard } from '@/lib/guard';
import { useNear } from '@/providers/near-provider';

let cached: Promise<Guard> | undefined;

/** The launchpad's safety switches, fetched once per page load. Undefined while loading or on a launchpad without them. */
export function useGuard(): Guard | undefined {
  const { view } = useNear();
  const [guard, setGuard] = useState<Guard>();
  useEffect(() => {
    cached ??= view({ contractId: launchpadId, method: 'get_guard' }) as Promise<Guard>;
    cached.then(setGuard).catch(() => {
      cached = undefined;
    });
  }, [view]);
  return guard;
}
