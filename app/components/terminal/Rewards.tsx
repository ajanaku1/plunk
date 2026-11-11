'use client';

import { useEffect, useState } from 'react';
import { messageOf } from '@/lib/errors';
import { formatCoinsM, formatNear } from '@/lib/format';
import { tgas } from '@/lib/gas';
import type { LaunchBox } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type Claimable = { near: string; coin: string };
type RewardsProps = { box: LaunchBox; refreshKey: unknown };

/** FR-018: what the connected holder has earned from fees and dev taxes, and the claim. */
export function Rewards({ box, refreshKey }: RewardsProps) {
  const { accountId, view, call, signIn } = useNear();
  const { notify } = useToast();
  const [c, setC] = useState<Claimable>({ near: '0', coin: '0' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bump, setBump] = useState(0);
  const ticker = box.meta.ticker.toUpperCase();

  useEffect(() => {
    if (!accountId) return;
    view({ contractId: box.coin_id, method: 'get_claimable', args: { account_id: accountId } })
      .then((v) => setC(v as Claimable))
      .catch(() => setC({ near: '0', coin: '0' }));
  }, [view, box.coin_id, accountId, refreshKey, bump]);

  const nothing = BigInt(c.near) === 0n && BigInt(c.coin) === 0n;
  const claim = async () => {
    if (!accountId) return void signIn().catch((e: unknown) => setError(messageOf(e)));
    setBusy(true);
    setError('');
    try {
      await call({ contractId: box.coin_id, method: 'claim', gas: tgas(60) });
      notify('Rewards claimed.');
      setBump((n) => n + 1);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card pad">
      <div className="h3"><span>Your rewards</span><span>hourly</span></div>
      {!accountId && <p className="fine" style={{ margin: 0 }}>Connect a wallet to see what holding has earned you.</p>}
      {accountId && (
        <div className="est">
          <div><span>NEAR from fees</span><b>{formatNear(c.near, 4)} Ⓝ</b></div>
          <div><span>${ticker} from dev taxes</span><b>{formatCoinsM(c.coin)}M</b></div>
        </div>
      )}
      <button className="cta ghost" type="button" disabled={busy || (!!accountId && nothing)} onClick={() => void claim()}>
        {!accountId ? 'Connect wallet' : busy ? 'Signing…' : nothing ? 'Nothing to claim yet' : 'Claim rewards'}
      </button>
      {error && <p className="err">{error}</p>}
      <p className="fine">Each hour pays out by your lowest balance during that hour. Coins bought this hour earn from the next one.</p>
    </section>
  );
}
