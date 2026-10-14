// Saneado de una partida guardada contra el catálogo y el contenido de HOY.
//
// La política de Carrera de Rugby es descartar la partida entera cuando cambia
// cualquier versión. Acá NO: una partida con quince temporadas es lo más valioso
// que tiene el jugador, y casi ningún cambio de catálogo la vuelve
// ininterpretable. Un club que entró, un torneo que cambió de tamaño, un evento
// que se renombró: todo eso se puede reparar descartando lo que ya no existe y
// rellenando lo que falta. Solo se rinde cuando de verdad no hay partida que
// salvar (el club del jugador ya no está en el catálogo, o el guardado no tiene
// forma de estado).
//
// Es DETERMINISTA y sin efectos: mismo guardado, mismo catálogo, mismo resultado.
// Se puede correr en cada carga sin miedo, y sobre una partida sana devuelve un
// estado idéntico (está medido en `sanitize.test.ts`).

import { getClub } from '../data/clubs.ts';
import { getEvent } from '../data/events/index.ts';
import { UPGRADE_MAX_LEVEL, getUpgrade, type UpgradeId } from '../data/upgrades.ts';
import { formatFor } from '../data/formats.ts';
import type {
    AcademyPlayer,
    AcademyState,
    ClubProject,
    CoachState,
    CostCutId,
    DealKind,
    FinanceState,
    InSeason,
    JobOffer,
    MarketState,
    ObjectiveMeasure,
    PendingPlayoff,
    PlayerStats,
    SeasonObjective,
    SquadPlayer,
    TransferState,
    UnionLoan,
} from '../types/coach.ts';
import { getPathway } from '../data/transfer-pathways.ts';
import { ACADEMY_MAX, EMPTY_ACADEMY, PLAN_FACTOR, openScouting, refillAcademy, seedAcademy } from './academy.ts';
import { EMPTY_FINANCE } from './finance.ts';
import { objectiveFor } from './pressure.ts';
import { rngFromState } from './random.ts';
import { redrawPending, resumePostseason, withSeasonPlan } from './run-season.ts';
import { PERSONALITIES, completePlayer, emptyStats, generateSquad } from './squad.ts';
import { EMPTY_TRANSFERS, SQUAD_MAX, SQUAD_MIN, foreignClub } from './transfers.ts';
import { validTraining } from './training.ts';
import { clubsIn, repairWorld } from './world.ts';

const STAGES = new Set(['octavos', 'cuartos', 'semis', 'final']);

/** Una propuesta guardada que todavía se puede aceptar. */
function validOffer(o: unknown): o is JobOffer {
    return (
        isRecord(o)
        && typeof o.clubId === 'string'
        && typeof o.competitionId === 'string'
        && isRecord(o.objective)
        && typeof o.interest === 'number'
        && Array.isArray(o.reasons)
    );
}

const PHASES = new Set(['preseason', 'decision', 'reveal', 'training', 'keymatch', 'tramo', 'market', 'playoff', 'season', 'fired', 'retired']);

/** Las fases que solo existen con una temporada en curso (esquema 7). */
const IN_SEASON_PHASES = new Set(['training', 'keymatch', 'tramo', 'market']);

/**
 * La temporada en curso, si tiene la forma que el motor espera. Se devuelve tal
 * cual (no se reconstruye): sobre una partida sana el saneado no cambia nada.
 */
function validInSeason(raw: unknown): InSeason | null {
    if (!isRecord(raw)) return null;
    const ok =
        typeof raw.tramo === 'number'
        && raw.tramo >= 0
        && raw.tramo <= 3
        && Array.isArray(raw.cards)
        && raw.cards.length === 3
        && raw.cards.every((c) => typeof c === 'number')
        && typeof raw.round === 'number'
        && isRecord(raw.effective)
        && Array.isArray(raw.table)
        && Array.isArray(raw.matches)
        && Array.isArray(raw.injuries)
        && Array.isArray(raw.gone)
        && (raw.week === null || (isRecord(raw.week) && validTraining(raw.week.plan) && typeof raw.week.bonus === 'number'))
        && (raw.key === null
            || (isRecord(raw.key)
                && typeof raw.key.rivalId === 'string'
                && typeof raw.key.round === 'number'
                && typeof raw.key.home === 'boolean'
                && (raw.key.firstHalf === null || isRecord(raw.key.firstHalf))));
    return ok ? (raw as unknown as InSeason) : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function validPlayer(p: unknown): p is SquadPlayer {
    return (
        isRecord(p)
        && typeof p.id === 'string'
        && typeof p.name === 'string'
        && typeof p.number === 'number'
        && Number.isFinite(p.level)
        && Number.isFinite(p.potential)
        && Number.isFinite(p.age)
    );
}

/**
 * Las mejoras del club contra el catálogo de hoy: una mejora que ya no existe se
 * descarta, y un nivel fuera de rango se acota. Se recorren las claves ORDENADAS
 * para que el resultado no dependa del orden en que se guardaron.
 */
function sanitizeUpgrades(raw: unknown): Partial<Record<UpgradeId, number>> {
    const out: Partial<Record<UpgradeId, number>> = {};
    if (!isRecord(raw)) return out;
    for (const id of Object.keys(raw).sort()) {
        const level = raw[id];
        if (!getUpgrade(id) || typeof level !== 'number' || !Number.isFinite(level)) continue;
        const clamped = Math.min(UPGRADE_MAX_LEVEL, Math.max(0, Math.floor(level)));
        if (clamped > 0) out[id as UpgradeId] = clamped;
    }
    return out;
}

const DEAL_KINDS = new Set<DealKind>(['amateur', 'beca', 'viatico', 'contrato']);
const CUT_IDS = new Set<CostCutId>(['viajes', 'viaticos', 'mantenimiento']);
const AXES = new Set(['deportivo', 'secundario', 'formativo', 'economico']);
const MEASURES = new Set([
    'deportivo',
    'superar-puntos',
    'ganar-local',
    'ganarle-a',
    'diferencia-positiva',
    'titulares-propios',
    'titularidades-propias',
    'sin-deficit',
    'bajar-deuda',
    'promover-m19',
]);
const PROJECT_KINDS = new Set(['ascenso', 'estructura', 'sanear']);
const PROJECT_STATUS = new Set(['activo', 'cumplido', 'vencido']);

function sanitizeStats(raw: unknown): PlayerStats {
    if (!isRecord(raw)) return emptyStats();
    return {
        apps: num(raw.apps, 0, 0, 1e4),
        starts: num(raw.starts, 0, 0, 1e4),
        tries: num(raw.tries, 0, 0, 1e4),
        points: num(raw.points, 0, 0, 1e5),
        tackles: num(raw.tackles, 0, 0, 1e5),
        rating: num(raw.rating, 0, 0, 10),
    };
}

/**
 * Un jugador: lo que falta se completa con valores neutros y deterministas
 * (`completePlayer`), y lo que está fuera de rango se acota.
 */
function sanitizePlayer(p: SquadPlayer, competitionId: string): SquadPlayer {
    const c = completePlayer(p, competitionId);
    const deal = isRecord(c.deal) && DEAL_KINDS.has(c.deal.kind as DealKind)
        ? {
              kind: c.deal.kind,
              monthly: num(c.deal.monthly, 0, 0, 10_000_000),
              years: num(c.deal.years, 0, 0, 10),
          }
        : completePlayer({ ...p, deal: undefined } as unknown as SquadPlayer, competitionId).deal;
    return {
        ...c,
        morale: num(c.morale, 60, 0, 100),
        fatigue: num(c.fatigue, 0, 0, 100),
        injury: num(c.injury, 0, 0, 60),
        commitment: num(c.commitment, 50, 0, 100),
        personality: PERSONALITIES.includes(c.personality) ? c.personality : completePlayer({ ...p, personality: undefined } as unknown as SquadPlayer, competitionId).personality,
        homegrown: c.homegrown === true,
        deal,
        stats: sanitizeStats(c.stats),
        career: sanitizeStats(c.career),
    };
}

const WINDOW_KINDS = new Set(['pretemporada', 'corta']);
const ORIGINS = new Set(['libre', 'vuelve', 'sube', 'region']);
const ROUTES = new Set(['nacional', 'abierto', 'franquicia', 'academia', 'convenio']);
const OFFERED = new Set(['amateur', 'beca', 'viatico', 'contrato', 'academia', 'profesional']);
const TARGETS = new Set(['venta', 'renovacion', 'incorporacion']);

/**
 * El mercado de jugadores (esquema 8) contra el plantel y los catálogos de hoy.
 * Una oferta por alguien que ya no está, o de un club que ya no existe, se
 * descarta; un candidato o un cedido con forma rota, también. Sobre un mercado
 * sano devuelve lo mismo, valor por valor.
 */
function sanitizeTransfers(raw: unknown, squadIds: ReadonlySet<string>, competitionId: string, season: number): TransferState {
    const empty: TransferState = { ...EMPTY_TRANSFERS, ledger: { season, compensaciones: 0, indemnizaciones: 0 } };
    if (!isRecord(raw)) return empty;
    const w = raw.window;
    const window =
        isRecord(w) && typeof w.season === 'number' && WINDOW_KINDS.has(w.kind as string)
            ? (w as unknown as TransferState['window'])
            : null;
    const offers = (Array.isArray(raw.offers) ? raw.offers : []).filter(
        (o): o is TransferState['offers'][number] =>
            isRecord(o)
            && typeof o.id === 'string'
            && typeof o.playerId === 'string'
            && squadIds.has(o.playerId)
            && typeof o.clubId === 'string'
            && (o.abroad === true ? foreignClub(o.clubId) !== null : getClub(o.clubId) !== null)
            && ROUTES.has(o.route as string)
            && OFFERED.has(o.deal as string)
            && (o.pathwayId === null || (typeof o.pathwayId === 'string' && getPathway(o.pathwayId) !== null))
            && typeof o.fee === 'number'
            && Number.isFinite(o.fee)
            && typeof o.inclination === 'number'
            && Array.isArray(o.reasons)
            && typeof o.retainTried === 'boolean',
    );
    const arrivals = (Array.isArray(raw.arrivals) ? raw.arrivals : [])
        .filter(
            (c): c is TransferState['arrivals'][number] =>
                isRecord(c)
                && typeof c.id === 'string'
                && ORIGINS.has(c.origin as string)
                && validPlayer(c.player)
                && typeof c.chance === 'number'
                && Array.isArray(c.reasons),
        )
        .map((c) => ({ ...c, player: sanitizePlayer(c.player, competitionId) }));
    const requests = (Array.isArray(raw.requests) ? raw.requests : []).filter(
        (r): r is TransferState['requests'][number] =>
            isRecord(r) && typeof r.playerId === 'string' && squadIds.has(r.playerId) && typeof r.reason === 'string',
    );
    const loaned = (Array.isArray(raw.loaned) ? raw.loaned : [])
        .filter(
            (l): l is TransferState['loaned'][number] =>
                isRecord(l) && validPlayer(l.player) && typeof l.clubId === 'string' && typeof l.season === 'number',
        )
        .map((l) => ({ ...l, player: sanitizePlayer(l.player, competitionId) }));
    const lg = raw.ledger;
    const ledger =
        isRecord(lg) && typeof lg.season === 'number'
            ? {
                  season: lg.season,
                  compensaciones: num(lg.compensaciones, 0, 0, 1e12),
                  indemnizaciones: num(lg.indemnizaciones, 0, 0, 1e12),
              }
            : empty.ledger;
    const log = (Array.isArray(raw.log) ? raw.log : []).filter(
        (e): e is TransferState['log'][number] => isRecord(e) && typeof e.text === 'string' && typeof e.season === 'number',
    );
    const n = raw.negotiation;
    const negotiation =
        isRecord(n)
        && isRecord(n.target)
        && TARGETS.has(n.target.kind as string)
        && isRecord(n.neg)
        && typeof n.neg.reserve === 'number'
        && typeof n.neg.counter === 'number'
        && typeof n.neg.patience === 'number'
        && Array.isArray(n.neg.rounds)
        && n.neg.status === 'abierta'
            ? (n as unknown as TransferState['negotiation'])
            : null;
    return { window, offers, arrivals, requests, loaned, ledger, log, negotiation };
}

function sanitizeFinance(raw: unknown): FinanceState {
    if (!isRecord(raw)) return { ...EMPTY_FINANCE };
    const l = raw.loan;
    const loan: UnionLoan | null =
        isRecord(l) && typeof l.balance === 'number' && Number.isFinite(l.balance) && l.balance > 0
            ? {
                  principal: num(l.principal, l.balance, 0, 1e12),
                  rate: num(l.rate, 0.18, 0, 1),
                  balance: num(l.balance, 0, 0, 1e12),
                  payment: num(l.payment, 0, 0, 1e12),
                  seasonsLeft: num(l.seasonsLeft, 1, 1, 10),
                  takenSeason: num(l.takenSeason, 1, 1, 1e4),
              }
            : null;
    const duesAdvances = (Array.isArray(raw.duesAdvances) ? raw.duesAdvances : [])
        .filter((a): a is { season: number; amount: number } => isRecord(a) && typeof a.season === 'number' && typeof a.amount === 'number' && Number.isFinite(a.amount))
        .map((a) => ({ season: a.season, amount: Math.max(0, a.amount) }));
    const b = raw.benefit;
    const benefit =
        isRecord(b) && typeof b.season === 'number' && typeof b.amount === 'number' ? { season: b.season, amount: b.amount } : null;
    const c = raw.cuts;
    const cuts =
        isRecord(c) && typeof c.season === 'number' && Array.isArray(c.kinds)
            ? { season: c.season, kinds: (c.kinds as unknown[]).filter((k): k is CostCutId => CUT_IDS.has(k as CostCutId)).sort() }
            : { season: 0, kinds: [] };
    return { loan, duesAdvances, benefit, cuts, boardBudget: num(raw.boardBudget, 0, -0.1, 0.1) };
}

const GROUPS = new Set(['primera-linea', 'segunda-linea', 'tercera-linea', 'medios', 'centros', 'fondo']);

function finite(...xs: unknown[]): boolean {
    return xs.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** Un pibe del M19 con la forma que el motor espera y el rango conteniendo al techo. */
function validKid(k: unknown): k is AcademyPlayer {
    return (
        isRecord(k)
        && typeof k.id === 'string'
        && typeof k.name === 'string'
        && GROUPS.has(k.group as string)
        && finite(k.age, k.level, k.ceiling, k.estMin, k.estMax, k.joined)
        && (k.estMin as number) <= (k.ceiling as number)
        && (k.ceiling as number) <= (k.estMax as number)
        && (k.level as number) <= (k.ceiling as number)
        && typeof PLAN_FACTOR[k.plan as keyof typeof PLAN_FACTOR] === 'object'
        && (k.loanClubId === null || typeof k.loanClubId === 'string')
        && typeof k.reserve === 'boolean'
        && typeof k.gem === 'boolean'
        && PERSONALITIES.includes(k.personality as SquadPlayer['personality'])
    );
}

/**
 * El M19 (esquema 9). Si tiene la forma que el motor espera se devuelve TAL CUAL
 * (sobre una partida sana el saneado no cambia nada). Un pibe roto se descarta;
 * sin M19 (una partida migrada del esquema 8) se arma uno con el RNG derivado de
 * la semilla y el club, sin tocar el de la carrera. Despedido o retirado no hay
 * club, y no hay M19.
 */
function sanitizeAcademy(raw: unknown, state: CoachState): CoachState {
    if (state.phase === 'fired' || state.phase === 'retired') {
        return isRecord(raw) && Array.isArray(raw.players) && Array.isArray(raw.log)
            ? { ...state, academy: raw as unknown as AcademyState }
            : { ...state, academy: { ...EMPTY_ACADEMY } };
    }
    if (!isRecord(raw) || !Array.isArray(raw.players)) {
        return { ...state, academy: seedAcademy(state) };
    }
    const players = raw.players.filter(validKid);
    const scoutingOk =
        raw.scouting === null
        || (isRecord(raw.scouting)
            && typeof raw.scouting.season === 'number'
            && Array.isArray(raw.scouting.candidates)
            && Array.isArray(raw.scouting.signed)
            && typeof raw.scouting.points === 'number'
            && typeof raw.scouting.done === 'boolean');
    const intact = players.length === raw.players.length && scoutingOk && Array.isArray(raw.log);
    let out: CoachState = {
        ...state,
        academy: intact
            ? (raw as unknown as AcademyState)
            : {
                  players: players.slice(0, ACADEMY_MAX),
                  scouting: scoutingOk ? ((raw.scouting as AcademyState['scouting']) ?? null) : null,
                  log: Array.isArray(raw.log) ? (raw.log as AcademyState['log']) : [],
              },
    };
    if (out.academy.players.length > ACADEMY_MAX) {
        out = { ...out, academy: { ...out.academy, players: out.academy.players.slice(0, ACADEMY_MAX) } };
    }
    return refillAcademy(out);
}

function validObjective(o: unknown): o is SeasonObjective {
    return (
        isRecord(o)
        && typeof o.id === 'string'
        && typeof o.text === 'string'
        && typeof o.weight === 'number'
        && AXES.has(o.axis as string)
        && isRecord(o.measure)
        && MEASURES.has((o.measure as ObjectiveMeasure).kind)
    );
}

function sanitizeProject(raw: unknown, clubId: string): ClubProject | null {
    if (!isRecord(raw)) return null;
    if (!PROJECT_KINDS.has(raw.kind as string) || !PROJECT_STATUS.has(raw.status as string)) return null;
    if (raw.clubId !== clubId || typeof raw.text !== 'string') return null;
    if (typeof raw.fromSeason !== 'number' || typeof raw.deadlineSeason !== 'number') return null;
    const p = raw as unknown as ClubProject;
    return { ...p, progress: num(p.progress, 0, 0, 1), start: num(p.start, 0, -1e12, 1e12), startUpgrades: num(p.startUpgrades, 0, 0, 100) };
}

/**
 * Devuelve la partida reparada, o `null` si no hay partida que salvar. No tira
 * nunca: cualquier cosa rara en el guardado se convierte en `null`.
 */
export function sanitizeCoach(raw: unknown): CoachState | null {
    if (!isRecord(raw)) return null;
    if (typeof raw.clubId !== 'string' || !getClub(raw.clubId)) return null;
    if (!isRecord(raw.world) || !isRecord(raw.world.ratings) || !isRecord(raw.world.divisions)) return null;
    if (!isRecord(raw.coach) || !isRecord(raw.club) || !isRecord(raw.club.finances)) return null;
    if (typeof raw.seed !== 'number' || typeof raw.rngState !== 'number') return null;

    const state = raw as unknown as CoachState;
    // Un playoff en curso necesita su llave entera: los sembrados con su rating,
    // los que siguen vivos y el próximo partido. Si el guardado no la tiene, no
    // se inventa una: la temporada vuelve a la pretemporada y se juega de nuevo.
    const p = state.playoff as unknown;
    const playoffOk =
        isRecord(p)
        && (p.kind === 'titulo' || p.kind === 'ascenso')
        && Array.isArray(p.seeds)
        && p.seeds.length >= 2
        && Array.isArray(p.alive)
        && isRecord(p.ratings)
        && Array.isArray(p.played)
        && typeof p.homeId === 'string'
        && typeof p.awayId === 'string'
        && typeof p.stage === 'string'
        && STAGES.has(p.stage);
    // La temporada en tramos: sin ella no hay fase de tramo que retomar. Una
    // tarjeta sin temporada es la de una partida del esquema 6 (las cinco de la
    // pretemporada): sigue y la temporada arranca al terminarlas.
    const inSeasonRaw = validInSeason(state.inSeason);
    const seasonLost = IN_SEASON_PHASES.has(state.phase) && (!inSeasonRaw || (state.phase === 'keymatch' && !inSeasonRaw.key));
    const phase =
        !PHASES.has(state.phase) || (state.phase === 'playoff' && !playoffOk) || seasonLost ? 'preseason' : state.phase;
    const inSeason = phase === 'preseason' || phase === 'fired' || phase === 'retired' ? null : inSeasonRaw;

    // Las propuestas sobre la mesa: solo las de clubes que existen y no son el
    // del jugador. Esos clubes quedan sin banco hasta que el jugador conteste.
    const rawMarket = isRecord(state.market) ? (state.market as unknown as Record<string, unknown>) : {};
    const offers = (Array.isArray(rawMarket.offers) ? rawMarket.offers : [])
        .filter(validOffer)
        .filter((o) => o.clubId !== state.clubId && getClub(o.clubId) !== null);

    // La pirámide, contra el catálogo de hoy. El club del jugador siempre queda
    // adentro; si su torneo cambió, el objetivo se vuelve a pedir.
    const year = typeof state.year === 'number' ? state.year : 2026;
    const world = repairWorld(state.world, state.clubId, offers.map((o) => o.clubId), year);
    const competitionId = world.divisions[state.clubId];
    if (!competitionId) return null;
    const competitionChanged = competitionId !== state.competitionId;
    const seedRank = clubsIn(world, competitionId).indexOf(state.clubId) + 1;
    const objective =
        competitionChanged || !isRecord(state.objective) || typeof state.objective.text !== 'string'
            ? objectiveFor(competitionId, Math.max(1, seedRank), year)
            : state.objective;
    // Una propuesta de un club que ya no juega ninguna división no se puede aceptar.
    const market: MarketState = {
        season: typeof rawMarket.season === 'number' ? rawMarket.season : state.season,
        offers: offers.filter((o) => world.divisions[o.clubId] !== undefined),
        news: Array.isArray(rawMarket.news) ? (rawMarket.news as MarketState['news']) : [],
    };

    // El contenido: eventos que ya no existen se olvidan (el cooldown de algo que
    // no está no significa nada) y una tarjeta pendiente que desapareció se
    // vuelve a sortear sin cobrarle la decisión al jugador. Un revelado pendiente
    // se conserva: lleva adentro todo lo que hace falta para mostrarlo.
    const seenEvents: Record<string, number> = {};
    if (isRecord(state.seenEvents)) {
        for (const id of Object.keys(state.seenEvents).sort()) {
            const season = state.seenEvents[id];
            if (getEvent(id) && typeof season === 'number') seenEvents[id] = season;
        }
    }
    const pendingLost = phase === 'decision' && (!state.pendingEventId || !getEvent(state.pendingEventId));

    // El plantel: si no tiene la forma que el motor espera, se genera uno nuevo
    // con el rating del club. Es el único caso en que se consume RNG, y queda
    // snapshoteado para que la carga siguiente no vuelva a consumirlo.
    //
    // Desde la etapa 3 el plantel cambia de tamaño: entre 23 y 26, contando a
    // los cedidos para el tope. Fuera de eso, se genera de nuevo y los cedidos
    // (que eran de ese plantel) se pierden.
    let squad = Array.isArray(state.squad) ? state.squad.filter(validPlayer) : [];
    let rngState = state.rngState;
    let transfers = sanitizeTransfers(
        state.transfers,
        new Set(squad.map((p) => p.id)),
        competitionId,
        typeof state.season === 'number' ? state.season : 1,
    );
    if (squad.length < SQUAD_MIN || squad.length + transfers.loaned.length > SQUAD_MAX) {
        const rng = rngFromState(rngState);
        squad = generateSquad(rng, world.ratings[state.clubId], state.clubId, competitionId);
        rngState = rng.state;
        transfers = { ...transfers, offers: [], requests: [], loaned: [], negotiation: null };
    }
    squad = squad.map((p) => sanitizePlayer(p, competitionId));
    // Una temporada que no se puede retomar se vuelve a jugar desde la
    // pretemporada: lo que sumaron los jugadores en ella no pasó.
    if (seasonLost) squad = squad.map((p) => ({ ...p, stats: emptyStats(), fatigue: 0, injury: 0 }));

    const fin = state.club.finances;
    const repaired: CoachState = {
        ...state,
        rngState,
        phase,
        world,
        competitionId,
        objective,
        squad,
        seenEvents,
        pressure: num(state.pressure, 30, 0, 100),
        decisionsLeft: num(state.decisionsLeft, 5, 0, 5),
        pendingEventId: pendingLost ? null : state.pendingEventId ?? null,
        pendingReveal: phase === 'reveal' && isRecord(state.pendingReveal) ? state.pendingReveal : null,
        playoff: phase === 'playoff' && playoffOk ? state.playoff : null,
        market,
        coach: { ...state.coach, reputation: num(state.coach.reputation, 25, 0, 100) },
        club: {
            cohesion: num(state.club.cohesion, 50, 0, 100),
            finances: {
                caja: num(fin.caja, 0, -1e12, 1e12),
                socios: num(fin.socios, 200, 60, 100_000),
                estructura: num(fin.estructura, 30, 0, 100),
                hinchada: num(fin.hinchada, 40, 0, 100),
            },
            upgrades: sanitizeUpgrades(state.club.upgrades),
        },
        seasonMods: isRecord(state.seasonMods)
            ? {
                  rating: num(state.seasonMods.rating, 0, -20, 20),
                  injuryRisk: num(state.seasonMods.injuryRisk, 0, 0, 1),
                  bancoCorto: state.seasonMods.bancoCorto === true,
              }
            : { rating: 0, injuryRisk: 0, bancoCorto: false },
        lastTable: Array.isArray(state.lastTable) ? state.lastTable : [],
        lastMatches: Array.isArray(state.lastMatches) ? state.lastMatches : [],
        lastKnockout: Array.isArray(state.lastKnockout) ? state.lastKnockout : [],
        lastLeagueMovement: competitionChanged ? null : state.lastLeagueMovement ?? null,
        seasons: Array.isArray(state.seasons) ? state.seasons : [],
        decisionLog: Array.isArray(state.decisionLog) ? state.decisionLog : [],
        flags: isRecord(state.flags) ? (state.flags as Record<string, number>) : {},
        history: Array.isArray(state.history) && state.history.length > 0
            ? state.history
            : [{ clubId: state.clubId, fromSeason: 1, toSeason: null }],
        finance: sanitizeFinance(state.finance),
        objectives: Array.isArray(state.objectives) ? state.objectives.filter(validObjective) : [],
        project: sanitizeProject(state.project, state.clubId),
        inSeason,
        trainingDefault: validTraining(state.trainingDefault) ? state.trainingDefault : null,
        transfers,
    };

    // El M19 y, en la pretemporada, la jornada de captación del año.
    let withAcademy = sanitizeAcademy((state as { academy?: unknown }).academy, repaired);
    if (withAcademy.phase === 'preseason' && withAcademy.academy.scouting?.season !== withAcademy.season) {
        withAcademy = openScouting(withAcademy);
    }
    return finishRepair(withAcademy, phase, pendingLost);
}

function finishRepair(repaired: CoachState, phase: CoachState['phase'], pendingLost: boolean): CoachState {
    if (pendingLost) return redrawPending(repaired);

    // Una partida migrada en la pretemporada no tiene objetivos todavía: se piden
    // ahora, con el RNG derivado (no toca la carrera). A mitad de temporada se
    // esperan a la próxima pretemporada: no se inventa lo que no se pidió.
    if (repaired.phase === 'preseason' && (repaired.objectives.length === 0 || repaired.project === null)) {
        const planned = withSeasonPlan(repaired);
        return {
            ...repaired,
            objectives: repaired.objectives.length === 0 ? planned.objectives : repaired.objectives,
            project: repaired.project ?? planned.project,
        };
    }

    // Una llave por el título en una división donde el formato de hoy no la
    // tiene (la Primera C de la URBA desde 2026: el primero es campeón): la fase
    // regular queda como se jugó y la postemporada se resuelve con las reglas
    // vigentes. Nadie juega una definición que el reglamento no tiene.
    const pending = repaired.playoff as PendingPlayoff | null;
    if (phase === 'playoff' && pending && pending.kind === 'titulo') {
        const format = formatFor(pending.competitionId, repaired.year);
        if (format.title.kind !== 'playoff' || pending.competitionId !== repaired.competitionId) {
            return resumePostseason(repaired, pending.ratings);
        }
    }
    return repaired;
}
