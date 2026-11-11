import type { Metadata } from 'next';
import { MakeForm } from '@/components/make/MakeForm';

export const metadata: Metadata = { title: 'Make a box' };

export default function MakePage() {
  return <MakeForm />;
}
