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

import type { CaptainState, CreateCaptainInput, SquadTrack } from '../types/captain.ts';
import type { PendingTournament } from '../types/tournament.ts';
import type { CaptainAttributeKey, CaptainPlayer } from '../types/player.ts';
import type { MatchBucket, MatchBudget } from '../types/season.ts';
import type { CaptainAction } from './captain-actions.ts';
import type { Rng } from '../engine/random.ts';

import { CAPTAIN_ENGINE_VERSION, SQUAD_TRACKS } from '../types/captain.ts';
import {
    POTENTIAL_MAX_GAP,
    POTENTIAL_MEAN_GAP,
    POTENTIAL_SD_GAP,
    START_AGE,
    potentialGapMin,
} from '../types/player.ts';
import { FAME_MAX, FAME_MIN, MONEY_START, OVR_MAX } from '../types/currencies.ts';
import { MATCH_BUCKETS, MATCH_CAP_PER_SEASON } from '../types/season.ts';
import { CAPTAIN_POSITIONS_VERSION, baseAttributes, getFamily } from '../data/positions.ts';
import { NORMALIZED_CATALOG_VERSION, clubExists } from '../data/catalogs.ts';
import { createRng, truncatedNormal } from '../engine/random.ts';
import { emptyBelonging } from '../engine/belonging.ts';
import { emptyDamage } from '../engine/damage.ts';
import { getTraining } from '../data/trainings.ts';
import { buyShopItem } from '../engine/shop.ts';
import { ovrFromAttributes } from '../engine/ovr.ts';
import { startingClub } from '../engine/clubs.ts';
import { resolveAgeCurve, rollDevelopmentProfile, rollLongevity } from '../engine/development-profile.ts';
import type { RetirementReason } from '../engine/retirement.ts';
import { farewellClosed, resolveRetirement } from '../engine/retirement.ts';
import { createRival, emptyNational } from '../engine/national-team.ts';
import { createEligibility } from '../engine/eligibility.ts';
import { getPendingEvent, marketDue, rememberEvent, selectEvent } from '../engine/event-selector.ts';
import { MARKET_EVENT_ID } from '../data/events/index.ts';
import { applyDecision } from '../engine/apply-decision.ts';
import { simulateSeason } from '../engine/simulate-season.ts';
import { resolveMoment, rollMoment } from '../engine/moments.ts';
import { applyBelonging } from '../engine/belonging.ts';
import { belongingSituation } from '../engine/contracts.ts';
import { getTournament } from '../data/tournaments.ts';
import {
    buildMatch,
    casillasResultado,
    closeTournament,
    hasPlacement,
    matchResult,
    survives,
    openRound,
    qualified,
    roundAfter,
} from '../engine/tournament.ts';
import {
    buildCtxOf,
    canUseComodin,
    comodinesFor,
    openTournament,
    partidoParaRehacer,
    proximoConGrilla,
    rewardOf,
    tournamentDue,
} from '../engine/tournament-gate.ts';
import { ARBITRO_TACHADAS, tournamentCompetitionId } from '../types/tournament.ts';
import { hashSeed } from '../engine/random.ts';

/** Cuánto puede desviarse un atributo de la plantilla al crear el jugador. */
const BASE_SPREAD = 3;

/**
 * Por qué se terminó la carrera. Vive en `engine/retirement.ts`, con la regla
 * que lo produce, y se re-exporta desde acá porque es de donde lo pide el resto
 * del proyecto desde antes de que la regla se mudara.
 */
export type { RetirementReason };

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
    // TRUNCADA, no recortada: `rng.normal(…, min, max)` aplasta la cola contra
    // el borde y convierte el margen mínimo en el resultado más probable del
    // juego (11,9% medido con la campana vieja). El porqué completo está en
    // `engine/random.ts` y en `POTENTIAL_MIN_GAP`.
    //
    // EL PISO SALE DE `potentialGapMin` Y NO DE `POTENTIAL_MIN_GAP`, y esa es la
    // diferencia entera: el piso del juego está declarado en el TECHO
    // (`POTENTIAL_FLOOR`, 84) y no en el margen, así que cada puesto necesita un
    // margen distinto para alcanzarlo — la base de un pilar no es la de un wing.
    // Se aplica moviendo el borde de la truncada y no recortando el resultado,
    // porque recortar apilaría en 84 exacto a media población.
    const potentialBase = Math.min(
        OVR_MAX,
        ovr + Math.round(truncatedNormal(rng, POTENTIAL_MEAN_GAP, POTENTIAL_SD_GAP, potentialGapMin(ovr), POTENTIAL_MAX_GAP)),
    );

    // 3b · LA FORMA de la carrera. Va inmediatamente después del material porque
    //      es la otra mitad de lo que te tocó: aquello dice cuánto podés llegar
    //      a valer y esto, cuándo y por cuánto tiempo. El reparto del perfil lo
    //      decide el puesto —los backs maduran antes—; el de la longevidad es
    //      parejo, porque la diferencia entre puestos ya está en la curva. El
    //      jugador no se entera de ninguno de los dos hasta el retiro.
    const developmentProfile = rollDevelopmentProfile(input.family, rng);
    const longevity = rollLongevity(rng);

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
        developmentProfile,
        longevity,
        built: 0,
        clubId,
        countryCode: input.countryCode,
        retired: false,
        retirementReason: null,
        flags: {},
        shop: [],
        injuryLoss: {},
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

        national: emptyNational(createEligibility(input.countryCode)),
        rival,
        titles: [],
        offers: [],
        // Sin contrato: la carrera arranca en un club amateur y ahí sos socio, no
        // empleado. El primero se firma cuando llega la primera oferta profesional.
        contract: null,

        awards: [],
        milestones: [],
        divisions: {},
        lastStanding: null,

        training: null,
        belonging: emptyBelonging(),
        fame: 0,
        money: MONEY_START,
        damage: emptyDamage(),

        matches: emptyMatchBudget(),

        pendingPlayingTime: 0,
        pendingStatBoost: 0,
        pendingSanction: 0,
        pendingInjury: 0,

        pendingTournament: null,
        tournaments: [],

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
 * La regla vive entera en `engine/retirement.ts`. Acá queda solo el armado del
 * insumo, que es lo único que necesita conocer la forma del estado: la curva de
 * ESTE jugador —no la de su puesto, que es el bug que `resolveAgeCurve` vino a
 * cerrar— más las tres cosas que lo sostienen.
 *
 * LA MEJOR MEDIA Y EL TIEMPO DE JUEGO SE DERIVAN DE `history`, que ya los
 * contiene. Guardarlos sería una segunda fuente de verdad que un pase mal
 * escrito puede desincronizar, y encima obligaría a migrar el guardado.
 */
function retireIfDue(state: CaptainState, rng: Rng): void {
    const ultima = state.history[state.history.length - 1];

    const reason = resolveRetirement({
        curve: resolveAgeCurve(state.player),
        age: state.player.age,
        body: state.damage.cuerpo,
        share: ultima?.share ?? 0,
        ovr: state.player.ovr,
        bestOvr: state.history.reduce((mayor, h) => Math.max(mayor, h.ovr), state.player.ovr),
        caps: state.national.caps,
        // LA DESPEDIDA, derivada de la marca que dejó la vuelta a casa. Se
        // pregunta con la temporada YA avanzada —este chequeo corre después del
        // `season += 1`— así que el año que la tarjeta prometió es un año que se
        // jugó de verdad.
        farewellClosed: farewellClosed(state.player, state.season),
    }, rng);

    if (reason) retirePlayer(state, reason);
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

            // El desenlace queda pegado a la temporada que se acaba de jugar, y
            // se SUMA en vez de pisar: desde que el mercado corre como paso
            // propio, una temporada puede traer DOS decisiones y la segunda
            // borraba la crónica de la primera. Se notaba justo donde más
            // importa —el año que firmás profesional, que además es el que trae
            // la tarjeta que lo cuenta— y no fallaba nada.
            const ultima = next.history[next.history.length - 1];
            if (ultima) {
                const texto = result.extra
                    ? `${result.outcome.resultText} ${result.extra}`
                    : result.outcome.resultText;
                ultima.decisionText = ultima.decisionText ? `${ultima.decisionText} ${texto}` : texto;
            }

            // Se pregunta por el jugador y no por la fase: una opción con
            // `retire` la mutó por dentro y TypeScript no ve la mutación.
            if (!next.player.retired) {
                // La tarjeta del mercado es la ÚLTIMA de la temporada: después de
                // ella se cierra el año. Cualquier otra la deja pendiente.
                if (event.id === MARKET_EVENT_ID) closeAndOpenNext(next, rng);
                else openMarketOrClose(next, rng);
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

            // EL TORNEO VA ANTES QUE LA DECISIÓN Y DESPUÉS DE LA TEMPORADA, y
            // el orden es el del calendario: la ventana internacional cae con la
            // liga ya jugada, y lo que te pasa después —una oferta, una
            // lesión— te pasa habiendo vuelto del torneo. Al revés, te irías al
            // Mundial con un pase ya firmado a un club donde todavía no jugaste.
            const torneo = tournamentDue(next);
            if (torneo) {
                next.pendingTournament = openTournament(next, torneo);
                next.phase = 'tournament';
                break;
            }

            openEventOrClose(next, rng);
            break;
        }

        case 'CHOOSE_COMODIN': {
            if (next.phase !== 'tournament' || !next.pendingTournament) return state;
            const t = next.pendingTournament;
            // Una vez y nada más: reelegir con el primer resultado a la vista
            // sería elegir sabiendo, y ahí se termina la decisión.
            if (t.comodin !== null) return state;

            // Un comodín que no te corresponde no es una elección, igual que una
            // opción de evento que no existe: se devuelve el estado sin tocar.
            // La validación vive acá y no sólo en la pantalla, que es la misma
            // regla que tenía el reparto de fichas.
            const def = getTournament(t.id);
            if (!comodinesFor(next, def).some((c) => c.id === action.comodin)) return state;

            t.comodin = action.comodin;
            break;
        }

        case 'USE_COMODIN': {
            if (next.phase !== 'tournament' || !next.pendingTournament) return state;
            const t = next.pendingTournament;
            if (!canUseComodin(t, next)) return state;

            const def = getTournament(t.id);

            // ── LOS TRES VERBOS, en un `switch` sobre un tipo cerrado ───────
            // `ComodinId` es una unión de tres, así que un comodín nuevo sin
            // caso acá NO compila: es la medicina del §1.5 del CLAUDE de captain
            // —estrechar el tipo para que el `default` quede en `never`— y está
            // escrita justamente donde ya se pagó una vez, cuando el `default`
            // de `moments.ts` le mandó una mano de tackle a una corrida.
            if (t.comodin === 'arenga') {
                // REARMA el partido que viene, no corrige el que salió: un
                // vestuario empuja ANTES. Se rearma con la misma semilla de
                // ronda y el empuje adentro, así que el resultado con arenga es
                // tan determinista como el de sin — y un F5 después de arengar
                // devuelve el partido arengado, no otro.
                const idx = t.matches.findIndex((m) => !m.revealed);
                if (idx < 0) return state;
                const ronda = t.matches[idx].round;
                const enRonda = t.matches.filter((m) => m.round === ronda).indexOf(t.matches[idx]);
                t.matches[idx] = buildMatch(t, buildCtxOf(next, def), ronda, enRonda, true);
            } else if (t.comodin === 'arbitro') {
                const idx = proximoConGrilla(t);
                if (idx === null) return state;
                const grid = t.matches[idx].grid;
                if (!grid) return state;
                // Se tachan PERDEDORAS y en orden creciente de índice: nada de
                // sortear cuáles. El azar acá no agregaría nada —todas las
                // celdas perdedoras son indistinguibles para el jugador— y sí
                // consumiría el stream del torneo, que es lo que hace que un F5
                // devuelva el mismo tablero.
                const perdedoras = grid.celdas
                    .map((gana, i) => ({ gana, i }))
                    .filter((c) => !c.gana)
                    .map((c) => c.i);
                // NUNCA SE TACHAN TODAS. Si quedaran sólo celdas ganadoras, el
                // comodín dejaría de ser información y pasaría a ser el
                // resultado, que es la línea que `CasillasGrid.tachada` ya no
                // cruza. Se deja al menos una perdedora en pie.
                grid.tachadas = perdedoras.slice(0, Math.min(ARBITRO_TACHADAS, perdedoras.length - 1));
            } else {
                const idx = partidoParaRehacer(t);
                if (idx === null) return state;
                const ronda = t.matches[idx].round;
                const enRonda = t.matches.filter((m) => m.round === ronda).indexOf(t.matches[idx]);
                // ── LA SEMILLA TIENE QUE CAMBIAR, Y ESA ES TODA LA MECÁNICA ──
                // Rehacer con la misma semilla devolvería el mismo marcador: el
                // torneo se sortea entero al abrirse, así que `buildMatch` con
                // los mismos argumentos es una función pura de ellos. El
                // reemplazo entra por el rng de la carrera —que en este paso ya
                // está corriendo— porque es una decisión del jugador y no un
                // dato del torneo: dos partidas con la misma semilla que eligen
                // distinto acá TIENEN que divergir.
                const rehecho = buildMatch(
                    { ...t, seed: hashSeed(`${t.seed}:plan:${rng.int(1, 1_000_000)}`) },
                    buildCtxOf(next, def),
                    ronda,
                    enRonda,
                    false,
                );
                // El rival NO cambia: se rejuega el mismo partido, no otro. Es
                // un cambio de plan y no un cambio de fixture.
                t.matches[idx] = {
                    ...rehecho,
                    rivalCode: t.matches[idx].rivalCode,
                    rivalName: t.matches[idx].rivalName,
                    revealed: true,
                };
            }

            t.comodinUsed = true;
            break;
        }

        case 'REVEAL_MATCH': {
            if (next.phase !== 'tournament' || !next.pendingTournament) return state;
            const t = next.pendingTournament;

            // LA CELDA QUE TOCÓ, no la que sigue. Las tres guardas son las de
            // siempre: una celda que no existe, una ya destapada o una de otra
            // ronda no son una jugada, y se devuelve el estado sin tocar.
            const match = t.matches[action.index];
            if (!match || match.revealed) return state;
            if (match.round !== t.round) return state;
            // Una final que se JUEGA no se destapa. El guardia vive acá y no en la
            // pantalla: la pantalla ya no ofrece el botón, pero el reducer no
            // puede confiar en eso.
            if (match.casillas) return state;

            // EL PARTIDO CON GRILLA NO SE DESTAPA: SE ABRE. Tocarlo en el cuadro
            // pone su grilla de treinta en pantalla, y el resultado sale recién
            // cuando el jugador elige una celda. `playing` vive en el estado y no
            // en la pantalla para que un F5 devuelva la grilla abierta y no la
            // chance de volver a entrar.
            if (match.grid) {
                t.playing = action.index;
                break;
            }

            match.revealed = true;
            advanceAfterMatch(next, t, match);
            break;
        }

        case 'PICK_GRID': {
            if (next.phase !== 'tournament' || !next.pendingTournament) return state;
            const t = next.pendingTournament;
            if (t.playing === null) return state;

            const match = t.matches[t.playing];
            if (!match?.grid || match.revealed) return state;
            const grid = match.grid;

            // Una celda que no existe o una segunda elección no son una jugada:
            // un partido, una celda.
            const i = action.index;
            if (i < 0 || i >= grid.celdas.length) return state;
            if (grid.elegida !== null) return state;
            // Una celda que el árbitro sacó del tablero tampoco es una jugada.
            // La pantalla ya la deshabilita, pero el reducer no puede confiar en
            // eso: es la misma guarda que la casilla tachada de la final.
            if (grid.tachadas.includes(i)) return state;

            grid.elegida = i;

            const marcador = grid.celdas[i] ? grid.siGana : grid.siPierde;
            match.puntos = marcador.puntos;
            match.puntosRival = marcador.puntosRival;
            match.tries = marcador.tries;
            match.triesRival = marcador.triesRival;
            match.revealed = true;
            t.playing = null;

            advanceAfterMatch(next, t, match);
            break;
        }

        case 'PICK_CELL': {
            if (next.phase !== 'tournament' || !next.pendingTournament) return state;
            const t = next.pendingTournament;

            const match = t.matches.find((m) => !m.revealed);
            if (!match || !match.casillas) return state;
            const grid = match.casillas;

            // Una casilla que no existe, una ya abierta o la tachada no son una
            // jugada: se devuelve el estado sin tocar, igual que una opción de
            // evento que no existe.
            const i = action.index;
            if (i < 0 || i >= grid.celdas.length) return state;
            if (grid.abiertas.includes(i) || grid.tachada === i) return state;
            if (casillasResultado(grid) !== null) return state;

            grid.abiertas.push(i);

            const resultado = casillasResultado(grid);
            if (resultado === null) break; // sigue jugando

            // Se terminó: el marcador que pasó es el que las casillas eligieron.
            const marcador = resultado ? grid.siGana : grid.siPierde;
            match.puntos = marcador.puntos;
            match.puntosRival = marcador.puntosRival;
            match.tries = marcador.tries;
            match.triesRival = marcador.triesRival;
            match.revealed = true;

            advanceAfterMatch(next, t, match);
            break;
        }

        case 'FINISH_TOURNAMENT': {
            if (next.phase !== 'tournament' || !next.pendingTournament) return state;
            const t = next.pendingTournament;
            // Un torneo sin resultado todavía está vivo: no se cierra a pedido.
            if (t.outcome === null) return state;

            applyTournament(next, t);
            next.tournaments.push(t);
            next.pendingTournament = null;

            if (next.player.retired) break;

            // ── ¿QUEDA OTRO TORNEO ESTE AÑO? ────────────────────────────────
            // La temporada de los diecisiete trae dos —el provincial y el
            // continental M18— y se juegan en ese orden, que es el del catálogo y
            // el del calendario: primero jugás por los tuyos y de ahí sale el
            // equipo que viaja.
            //
            // Se vuelve a preguntar en vez de encadenar una lista armada antes:
            // `tournamentDue` ya descarta lo jugado este año (mira
            // `state.tournaments`, donde el torneo que se acaba de cerrar YA
            // está), así que la pregunta es la misma de siempre y no hay una
            // segunda cola que se pueda desincronizar.
            const siguiente = tournamentDue(next);
            if (siguiente) {
                next.pendingTournament = openTournament(next, siguiente);
                next.phase = 'tournament';
                break;
            }

            openEventOrClose(next, rng);
            break;
        }

        case 'BUY': {
            // La tienda vive en la pretemporada: es el momento del año en que se
            // decide en qué se invierte, al lado de la carta. Comprar en el medio
            // de un Momento o de una final de Mundial no es una decisión, es una
            // interrupción — y encima abriría la puerta a comprarse el aguante
            // justo antes de que se resuelva la jugada que lo mide.
            if (next.phase !== 'offseason') return state;

            const linea = buyShopItem(next, action.itemId, action.attr ?? null);
            // Una compra que no correspondía —sin plata, sin escalón, ya
            // comprada— devuelve el estado sin tocar, igual que una opción de
            // evento que no existe. Sin este corte se guardaría igual y el botón
            // parecería haber hecho algo.
            if (!linea) return state;

            // La compra queda escrita en la crónica de la temporada ANTERIOR,
            // que es la última fila que existe: la de este año todavía no se
            // jugó. En la primera pretemporada no hay ninguna y no pasa nada —
            // tampoco hay plata para comprar.
            const ultima = next.history[next.history.length - 1];
            if (ultima) ultima.note = ultima.note ? `${ultima.note} ${linea}` : linea;
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
 * QUÉ PASA DESPUÉS DE UN PARTIDO, se haya destapado o jugado.
 *
 * Vive en una función porque tiene DOS entradas —la celda que se destapa y la
 * final que se juega en casillas— y son el mismo momento del torneo. Escrita dos
 * veces, la segunda se olvidaría del cuadro de posicionamiento, que es el caso
 * borde que más cuesta ver.
 *
 * NO cobra ni cambia de fase: eso es `FINISH_TOURNAMENT`, para que el resultado
 * quede a la vista.
 */
function advanceAfterMatch(
    state: CaptainState,
    t: PendingTournament,
    match: PendingTournament['matches'][number],
): void {
    // Si quedan partidos en esta ronda, no pasa nada más: sigue el que viene.
    if (t.matches.some((m) => !m.revealed)) return;

    const def = getTournament(t.id);
    const gano = matchResult(match) === 'ganado';

    // UN TORNEO CON CUADROS NO ELIMINA A NADIE. El que perdió la semifinal del
    // quinto puesto juega por el séptimo, y el que perdió la del título juega por
    // el tercero: los dos siguen. Es la diferencia entre el torneo de los pibes y
    // el de los grandes, y es la razón de que `roundAfter` sea una función y no
    // un `indexOf`.
    //
    // ⚠️ ANTES ESTO PREGUNTABA `!qualified(t, def)`, o sea que el cuadro de
    // arriba SÍ eliminaba: perder la semifinal del título cerraba el torneo y el
    // partido por el tercer puesto no se jugaba nunca.
    // LA PREGUNTA VIVE EN EL MOTOR. Estaba acá como expresión suelta y por eso
    // agregar el partido por el tercer puesto habría obligado a que el REDUCER
    // supiera de bronces: `survives` la contesta leyendo lo que el torneo
    // declara, y las tres formas de terminar conviven sin un `if` por id.
    const sigue = survives(t, def, gano);
    const proxima = sigue
        ? roundAfter(t, def, t.round === 'grupos' ? qualified(t, def) : true)
        : null;

    if (proxima) {
        openRound(t, buildCtxOf(state, def), proxima);
        return;
    }

    closeTournament(t, def, gano);
}

/**
 * LA DECISIÓN, o el cierre derecho.
 *
 * Vive en una función y no repetida en dos `case` porque tiene DOS entradas: la
 * temporada que termina sin torneo, y el torneo que termina. Escrita dos veces,
 * la segunda se olvida de la tarjeta de mercado sin ofertas —que es el caso
 * borde que ya se pagó una vez— y el bug aparece solo en las carreras que juegan
 * un Mundial.
 */
function openEventOrClose(state: CaptainState, rng: Rng): void {
    const eventId = selectEvent(state, rng);
    if (eventId) {
        state.pendingEventId = eventId;
        state.phase = 'event';
        // Una tarjeta que no se puede armar —el regreso a casa cuando ya estás
        // en casa— no existe: se sigue de largo hacia el mercado.
        if (getPendingEvent(state)) return;
        state.pendingEventId = null;
    }
    openMarketOrClose(state, rng);
}

/**
 * EL MERCADO, QUE VA DESPUÉS DE LA DECISIÓN Y NO EN SU LUGAR.
 *
 * Es un paso propio y no una opción más del sorteo, y la razón es de calendario
 * antes que de código: la ventana de pases no compite con lo que te pasó en la
 * temporada, ocurre después. Adentro del sorteo —que es donde vivía— la tarjeta
 * de mercado desplazaba a la del año, y con la ventana abierta todos los años a
 * partir de `MARKET_OPEN_AGE` eso dejaba el catálogo entero de eventos sin
 * usarse desde los veinte hasta el retiro.
 *
 * Tiene DOS entradas, igual que `openEventOrClose`: la temporada que no trajo
 * decisión y la decisión que se acaba de resolver. Por eso vive en una función.
 */
function openMarketOrClose(state: CaptainState, rng: Rng): void {
    if (marketDue(state)) {
        state.pendingEventId = MARKET_EVENT_ID;
        state.phase = 'event';
        // Una tarjeta de mercado sin ofertas no existe. `marketDue` ya pregunta
        // por las ofertas, así que esto es el cinturón sobre los tiradores: si
        // alguna vez se pudieran dar las dos cosas, la carrera sigue en vez de
        // trabarse en una fase con una tarjeta que la pantalla no puede dibujar.
        if (getPendingEvent(state)) return;
        state.pendingEventId = null;
    }
    closeAndOpenNext(state, rng);
}

/**
 * EL SALDO DEL TORNEO, aplicado al estado.
 *
 * La copa entra en la vitrina con `kind: 'national'` y sin club, igual que las
 * de `international-results.ts`: el trofeo es de la unión y no del club donde
 * estabas parado. La diferencia con aquellas es de dónde sale el campeón — este
 * lo ganaste jugando, y por eso lo escribe el torneo y no el sorteo.
 */
function applyTournament(state: CaptainState, t: PendingTournament): void {
    const reward = rewardOf(t);
    const def = getTournament(t.id);

    state.fame = Math.max(FAME_MIN, Math.min(FAME_MAX, state.fame + reward.fame));
    state.national.caps += reward.caps;

    // La Pertenencia se mueve por la misma puerta que la de un Momento, con el
    // contexto del club: el techo del que no ganó nada, el del que se fue al
    // clásico y el congelamiento del profesional se aplican solos. Escribir el
    // número a mano acá saltearía las tres reglas de golpe.
    if (reward.belonging > 0 && state.player.clubId) {
        state.belonging = applyBelonging(
            state.belonging,
            reward.belonging,
            belongingSituation(state, state.player.clubId),
        );
    }

    if (reward.title) {
        state.titles.push({
            season: t.season,
            competitionId: tournamentCompetitionId(t.id),
            labelEs: reward.title,
            clubId: null,
            kind: 'national',
        });
    }

    // La crónica va pegada a la temporada que se acaba de jugar, igual que la
    // línea del Momento: fue parte del año y no un anexo.
    const ultima = state.history[state.history.length - 1];
    if (ultima) {
        ultima.note = ultima.note ? `${ultima.note} ${reward.text}` : reward.text;
        if (reward.caps > 0) ultima.caps += reward.caps;
    }

    // El escalón representativo: haber jugado el M20 deja marcado que lo
    // pisaste, aunque el seleccionador no te vuelva a llamar. `bestTrack` no
    // baja nunca, así que esto solo puede subir.
    if (def.id === 'mundial-m20' && trackRank(state.national.bestTrack) < trackRank('m20')) {
        state.national.bestTrack = 'm20';
    }
}

/** Posición de un escalón en la escalera. Para comparar sin `indexOf` suelto. */
function trackRank(track: SquadTrack): number {
    return SQUAD_TRACKS.indexOf(track);
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
