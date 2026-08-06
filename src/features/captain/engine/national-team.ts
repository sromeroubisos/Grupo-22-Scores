// EL CAPITÁN — la escalera representativa.
//
// La segunda de las dos escaleras, y la que puede volverse profesional:
// seleccionado de tu unión → PlaDAR → Los Pumitas → Argentina XV → Los Pumas.
//
// ── Los caps valen más que los títulos ──
// Es la regla §5 del CLAUDE.md y acá se hace número: el Cartel que da un debut
// con la mayor es el doble que el de un título de liga, y la cabecera muestra
// los caps antes que la vitrina.
//
// ── La escasez del puesto ──
// De las cosas más ciertas del rugby y sin equivalente en fútbol: un pilar
// derecho de 74 va convocado y un wing de 74 no, porque hay quince wings que
// valen 74 y hay tres pilares en todo el país. Vive acá como puntos de media
// que el seleccionador te perdona.

import type { CaptainPlayer, PositionFamilyId } from '../types/player.ts';
import type { NationalRecord, Rival, SquadTrack } from '../types/captain.ts';
import type { Rng } from './random.ts';
import { SQUAD_TRACKS } from '../types/captain.ts';
import { fitsInSquad, isCupoTrack } from '../data/cohort.ts';
import { baseAttributes } from '../data/positions.ts';
import { ovrFromAttributes } from './ovr.ts';
import { hasUnion, unionReputation } from '../data/catalogs.ts';
import { FIRST_NAMES, SURNAMES } from '../data/names.ts';

/**
 * Puntos de media que el seleccionador perdona por lo escaso del puesto.
 *
 * El wing paga: hay quince que valen lo mismo. La primera línea cobra: se
 * aprende en años y una lesión deja a la unión sin nadie.
 */
// La banda es de dos puntos y no de cuatro. Con la anterior —de +3 a −1— el
// seleccionado terminaba siendo todo forwards: los backs promediaban CERO caps
// por carrera. Está medido. La escasez tiene que inclinar la balanza, no cerrar
// la puerta: Los Pumas tienen wings.
const SCARCITY: Record<PositionFamilyId, number> = {
    'primera-linea': 2,
    hooker: 2,
    'segunda-linea': 1,
    'tercera-linea': 0,
    'medio-scrum': 1,
    apertura: 1,
    centro: 0,
    'wing-fullback': 0,
};

/**
 * Media que pide cada escalón, antes de la unión y de la escasez.
 *
 * Calibrado contra la distribución real de techos del motor —campana con media
 * cerca de 65— para que la pirámide se parezca a la del rugby y no a la de un
 * juego generoso: con la tabla anterior el 45% de las carreras terminaba en la
 * mayor y el 61% pasaba por el M20. Está medido.
 *
 * Referencia con Argentina, que es reputación 3: unión 62, academia 66, M20 70,
 * seleccionado A 75, la mayor 79.
 */
const BASE_THRESHOLD: Record<Exclude<SquadTrack, 'club'>, number> = {
    union: 60,
    academia: 63.5,
    m20: 67,
    'a-xv': 71,
    nacional: 74,
};

/** Cuánto sube el listón por cada punto de reputación de la unión (0–5). */
const REPUTATION_WEIGHT: Record<Exclude<SquadTrack, 'club'>, number> = {
    union: 0.6,
    academia: 0.8,
    m20: 1.0,
    'a-xv': 1.3,
    nacional: 1.6,
};

/** Ventanas de edad. Fuera de rango, el escalón no existe para vos. */
const AGE_WINDOW: Partial<Record<SquadTrack, [number, number]>> = {
    union: [17, 40],
    academia: [17, 21],
    m20: [18, 20],
};

export const TRACK_LABEL: Record<SquadTrack, string> = {
    club: 'Solo el club',
    union: 'Seleccionado de tu unión',
    academia: 'Academia / PlaDAR',
    m20: 'M20',
    'a-xv': 'Seleccionado A',
    nacional: 'La mayor',
};

export function trackIndex(track: SquadTrack): number {
    return SQUAD_TRACKS.indexOf(track);
}

export function higherTrack(a: SquadTrack, b: SquadTrack): SquadTrack {
    return trackIndex(a) >= trackIndex(b) ? a : b;
}

/** La media que te pide un escalón, con tu unión y tu puesto ya descontados. */
export function thresholdFor(track: Exclude<SquadTrack, 'club'>, player: CaptainPlayer): number {
    const rep = unionReputation(player.countryCode);
    return BASE_THRESHOLD[track] + rep * REPUTATION_WEIGHT[track] - SCARCITY[player.family];
}

/**
 * Hasta dónde llegás esta temporada.
 *
 * Se recorre de arriba hacia abajo y gana el primero que alcanzás: nadie juega
 * el M20 si ya está en la mayor. Sin unión —hay países sin federación— no hay
 * escalera y te quedás en el club, que es la verdad y no un castigo.
 */
export function reachableTrack(player: CaptainPlayer, rivalOvr: number | null = null): SquadTrack {
    if (!hasUnion(player.countryCode)) return 'club';

    const escalones: Exclude<SquadTrack, 'club'>[] = ['nacional', 'a-xv', 'm20', 'academia', 'union'];
    for (const track of escalones) {
        const ventana = AGE_WINDOW[track];
        if (ventana && (player.age < ventana[0] || player.age > ventana[1])) continue;

        // Los tres de abajo son CUPOS: hay treinta camisetas de Pumitas y no
        // infinitas, así que no alcanza con superar un número — hay que estar
        // entre los mejores de tu camada EN TU PUESTO. Los dos de arriba siguen
        // por umbral a propósito: el techo del juego ya está en objetivo y el
        // problema medido era el piso (`data/cohort.ts`).
        if (isCupoTrack(track)) {
            const arranque = ovrFromAttributes(player.family, baseAttributes(player.family));
            if (fitsInSquad(track, player.family, player.ovr, arranque, player.age, rivalOvr)) return track;
            continue;
        }

        if (player.ovr >= thresholdFor(track, player)) return track;
    }
    return 'club';
}

/**
 * Cuántos caps sumás esta temporada.
 *
 * Solo la mayor da caps: el M20 y la academia son escalones, no partidos que
 * cuenten. El tope de la ventana internacional es real —las dos ventanas más el
 * torneo del año dan una decena larga de tests— y el archirrival se lleva su
 * parte: en cada convocatoria entra uno de los dos.
 */
export function capsThisSeason(
    player: CaptainPlayer,
    track: SquadTrack,
    rival: Rival | null,
    rng: Rng,
): number {
    if (track !== 'nacional') return 0;

    const margen = player.ovr - thresholdFor('nacional', player);
    // Recién llegado juega poco; el indiscutido juega todo. El tope es la
    // ventana real: dos ventanas de tres tests más el torneo del año.
    const base = 2 + Math.min(6, Math.max(0, margen)) * 0.7;

    let caps = rng.normal(base, 1.5, 1, 9);

    // El otro tipo que juega en tu puesto. Si está mejor que vos, te come la
    // convocatoria; si está peor, la camiseta es tuya.
    if (rival && rival.ovr >= thresholdFor('nacional', player)) {
        const diferencia = player.ovr - rival.ovr;
        caps *= Math.min(1.25, Math.max(0.35, 0.8 + diferencia * 0.06));
    }

    return Math.max(0, Math.round(caps));
}

/** El registro vacío con el que arranca cualquier carrera. */
export function emptyNational(): NationalRecord {
    return { track: 'club', bestTrack: 'club', caps: 0, debutSeason: null };
}

/**
 * El archirrival: nació el mismo año que vos y juega en tu puesto.
 *
 * Arranca apenas por encima —para que la pelea exista desde el principio— y
 * después crece solo, sin depender de lo que hagas vos. Es una presencia, no
 * una reacción.
 */
export function createRival(player: CaptainPlayer, rng: Rng): Rival {
    return {
        name: rng.pick(FIRST_NAMES),
        surname: rng.pick(SURNAMES),
        ovr: player.ovr + rng.int(1, 5),
        caps: 0,
    };
}

/**
 * El rival también envejece.
 *
 * Sube parejo hasta el pico y después afloja, con su propio ruido. No mira lo
 * que hiciste vos: si lo hiciera, el juego se volvería una goma que siempre te
 * empata, y eso se nota.
 */
export function ageRival(rival: Rival, age: number, rng: Rng): Rival {
    const delta = age < 26 ? rng.float(1.1, 2.6)
        : age < 30 ? rng.float(-0.2, 0.8)
            : rng.float(-2.4, -0.4);
    return {
        ...rival,
        ovr: Math.min(99, Math.max(30, Math.round(rival.ovr + delta))),
    };
}
