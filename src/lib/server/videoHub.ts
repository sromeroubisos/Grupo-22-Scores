// El hub de videos de un torneo, resuelto en el servidor: los partidos del
// torneo que tienen videos cargados, con clubes, marcador y portadas.
//
// Un video se cuelga de un partido, así que el hub sale de dar vuelta ese
// índice: qué partidos tienen videos → de qué torneo son. Solo entran los
// partidos locales (los externos no tienen torneo en `matches`) y visibles,
// de torneos activos y visibles.

import { createAdminClient } from '@/lib/supabase/admin';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import {
    getMatchVideosForMatches,
    listStoredMatchVideos,
    type StoredMatchVideos,
} from '@/lib/server/matchVideos';
import type {
    VideoHub,
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

function isTournamentPublic(row: Row): boolean {
    return row.is_active !== false && row.is_visible !== false;
}

function isMatchPublic(row: Row): boolean {
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

/** El video cargado más recientemente; si ninguno trae fecha, la de la fila. */
function latestAddedAt(stored: StoredMatchVideos): string | null {
    const added = stored.videos.map((video) => video.addedAt).filter(Boolean).sort();
    return added[added.length - 1] ?? stored.updatedAt;
}

/** Los torneos que tienen videos, del más reciente al más viejo. Para la portada de noticias. */
export async function listVideoHubs(): Promise<VideoHubSummary[]> {
    const stored = await listStoredMatchVideos();
    if (stored.length === 0) return [];

    const byMatch = new Map(stored.map((entry) => [entry.matchId, entry]));
    const matches = (await selectIn('matches', MATCH_COLUMNS, 'id', Array.from(byMatch.keys()))).filter(isMatchPublic);

    const byTournament = new Map<string, Row[]>();
    for (const match of matches) {
        const tournamentId = text(match.tournament_id);
        if (!tournamentId) continue;
        const list = byTournament.get(tournamentId) ?? [];
        list.push(match);
        byTournament.set(tournamentId, list);
    }
    if (byTournament.size === 0) return [];

    const tournaments = (await selectIn('tournaments', TOURNAMENT_COLUMNS, 'id', Array.from(byTournament.keys()))).filter(isTournamentPublic);

    const out: VideoHubSummary[] = [];
    for (const row of tournaments) {
        const rows = byTournament.get(String(row.id)) ?? [];
        let videoCount = 0;
        let latest: string | null = null;
        for (const match of rows) {
            const entry = byMatch.get(String(match.id));
            if (!entry) continue;
            videoCount += entry.videos.length;
            const added = latestAddedAt(entry);
            if (added && (!latest || added > latest)) latest = added;
        }
        if (videoCount === 0) continue;
        out.push({ tournament: toTournament(row), videoCount, matchCount: rows.length, latestAddedAt: latest });
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
    if (!row || !isTournamentPublic(row as Row)) return null;
    const tournament = toTournament(row as Row);

    const stored = await listStoredMatchVideos();
    const candidateIds = stored.map((entry) => entry.matchId);
    const matchRows = candidateIds.length === 0
        ? []
        : (await selectIn('matches', MATCH_COLUMNS, 'id', candidateIds, (query) => query.eq('tournament_id', tournamentId))).filter(isMatchPublic);

    const matchIds = matchRows.map((match) => String(match.id));
    const videosByMatch = await getMatchVideosForMatches(matchIds, { thumbnailBudgetMs: HUB_THUMBNAIL_BUDGET_MS });

    const clubIds = Array.from(new Set(
        matchRows
            .flatMap((match) => [text(match.home_club_id), text(match.away_club_id)])
            .filter((value): value is string => Boolean(value)),
    ));
    const clubRows = clubIds.length > 0 ? await selectIn('clubs', CLUB_COLUMNS, 'id', clubIds) : [];
    const clubs = new Map(clubRows.map((club) => [String(club.id), club]));

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
