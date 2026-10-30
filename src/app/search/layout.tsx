import type { ReactNode } from 'react';

import { unindexedMetadata } from '@/lib/seo/sectionMeta';

export const metadata = unindexedMetadata('Buscar');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
