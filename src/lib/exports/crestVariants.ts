/**
 * Escudos con dos versiones de tinta: la positiva (letras negras) para fondo
 * claro y la negativa (letras blancas) para fondo oscuro. Cada archivo local
 * tiene su hermano `-dark.png` en la misma carpeta.
 *
 * La web lo decide por tema (TeamLogo) y los exports por el color de fondo que
 * se elige en el modal (`darkCrestSource`).
 */
export const DARK_LOGO_VARIANTS = new Set([
    '/clubs/tala-rugby-club.png',
    '/clubs/sb-tala-rugby-club.png',
]);

/** Variante `-dark` de una ruta local, o '' si ese escudo no tiene. */
export function darkVariantOf(src: string): string {
    return DARK_LOGO_VARIANTS.has(src) ? src.replace(/\.png$/, '-dark.png') : '';
}

/**
 * La misma ruta con su variante para fondo oscuro, aunque venga absoluta
 * (`https://host/clubs/x.png`) o con query. Si el escudo no tiene variante, la
 * devuelve igual.
 */
export function darkCrestSource(src: string): string {
    const match = /^(.*?)(\/clubs\/[^/?#]+\.png)([?#].*)?$/.exec(src);
    if (!match) return src;
    const variant = darkVariantOf(match[2]);
    return variant ? `${match[1]}${variant}${match[3] ?? ''}` : src;
}

/**
 * Escudos a los que el export NO les dibuja contorno: el trazo blanco que sigue
 * la silueta del escudo (drawEditorialCrestStroke) no va con el del Tala, que ya
 * trae su propio borde en la imagen.
 */
export function crestHasNoOutline(src: string): boolean {
    return /\/clubs\/(sb-)?tala-rugby-club(-dark)?\.png/.test(src);
}