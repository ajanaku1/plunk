import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { Providers } from '@/providers';
import '@/styles/tokens.css';
import '@/styles/app.css';

const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-archivo', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3111'),
  title: { default: 'Plunk · fair meme launches on NEAR', template: '%s · Plunk' },
  description: 'Sealed-bid meme launches on NEAR. Everyone pays one clearing price; liquidity is locked forever.',
  applicationName: 'Plunk',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  openGraph: { type: 'website', siteName: 'Plunk', title: 'Plunk · everyone pays one price', description: 'Sealed-bid meme launches on NEAR. No sniping, no bonding-curve race.' },
  twitter: { card: 'summary_large_image', title: 'Plunk · everyone pays one price', description: 'Sealed-bid meme launches on NEAR.' },
};

const THEME_SCRIPT = "try{if(localStorage.getItem('plunk-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}";

export const viewport: Viewport = { themeColor: '#0E0B14', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${archivo.variable} ${plexMono.variable}`}>
      <head>
        {/* Applies the stored theme before first paint; dark stays the default. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
