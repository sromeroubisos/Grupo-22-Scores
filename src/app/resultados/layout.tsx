import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Resultados', 'Los resultados del día de rugby, hockey y más, actualizados en vivo partido por partido.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
