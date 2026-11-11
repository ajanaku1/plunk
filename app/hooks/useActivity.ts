'use client';

import { useEffect, useState } from 'react';
import { networkId } from '@/config';
import { toNumber } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';

export type Sample = { time: number; value: number };

const MAX_SAMPLES = 600;

function key(id: number): string {
  return `plunk:activity:${networkId}:${id}`;
}

function load(id: number): Sample[] {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as Sample[]) : [];
  } catch {
    return [];
  }
}

function save(id: number, samples: Sample[]): void {
  try {
    localStorage.setItem(key(id), JSON.stringify(samples.slice(-MAX_SAMPLES)));
  } catch {
    // storage unavailable: the chart just does not persist across reloads
  }
}

/**
 * Total NEAR in the box over time, sampled while this page is open (there is no on-chain history view).
 * Always starts at the box's opening second with 0, so the line is honest about what it knows.
 */
export function useActivity(box: LaunchBox | null | undefined): Sample[] {
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => {
    if (!box) return;
    const start = { time: Math.floor(box.close_at / 1e9) - box.room_secs, value: 0 };
    const now = { time: Math.floor(Date.now() / 1000), value: toNumber(box.total_in) };
    setSamples((prev) => {
      const base = prev.length ? prev : [start, ...load(box.id).filter((s) => s.time > start.time)];
      const last = base[base.length - 1];
      const next = last && last.time >= now.time ? base : [...base, now];
      save(box.id, next);
      return next;
    });
  }, [box]);
  return samples;
}
