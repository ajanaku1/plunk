'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ActivityRail } from '@/components/home/ActivityRail';
import { BoardRows } from '@/components/home/BoardRows';
import { Hero } from '@/components/home/Hero';
import { OpenedGrid } from '@/components/home/OpenedGrid';
import { HowItWorks, matchesQuery, type Sort, SORT_LABEL, SORTS, sortBoxes, StatsStrip } from '@/components/home/HomeExtras';
import { launchpadId } from '@/config';
import { useBoxes } from '@/hooks/useBoxes';
import { useTape } from '@/hooks/useTape';
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
  const tape = useTape();
  const spots: Record<number, number> = {};
  for (const it of tape) if (it.spot) spots[it.id] = it.spot;
  const shown = sortBoxes(boxes.filter((b) => matches(filter, stateOf(b, nowNs)) && matchesQuery(b, query)), sort, nowNs);
  return (
    <>
      <Hero boxes={boxes} nowNs={nowNs} loaded={loaded} />
      <div className="gutter in bd-wrap">
        <div className="bd-main">
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
          {shown.length > 0 && <BoardRows boxes={shown} nowNs={nowNs} spots={spots} />}
          <OpenedGrid boxes={boxes} nowNs={nowNs} spots={spots} />
          {loaded && boxes.length < 6 && <HowItWorks />}
        </div>
        <aside className="bd-rail">
          <ActivityRail items={tape} />
          <div className="card pad bd-glance"><h2>At a glance</h2><StatsStrip boxes={boxes} nowNs={nowNs} /></div>
        </aside>
      </div>
    </>
  );
}
