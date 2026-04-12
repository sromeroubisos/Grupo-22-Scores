import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
    resolveClubCanonicalPreferenceId,
    resolveClubPreferenceIds,
    resolveTournamentFollowerTournamentId,
    resolveTournamentLeaguePreferenceIds,
} from '@/lib/favorites/persistence';
import { buildClubCandidateIds, buildTournamentCandidateIds } from '@/lib/favorites/fetchFavorites';

type BrowserSupabaseClient = SupabaseClient<Database>;
type PostgrestLikeError = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

export type LeagueFollowRow = {
    league_id: string;
    canonical_league_id: string | null;
    sport_id: string | null;
    display_name: string;
    logo_url: string | null;
    created_at: string;
};

export type ClubFollowRow = {
    club_id: string;
    canonical_club_id: string | null;
    sport_id: string | null;
    display_name: string;
    logo_url: string | null;
    created_at: string;
};

type ToggleLeagueFollowInput = {
    entityId: string;
    name?: string;
    logoUrl?: string | null;
    sportId?: string | null;
    canonicalLeagueId?: string | null;
    forceIsFavorite?: boolean;
    existingRows?: LeagueFollowRow[];
};

type ToggleClubFollowInput = {
    entityId: string;
    name?: string;
    logoUrl?: string | null;
    sportId?: string | null;
    canonicalClubId?: string | null;
    forceIsFavorite?: boolean;
    existingRows?: ClubFollowRow[];
};

function normalizeValue(value: string | null | undefined): string {
    return String(value || '').trim();
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.map(normalizeValue).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function getFollowingErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (isRecord(error)) {
        const message = typeof error.message === 'string' ? error.message.trim() : '';
        const details = typeof error.details === 'string' ? error.details.trim() : '';
        const hint = typeof error.hint === 'string' ? error.hint.trim() : '';

        return [message, details, hint].filter(Boolean).join(' ').trim() || 'No se pudieron cargar tus seguidos.';
    }

    return 'No se pudieron cargar tus seguidos.';
}

export function isFollowingSchemaMissingError(error: unknown): boolean {
    if (!isRecord(error)) return false;

    const pgError = error as PostgrestLikeError;
    const code = normalizeValue(pgError.code);
    const combined = [
        normalizeValue(pgError.message),
        normalizeValue(pgError.details),
        normalizeValue(pgError.hint),
    ].join(' ').toLowerCase();

    return (
        code === 'PGRST205' ||
        code === '42P01' ||
        combined.includes('user_favorite_clubs') ||
        combined.includes('user_favorite_leagues') ||
        combined.includes('schema cache')
    );
}

function normalizeLeagueFollowRow(row: unknown): LeagueFollowRow | null {
    if (!isRecord(row)) return null;

    const leagueId = normalizeValue(typeof row.league_id === 'string' ? row.league_id : '');
    if (!leagueId) return null;

    return {
        league_id: leagueId,
        canonical_league_id: normalizeValue(typeof row.canonical_league_id === 'string' ? row.canonical_league_id : '') || null,
        sport_id: normalizeValue(typeof row.sport_id === 'string' ? row.sport_id : '') || null,
        display_name: normalizeValue(typeof row.display_name === 'string' ? row.display_name : '') || leagueId,
        logo_url: normalizeValue(typeof row.logo_url === 'string' ? row.logo_url : '') || null,
        created_at: normalizeValue(typeof row.created_at === 'string' ? row.created_at : '') || new Date().toISOString(),
    };
}

function normalizeClubFollowRow(row: unknown): ClubFollowRow | null {
    if (!isRecord(row)) return null;

    const clubId = normalizeValue(typeof row.club_id === 'string' ? row.club_id : '');
    if (!clubId) return null;

    return {
        club_id: clubId,
        canonical_club_id: normalizeValue(typeof row.canonical_club_id === 'string' ? row.canonical_club_id : '') || null,
        sport_id: normalizeValue(typeof row.sport_id === 'string' ? row.sport_id : '') || null,
        display_name: normalizeValue(typeof row.display_name === 'string' ? row.display_name : '') || clubId,
        logo_url: normalizeValue(typeof row.logo_url === 'string' ? row.logo_url : '') || null,
        created_at: normalizeValue(typeof row.created_at === 'string' ? row.created_at : '') || new Date().toISOString(),
    };
}

function hasIntersection(left: string[], right: string[]): boolean {
    if (left.length === 0 || right.length === 0) return false;
    const rightSet = new Set(right);
    return left.some((value) => rightSet.has(value));
}

export function matchesLeagueFollow(row: LeagueFollowRow, entityId: string): boolean {
    const normalizedEntityId = normalizeValue(entityId);
    if (!normalizedEntityId) return false;

    if (row.league_id === normalizedEntityId || row.canonical_league_id === normalizedEntityId) {
        return true;
    }

    const targetCandidates = buildTournamentCandidateIds(normalizedEntityId);
    const rowCandidates = uniqueValues([
        row.league_id,
        row.canonical_league_id,
        ...buildTournamentCandidateIds(row.league_id),
        ...(row.canonical_league_id ? buildTournamentCandidateIds(row.canonical_league_id) : []),
    ]);

    return hasIntersection(targetCandidates, rowCandidates);
}

export function matchesClubFollow(row: ClubFollowRow, entityId: string): boolean {
    const normalizedEntityId = normalizeValue(entityId);
    if (!normalizedEntityId) return false;

    if (row.club_id === normalizedEntityId || row.canonical_club_id === normalizedEntityId) {
        return true;
    }

    const targetCandidates = buildClubCandidateIds(normalizedEntityId);
    const rowCandidates = uniqueValues([
        row.club_id,
        row.canonical_club_id,
        ...buildClubCandidateIds(row.club_id),
        ...(row.canonical_club_id ? buildClubCandidateIds(row.canonical_club_id) : []),
    ]);

    return hasIntersection(targetCandidates, rowCandidates);
}

export async function getFollowedLeagues(
    supabase: BrowserSupabaseClient,
    userId: string,
): Promise<LeagueFollowRow[]> {
    const supabaseAny = supabase as any;
    const { data, error } = await supabaseAny
        .from('user_favorite_leagues')
        .select('league_id, canonical_league_id, sport_id, display_name, logo_url, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return ((data ?? []) as unknown[])
        .map((row: unknown) => normalizeLeagueFollowRow(row))
        .filter((row: LeagueFollowRow | null): row is LeagueFollowRow => Boolean(row));
}

export async function getFollowedClubs(
    supabase: BrowserSupabaseClient,
    userId: string,
): Promise<ClubFollowRow[]> {
    const supabaseAny = supabase as any;
    const { data, error } = await supabaseAny
        .from('user_favorite_clubs')
        .select('club_id, canonical_club_id, sport_id, display_name, logo_url, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return ((data ?? []) as unknown[])
        .map((row: unknown) => normalizeClubFollowRow(row))
        .filter((row: ClubFollowRow | null): row is ClubFollowRow => Boolean(row));
}

export async function toggleLeagueFollow(
    supabase: BrowserSupabaseClient,
    userId: string,
    input: ToggleLeagueFollowInput,
): Promise<{ isFollowing: boolean }> {
    const entityId = normalizeValue(input.entityId);
    if (!entityId) {
        return { isFollowing: false };
    }

    const existingRows = input.existingRows ?? await getFollowedLeagues(supabase, userId);
    const canonicalLeagueId = normalizeValue(
        input.canonicalLeagueId || await resolveTournamentFollowerTournamentId(supabase, entityId, input.canonicalLeagueId),
    ) || null;
    const matchedRows = existingRows.filter((row) => (
        matchesLeagueFollow(row, entityId)
        || (canonicalLeagueId ? row.canonical_league_id === canonicalLeagueId : false)
    ));
    const isCurrentlyFollowing = matchedRows.length > 0;
    const shouldFollow = typeof input.forceIsFavorite === 'boolean'
        ? input.forceIsFavorite
        : !isCurrentlyFollowing;

    if (matchedRows.length > 0) {
        const leagueIdsToDelete = uniqueValues(matchedRows.map((row) => row.league_id));
        const supabaseAny = supabase as any;
        const { error: deleteError } = await supabaseAny
            .from('user_favorite_leagues')
            .delete()
            .eq('user_id', userId)
            .in('league_id', leagueIdsToDelete);

        if (deleteError) {
            throw deleteError;
        }
    }

    if (!shouldFollow) {
        return { isFollowing: false };
    }

    const aliasIds = await resolveTournamentLeaguePreferenceIds(supabase, entityId);
    const preferredId = aliasIds.find((value) => value === entityId) || entityId;

    const supabaseAny = supabase as any;
    const { error: upsertError } = await supabaseAny
        .from('user_favorite_leagues')
        .upsert({
            user_id: userId,
            league_id: preferredId,
            canonical_league_id: canonicalLeagueId,
            sport_id: normalizeValue(input.sportId) || null,
            display_name: normalizeValue(input.name) || preferredId,
            logo_url: normalizeValue(input.logoUrl) || null,
        }, { onConflict: 'user_id,league_id' });

    if (upsertError) {
        throw upsertError;
    }

    return { isFollowing: true };
}

export async function toggleClubFollow(
    supabase: BrowserSupabaseClient,
    userId: string,
    input: ToggleClubFollowInput,
): Promise<{ isFollowing: boolean }> {
    const entityId = normalizeValue(input.entityId);
    if (!entityId) {
        return { isFollowing: false };
    }

    const existingRows = input.existingRows ?? await getFollowedClubs(supabase, userId);
    const canonicalClubId = normalizeValue(
        input.canonicalClubId || await resolveClubCanonicalPreferenceId(supabase, entityId),
    ) || null;
    const matchedRows = existingRows.filter((row) => (
        matchesClubFollow(row, entityId)
        || (canonicalClubId ? row.canonical_club_id === canonicalClubId : false)
    ));
    const isCurrentlyFollowing = matchedRows.length > 0;
    const shouldFollow = typeof input.forceIsFavorite === 'boolean'
        ? input.forceIsFavorite
        : !isCurrentlyFollowing;

    if (matchedRows.length > 0) {
        const clubIdsToDelete = uniqueValues(matchedRows.map((row) => row.club_id));
        const supabaseAny = supabase as any;
        const { error: deleteError } = await supabaseAny
            .from('user_favorite_clubs')
            .delete()
            .eq('user_id', userId)
            .in('club_id', clubIdsToDelete);

        if (deleteError) {
            throw deleteError;
        }
    }

    if (!shouldFollow) {
        return { isFollowing: false };
    }

    const aliasIds = await resolveClubPreferenceIds(supabase, entityId);
    const preferredId = aliasIds.find((value) => value === entityId) || entityId;

    const supabaseAny = supabase as any;
    const { error: upsertError } = await supabaseAny
        .from('user_favorite_clubs')
        .upsert({
            user_id: userId,
            club_id: preferredId,
            canonical_club_id: canonicalClubId,
            sport_id: normalizeValue(input.sportId) || null,
            display_name: normalizeValue(input.name) || preferredId,
            logo_url: normalizeValue(input.logoUrl) || null,
        }, { onConflict: 'user_id,club_id' });

    if (upsertError) {
        throw upsertError;
    }

    return { isFollowing: true };
}
