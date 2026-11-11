import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Profile } from '@/components/profile/Profile';

type Params = { params: Promise<{ account: string }> };

const ACCOUNT_RE = /^(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*$/;

function parseAccount(raw: string): string | null {
  const id = decodeURIComponent(raw);
  return id.length >= 2 && id.length <= 64 && ACCOUNT_RE.test(id) ? id : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parseAccount((await params).account);
  return { title: id ?? 'Profile', description: 'Launches, holdings, bids and rewards on Plunk.' };
}

export default async function ProfilePage({ params }: Params) {
  const id = parseAccount((await params).account);
  if (id === null) notFound();
  return <Profile account={id} />;
}
