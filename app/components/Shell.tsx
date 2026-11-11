'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Peek } from '@/components/Peek';
import { Tape } from '@/components/Tape';
import { explorerAccount, launchpadId, networkId } from '@/config';
import { useBalance } from '@/hooks/useBalance';
import { formatNear } from '@/lib/format';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

const ICONS = {
  boxes: 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v7H4zM13 14h7v7h-7z',
  make: 'M12 5v14M5 12h14',
  docs: 'M5 4h10l4 4v12H5zM15 4v4h4M8 13h8M8 17h8',
  sun: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  collapse: 'M15 5l-7 7 7 7',
  expand: 'M9 5l7 7-7 7',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 7V6a2 2 0 0 1 2-2h11M16 13h4',
} as const;

const NAV = [
  { href: '/', label: 'Boxes', icon: ICONS.boxes },
  { href: '/make', label: 'Make a box', icon: ICONS.make },
  { href: '/docs', label: 'Docs', icon: ICONS.docs },
];

type Theme = 'dark' | 'light';
const THEME_KEY = 'plunk-theme';
const RAIL_KEY = 'plunk-rail';

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode or blocked storage: the choice lasts for this page only
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function NavLinks({ path }: { path: string }) {
  return (
    <>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} title={n.label} aria-current={path === n.href || (n.href !== '/' && path.startsWith(n.href)) ? 'page' : undefined}>
          <Icon d={n.icon} />
          <span>{n.label}</span>
        </Link>
      ))}
    </>
  );
}

/** Flips `data-theme` on <html>; the inline script in layout.tsx applies the stored choice before paint. Dark is the default. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    remember(THEME_KEY, next);
    setTheme(next);
  };
  const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
  return (
    <button type="button" className="rail-tool" onClick={flip} title={label} aria-label={label}>
      <Icon d={theme === 'dark' ? ICONS.sun : ICONS.moon} />
      <span>{label}</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(recall(RAIL_KEY) === '1');
  }, []);
  const toggleRail = () => {
    remember(RAIL_KEY, collapsed ? '0' : '1');
    setCollapsed(!collapsed);
  };
  const railLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <div className="app" data-rail={collapsed ? 'collapsed' : undefined}>
      <aside className="rail">
        <div className="rail-head">
          <Link className="logo" href="/" title="Plunk">
            <Peek tile />
            <span>plunk</span>
          </Link>
          <button type="button" className="rail-tool rail-fold" onClick={toggleRail} title={railLabel} aria-label={railLabel} aria-expanded={!collapsed}>
            <Icon d={collapsed ? ICONS.expand : ICONS.collapse} />
          </button>
        </div>
        <nav className="rail-nav"><NavLinks path={path} /></nav>
        <div className="rail-foot">
          {networkId !== 'mainnet' && <span className="net">{networkId}</span>}
          <a href={explorerAccount(launchpadId)} target="_blank" rel="noreferrer">{launchpadId}</a>
          <span>Fair meme launches on NEAR · unaudited</span>
        </div>
        <div className="rail-tools"><ThemeToggle /></div>
        <RailAccount />
      </aside>
      <div className="body">
        <header className="top gutter">
          <Link className="logo compact" href="/" aria-label="Plunk home"><Peek tile /></Link>
          <Tape />
          <WalletMenu />
        </header>
        {children}
      </div>
      <nav className="tabbar gutter"><NavLinks path={path} /></nav>
    </div>
  );
}

/** Bottom of the rail: Connect when signed out; the account, linking to its profile, when signed in. */
function RailAccount() {
  const { loading, accountId, signIn, signOut } = useNear();
  if (loading) return <button className="connect rail-connect" disabled aria-busy="true">…</button>;
  if (!accountId) {
    return (
      <button className="connect rail-connect" onClick={() => void signIn()} title="Connect wallet">
        <Icon d={ICONS.wallet} />
        <span>Connect wallet</span>
      </button>
    );
  }
  return (
    <div className="rail-account">
      <Link href={`/u/${accountId}`} className="rail-me" title={`${accountId} · profile`}>
        <span className="avatar">{accountId.slice(0, 2).toUpperCase()}</span>
        <span className="who"><b>{accountId}</b><small>View profile →</small></span>
      </Link>
      <button type="button" className="rail-out" onClick={() => void signOut()}>Disconnect</button>
    </div>
  );
}

/** The top-right wallet control on phones: Connect when signed out; an account menu when signed in. */
function WalletMenu() {
  const { loading, accountId, signIn, signOut } = useNear();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const balance = useBalance(accountId, open);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (loading) return <button className="connect on" disabled aria-busy="true">…</button>;
  if (!accountId) {
    return (
      <button className="connect" onClick={() => void signIn()}>
        Connect wallet
      </button>
    );
  }
  const copy = () => {
    navigator.clipboard?.writeText(accountId).then(() => notify('Account id copied.')).catch(() => notify(accountId));
  };
  return (
    <div className="wallet" ref={box}>
      <button className="connect on" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="dot" />
        {accountId}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div className="mono" style={{ wordBreak: 'break-all' }}>{accountId}</div>
            <div className="hint">{balance === undefined ? 'Balance …' : `${formatNear(balance, 2)} NEAR on ${networkId}`}</div>
          </div>
          <Link role="menuitem" href={`/u/${accountId}`} onClick={() => setOpen(false)}>Your profile</Link>
          <button role="menuitem" onClick={copy}>Copy account id</button>
          <a role="menuitem" href={explorerAccount(accountId)} target="_blank" rel="noreferrer">View on explorer</a>
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
