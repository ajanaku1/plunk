import type { BoxState } from '@/lib/launchpad';

type PeekProps = { state?: BoxState; size?: number; tile?: boolean; className?: string };

/** The Peek mark (brand/marks/peek.svg). `state` drives the lid and eyes per BRAND-TRUTH's state map. */
export function Peek({ state, size = 28, tile = false, className }: PeekProps) {
  return (
    <svg className={['mascot', className].filter(Boolean).join(' ')} data-state={state} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {tile && <rect width="64" height="64" rx="14" fill="var(--paper)" />}
      <g transform={tile ? 'translate(0 2)' : undefined}>
        <rect x="10" y="28" width="44" height="28" rx="5" fill="var(--green)" />
        <rect x="13" y="20" width="38" height="11" fill="var(--black)" />
        <g className="m-eyes">
          <circle className="m-eye" cx="25" cy="25" r="3" fill="var(--purple)" />
          <circle className="m-eye" cx="39" cy="25" r="3" fill="var(--purple)" />
        </g>
        <rect className="m-lid" x="6" y="9" width="52" height="10" rx="3" fill="var(--green)" />
      </g>
    </svg>
  );
}
