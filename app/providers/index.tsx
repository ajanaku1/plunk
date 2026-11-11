'use client';

import dynamic from 'next/dynamic';
import type { PropsWithChildren } from 'react';
import { BoxesProvider } from '@/providers/boxes';
import { ToastProvider } from '@/providers/toast';

// Wallet libraries need browser APIs, so the provider loads after hydration.
const NearProvider = dynamic(() => import('@/providers/near-provider').then((m) => m.NearProvider), { ssr: false });

export function Providers({ children }: PropsWithChildren) {
  return (
    <ToastProvider>
      <NearProvider>
        <BoxesProvider>{children}</BoxesProvider>
      </NearProvider>
    </ToastProvider>
  );
}
