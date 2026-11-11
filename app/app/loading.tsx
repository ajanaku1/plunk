export default function Loading() {
  return (
    <div className="gutter in" style={{ paddingBlock: 20, display: 'grid', gap: 16 }} aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ minHeight: 140 }} />
      <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>
    </div>
  );
}
