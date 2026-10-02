/**
 * Lectura de la API pública de World Rugby (Pulselive, "RIMS") para los
 * torneos que FlashScore no cubre. El primero es el U20 Challenger 2026
 * (Santiago de Chile, 2 al 17 de octubre): FlashScore corta su plantilla
 * "U20 Trophy" en 2023 y el sitio del comité organizador tiene el fixture
 * escrito a mano en el código, sin marcadores.
 *
 *   /rugby/v3/event/{eventId}/schedule    los partidos del torneo, con marcador,
 *                                         estado y reloj en vivo
 *   /rugby/v3/event/{eventId}/standings   la tabla oficial (llega tarde o vacía)
 *   /rugby/v3/event/{eventId}/squads      los planteles (nombres, sin puesto)
 *   /rugby/v3/match/{matchId}/timeline    tries, conversiones, penales, tarjetas
 *                                         y cambios, con minuto y jugador
 *   /rugby/v3/match/{matchId}/summary     formaciones con dorsal, capitán y árbitros
 *   /rugby/v3/match/{matchId}/stats       estadísticas por equipo
 *
 * Sin credenciales. Medido el 30/09/2026 sobre el Mundial Juvenil 2026: en 14
 * partidos la suma de la cronología da exactamente el marcador.
 *
 * Lo que hay que saber de la fuente:
 * - Estados: `U` sin jugar, `L1` primer tiempo, `LHT` entretiempo, `L2`
 *   segundo tiempo, `C` terminado.
 * - En este torneo los partidos de grupo vienen SIN `eventPhase`: el grupo de
 *   cada selección se declara en el registro (`pools`). En otros eventos la
 *   fase dice "Pool A" y alcanza con eso.
 * - Los cruces del último día nombran lugares ("1st Pool A") hasta que se
 *   define la fase de grupos. Se siguen por `matchId`, que no cambia.
 * - La tabla oficial se genera aparte y puede quedar vieja: se usa solo si
 *   cuenta los mismos partidos que el fixture (`pickWrStandings`).
 *
 * Este módulo es PURO: entra JSON, sale dato. Sin red, sin caché, sin DOM. Es
 * lo que se prueba con `node --test` (`worldRugbyEventParser.test.ts`).
 */

import type { MatchStatus } from '@/types/match';

export const WR_PROVIDER = 'worldrugby';
export const WR_API_URL = 'https://api.wr-rims-prod.pulselive.com/rugby/v3';

export const WR_MATCH_ID_PREFIX = 'wr-match-';
export const WR_TEAM_ID_PREFIX = 'wr-team-';

export interface WrEventDef {
    /** Id del torneo en G22. Es la URL de la pantalla: `/tournaments/<id>`. */
    tournamentId: string;
    /** Id del evento en World Rugby. */
    eventId: string;
    name: string;
    fullName: string;
    season: string;
    /**
     * URL propia del torneo. La portada agrupa los partidos por esta URL:
     * tiene que ser única entre proveedores virtuales.
     */
    url: string;
    logo: string;
    /** Sufijo de categoría que va detrás del país ("Chile M20"). */
    ageLabel: string;
    /** Grupo de cada selección, por el nombre en inglés de World Rugby sin la categoría. */
    pools: Record<string, readonly string[]>;
    siteUrl: string;
}

export const WR_EVENTS: readonly WrEventDef[] = [
    {
        tournamentId: 'wr-u20-challenger-2026',
        eventId: 'a7379dc9-cd9c-4d39-b173-dc279c38b4a1',
        name: 'U20 Challenger',
        fullName: 'World Rugby U20 Challenger 2026',
        season: '2026',
        url: '/rugby-union/world/u20-challenger/',
        logo: '/competiciones/wr-u20-challenger.png',
        ageLabel: 'M20',
        pools: {
            A: ['Chile', 'Romania', 'Brazil', 'Hong Kong China'],
            B: ['Namibia', 'Belgium', 'Portugal', 'Canada'],
        },
        siteUrl: 'https://www.world.rugby/tournaments/u20',
    },
];

export function wrEventByTournamentId(value: unknown): WrEventDef | null {
    const id = String(value ?? '').trim().toLowerCase();
    return WR_EVENTS.find((event) => event.tournamentId === id) ?? null;
}

export function wrEventByEventId(value: unknown): WrEventDef | null {
    const id = String(value ?? '').trim().toLowerCase();
    return WR_EVENTS.find((event) => event.eventId === id) ?? null;
}

// --------------------------------------------------------------------------
// Ids
// --------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function wrMatchIdOf(matchId: string): string {
    return `${WR_MATCH_ID_PREFIX}${matchId.toLowerCase()}`;
}

/** `wr-match-<uuid>` → el `matchId` de World Rugby. Null si no es uno de estos. */
export function parseWrMatchId(value: unknown): string | null {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw.startsWith(WR_MATCH_ID_PREFIX)) return null;
    const matchId = raw.slice(WR_MATCH_ID_PREFIX.length);
    return UUID_RE.test(matchId) ? matchId : null;
}

export function wrTeamIdOf(teamId: string | null, name: string): string {
    const key = teamId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${WR_TEAM_ID_PREFIX}${key}`;
}

// --------------------------------------------------------------------------
// Nombres en castellano
// --------------------------------------------------------------------------

/** Los países que juegan torneos juveniles de World Rugby, en castellano. */
const COUNTRY_ES: Record<string, string> = {
    argentina: 'Argentina',
    australia: 'Australia',
    belgium: 'Bélgica',
    brazil: 'Brasil',
    canada: 'Canadá',
    chile: 'Chile',
    england: 'Inglaterra',
    fiji: 'Fiyi',
    france: 'Francia',
    georgia: 'Georgia',
    germany: 'Alemania',
    'hong kong china': 'Hong Kong China',
    'hong kong': 'Hong Kong',
    ireland: 'Irlanda',
    italy: 'Italia',
    japan: 'Japón',
    kenya: 'Kenia',
    namibia: 'Namibia',
    netherlands: 'Países Bajos',
    'new zealand': 'Nueva Zelanda',
    portugal: 'Portugal',
    romania: 'Rumania',
    samoa: 'Samoa',
    scotland: 'Escocia',
    'south africa': 'Sudáfrica',
    spain: 'España',
    tonga: 'Tonga',
    uruguay: 'Uruguay',
    usa: 'Estados Unidos',
    'united states': 'Estados Unidos',
    wales: 'Gales',
    zimbabwe: 'Zimbabue',
};

/** "Chile U20" → "Chile". La categoría la pone el torneo, no el nombre. */
export function wrCountryOf(rawName: string): string {
    return rawName.replace(/\s+U\d{2}$/i, '').trim();
}

export function wrCountryEs(country: string): string {
    return COUNTRY_ES[country.trim().toLowerCase()] ?? country.trim();
}

const ORDINAL_ES: Record<string, string> = { '1': '1.º', '2': '2.º', '3': '3.º', '4': '4.º' };

/**
 * Un lugar del cuadro que todavía no tiene dueño: "1st Pool A" → "1.º Grupo A".
 * Null si el nombre es de una selección.
 */
export function wrPlaceholderLabel(rawName: string): string | null {
    const pool = rawName.trim().match(/^(\d+)(?:st|nd|rd|th)\s+Pool\s+([A-Z])$/i);
    if (pool) return `${ORDINAL_ES[pool[1]] ?? `${pool[1]}.º`} Grupo ${pool[2].toUpperCase()}`;
    const winner = rawName.trim().match(/^(Winner|Loser)\s+(?:of\s+)?Match\s+(\d+)$/i);
    if (winner) return `${/^w/i.test(winner[1]) ? 'Ganador' : 'Perdedor'} partido ${winner[2]}`;
    return null;
}

// --------------------------------------------------------------------------
// Estado del partido
// --------------------------------------------------------------------------

const MS_HOUR = 3_600_000;
/** La mesa carga partidos de prueba: "en vivo" a horas del inicio es un ensayo. */
const REHEARSAL_BEFORE_MS = 3 * MS_HOUR;
/** Un partido dura ~1 h 45 con el entretiempo: "en vivo" pasadas 3 h es una mesa que no cerró. */
const STALE_LIVE_AFTER_MS = 3 * MS_HOUR;

export function classifyWrStatus(rawStatus: string, kickoffMs: number | null, nowMs: number): MatchStatus {
    const status = String(rawStatus || '').trim().toUpperCase();
    if (status === 'C') return 'final';
    if (status === 'P' || status === 'PP') return 'postponed';
    if (status === 'X' || status === 'CC' || status === 'A') return 'cancelled';
    if (status.startsWith('L')) {
        if (kickoffMs !== null && nowMs < kickoffMs - REHEARSAL_BEFORE_MS) return 'scheduled';
        if (kickoffMs !== null && nowMs > kickoffMs + STALE_LIVE_AFTER_MS) return 'final';
        return 'live';
    }
    return 'scheduled';
}

/**
 * El rótulo del partido en juego: el minuto del reloj oficial ("54'") o el
 * entretiempo. El reloj de la fuente cuenta corrido: el segundo tiempo arranca
 * en 40:00.
 */
export function wrLiveLabel(rawStatus: string, clockSecs: number | null): string {
    const status = String(rawStatus || '').trim().toUpperCase();
    if (status === 'LHT') return 'Entretiempo';
    if (clockSecs !== null && clockSecs > 0) return `${Math.floor(clockSecs / 60) + 1}'`;
    return status === 'L2' ? 'Segundo tiempo' : 'En juego';
}

// --------------------------------------------------------------------------
// Fixture
// --------------------------------------------------------------------------

export interface WrSide {
    /** Id de World Rugby. Null en un lugar del cuadro sin dueño. */
    teamId: string | null;
    /** Nombre en castellano, con la categoría ("Chile M20") o el lugar ("1.º Grupo A"). */
    name: string;
    /** País en inglés, como lo escribe World Rugby ("Hong Kong China"). Vacío en un lugar sin dueño. */
    country: string;
    abbreviation: string | null;
    placeholder: boolean;
    score: number | null;
}

export interface WrFixture {
    matchId: string;
    /** Número del partido en el torneo ("Match 4" → 4). */
    number: number | null;
    /** Clave del grupo ("A") o null en un cruce. */
    pool: string | null;
    /** Fase en inglés tal como viene ("Final", "3rd Place Play-Off"), vacía en grupos. */
    phase: string;
    stageLabel: string;
    round: number;
    kickoffMs: number | null;
    kickoffIso: string | null;
    venue: string;
    city: string;
    home: WrSide;
    away: WrSide;
    rawStatus: string;
    state: MatchStatus;
    clockSecs: number | null;
    /** El marcador sale de una carga manual de G22, no de World Rugby. */
    manual?: boolean;
    /** Tries de la carga manual, para el bonus ofensivo. Null si no se cargaron. */
    manualTries?: { home: number; away: number } | null;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
}

function poolOfCountry(event: WrEventDef, country: string): string | null {
    const key = country.trim().toLowerCase();
    for (const [pool, members] of Object.entries(event.pools)) {
        if (members.some((member) => member.toLowerCase() === key)) return pool;
    }
    return null;
}

function toSide(raw: unknown, event: WrEventDef, score: number | null): WrSide {
    const team = asObject(raw) ?? {};
    const rawName = asString(team.name).trim();
    const placeholder = wrPlaceholderLabel(rawName);
    if (placeholder) {
        return { teamId: null, name: placeholder, country: '', abbreviation: null, placeholder: true, score };
    }
    const country = wrCountryOf(rawName);
    return {
        teamId: asString(team.id) || null,
        name: `${wrCountryEs(country)} ${event.ageLabel}`.trim(),
        country,
        abbreviation: asString(team.abbreviation) || null,
        placeholder: false,
        score,
    };
}

/** Las fases por puesto, en castellano. */
export function wrPhaseLabel(phase: string): string {
    const raw = phase.trim();
    if (!raw) return '';
    if (/^final$/i.test(raw)) return 'Final';
    // "Semi-Finals", "Semi Final", "SemiFinal": la fuente escribe las tres.
    if (/^semi[-\s]?finals?$/i.test(raw)) return 'Semifinal';
    if (/^quarter[-\s]?finals?$/i.test(raw)) return 'Cuartos de final';
    const placeOff = raw.match(/^(\d+)(?:st|nd|rd|th)\s+Place\s+Play[-\s]?Off$/i);
    if (placeOff) return `Por el ${placeOff[1]}.º puesto`;
    const placeSemi = raw.match(/^(\d+)(?:st|nd|rd|th)\s+Place\s+Semi[-\s]?Finals?$/i);
    if (placeSemi) return `Semifinal por el ${placeSemi[1]}.º puesto`;
    const pool = raw.match(/^Pool\s+([A-Z])$/i);
    if (pool) return `Grupo ${pool[1].toUpperCase()}`;
    return raw;
}

function dayKeyOf(kickoffMs: number, gmtOffsetHours: number): string {
    return new Date(kickoffMs + gmtOffsetHours * MS_HOUR).toISOString().slice(0, 10);
}

/**
 * El fixture del torneo. La fecha de un partido de grupo sale del orden de los
 * DÍAS de grupo en la sede (el 2, el 7 y el 12 son las fechas 1, 2 y 3); los
 * cruces van en la fecha siguiente a la última.
 */
export function parseWrSchedule(json: unknown, event: WrEventDef, nowMs: number): WrFixture[] {
    const root = asObject(json);
    const matches = Array.isArray(root?.matches) ? root.matches : [];

    type Draft = Omit<WrFixture, 'stageLabel' | 'round'> & { dayKey: string | null };
    const drafts: Draft[] = [];

    for (const raw of matches) {
        const match = asObject(raw);
        if (!match) continue;
        const matchId = asString(match.matchId).toLowerCase();
        if (!UUID_RE.test(matchId)) continue;

        const time = asObject(match.time);
        const kickoffMs = asNumber(time?.millis);
        const gmtOffset = asNumber(time?.gmtOffset) ?? 0;
        const rawStatus = asString(match.status).toUpperCase();
        const state = classifyWrStatus(rawStatus, kickoffMs, nowMs);
        const scores = Array.isArray(match.scores) ? match.scores : [];
        const played = state === 'live' || state === 'final';
        const teams = Array.isArray(match.teams) ? match.teams : [];
        const home = toSide(teams[0], event, played ? asNumber(scores[0]) ?? 0 : null);
        const away = toSide(teams[1], event, played ? asNumber(scores[1]) ?? 0 : null);

        const phase = asString(match.eventPhase).trim();
        const phasePool = phase.match(/^Pool\s+([A-Z])$/i)?.[1]?.toUpperCase() ?? null;
        const declaredPool = !phase && !home.placeholder && !away.placeholder
            ? poolOfCountry(event, home.country)
            : null;
        const pool = phasePool
            ?? (declaredPool && declaredPool === poolOfCountry(event, away.country) ? declaredPool : null);

        const venue = asObject(match.venue);
        const clock = asObject(match.clock);
        const number = asNumber(asString(match.description).match(/(\d+)/)?.[1]);

        drafts.push({
            matchId,
            number,
            pool,
            phase,
            kickoffMs,
            kickoffIso: kickoffMs !== null ? new Date(kickoffMs).toISOString() : null,
            venue: asString(venue?.name),
            city: asString(venue?.city),
            home,
            away,
            rawStatus,
            state,
            clockSecs: asNumber(clock?.secs),
            dayKey: kickoffMs !== null ? dayKeyOf(kickoffMs, gmtOffset) : null,
        });
    }

    const poolDays = [...new Set(drafts.filter((d) => d.pool && d.dayKey).map((d) => d.dayKey as string))].sort();

    return drafts
        .map(({ dayKey, ...draft }) => {
            if (draft.pool) {
                const index = dayKey ? poolDays.indexOf(dayKey) : -1;
                const round = index >= 0 ? index + 1 : 1;
                return { ...draft, round, stageLabel: `Grupo ${draft.pool} · Fecha ${round}` };
            }
            return { ...draft, round: poolDays.length + 1, stageLabel: wrPhaseLabel(draft.phase) || 'Fase final' };
        })
        .sort((left, right) => (left.kickoffMs ?? 0) - (right.kickoffMs ?? 0) || (left.number ?? 0) - (right.number ?? 0));
}

/**
 * Cuánto dura el fixture en caché. Con un partido en juego o por arrancar, el
 * marcador cambia con cada try; un día de partidos, el horario puede moverse;
 * el resto del tiempo no cambia nada.
 */
export const WR_TTL_HOT_SECONDS = 15;
export const WR_TTL_MATCHDAY_SECONDS = 120;
export const WR_TTL_IDLE_SECONDS = 1800;

export function wrRefreshTtlSeconds(fixtures: readonly WrFixture[], nowMs: number): number {
    const hot = fixtures.some((fixture) => {
        if (fixture.state === 'live') return true;
        if (fixture.kickoffMs === null || fixture.state === 'final') return false;
        return nowMs >= fixture.kickoffMs - 15 * 60_000 && nowMs <= fixture.kickoffMs + STALE_LIVE_AFTER_MS;
    });
    if (hot) return WR_TTL_HOT_SECONDS;
    const matchday = fixtures.some((fixture) => fixture.kickoffMs !== null && Math.abs(fixture.kickoffMs - nowMs) <= 12 * MS_HOUR);
    return matchday ? WR_TTL_MATCHDAY_SECONDS : WR_TTL_IDLE_SECONDS;
}

// --------------------------------------------------------------------------
// Personas: formaciones y planteles
// --------------------------------------------------------------------------

export interface WrPerson {
    id: string;
    name: string;
}

function personOf(raw: unknown): WrPerson | null {
    const person = asObject(raw);
    const id = asString(person?.id);
    const name = asObject(person?.name);
    const display = asString(name?.display).trim()
        || [asString(asObject(name?.first)?.known), asString(asObject(name?.last)?.known)].filter(Boolean).join(' ');
    if (!id || !display) return null;
    return { id, name: display };
}

const POSITION_ES: Record<string, string> = {
    FB: 'Fullback',
    WI: 'Wing',
    CE: 'Centro',
    FH: 'Apertura',
    SH: 'Medio scrum',
    N8: 'Octavo',
    FL: 'Ala',
    SR: 'Segunda línea',
    PR: 'Pilar',
    HK: 'Hooker',
    REP: 'Suplente',
};

export interface WrLineupPlayer {
    id: string;
    name: string;
    number: number | null;
    position: string;
    isCaptain: boolean;
    isReplacement: boolean;
}

export interface WrTeamSheet {
    starters: WrLineupPlayer[];
    replacements: WrLineupPlayer[];
    coach: string | null;
}

export interface WrOfficial {
    role: string;
    name: string;
    country: string | null;
}

export interface WrSummary {
    home: WrTeamSheet;
    away: WrTeamSheet;
    officials: WrOfficial[];
}

function parseTeamSheet(raw: unknown): WrTeamSheet {
    const teamList = asObject(asObject(raw)?.teamList);
    const list = Array.isArray(teamList?.list) ? teamList.list : [];
    const captains = new Set((Array.isArray(teamList?.captainIds) ? teamList.captainIds : []).map(asString));
    const players: (WrLineupPlayer & { order: number })[] = [];
    let coach: string | null = null;

    for (const rawEntry of list) {
        const entry = asObject(rawEntry);
        const person = personOf(entry?.player);
        if (!entry || !person) continue;
        const code = asString(entry.position).toUpperCase();
        if (!code) {
            // Sin puesto es cuerpo técnico ("Head Coach"), no un jugador.
            if (/coach/i.test(asString(entry.positionLabel)) && !coach) coach = person.name;
            continue;
        }
        const isReplacement = code === 'REP';
        players.push({
            id: person.id,
            name: person.name,
            number: asNumber(entry.number),
            position: POSITION_ES[code] ?? asString(entry.positionLabel),
            isCaptain: captains.has(person.id),
            isReplacement,
            order: asNumber(entry.order) ?? 999,
        });
    }

    const byNumber = (left: { number: number | null; order: number }, right: { number: number | null; order: number }) =>
        (left.number ?? 99) - (right.number ?? 99) || left.order - right.order;
    const strip = ({ order: _order, ...player }: WrLineupPlayer & { order: number }) => player;

    return {
        starters: players.filter((player) => !player.isReplacement).sort(byNumber).map(strip),
        replacements: players.filter((player) => player.isReplacement).sort(byNumber).map(strip),
        coach,
    };
}

const OFFICIAL_ROLE_ES: Record<string, string> = {
    referee: 'Árbitro',
    'assistant referee 1': 'Juez de línea 1',
    'assistant referee 2': 'Juez de línea 2',
    'tv match official': 'TMO',
};

export function parseWrSummary(json: unknown): WrSummary {
    const root = asObject(json);
    const teams = Array.isArray(root?.teams) ? root.teams : [];
    const officials: WrOfficial[] = [];
    for (const raw of Array.isArray(root?.officials) ? root.officials : []) {
        const entry = asObject(raw);
        const person = personOf(entry?.official);
        if (!entry || !person) continue;
        const role = asString(entry.position);
        officials.push({
            role: OFFICIAL_ROLE_ES[role.toLowerCase()] ?? role,
            name: person.name,
            country: asString(asObject(entry.official)?.country) || null,
        });
    }
    return { home: parseTeamSheet(teams[0]), away: parseTeamSheet(teams[1]), officials };
}

export function wrRefereeOf(summary: WrSummary): string | null {
    return summary.officials.find((official) => official.role === 'Árbitro')?.name ?? null;
}

/** Los planteles del torneo por id de selección. Sin puesto ni dorsal: la fuente no los publica. */
export function parseWrSquads(json: unknown): Map<string, WrPerson[]> {
    const squads = new Map<string, WrPerson[]>();
    const root = asObject(json);
    for (const raw of Array.isArray(root?.squads) ? root.squads : []) {
        const squad = asObject(raw);
        const teamId = asString(asObject(squad?.team)?.id);
        if (!squad || !teamId) continue;
        const players = (Array.isArray(squad.players) ? squad.players : [])
            .map((entry) => personOf(asObject(entry)?.player))
            .filter((person): person is WrPerson => person !== null)
            .sort((left, right) => left.name.localeCompare(right.name, 'es'));
        squads.set(teamId, players);
    }
    return squads;
}

// --------------------------------------------------------------------------
// Cronología
// --------------------------------------------------------------------------

export type WrEventType =
    | 'try'
    | 'penalty_try'
    | 'conversion'
    | 'penalty_goal'
    | 'drop_goal'
    | 'card_yellow'
    | 'card_red'
    | 'substitution';

export interface WrTimelineEvent {
    type: WrEventType;
    team: 'home' | 'away';
    player: string;
    playerId: string | null;
    /** Jugador que entra, en un cambio (`player` es el que sale). */
    subPlayer?: string;
    subPlayerId?: string | null;
    description: string;
    /** NÚMERO: la cronología le agrega el apóstrofe. */
    minute: number;
    time: number;
    minuteNumber: number;
    period: '1T' | '2T';
    order: number;
    points: number;
}

interface RawTimelineEvent {
    type: string;
    group: string;
    phase: string;
    secs: number;
    teamIndex: number;
    playerId: string | null;
    points: number;
}

function typeOf(raw: RawTimelineEvent): WrEventType | null {
    const type = raw.type.toUpperCase();
    const group = raw.group.toUpperCase();
    if (type.startsWith('PT')) return 'penalty_try';
    if (group === 'TRY' || /^T\d$/.test(type)) return 'try';
    if (group === 'CON' || /^C\d$/.test(type)) return 'conversion';
    if (group === 'PEN' || /^P\d$/.test(type)) return 'penalty_goal';
    if (group === 'DG' || type.startsWith('DG')) return 'drop_goal';
    if (group === 'YC' || type === 'YELLOW') return 'card_yellow';
    if (group === 'RC' || type === 'RED') return 'card_red';
    return null;
}

function describe(type: WrEventType, player: string, points: number): string {
    const of = player ? ` de ${player}` : '';
    switch (type) {
        case 'try':
            return `Try${of}`;
        case 'penalty_try':
            return 'Try penal';
        case 'conversion':
            return points > 0 ? `Conversión${of}` : `[palos:miss] Conversión${of}`;
        case 'penalty_goal':
            return points > 0 ? `Penal${of}` : `[palos:miss] Penal${of}`;
        case 'drop_goal':
            return `Drop${of}`;
        case 'card_yellow':
            return `Tarjeta amarilla${of}`;
        case 'card_red':
            return `Tarjeta roja${of}`;
        case 'substitution':
            return 'Cambio';
    }
}

function readTimeline(json: unknown): RawTimelineEvent[] {
    const root = asObject(json);
    const list = Array.isArray(root?.timeline) ? root.timeline : [];
    const events: RawTimelineEvent[] = [];
    for (const raw of list) {
        const entry = asObject(raw);
        if (!entry) continue;
        events.push({
            type: asString(entry.type),
            group: asString(entry.group),
            phase: asString(entry.phase).toUpperCase(),
            secs: asNumber(asObject(entry.time)?.secs) ?? 0,
            teamIndex: asNumber(entry.teamIndex) ?? -1,
            playerId: asString(entry.playerId) || null,
            points: asNumber(entry.points) ?? 0,
        });
    }
    return events;
}

/**
 * La cronología con el vocabulario de la pantalla. Los cambios llegan en dos
 * hechos (sale / entra, mismo segundo y mismo lado) y se juntan en uno. El
 * minuto es el del reloj corrido: 02:50 es el minuto 3.
 */
export function parseWrTimeline(json: unknown, names: ReadonlyMap<string, string>): WrTimelineEvent[] {
    const raw = readTimeline(json);
    const nameOf = (id: string | null) => (id ? names.get(id) ?? '' : '');
    const events: Omit<WrTimelineEvent, 'order'>[] = [];
    const pendingIn = new Map<string, RawTimelineEvent[]>();
    const pendingOut = new Map<string, RawTimelineEvent[]>();
    const subKey = (event: RawTimelineEvent) => `${event.teamIndex}:${event.secs}`;

    const base = (event: RawTimelineEvent) => {
        const minute = Math.floor(event.secs / 60) + 1;
        return {
            team: event.teamIndex === 1 ? 'away' as const : 'home' as const,
            minute,
            time: minute,
            minuteNumber: minute,
            period: event.phase === 'L1' || (event.phase !== 'L2' && event.secs < 2400) ? '1T' as const : '2T' as const,
        };
    };

    const pushSub = (off: RawTimelineEvent | null, on: RawTimelineEvent | null) => {
        const anchor = off ?? on;
        if (!anchor) return;
        const player = nameOf(off?.playerId ?? null);
        const incoming = nameOf(on?.playerId ?? null);
        events.push({
            ...base(anchor),
            type: 'substitution',
            player,
            playerId: off?.playerId ?? null,
            subPlayer: incoming,
            subPlayerId: on?.playerId ?? null,
            description: incoming ? `Cambio · Entra: ${incoming}` : 'Cambio',
            points: 0,
        });
    };

    for (const event of raw) {
        if (event.teamIndex !== 0 && event.teamIndex !== 1) continue;
        const kind = event.type.toUpperCase();
        if (kind === 'SUB OFF' || kind === 'SUB ON') {
            const isOff = kind === 'SUB OFF';
            const key = subKey(event);
            const partner = (isOff ? pendingIn : pendingOut).get(key);
            if (partner && partner.length > 0) {
                const other = partner.shift() as RawTimelineEvent;
                pushSub(isOff ? event : other, isOff ? other : event);
            } else {
                const queue = (isOff ? pendingOut : pendingIn).get(key) ?? [];
                queue.push(event);
                (isOff ? pendingOut : pendingIn).set(key, queue);
            }
            continue;
        }
        const type = typeOf(event);
        if (!type) continue;
        const player = type === 'penalty_try' ? '' : nameOf(event.playerId);
        events.push({
            ...base(event),
            type,
            player,
            playerId: type === 'penalty_try' ? null : event.playerId,
            description: describe(type, player, event.points),
            points: event.points,
        });
    }

    // Un cambio al que le falta la otra mitad entra igual, con lo que hay.
    for (const queue of pendingOut.values()) for (const off of queue) pushSub(off, null);
    for (const queue of pendingIn.values()) for (const on of queue) pushSub(null, on);

    return events
        .map((event, index) => ({ event, index }))
        .sort((left, right) => left.event.minute - right.event.minute || left.index - right.index)
        .map(({ event }, order) => ({ ...event, order }));
}

/** Lo que suma cada lado según la cronología. */
export function wrTimelineTotals(events: readonly WrTimelineEvent[]): { home: number; away: number } {
    const totals = { home: 0, away: 0 };
    for (const event of events) totals[event.team] += event.points;
    return totals;
}

/** Tries de cada lado (el try penal cuenta: es un try para el punto bonus). */
export function wrTriesOf(json: unknown): { home: number; away: number } {
    const tries = { home: 0, away: 0 };
    for (const event of readTimeline(json)) {
        const type = typeOf(event);
        if (type !== 'try' && type !== 'penalty_try') continue;
        if (event.teamIndex === 0) tries.home += 1;
        if (event.teamIndex === 1) tries.away += 1;
    }
    return tries;
}

/** El marcador de cada tiempo, sacado de la cronología. */
export function wrPeriodScores(events: readonly WrTimelineEvent[]): { period: string; label: string; home: number; away: number }[] {
    const first = { home: 0, away: 0 };
    const second = { home: 0, away: 0 };
    for (const event of events) {
        if (event.points <= 0) continue;
        (event.period === '1T' ? first : second)[event.team] += event.points;
    }
    const periods = [{ period: '1', label: 'Primer tiempo', ...first }];
    if (events.some((event) => event.period === '2T')) periods.push({ period: '2', label: 'Segundo tiempo', ...second });
    return periods;
}

// --------------------------------------------------------------------------
// Estadísticas
// --------------------------------------------------------------------------

type StatFormat = 'count' | 'percent' | 'metres';

/** Las filas que se muestran, en este orden. El resto de la planilla de Opta queda afuera. */
const STAT_ROWS: readonly { key: string; label: string; format: StatFormat; total?: string }[] = [
    { key: 'Possession', label: 'Posesión', format: 'percent' },
    { key: 'Territory', label: 'Territorio', format: 'percent' },
    { key: 'Tries', label: 'Tries', format: 'count' },
    { key: 'Conversions', label: 'Conversiones', format: 'count' },
    { key: 'KickPenaltyGood', label: 'Penales a los palos', format: 'count' },
    { key: 'Metres', label: 'Metros ganados', format: 'metres' },
    { key: 'Carries', label: 'Portadas', format: 'count' },
    { key: 'CleanBreaks', label: 'Quiebres', format: 'count' },
    { key: 'DefendersBeaten', label: 'Defensores superados', format: 'count' },
    { key: 'Offload', label: 'Offloads', format: 'count' },
    { key: 'Passes', label: 'Pases', format: 'count' },
    { key: 'Tackles', label: 'Tackles', format: 'count' },
    { key: 'MissedTackles', label: 'Tackles errados', format: 'count' },
    { key: 'TackleSuccess', label: 'Efectividad en el tackle', format: 'percent' },
    { key: 'TurnoversWon', label: 'Pelotas recuperadas', format: 'count' },
    { key: 'RucksWon', label: 'Rucks ganados', format: 'count', total: 'RucksTotal' },
    { key: 'ScrumsWon', label: 'Scrums ganados', format: 'count', total: 'ScrumsTotal' },
    { key: 'LineoutsWon', label: 'Lines ganados', format: 'count', total: 'TotalLineouts' },
    { key: 'KicksFromHand', label: 'Patadas de juego', format: 'count' },
    { key: 'PenaltiesConceded', label: 'Penales cometidos', format: 'count' },
    { key: 'YellowCards', label: 'Tarjetas amarillas', format: 'count' },
];

function formatStat(value: number, format: StatFormat, total: number | null): string {
    if (format === 'percent') return `${Math.round(value <= 1 ? value * 100 : value)}%`;
    const rounded = Math.round(value);
    if (format === 'metres') return `${rounded} m`;
    return total !== null ? `${rounded}/${Math.round(total)}` : String(rounded);
}

export function parseWrStats(json: unknown): { label: string; home: string; away: string }[] {
    const root = asObject(json);
    const teamStats = Array.isArray(root?.teamStats) ? root.teamStats : [];
    const home = asObject(asObject(teamStats[0])?.stats);
    const away = asObject(asObject(teamStats[1])?.stats);
    if (!home || !away) return [];

    const rows: { label: string; home: string; away: string }[] = [];
    for (const row of STAT_ROWS) {
        const homeValue = asNumber(home[row.key]);
        const awayValue = asNumber(away[row.key]);
        if (homeValue === null && awayValue === null) continue;
        const totalOf = (stats: Json) => (row.total ? asNumber(stats[row.total]) : null);
        rows.push({
            label: row.label,
            home: formatStat(homeValue ?? 0, row.format, totalOf(home)),
            away: formatStat(awayValue ?? 0, row.format, totalOf(away)),
        });
    }
    return rows;
}

// --------------------------------------------------------------------------
// Tabla de posiciones
// --------------------------------------------------------------------------

export interface WrStandingRow {
    teamId: string | null;
    name: string;
    country: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    pointsFor: number;
    pointsAgainst: number;
    triesFor: number;
    triesAgainst: number;
    bonusPoints: number;
    points: number;
}

export interface WrPoolTable {
    pool: string;
    name: string;
    rows: WrStandingRow[];
}

function emptyRow(side: WrSide): WrStandingRow {
    return {
        teamId: side.teamId,
        name: side.name,
        country: side.country,
        played: 0, won: 0, drawn: 0, lost: 0,
        pointsFor: 0, pointsAgainst: 0, triesFor: 0, triesAgainst: 0,
        bonusPoints: 0, points: 0,
    };
}

function sortRows(rows: WrStandingRow[]): WrStandingRow[] {
    return rows.sort((left, right) =>
        right.points - left.points
        || (right.pointsFor - right.pointsAgainst) - (left.pointsFor - left.pointsAgainst)
        || right.triesFor - left.triesFor
        || right.pointsFor - left.pointsFor
        || left.name.localeCompare(right.name, 'es'));
}

/**
 * La tabla de cada grupo calculada con el reglamento de World Rugby para sus
 * torneos juveniles: 4 puntos el triunfo, 2 el empate, 1 bonus ofensivo por
 * cuatro tries o más y 1 defensivo por perder por siete o menos.
 *
 * Los tries salen de la cronología de cada partido (`triesByMatch`). Si falta
 * la de alguno, ese partido no suma bonus ofensivo: mejor un punto de menos
 * que uno inventado.
 */
export function computeWrPoolTables(
    fixtures: readonly WrFixture[],
    triesByMatch: ReadonlyMap<string, { home: number; away: number }>,
): WrPoolTable[] {
    const pools = new Map<string, Map<string, WrStandingRow>>();

    for (const fixture of fixtures) {
        if (!fixture.pool) continue;
        const table = pools.get(fixture.pool) ?? new Map<string, WrStandingRow>();
        pools.set(fixture.pool, table);
        const homeKey = fixture.home.teamId ?? fixture.home.name;
        const awayKey = fixture.away.teamId ?? fixture.away.name;
        if (!table.has(homeKey)) table.set(homeKey, emptyRow(fixture.home));
        if (!table.has(awayKey)) table.set(awayKey, emptyRow(fixture.away));

        if (fixture.state !== 'final' || fixture.home.score === null || fixture.away.score === null) continue;
        const home = table.get(homeKey) as WrStandingRow;
        const away = table.get(awayKey) as WrStandingRow;
        const tries = triesByMatch.get(fixture.matchId) ?? null;
        const homeScore = fixture.home.score;
        const awayScore = fixture.away.score;

        const sides: [WrStandingRow, number, number, number, number][] = [
            [home, homeScore, awayScore, tries?.home ?? 0, tries?.away ?? 0],
            [away, awayScore, homeScore, tries?.away ?? 0, tries?.home ?? 0],
        ];
        for (const [row, own, other, ownTries, otherTries] of sides) {
            row.played += 1;
            row.pointsFor += own;
            row.pointsAgainst += other;
            row.triesFor += ownTries;
            row.triesAgainst += otherTries;
            let bonus = 0;
            if (tries && ownTries >= 4) bonus += 1;
            if (own > other) {
                row.won += 1;
                row.points += 4;
            } else if (own === other) {
                row.drawn += 1;
                row.points += 2;
            } else {
                row.lost += 1;
                if (other - own <= 7) bonus += 1;
            }
            row.bonusPoints += bonus;
            row.points += bonus;
        }
    }

    return [...pools.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([pool, table]) => ({ pool, name: `Grupo ${pool}`, rows: sortRows([...table.values()]) }));
}

/** La tabla oficial de World Rugby, con los nombres del fixture. */
export function parseWrStandings(json: unknown, event: WrEventDef): WrPoolTable[] {
    const root = asObject(json);
    const tables: WrPoolTable[] = [];
    for (const raw of Array.isArray(root?.tables) ? root.tables : []) {
        const table = asObject(raw);
        const entries = Array.isArray(table?.entries) ? table.entries : [];
        if (!table || entries.length === 0) continue;
        const pool = (asString(table.shortLabel) || asString(table.label).replace(/^Pool\s+/i, '')).toUpperCase();
        const rows = entries.map((rawEntry) => {
            const entry = asObject(rawEntry) ?? {};
            const side = toSide(entry.team, event, null);
            return {
                teamId: side.teamId,
                name: side.name,
                country: side.country,
                played: asNumber(entry.played) ?? 0,
                won: asNumber(entry.won) ?? 0,
                drawn: asNumber(entry.drawn) ?? 0,
                lost: asNumber(entry.lost) ?? 0,
                pointsFor: asNumber(entry.pointsFor) ?? 0,
                pointsAgainst: asNumber(entry.pointsAgainst) ?? 0,
                triesFor: asNumber(entry.triesFor) ?? 0,
                triesAgainst: asNumber(entry.triesAgainst) ?? 0,
                bonusPoints: asNumber(entry.bonusPoints) ?? 0,
                points: asNumber(entry.points) ?? 0,
            };
        });
        tables.push({ pool, name: `Grupo ${pool}`, rows });
    }
    return tables;
}

/**
 * La oficial manda, pero solo si está al día: tiene que contar los mismos
 * partidos jugados que el fixture. Si no, la calculada, que sale del mismo
 * dato que la pantalla ya muestra.
 */
export function pickWrStandings(
    official: readonly WrPoolTable[],
    computed: readonly WrPoolTable[],
): { tables: WrPoolTable[]; source: 'official' | 'computed' } {
    const playedOf = (tables: readonly WrPoolTable[]) =>
        tables.reduce((sum, table) => sum + table.rows.reduce((inner, row) => inner + row.played, 0), 0);
    const officialPlayed = playedOf(official);
    if (officialPlayed > 0 && officialPlayed === playedOf(computed)) {
        return { tables: [...official], source: 'official' };
    }
    return { tables: [...computed], source: 'computed' };
}

// --------------------------------------------------------------------------
// Carga manual
// --------------------------------------------------------------------------

/**
 * Lo que carga un admin de G22 cuando World Rugby no publica el partido (el
 * Challenger 2026 se jugó entero con la fuente en "sin empezar, 0-0").
 */
export type WrManualStatus = 'live' | 'halftime' | 'final';

export interface WrManualResult {
    status: WrManualStatus;
    homeScore: number;
    awayScore: number;
    /** Tries de cada lado: sin ellos no hay bonus ofensivo. */
    homeTries: number | null;
    awayTries: number | null;
    /** Minuto del partido en juego (1 a 80, más el agregado). */
    minute: number | null;
}

const MANUAL_STATUSES: readonly WrManualStatus[] = ['live', 'halftime', 'final'];

function asCount(value: unknown, max: number): number | null {
    const number = asNumber(value);
    return number !== null && Number.isInteger(number) && number >= 0 && number <= max ? number : null;
}

/** Valida una carga manual (del cuerpo de un pedido o de la base). Null si no sirve. */
export function parseWrManualResult(raw: unknown): WrManualResult | null {
    const value = asObject(raw);
    if (!value) return null;
    const status = asString(value.status) as WrManualStatus;
    if (!MANUAL_STATUSES.includes(status)) return null;
    const homeScore = asCount(value.homeScore, 300);
    const awayScore = asCount(value.awayScore, 300);
    if (homeScore === null || awayScore === null) return null;
    const homeTries = asCount(value.homeTries, 60);
    const awayTries = asCount(value.awayTries, 60);
    const bothTries = homeTries !== null && awayTries !== null;
    const minute = status === 'live' ? asCount(value.minute, 120) : null;
    return {
        status,
        homeScore,
        awayScore,
        homeTries: bothTries ? homeTries : null,
        awayTries: bothTries ? awayTries : null,
        minute: minute !== null && minute > 0 ? minute : null,
    };
}

/**
 * Pone la carga manual sobre el fixture de World Rugby.
 *
 * La fuente oficial manda: la carga solo cubre un partido que World Rugby
 * todavía no publicó. En cuanto la fuente lo pasa a en vivo, final,
 * postergado o cancelado, se muestra lo suyo y la carga queda guardada sin
 * efecto. Un "en vivo" manual que nadie cerró pasa a final a las 3 h, con la
 * misma guarda que el en vivo de la fuente.
 */
export function applyWrManualResults(
    fixtures: readonly WrFixture[],
    manual: ReadonlyMap<string, WrManualResult>,
    nowMs: number,
): WrFixture[] {
    if (manual.size === 0) return [...fixtures];
    return fixtures.map((fixture) => {
        const result = manual.get(fixture.matchId);
        if (!result || fixture.state !== 'scheduled') return fixture;

        const staleLive = result.status !== 'final'
            && fixture.kickoffMs !== null
            && nowMs > fixture.kickoffMs + STALE_LIVE_AFTER_MS;
        const final = result.status === 'final' || staleLive;
        const rawStatus = final
            ? 'C'
            : result.status === 'halftime'
                ? 'LHT'
                : result.minute !== null && result.minute > 40 ? 'L2' : 'L1';

        return {
            ...fixture,
            rawStatus,
            state: final ? 'final' : 'live',
            clockSecs: !final && result.status === 'live' && result.minute !== null ? (result.minute - 1) * 60 : null,
            home: { ...fixture.home, score: result.homeScore },
            away: { ...fixture.away, score: result.awayScore },
            manual: true,
            manualTries: result.homeTries !== null && result.awayTries !== null
                ? { home: result.homeTries, away: result.awayTries }
                : null,
        };
    });
}
