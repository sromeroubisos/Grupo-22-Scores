import type { Metadata } from 'next';

import { esOrigenValido, META, type PromoOrigen } from '@/content/para-clubes';
import ParaClubesClient from './ParaClubesClient';

export const metadata: Metadata = {
    title: META.titulo,
    description: META.descripcion,
    alternates: {
        canonical: '/para-clubes',
    },
    openGraph: {
        title: META.titulo,
        description: META.descripcion,
        type: 'website',
        locale: 'es_AR',
        siteName: 'G22 Scores',
        url: '/para-clubes',
    },
    twitter: {
        card: 'summary_large_image',
        title: META.titulo,
        description: META.descripcion,
    },
};

/**
 * El `?ref=` se lee acá, en el servidor, y baja como prop.
 *
 * Podría leerse con `useSearchParams` en el cliente, pero eso obliga a un
 * Suspense y a un render sin el dato. Acá ya viene resuelto, y de paso se
 * valida contra la lista de orígenes: el parámetro lo escribe cualquiera y
 * termina guardado en la base junto al lead.
 */
export default async function ParaClubesPage({
    searchParams,
}: {
    searchParams: Promise<{ ref?: string }>;
}) {
    const resueltos = await searchParams;
    const origen: PromoOrigen | null = esOrigenValido(resueltos.ref) ? resueltos.ref : null;

    return <ParaClubesClient origen={origen} />;
}
