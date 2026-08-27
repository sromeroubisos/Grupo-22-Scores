// El hub de videos de un torneo, resuelto en el servidor: los partidos del
// torneo que tienen videos cargados, con clubes, marcador y portadas.
//
// Un video se cuelga de un partido, así que el hub sale de dar vuelta ese
// índice: qué partidos tienen videos, y de qué torneo son. Entran los partidos
// locales (los externos no tienen torneo en `matches`), de cualquier torneo:
// activo o terminado, publicado o en borrador.
//
// UN VIDEO CARGADO LO VE CUALQUIERA. El `is_visible` del partido y el del
// torneo NO tapan el video: son la visibilidad del FIXTURE (qué aparece en la
// tabla y en el cuadro), no la del material editorial, y antes acoplaban las
// dos cosas — un torneo oculto se llevaba puestos sus highlights, y no había
// forma de verlos ni siquiera administrando, porque el filtro no miraba el rol.
// Si alguna vez hace falta esconder UN video, va a pedir su propia columna.

import { createAdminClient } from '@/lib/supabase/admin';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import {
    parseVideoUrl,
    videoPosterUrl,
    wantsGeneratedPoster,
    type MatchVideoLink,
} from '@/lib/matches/videoLinks';
import {
    getMatchVideosForMatches,
    listStoredMatchVideos,
    type StoredMatchVideos,
} from '@/lib/server/matchVideos';
import type {
    VideoHub,
    VideoHubFeaturedVideo,
    VideoHubMatch,
    VideoHubSummary,
    VideoHubTeam,
    VideoHubTournament,
} from '@/lib/videoHub/types';

const MATCH_COLUMNS = 'id, tournament_id, home_club_id, away_club_id, score, date_time, round_label, status, is_visible';
const TOURNAMENT_COLUMNS = 'id, name, display_name, slug, logo_url, sport_id, sport, season_id, status, is_active, is_visible, primary_color, secondary_color';
const CLUB_COLUMNS = 'id, name, short_name';
const IN_CHUNK = 100;

/** El hub muestra muchas portadas juntas: vale esperar un poco más que en la ficha. */
const HUB_THUMBNAIL_BUDGET_MS = 8000;

export const VIDEO_HUB_READ_ERROR = 'No se pudo armar el hub de videos.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

export function isVideoHubId(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value);
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

async function selectIn(
    table: string,
    columns: string,
    column: string,
    values: string[],
    refine?: (query: LooseSupabaseClient) => LooseSupabaseClient,
): Promise<Row[]> {
    const admin = createAdminClient();
    const rows: Row[] = [];

    for (const chunk of chunks(values, IN_CHUNK)) {
        let query = admin.from(table).select(columns).in(column, chunk);
        if (refine) query = refine(query);
        const { data, error } = await query;
        if (error) {
            console.error(`[videoHub] ${table} read failed:`, error);
            throw new Error(VIDEO_HUB_READ_ERROR);
        }
        rows.push(...((data ?? []) as Row[]));
    }

    return rows;
}

/**
 * Los partidos que se OFRECEN para cargarles un clip desde el editor de la
 * votación. Acá sí se respeta el `is_visible`: los partidos ocultos de un
 * playoff son los placeholders del cuadro (todavía sin equipos), y llenarían
 * la lista de opciones que no significan nada.
 *
 * Ojo: esto NO decide qué se VE. Un video cargado se muestra siempre, aunque
 * su partido o su torneo estén ocultos.
 */
function isPickableMatch(row: Row): boolean {
    return row.is_visible !== false;
}

function toTournament(row: Row): VideoHubTournament {
    const id = String(row.id);
    const name = text(row.display_name) ?? text(row.name) ?? 'Torneo';
    return {
        id,
        name,
        slug: text(row.slug),
        sportId: text(row.sport_id) ?? text(row.sport),
        seasonId: text(row.season_id),
        // Siempre por el proxy: un logo_url en base64 no viaja en el HTML.
        logoUrl: buildTeamLogoProxyUrl({ key: id, name, entity: 'tournament' }),
        primaryColor: text(row.primary_color),
        secondaryColor: text(row.secondary_color),
    };
}

function toScore(raw: unknown): { home: number; away: number } | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Row;
    if (record.home === null || record.home === undefined || record.away === null || record.away === undefined) return null;
    const home = Number(record.home);
    const away = Number(record.away);
    return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
}

function toTeam(clubId: string | null, clubs: Map<string, Row>, fallbackName: string): VideoHubTeam {
    const club = clubId ? clubs.get(clubId) : undefined;
    const name = text(club?.name) ?? text(club?.short_name) ?? fallbackName;
    return {
        id: clubId,
        name,
        logoUrl: clubId ? buildTeamLogoProxyUrl({ key: clubId, name }) : null,
    };
}

/** Los clubes de esos partidos, en una sola lectura. */
async function readClubs(matchRows: Row[]): Promise<Map<string, Row>> {
    const clubIds = Array.from(new Set(
        matchRows
            .flatMap((match) => [text(match.home_club_id), text(match.away_club_id)])
            .filter((value): value is string => Boolean(value)),
    ));
    const clubRows = clubIds.length > 0 ? await selectIn('clubs', CLUB_COLUMNS, 'id', clubIds) : [];
    return new Map(clubRows.map((club) => [String(club.id), club]));
}

// ── La portada de noticias ────────────────────────────────────────────────

/** Un video con el partido del que cuelga y cuándo se cargó. */
interface Candidate {
    match: Row;
    video: MatchVideoLink;
    /** La fecha del video o, en filas viejas sin fecha propia, la de la fila. */
    at: string;
}

/** Del más reciente al más viejo; a igual fecha, por ids, para que el orden sea el mismo siempre. */
function byRecency(a: Candidate, b: Candidate): number {
    return b.at.localeCompare(a.at)
        || String(a.match.id).localeCompare(String(b.match.id))
        || a.video.id.localeCompare(b.video.id);
}

function candidatesOf(matchRows: Row[], byMatch: Map<string, StoredMatchVideos>): Candidate[] {
    const out: Candidate[] = [];
    for (const match of matchRows) {
        const entry = byMatch.get(String(match.id));
        if (!entry) continue;
        for (const video of entry.videos) {
            out.push({ match, video, at: video.addedAt || entry.updatedAt || '' });
        }
    }
    return out.sort(byRecency);
}

function toFeaturedVideo(candidate: Candidate, clubs: Map<string, Row>): VideoHubFeaturedVideo {
    const { match, video } = candidate;
    return {
        id: video.id,
        kind: video.kind,
        title: video.title,
        provider: video.provider,
        addedAt: candidate.at,
        // Sin salir a buscar: la guardada, o la que se deduce de la URL (YouTube).
        posterUrl: videoPosterUrl(video, parseVideoUrl(video.url)),
        generatedPoster: wantsGeneratedPoster(video),
        match: {
            id: String(match.id),
            dateTime: text(match.date_time),
            roundLabel: text(match.round_label),
            home: toTeam(text(match.home_club_id), clubs, 'Local'),
            away: toTeam(text(match.away_club_id), clubs, 'Visitante'),
            score: toScore(match.score),
        },
    };
}

/**
 * Los torneos que tienen videos, del de carga más reciente al más viejo, cada
 * uno con su último video como portada. Para la portada de noticias: no
 * busca miniaturas ni votaciones (eso lo pega la página, aparte).
 */
export async function listVideoHubs(): Promise<VideoHubSummary[]> {
    const stored = await listStoredMatchVideos();
    if (stored.length === 0) return [];

    const byMatch = new Map(stored.map((entry) => [entry.matchId, entry]));
    const matches = await selectIn('matches', MATCH_COLUMNS, 'id', Array.from(byMatch.keys()));

    const byTournament = new Map<string, Row[]>();
    for (const match of matches) {
        const tournamentId = text(match.tournament_id);
        if (!tournamentId) continue;
        const list = byTournament.get(tournamentId) ?? [];
        list.push(match);
        byTournament.set(tournamentId, list);
    }
    if (byTournament.size === 0) return [];

    const tournaments = await selectIn('tournaments', TOURNAMENT_COLUMNS, 'id', Array.from(byTournament.keys()));

    // El video más reciente de cada torneo. Los clubes de esos partidos se
    // piden una sola vez, para todos los torneos juntos.
    const featured = new Map<string, { candidates: Candidate[]; rows: Row[] }>();
    for (const row of tournaments) {
        const rows = byTournament.get(String(row.id)) ?? [];
        const candidates = candidatesOf(rows, byMatch);
        if (candidates.length > 0) featured.set(String(row.id), { candidates, rows });
    }
    const clubs = await readClubs(Array.from(featured.values()).map((entry) => entry.candidates[0].match));

    const out: VideoHubSummary[] = [];
    for (const row of tournaments) {
        const entry = featured.get(String(row.id));
        if (!entry) continue;
        const latest = entry.candidates[0];
        out.push({
            tournament: toTournament(row),
            videoCount: entry.candidates.length,
            matchCount: entry.rows.length,
            latestAddedAt: latest.at || null,
            latestVideo: toFeaturedVideo(latest, clubs),
            openPoll: null,
        });
    }

    return out.sort((a, b) => (
        (b.latestAddedAt ?? '').localeCompare(a.latestAddedAt ?? '')
        || a.tournament.name.localeCompare(b.tournament.name)
    ));
}

/** El hub entero de un torneo. null si el torneo no existe o no es público. */
export async function getVideoHub(tournamentId: string): Promise<VideoHub | null> {
    if (!isVideoHubId(tournamentId)) return null;

    const admin = createAdminClient();
    const { data: row, error } = await admin
        .from('tournaments')
        .select(TOURNAMENT_COLUMNS)
        .eq('id', tournamentId)
        .maybeSingle();
    if (error) {
        console.error('[videoHub] tournament read failed:', error);
        throw new Error(VIDEO_HUB_READ_ERROR);
    }
    if (!row) return null;
    const tournament = toTournament(row as Row);

    const stored = await listStoredMatchVideos();
    const candidateIds = stored.map((entry) => entry.matchId);
    const matchRows = candidateIds.length === 0
        ? []
        : await selectIn('matches', MATCH_COLUMNS, 'id', candidateIds, (query) => query.eq('tournament_id', tournamentId));

    const matchIds = matchRows.map((match) => String(match.id));
    const [videosByMatch, clubs] = await Promise.all([
        getMatchVideosForMatches(matchIds, { thumbnailBudgetMs: HUB_THUMBNAIL_BUDGET_MS }),
        readClubs(matchRows),
    ]);

    const matches: VideoHubMatch[] = [];
    for (const match of matchRows) {
        const id = String(match.id);
        const videos = videosByMatch.get(id) ?? [];
        if (videos.length === 0) continue;
        matches.push({
            id,
            dateTime: text(match.date_time),
            roundLabel: text(match.round_label),
            status: text(match.status),
            home: toTeam(text(match.home_club_id), clubs, 'Local'),
            away: toTeam(text(match.away_club_id), clubs, 'Visitante'),
            score: toScore(match.score),
            videos,
        });
    }
    matches.sort((a, b) => (b.dateTime ?? '').localeCompare(a.dateTime ?? '') || a.id.localeCompare(b.id));

    return {
        tournament,
        matches,
        videoCount: matches.reduce((sum, match) => sum + match.videos.length, 0),
    };
}

/** Cuántos partidos del torneo se ofrecen para cargarles un clip desde la votación. */
const CANDIDATE_MATCHES_LIMIT = 300;

/**
 * Los partidos visibles del torneo, sin videos, del más reciente al más
 * viejo: quien administra elige uno en el editor de la votación y le carga
 * un clip. Es la misma forma que un partido del hub, con `videos` vacío.
 */
export async function listHubCandidateMatches(tournamentId: string): Promise<VideoHubMatch[]> {
    if (!isVideoHubId(tournamentId)) return [];

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('matches')
        .select(MATCH_COLUMNS)
        .eq('tournament_id', tournamentId)
        .order('date_time', { ascending: false, nullsFirst: false })
        .limit(CANDIDATE_MATCHES_LIMIT);
    if (error) {
        console.error('[videoHub] candidate matches read failed:', error);
        throw new Error(VIDEO_HUB_READ_ERROR);
    }

    const rows = ((data ?? []) as Row[]).filter(isPickableMatch);
    const clubs = await readClubs(rows);
    return rows.map((match) => ({
        id: String(match.id),
        dateTime: text(match.date_time),
        roundLabel: text(match.round_label),
        status: text(match.status),
        home: toTeam(text(match.home_club_id), clubs, 'Local'),
        away: toTeam(text(match.away_club_id), clubs, 'Visitante'),
        score: toScore(match.score),
        videos: [],
    }));
}
