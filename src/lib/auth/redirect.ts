// A dónde volver después del login: siempre un path de NUESTRO sitio.
//
// Los filtros de texto (empieza con '/', no con '//', sin '\') no alcanzan: el
// navegador descarta tabs y saltos de línea de la URL antes de parsearla, así que
// `/%09/evil.example` (o con un tab literal) pasaba el filtro como "un path" y el
// navegador lo leía como `//evil.example`. Por eso: se rechaza cualquier carácter
// de control o espacio, y después se parsea contra una base fija y se exige que el
// origen no cambie. Lo que se devuelve es lo que el parser entendió
// (pathname+search+hash), no el texto crudo.

const REDIRECT_BASE = 'https://g22.invalid';

// Controles C0, espacio y DEL: lo que el parser de URL tira o reinterpreta.
const CONTROL_OR_SPACE = /[\x00-\x20\x7F]/;

/** El path seguro de `raw`, o null si no es un path propio. */
export function toSafeRelativePath(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (CONTROL_OR_SPACE.test(raw)) return null;

    // También el texto crudo, por si algún consumidor lo usa sin parsear.
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('@')) return null;

    let parsed: URL;
    try {
        parsed = new URL(raw, REDIRECT_BASE);
    } catch {
        return null;
    }
    if (parsed.origin !== REDIRECT_BASE) return null;

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // Un pathname normalizado que empieza con '//' vuelve a ser protocol-relative.
    if (!path.startsWith('/') || path.startsWith('//')) return null;
    return path;
}

/** true si el path vuelve a una pantalla de auth (bucle de login). */
function isAuthLoop(path: string): boolean {
    const pathname = path.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '') || '/';
    return pathname === '/login' || pathname === '/register' || pathname.startsWith('/auth/') || pathname === '/auth';
}

export function sanitizeNext(raw: string | null): string {
    const path = toSafeRelativePath(raw);
    if (!path) return '/'
    // Prevent redirect loops back to auth pages
    if (isAuthLoop(path)) return '/'
    return path
}
