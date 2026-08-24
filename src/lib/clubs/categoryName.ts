/**
 * Nombres de categoría de club, comparables entre sí.
 *
 * Este archivo existe por una razón medida: cuando el catálogo deja que cada
 * club escriba el nombre de una categoría a mano, se llena de gemelas. Ya pasó
 * con las fichas de jugador —`normalizeNameKey` de `matchCenterService.ts` no
 * pliega acentos y dejó 24 fichas dobles sobre 210 nombres del Top 14—, y una
 * categoría se escribe de más formas todavía: `M15`, `M-15`, `Menores 15`,
 * `Menores de 15` y `m 15` son la misma.
 *
 * Se compara por clave, nunca por el texto crudo. Y se guarda el texto tal
 * como lo escribió la persona: la clave es para no duplicar, no para renombrar.
 */

/** Pliega acentos, mayúsculas y puntuación. `Taborín` y `Taborin` dan igual. */
export function normalizeClubText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Lleva las variantes de una categoría a una sola clave.
 *
 * Solo colapsa lo que es la MISMA categoría escrita distinto. Nunca junta dos
 * categorías reales: `m16 a` y `m16 b` son filiales legítimas del mismo club y
 * quedan separadas a propósito — el usuario ya confirmó esa regla para el
 * historial de rivales, y acá vale igual.
 */
export function categoryKey(value: unknown): string {
    let key = normalizeClubText(value);
    if (!key) return '';

    // "menores de 15" / "menores 15" / "m 15" / "m15"  ->  "m15"
    key = key.replace(/\bmenores\s+de\s+(\d{1,2})\b/g, 'm$1');
    key = key.replace(/\bmenores\s+(\d{1,2})\b/g, 'm$1');
    key = key.replace(/\bsub\s*(\d{1,2})\b/g, 'm$1');
    key = key.replace(/\bm\s+(\d{1,2})\b/g, 'm$1');

    // "1ra" / "primera division" -> "primera"
    key = key.replace(/\b1\s*(ra|era)\b/g, 'primera');
    key = key.replace(/\bprimera\s+division\b/g, 'primera');
    key = key.replace(/\b2\s*(da|nda)\b/g, 'segunda');
    key = key.replace(/\b3\s*(ra|era)\b/g, 'tercera');

    // "femenino" y "damas" nombran la misma rama en el rugby argentino.
    key = key.replace(/\bfemenino\b/g, 'damas');
    key = key.replace(/\bfemenina\b/g, 'damas');

    return key.replace(/\s+/g, ' ').trim();
}

/**
 * El nombre completo con el que la categoría entra al catálogo. Se guarda con
 * el club adelante porque una categoría es un club: "Jockey M15" tiene que
 * poder leerse sola en un fixture, sin el contexto de quién es su base.
 */
export function buildCategoryClubName(baseClubName: string, categoryLabel: string): string {
    const base = String(baseClubName || '').trim();
    const label = String(categoryLabel || '').trim();
    if (!base) return label;
    if (!label) return base;

    // Si ya viene con el nombre del club adelante, no se repite.
    if (normalizeClubText(label).startsWith(normalizeClubText(base))) return label;

    return `${base} ${label}`;
}

/** Slug estable para la fila del catálogo. */
export function buildCategorySlug(baseClubName: string, categoryLabel: string): string {
    const source = buildCategoryClubName(baseClubName, categoryLabel);
    return normalizeClubText(source).replace(/\s+/g, '-').slice(0, 60) || 'categoria-club';
}

export type CategoryCandidate = { id: string; name: string };

/**
 * Las categorías ya existentes que se parecen a la que se quiere crear.
 *
 * Devuelve coincidencia exacta de clave primero. El alta las muestra ANTES del
 * botón de crear: elegir la que ya existe tiene que ser más fácil que hacer una
 * nueva, o el catálogo se duplica en la primera fecha.
 */
export function findSimilarCategories(
    candidates: CategoryCandidate[],
    baseClubName: string,
    categoryLabel: string,
): CategoryCandidate[] {
    const wantedFull = categoryKey(buildCategoryClubName(baseClubName, categoryLabel));
    const wantedLabel = categoryKey(categoryLabel);
    if (!wantedFull && !wantedLabel) return [];

    const baseKey = categoryKey(baseClubName);

    return candidates.filter(candidate => {
        const fullKey = categoryKey(candidate.name);
        if (fullKey && fullKey === wantedFull) return true;

        // El candidato puede estar guardado sin el club adelante ("M15" a secas):
        // se compara también la parte que sobra al sacarle el nombre del club.
        const withoutBase = baseKey && fullKey.startsWith(baseKey)
            ? fullKey.slice(baseKey.length).trim()
            : fullKey;

        return Boolean(wantedLabel) && withoutBase === wantedLabel;
    });
}
