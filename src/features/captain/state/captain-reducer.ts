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
// 1. REPARTIR TIEMPO NO CONSUME AZAR. `SPEND_TIME` y `UNSPEND_TIME` no tocan el
//    rng. Si lo tocaran, la carrera dependería de cuántas veces dudaste antes
//    de confirmar el reparto, que es exactamente la clase de no-determinismo
//    encubierto que arruina un motor sembrado.
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
import { START_AGE } from '../types/player.ts';
import { MONEY_START, OVR_MAX } from '../types/currencies.ts';
import { MATCH_BUCKETS, MATCH_CAP_PER_SEASON } from '../types/season.ts';
import { CAPTAIN_POSITIONS_VERSION, baseAttributes, getFamily } from '../data/positions.ts';
import { NORMALIZED_CATALOG_VERSION, clubExists } from '../data/catalogs.ts';
import { createRng } from '../engine/random.ts';
import { emptyBelonging } from '../engine/belonging.ts';
import { emptyDamage } from '../engine/damage.ts';
import { isTimeBudgetFull, resetTimeBudget, spendToken, unspendToken } from '../engine/time-budget.ts';
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
 * El margen de crecimiento que se sortea al nacer.
 *
 * NORMAL Y NO UNIFORME, y esa es la decisión: con un sorteo plano entre +10 y
 * +34, la media de techo quedaba en 73 y el 45% de los pibes terminaba jugando
 * para la mayor. Está medido. Una campana centrada en +14 deja la media de
 * techo cerca de 65 y manda los 80 a la cola, que es donde viven.
 *
 * Que la mayoría de las carreras terminen en un club de barrio no es un defecto
 * del balance: es el rugby. Y es lo que hace que llegar signifique algo.
 */
const POTENTIAL_MEAN_GAP = 14;
const POTENTIAL_SD_GAP = 8;
const POTENTIAL_MIN_GAP = 4;
const POTENTIAL_MAX_GAP = 40;

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

    // 3 · El potencial: la media de hoy más lo que le queda por crecer.
    const ovr = ovrFromAttributes(input.family, attrs);
    const potential = Math.min(
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
        potential,
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

        time: resetTimeBudget(),
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

    // ── Reparto de Tiempo: aritmética pura, sin tocar el rng ────────────────
    if (action.type === 'SPEND_TIME' || action.type === 'UNSPEND_TIME') {
        if (state.phase !== 'offseason') return state;
        const time = action.type === 'SPEND_TIME'
            ? spendToken(state.time, action.slot)
            : unspendToken(state.time, action.slot);
        // Si no cambió nada —no quedaban fichas, o esa ranura estaba en cero—
        // se devuelve el mismo estado y no un clon idéntico.
        if (time === state.time) return state;
        return { ...state, time };
    }

    const next: CaptainState = structuredClone(state);
    const rng = createRng(next.rngState);

    switch (action.type) {
        case 'CONFIRM_TIME': {
            // El botón se habilita recién con las seis puestas, y el modelo lo
            // vuelve a chequear: la regla no puede vivir solo en la pantalla.
            if (next.phase !== 'offseason' || !isTimeBudgetFull(next.time)) return state;

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
 * Cierra la temporada y abre la siguiente: envejece, chequea el retiro y deja
 * el presupuesto listo para repartir de nuevo.
 *
 * Vive acá y no en `simulate-season.ts` porque no es parte de la temporada: es
 * lo que pasa entre una y la otra.
 */
function closeAndOpenNext(state: CaptainState, rng: Rng): void {
    state.season += 1;
    state.player.age += 1;

    retireIfDue(state, rng);
    if (state.player.retired) return;

    state.time = resetTimeBudget();
    state.matches = emptyMatchBudget();
    state.pendingMoment = null;
    state.phase = 'offseason';
}
