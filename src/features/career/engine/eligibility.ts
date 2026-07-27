// Elegibilidad internacional según la Regulación 8 VIGENTE de World Rugby.
// Fuente: https://www.world.rugby/organisation/governance/regulations/reg-8
//
// Criterios del 8.1 tal como están hoy (ojo: el texto viejo hablaba de 36 meses
// de residencia; el vigente exige 60 meses de REGISTRO EXCLUSIVO, que no es lo
// mismo que residir):
//   8.1(a) nacimiento en el país;
//   8.1(b) padre/madre o abuelo/a nacido en el país;
//   8.1(c) 60 meses de registro EXCLUSIVO con una unión del país, consecutivos
//          e inmediatamente anteriores al partido;
//   8.1(d) 10 años de PRESENCIA física acumulada (no requiere continuidad).
//   8.2    captura: al jugar por el seleccionado mayor de una unión, el jugador
//          queda atado a ella.
//
// Se separan cuatro cosas que antes eran un solo campo `nationality`:
//   · nationalityCountryCode → identidad, bandera y rutas migratorias
//   · birthCountryCode       → 8.1(a)
//   · registeredUnion        → unión con la que está registrado HOY (club actual)
//   · capturedBy             → unión que lo capturó (8.2), si ya debutó
//
// SIMPLIFICACIONES DOCUMENTADAS (pendientes, no simuladas mal):
//   · 8.1(b) ascendencia: el motor NO inventa padres ni abuelos. El contrato
//     admite la ruta y se puede sembrar, pero no se genera sola.
//   · 8.6/8.8 transferencia internacional (3 años de stand-down + cumplir
//     8.1(a) o (b) con el destino + aprobación de World Rugby + UNA vez en la
//     vida): NO implementada. Tras la captura se bloquea el cambio de unión de
//     forma conservadora, que es el caso mayoritario.
//   · La "presencia acumulada" se aproxima con las temporadas jugadas en el
//     país del club: el motor no modela mudanzas fuera de la carrera deportiva.

import type { EligibilityClaim, EligibilityState, Player } from '../types/player.ts';
import { hasUnion } from '../data/nations.ts';

/** Versión del contrato de reglas de elegibilidad (sella la reproducibilidad). */
export const ELIGIBILITY_RULES_VERSION = 'wr-reg8-2022.1';

/** 8.1(c): 60 meses de registro exclusivo, consecutivos. */
export const REGISTRATION_MONTHS_REQUIRED = 60;
/** 8.1(d): 10 años de presencia acumulada. */
export const PRESENCE_MONTHS_REQUIRED = 120;

const MONTHS_PER_SEASON = 12;

/**
 * Estado inicial. Por defecto el país de nacimiento es el de la nacionalidad
 * elegida (la UI solo pregunta eso) y de ahí sale la única ruta: 8.1(a).
 * No se inventa ascendencia.
 */
export function createEligibility(nationalityCountryCode: string | null): EligibilityState {
    const claims: EligibilityClaim[] = [];
    if (hasUnion(nationalityCountryCode)) {
        claims.push({ union: nationalityCountryCode as string, route: 'birth' });
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
 * · Cambiar de unión antes de completar los 60 meses REINICIA la continuidad
 *   (el 8.1(c) exige registro exclusivo y consecutivo).
 * · La presencia acumulada del 8.1(d) nunca se reinicia.
 * · Un fichaje NO cambia la nacionalidad ni concede elegibilidad por sí solo.
 */
export function advanceRegistration(state: EligibilityState, union: string | null, months = MONTHS_PER_SEASON): void {
    if (union === null) {
        // Franquicia multinacional: no se puede atribuir registro a una unión.
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
 * ¿Puede representar a esa unión hoy? Necesita una ruta del 8.1 y no estar
 * capturado por otra (8.2). El cambio de unión del 8.6 no está implementado.
 */
export function canRepresent(state: EligibilityState, union: string): boolean {
    if (!hasUnion(union)) return false;
    if (state.capturedBy !== null && state.capturedBy !== union) return false;
    return hasClaim(state, union);
}

/** Uniones representables hoy, en orden estable. */
export function availableUnions(state: EligibilityState): string[] {
    return state.claims.map((c) => c.union).filter((u) => canRepresent(state, u));
}

/**
 * Unión a la que aspira el jugador: la que ya lo capturó o, si no, la de su
 * nacionalidad. La convocatoria NUNCA vuelve a leer `player.nationality`.
 */
export function targetUnion(state: EligibilityState): string | null {
    if (state.capturedBy !== null) return state.capturedBy;
    const code = state.nationalityCountryCode;
    return hasUnion(code) ? code : null;
}

/** Captura del 8.2: al debutar queda atado a esa unión. */
export function captureFor(state: EligibilityState, union: string): void {
    state.capturedBy = union;
}

/** Elegibilidad sembrada por ascendencia (8.1(b)). El motor no la genera sola. */
export function grantAncestryClaim(state: EligibilityState, union: string, route: 'parent' | 'grandparent'): void {
    if (hasUnion(union)) addClaim(state, union, route);
}

/** Acceso de conveniencia desde el jugador. */
export function playerCanRepresent(player: Player, union: string): boolean {
    return canRepresent(player.eligibility, union);
}
