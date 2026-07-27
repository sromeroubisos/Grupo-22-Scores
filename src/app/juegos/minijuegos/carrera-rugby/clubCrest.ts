// Reglas del escudo de club, fuera del componente para poder testearlas: un
// .tsx con JSX no se puede importar desde `node --test`.

// Import relativo y no por alias `@/`: este módulo se testea con `node --test`,
// que no resuelve los paths de tsconfig.
import { getClub, hashSeed } from '../../../../features/career/index.ts';

/**
 * Clave para pedir el escudo real al proxy de la app, o `null` si ese club no
 * tiene ninguna.
 *
 * Los 214 clubes AR/UY/CL del snapshot llevan `sourceId` y su escudo existe. Los
 * clubes estáticos internacionales NO tienen con qué pedirlo: el catálogo no
 * guarda ni id externo ni clave de logo para ellos.
 *
 * Devolver `null` en vez de intentar con el slug es deliberado: con una clave
 * inexistente el endpoint responde 404 CON EL HTML DE LA PÁGINA DE ERROR (~102 KB),
 * así que "probar por las dudas" costaría cientos de kilobytes de basura y
 * dejaría la imagen rota igual. Se evita la petición en vez de curar el error.
 */
export function crestKeyOf(clubId: string): string | null {
    return getClub(clubId).sourceId;
}

/**
 * Color del monograma, DERIVADO DEL ID con el hash determinístico del motor.
 * Nada de Math.random: el mismo club tiene el mismo color hoy, mañana y en otra
 * sesión, que es lo que permite reconocerlo de un vistazo.
 *
 * No sale del club real porque `ClubDef` no tiene color: la columna
 * `primary_color` existe en la tabla de Supabase pero el snapshot congelado no
 * la trae. Cuando alguien la agregue, se reemplaza esta función y nada más.
 *
 * Luminosidad fija y baja (38%) para que el texto blanco encima tenga contraste
 * suficiente sea cual sea el tono que salga del hash.
 */
export function monogramColor(clubId: string): string {
    return `hsl(${hashSeed(clubId) % 360} 52% 38%)`;
}

/**
 * Iniciales del club para el monograma.
 *
 * Se descartan las palabras de una sola letra: sin eso, "Hawke's Bay" daba "HS"
 * porque el apóstrofe parte el nombre y la "s" cuenta como palabra.
 */
export function initialsOf(name: string): string {
    const words = name.split(/[^A-Za-zÀ-ÿ0-9]+/).filter((w) => w.length > 1);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return name.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 2).toUpperCase();
}
