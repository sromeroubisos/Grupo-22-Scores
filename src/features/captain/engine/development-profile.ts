// EL CAPITÁN — la FORMA de la carrera, no su altura.
//
// Dos tiradas, dos ejes, y las dos viven acá porque juntas resuelven una sola
// cosa: `resolveAgeCurve`, la curva de edad de ESTE jugador.
//
//   PERFIL DE DESARROLLO  cuándo llegás — corre el principio de la meseta.
//   LONGEVIDAD            cuánto te dura — corre el declive y los dos topes.
//
// Separadas no significan nada; cruzadas dan las cuatro carreras que el rugby
// tiene. El bloque de la longevidad, al final del archivo, lo explica entero.
//
// Hasta 0.10.0 todas las carreras tenían la misma curva. Los tres tramos de
// `aging.ts` salen de la familia, así que dos wings con el mismo techo crecían
// exactamente igual y la única diferencia entre dos partidas era el número que
// salió del sorteo.
//
// El perfil NO TOCA EL TECHO —eso es `potentialBase + built`— sino CUÁNDO se
// llega. Un `early` explota de pibe y se estabiliza joven; un `late` arranca
// lento y sigue creciendo pasados los 30.
//
// ── Por qué `early` no significa "se cae antes" ──
// Es la lección que Carrera de Rugby ya pagó: con el pico adelantado un año, al
// precoz no le alcanzaba la ventana para cerrar la brecha y terminaba TRES
// puntos por debajo de su techo mientras el tardío llegaba a uno. O sea que
// "madurar temprano" pasaba a ser un castigo. Acá `early` crece más rápido hasta
// los 23 y más lento después, y el pico queda donde lo puso la familia.
//
// ── Por qué se sortea y no se elige ──
// Es material, igual que `potentialBase`: te tocó. Se revela en el retiro, junto
// con el techo, y ahí recién se puede leer la carrera entera de una.

import type { DevelopmentProfile, PositionFamilyId, PositionGroup } from '../types/player.ts';
import type { AgeCurve } from '../data/positions.ts';
import type { Rng } from './random.ts';
import { getFamily } from '../data/positions.ts';

// El TIPO vive en `types/player.ts` porque es un campo del jugador y el árbol de
// tipos es la raíz que no importa nada. Acá viven sus CURVAS, que son motor. Se
// re-exporta para que el que necesita las dos cosas tenga un solo import.
export type { DevelopmentProfile };

/**
 * Array literal ORDENADO, y por eso existe: elegir iterando las claves de
 * `DISTRIBUTION` ataría el sorteo al orden de inserción del objeto, que es
 * no-determinismo encubierto (CLAUDE.md de Carrera §1).
 */
export const DEVELOPMENT_PROFILES: readonly DevelopmentProfile[] = ['early', 'normal', 'late'];

/**
 * Cuánto se le corre el pico al perfil, en años. PARÁMETRO LIBRE.
 *
 * `early` corre CERO. No es una omisión: es el resultado de arriba. `late` suma
 * dos y no tres — con tres llegaba más alto que los otros dos y dejaba de ser
 * una forma distinta de carrera para ser la mejor.
 */
const PEAK_SHIFT: Readonly<Record<DevelopmentProfile, number>> = {
    early: 0,
    normal: 0,
    late: 2,
};

export function peakShiftOf(profile: DevelopmentProfile): number {
    return PEAK_SHIFT[profile];
}

/**
 * Cuánto rinde el desarrollo a cada edad. Es lo que de verdad separa los tres
 * perfiles.
 *
 * Los factores SE COMPENSAN a lo largo de la carrera: ninguno es estrictamente
 * mejor, cambian el CUÁNDO y no el CUÁNTO. El que quiera verificarlo que sume
 * los tres tramos ponderados por las temporadas de cada uno — es la clase de
 * cuenta que conviene hacer antes de tocar un número acá.
 */
export function profileGrowthFactor(profile: DevelopmentProfile, age: number): number {
    if (profile === 'early') {
        if (age <= 23) return 1.3;
        if (age <= 26) return 0.92;
        return 0.7;
    }
    if (profile === 'late') {
        if (age <= 22) return 0.72;
        if (age <= 26) return 1.05;
        return 1.45;
    }
    return 1;
}

/**
 * Reparto por GRUPO DE PUESTO, y no es parejo a propósito: los backs viven de la
 * velocidad, que pica joven, y los forwards del empuje y del oficio de scrum,
 * que maduran cerca de los 30. Elegir pilar o wing cambia la forma esperable de
 * la carrera y no solo la edad del pico.
 *
 * Pesos, no porcentajes: los resuelve `rng.weighted`.
 */
const DISTRIBUTION: Readonly<Record<PositionGroup, Readonly<Record<DevelopmentProfile, number>>>> = {
    back: { early: 35, normal: 50, late: 15 },
    forward: { early: 15, normal: 50, late: 35 },
};

export function profileDistribution(group: PositionGroup): Readonly<Record<DevelopmentProfile, number>> {
    return DISTRIBUTION[group];
}

/** Sortea el perfil del jugador según su puesto. Determinístico: pide el rng. */
export function rollDevelopmentProfile(family: PositionFamilyId, rng: Rng): DevelopmentProfile {
    const weights = DISTRIBUTION[getFamily(family).group];
    return rng.weighted([...DEVELOPMENT_PROFILES], (p) => weights[p]);
}

/**
 * La frase del REVELADO, para la pantalla de retiro. El perfil está escondido
 * toda la partida —como el techo— y recién al final se nombra: convierte un
 * número oculto en un descubrimiento, y explica de dónde salió la forma que
 * tuvo la carrera.
 */
export function profileRevealText(profile: DevelopmentProfile): string {
    switch (profile) {
        case 'early':
            return 'Maduró temprano: de pibe ya rendía como un veterano.';
        case 'late':
            return 'Maduró tarde: siguió creciendo pasados los treinta.';
        case 'normal':
        default:
            return 'Creció parejo, temporada tras temporada.';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LA LONGEVIDAD — el segundo eje, y el que faltaba
// ═══════════════════════════════════════════════════════════════════════════
//
// El perfil de arriba mueve el PRINCIPIO de la meseta: cuándo llegás. No decía
// nada de cuánto te dura, y por eso hasta acá todos los wings de una misma
// partida se retiraban a la misma edad. La longevidad es el otro eje, y es
// INDEPENDIENTE del primero a propósito: cruzarlos da las cuatro carreras que
// el rugby de verdad tiene, y no dos.
//
//   precoz + longevo   pico a los 24 y meseta hasta los 33: el que se instala
//                      joven y se queda una década. Es la carrera envidiable.
//   precoz + corto     explota de pibe y a los 31 ya no está. El que "se quemó".
//   tardío + longevo   arranca lento, llega pasados los 30 y toca el tope.
//   tardío + corto     el que nunca terminó de aparecer.
//
// ── Por qué la tirada es pareja entre puestos, y el perfil no ──
// La diferencia de longevidad ENTRE PUESTOS ya está declarada en la tabla de
// `positions.ts`: un wing se retira cuatro años antes que un pilar porque su
// curva lo dice. Sesgar además esta tirada por grupo sería escribir dos veces el
// mismo hecho, y la segunda copia se queda vieja el día que alguien mueva la
// tabla (CLAUDE de captain §1.9). Acá se sortea CUÁNTO TE APARTÁS de la curva de
// tu puesto, y eso es igual de aleatorio para un pilar que para un wing.

/**
 * EL TOPE DEL JUEGO. Nadie juega un partido más después de esta edad, le haya
 * tocado la curva que le haya tocado.
 *
 * PARÁMETRO LIBRE, y es una decisión de diseño antes que un dato: la carrera
 * tiene que poder llegar a los 40. La tabla de `positions.ts` pone al puesto más
 * longevo justo en el tope y al más corto cuatro años abajo, así que el pilar lo
 * toca sin suerte y el wing necesita una buena tirada de longevidad. Que exista
 * un tope duro APARTE de la tabla es lo que hace que sumar años acá adentro no
 * pueda producir un jugador de 45 en cuanto alguien mueva una constante.
 */
export const CAREER_HARD_CAP = 40;

/**
 * Cuántos años se aparta de la curva de su puesto el jugador con más y con menos
 * suerte. PARÁMETRO LIBRE.
 *
 * Tres para cada lado y no más: con cuatro, la meseta de un afortunado llega a
 * durar más que la de dos puestos distintos juntos y la elección de puesto deja
 * de decir nada sobre la forma de la carrera.
 */
export const LONGEVITY_MIN = -3;
export const LONGEVITY_MAX = 3;

/**
 * ANTES DE ESTA EDAD NADIE AFLOJA. PARÁMETRO LIBRE, y es una decisión de diseño
 * antes que un dato del deporte.
 *
 * La tabla de `positions.ts` está calibrada contra edades reales y ahí un centro
 * empieza a caerse a los 29 — que es cierto en el rugby y es ilegible en un juego
 * de carrera: con la longevidad más baja, ese mismo centro entraba en el declive
 * a los 26, o sea diez temporadas mirando cómo le baja la media. El jugador no lo
 * leía como el reverso de un puesto que vive de la velocidad; lo leía como que el
 * juego se le rompió.
 *
 * Así que la tabla sigue diciendo lo que dice —de ella salen el pico, la meseta y
 * los dos topes, que son lo que distingue a un pilar de un wing— y lo único que
 * se le pone encima es un PISO: la caída no puede empezar antes de los 33, le
 * toque la curva que le toque. Entre el final de la meseta y el piso la media no
 * sube ni baja, que es exactamente lo que promete: estás en tu techo.
 *
 * Va acá y no en `aging.ts` porque es la curva y no el envejecimiento: el retiro
 * y el llamado del club de origen leen `decline` de esta misma función, y un piso
 * escrito del otro lado los dejaría mirando una edad que ya no existe (§1.9).
 */
export const DECLINE_FLOOR = 33;

/**
 * Pesos de la tirada, SIMÉTRICOS alrededor del cero.
 *
 * La simetría no es estética: es lo que sostiene la afirmación que hace el
 * comentario de `AgeCurve` —que la tabla del puesto es el CENTRO de la
 * distribución y no su piso ni su techo—. Si esto se corriera, la tabla pasaría
 * a mentir sobre la edad típica de cada puesto sin que nada fallara.
 *
 * Array ORDENADO y no un objeto, por la misma razón que `DEVELOPMENT_PROFILES`:
 * iterar claves ata el sorteo al orden de inserción (CLAUDE.md de Carrera §1).
 */
const LONGEVITY_WEIGHTS: readonly { years: number; weight: number }[] = [
    { years: -3, weight: 8 },
    { years: -2, weight: 13 },
    { years: -1, weight: 18 },
    { years: 0, weight: 22 },
    { years: 1, weight: 18 },
    { years: 2, weight: 13 },
    { years: 3, weight: 8 },
];

/** Sortea la longevidad del jugador. Determinístico: pide el rng. */
export function rollLongevity(rng: Rng): number {
    return rng.weighted([...LONGEVITY_WEIGHTS], (o) => o.weight).years;
}

/**
 * Lo mínimo que hace falta para resolver una curva. Se pide así y no el
 * `CaptainPlayer` entero para que un test pueda barrer las combinaciones sin
 * fabricar un jugador completo.
 */
export interface CareerShapeInput {
    family: PositionFamilyId;
    developmentProfile: DevelopmentProfile;
    longevity: number;
}

/**
 * LA CURVA DE ESTE JUGADOR. La única fuente: el envejecimiento, el retiro y el
 * regreso al club de origen leen de acá y nunca de `getFamily(...).age`.
 *
 * ── Por qué una sola función y no dos corrimientos sueltos ──
 * Porque ya se pagó tenerlos sueltos. `peakShift` corría el pico y el declive
 * dentro de `aging.ts`, y `retireIfDue` leía la tabla cruda: al tardío se le
 * estiraban dos años de buen juego y se le cortaba la carrera en la misma fecha
 * que a todos. No fallaba nada — simplemente el perfil no significaba lo que
 * decía significar. Con las dos lecturas saliendo de acá, desincronizarlas pide
 * borrar una llamada, que sí se ve.
 *
 * ── Qué mueve cada eje ──
 * El perfil corre SOLO EL PRINCIPIO de la meseta hacia adelante; la longevidad
 * corre TODO LO QUE VIENE DESPUÉS. La consecuencia es la que se quería: una
 * longevidad alta no te agrega años de veterano arrastrándote, te agrega años DE
 * MESETA — la meseta se ensancha y el declive entero se corre con ella.
 *
 * La cadena de `max` es la que sostiene el invariante
 * `debut < peak[0] <= peak[1] < decline <= soft < hard` con cualquier
 * combinación de las dos tiradas, y `positions.test.ts` la barre entera.
 */
export function resolveAgeCurve(input: CareerShapeInput): AgeCurve {
    const base = getFamily(input.family).age;
    const frente = peakShiftOf(input.developmentProfile);
    // El declive y todo lo que sigue se mueven JUNTOS, así que la separación
    // entre meseta, declive, tope blando y tope duro no la toca nadie: lo que
    // cambia es dónde empieza ese bloque, no su forma.
    const fondo = frente + input.longevity;

    const peakStart = base.peak[0] + frente;
    const peakEnd = Math.max(peakStart, base.peak[1] + fondo);
    // EL PISO ENTRA ACÁ Y NO MÁS ABAJO. Lo que sigue —tope blando y tope duro—
    // ya se resuelve con `max` contra el declive, así que correrlo hacia adelante
    // empuja lo que haga falta y no puede dejar la cadena dada vuelta. Y no
    // arrastra al bloque entero a propósito: si el piso también corriera los dos
    // topes, un wing de mala longevidad terminaría jugando hasta los 40 igual que
    // el afortunado, y la tirada dejaría de decir nada sobre cuánto te dura.
    const decline = Math.max(DECLINE_FLOOR, peakEnd + 1, base.decline + fondo);
    const softCrudo = Math.max(decline, base.soft + fondo);
    // El tope duro se resuelve ANTES que el blando porque es quien manda: el
    // tope del juego puede recortarlo, y el blando tiene que quedar adentro de
    // lo que sobrevivió al recorte.
    const hard = Math.min(CAREER_HARD_CAP, Math.max(softCrudo + 1, base.hard + fondo));
    const soft = Math.min(softCrudo, hard - 1);

    return { debut: base.debut, peak: [peakStart, peakEnd], decline, soft, hard };
}

/**
 * La frase del REVELADO de la longevidad, al lado de la del perfil.
 *
 * Se bandea DESDE EL NÚMERO en vez de guardar una etiqueta, porque la etiqueta
 * sería una derivada congelada (CLAUDE de captain §1.9): mover
 * `LONGEVITY_MAX` dejaría el texto describiendo un reparto que ya no existe.
 */
export function longevityRevealText(years: number): string {
    if (years >= 2) return 'El cuerpo le aguantó todo: siguió jugando cuando su camada ya había colgado los botines.';
    if (years >= 1) return 'Le estiró la carrera un par de temporadas más que al resto de su puesto.';
    if (years <= -2) return 'El cuerpo le pasó factura temprano: se retiró antes de lo que su juego pedía.';
    if (years <= -1) return 'Se le acortó un poco la carrera: colgó los botines antes que sus contemporáneos.';
    return 'Le duró lo que a cualquiera en su puesto, ni un año más ni uno menos.';
}
