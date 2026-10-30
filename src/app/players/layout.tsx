import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Jugadores', 'Fichas de jugadores y jugadoras: partidos, tries, puntos y trayectoria por club y torneo.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
