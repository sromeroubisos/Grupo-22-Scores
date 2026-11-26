import type { Metadata } from 'next';
import ControlPanel from './ControlPanel';

export const metadata: Metadata = {
  title: 'Panel de overlay · G22 Scores',
  robots: { index: false, follow: false },
};

export default async function OverlayControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ControlPanel id={decodeURIComponent(id)} />;
}
