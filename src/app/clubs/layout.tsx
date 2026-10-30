import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Clubes', 'Buscá tu club: partidos, resultados, fixture, plantel e historial de miles de clubes de rugby, hockey y otros deportes.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
