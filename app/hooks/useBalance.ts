'use client';

import { useEffect, useState } from 'react';
import { useNear } from '@/providers/near-provider';

/** Keep this much NEAR back for gas and storage when offering "max". */
export const GAS_RESERVE = 10n ** 23n;

/** Native NEAR balance of an account, refreshed when `key` changes. */
export function useBalance(accountId: string, key?: unknown): bigint | undefined {
  const { balance } = useNear();
  const [value, setValue] = useState<bigint>();
  useEffect(() => {
    if (!accountId) return setValue(undefined);
    balance(accountId)
      .then(setValue)
      .catch(() => setValue(undefined));
  }, [accountId, balance, key]);
  return value;
}
