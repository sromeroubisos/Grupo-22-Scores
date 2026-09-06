/**
 * LA ESCALA DE COLOR DEL PUNTAJE.
 *
 * Cinco bandas, por el entero del puntaje: 1-2-3 rojo, 4-5 naranja, 6 amarillo,
 * 7-8-9 verde y 10 turquesa. Un 7,1 y un 9,8 comparten color a proposito —el
 * color dice en que escalon esta el partido, y el numero al lado dice el resto.
 *
 * Antes esto era un degrade continuo. Se cambio porque una rampa de 91 colores
 * distintos no la lee nadie: dos pills contiguos difieren en un punto de tono y
 * el color deja de significar. Cinco bandas se leen de un vistazo desde el otro
 * lado de la pantalla, que es para lo que sirve un color en una alineacion.
 *
 * ── COLOR PLENO Y UNA SOLA TINTA ────────────────────────────────────────────
 * El fondo es el color entero, no un tinte: lavado no se leia. Encima va SIEMPRE
 * la misma tinta oscura, y eso esta medido, no elegido por gusto: con estos
 * colores el texto blanco solo pasa AA en el rojo, y para que pase en el
 * amarillo habria que apagarlo hasta el oliva —o sea, perder justo el color que
 * se quiso ganar—. Con `#10171d` las cinco bandas van de 5,27:1 a 10,84:1.
 *
 * Y al ser opaco no hace falta una rampa por tema: el mismo pill se lee igual
 * sobre fondo claro y sobre fondo oscuro.
 */

/** El puntaje mas bajo y el mas alto de la escala. */
const MIN = 1;
const MAX = 10;

export interface BandaRating {
    /** El primer entero de la banda. */
    desde: number;
    color: string;
    /** Como se la nombra. Va al `title` del pill. */
    nombre: string;
}

/** De mayor a menor: se recorre buscando la primera que el puntaje alcanza. */
export const BANDAS: readonly BandaRating[] = [
    { desde: 10, color: '#12b0b8', nombre: 'Excepcional' },
    { desde: 7, color: '#2fae52', nombre: 'Muy bueno' },
    { desde: 6, color: '#f2c31d', nombre: 'Correcto' },
    { desde: 4, color: '#ef7d1a', nombre: 'Flojo' },
    { desde: 1, color: '#ea5a5f', nombre: 'Malo' },
];

/** La tinta del numero. Una sola para las cinco bandas: ver el comentario de arriba. */
export const TINTA = '#10171d';

/** La banda de un puntaje. El entero manda: 7,9 es verde y 6,9 sigue amarillo. */
export function ratingBand(puntaje: number): BandaRating {
    const v = Math.floor(Math.max(MIN, Math.min(MAX, Number.isFinite(puntaje) ? puntaje : MIN)));
    return BANDAS.find((banda) => v >= banda.desde) ?? BANDAS[BANDAS.length - 1];
}

/** El color pleno del pill para un puntaje. */
export function ratingScaleColor(puntaje: number) {
    return ratingBand(puntaje).color;
}

/**
 * El borde: el mismo color un poco mas oscuro. Le da un canto al pill sobre
 * fondo claro, donde un chip pleno sin borde queda flotando.
 */
const BORDE_OSCURECE = 14;

/** Las custom properties del pill, para pegarlas en el `style` del elemento. */
export function ratingScaleVars(puntaje: number): Record<string, string> {
    const color = ratingScaleColor(puntaje);
    return {
        '--rating-bg': color,
        '--rating-fg': TINTA,
        '--rating-border': `color-mix(in srgb, ${color} ${100 - BORDE_OSCURECE}%, ${TINTA})`,
    };
}
