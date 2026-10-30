import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Torneos y ligas', 'Todos los torneos y ligas de rugby, hockey, fútbol y más: fixture, resultados, tablas de posiciones y estadísticas en vivo.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
