// EL CAPITÁN — LA MEDALLA DE CADA PREMIO.
//
// El motor entrega los premios como un id (`SeasonAwardId`) y la pantalla los
// nombra con `AWARD_LABELS`. Lo que falta para dibujarlos es la imagen, y el
// nombre del archivo NO es el id: los PNG se dibujaron para Carrera de Rugby y
// llevan los ids de aquel juego («mejor-jugador-mundo» donde acá el premio se
// llama «mejor-del-mundo»). Renombrar los archivos rompería al otro juego, así
// que el puente vive acá — es presentación, igual que `premios.ts` allá.
//
// La tabla es un `Record<SeasonAwardId, …>` COMPLETO y no un mapa parcial: el
// día que el motor sume un cuarto premio, esto no compila. Es la única forma de
// que un premio nuevo no se quede para siempre sin medalla —no rompe nada, sólo
// no se ve, que es la falla que nadie reporta—. La prueba de al lado cierra el
// otro extremo: que el archivo exista de verdad en `public/premios`.

import type { SeasonAwardId } from '@/features/captain';

/** El nombre del archivo en `public/premios/<archivo>.png`. */
const ARCHIVO: Readonly<Record<SeasonAwardId, string>> = {
    'mejor-del-mundo': 'mejor-jugador-mundo',
    'xv-ideal': 'xv-ideal',
    'mejor-local': 'mejor-temporada-local',
};

/** La medalla de un premio, lista para un `src`. */
export function awardArtOf(id: SeasonAwardId): string {
    return `/premios/${ARCHIVO[id]}.png`;
}

/** Los archivos que esta tabla promete. Lo usa la prueba, no la pantalla. */
export function awardArtFiles(): string[] {
    return Object.values(ARCHIVO).map((archivo) => `${archivo}.png`);
}
