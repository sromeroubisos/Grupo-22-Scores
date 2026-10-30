// Metadatos de las secciones del sitio. Muchas son páginas de cliente
// ('use client'), que no pueden exportar `metadata`: el título lo pone un
// layout del segmento con esto. Sin él salían todas con el título y la
// descripción de la portada — para Google, decenas de copias de la home.

import type { Metadata } from 'next';

/**
 * El `openGraph` de una página REEMPLAZA entero al del layout (Next no los
 * mezcla): sin esto cada página perdía siteName, locale y la placa por defecto.
 * Un escudo en base64 (`data:`) no sirve como imagen para compartir.
 */
export function openGraphFor(input: {
    title: string;
    description: string;
    url?: string;
    image?: string | null;
    type?: 'website' | 'article' | 'profile';
}) {
    const image = input.image && /^(https?:)?\//i.test(input.image) ? input.image : null;
    return {
        title: input.title,
        description: input.description,
        type: input.type ?? 'website',
        locale: 'es_AR',
        siteName: 'G22 Scores',
        ...(input.url ? { url: input.url } : {}),
        images: image
            ? [{ url: image, alt: input.title }]
            : [{ url: '/og-default.png', width: 1200, height: 630, alt: 'G22 Scores' }],
    };
}

/** Una sección pública: título propio, descripción propia y su placa. */
export function sectionMetadata(title: string, description: string): Metadata {
    return {
        title: `${title} | G22 Scores`,
        description,
        openGraph: openGraphFor({ title, description }),
    };
}

/**
 * Una ficha cuyo id la base no tiene. Lo correcto sería un 404, pero con el
 * <Suspense> del layout raíz el status ya salió en 200 antes de que la página
 * decida, y un `notFound()` desde `generateMetadata` deja al visitante en el
 * esqueleto de carga para siempre (ver memoria not-found-devuelve-200). El
 * noindex le dice al buscador lo mismo —no indexes esto— y la página sigue
 * mostrando su propio "no encontrado".
 */
export function missingMetadata(what: string): Metadata {
    return {
        title: `${what} no encontrado | G22 Scores`,
        robots: { index: false, follow: false },
    };
}

/**
 * Una página que no tiene nada que buscar: cuenta, login, búsqueda interna,
 * o una sección que todavía es un "en preparación". Se sirve, pero no se
 * indexa; `follow` deja que el buscador siga los enlaces del menú.
 */
export function unindexedMetadata(title: string): Metadata {
    return {
        title: `${title} | G22 Scores`,
        robots: { index: false, follow: true },
    };
}
