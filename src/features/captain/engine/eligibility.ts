// EL CAPITÁN — a qué unión aspirás, y por qué.
//
// Regulación 8 VIGENTE de World Rugby.
// Fuente: https://www.world.rugby/organisation/governance/regulations/reg-8
//
//   8.1(a) nacimiento en el país;
//   8.1(b) padre/madre o abuelo/a nacido en el país;
//   8.1(c) 60 meses de registro EXCLUSIVO con una unión del país, consecutivos
//          e inmediatamente anteriores al partido;
//   8.1(d) 10 años de PRESENCIA física acumulada, sin exigencia de continuidad;
//   8.2    captura: al jugar por el seleccionado MAYOR de una unión, el jugador
//          queda atado a ella.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE DOS VECES EN EL REPO ───────────────────────
// Hay uno igual en `career/engine/eligibility.ts`, y no es una copia por
// descuido: `engine/__tests__/dependencies.test.ts` deja pasar exactamente dos
// puertas hacia Carrera de Rugby —`data/catalogs.ts` para los catálogos y
// `engine/random.ts` para el PRNG— y una regla de juego no entra por ninguna de
// las dos. Los catálogos se comparten porque el rugby es uno solo; los motores
// no, porque las dos calibraciones son distintas y el día que una se mueva la
// otra no tiene por qué enterarse.
//
// ── LA DIFERENCIA CON EL DE CARRERA, Y ES UNA SOLA ─────────────────────────
// Allá `nationalityCountryCode` puede ser `null` —se puede crear un jugador sin
// nacionalidad— y acá no: `CreateCaptainInput.countryCode` es obligatorio y la
// pantalla de creación no deja seguir sin elegir bandera. Así que los `null`
// que allá hay que arrastrar por toda la firma, acá no existen.
//
// ── SIMPLIFICACIONES DOCUMENTADAS (pendientes, no simuladas mal) ───────────
//   · 8.1(b) ascendencia: el motor NO inventa padres ni abuelos. El contrato la
//     admite y se puede sembrar, pero no se genera sola.
//   · 8.6/8.8 transferencia internacional (3 años de stand-down, cumplir 8.1(a)
//     o (b) con el destino, aprobación de World Rugby y UNA sola vez en la
//     vida): NO implementada. Después de la captura se bloquea el cambio de
//     unión de forma conservadora, que es el caso mayoritario.
//   · La presencia acumulada se aproxima con las temporadas jugadas en el país
//     del club: el motor no modela mudanzas fuera de la carrera deportiva.
//   · La nacionalización que ofrece `nt-cambiar-de-bandera` entra por la ruta
//     `naturalisation`, que no es una cláusula del 8.1: es el trámite resuelto
//     por afuera de la carrera deportiva. Ver `EligibilityRoute` para por qué no
//     se escribe como `registration-60m`.

import type { EligibilityClaim, EligibilityState } from '../types/captain.ts';
import { hasUnion } from '../data/catalogs.ts';

/** Versión del contrato de reglas. Sella la reproducibilidad del guardado. */
export const ELIGIBILITY_RULES_VERSION = 'wr-reg8-2022.1';

/** 8.1(c): 60 meses de registro exclusivo y consecutivo. */
export const REGISTRATION_MONTHS_REQUIRED = 60;

/** 8.1(d): 10 años de presencia acumulada. */
export const PRESENCE_MONTHS_REQUIRED = 120;

/**
 * Una temporada son doce meses de registro.
 *
 * ESPEJO de la unidad de tiempo del juego: El Capitán avanza de temporada en
 * temporada y no tiene meses. Si algún día una decisión partiera el año —media
 * temporada cedido a otro club—, este número deja de valer y hay que pasarle los
 * meses de verdad a `advanceRegistration`, que ya los recibe por parámetro
 * justamente para eso.
 */
const MONTHS_PER_SEASON = 12;

/**
 * El estado inicial. La única ruta que se siembra es la del 8.1(a), porque es la
 * única que la pantalla de creación pregunta: se elige una bandera y nada más.
 *
 * Un país sin unión modelada —los hay, y son la mayoría del planeta— arranca sin
 * ningún claim. Eso NO es un borde a parchear: es un jugador que puede tener una
 * carrera de club entera y no ser elegible para nadie, que es la verdad.
 */
export function createEligibility(nationalityCountryCode: string): EligibilityState {
    const claims: EligibilityClaim[] = [];
    if (hasUnion(nationalityCountryCode)) {
        claims.push({ union: nationalityCountryCode, route: 'birth' });
    }
    return {
        nationalityCountryCode,
        birthCountryCode: nationalityCountryCode,
        registeredUnion: null,
        registrationMonths: {},
        presenceMonths: {},
        claims,
        capturedBy: null,
    };
}

function addClaim(state: EligibilityState, union: string, route: EligibilityClaim['route']): void {
    if (!state.claims.some((c) => c.union === union)) state.claims.push({ union, route });
}

/**
 * Avanza una temporada de registro en la unión del club actual.
 *
 * · Cambiar de club DENTRO de la misma unión no corta nada: se sigue sumando.
 * · Cambiar de unión antes de completar los 60 meses REINICIA la continuidad, y
 *   ahí está la mitad interesante de la regla: el que se va a Francia a los 22 y
 *   vuelve a los 25 no acumuló nada en ninguna de las dos.
 * · La presencia del 8.1(d) nunca se reinicia. Es la puerta lenta: diez años en
 *   el mismo país aunque hayas ido y vuelto.
 * · Fichar NO concede elegibilidad por sí solo, y no cambia la nacionalidad.
 */
export function advanceRegistration(
    state: EligibilityState,
    union: string | null,
    months = MONTHS_PER_SEASON,
): void {
    if (union === null) {
        // Sin club resuelto no hay unión a la que atribuirle el registro. La
        // cuenta no avanza y tampoco se rompe: el año no cuenta para nadie.
        state.registeredUnion = null;
        return;
    }

    if (state.registeredUnion !== null && state.registeredUnion !== union) {
        // Se rompió la exclusividad: la cuenta consecutiva de la unión anterior
        // vuelve a cero. La presencia acumulada se conserva.
        state.registrationMonths[state.registeredUnion] = 0;
    }
    state.registeredUnion = union;

    state.registrationMonths[union] = (state.registrationMonths[union] ?? 0) + months;
    state.presenceMonths[union] = (state.presenceMonths[union] ?? 0) + months;

    if (!hasUnion(union)) return;
    if (state.registrationMonths[union] >= REGISTRATION_MONTHS_REQUIRED) {
        addClaim(state, union, 'registration-60m');
    } else if (state.presenceMonths[union] >= PRESENCE_MONTHS_REQUIRED) {
        addClaim(state, union, 'presence-10y');
    }
}

export function hasClaim(state: EligibilityState, union: string): boolean {
    return state.claims.some((c) => c.union === union);
}

/**
 * ¿Podés representar a esa unión hoy? Hace falta una ruta del 8.1 y no estar
 * capturado por otra (8.2). El cambio del 8.6 no está implementado.
 */
export function canRepresent(state: EligibilityState, union: string): boolean {
    if (!hasUnion(union)) return false;
    if (state.capturedBy !== null && state.capturedBy !== union) return false;
    return hasClaim(state, union);
}

/**
 * Las uniones que podrías representar hoy, en orden estable.
 *
 * El orden es el de `claims`, que es el orden en que se ganaron: primero el
 * nacimiento, después lo que construiste. Ordenar por otra cosa —alfabético, por
 * reputación— sería elegir por el jugador, y esta lista es para mostrarla.
 */
export function availableUnions(state: EligibilityState): string[] {
    return state.claims.map((c) => c.union).filter((u) => canRepresent(state, u));
}

/**
 * LA UNIÓN A LA QUE ASPIRÁS. La convocatoria lee esto y nunca `player.countryCode`.
 *
 * La captura manda sobre la nacionalidad, y esa precedencia es todo el punto: el
 * argentino que debutó con Italia aspira a Italia, no a Argentina, y no hay
 * decisión que lo vuelva atrás.
 */
export function targetUnion(state: EligibilityState): string | null {
    if (state.capturedBy !== null) return state.capturedBy;
    return hasUnion(state.nationalityCountryCode) ? state.nationalityCountryCode : null;
}

/** La captura del 8.2. Al debutar con la mayor quedás atado a esa unión. */
export function captureFor(state: EligibilityState, union: string): void {
    state.capturedBy = union;
}

/**
 * CAMBIAR DE BANDERA: aceptar la nacionalización que otra unión te ofrece.
 *
 * Las DOS mitades, y hacen falta las dos —esto es lo que faltaba y por eso la
 * decisión más grande del juego no hacía nada—:
 *
 *   · el CLAIM, porque `canRepresent` pide una ruta del 8.1 y sin ella la unión
 *     nueva te rechaza el mismo año que te nacionalizaste;
 *   · la CAPTURA, porque `targetUnion` lee `capturedBy` y sin ella seguís
 *     aspirando a la tuya de siempre, que es exactamente lo que pasaba: el
 *     jugador cantaba otro himno y la convocatoria lo seguía midiendo contra la
 *     vara de su unión de origen.
 *
 * Es irreversible por construcción y no por una guarda: con `capturedBy` puesto,
 * `canRepresent` cierra todas las demás. La tarjeta lo dice —«no hay vuelta
 * atrás: es para siempre»— y ahora el motor lo cumple.
 *
 * Devuelve `false` cuando no hay nada que cambiar —unión sin selección modelada,
 * o la que ya tenías— para que quien llame pueda no escribir una crónica que
 * miente. No tira: una tarjeta pidiendo lo imposible es un dato mal cargado, y
 * `events-shape.test.ts` es quien tiene que cazarlo.
 */
export function switchToUnion(state: EligibilityState, union: string): boolean {
    if (!hasUnion(union)) return false;
    if (state.capturedBy === union) return false;
    addClaim(state, union, 'naturalisation');
    state.capturedBy = union;
    return true;
}

/**
 * LA OTRA BANDERA QUE SE ESTÁ COCINANDO, con cuánto le falta.
 *
 * ── POR QUÉ ESTO EXISTE ────────────────────────────────────────────────────
 * El 8.1(c) ya se contaba —los meses corren, la exclusividad se rompe, el claim
 * aparece solo— y el jugador no se enteraba de nada hasta que ya había pasado.
 * O sea que la decisión más dramática del rugby real —dos banderas, un reloj
 * corriendo y una captura que cierra la puerta para siempre— existía entera
 * adentro del motor y producía una CONSECUENCIA en vez de una ELECCIÓN.
 *
 * Esto es la mitad que faltaba: el estado dicho de forma que una tarjeta lo
 * pueda leer y preguntar.
 *
 * ── LO QUE DEVUELVE ES LA MÁS AVANZADA, Y EL RECORRIDO VA ORDENADO ─────────
 * `registrationMonths` es un `Record`, así que iterarlo por orden de inserción
 * sería no-determinismo encubierto: dos uniones empatadas en meses darían una u
 * otra según en qué orden se hayan fichado los clubes (CLAUDE.md raíz §1). Se
 * ordenan las claves antes de recorrer y el empate lo rompe el código.
 *
 * `null` cuando no hay nada que preguntar: ya te capturaron —y entonces no hay
 * decisión, hay una camiseta—, o no acumulaste meses en ninguna otra parte.
 */
export interface SecondFlag {
    union: string;
    /** Meses de registro exclusivo acumulados con ella. */
    months: number;
    /** Los que faltan para el 8.1(c). Cero cuando el derecho ya está ganado. */
    remaining: number;
}

export function secondFlagOf(state: EligibilityState): SecondFlag | null {
    // Capturado no hay dos banderas: hay una y es la que jugaste.
    if (state.capturedBy !== null) return null;

    const propia = targetUnion(state);
    let mejor: SecondFlag | null = null;

    for (const union of Object.keys(state.registrationMonths).sort()) {
        if (union === propia || !hasUnion(union)) continue;
        const months = state.registrationMonths[union] ?? 0;
        // Cambiar de unión reinicia la cuenta a cero, así que un cero acá no es
        // «nunca estuvo»: es «estuvo y se le rompió la continuidad». En los dos
        // casos no hay reloj corriendo y no hay nada que preguntar.
        if (months <= 0) continue;

        if (mejor === null || months > mejor.months) {
            mejor = { union, months, remaining: Math.max(0, REGISTRATION_MONTHS_REQUIRED - months) };
        }
    }

    return mejor;
}

/** Elegibilidad sembrada por ascendencia (8.1(b)). El motor no la genera sola. */
export function grantAncestryClaim(
    state: EligibilityState,
    union: string,
    route: 'parent' | 'grandparent',
): void {
    if (hasUnion(union)) addClaim(state, union, route);
}
