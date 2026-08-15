// EL CAPITÁN — las reglas del escudo de club.
//
// Fuera del componente para poder testearlas: un `.tsx` con JSX no se puede
// importar desde `node --test`.
//
// ── Por qué no se importa el de Carrera de Rugby ──
// Aquel juego tiene el mismo archivo y dice casi lo mismo, pero pide `getClub` y
// `hashSeed` al barrel `@/features/career`, que re-exporta el motor entero de
// aquel juego. Importarlo desde acá para pintar un escudo arrastraría run-career,
// los eventos y el simulador de temporada al bundle de este. Es la misma razón
// por la que `kitColors.ts` tiene su propia tabla.
//
// Acá el club se pide por la ÚNICA puerta declarada de captain hacia los
// catálogos (`data/catalogs.ts`, CLAUDE.md del feature) y el hash es el de ESTE
// motor.
import { hashSeed } from '@/features/captain';
import { getClub } from '@/features/captain/data/catalogs';
import { LOCAL_CLUB_LOGOS } from '@/features/career/data/logo-manifest.generated';

/**
 * Clave para pedirle el escudo real al proxy de la app, o `null` si ese club no
 * tiene ninguna.
 *
 * Llevan `sourceId` —y por lo tanto escudo— los clubes que existen en el
 * catálogo real: Uruguay y Chile completos, y los argentinos que el canon del
 * sistema argentino pudo cruzar contra una fila real. NO lo llevan los clubes
 * estáticos internacionales ni los que el canon AGREGA y el catálogo real no
 * tiene (URBA Segunda, Tercera y Desarrollo, buena parte de la Patagonia).
 *
 * Devolver `null` en vez de probar con el slug es deliberado: con una clave
 * inexistente el endpoint responde 404 CON EL HTML DE LA PÁGINA DE ERROR
 * (~102 KB), así que "probar por las dudas" costaría cientos de kilobytes de
 * basura y dejaría la imagen rota igual. Se evita la petición en vez de curar el
 * error.
 */
export function crestKeyOf(clubId: string): string | null {
    return getClub(clubId).sourceId;
}

/**
 * DE DÓNDE SALE EL ESCUDO DE ESTE CLUB, en un solo lugar.
 *
 * Las tres fuentes y su orden están documentados en `ClubBadge.tsx`. Lo que vive
 * acá es la DECISIÓN, y no en el componente, porque el escudo ya no se dibuja
 * sólo en el DOM: el póster del retiro lo pinta en un canvas y necesita
 * exactamente la misma respuesta. Con la regla escrita dos veces, el día que una
 * cambie el juego y lo que se comparte muestran clubes distintos.
 *
 * El `kind` viaja porque los dos consumidores hacen cosas distintas con él: el
 * componente elige entre `next/image` y `<img>`, y el canvas sólo mira si hay
 * `src`. Un booleano «tiene escudo» no alcanzaría para lo primero.
 */
export type CrestSource =
    | { kind: 'local'; src: string }
    | { kind: 'proxy'; src: string }
    | { kind: 'monogram'; src: null };

export function crestSourceOf(clubId: string, clubName: string): CrestSource {
    if (LOCAL_CLUB_LOGOS.has(clubId)) {
        return { kind: 'local', src: `/clubs/${clubId}.png` };
    }

    const key = crestKeyOf(clubId);
    if (key === null) return { kind: 'monogram', src: null };

    return {
        kind: 'proxy',
        src: `/api/assets/team-logo?entity=team&sport=rugby&key=${encodeURIComponent(key)}&name=${encodeURIComponent(clubName)}`,
    };
}

/**
 * Saturaciones del monograma. TRES, y no una.
 *
 * Es un problema de palomar y no de calidad del hash: con un solo eje hay 360
 * colores posibles y el catálogo tiene ~600 clubes sin escudo real, así que a
 * partir de 360 que dos compartan color deja de ser mala suerte y pasa a ser
 * aritmética — y el punto del monograma es reconocer al club de un vistazo. El
 * segundo eje lleva el espacio a 1.080 combinaciones.
 *
 * El BRILLO no entra en el sorteo y no puede entrar: es la variable que se
 * ajusta hasta garantizar el contraste con las iniciales blancas.
 */
export const MONOGRAM_SATURATIONS = [40, 52, 64] as const;

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
 * El color de un (tono, saturación), con el brillo ya bajado hasta llegar al
 * contraste mínimo.
 *
 * EL BRILLO SE MIDE, NO SE SUPONE. Un 38% fijo no alcanza: la luminosidad de HSL
 * no es luminancia percibida, así que al mismo 38% un azul da 8,5:1 y un cian
 * 4,24:1 — abajo del mínimo. Acá se baja de a un punto hasta que ese tono llega
 * a 4,5:1, que es lo que hace que la regla valga para los 360.
 *
 * Separada de `monogramColor` para poder verificar el espacio de color ENTERO en
 * vez de sólo las combinaciones que el catálogo de hoy sortea: un club nuevo
 * puede caer en cualquiera.
 */
export function monogramColorAt(hue: number, saturation: number): string {
    let light = 38;
    while (light > 20 && contrastWithWhite(hslToRgb(hue, saturation, light)) < MONOGRAM_MIN_CONTRAST) {
        light -= 1;
    }
    return `hsl(${hue} ${saturation}% ${light}%)`;
}

/** El contraste de un (tono, saturación) con el brillo que le toca. */
export function monogramContrastAt(hue: number, saturation: number): number {
    const light = Number(/ \d+% (\d+)%/.exec(monogramColorAt(hue, saturation))![1]);
    return contrastWithWhite(hslToRgb(hue, saturation, light));
}

/**
 * Color del monograma, DERIVADO DEL ID con el hash determinístico del motor.
 * Nada de `Math.random`: el mismo club tiene el mismo color hoy, mañana y en
 * otra sesión, que es lo que permite reconocerlo de un vistazo.
 */
export function monogramColor(clubId: string): string {
    const hash = hashSeed(clubId);
    // El segundo eje sale de los dígitos ALTOS del mismo hash y no de un segundo
    // hash: dividir antes del módulo usa la parte que el `% 360` descarta, así
    // que los dos ejes no se mueven juntos.
    const saturation = MONOGRAM_SATURATIONS[Math.floor(hash / 360) % MONOGRAM_SATURATIONS.length];
    return monogramColorAt(hash % 360, saturation);
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
