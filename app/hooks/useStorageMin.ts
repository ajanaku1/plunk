'use client';

import { useEffect, useState } from 'react';
import { STORAGE_DEPOSIT } from '@/lib/gas';
import { useNear } from '@/providers/near-provider';

type Bounds = { min: string; max: string | null };
const cache = new Map<string, Promise<string>>();

/** NEP-145 registration cost of a token, in yocto. Plunk coins need more than wNEAR's 0.00125 NEAR because they also store reward state. */
export function fetchStorageMin(view: (p: { contractId: string; method: string; args?: Record<string, unknown> }) => Promise<unknown>, tokenId: string): Promise<string> {
  let p = cache.get(tokenId);
  if (!p) {
    p = view({ contractId: tokenId, method: 'storage_balance_bounds' })
      .then((b) => (b as Bounds).min)
      .catch(() => {
        cache.delete(tokenId);
        return STORAGE_DEPOSIT;
      });
    cache.set(tokenId, p);
  }
  return p;
}

export function useStorageMin(tokenId: string | undefined): string {
  const { view } = useNear();
  const [min, setMin] = useState(STORAGE_DEPOSIT);
  useEffect(() => {
    if (!tokenId) return;
    fetchStorageMin(view, tokenId).then(setMin).catch(() => setMin(STORAGE_DEPOSIT));
  }, [view, tokenId]);
  return min;
}
