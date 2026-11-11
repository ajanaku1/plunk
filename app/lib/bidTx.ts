/**
 * A bid is one signed transaction to wNEAR: register storage if needed, wrap the NEAR, then
 * `ft_transfer_call` it to the launchpad with the bid msg (contracts/launchpad.md).
 */
import { launchpadId } from '@/config';
import { STORAGE_DEPOSIT, tgas } from '@/lib/gas';
import type { Config } from '@/lib/launchpad';
import type { SealedBidMsg } from '@/lib/sealed';
import type { Action, ViewParams } from '@/providers/near-provider';

export type MarketBidMsg = { box_id: number; kind: 'market' };
export type BidMsg = MarketBidMsg | SealedBidMsg;

type StorageBalance = { total: string; available: string } | null;

export type BidTxInput = {
  config: Config;
  accountId: string;
  amount: bigint;
  msg: BidMsg;
  view: (p: ViewParams) => Promise<unknown>;
};

export async function bidActions({ config, accountId, amount, msg, view }: BidTxInput): Promise<Action[]> {
  const storage = (await view({ contractId: config.wnear, method: 'storage_balance_of', args: { account_id: accountId } })) as StorageBalance;
  const actions: Action[] = [];
  if (!storage) {
    actions.push({ method: 'storage_deposit', args: { account_id: accountId, registration_only: true }, deposit: STORAGE_DEPOSIT, gas: tgas(10) });
  }
  actions.push({ method: 'near_deposit', deposit: amount.toString(), gas: tgas(10) });
  actions.push({
    method: 'ft_transfer_call',
    args: { receiver_id: launchpadId, amount: amount.toString(), msg: JSON.stringify(msg) },
    deposit: '1',
    gas: tgas(100),
  });
  return actions;
}
