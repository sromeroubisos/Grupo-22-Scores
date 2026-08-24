import type { Metadata } from 'next';

import EmbudoLanding from '@/components/embudo/EmbudoLanding';
import { esOrigenValido, type PromoOrigen } from '@/content/embudo';
import { PARA_CLUBES } from '@/content/para-clubes';

export const metadata: Metadata = {
    title: PARA_CLUBES.meta.titulo,
    description: PARA_CLUBES.meta.descripcion,
    alternates: {
        canonical: '/para-clubes',
    },
    openGraph: {
        title: PARA_CLUBES.meta.titulo,
        description: PARA_CLUBES.meta.descripcion,
        type: 'website',
        locale: 'es_AR',
        siteName: 'G22 Scores',
        url: '/para-clubes',
    },
    twitter: {
        card: 'summary_large_image',
        title: PARA_CLUBES.meta.titulo,
        description: PARA_CLUBES.meta.descripcion,
    },
};

/**
 * La puerta del club. La del que organiza es `/para-torneos`, y las dos son la
 * misma página con distinto contenido: `EmbudoLanding`.
 *
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

    return <EmbudoLanding contenido={PARA_CLUBES} origen={origen} />;
}
