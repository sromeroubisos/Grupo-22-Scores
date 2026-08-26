/**
 * externalMatchCache.ts
 *
 * Read/write service for the `external_match_cache` Supabase table.
 * Used by:
 *   - /api/cron/live-sync     → upsert live match state every minute
 *   - /api/cron/fixture-sync  → upsert fixture data every hour
 *   - /api/matches/route.ts   → read as fallback when FlashScore is unavailable
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match } from '@/types/match';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CachedTeam {
    id: string;
    name: string;
    logo: string;
    shortName: string;
    image_path?: string;
    small_image_path?: string;
    team_url?: string;
}

export interface CachedExternalMatch {
    id: string;
    sport: string;
    tournament_id: string | null;
    tournament_name: string | null;
    country_name: string | null;
    home_team: CachedTeam;
    away_team: CachedTeam;
    score: { home: number | null; away: number | null };
    status: 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';
    date_time: string;        // ISO string
    round_label: string | null;
    updated_at?: string;
}

/**
 * Resultado de una escritura sobre la caché. `written` es lo que efectivamente
 * quedó en la tabla; `skipped` marca que la escritura no pudo hacerse por una
 * causa conocida y no fatal (hoy: la tabla no existe).
 */
export interface CacheWriteResult {
    written: number;
    skipped: boolean;
    reason?: 'missing_table';
}

function normalizeCachedTeam(team: CachedTeam): CachedTeam {
    return {
        ...team,
        logo: resolveTeamLogo({
            id: team.id,
            team_id: team.id,
            name: team.name,
            short_name: team.shortName,
            logo: team.logo,
            image_path: team.image_path || team.logo,
            small_image_path: team.small_image_path || team.image_path || team.logo,
            logo_url: team.logo,
            team_url: team.team_url || '',
        }),
    };
}

// ── Mapper: Match → CachedExternalMatch ──────────────────────────────────────

export function mapFlashScoreMatchToCached(m: Match, sport: string): CachedExternalMatch {
    const anyM = m as any;
    const dateTime = m.scheduledAt instanceof Date && !isNaN(m.scheduledAt.getTime())
        ? m.scheduledAt.toISOString()
        : new Date().toISOString();

    const status: CachedExternalMatch['status'] =
        m.status === 'live'      ? 'live'      :
        m.status === 'final'     ? 'final'     :
        m.status === 'cancelled' ? 'cancelled' :
        m.status === 'postponed' ? 'postponed' :
        'scheduled';

    return {
        id: m.id,
        sport,
        tournament_id: m.tournamentId || null,
        tournament_name: anyM.leagueName || null,
        country_name: anyM.countryName || null,
        home_team: normalizeCachedTeam({
            id: m.homeTeamId,
            name: m.homeTeamName,
            logo: m.homeTeamLogo || '',
            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC',
            image_path: m.homeTeamImagePath || m.homeTeamLogo || '',
            small_image_path: m.homeTeamImagePath || m.homeTeamLogo || '',
            team_url: m.homeTeamUrl || '',
        }),
        away_team: normalizeCachedTeam({
            id: m.awayTeamId,
            name: m.awayTeamName,
            logo: m.awayTeamLogo || '',
            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS',
            image_path: m.awayTeamImagePath || m.awayTeamLogo || '',
            small_image_path: m.awayTeamImagePath || m.awayTeamLogo || '',
            team_url: m.awayTeamUrl || '',
        }),
        score: {
            home: m.score?.home ?? null,
            away: m.score?.away ?? null
        },
        status,
        date_time: dateTime,
        round_label: m.round != null ? `F${m.round}` : null
    };
}

export function mapExternalMatchToCached(match: {
    id: string;
    sport: string;
    tournamentId?: string | null;
    tournamentName?: string | null;
    countryName?: string | null;
    homeTeam: CachedTeam;
    awayTeam: CachedTeam;
    score?: { home: number | null; away: number | null } | null;
    status: CachedExternalMatch['status'];
    dateTime: string;
    roundLabel?: string | null;
}): CachedExternalMatch {
    return {
        id: match.id,
        sport: match.sport,
        tournament_id: match.tournamentId ?? null,
        tournament_name: match.tournamentName ?? null,
        country_name: match.countryName ?? null,
        home_team: normalizeCachedTeam(match.homeTeam),
        away_team: normalizeCachedTeam(match.awayTeam),
        score: {
            home: match.score?.home ?? null,
            away: match.score?.away ?? null,
        },
        status: match.status,
        date_time: match.dateTime,
        round_label: match.roundLabel ?? null,
    };
}

// ── Mapper: CachedExternalMatch → enriched match shape used by matches/route.ts ──

export function mapCachedToEnrichedMatch(m: CachedExternalMatch, sport: string) {
    return {
        id: m.id,
        tournamentId: m.tournament_id || `fs-unknown`,
        dateTime: m.date_time,
        status: m.status as any,
        score: m.score as any,
        clock: {
            running: m.status === 'live',
            seconds: 0,
            period: m.status === 'live' ? 'En Vivo' : '1T'
        },
        roundId: m.round_label || 'General',
        venue: 'Estadio',
        homeClubId: m.home_team.id,
        awayClubId: m.away_team.id,
        homeTeam: normalizeCachedTeam(m.home_team),
        awayTeam: normalizeCachedTeam(m.away_team),
        tournament: {
            id: m.tournament_id || 'ext-cache',
            name: m.tournament_name || 'Liga (caché)',
            sport: sport as any,
            status: 'published' as const,
            country: m.country_name || 'Internacional'
        },
        liveEnabled: m.status === 'live',
        source: 'cache' as const
    };
}

// ── Write operations ─────────────────────────────────────────────────────────

/**
 * Upsert a batch of matches into external_match_cache.
 * Uses `onConflict: 'id'` so duplicate writes are idempotent.
 *
 * Devuelve cuántas filas escribió DE VERDAD. Antes devolvía void y, cuando la
 * tabla no existía, retornaba normal: los crons sumaban igual al contador y
 * respondían `{ok: true, synced: 340}` habiendo escrito cero. La instrumentación
 * mentía y cualquier monitor veía verde. Quien llame a esto tiene que reportar
 * `written`, no el largo del array que le pasó.
 */
export async function upsertMatches(
    matches: CachedExternalMatch[],
    supabase: SupabaseClient
): Promise<CacheWriteResult> {
    if (matches.length === 0) return { written: 0, skipped: false };

    const { error } = await supabase
        .from('external_match_cache')
        .upsert(matches, { onConflict: 'id' });

    if (error) {
        if (error.code === '42P01' || isMissingTableError(error, 'external_match_cache')) {
            console.warn('[externalMatchCache] upsertMatches skipped: la tabla external_match_cache no existe. Aplicar la migración 20260701090000_restore_external_match_cache.sql.');
            return { written: 0, skipped: true, reason: 'missing_table' };
        }
        console.error('[externalMatchCache] upsertMatches error:', error.message);
        throw error;
    }
    return { written: matches.length, skipped: false };
}

/**
 * Upsert de historial por equipo (página del club, importadores).
 *
 * A diferencia de `upsertMatches` (crons, confían en su fuente), acá la fila
 * entrante puede ser más pobre que la guardada: el endpoint de equipo de
 * FlashScore no distingue un partido en vivo y rugbyarchive no sabe de hoy.
 * Reglas:
 *   - una fila 'live' guardada no se toca (live-sync es el dueño);
 *   - una 'final' con score no se pisa con una entrante sin score o no final.
 */
export async function upsertMatchHistory(
    matches: CachedExternalMatch[],
    supabase: SupabaseClient
): Promise<CacheWriteResult> {
    if (matches.length === 0) return { written: 0, skipped: false };

    type ExistingRow = { id: string; status: string; score: { home: number | null; away: number | null } | null };
    const existingById = new Map<string, ExistingRow>();
    const ids = matches.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
            .from('external_match_cache')
            .select('id, status, score')
            .in('id', ids.slice(i, i + 200));
        if (error) {
            if (error.code === '42P01' || isMissingTableError(error, 'external_match_cache')) {
                return { written: 0, skipped: true, reason: 'missing_table' };
            }
            throw error;
        }
        for (const row of (data || []) as ExistingRow[]) existingById.set(row.id, row);
    }

    const writable = matches.filter((m) => {
        const prev = existingById.get(m.id);
        if (!prev) return true;
        if (prev.status === 'live') return false;
        const prevHasScore = prev.status === 'final' && prev.score?.home != null && prev.score?.away != null;
        const nextHasScore = m.status === 'final' && m.score?.home != null && m.score?.away != null;
        return !(prevHasScore && !nextHasScore);
    });

    return upsertMatches(writable, supabase);
}

/**
 * Todos los partidos cacheados donde juega alguno de los `teamIds`, del más
 * nuevo al más viejo. Los ids van en las variantes con que se escriben las
 * filas: crudo de FlashScore, 'fs-team-<id>' (feed diario) y 'ra-team-<id>'
 * (importado de rugbyarchive). Usa las columnas generadas home_team_id /
 * away_team_id (migración 20260819200000); si esa migración no corrió
 * todavía, devuelve [] sin romper la página.
 */
export async function getTeamMatchHistory(
    teamIds: string[],
    supabase: SupabaseClient,
    opts: { limit?: number } = {}
): Promise<CachedExternalMatch[]> {
    const ids = Array.from(new Set(teamIds.map((v) => String(v || '').trim()).filter(Boolean)));
    if (ids.length === 0) return [];
    const list = `(${ids.map((id) => `"${id}"`).join(',')})`;

    const { data, error } = await supabase
        .from('external_match_cache')
        .select('*')
        .or(`home_team_id.in.${list},away_team_id.in.${list}`)
        .order('date_time', { ascending: false })
        .limit(opts.limit ?? 800);

    if (error) {
        // 42703: columnas generadas ausentes (migración sin aplicar) → sin historial.
        if (error.code === '42703' || error.code === '42P01' || isMissingTableError(error, 'external_match_cache')) {
            return [];
        }
        console.error('[externalMatchCache] getTeamMatchHistory error:', error.message);
        return [];
    }
    return (data || []) as CachedExternalMatch[];
}

/**
 * Reset previously-live matches that no longer appear in the live snapshot.
 * Only called when the FlashScore API call succeeded (even if it returned zero results).
 * The guard against accidental mass-reset: if `currentLiveIds` is empty AND `apiFailed=true`,
 * this function must NOT be called.
 */
export async function resetStaleLiveMatches(
    currentLiveIds: string[],
    sport: string,
    supabase: SupabaseClient
): Promise<void> {
    let query = supabase
        .from('external_match_cache')
        .update({ status: 'final' })
        .eq('sport', sport)
        .eq('status', 'live');

    if (currentLiveIds.length > 0) {
        query = query.not('id', 'in', `(${currentLiveIds.map(id => `"${id}"`).join(',')})`);
    }
    // When currentLiveIds is empty: update ALL live rows for this sport → all finished

    const { error } = await query;
    if (error) {
        console.error('[externalMatchCache] resetStaleLiveMatches error:', error.message);
        // Non-fatal: stale data will age out via TTL check on reads
    }
}

// ── Poll gating ──────────────────────────────────────────────────────────────

export type LivePollDecision = 'poll' | 'skip' | 'unknown';

/**
 * Decide si vale la pena pegarle al endpoint de vivo del proveedor.
 *
 * 'poll'    → hay filas en vivo, o programadas con kickoff cercano.
 * 'skip'    → el fixture está poblado y no hay nada por jugarse: llamar sería
 *             gastar un request en una respuesta vacía.
 * 'unknown' → no se pudo determinar (caché sin filas para el deporte, tabla
 *             ausente o error de lectura). El que llama tiene que fallar
 *             abierto y pollear como siempre: el silencio de la caché puede
 *             ser un hueco de cobertura del fixture (el rugby de FlashScore
 *             tiene endpoints mutilados) y no un día sin partidos.
 */
export async function shouldPollLiveMatches(
    sport: string,
    supabase: SupabaseClient
): Promise<LivePollDecision> {
    const nowMs = Date.now();
    const kickoffFrom = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString();
    const kickoffTo = new Date(nowMs + 15 * 60 * 1000).toISOString();

    // Filas en vivo de cualquier fecha (una fila colgada en 'live' mantiene el
    // poll abierto hasta que resetStaleLiveMatches la cierre) o programadas con
    // kickoff entre -3 h y +15 min.
    const pollable = await supabase
        .from('external_match_cache')
        .select('id')
        .eq('sport', sport)
        .or(`status.eq.live,and(status.eq.scheduled,date_time.gte.${kickoffFrom},date_time.lte.${kickoffTo})`)
        .limit(1);

    if (pollable.error) {
        console.warn(`[externalMatchCache] shouldPollLiveMatches (${sport}) no pudo leer:`, pollable.error.message);
        return 'unknown';
    }
    if ((pollable.data?.length ?? 0) > 0) return 'poll';

    // Sin candidatos. Solo es un "no hay partidos" confiable si el fixture
    // tiene filas en el horizonte que fixture-sync cubre; una caché vacía no
    // distingue un día tranquilo de un sync que nunca corrió.
    const horizonFrom = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();
    const horizonTo = new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString();
    const fixtureEvidence = await supabase
        .from('external_match_cache')
        .select('id')
        .eq('sport', sport)
        .gte('date_time', horizonFrom)
        .lte('date_time', horizonTo)
        .limit(1);

    if (fixtureEvidence.error) {
        console.warn(`[externalMatchCache] shouldPollLiveMatches (${sport}) no pudo leer el horizonte:`, fixtureEvidence.error.message);
        return 'unknown';
    }
    return (fixtureEvidence.data?.length ?? 0) > 0 ? 'skip' : 'unknown';
}

// ── Read operations ──────────────────────────────────────────────────────────

/**
 * Get cached matches for a specific date and sport.
 * Queries a ±1 day UTC range to cover timezone boundary cases;
 * the caller (matches/route.ts) applies `formatDateKey` post-filter.
 */
/**
 * ¿fixture-sync sigue vivo para este deporte? Verdadero si escribió alguna fila
 * en las últimas `maxAgeMinutes` (corre cada hora; live-sync cada minuto). Con
 * esa evidencia, una fecha SIN filas dentro del horizonte que el cron cubre es
 * un día sin partidos, no un sync que nunca corrió, y no hace falta gastar el
 * fan-out del proveedor para confirmarlo. 'unknown' si la tabla no responde:
 * el llamador falla abierto y repara con el proveedor como siempre.
 */
export async function hasRecentFixtureSyncEvidence(
    sport: string,
    supabase: SupabaseClient,
    maxAgeMinutes = 180,
): Promise<boolean | 'unknown'> {
    const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('external_match_cache')
        .select('id')
        .eq('sport', sport)
        .gte('updated_at', since)
        .limit(1);

    if (error) {
        console.warn(`[externalMatchCache] hasRecentFixtureSyncEvidence (${sport}) no pudo leer:`, error.message);
        return 'unknown';
    }
    return (data?.length ?? 0) > 0;
}

export async function getMatchesForDate(
    date: string,                // YYYY-MM-DD
    sport: string,
    supabase: SupabaseClient
): Promise<CachedExternalMatch[]> {
    const [year, month, day] = date.split('-').map(Number);
    const from = new Date(Date.UTC(year, month - 1, day - 1)).toISOString();
    const to   = new Date(Date.UTC(year, month - 1, day + 1, 23, 59, 59)).toISOString();

    const { data, error } = await supabase
        .from('external_match_cache')
        .select('*')
        .eq('sport', sport)
        .gte('date_time', from)
        .lte('date_time', to)
        .order('date_time', { ascending: true });

    if (error) {
        console.error('[externalMatchCache] getMatchesForDate error:', error.message);
        return [];
    }
    return (data || []) as CachedExternalMatch[];
}

/**
 * One-shot helper to clear out football cache rows that were ingested under
 * the previous provider prefixes (sofa-, fs-) so the next ESPN sync pass
 * repopulates from scratch with espn-soccer- ids. Safe to call repeatedly.
 */
export async function purgeNonEspnFootballCache(
    supabase: SupabaseClient
): Promise<{ deleted: number }> {
    const { data, error } = await supabase
        .from('external_match_cache')
        .delete()
        .eq('sport', 'football')
        .not('id', 'like', 'espn-soccer-%')
        .select('id');

    if (error) {
        console.error('[externalMatchCache] purgeNonEspnFootballCache error:', error.message);
        return { deleted: 0 };
    }

    return { deleted: Array.isArray(data) ? data.length : 0 };
}

/**
 * Get live matches for a sport, filtered to rows updated within the last 5 minutes.
 * Returns empty array if no fresh live data — the caller treats this as a total fallback miss.
 */
export async function getLiveMatches(
    sport: string,
    supabase: SupabaseClient
): Promise<CachedExternalMatch[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('external_match_cache')
        .select('*')
        .eq('sport', sport)
        .eq('status', 'live')
        .gte('updated_at', fiveMinutesAgo)
        .order('date_time', { ascending: true });

    if (error) {
        console.error('[externalMatchCache] getLiveMatches error:', error.message);
        return [];
    }
    return (data || []) as CachedExternalMatch[];
}
