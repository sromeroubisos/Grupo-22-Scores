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

// ── Types ────────────────────────────────────────────────────────────────────

export interface CachedTeam {
    id: string;
    name: string;
    logo: string;
    shortName: string;
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

function normalizeCachedTeam(team: CachedTeam): CachedTeam {
    return {
        ...team,
        logo: resolveTeamLogo({
            id: team.id,
            team_id: team.id,
            name: team.name,
            short_name: team.shortName,
            logo: team.logo,
            image_path: team.logo,
            small_image_path: team.logo,
            logo_url: team.logo,
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
            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC'
        }),
        away_team: normalizeCachedTeam({
            id: m.awayTeamId,
            name: m.awayTeamName,
            logo: m.awayTeamLogo || '',
            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS'
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
 */
export async function upsertMatches(
    matches: CachedExternalMatch[],
    supabase: SupabaseClient
): Promise<void> {
    if (matches.length === 0) return;

    const { error } = await supabase
        .from('external_match_cache')
        .upsert(matches, { onConflict: 'id' });

    if (error) {
        console.error('[externalMatchCache] upsertMatches error:', error.message);
        throw error;
    }
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

// ── Read operations ──────────────────────────────────────────────────────────

/**
 * Get cached matches for a specific date and sport.
 * Queries a ±1 day UTC range to cover timezone boundary cases;
 * the caller (matches/route.ts) applies `formatDateKey` post-filter.
 */
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
