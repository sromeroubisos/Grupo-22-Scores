// EL CAPITÁN — la camada, y los cupos de cada carril.
//
// Un carril representativo dejó de ser "media mayor a X" y pasó a ser "estás
// entre los N mejores de tu camada en tu puesto". Hay treinta camisetas de
// Pumitas, no infinitas.
//
// ═══════════════════════════════════════════════════════════════════════════
//  POR QUÉ ESTO NO ES UNA TABLA DE NÚMEROS
// ═══════════════════════════════════════════════════════════════════════════
//
// Es la parte que hay que entender antes de tocar una línea de este archivo.
//
// La primera versión de este diseño era una CURVA FIJA: una tabla de medias de
// OVR por edad, contra la que se calculaba tu percentil. Se descartó con lápiz y
// papel, antes de escribirla, porque se reduce a lo que venía a reemplazar:
//
//     entrás ⟺ rank ≤ K
//            ⟺ C · P(X > ovr) ≤ K − 1
//            ⟺ P(X > ovr) ≤ (K−1)/C
//            ⟺ ovr ≥ F⁻¹(1 − (K−1)/C)
//
// Con `F`, `K` y `C` constantes, el lado derecho ES UN NÚMERO. O sea: un umbral
// con más pasos, y con la misma erosión que el umbral original. La próxima vez
// que la población creciera —y crece, para eso existe `built`— más gente
// cruzaría ese número y el piso se caería de nuevo, tres cambios después y sin
// saber cuál lo rompió.
//
// La camada tiene que MOVERSE CON LA POBLACIÓN. Por eso acá no hay medias
// escritas: hay una fórmula que lee el MODELO GENERATIVO de `types/player.ts`
// —el mismo del que sale el jugador— y deriva contra quién competís. Si mañana
// `POTENTIAL_BAND` pasa de 6 a 10, la camada sube con vos y el piso aguanta.
//
// Lo que sí queda desacoplado, y es lo que se buscaba: EL CATÁLOGO DE CLUBES. La
// camada no lee un solo club, así que un commit de la Patagonia no mueve la
// escalera. Desacoplado del canon, acoplado al modelo generativo: son dos cosas
// distintas y la confusión entre las dos es la que costó el rediseño.

import type { PositionFamilyId } from '../types/player.ts';
import {
    POTENTIAL_BAND,
    POTENTIAL_MEAN_GAP,
    POTENTIAL_REALIZATION,
    POTENTIAL_SD_GAP,
} from '../types/player.ts';

/**
 * Versión de la camada. Se sella en el guardado igual que un catálogo.
 *
 * Sube cuando cambia CUALQUIER cosa de este archivo: los cupos, la forma del
 * plantel, la hipótesis de comportamiento, o la fórmula. Una partida jugada con
 * otra camada se jugó en otro mundo — las convocatorias que recibiste no se
 * pueden recalcular hacia atrás.
 */
export const COHORT_VERSION = '2026-08.1';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LAS CAMISETAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cómo se reparte un plantel de treinta entre las ocho familias.
 *
 * Sale de la composición real de un plantel de rugby y no de dividir 30 entre 8:
 * un plantel lleva cinco de primera línea porque los pilares se cambian, y dos
 * aperturas porque hay uno solo en la cancha. Suma treinta exacto, y hay un test
 * que lo verifica.
 *
 * Esto reemplaza a `SCARCITY`, que era una banda de dos puntos de media que
 * inclinaba la balanza a mano. La escasez ahora es real y se explica sola: un
 * apertura pelea dos camisetas y un wing pelea cinco.
 */
export const SQUAD_SHAPE: Record<PositionFamilyId, number> = {
    'primera-linea': 5,
    hooker: 3,
    'segunda-linea': 4,
    'tercera-linea': 5,
    'medio-scrum': 2,
    apertura: 2,
    centro: 4,
    'wing-fullback': 5,
};

/** Las treinta de arriba, para que los cupos se escalen contra un plantel real. */
export const SQUAD_TOTAL = 30;

/**
 * Cuántas camisetas tiene cada carril con cupo.
 *
 * Los tres de abajo son los que se convirtieron; `a-xv` y `nacional` siguen por
 * umbral, porque el techo del juego ya está en objetivo y el problema medido era
 * el piso. Convertir los cinco de una habría movido las dos puntas a la vez y
 * ninguna medición se podría leer.
 */
export const TRACK_SHIRTS = {
    /** Seleccionado de tu unión. */
    union: 30,
    /** Academia regional / PlaDAR. Una franquicia del SRA lleva ~35. */
    academia: 35,
    /** Los Pumitas M20. */
    m20: 30,
} as const;

export type CupoTrack = keyof typeof TRACK_SHIRTS;

export function isCupoTrack(track: string): track is CupoTrack {
    return track === 'union' || track === 'academia' || track === 'm20';
}

/** Las camisetas que le tocan a TU puesto en ese carril. Nunca menos de una. */
export function shirtsFor(track: CupoTrack, family: PositionFamilyId): number {
    return Math.max(1, Math.round(TRACK_SHIRTS[track] * (SQUAD_SHAPE[family] / SQUAD_TOTAL)));
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA CAMADA — cuántos pelean cada camiseta, y cómo son
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cuántos jugadores de tu puesto pelean cada camiseta de ese carril.
 *
 * Es el parámetro que fija cuán selectivo es el carril: con diez aspirantes por
 * camiseta, entrás si estás en el 10% de arriba de tu camada. No es la población
 * de rugbiers del país —eso sería un dato y no lo tenemos— sino cuánta gente
 * está EN LA CONVERSACIÓN por ese lugar.
 *
 * Sube con el escalón, y por la razón obvia: por una camiseta de tu unión pelean
 * los buenos de tu zona, y por una de los Pumitas pelean los buenos del país.
 */
const CONTENDERS_PER_SHIRT: Record<CupoTrack, number> = {
    union: 6,
    academia: 11,
    m20: 16,
};

/**
 * QUÉ FRACCIÓN DE LA BANDA CONSTRUYE UN JUGADOR TÍPICO.
 *
 * ⚠️ ESTO NO ES UN PARÁMETRO TÉCNICO. Es UNA AFIRMACIÓN SOBRE CÓMO JUEGA LA
 * GENTE, y hay que tratarla con la misma desconfianza que la banda de
 * `nunca salen del club`: es una hipótesis de comportamiento, no una medición.
 *
 * En 1 —todos construyen la banda entera— el jugador medio queda por debajo de
 * su camada y no pasa nadie. En 0 —nadie construye— la camada se queda quieta
 * mientras el jugador sube y pasan todos. Los dos extremos rompen el carril, y
 * ninguno de los dos avisa: devuelven una tasa de convocatoria rarísima y hay
 * que ir a buscar por qué.
 *
 * Está en 0,5 porque la carta media construye 0,35 por temporada contra 0,9 de
 * la cara, o sea que quien elige "normal" llena aproximadamente media banda a lo
 * largo de una carrera. Es defendible y NO está medido contra jugadores reales,
 * porque todavía no hay jugadores reales.
 *
 * El próximo que lo toque está discutiendo con una hipótesis de comportamiento y
 * tiene que saberlo.
 */
const TYPICAL_BUILD_SHARE = 0.5;

/**
 * A qué edad se considera que la camada ya terminó de crecer.
 *
 * No es el pico del puesto sino el final de la ventana juvenil: los tres
 * carriles con cupo se juegan entre los 17 y los 21, así que la camada que
 * importa es la que todavía está subiendo.
 */
const COHORT_MATURITY_AGE = 22;

export interface CohortCurve {
    mean: number;
    sd: number;
}

/**
 * Cómo es la camada contra la que competís, a tu edad.
 *
 * TODO SALE DEL MODELO GENERATIVO y nada está escrito a mano: el arranque es el
 * OVR de la plantilla del puesto, el destino es ese arranque más el margen que
 * se sortea al nacer más lo que un jugador típico construye, y en el medio se
 * interpola por edad. La dispersión es la del sorteo del margen, creciendo con
 * la edad porque a los 18 todavía no se separaron.
 *
 * Cambiar `POTENTIAL_MEAN_GAP` o `POTENTIAL_BAND` mueve esta curva. Es el punto
 * entero del archivo.
 */
export function cohortCurve(startOvr: number, age: number): CohortCurve {
    const avance = Math.min(1, Math.max(0, (age - 18) / (COHORT_MATURITY_AGE - 18)));
    // El destino es el margen REALIZADO, no el margen sorteado. Sin
    // `POTENTIAL_REALIZATION` la camada maduraba en el techo esperado del propio
    // jugador, el jugador típico quedaba en el percentil 50 y los tres carriles
    // con cupo daban exactamente 0,000: el corte quedaba por encima del umbral
    // del escalón de arriba, así que no se evaluaba nunca.
    const margen = (POTENTIAL_MEAN_GAP + POTENTIAL_BAND * TYPICAL_BUILD_SHARE) * POTENTIAL_REALIZATION;
    const destino = startOvr + margen;
    return {
        mean: startOvr + (destino - startOvr) * avance,
        // Piso del 40%: a los 18 la camada ya está algo separada, porque el
        // sorteo de atributos pasa antes que cualquier crecimiento.
        sd: POTENTIAL_SD_GAP * (0.4 + 0.6 * avance),
    };
}

/**
 * Cuántos de tu camada están por encima tuyo, aproximando la normal.
 *
 * Se usa la aproximación logística de la normal acumulada en vez de un `erf`:
 * el error máximo es de menos de un punto porcentual, es una línea, y no
 * necesita tabla ni dependencia. Para decidir si entrás en un plantel de treinta
 * esa precisión sobra.
 */
function fractionAbove(ovr: number, curve: CohortCurve): number {
    const z = (ovr - curve.mean) / Math.max(0.001, curve.sd);
    return 1 / (1 + Math.exp(1.702 * z));
}

/**
 * ¿ENTRÁS EN EL PLANTEL?
 *
 * Tu puesto tiene `shirts` camisetas y `shirts × CONTENDERS_PER_SHIRT`
 * aspirantes. Estás adentro si la cantidad de gente mejor que vos no llena las
 * camisetas antes de que llegues.
 *
 * `rivalOvr` es el archirrival, y ocupa un lugar de verdad: si él es mejor que
 * vos, es UNO de los que están adelante. No es un adorno narrativo —le estás
 * sacando el puesto a alguien con nombre, que es literalmente cómo funciona.
 */
export function fitsInSquad(
    track: CupoTrack,
    family: PositionFamilyId,
    ovr: number,
    startOvr: number,
    age: number,
    rivalOvr: number | null,
): boolean {
    const shirts = shirtsFor(track, family);
    const aspirantes = shirts * CONTENDERS_PER_SHIRT[track];
    const curve = cohortCurve(startOvr, age);

    let porDelante = fractionAbove(ovr, curve) * aspirantes;
    // El archirrival no es parte de la camada sintética: es un tipo concreto que
    // se suma a la fila si te está ganando.
    if (rivalOvr !== null && rivalOvr > ovr) porDelante += 1;

    return porDelante < shirts;
}
