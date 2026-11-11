import { explorerTx } from '@/config';

/** An explorer link for a toast, or nothing when the wallet did not report a hash. */
export function txLink(hash: string | undefined): { href: string; label: string } | undefined {
  return hash ? { href: explorerTx(hash), label: 'View transaction' } : undefined;
}
