// EL CAPITÁN — el armazón de los Momentos.
//
// Tres responsabilidades y nada más: decidir SI hay Momento esta temporada,
// calcular con qué márgenes se juega, y traducir lo que el jugador hizo a
// efectos sobre la temporada.
//
// Los quince minijuegos por puesto entran por acá sin tocar nada más: agregan
// su clave en `moment-kinds.ts`, su cálculo de márgenes y su resolución. El
// reducer, la temporada y el guardado no se enteran.

import type { CaptainPlayer } from '../types/player.ts';
import type { CaptainState } from '../types/captain.ts';
import type {
    BunkerVerdict,
    MomentOutcome,
    MomentRecord,
    PendingMoment,
    TackleZone,
} from '../types/moment.ts';
import type { Rng } from './random.ts';
import { MOMENT_LABEL } from '../types/moment-kinds.ts';
import { playingTimeOf } from './statistics.ts';
import { clubRatingOf } from './clubs.ts';

/** Probabilidad de que una temporada traiga un Momento. */
const MOMENT_PROB = 0.62;

/** Debajo de este tiempo de juego no te toca ninguna jugada decisiva. */
const MIN_SHARE = 0.3;

// ═══════════════════════════════════════════════════════════════════════════
//  ¿Hay Momento esta temporada?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Se decide al cerrar el reparto de tiempo, ANTES de simular.
 *
 * Usa `playingTimeOf`, que es pura: el que no juega no tiene jugada decisiva, y
 * eso no hace falta sortearlo. El único tiro es si la jugada aparece o no.
 *
 * REGLA 4 del diseño: nunca dos Momentos en la misma temporada. Por eso esto
 * devuelve uno o ninguno, y nunca una lista.
 */
export function rollMoment(state: CaptainState, rng: Rng): PendingMoment | null {
    const { share } = playingTimeOf(
        state.player,
        clubRatingOf(state.player.clubId),
        state.damage.cuerpo,
        state.pendingPlayingTime,
    );
    if (share < MIN_SHARE) return null;
    if (!rng.chance(MOMENT_PROB)) return null;

    // El contexto. Cuanto más tarde y más ajustado, más aprieta.
    const minute = rng.int(48, 79);
    const scoreDelta = rng.int(-6, 6);
    const pressure = Math.min(1, (minute - 40) / 45 + (6 - Math.abs(scoreDelta)) / 22);

    return { kind: 'tackle', minute, scoreDelta, pressure: Math.round(pressure * 100) / 100 };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EL TACKLE — los márgenes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los cortes de la barra, de 0 a 1 y en orden: frenar temprano es seguro,
 * frenar tarde es peligroso.
 *
 *   [0 ────── piernasEnd ────── legalEnd ────── altoEnd ────── 1]
 *      piernas         legal          alto ⚠️        tarde
 *
 * Que el orden sea ese no es estético: es la causalidad del tackle real. Llegar
 * antes te deja abajo —seguro, pero no frena el avance— y llegar tarde te sube
 * a la altura del hombro, que es donde empiezan las tarjetas.
 */
export interface TackleZones {
    piernasEnd: number;
    legalEnd: number;
    altoEnd: number;
    /** Cuánto tarda la barra en cruzar, en milisegundos. */
    sweepMs: number;
}

/**
 * El detalle que ningún juego modela y que acá es el corazón del sistema:
 * LA ZONA PELIGROSA CRECE CON EL DESGASTE. Un jugador roto en el minuto 75
 * tiene muchas más chances de irse expulsado, y eso es exactamente lo que pasa
 * en la realidad — el tackle causa la mitad de las lesiones del rugby y la
 * altura del tackle se va con las piernas.
 */
export function tackleZones(player: CaptainPlayer, bodyDamage: number, pressure: number): TackleZones {
    // El atributo de tackle ensancha la zona legal, de 26 a 38 puntos.
    const legal = 26 + Math.max(-6, Math.min(12, (player.attrs.tackle - 50) * 0.24));
    // El cuerpo castigado ensancha la zona alta, de 12 a 26.
    const alto = 12 + Math.min(14, bodyDamage * 0.14);
    // Lo que queda se reparte entre llegar temprano y llegar tarde.
    const resto = 100 - legal - alto;
    const piernas = resto * 0.52;

    const total = 100;
    return {
        piernasEnd: piernas / total,
        legalEnd: (piernas + legal) / total,
        altoEnd: (piernas + legal + alto) / total,
        sweepMs: Math.round(1450 - pressure * 520),
    };
}

/** En qué zona cae una posición de 0 a 1. */
export function zoneAt(pos: number, zones: TackleZones): TackleZone {
    if (pos < zones.piernasEnd) return 'piernas';
    if (pos < zones.legalEnd) return 'legal';
    if (pos < zones.altoEnd) return 'alto';
    return 'tarde';
}

// ═══════════════════════════════════════════════════════════════════════════
//  EL BUNKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El veredicto del oficial revisor.
 *
 * Es lo único del Momento que el jugador NO controla, así que es lo único que
 * sale del rng. Cuanto más adentro de la zona peligrosa frenaste, más chance de
 * que la amarilla suba a roja de veinte minutos.
 *
 * Desde el 6 Naciones 2026 la roja permanente quedó reservada a los actos de
 * matonaje; todo lo demás pasa por el bunker. Por eso acá no existe.
 */
export function bunkerVerdict(depth: number, rng: Rng): BunkerVerdict {
    return rng.chance(0.25 + depth * 0.45) ? 'roja-20' : 'amarilla';
}

// ═══════════════════════════════════════════════════════════════════════════
//  Resolución: de lo que hiciste a lo que le pasa a la temporada
// ═══════════════════════════════════════════════════════════════════════════

export interface MomentResolution {
    record: MomentRecord;
    /** Si el tackle salió alto, hay que ir al bunker antes de cerrar. */
    needsBunker: boolean;
}

/**
 * Aplica el resultado. Muta el estado —el reducer trabaja sobre un clon— y
 * devuelve la línea de crónica.
 *
 * Todo entra por carriles que ya existen: nada de campos nuevos por Momento.
 */
export function resolveMoment(
    state: CaptainState,
    moment: PendingMoment,
    outcome: MomentOutcome,
    rng: Rng,
): MomentResolution {
    if (outcome.kind === 'tackle') return resolveTackle(state, moment, outcome.zone, outcome.at, rng);
    // El veredicto ya estaba decidido cuando el jugador entró al bunker.
    return resolveBunker(state, moment.verdict ?? 'amarilla');
}

function resolveTackle(
    state: CaptainState,
    moment: PendingMoment,
    zone: TackleZone,
    at: number,
    rng: Rng,
): MomentResolution {
    const minuto = `Minuto ${moment.minute}`;

    if (zone === 'legal') {
        state.pendingStatBoost += 2;
        state.fame = Math.min(100, state.fame + 1.5);
        return {
            needsBunker: false,
            record: {
                season: state.season,
                kind: 'tackle',
                result: 'Tackle dominante',
                text: `${minuto}: lo frenaste en seco a dos metros de la línea y la pelota volvió para atrás.`,
            },
        };
    }

    if (zone === 'piernas') {
        return {
            needsBunker: false,
            record: {
                season: state.season,
                kind: 'tackle',
                result: 'Tackle a las piernas',
                text: `${minuto}: lo bajaste, pero de tan abajo que descargó igual y siguieron avanzando.`,
            },
        };
    }

    if (zone === 'tarde') {
        state.fame = Math.max(0, state.fame - 2);
        return {
            needsBunker: false,
            record: {
                season: state.season,
                kind: 'tackle',
                result: 'Te pasó por arriba',
                text: `${minuto}: llegaste tarde y te pasó por arriba. Try.`,
            },
        };
    }

    // Alto: se va al bunker. El veredicto se decide ACÁ —con el rng sembrado y
    // pesado por cuánto te pasaste— y la escena solo lo revela.
    const zones = tackleZones(state.player, state.damage.cuerpo, moment.pressure);
    const ancho = Math.max(0.001, zones.altoEnd - zones.legalEnd);
    const depth = Math.min(1, Math.max(0, (at - zones.legalEnd) / ancho));
    state.pendingMoment = { ...moment, kind: 'bunker', verdict: bunkerVerdict(depth, rng) };

    return {
        needsBunker: true,
        record: {
            season: state.season,
            kind: 'tackle',
            result: 'Tackle alto',
            text: `${minuto}: llegaste con el hombro a la altura de la cabeza. El referee cruzó los brazos.`,
        },
    };
}

function resolveBunker(state: CaptainState, verdict: BunkerVerdict): MomentResolution {
    if (verdict === 'roja-20') {
        // Todo juego sucio con contacto en la cabeza entra como mínimo en el
        // rango medio del Reglamento 17: seis semanas de punto de entrada.
        state.pendingSanction += 4;
        state.fame = Math.max(0, state.fame - 5);
        state.player.flags['tarjetas-rojas'] = (state.player.flags['tarjetas-rojas'] ?? 0) + 1;
        return {
            needsBunker: false,
            record: {
                season: state.season,
                kind: 'bunker',
                result: 'Roja de veinte',
                text: 'El oficial revisor la subió a roja. Te fuiste y el equipo jugó veinte minutos con catorce.',
            },
        };
    }

    state.pendingSanction += 1;
    state.fame = Math.max(0, state.fame - 1.5);
    state.player.flags['tarjetas-amarillas'] = (state.player.flags['tarjetas-amarillas'] ?? 0) + 1;
    return {
        needsBunker: false,
        record: {
            season: state.season,
            kind: 'bunker',
            result: 'Amarilla',
            text: 'Quedó en amarilla. Diez minutos afuera mirando cómo el partido se te iba de las manos.',
        },
    };
}

export { MOMENT_LABEL };
