'use client';

import { Peek } from '@/components/Peek';
import { messageOf } from '@/lib/errors';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="gutter in" style={{ paddingBlock: 64 }}>
      <div className="card pad" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
        <Peek state="failed" size={64} />
        <h1 style={{ margin: 0, fontSize: 22 }}>Something went wrong on this page.</h1>
        <p className="fine" style={{ margin: 0 }}>{messageOf(error)}</p>
        <button className="cta" type="button" onClick={reset} style={{ width: 'auto', padding: '0 24px' }}>Try again</button>
        <p className="fine" style={{ margin: 0 }}>Your funds are on chain, not in this page. Nothing here can lose them.</p>
      </div>
    </div>
  );
}
