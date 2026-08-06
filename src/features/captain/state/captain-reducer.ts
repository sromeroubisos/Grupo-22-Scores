// EL CAPITÁN — el reducer.
//
// Puro con mutación local, calcando el patrón de `career/state/career-reducer.ts`:
//
//     structuredClone(state) → createRng(next.rngState) → mutar `next` con
//     helpers (state, rng) => void → next.rngState = rng.state
//
// El clon es lo que hace que "puro" y "cómodo de escribir" convivan: adentro se
// muta a gusto, afuera nadie ve el estado anterior cambiado.
//
// ── Dos reglas que no se rompen ──
//
// 1. ELEGIR EL ENTRENAMIENTO NO CONSUME AZAR POR ELEGIR. `CHOOSE_TRAINING` tira
//    para el Momento —eso pasa igual, se entrene lo que se entrene— pero la
//    carta elegida no cambia cuántas tiradas se hacen ni en qué orden. Es la
//    herencia de la regla que traía el reparto de fichas: si la elección
//    moviera el stream, dos partidas con la misma semilla dejarían de ser
//    comparables y el digest congelado dejaría de significar lo que dice.
//
//    El corolario práctico está en `aging.ts`: el ruido de la temporada se tira
//    SIEMPRE y una sola vez, haya carta o no.
//
// 2. LOS SORTEOS SE HACEN SIEMPRE, aunque el input traiga el valor. El dorsal
//    se sortea incluso cuando el jugador lo eligió, y recién después se pisa
//    con el elegido. Es la disciplina de `createInitialCareer`: si el tiro solo
//    se hiciera cuando falta el dato, el stream dependería del camino de
//    llamada y una partida rehecha desde una receta no sería la misma partida.

import type { CaptainState, CreateCaptainInput } from '../types/captain.ts';
import type { CaptainAttributeKey, CaptainPlayer } from '../types/player.ts';
import type { MatchBucket, MatchBudget } from '../types/season.ts';
import type { CaptainAction } from './captain-actions.ts';
import type { Rng } from '../engine/random.ts';

import { CAPTAIN_ENGINE_VERSION } from '../types/captain.ts';
import {
    POTENTIAL_MAX_GAP,
    POTENTIAL_MEAN_GAP,
    POTENTIAL_MIN_GAP,
    POTENTIAL_SD_GAP,
    START_AGE,
} from '../types/player.ts';
import { MONEY_START, OVR_MAX } from '../types/currencies.ts';
import { MATCH_BUCKETS, MATCH_CAP_PER_SEASON } from '../types/season.ts';
import { CAPTAIN_POSITIONS_VERSION, baseAttributes, getFamily } from '../data/positions.ts';
import { NORMALIZED_CATALOG_VERSION, clubExists } from '../data/catalogs.ts';
import { createRng } from '../engine/random.ts';
import { emptyBelonging } from '../engine/belonging.ts';
import { emptyDamage } from '../engine/damage.ts';
import { getTraining } from '../data/trainings.ts';
import { ovrFromAttributes } from '../engine/ovr.ts';
import { startingClub } from '../engine/clubs.ts';
import { createRival, emptyNational } from '../engine/national-team.ts';
import { getPendingEvent, rememberEvent, selectEvent } from '../engine/event-selector.ts';
import { applyDecision } from '../engine/apply-decision.ts';
import { simulateSeason } from '../engine/simulate-season.ts';
import { resolveMoment, rollMoment } from '../engine/moments.ts';

/** Cuánto puede desviarse un atributo de la plantilla al crear el jugador. */
const BASE_SPREAD = 3;

/**
 * Por qué se terminó la carrera. Son ids: la pantalla los traduce, así que
 * cambiar el texto de la UI no toca el estado guardado.
 */
export type RetirementReason = 'tope-del-puesto' | 'edad' | 'cuerpo' | 'decision';

function emptyMatchBudget(): MatchBudget {
    const planned = {} as Record<MatchBucket, number>;
    for (const bucket of MATCH_BUCKETS) planned[bucket] = 0;
    return { cap: MATCH_CAP_PER_SEASON, planned, played: 0 };
}

/**
 * Arranca una carrera. Todo lo que se sortea acá se sortea SIEMPRE y en este
 * orden: dorsal → atributos → potencial → club → archirrival.
 */
export function createInitialCaptain(input: CreateCaptainInput, seed: number): CaptainState {
    const rng = createRng(seed);
    const family = getFamily(input.family);

    // 1 · El dorsal. Se sortea siempre; el elegido lo pisa después, y solo si
    //     de verdad pertenece a la familia.
    const drawnNumber = rng.pick(family.numbers);
    const number = input.number !== undefined && family.numbers.includes(input.number)
        ? input.number
        : drawnNumber;

    // 2 · Los atributos. Se mueve la plantilla en ±3, en orden declarado: los
    //     cuatro de la familia y después el aguante. El resto queda en el piso.
    const attrs = baseAttributes(input.family);
    const varied: CaptainAttributeKey[] = [...family.attributes, 'aguante'];
    for (const key of varied) {
        attrs[key] = Math.max(1, attrs[key] + rng.int(-BASE_SPREAD, BASE_SPREAD));
    }

    // 3 · EL MATERIAL: la media de hoy más lo que le queda por crecer.
    //     Es la mitad SORTEADA del techo y nada más: la otra mitad arranca en
    //     cero y se construye jugando (`player.built`). Por eso lo que sale de
    //     acá no es el destino del jugador sino las cartas que le tocaron.
    const ovr = ovrFromAttributes(input.family, attrs);
    const potentialBase = Math.min(
        OVR_MAX,
        ovr + Math.round(rng.normal(POTENTIAL_MEAN_GAP, POTENTIAL_SD_GAP, POTENTIAL_MIN_GAP, POTENTIAL_MAX_GAP)),
    );

    // 4 · El club. Se sortea siempre, y el elegido lo pisa si existe.
    const sorteado = startingClub(input.countryCode, rng);
    const clubId = input.clubId && clubExists(input.clubId) ? input.clubId : sorteado;

    const player: CaptainPlayer = {
        name: input.name,
        surname: input.surname,
        age: START_AGE,
        family: input.family,
        number,
        attrs,
        ovr,
        potentialBase,
        built: 0,
        clubId,
        countryCode: input.countryCode,
        retired: false,
        retirementReason: null,
        flags: {},
    };

    // 5 · El otro tipo que juega en tu puesto.
    const rival = createRival(player, rng);

    return {
        version: CAPTAIN_ENGINE_VERSION,
        positionsVersion: CAPTAIN_POSITIONS_VERSION,
        clubCatalogVersion: NORMALIZED_CATALOG_VERSION,

        seed,
        rngState: rng.state,

        season: 1,
        stage: 'amateur',
        phase: 'offseason',
        signedProSeason: null,

        player,
        homeClubId: clubId,

        national: emptyNational(),
        rival,
        titles: [],
        offers: [],

        training: null,
        belonging: emptyBelonging(),
        fame: 0,
        money: MONEY_START,
        damage: emptyDamage(),

        matches: emptyMatchBudget(),

        pendingPlayingTime: 0,
        pendingStatBoost: 0,
        pendingSanction: 0,

        pendingMoment: null,
        moments: [],

        pendingEventId: null,
        recentEventIds: [],

        history: [],
        decisionLog: [],
    };
}

function retirePlayer(state: CaptainState, reason: RetirementReason): void {
    state.player.retired = true;
    state.player.retirementReason = reason;
    state.phase = 'retired';
}

/**
 * ¿Se terminó?
 *
 * Pasado el tope duro del puesto no hay chequeo: se termina y punto. Entre el
 * blando y el duro se tira, con probabilidad que crece linealmente. Y el cuerpo
 * pesa: con el desgaste alto, el tope blando llega antes de lo que dice la
 * tabla. Es la mitad de la verdad que faltaba — la carrera media dura 12,7
 * años, pero el 76% de los internacionales sigue a los diez y solo el 38% de
 * los que no lo son.
 */
function retireIfDue(state: CaptainState, rng: Rng): void {
    const curve = getFamily(state.player.family).age;
    const age = state.player.age;
    const cuerpo = state.damage.cuerpo;

    if (age >= curve.hard) {
        retirePlayer(state, 'tope-del-puesto');
        return;
    }

    // El cuerpo roto adelanta el tope blando hasta tres años.
    const soft = curve.soft - Math.min(3, Math.floor(cuerpo / 30));
    if (age >= soft) {
        const p = (age - soft) / Math.max(1, curve.hard - soft);
        if (rng.chance(p)) retirePlayer(state, cuerpo >= 60 ? 'cuerpo' : 'edad');
    }
}

export function captainReducer(state: CaptainState, action: CaptainAction): CaptainState {
    // Empezar de nuevo se puede siempre, incluso desde una carrera terminada.
    if (action.type === 'START') return createInitialCaptain(action.input, action.seed);

    // Retirado no se mueve más. Se mira la trayectoria y se empieza otra.
    if (state.phase === 'retired') return state;

    const next: CaptainState = structuredClone(state);
    const rng = createRng(next.rngState);

    switch (action.type) {
        case 'CHOOSE_TRAINING': {
            if (next.phase !== 'offseason') return state;

            // Una carta que no es de tu puesto no es una elección, igual que una
            // opción de evento que no existe: se devuelve el estado sin tocar y
            // sin haber consumido azar. La validación vive acá y no solo en la
            // pantalla, que es la misma regla que tenía el reparto.
            const training = getTraining(next.player.family, action.trainingId);
            if (!training) return state;
            next.training = training.id;

            // Acá se decide si la temporada trae una jugada decisiva. Va antes
            // de simular porque el Momento pasa DENTRO del año, no después: si
            // te vas al bunker en el minuto 63, esa suspensión te la comés en
            // esta temporada y no en la próxima.
            const moment = rollMoment(next, rng);
            if (moment) {
                next.pendingMoment = moment;
                next.phase = 'moment';
            } else {
                next.phase = 'season';
            }
            break;
        }

        case 'RESOLVE_MOMENT': {
            if (next.phase !== 'moment' || !next.pendingMoment) return state;

            // `resolveMoment` deja OTRO pendiente cuando la jugada encadena: el
            // tackle alto encadena el bunker con el veredicto ya sorteado, y de
            // ahí en adelante el jugador es espectador de su propio destino. La
            // cadena se resuelve a lo sumo una vez y eso lo garantiza
            // `nextChain`, no este `if`.
            // Una mano que no es de esta jugada no vale, igual que una opción
            // que no existe: se devuelve el estado sin tocar.
            const resolucion = resolveMoment(next, next.pendingMoment, action.outcome, rng);
            if (!resolucion) return state;
            next.moments.push(resolucion.record);

            if (!resolucion.continues) {
                next.pendingMoment = null;
                next.phase = 'season';
            }
            break;
        }

        case 'CHOOSE': {
            if (next.phase !== 'event' || next.pendingEventId === null) return state;

            // La tarjeta se reconstruye desde el estado, así que es la misma que
            // vio el jugador aunque haya recargado la página en el medio.
            const event = getPendingEvent(next);
            if (!event) return state;

            const result = applyDecision(next, event, action.optionId, rng);
            if (!result) return state;

            rememberEvent(next, event.id);
            next.pendingEventId = null;

            // El desenlace queda pegado a la temporada que se acaba de jugar.
            const ultima = next.history[next.history.length - 1];
            if (ultima) {
                ultima.decisionText = result.extra
                    ? `${result.outcome.resultText} ${result.extra}`
                    : result.outcome.resultText;
            }

            // Se pregunta por el jugador y no por la fase: una opción con
            // `retire` la mutó por dentro y TypeScript no ve la mutación.
            if (!next.player.retired) {
                closeAndOpenNext(next, rng);
            }
            break;
        }

        case 'ADVANCE': {
            if (next.phase !== 'season') return state;

            const report = simulateSeason(next, rng);

            // La jugada de la temporada se cuenta en la misma fila que el
            // resto: fue parte del año, no un anexo. Se buscan por temporada
            // porque un tackle alto deja DOS registros —el tackle y el bunker—
            // y los dos son la misma jugada.
            const jugadas = next.moments.filter((m) => m.season === next.season);
            if (jugadas.length > 0) {
                const linea = jugadas.map((m) => m.text).join(' ');
                report.entry.note = report.entry.note ? `${report.entry.note} ${linea}` : linea;
            }

            next.history.push(report.entry);

            // La decisión llega DESPUÉS de jugar: primero pasa el año y después
            // te pasa lo que te pasa. Si no hay decisión, se cierra derecho.
            const eventId = selectEvent(next, rng);
            if (eventId) {
                next.pendingEventId = eventId;
                next.phase = 'event';
                // Una tarjeta de mercado sin ofertas no existe: si el selector
                // la eligió y no se pudo armar, se sigue de largo.
                if (!getPendingEvent(next)) {
                    next.pendingEventId = null;
                    closeAndOpenNext(next, rng);
                }
            } else {
                closeAndOpenNext(next, rng);
            }
            break;
        }

        case 'RETIRE': {
            retirePlayer(next, 'decision');
            break;
        }
    }

    next.rngState = rng.state;
    return next;
}

/**
 * Cierra la temporada y abre la siguiente: envejece, chequea el retiro y deja la
 * pretemporada esperando que elijas de nuevo.
 *
 * Vive acá y no en `simulate-season.ts` porque no es parte de la temporada: es
 * lo que pasa entre una y la otra.
 */
function closeAndOpenNext(state: CaptainState, rng: Rng): void {
    state.season += 1;
    state.player.age += 1;

    retireIfDue(state, rng);
    if (state.player.retired) return;

    // La carta dura UNA temporada, como todo modificador de este motor. Si no se
    // limpiara, el entrenamiento del año tres seguiría subiendo atributos en el
    // doce sin que nadie lo hubiera vuelto a elegir.
    state.training = null;
    state.matches = emptyMatchBudget();
    state.pendingMoment = null;
    state.phase = 'offseason';
}
