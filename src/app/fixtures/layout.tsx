import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Fixture', 'El fixture de la semana: horarios y partidos de los torneos de rugby, hockey y más, día por día.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
