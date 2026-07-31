/**
 * EL RANGO DEL OVR, en un solo lugar.
 *
 * El color dice de un vistazo en qué liga de jugador está, que es información
 * que el número solo no da: 62 y 82 se leen parecido hasta que uno es gris y el
 * otro rojo. Los cortes están calibrados sobre NUESTROS techos —40 % de las
 * carreras de desarrollo/profesional pican en 80+, 5,6 % en 90+, y la ruta
 * amateur topea por debajo de 80—, así que 85 es élite de verdad.
 *
 * Vive acá y no en cada componente porque la cabecera y la espina tienen que
 * pintar el MISMO 74 del mismo color. Con la escala duplicada, mover un corte en
 * un lado dejaba la carrera con dos verdades sobre la misma temporada.
 *
 * Es presentación pura: no entra al motor ni se persiste. Cambiar un corte no
 * sube ninguna versión.
 */
export type OvrBand = 'inicial' | 'bajo' | 'medio' | 'alto' | 'elite';

export function ovrBand(ovr: number): OvrBand {
    if (ovr >= 85) return 'elite';
    if (ovr >= 75) return 'alto';
    if (ovr >= 65) return 'medio';
    if (ovr >= 55) return 'bajo';
    return 'inicial';
}
