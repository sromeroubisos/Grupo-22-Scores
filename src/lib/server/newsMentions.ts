// Las menciones de una noticia, contra la base: buscar qué etiquetar (el
// editor, al escribir `@`) y resolver lo etiquetado (el lector, para dibujar
// el escudo, la tarjeta del partido o el reproductor).
//
// Cinco tipos: club, jugador, torneo, partido y video. Salen de dos lados:
//
// - La base: clubes, `people`, torneos y partidos LOCALES (`matches`), y los
//   videos cargados en la web (`match_videos`). Una URL suelta de YouTube o de
//   X no pasa por acá, la dibuja el lector directo.
// - El Mundial de hockey (feed de la FIH, `lib/services/fihHockey.ts`): sus
//   partidos (`fih-match-…`), las selecciones y las jugadoras de cada plantel.
//   No viven en la base, pero tienen ficha igual: la arma
//   `server/worldCupProfiles.ts` contra el feed, y el id de la mención es el
//   mismo que la URL de esa ficha (`fih-wc-1867-ARG-3968`).
//
// Se lee con el cliente de servicio, como el hub de videos: son entidades
// públicas y lo que no se ve (`is_visible = false`) se filtra acá.

import { createAdminClient } from '@/lib/supabase/admin';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { escapePostgrestLike } from '@/lib/utils/postgrest';
import { describeVideo, type MatchVideoLink } from '@/lib/matches/videoLinks';
import { getMatchVideosForMatches, listStoredMatchVideos } from '@/lib/server/matchVideos';
import {
    getFihWorldCupAllMatches,
    getFihWorldCupSquads,
    getFihWorldCupTeams,
    type FihWorldCupSquad,
    type FihWorldCupTeam,
} from '@/lib/services/fihHockey';
import {
    FIH_COMPETITIONS,
    FIH_COMPETITION_KEYS,
    FIH_LOGO_URL,
    FIH_TOURNAMENT_ID_PREFIX,
    fihPlayerDisplayName,
    fihTeamFlagUrl,
    fihTeamNameFromCode,
    toFihPlayerRef,
    toFihTeamRef,
    type FihCompetition,
} from '@/lib/services/fihHockeyParser';
import type { FihSquadPlayer } from '@/lib/services/fihMatchDataParser';
import type { Match } from '@/types/match';
import {
    hrefForMention,
    isMentionKind,
    matchContextOf,
    matchLabelOf,
    mentionKey,
    splitVideoRef,
    type MentionKind,
    type MentionMatch,
    type MentionTeam,
    type ResolvedMention,
} from '@/lib/news/mentions';

const MATCH_COLUMNS = 'id, tournament_id, home_club_id, away_club_id, score, date_time, round_label, status, is_visible';
const TOURNAMENT_COLUMNS = 'id, name, display_name, slug, sport_id, sport, is_visible, review_status';
const CLUB_COLUMNS = 'id, name, short_name, slug, city, country, is_visible';
const PERSON_COLUMNS = 'id, full_name, name, first_name, last_name, position, status, role, club:clubs(name)';
const IN_CHUNK = 100;
const MAX_QUERY = 80;
export const MAX_RESOLVE_KEYS = 60;

/** Cuánto se espera al feed de la FIH antes de contestar sin el Mundial. */
const FIH_TIMEOUT_MS = 7000;

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** Minúsculas y sin tildes: "Perez" encuentra a "Pérez". */
function fold(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** true si todas las palabras de la búsqueda están en el texto. */
function matchesWords(haystack: string, words: string[]): boolean {
    const folded = fold(haystack);
    return words.every((word) => folded.includes(word));
}

/**
 * Un id que puede ir en un filtro de PostgREST y en un href: letras, números
 * y guiones. En esta base hay clubes con id de texto (`argentina-xv`), así
 * que pedir UUID dejaría afuera clubes reales.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
function isSafeId(value: unknown): value is string {
    return typeof value === 'string' && SAFE_ID.test(value);
}

/** El feed que no contesta a tiempo no traba el buscador: se sigue sin él. */
function withTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    return new Promise<T>((resolve) => {
        const timer = setTimeout(() => {
            console.warn(`[newsMentions] ${label} tardó más de ${FIH_TIMEOUT_MS} ms; sigo sin eso.`);
            resolve(fallback);
        }, FIH_TIMEOUT_MS);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); console.error(`[newsMentions] ${label} falló:`, error); resolve(fallback); },
        );
    });
}

async function selectIn(table: string, columns: string, column: string, values: string[]): Promise<Row[]> {
    const ids = Array.from(new Set(values.filter(Boolean)));
    if (ids.length === 0) return [];
    const admin = createAdminClient();
    const rows: Row[] = [];
    for (const chunk of chunks(ids, IN_CHUNK)) {
        const { data, error } = await admin.from(table).select(columns).in(column, chunk);
        if (error) {
            console.error(`[newsMentions] ${table} read failed:`, error);
            throw new Error('No se pudieron leer las menciones.');
        }
        rows.push(...((data ?? []) as Row[]));
    }
    return rows;
}

// ── De fila a mención ─────────────────────────────────────────────────────

function clubName(row: Row | undefined, fallback: string): string {
    return text(row?.name) ?? text(row?.short_name) ?? fallback;
}

function toTeam(clubId: string | null, clubs: Map<string, Row>, fallback: string): MentionTeam {
    const name = clubName(clubId ? clubs.get(clubId) : undefined, fallback);
    return { id: clubId, name, logoUrl: clubId ? buildTeamLogoProxyUrl({ key: clubId, name }) : null };
}

function toScore(raw: unknown): MentionMatch['score'] {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Row;
    if (record.home === null || record.home === undefined || record.away === null || record.away === undefined) return null;
    const home = Number(record.home);
    const away = Number(record.away);
    return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
}

/** Un partido que todavía no se jugó guarda 0–0: eso no es un marcador. */
const UNPLAYED_STATUSES = new Set(['scheduled', 'not_started', 'postponed', 'cancelled', 'pending']);

function toMatch(row: Row, clubs: Map<string, Row>, tournaments: Map<string, Row>): MentionMatch {
    const tournamentId = text(row.tournament_id);
    const tournamentRow = tournamentId ? tournaments.get(tournamentId) : undefined;
    const status = text(row.status);
    return {
        id: String(row.id),
        dateTime: text(row.date_time),
        roundLabel: text(row.round_label),
        status,
        tournament: tournamentId ? { id: tournamentId, name: text(tournamentRow?.display_name) ?? text(tournamentRow?.name) ?? 'Torneo' } : null,
        home: toTeam(text(row.home_club_id), clubs, 'Local'),
        away: toTeam(text(row.away_club_id), clubs, 'Visitante'),
        score: status && UNPLAYED_STATUSES.has(status.toLowerCase()) ? null : toScore(row.score),
    };
}

/**
 * Para elegir en el editor, los partidos van del más cercano a hoy al más
 * lejano, para los dos lados: el de anoche y el del fin de semana que viene
 * antes que uno de noviembre. Solo ordena la lista del buscador; el lector
 * no depende de la hora.
 */
function byProximityToNow(now: number) {
    const distance = (match: MentionMatch) => {
        const time = match.dateTime ? Date.parse(match.dateTime) : Number.NaN;
        return Number.isNaN(time) ? Number.POSITIVE_INFINITY : Math.abs(time - now);
    };
    return (a: MentionMatch, b: MentionMatch) => distance(a) - distance(b) || a.id.localeCompare(b.id);
}

function clubMention(row: Row): ResolvedMention {
    const id = String(row.id);
    const label = clubName(row, 'Club');
    const place = text(row.city) ?? text(row.country);
    return {
        kind: 'club',
        ref: id,
        label,
        href: hrefForMention('club', id),
        detail: place ? `Club · ${place}` : 'Club',
        logoUrl: buildTeamLogoProxyUrl({ key: id, name: label }),
        match: null,
        video: null,
    };
}

function personName(row: Row): string {
    return text(row.full_name)
        ?? text(row.name)
        ?? ([text(row.first_name), text(row.last_name)].filter(Boolean).join(' ') || 'Jugador');
}

function playerMention(row: Row): ResolvedMention {
    const id = String(row.id);
    const club = row.club && typeof row.club === 'object' ? text((row.club as Row).name) : null;
    const detail = [text(row.position), club].filter(Boolean).join(' · ');
    return {
        kind: 'player',
        ref: id,
        label: personName(row),
        href: hrefForMention('player', id),
        detail: detail ? `Jugador · ${detail}` : 'Jugador',
        logoUrl: null,
        match: null,
        video: null,
    };
}

function tournamentMention(row: Row): ResolvedMention {
    const id = String(row.id);
    const label = text(row.display_name) ?? text(row.name) ?? 'Torneo';
    const sport = text(row.sport_id) ?? text(row.sport);
    return {
        kind: 'tournament',
        ref: id,
        label,
        href: hrefForMention('tournament', id),
        detail: sport ? `Torneo · ${sport}` : 'Torneo',
        logoUrl: buildTeamLogoProxyUrl({ key: id, name: label, entity: 'tournament' }),
        match: null,
        video: null,
    };
}

function matchMention(match: MentionMatch): ResolvedMention {
    return {
        kind: 'match',
        ref: match.id,
        label: matchLabelOf(match),
        href: hrefForMention('match', match.id),
        detail: matchContextOf(match),
        logoUrl: match.home.logoUrl,
        match,
        video: null,
    };
}

function videoMention(match: MentionMatch, video: MatchVideoLink): ResolvedMention {
    const ref = `${match.id}/${video.id}`;
    return {
        kind: 'video',
        ref,
        label: describeVideo(video),
        href: hrefForMention('video', ref),
        detail: [matchLabelOf(match), match.tournament?.name].filter(Boolean).join(' · '),
        logoUrl: video.thumbnailUrl ?? null,
        match,
        video,
    };
}

/** Los clubes y torneos de esos partidos, en dos lecturas. */
async function readMatchContext(matchRows: Row[]): Promise<{ clubs: Map<string, Row>; tournaments: Map<string, Row> }> {
    const clubIds = matchRows.flatMap((row) => [text(row.home_club_id), text(row.away_club_id)]).filter((id): id is string => Boolean(id));
    const tournamentIds = matchRows.map((row) => text(row.tournament_id)).filter((id): id is string => Boolean(id));
    const [clubRows, tournamentRows] = await Promise.all([
        selectIn('clubs', CLUB_COLUMNS, 'id', clubIds),
        selectIn('tournaments', TOURNAMENT_COLUMNS, 'id', tournamentIds),
    ]);
    return {
        clubs: new Map(clubRows.map((row) => [String(row.id), row])),
        tournaments: new Map(tournamentRows.map((row) => [String(row.id), row])),
    };
}

// ── El Mundial de hockey (feed de la FIH) ─────────────────────────────────

const FIH_MATCH_PREFIX = 'fih-match-';

function isFihRef(ref: string): boolean {
    return ref.startsWith(FIH_TOURNAMENT_ID_PREFIX) || ref.startsWith(FIH_MATCH_PREFIX);
}

/** "Argentina" en castellano (la tabla de la FIH viene en inglés). */
function fihTeamName(entry: FihWorldCupTeam): string {
    return fihTeamNameFromCode(entry.team.code.toUpperCase()) || entry.team.name;
}

/** `fih-wc-1867-ARG` */
function fihTeamRef(entry: FihWorldCupTeam): string {
    return toFihTeamRef(entry.competition.key, entry.team.code);
}

/** El id de la jugadora si sirve como id; si no, su nombre en minúsculas y guiones. */
function fihPlayerSlug(player: FihSquadPlayer): string {
    if (isSafeId(player.id)) return player.id;
    return fold(player.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jugadora';
}

/** `fih-wc-1867-ARG-<persona>` */
function fihPlayerRef(entry: FihWorldCupTeam, player: FihSquadPlayer): string {
    return toFihPlayerRef(entry.competition.key, entry.team.code, fihPlayerSlug(player));
}

function fihTournamentMention(competition: FihCompetition): ResolvedMention {
    return {
        kind: 'tournament',
        ref: competition.tournamentId,
        label: competition.name,
        href: hrefForMention('tournament', competition.tournamentId),
        detail: `Torneo · Hockey · ${competition.season}`,
        logoUrl: FIH_LOGO_URL,
        match: null,
        video: null,
    };
}

function fihTeamMention(entry: FihWorldCupTeam): ResolvedMention {
    const ref = fihTeamRef(entry);
    return {
        kind: 'club',
        ref,
        label: fihTeamName(entry),
        href: hrefForMention('club', ref),
        detail: `Selección · ${entry.competition.name}`,
        logoUrl: fihTeamFlagUrl(entry.team.code) || null,
        match: null,
        video: null,
    };
}

function fihPlayerMention(entry: FihWorldCupTeam, player: FihSquadPlayer): ResolvedMention {
    const ref = fihPlayerRef(entry, player);
    const role = entry.competition.genderLabel === 'Femenino' ? 'Jugadora' : 'Jugador';
    return {
        kind: 'player',
        ref,
        label: fihPlayerDisplayName(player.name),
        href: hrefForMention('player', ref),
        detail: `${role} · ${fihTeamName(entry)} · ${entry.competition.name}`,
        logoUrl: player.image || fihTeamFlagUrl(entry.team.code) || null,
        match: null,
        video: null,
    };
}

function fihMatchToMention(match: Match): MentionMatch {
    const played = match.status === 'live' || match.status === 'final';
    const score = played && match.score.home !== null && match.score.home !== undefined && match.score.away !== null && match.score.away !== undefined
        ? { home: Number(match.score.home), away: Number(match.score.away) }
        : null;
    return {
        id: match.id,
        dateTime: match.scheduledAt ? match.scheduledAt.toISOString() : null,
        roundLabel: match.leagueStageName ?? null,
        status: match.status,
        tournament: { id: match.tournamentId, name: match.leagueName ?? 'Mundial de Hockey' },
        home: { id: match.homeTeamId, name: match.homeTeamName, logoUrl: match.homeTeamLogo || null },
        away: { id: match.awayTeamId, name: match.awayTeamName, logoUrl: match.awayTeamLogo || null },
        score,
    };
}

const fihCompetitions = (): FihCompetition[] => FIH_COMPETITION_KEYS.map((key) => FIH_COMPETITIONS[key]);

const fihTeams = () => withTimeout(getFihWorldCupTeams(), [] as FihWorldCupTeam[], 'selecciones del Mundial');
const fihSquads = () => withTimeout(getFihWorldCupSquads(), [] as FihWorldCupSquad[], 'planteles del Mundial');
const fihMatches = () => withTimeout(getFihWorldCupAllMatches(), [] as Match[], 'partidos del Mundial');

// ── Buscar ────────────────────────────────────────────────────────────────

async function searchClubs(query: string, limit: number): Promise<ResolvedMention[]> {
    const escaped = escapePostgrestLike(query);
    const words = fold(query).split(/\s+/).filter(Boolean);

    const [local, teams] = await Promise.all([
        createAdminClient()
            .from('clubs')
            .select(CLUB_COLUMNS)
            .or(`name.ilike.%${escaped}%,short_name.ilike.%${escaped}%`)
            .neq('is_visible', false)
            .order('name')
            .limit(limit)
            .then(({ data, error }) => {
                if (error) {
                    console.error('[newsMentions] clubs search failed:', error);
                    return [] as Row[];
                }
                return (data ?? []) as Row[];
            }),
        fihTeams(),
    ]);

    // Las selecciones del Mundial van primero: es lo que se está jugando.
    const nationals = teams
        .filter((entry) => matchesWords(`${fihTeamName(entry)} ${entry.team.name} ${entry.team.code}`, words))
        .map(fihTeamMention);
    return [...nationals, ...local.map(clubMention)].slice(0, limit);
}

async function searchPlayers(query: string, limit: number): Promise<ResolvedMention[]> {
    const escaped = escapePostgrestLike(query);
    const words = fold(query).split(/\s+/).filter(Boolean);

    const [local, squads] = await Promise.all([
        createAdminClient()
            .from('people')
            .select(PERSON_COLUMNS)
            .or(`full_name.ilike.%${escaped}%,name.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
            .limit(limit * 2)
            .then(({ data, error }) => {
                if (error) {
                    console.error('[newsMentions] people search failed:', error);
                    return [] as Row[];
                }
                return ((data ?? []) as Row[])
                    // Una ficha dada de baja o un miembro del staff no se ofrecen (mismo criterio que el buscador del sitio).
                    .filter((row) => row.status !== 'inactive' && row.role !== 'staff');
            }),
        fihSquads(),
    ]);

    const worldCup: ResolvedMention[] = [];
    for (const entry of squads) {
        for (const player of entry.players) {
            if (matchesWords(player.name, words)) worldCup.push(fihPlayerMention(entry, player));
        }
    }
    worldCup.sort((a, b) => a.label.localeCompare(b.label));

    return [...local.map(playerMention), ...worldCup].slice(0, limit);
}

async function searchTournaments(query: string, limit: number): Promise<ResolvedMention[]> {
    const escaped = escapePostgrestLike(query);
    const words = fold(query).split(/\s+/).filter(Boolean);
    const { data, error } = await createAdminClient()
        .from('tournaments')
        .select(TOURNAMENT_COLUMNS)
        .or(`name.ilike.%${escaped}%,display_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`)
        .neq('is_visible', false)
        .limit(limit * 2);
    if (error) {
        console.error('[newsMentions] tournaments search failed:', error);
    }

    const worldCups = fihCompetitions()
        .filter((competition) => matchesWords(`${competition.name} ${competition.fullName} mundial hockey`, words))
        .map(fihTournamentMention);
    const local = ((data ?? []) as Row[])
        .filter((row) => row.review_status !== 'rejected')
        .map(tournamentMention);
    return [...worldCups, ...local].slice(0, limit);
}

/** "los tilos vs casi", "los tilos - casi", "los tilos contra casi" → los dos lados. */
function splitSides(query: string): [string, string | null] {
    const parts = query.split(/\s+(?:vs\.?|v|-|–|contra)\s+/i).map((part) => part.trim()).filter(Boolean);
    return [parts[0] ?? query, parts[1] ?? null];
}

/** Los partidos locales de los clubes que se llaman así (hasta 60, del más reciente al más viejo). */
async function searchLocalMatches(first: string): Promise<MentionMatch[]> {
    const admin = createAdminClient();
    const escaped = escapePostgrestLike(first);
    const { data: clubRows, error: clubError } = await admin
        .from('clubs')
        .select('id, name, short_name')
        .or(`name.ilike.%${escaped}%,short_name.ilike.%${escaped}%`)
        .limit(20);
    if (clubError) {
        console.error('[newsMentions] match clubs search failed:', clubError);
        return [];
    }
    const clubIds = ((clubRows ?? []) as Row[]).map((row) => String(row.id)).filter(isSafeId);
    if (clubIds.length === 0) return [];

    const list = clubIds.join(',');
    const { data, error } = await admin
        .from('matches')
        .select(MATCH_COLUMNS)
        .or(`home_club_id.in.(${list}),away_club_id.in.(${list})`)
        .order('date_time', { ascending: false, nullsFirst: false })
        .limit(60);
    if (error) {
        console.error('[newsMentions] matches search failed:', error);
        return [];
    }

    // Un partido oculto es un placeholder del cuadro (sin equipos todavía): no se ofrece.
    const rows = ((data ?? []) as Row[]).filter((row) => row.is_visible !== false);
    const { clubs, tournaments } = await readMatchContext(rows);
    return rows.map((row) => toMatch(row, clubs, tournaments));
}

/**
 * Los partidos de esos clubes o selecciones —locales y del Mundial—, del más
 * reciente al más viejo. Con dos lados ("Los Tilos vs CASI") se dejan solo
 * los que enfrentan a los dos.
 */
async function searchMatches(query: string, limit: number): Promise<ResolvedMention[]> {
    const [first, second] = splitSides(query);
    const firstWords = fold(first).split(/\s+/).filter(Boolean);
    const other = second ? fold(second) : null;

    const [local, worldCup] = await Promise.all([
        searchLocalMatches(first).catch((error) => {
            console.error('[newsMentions] local matches search failed:', error);
            return [] as MentionMatch[];
        }),
        fihMatches().then((matches) => matches
            .filter((match) => matchesWords(match.homeTeamName, firstWords) || matchesWords(match.awayTeamName, firstWords))
            .map(fihMatchToMention)),
    ]);

    const all = [...local, ...worldCup].filter((match) => (
        !other || fold(match.home.name).includes(other) || fold(match.away.name).includes(other)
    ));
    all.sort(byProximityToNow(Date.now()));
    return all.slice(0, limit).map(matchMention);
}

/** Los videos cargados en la web cuyo título, clubes, torneo o fecha dicen eso. */
async function searchVideos(query: string, limit: number): Promise<ResolvedMention[]> {
    const stored = await listStoredMatchVideos();
    if (stored.length === 0) return [];

    const rows = await selectIn('matches', MATCH_COLUMNS, 'id', stored.map((entry) => entry.matchId));
    const { clubs, tournaments } = await readMatchContext(rows);
    const matches = new Map(rows.map((row) => [String(row.id), toMatch(row, clubs, tournaments)]));

    const words = fold(query).split(/\s+/).filter(Boolean);
    const candidates: Array<{ match: MentionMatch; video: MatchVideoLink; at: string }> = [];
    for (const entry of stored) {
        const match = matches.get(entry.matchId);
        if (!match) continue;
        for (const video of entry.videos) {
            const haystack = [video.title, match.home.name, match.away.name, match.tournament?.name, match.roundLabel].filter(Boolean).join(' ');
            if (matchesWords(haystack, words)) {
                candidates.push({ match, video, at: video.addedAt || entry.updatedAt || '' });
            }
        }
    }

    candidates.sort((a, b) => b.at.localeCompare(a.at) || a.match.id.localeCompare(b.match.id) || a.video.id.localeCompare(b.video.id));
    return candidates.slice(0, limit).map(({ match, video }) => videoMention(match, video));
}

const SEARCHERS: Record<MentionKind, (query: string, limit: number) => Promise<ResolvedMention[]>> = {
    club: searchClubs,
    tournament: searchTournaments,
    match: searchMatches,
    video: searchVideos,
    player: searchPlayers,
};

/** El orden en que se listan cuando se busca en todo: primero lo que se etiqueta más. */
const ALL_KINDS_ORDER: MentionKind[] = ['club', 'player', 'tournament', 'match', 'video'];

/**
 * Qué se puede etiquetar con ese texto. Con `kind` busca solo ahí; sin él,
 * un poco de cada tipo. Un buscador que falla en un tipo no tira los demás.
 */
export async function searchNewsMentions(rawQuery: string, kind: MentionKind | null, limit = 12): Promise<ResolvedMention[]> {
    const query = rawQuery.trim().slice(0, MAX_QUERY);
    if (query.length < 2) return [];

    if (kind) {
        return SEARCHERS[kind](query, limit).catch((error) => {
            console.error(`[newsMentions] ${kind} search failed:`, error);
            return [];
        });
    }

    const perKind = Math.max(3, Math.ceil(limit / 3));
    const lists = await Promise.all(ALL_KINDS_ORDER.map((each) => SEARCHERS[each](query, perKind).catch((error) => {
        console.error(`[newsMentions] ${each} search failed:`, error);
        return [] as ResolvedMention[];
    })));

    // Intercalados por tipo, para que un nombre común no llene la lista con un solo tipo.
    const out: ResolvedMention[] = [];
    for (let index = 0; out.length < limit; index += 1) {
        let added = false;
        for (const list of lists) {
            const item = list[index];
            if (item && out.length < limit) {
                out.push(item);
                added = true;
            }
        }
        if (!added) break;
    }
    return out;
}

// ── Resolver ──────────────────────────────────────────────────────────────

export interface MentionKeyRef {
    kind: MentionKind;
    ref: string;
}

/** Las menciones al Mundial, contra el feed de la FIH. Solo se pide lo que hace falta. */
async function resolveFihMentions(byKind: Map<MentionKind, string[]>, put: (mention: ResolvedMention) => void): Promise<void> {
    const refsOf = (kind: MentionKind) => (byKind.get(kind) ?? []).filter(isFihRef);
    const tournamentRefs = refsOf('tournament');
    const clubRefs = refsOf('club');
    const playerRefs = refsOf('player');
    const matchRefs = refsOf('match');

    for (const competition of fihCompetitions()) {
        if (tournamentRefs.includes(competition.tournamentId)) put(fihTournamentMention(competition));
    }

    const tasks: Promise<void>[] = [];

    if (clubRefs.length > 0 && playerRefs.length === 0) {
        tasks.push(fihTeams().then((teams) => {
            for (const entry of teams) if (clubRefs.includes(fihTeamRef(entry))) put(fihTeamMention(entry));
        }));
    }

    if (playerRefs.length > 0) {
        // Los planteles traen las selecciones: una sola pasada resuelve las dos cosas.
        tasks.push(fihSquads().then((squads) => {
            for (const entry of squads) {
                if (clubRefs.includes(fihTeamRef(entry))) put(fihTeamMention(entry));
                for (const player of entry.players) {
                    if (playerRefs.includes(fihPlayerRef(entry, player))) put(fihPlayerMention(entry, player));
                }
            }
        }));
    }

    if (matchRefs.length > 0) {
        tasks.push(fihMatches().then((matches) => {
            for (const match of matches) if (matchRefs.includes(match.id)) put(matchMention(fihMatchToMention(match)));
        }));
    }

    await Promise.all(tasks);
}

/**
 * Lo etiquetado, con su dato actual: nombre, escudo, el partido con marcador,
 * el video con portada. Lo que ya no existe no figura en el mapa (el lector
 * lo dibuja como link pelado). Nunca lanza: una lectura que falla deja ese
 * tipo sin resolver, y la nota se lee igual.
 */
export async function resolveNewsMentions(refs: MentionKeyRef[]): Promise<Record<string, ResolvedMention>> {
    const out: Record<string, ResolvedMention> = {};
    const byKind = new Map<MentionKind, string[]>();
    for (const { kind, ref } of refs.slice(0, MAX_RESOLVE_KEYS)) {
        if (!isMentionKind(kind)) continue;
        const list = byKind.get(kind) ?? [];
        list.push(ref);
        byKind.set(kind, list);
    }

    const put = (mention: ResolvedMention) => { out[mentionKey(mention)] = mention; };
    /** Los ids de la base: seguros para un filtro y que no son del Mundial. */
    const dbIds = (kind: MentionKind) => (byKind.get(kind) ?? []).filter((ref) => isSafeId(ref) && !isFihRef(ref));

    const tasks: Promise<void>[] = [];

    const clubIds = dbIds('club');
    if (clubIds.length > 0) {
        tasks.push(selectIn('clubs', CLUB_COLUMNS, 'id', clubIds).then((rows) => rows.forEach((row) => put(clubMention(row)))));
    }

    const playerIds = dbIds('player');
    if (playerIds.length > 0) {
        tasks.push(selectIn('people', PERSON_COLUMNS, 'id', playerIds).then((rows) => rows.forEach((row) => put(playerMention(row)))));
    }

    const tournamentIds = dbIds('tournament');
    if (tournamentIds.length > 0) {
        tasks.push(selectIn('tournaments', TOURNAMENT_COLUMNS, 'id', tournamentIds).then((rows) => rows.forEach((row) => put(tournamentMention(row)))));
    }

    const matchIds = dbIds('match');
    const videoPairs = (byKind.get('video') ?? [])
        .map(splitVideoRef)
        .filter((pair): pair is { matchId: string; videoId: string } => pair !== null && isSafeId(pair.matchId));
    const allMatchIds = Array.from(new Set([...matchIds, ...videoPairs.map((pair) => pair.matchId)]));
    if (allMatchIds.length > 0) {
        tasks.push((async () => {
            const rows = await selectIn('matches', MATCH_COLUMNS, 'id', allMatchIds);
            const { clubs, tournaments } = await readMatchContext(rows);
            const matches = new Map(rows.map((row) => [String(row.id), toMatch(row, clubs, tournaments)]));

            for (const id of matchIds) {
                const match = matches.get(id);
                if (match) put(matchMention(match));
            }

            if (videoPairs.length > 0) {
                // Sin salir a buscar portadas: la que esté guardada, y si no, el lector dibuja la placa.
                const videos = await getMatchVideosForMatches(videoPairs.map((pair) => pair.matchId), { thumbnailBudgetMs: 0 });
                for (const pair of videoPairs) {
                    const match = matches.get(pair.matchId);
                    const video = videos.get(pair.matchId)?.find((candidate) => candidate.id === pair.videoId);
                    if (match && video) put(videoMention(match, video));
                }
            }
        })());
    }

    if (Array.from(byKind.values()).some((list) => list.some(isFihRef))) {
        tasks.push(resolveFihMentions(byKind, put));
    }

    await Promise.all(tasks.map((task) => task.catch((error) => {
        console.error('[newsMentions] resolve failed:', error);
    })));

    return out;
}
