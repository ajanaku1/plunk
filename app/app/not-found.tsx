import Link from 'next/link';
import { Peek } from '@/components/Peek';

export default function NotFound() {
  return (
    <div className="gutter in" style={{ paddingBlock: 64 }}>
      <div className="card pad" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
        <Peek state="failed" size={64} />
        <h1 style={{ margin: 0, fontSize: 22 }}>Nothing in this box.</h1>
        <p className="fine" style={{ margin: 0 }}>That page does not exist, or the box id was mistyped.</p>
        <Link className="cta" href="/" style={{ display: 'grid', placeItems: 'center', width: 'auto', padding: '0 24px' }}>Back to the boxes</Link>
      </div>
    </div>
  );
}
