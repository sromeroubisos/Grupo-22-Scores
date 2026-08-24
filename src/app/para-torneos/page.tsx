import type { Metadata } from 'next';

import EmbudoLanding from '@/components/embudo/EmbudoLanding';
import { esOrigenValido, type PromoOrigen } from '@/content/embudo';
import { PARA_TORNEOS } from '@/content/para-torneos';

export const metadata: Metadata = {
    title: PARA_TORNEOS.meta.titulo,
    description: PARA_TORNEOS.meta.descripcion,
    alternates: {
        canonical: '/para-torneos',
    },
    openGraph: {
        title: PARA_TORNEOS.meta.titulo,
        description: PARA_TORNEOS.meta.descripcion,
        type: 'website',
        locale: 'es_AR',
        siteName: 'G22 Scores',
        url: '/para-torneos',
    },
    twitter: {
        card: 'summary_large_image',
        title: PARA_TORNEOS.meta.titulo,
        description: PARA_TORNEOS.meta.descripcion,
    },
};

/**
 * La puerta del que organiza — la venta grande, y la salida primaria de la
 * placa de la home. La del club es `/para-clubes`.
 *
 * Cada una tiene su `canonical`: son dos páginas distintas con contenido
 * distinto, no la misma con dos direcciones. Si compartieran canonical, Google
 * indexaría una sola y la otra no la encontraría nadie.
 */
export default async function ParaTorneosPage({
    searchParams,
}: {
    searchParams: Promise<{ ref?: string }>;
}) {
    const resueltos = await searchParams;
    const origen: PromoOrigen | null = esOrigenValido(resueltos.ref) ? resueltos.ref : null;

    return <EmbudoLanding contenido={PARA_TORNEOS} origen={origen} />;
}
