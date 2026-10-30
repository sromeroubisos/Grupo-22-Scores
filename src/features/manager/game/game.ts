// Capa de partida de Rugby Manager: lo que la UI puede pedirle al motor.
//
// El motor trabaja sobre un `World`; la partida agrega lo que el mundo no sabe:
// la semilla, el estado del flujo de azar (para retomar idéntico tras recargar),
// qué club dirigís y quién sos. Todo es JSON puro.
//
// Cada operación que consume azar pasa por `step`: restaura el flujo de ESTA
// partida, corre el motor y guarda el estado nuevo. Así dos partidas abiertas
// no se pisan el azar y recargar no cambia el resultado.
import type { Club, Competition, ID, Manager, Match, Player, Tactics, TacticsPhilosophy, World } from '../types/index.ts';
import { newManager } from '../types/index.ts';
import { createDemoWorld } from '../data/demoWorld.ts';
import { ALL_LEAGUES } from '../data/leagues.ts';
import { computeStandings, findPosition, type StandingsRow } from '../engine/standings.ts';
import {
    buildTeamsForMatch, commitLivedMatch, fixtureSimOptions, getLastMatch, getNextMatch, simulateScheduledMatchesUntil,
    type FixtureSimOptions,
} from '../engine/season.ts';
import { attributePlayerStats, autoSubsFor, type EventActors, type SubLog } from '../engine/playerMatchStats.ts';
import type { MatchResult as EngineMatchResult, MatchTeam } from '../engine/types.ts';
import type { MatchSub, PlayerMatchStats } from '../types/index.ts';
import { addDays, daysBetween } from '../utils/date.ts';
import { advanceToNextSeason, type RolloverReport } from '../engine/seasonRollover.ts';
import { clubOf, clubStrength, countriesOf, fixturesOf, leagueOf, overallOf, squadOf, tacticsOf } from './queries.ts';
import { entropyState, restoreEntropy, seedEntropy } from '../utils/entropy.ts';

export interface ManagerGame {
    seed: number;
    /** Estado del flujo de azar (uint32). Sin esto, recargar cambia el futuro. */
    entropy: number;
    world: World;
    /** null mientras se está eligiendo club. */
    managerClubId: ID | null;
    manager: Manager | null;
}

/** Corre `fn` con el flujo de azar de esta partida y devuelve la partida nueva. */
function step(game: ManagerGame, fn: (world: World) => World): ManagerGame {
    restoreEntropy(game.entropy);
    const world = fn(game.world);
    return { ...game, world, entropy: entropyState() };
}

// ─── Avance por tramos ──────────────────────────────────────────────────────
//
// Simular meses de un mundo de 17.000 jugadores es trabajo de varios segundos. Se hace por
// TRAMOS DE UNA SEMANA, con un `yield` de progreso entre tramo y tramo: la versión síncrona
// los recorre de corrido (tests) y la asíncrona le devuelve el control al navegador entre uno y
// otro, así la pantalla pinta una barra y no se congela. Es el MISMO código en los dos casos,
// así que dan exactamente el mismo mundo.

const ADVANCE_CHUNK_DAYS = 7;

/** Avanza el mundo hasta `target` por tramos; cada `yield` es el progreso de 0 a 1. */
function* advanceSteps(game: ManagerGame, target: string): Generator<number, ManagerGame> {
    let current = game;
    const startDate = game.world.currentDate;
    const span = Math.max(1, daysBetween(startDate, target));
    // `do…while`: si el objetivo es hoy, igual hay que jugar lo pendiente de hoy.
    do {
        const week = addDays(current.world.currentDate, ADVANCE_CHUNK_DAYS);
        const stepEnd = week < target ? week : target;
        current = step(current, (world) => simulateScheduledMatchesUntil(world, stepEnd));
        yield Math.min(1, Math.max(0, daysBetween(startDate, current.world.currentDate) / span));
    } while (current.world.currentDate < target);
    return current;
}

/** Corre un generador de corrido (versión síncrona, para tests y para cuando no importa). */
function drain<T>(gen: Generator<number, T>): T {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
}

const yieldToMain = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Corre un generador devolviéndole el control al navegador entre tramos. */
async function drainAsync<T>(gen: Generator<number, T>, onProgress?: (progress: number) => void): Promise<T> {
    let r = gen.next();
    while (!r.done) {
        onProgress?.(r.value as number);
        await yieldToMain();
        r = gen.next();
    }
    return r.value;
}

/** Mundo nuevo sin club todavía: lo que se ve en la pantalla de elegir. */
export function createGame(seed: number): ManagerGame {
    seedEntropy(seed);
    const world = createDemoWorld({ seed });
    return { seed, entropy: entropyState(), world, managerClubId: null, manager: null };
}

export interface ManagerProfile {
    name: string;
    age: number;
    nationality: string;
}

export function chooseClub(game: ManagerGame, clubId: ID, profile: ManagerProfile): ManagerGame {
    if (!game.world.clubs.some((c) => c.id === clubId)) {
        throw new Error(`chooseClub: el club ${clubId} no existe en este mundo.`);
    }
    return {
        ...game,
        managerClubId: clubId,
        manager: newManager(profile.name, profile.age, profile.nationality, game.world.currentDate),
    };
}

/**
 * Elige el club Y deja el mundo en la víspera de su primer partido. El mundo arranca el 1 de
 * julio y la liga argentina en marzo: sin esto, el primer "Jugar" simulaba ocho meses de todas
 * las ligas de golpe. Se hace acá porque el jugador ya está esperando ("Armando tu plantel…") y
 * porque a partir de ahí cada partido cuesta una semana de mundo, no ocho meses.
 */
export function startCareerAsync(
    game: ManagerGame,
    clubId: ID,
    profile: ManagerProfile,
    onProgress?: (progress: number) => void,
): Promise<ManagerGame> {
    return drainAsync(startCareerSteps(game, clubId, profile), onProgress);
}

function* startCareerSteps(game: ManagerGame, clubId: ID, profile: ManagerProfile): Generator<number, ManagerGame> {
    let current = chooseClub(game, clubId, profile);
    const next = getNextMatch(current.world, clubId);
    if (next) {
        const eve = addDays(next.date, -1);
        if (eve > current.world.currentDate) current = yield* advanceSteps(current, eve);
    }
    return current;
}

// ─── Elegir club ────────────────────────────────────────────────────────────

export interface LeagueChoice {
    competition: Competition;
    clubs: Club[];
    /** País de la liga, o 'Internacional' si reúne clubes de varios (URC, Súper Rugby). */
    countryName: string;
}

function leagueRank(competition: Competition): number {
    const index = ALL_LEAGUES.findIndex((l) => l.shortName === competition.shortName);
    return index === -1 ? ALL_LEAGUES.length : index;
}

function countryOfLeague(world: World, competition: Competition): string {
    if (ALL_LEAGUES.find((l) => l.shortName === competition.shortName)?.multiCountry) return 'Internacional';
    return world.countries.find((c) => c.id === competition.countryId)?.name ?? 'Internacional';
}

/** Ligas de clubes masculinas de mayores, con sus clubes de mayor a menor reputación. */
export function leagueChoices(world: World): LeagueChoice[] {
    const byId = new Map(world.clubs.map((c) => [c.id, c]));
    return world.competitions
        .filter((c) => c.format === 'league' && (c.gender ?? 'men') === 'men' && (c.ageCategory ?? 'senior') === 'senior')
        // El orden del catálogo: la URBA de arriba hacia abajo, después el interior.
        .sort((a, b) => leagueRank(a) - leagueRank(b))
        .map((competition) => ({
            competition,
            countryName: countryOfLeague(world, competition),
            clubs: competition.clubIds
                .map((id) => byId.get(id))
                .filter((c): c is Club => !!c)
                .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name)),
        }));
}

// ─── Lectura del estado ─────────────────────────────────────────────────────

// Las consultas livianas (club, plantel, partidos…) viven en `queries.ts`, para que la interfaz no
// arrastre el motor; se vuelven a exportar acá para quien ya las importaba de este archivo.
export { clubOf, clubStrength, countriesOf, fixturesOf, leagueOf, overallOf, squadOf, tacticsOf };

export interface SeasonView {
    nextMatch: Match | null;
    lastMatch: Match | null;
    league: Competition | undefined;
    standings: StandingsRow[];
    position: number;
    /** El club ya no tiene partidos por jugar esta temporada. */
    clubDone: boolean;
}

export function seasonView(game: ManagerGame): SeasonView {
    const { world, managerClubId } = game;
    if (!managerClubId) {
        return { nextMatch: null, lastMatch: null, league: undefined, standings: [], position: 0, clubDone: false };
    }
    const league = leagueOf(world, managerClubId);
    const standings = league ? computeStandings(league.id, world) : [];
    const nextMatch = getNextMatch(world, managerClubId);
    return {
        nextMatch,
        lastMatch: getLastMatch(world, managerClubId),
        league,
        standings,
        position: findPosition(standings, managerClubId),
        clubDone: nextMatch === null,
    };
}

// ─── Acciones ───────────────────────────────────────────────────────────────

/** Juega el próximo partido del club: simula todo el calendario hasta esa fecha. */
export function playNextMatch(game: ManagerGame): ManagerGame {
    return drain(playNextMatchSteps(game));
}

/** Lo mismo, sin congelar la pantalla y con progreso (0 a 1) para la barra. */
export function playNextMatchAsync(game: ManagerGame, onProgress?: (progress: number) => void): Promise<ManagerGame> {
    return drainAsync(playNextMatchSteps(game), onProgress);
}

function* playNextMatchSteps(game: ManagerGame): Generator<number, ManagerGame> {
    if (!game.managerClubId) return game;
    let current = game;
    // Si en el camino el calendario reordena el partido (rondas nuevas de copa), se insiste:
    // "jugar el próximo partido" tiene que terminar con ese partido jugado.
    for (let attempt = 0; attempt < 5; attempt++) {
        const next = getNextMatch(current.world, game.managerClubId);
        if (!next) break;
        current = yield* advanceSteps(current, next.date);
        if (current.world.matches.find((m) => m.id === next.id)?.played) break;
    }
    return current;
}

/** Ajusta un eje de la filosofía táctica. No consume azar. */
export function setPhilosophy(game: ManagerGame, axis: keyof TacticsPhilosophy, value: number): ManagerGame {
    const clubId = game.managerClubId;
    const current = clubId ? game.world.tactics[clubId] : undefined;
    if (!clubId || !current) return game;
    const clamped = Math.max(-3, Math.min(3, Math.round(value)));
    const tactics: Tactics = { ...current, philosophy: { ...current.philosophy, [axis]: clamped } };
    return { ...game, world: { ...game.world, tactics: { ...game.world.tactics, [clubId]: tactics } } };
}

export interface SeasonClose {
    game: ManagerGame;
    report: RolloverReport;
}

/** Último día con partidos sin jugar de la temporada en curso, hasta el cierre del calendario. */
function lastPendingDate(world: World): string | null {
    const limit = world.calendar?.seasonEnd ?? '9999-12-31';
    let last: string | null = null;
    for (const m of world.matches) {
        if (m.played || m.seasonYear !== world.seasonYear || m.date > limit) continue;
        if (last === null || m.date > last) last = m.date;
    }
    return last;
}

/** El club ya jugó todo lo suyo y se puede cerrar la temporada. */
export function canCloseSeason(game: ManagerGame): boolean {
    return game.managerClubId !== null && seasonView(game).clubDone;
}

/** Rondas de eliminatoria que se generan al terminar la anterior: cuántas vueltas alcanzan. */
const MAX_KNOCKOUT_PASSES = 8;

/**
 * Termina de simular la temporada hasta el cierre del calendario y pasa a la
 * siguiente. Los ciclos internacionales que el motor agenda DESPUÉS del cierre
 * (clasificatorias del Mundial) no se juegan acá: el rollover arma el calendario
 * nuevo y los reemplaza. Simularlos metería dos años de finanzas en un día.
 */
export function closeSeason(game: ManagerGame): SeasonClose {
    return drain(closeSeasonSteps(game));
}

/** Lo mismo, sin congelar la pantalla y con progreso (0 a 1) para la barra. */
export function closeSeasonAsync(game: ManagerGame, onProgress?: (progress: number) => void): Promise<SeasonClose> {
    return drainAsync(closeSeasonSteps(game), onProgress);
}

function* closeSeasonSteps(game: ManagerGame): Generator<number, SeasonClose> {
    let closing: ManagerGame = game;
    for (let pass = 0; pass < MAX_KNOCKOUT_PASSES; pass++) {
        const target = lastPendingDate(closing.world);
        if (!target) break;
        closing = yield* advanceSteps(closing, target);
    }
    if (lastPendingDate(closing.world) !== null) {
        throw new Error('closeSeason: quedan partidos del calendario que el motor no simuló.');
    }
    yield 0.95;
    restoreEntropy(closing.entropy);
    const { world, report } = advanceToNextSeason(closing.world);
    return { game: { ...closing, world, entropy: entropyState() }, report };
}

// ─── Partido en vivo ────────────────────────────────────────────────────────

/**
 * Todo lo que la pantalla del partido en vivo necesita. NO se guarda: los
 * equipos se rearman del mundo y el resultado sale de la misma semilla, así que
 * recargar a mitad de partido y volver a jugarlo da el mismo partido.
 */
export interface LiveMatchSetup {
    matchId: ID;
    homeTeam: MatchTeam;
    awayTeam: MatchTeam;
    simOptions: FixtureSimOptions;
    /** El lado del club del entrenador. */
    mySide: 'home' | 'away';
    /** Cambios automáticos del rival (los míos los hace el jugador). */
    opponentSubs: SubLog;
}

export interface LiveMatchPrepared {
    game: ManagerGame;
    setup: LiveMatchSetup;
}

/** Hash chico y estable de un id, para sembrar los cambios del rival. */
function hashId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return h >>> 0;
}

/**
 * Deja el mundo en la víspera del próximo partido del club (juega todo lo que
 * va antes) y arma los equipos para jugarlo en vivo. Null si no hay partido, o
 * si el motor no pudo armar los equipos.
 */
export function prepareLiveMatch(game: ManagerGame): LiveMatchPrepared | null {
    return drain(prepareLiveMatchSteps(game));
}

/** Lo mismo, sin congelar la pantalla y con progreso (0 a 1) para la barra. */
export function prepareLiveMatchAsync(
    game: ManagerGame,
    onProgress?: (progress: number) => void,
): Promise<LiveMatchPrepared | null> {
    return drainAsync(prepareLiveMatchSteps(game), onProgress);
}

function* prepareLiveMatchSteps(game: ManagerGame): Generator<number, LiveMatchPrepared | null> {
    const clubId = game.managerClubId;
    if (!clubId) return null;
    const next = getNextMatch(game.world, clubId);
    if (!next) return null;

    const eve = addDays(next.date, -1);
    const rested = eve > game.world.currentDate ? yield* advanceSteps(game, eve) : game;
    const match = rested.world.matches.find((m) => m.id === next.id);
    if (!match || match.played) return null;

    const teams = buildTeamsForMatch(rested.world, match);
    if (!teams) return null;
    const mySide = match.homeClubId === clubId ? 'home' : 'away';
    const opponentTeam = mySide === 'home' ? teams.away : teams.home;

    return {
        game: rested,
        setup: {
            matchId: match.id,
            homeTeam: teams.home,
            awayTeam: teams.away,
            simOptions: fixtureSimOptions(rested.world, match),
            mySide,
            opponentSubs: autoSubsFor(mySide === 'home' ? 'away' : 'home', opponentTeam, hashId(match.id)),
        },
    };
}

/** Estadísticas por jugador del partido terminado, con los cambios de los dos lados. */
export function statsForLiveMatch(
    setup: LiveMatchSetup,
    result: EngineMatchResult,
    mySubs: SubLog,
    eventActors?: Array<EventActors | undefined>,
): PlayerMatchStats[] {
    try {
        return attributePlayerStats({
            matchId: setup.matchId,
            homeStarters: setup.homeTeam.starters,
            homeBench: setup.homeTeam.bench,
            awayStarters: setup.awayTeam.starters,
            awayBench: setup.awayTeam.bench,
            subs: [...mySubs, ...setup.opponentSubs],
            homeTryScorers: undefined,
            awayTryScorers: undefined,
            eventActors,
            result,
        });
    } catch {
        return [];
    }
}

/** Confirma el resultado vivido: lo escribe en el mundo y juega el resto de esa fecha. */
export function finishLiveMatch(
    game: ManagerGame,
    setup: LiveMatchSetup,
    result: EngineMatchResult,
    mySubs: SubLog,
    eventActors?: Array<EventActors | undefined>,
): ManagerGame {
    const stats = statsForLiveMatch(setup, result, mySubs, eventActors);
    const subs: MatchSub[] = [...mySubs, ...setup.opponentSubs].map((s) => ({ ...s }));
    const date = game.world.matches.find((m) => m.id === setup.matchId)?.date;
    return step(game, (world) => {
        const committed = commitLivedMatch(world, setup.matchId, result, subs, stats);
        return date ? simulateScheduledMatchesUntil(committed, date) : committed;
    });
}
