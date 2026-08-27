// La URL pública de una nota: el titular en el path, con el id de la nota
// como sufijo.
//
//   /noticias/las-leonas-en-la-final-del-mundial-81a1647c-c6d4-…-1e0e96ff9b7f
//
// El id sigue siendo la única llave: no hay columna `slug` en la base, así que
// el titular es decoración legible y el id de atrás es lo que resuelve. Eso
// tiene dos ventajas que una columna no da: no hay backfill ni colisiones que
// arbitrar, y si mañana se corrige el titular la URL se corrige sola —la nota
// vieja redirige a la nueva, porque la llave no se movió.
//
// El lector acepta las dos formas (con titular y sin él): toda URL ya
// compartida sigue abriendo, y la que no está en su forma canónica redirige.

/** El largo del titular en la URL. Google lee bastante más que esto; el resto es ruido. */
const MAX_SLUG_LENGTH = 60;

const UUID_SUFFIX = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * El titular como tramo de URL: sin acentos, sin símbolos, en minúscula y
 * cortado en la última palabra entera que entra. Devuelve '' si del título no
 * queda nada utilizable (un titular de puros signos, por ejemplo).
 */
export function newsSlug(title: string | null | undefined): string {
    const base = (title ?? '')
        .normalize('NFD')
        // Los diacríticos sueltos que dejó el NFD: "está" ya es "esta".
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        // La ñ no es una n con tilde para el NFD de todos los motores: va aparte.
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (base.length <= MAX_SLUG_LENGTH) return base;

    const cut = base.slice(0, MAX_SLUG_LENGTH);
    const lastDash = cut.lastIndexOf('-');
    // Si no hay guión donde cortar, la única palabra se corta a lo bruto.
    return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/**
 * El tramo canónico de una nota: `titular-id`, o el id pelado si el titular no
 * dejó nada. Es lo que compara el lector para decidir si redirige.
 */
export function newsSegment(news: { id: string; title?: string | null }): string {
    const slug = newsSlug(news.title);
    return slug ? `${slug}-${news.id}` : news.id;
}

/** El path público de una nota, para todo `href` y para el sitemap. */
export function newsPath(news: { id: string; title?: string | null }): string {
    return `/noticias/${newsSegment(news)}`;
}

/**
 * El id que hay adentro de un tramo de URL. Acepta las dos formas —con titular
 * adelante y sin él— y, si el id de la nota no fuera un UUID, devuelve el tramo
 * tal cual: así una nota con id propio sigue resolviendo como siempre.
 */
export function newsIdFromSegment(segment: string): string {
    const match = UUID_SUFFIX.exec(segment);
    return match ? match[1].toLowerCase() : segment;
}
