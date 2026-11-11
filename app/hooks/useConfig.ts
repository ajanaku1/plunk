'use client';

import { useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import { messageOf } from '@/lib/errors';
import type { Config } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';

let cached: Promise<Config> | undefined;

/** The launchpad's config (fee, floor, wNEAR account), fetched once per page load. */
export function useConfig(): { config: Config | undefined; error: string } {
  const { view } = useNear();
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState('');
  useEffect(() => {
    cached ??= view({ contractId: launchpadId, method: 'get_config' }) as Promise<Config>;
    cached.then(setConfig).catch((e: unknown) => {
      cached = undefined;
      setError(messageOf(e));
    });
  }, [view]);
  return { config, error };
}
