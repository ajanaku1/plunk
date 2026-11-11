'use client';

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FailoverRpcProvider, getTransactionLastResult, JsonRpcProvider } from 'near-api-js';
import { NearConnector, type EventMap } from '@hot-labs/near-connect';

import { networkId, rpcUrls } from '@/config';

type Wallet = Awaited<ReturnType<NearConnector['wallet']>>;
export type ViewParams = { contractId: string; method: string; args?: Record<string, unknown> };
export type CallParams = ViewParams & { gas?: string; deposit?: string };

export type Action = { method: string; args?: Record<string, unknown>; gas?: string; deposit?: string };
export type BatchParams = { contractId: string; actions: Action[] };

type NearContextValue = {
  loading: boolean;
  accountId: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  view: (p: ViewParams) => Promise<unknown>;
  call: (p: CallParams) => Promise<unknown>;
  /** Several function calls to one contract in a single signed transaction. */
  batch: (p: BatchParams) => Promise<unknown>;
  /** Several transactions (different contracts) signed in one wallet round-trip, sent in order. */
  batchMany: (txs: BatchParams[]) => Promise<void>;
  balance: (accountId: string) => Promise<bigint>;
  /** Hash of the last transaction this session signed, for explorer links in toasts. */
  lastTx: () => string | undefined;
};

const NearContext = createContext<NearContextValue | undefined>(undefined);
const DEFAULT_GAS = '30000000000000';

function toActions(actions: Action[]) {
  return actions.map(({ method, args = {}, gas = DEFAULT_GAS, deposit = '0' }) => ({
    type: 'FunctionCall' as const,
    params: { methodName: method, args, gas, deposit },
  }));
}

/** Restores a connected wallet and keeps `wallet`/`accountId` in sync with connector events. */
function useWalletSession(connector: NearConnector) {
  const [wallet, setWallet] = useState<Wallet | undefined>();
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const onSignIn = (p: Pick<EventMap['wallet:signIn'], 'wallet' | 'accounts'>) => {
      if (!live) return;
      setWallet(p.wallet);
      setAccountId(p.accounts[0]?.accountId ?? '');
    };
    const onSignOut = () => {
      if (!live) return;
      setWallet(undefined);
      setAccountId('');
    };
    connector.on('wallet:signIn', onSignIn);
    connector.on('wallet:signOut', onSignOut);
    connector
      .getConnectedWallet()
      .then(onSignIn)
      // Rejects when no wallet was connected before; that is the normal signed-out state.
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
      connector.off('wallet:signIn', onSignIn);
      connector.off('wallet:signOut', onSignOut);
    };
  }, [connector]);

  return { wallet, setWallet, accountId, setAccountId, loading };
}

export function NearProvider({ children }: PropsWithChildren) {
  const connector = useMemo(() => new NearConnector({ network: networkId, providers: rpcUrls }), []);
  // One URL gets a plain provider so RPC errors keep their message instead of "Exceeded 1 providers".
  const rpc = useMemo(() => {
    const providers = rpcUrls[networkId].map((url) => new JsonRpcProvider({ url }));
    return providers.length === 1 ? providers[0] : new FailoverRpcProvider(providers);
  }, []);
  const { wallet, setWallet, accountId, setAccountId, loading } = useWalletSession(connector);
  const txRef = useRef<string | undefined>(undefined);
  const lastTx = useCallback(() => txRef.current, []);

  const signIn = useCallback(async () => {
    const w = await connector.connect();
    setWallet(w);
    setAccountId((await w.getAccounts())[0]?.accountId ?? '');
  }, [connector, setWallet, setAccountId]);

  const signOut = useCallback(async () => {
    if (wallet) await connector.disconnect(wallet);
    setWallet(undefined);
    setAccountId('');
  }, [connector, wallet, setWallet, setAccountId]);

  const view = useCallback((p: ViewParams) => rpc.callFunction({ contractId: p.contractId, method: p.method, args: p.args ?? {} }), [rpc]);

  const batch = useCallback(
    async ({ contractId, actions }: BatchParams) => {
      if (!wallet) throw new Error('Connect a wallet first');
      const result = await wallet.signAndSendTransaction({ receiverId: contractId, actions: toActions(actions) });
      txRef.current = result.transaction?.hash;
      return getTransactionLastResult(result);
    },
    [wallet],
  );

  const batchMany = useCallback(
    async (txs: BatchParams[]) => {
      if (!wallet) throw new Error('Connect a wallet first');
      const results = await wallet.signAndSendTransactions({ transactions: txs.map((t) => ({ receiverId: t.contractId, actions: toActions(t.actions) })) });
      txRef.current = results[results.length - 1]?.transaction?.hash;
    },
    [wallet],
  );

  const call = useCallback(
    ({ contractId, method, args, gas, deposit }: CallParams) => batch({ contractId, actions: [{ method, args, gas, deposit }] }),
    [batch],
  );

  const balance = useCallback(async (id: string) => (await rpc.viewAccount({ accountId: id })).amount, [rpc]);

  const value = useMemo(
    () => ({ loading, accountId, signIn, signOut, view, call, batch, batchMany, balance, lastTx }),
    [loading, accountId, signIn, signOut, view, call, batch, batchMany, balance, lastTx],
  );
  return <NearContext.Provider value={value}>{children}</NearContext.Provider>;
}

export function useNear(): NearContextValue {
  const ctx = useContext(NearContext);
  if (!ctx) throw new Error('useNear must be used inside NearProvider');
  return ctx;
}
