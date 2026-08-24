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
 * Los tokens del nombre del club, para poder restárselos a un candidato.
 *
 * Se compara por CONJUNTO y no por prefijo: "Club La Tablada" y
 * "La Tablada - Intermedia" no comparten prefijo —sobra un "Club"— y una
 * comparación por `startsWith` los da por distintos. Ese agujero creó la
 * Intermedia de La Tablada dos veces.
 */
function clubTokenSet(baseClubName: string): Set<string> {
    return new Set(categoryKey(baseClubName).split(' ').filter(Boolean));
}

/**
 * Palabras que designan al club y nunca nombran una categoría. Se sacan aunque
 * no estén en el nombre de la base, porque el catálogo mezcla las dos formas:
 * "Club La Tablada" y "La Tablada" son el mismo club, y sin esto el "Club" que
 * sobra de un lado alcanza para que dos gemelas no se reconozcan.
 *
 * La lista es corta a propósito: solo designadores puros. Meter acá "rugby" o
 * "atlético" empezaría a colapsar categorías que sí son distintas.
 */
const DESIGNADORES_DE_CLUB = new Set(['club', 'c', 'cr', 'rc']);

/** Le saca a una clave los tokens del nombre del club y los designadores. */
function stripClubTokens(key: string, clubTokens: Set<string>): string {
    return key
        .split(' ')
        .filter(token => token && !clubTokens.has(token) && !DESIGNADORES_DE_CLUB.has(token))
        .join(' ')
        .trim();
}

/**
 * El nombre completo con el que la categoría entra al catálogo. Se guarda con
 * el club adelante porque una categoría es un club: "Jockey M15" tiene que
 * poder leerse sola en un fixture, sin el contexto de quién es su base.
 *
 * Si la persona escribe el club adelante —"Newman M17 B" estando parada en
 * Club Newman—, esa parte se ignora en vez de repetirse. Se recortan los
 * tokens INICIALES que pertenecen al club, no un prefijo textual: con
 * `startsWith` el caso "Newman …" sobre "Club Newman" no coincidía y salía
 * "Club Newman Newman M17 B".
 */
export function buildCategoryClubName(baseClubName: string, categoryLabel: string): string {
    const base = String(baseClubName || '').trim();
    const label = String(categoryLabel || '').trim();
    if (!base) return label;
    if (!label) return base;

    const clubTokens = clubTokenSet(base);
    const words = label.split(/\s+/);

    let start = 0;
    while (start < words.length && clubTokens.has(normalizeClubText(words[start]))) {
        start += 1;
    }

    // Todo el rótulo era el nombre del club: no queda categoría que agregar.
    const rest = words.slice(start).join(' ').replace(/^[\s\-–—:]+/, '').trim();
    if (!rest) return base;

    return `${base} ${rest}`;
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
    const clubTokens = clubTokenSet(baseClubName);
    // Al rótulo buscado también se le sacan los tokens del club: quien escribe
    // "Newman M17 B" y quien escribe "M17 B" están pidiendo lo mismo.
    const wantedLabel = stripClubTokens(categoryKey(categoryLabel), clubTokens);
    if (!wantedFull && !wantedLabel) return [];

    return candidates.filter(candidate => {
        const fullKey = categoryKey(candidate.name);
        if (fullKey && fullKey === wantedFull) return true;

        // El candidato puede estar guardado con el club escrito de otra forma
        // ("La Tablada - Intermedia" cuando el club es "Club La Tablada") o sin
        // el club adelante ("M15" a secas). Sacándole a los dos los tokens del
        // club, queda la categoría sola y ahí sí se comparan.
        const candidateLabel = stripClubTokens(fullKey, clubTokens);

        return Boolean(wantedLabel) && candidateLabel === wantedLabel;
    });
}
