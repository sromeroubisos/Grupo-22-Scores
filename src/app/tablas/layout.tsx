import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Tablas de posiciones', 'Tablas de posiciones actualizadas de los torneos de rugby, hockey y más, con puntos, bonus y diferencia de tantos.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
