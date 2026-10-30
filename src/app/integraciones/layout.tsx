import type { ReactNode } from 'react';

import { unindexedMetadata } from '@/lib/seo/sectionMeta';

export const metadata = unindexedMetadata('Integraciones');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
