'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BoxCard } from '@/components/home/BoxCard';
import { Hero } from '@/components/home/Hero';
import { HowItWorks, matchesQuery, type Sort, SORT_LABEL, SORTS, sortBoxes, StatsStrip } from '@/components/home/HomeExtras';
import { launchpadId } from '@/config';
import { useBoxes } from '@/hooks/useBoxes';
import { type BoxState, stateOf } from '@/lib/launchpad';

const FILTERS = ['all', 'live', 'open', 'failed'] as const;
type Filter = (typeof FILTERS)[number];

function matches(f: Filter, s: BoxState): boolean {
  if (f === 'all') return true;
  if (f === 'live') return s === 'bidding' || s === 'reveal' || s === 'opening';
  return f === s;
}

export function Home() {
  const { boxes, error, loaded, nowNs } = useBoxes();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const shown = sortBoxes(boxes.filter((b) => matches(filter, stateOf(b, nowNs)) && matchesQuery(b, query)), sort, nowNs);
  return (
    <>
      <Hero boxes={boxes} nowNs={nowNs} loaded={loaded} />
      <div className="gutter in" style={{ paddingBlock: 20, display: 'grid', gap: 20 }}>
        <StatsStrip boxes={boxes} nowNs={nowNs} />
        {loaded && boxes.length < 6 && <HowItWorks />}
        <div>
        <div className="h3"><span>Boxes</span><span>{boxes.length} on {launchpadId}</span></div>
        <div className="toolbar">
          <div className="filters" role="group" aria-label="Filter boxes">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <div className="input search"><input type="search" value={query} placeholder="Search name, $ticker, dev or #id" aria-label="Search boxes" onChange={(e) => setQuery(e.target.value)} /></div>
          <select className="sort" value={sort} aria-label="Sort boxes" onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </div>
        {!loaded && <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>}
        {error && <p className="err">Could not list boxes: {error}</p>}
        {loaded && !error && boxes.length === 0 && <div className="notice">Nothing yet. The first box is yours to make.</div>}
        {loaded && boxes.length > 0 && shown.length === 0 && <div className="notice">{query ? `Nothing matches “${query}”.` : `No ${filter} boxes right now.`}</div>}
        <div className="grid">{shown.map((b) => <BoxCard key={b.id} box={b} nowNs={nowNs} />)}</div>
        </div>
      </div>
    </>
  );
}
