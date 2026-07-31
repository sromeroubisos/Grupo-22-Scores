// Reglas del escudo de club, fuera del componente para poder testearlas: un
// .tsx con JSX no se puede importar desde `node --test`.

// Import relativo y no por alias `@/`: este módulo se testea con `node --test`,
// que no resuelve los paths de tsconfig.
import { getClub, hashSeed } from '../../../../features/career/index.ts';

/**
 * Clave para pedir el escudo real al proxy de la app, o `null` si ese club no
 * tiene ninguna.
 *
 * Llevan `sourceId` —y por lo tanto escudo— los clubes que existen en el catálogo
 * real: Uruguay y Chile completos, y los 180 argentinos que el canon del sistema
 * argentino pudo cruzar contra una fila real.
 *
 * NO lo llevan dos grupos, y por motivos distintos:
 *   · los clubes estáticos internacionales, porque el catálogo no guarda para
 *     ellos ni id externo ni clave de logo;
 *   · los 44 clubes que el canon AGREGA y que el catálogo real no tiene (URBA
 *     Segunda, Tercera y Desarrollo, los dos de Villa María, los dos paraguayos
 *     del NEA). Están declarados en `AR_CATALOG.created`.
 *
 * Para los dos grupos hay salida sin tocar este archivo: un `.png` en
 * `public/clubs/<clubId>.png` gana sobre el proxy (ver `ClubBadge`).
 *
 * Devolver `null` en vez de intentar con el slug es deliberado: con una clave
 * inexistente el endpoint responde 404 CON EL HTML DE LA PÁGINA DE ERROR (~102 KB),
 * así que "probar por las dudas" costaría cientos de kilobytes de basura y
 * dejaría la imagen rota igual. Se evita la petición en vez de curar el error.
 */
export function crestKeyOf(clubId: string): string | null {
    return getClub(clubId).sourceId;
}

/** Saturación del monograma. Fija: lo que se ajusta por tono es el brillo. */
const MONOGRAM_SATURATION = 52;

/** Contraste que las iniciales blancas tienen que tener contra su fondo. */
export const MONOGRAM_MIN_CONTRAST = 4.5;

/** HSL (0..360, 0..100, 0..100) a RGB 0..255. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const sat = s / 100;
    const lig = l / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lig - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0]
        : h < 120 ? [x, c, 0]
            : h < 180 ? [0, c, x]
                : h < 240 ? [0, x, c]
                    : h < 300 ? [x, 0, c]
                        : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Contraste WCAG contra el blanco, que es el color de las iniciales. */
function contrastWithWhite([r, g, b]: [number, number, number]): number {
    const ch = (v: number) => {
        const n = v / 255;
        return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    return 1.05 / (lum + 0.05);
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
 * EL BRILLO SE MIDE, NO SE SUPONE. Antes era 38 % fijo "para que el texto
 * blanco tenga contraste sea cual sea el tono", y no alcanzaba: la luminosidad
 * de HSL no es luminancia percibida, así que al mismo 38 % un azul da 8,5:1 y
 * un cian 4,24:1 — abajo del mínimo. Medido en pantalla, el escudo de Chinnor
 * era el que fallaba. Acá se baja el brillo de a un punto hasta que ese tono
 * llega a 4,5:1, que es lo que hace que la regla valga para los 360.
 */
export function monogramColor(clubId: string): string {
    const hue = hashSeed(clubId) % 360;
    let light = 38;
    while (light > 20 && contrastWithWhite(hslToRgb(hue, MONOGRAM_SATURATION, light)) < MONOGRAM_MIN_CONTRAST) {
        light -= 1;
    }
    return `hsl(${hue} ${MONOGRAM_SATURATION}% ${light}%)`;
}

/** El contraste real del monograma de un club. Existe para poder testearlo. */
export function monogramContrast(clubId: string): number {
    const hue = hashSeed(clubId) % 360;
    const match = /(\d+)%\)$/.exec(monogramColor(clubId));
    return contrastWithWhite(hslToRgb(hue, MONOGRAM_SATURATION, Number(match![1])));
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
