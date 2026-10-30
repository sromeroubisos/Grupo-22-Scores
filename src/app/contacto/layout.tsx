import type { ReactNode } from 'react';

import { sectionMetadata } from '@/lib/seo/sectionMeta';

export const metadata = sectionMetadata('Contacto', 'Escribile al equipo de G22 Scores: consultas, propuestas para clubes y torneos, y soporte.');

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}
