import type { SupabaseClient } from '@supabase/supabase-js';
import { EntityType } from '@/lib/types/user';

export type ResolvedFavorite = {
    id: string;
    entity_type: EntityType;
    name: string;
    logo_url?: string | null;
    color?: string | null;
    type_label: string;
    created_at: string;
};

export const FAVORITES_LOCAL_CACHE_KEY = 'g22_favorites_v5_fix';
export const FAVORITES_LOCAL_CACHE_OWNER_KEY = `${FAVORITES_LOCAL_CACHE_KEY}:owner`;
const PENDING_FAVORITE_NAME = 'Pendiente de sincronizar';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clearFavoritesLocalCache(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(FAVORITES_LOCAL_CACHE_KEY);
    window.localStorage.removeItem(FAVORITES_LOCAL_CACHE_OWNER_KEY);
}

type RpcFavoriteRow = {
    entity_id?: unknown;
    entity_type?: unknown;
    name?: unknown;
    logo_url?: unknown;
    color?: unknown;
    type_label?: unknown;
    created_at?: unknown;
};

type FavoriteBaseRow = {
    entity_type: EntityType;
    entity_id: string;
    created_at: string;
};

type ClubLookupRow = {
    id?: unknown;
    external_id?: unknown;
    name?: unknown;
    logo_url?: unknown;
    primary_color?: unknown;
};

type TournamentLookupRow = {
    id?: unknown;
    external_id?: unknown;
    name?: unknown;
    display_name?: unknown;
    logo_url?: unknown;
};

type ExternalTeamRow = {
    id?: unknown;
    name?: unknown;
    short_name?: unknown;
    logo_url?: unknown;
};

type ExternalTournamentRow = {
    id?: unknown;
    name?: unknown;
    display_name?: unknown;
    logo_url?: unknown;
};

type PersonLookupRow = {
    id?: unknown;
    full_name?: unknown;
    name?: unknown;
    photo_url?: unknown;
    avatar_url?: unknown;
};

type ExternalLookupClient = {
    from: (table: string) => {
        select: (columns: string) => {
            in: (
                column: string,
                values: string[],
            ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
        };
    };
};

function isEntityType(value: unknown): value is EntityType {
    return typeof value === 'string' && ['club', 'team', 'league', 'tournament', 'match', 'player'].includes(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));
}

export function buildClubCandidateIds(entityId: string): string[] {
    const raw = entityId.trim();
    if (!raw) return [];

    const lower = raw.toLowerCase();
    const values = [raw, lower];
    let stripped = raw;

    if (lower.startsWith('fs-team-')) {
        stripped = raw.slice(8);
        values.push(stripped, stripped.toLowerCase(), `fs-${stripped}`, `fs-${stripped.toLowerCase()}`);
    } else if (lower.startsWith('fs-')) {
        stripped = raw.slice(3);
        values.push(stripped, stripped.toLowerCase(), `fs-team-${stripped}`, `fs-team-${stripped.toLowerCase()}`);
    } else if (lower.startsWith('ras-team-')) {
        stripped = raw.slice(9);
        values.push(stripped, stripped.toLowerCase());
    } else if (lower.startsWith('espn-team-')) {
        stripped = raw.slice(10);
        values.push(stripped, stripped.toLowerCase());
    }

    const aliasSeed = stripped.trim();
    if (aliasSeed && !isUuid(aliasSeed)) {
        const aliasSeedLower = aliasSeed.toLowerCase();
        values.push(
            `fs-${aliasSeed}`,
            `fs-${aliasSeedLower}`,
            `fs-team-${aliasSeed}`,
            `fs-team-${aliasSeedLower}`,
            `ras-team-${aliasSeed}`,
            `ras-team-${aliasSeedLower}`,
            `espn-team-${aliasSeed}`,
            `espn-team-${aliasSeedLower}`,
        );
    }

    return uniqueStrings(values);
}

export function buildTournamentCandidateIds(entityId: string): string[] {
    const raw = entityId.trim();
    if (!raw) return [];

    const lower = raw.toLowerCase();
    const values = [raw, lower];
    let stripped = raw;

    if (lower.startsWith('fs-')) {
        stripped = raw.slice(3);
        values.push(stripped, stripped.toLowerCase());
    } else if (lower.startsWith('ras-league-')) {
        stripped = raw.slice('ras-league-'.length);
        values.push(stripped, stripped.toLowerCase());
    } else if (lower.startsWith('espn-league-')) {
        stripped = raw.slice('espn-league-'.length);
        values.push(stripped, stripped.toLowerCase());
    }

    const aliasSeed = stripped.trim();
    if (aliasSeed && !isUuid(aliasSeed)) {
        const aliasSeedLower = aliasSeed.toLowerCase();
        values.push(
            `fs-${aliasSeed}`,
            `fs-${aliasSeedLower}`,
            `ras-league-${aliasSeed}`,
            `ras-league-${aliasSeedLower}`,
            `espn-league-${aliasSeed}`,
            `espn-league-${aliasSeedLower}`,
        );
    }

    return uniqueStrings(values);
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value.trim());
}

function createResolvedFavoriteMeta(
    name: string,
    logo_url: string | null,
    color: string | null,
    type_label: string,
) {
    return { name, logo_url, color, type_label };
}

function registerClubLookup(
    map: Map<string, { name: string; logo_url: string | null; color: string | null; type_label: string }>,
    row: ClubLookupRow,
) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) return;

    const resolved = createResolvedFavoriteMeta(
        name,
        typeof row.logo_url === 'string' ? row.logo_url : null,
        typeof row.primary_color === 'string' ? row.primary_color : null,
        'Club',
    );

    uniqueStrings([
        id,
        externalId,
        ...buildClubCandidateIds(id),
        ...buildClubCandidateIds(externalId),
    ]).forEach((candidate) => {
        if (!map.has(candidate)) {
            map.set(candidate, resolved);
        }
    });
}

function registerTournamentLookup(
    map: Map<string, { name: string; logo_url: string | null; color: string | null; type_label: string }>,
    row: TournamentLookupRow,
) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
    const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : '';
    const name = displayName || (typeof row.name === 'string' ? row.name.trim() : '');
    if (!name) return;

    const resolved = createResolvedFavoriteMeta(
        name,
        typeof row.logo_url === 'string' ? row.logo_url : null,
        null,
        'Torneo',
    );

    uniqueStrings([
        id,
        externalId,
        ...buildTournamentCandidateIds(id),
        ...buildTournamentCandidateIds(externalId),
    ]).forEach((candidate) => {
        if (!map.has(candidate)) {
            map.set(candidate, resolved);
        }
    });
}

function favoriteKey(favorite: Pick<ResolvedFavorite, 'entity_type' | 'id'>): string {
    return `${favorite.entity_type}:${favorite.id}`;
}

function normalizeFavoriteId(value: string): string {
    return value.trim();
}

function isCompetitionEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
}

function isClubEntityType(entityType: EntityType): boolean {
    return entityType === 'club' || entityType === 'team';
}

function getDefaultTypeLabel(entityType: EntityType): string {
    if (entityType === 'club') return 'Club';
    if (entityType === 'league' || entityType === 'tournament') return 'Torneo';
    if (entityType === 'player') return 'Jugador';
    if (entityType === 'team') return 'Equipo';
    if (entityType === 'match') return 'Partido';
    return 'Favorito';
}

function hasUsableName(favorite: Pick<ResolvedFavorite, 'id' | 'name'>): boolean {
    const name = favorite.name.trim();
    return Boolean(name) && name !== PENDING_FAVORITE_NAME && name !== favorite.id;
}

function hasRenderableIdentity(favorite: Pick<ResolvedFavorite, 'id' | 'name' | 'logo_url' | 'color' | 'entity_type'>): boolean {
    if (hasUsableName(favorite)) return true;

    if (favorite.entity_type === 'player') {
        return true;
    }

    const logoUrl = typeof favorite.logo_url === 'string' ? favorite.logo_url.trim() : '';
    const color = typeof favorite.color === 'string' ? favorite.color.trim() : '';
    return Boolean(logoUrl || color);
}

function normalizeResolvedFavorite(favorite: ResolvedFavorite): ResolvedFavorite {
    const id = normalizeFavoriteId(favorite.id);
    const entityType = isCompetitionEntityType(favorite.entity_type)
        ? 'league'
        : isClubEntityType(favorite.entity_type)
            ? 'club'
            : favorite.entity_type;
    const normalizedName = favorite.name.trim();
    const normalizedTypeLabel = favorite.type_label.trim();

    return {
        ...favorite,
        id,
        entity_type: entityType,
        name: normalizedName || PENDING_FAVORITE_NAME,
        logo_url: typeof favorite.logo_url === 'string' && favorite.logo_url.trim() ? favorite.logo_url.trim() : null,
        color: typeof favorite.color === 'string' && favorite.color.trim() ? favorite.color.trim() : null,
        type_label: normalizedTypeLabel || getDefaultTypeLabel(entityType),
        created_at: typeof favorite.created_at === 'string' && favorite.created_at.trim()
            ? favorite.created_at
            : new Date().toISOString(),
    };
}

function favoriteFamilyKey(favorite: Pick<ResolvedFavorite, 'entity_type' | 'id'>): string {
    const family = isCompetitionEntityType(favorite.entity_type)
        ? 'competition'
        : isClubEntityType(favorite.entity_type)
            ? 'club'
            : favorite.entity_type;
    const aliases = family === 'club'
        ? buildClubCandidateIds(favorite.id)
        : family === 'competition'
            ? buildTournamentCandidateIds(favorite.id)
            : [normalizeFavoriteId(favorite.id)];
    const canonicalId = aliases
        .map(normalizeFavoriteId)
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))[0] || normalizeFavoriteId(favorite.id);
    return `${family}:${canonicalId}`;
}

function favoritePriority(favorite: ResolvedFavorite): number {
    let score = 0;

    if (hasUsableName(favorite)) score += 8;
    if (favorite.logo_url) score += 3;
    if (favorite.color) score += 1;
    if (favorite.type_label !== 'Favorito') score += 1;
    if (favorite.entity_type === 'club') score += 1;

    return score;
}

function mergeResolvedFavorite(existing: ResolvedFavorite, incoming: ResolvedFavorite): ResolvedFavorite {
    const normalizedExisting = normalizeResolvedFavorite(existing);
    const normalizedIncoming = normalizeResolvedFavorite(incoming);
    const existingScore = favoritePriority(normalizedExisting);
    const incomingScore = favoritePriority(normalizedIncoming);
    const preferred = incomingScore > existingScore ? normalizedIncoming : normalizedExisting;
    const fallback = preferred === normalizedIncoming ? normalizedExisting : normalizedIncoming;

    return {
        ...preferred,
        id: preferred.id || fallback.id,
        entity_type: isCompetitionEntityType(preferred.entity_type) || isCompetitionEntityType(fallback.entity_type)
            ? 'league'
            : preferred.entity_type,
        name: hasUsableName(preferred)
            ? preferred.name
            : hasUsableName(fallback)
                ? fallback.name
                : preferred.name,
        logo_url: preferred.logo_url || fallback.logo_url || null,
        color: preferred.color || fallback.color || null,
        type_label: preferred.type_label !== 'Favorito'
            ? preferred.type_label
            : fallback.type_label,
        created_at: normalizedExisting.created_at > normalizedIncoming.created_at
            ? normalizedExisting.created_at
            : normalizedIncoming.created_at,
    };
}

function readCachedFavorites(userId?: string | null): ResolvedFavorite[] {
    try {
        if (typeof window === 'undefined') return [];
        const expectedOwner = typeof userId === 'string' ? userId.trim() : '';
        const cachedOwner = window.localStorage.getItem(FAVORITES_LOCAL_CACHE_OWNER_KEY)?.trim() || '';

        if (!expectedOwner || !cachedOwner || cachedOwner !== expectedOwner) {
            return [];
        }

        const raw = window.localStorage.getItem(FAVORITES_LOCAL_CACHE_KEY);
        if (!raw) return [];

        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter((row): row is ResolvedFavorite => {
                if (typeof row !== 'object' || row === null) return false;
                const favorite = row as Partial<ResolvedFavorite>;
                return (
                    typeof favorite.id === 'string' &&
                    typeof favorite.name === 'string' &&
                    isEntityType(favorite.entity_type) &&
                    typeof favorite.type_label === 'string' &&
                    typeof favorite.created_at === 'string'
                );
            });
    } catch {
        return [];
    }
}

function mergeWithCachedFavorites(items: ResolvedFavorite[], userId?: string | null): ResolvedFavorite[] {
    const cached = new Map(readCachedFavorites(userId).map((favorite) => [favoriteKey(favorite), favorite]));
    if (cached.size === 0) return items;

    return items.map((favorite) => {
        const cachedFavorite = cached.get(favoriteKey(favorite));
        if (!cachedFavorite) return favorite;

        return {
            ...favorite,
            name: hasUsableName(favorite)
                ? favorite.name
                : hasUsableName(cachedFavorite)
                    ? cachedFavorite.name
                    : favorite.name,
            logo_url: favorite.logo_url || cachedFavorite.logo_url || null,
            color: favorite.color || cachedFavorite.color || null,
            type_label: favorite.type_label !== 'Favorito'
                ? favorite.type_label
                : cachedFavorite.type_label || favorite.type_label,
        };
    });
}

export function sanitizeResolvedFavorites(items: ResolvedFavorite[], userId?: string | null): ResolvedFavorite[] {
    const deduped = new Map<string, ResolvedFavorite>();

    items
        .map(normalizeResolvedFavorite)
        .filter((favorite) => favorite.id.length > 0)
        .forEach((favorite) => {
            const key = favoriteFamilyKey(favorite);
            const existing = deduped.get(key);
            deduped.set(key, existing ? mergeResolvedFavorite(existing, favorite) : favorite);
        });

    return mergeWithCachedFavorites(Array.from(deduped.values()), userId)
        .map(normalizeResolvedFavorite)
        .filter(hasRenderableIdentity)
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function isSyntheticMatchVote(entityType: unknown, entityId: unknown) {
    return entityType === 'match'
        && typeof entityId === 'string'
        && entityId.startsWith('vote:match:');
}

function mapRpcRow(row: RpcFavoriteRow): ResolvedFavorite {
    return {
        id: typeof row.entity_id === 'string' ? row.entity_id : '',
        entity_type: isEntityType(row.entity_type) ? row.entity_type : 'club',
        name: typeof row.name === 'string' && row.name.trim() ? row.name : PENDING_FAVORITE_NAME,
        logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
        color: typeof row.color === 'string' ? row.color : null,
        type_label: typeof row.type_label === 'string' && row.type_label.trim()
            ? row.type_label
            : getDefaultTypeLabel(isEntityType(row.entity_type) ? row.entity_type : 'club'),
        created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    };
}

function parseRpcPayload(data: unknown): ResolvedFavorite[] {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data) as unknown;
            return parseRpcPayload(parsed);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(data)) {
        return [];
    }

    return data
        .filter((row): row is RpcFavoriteRow => typeof row === 'object' && row !== null)
        .filter((row) => !isSyntheticMatchVote(row.entity_type, row.entity_id))
        .map(mapRpcRow)
        .filter((row) => row.id.length > 0);
}

async function tryFavoritesRpc(
    supabase: SupabaseClient,
    rpcName: 'get_my_favorites_enriched_v2' | 'get_my_favorites_enriched'
): Promise<ResolvedFavorite[] | null> {
    const response = rpcName === 'get_my_favorites_enriched_v2'
        ? await supabase.rpc(rpcName, { p_limit: 100, p_cursor: undefined })
        : await supabase.rpc(rpcName);

    if (response.error) {
        return null;
    }

    return parseRpcPayload(response.data);
}

async function fetchFavoritesFallback(
    supabase: SupabaseClient
): Promise<{ ok: boolean; items: ResolvedFavorite[] }> {
    const { data: favoritesData, error } = await supabase
        .from('favorites')
        .select('entity_type, entity_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error || !favoritesData) {
        return { ok: false, items: [] };
    }

    const favorites = favoritesData.filter((row): row is FavoriteBaseRow => (
        typeof row?.entity_id === 'string' &&
        typeof row?.created_at === 'string' &&
        isEntityType(row?.entity_type)
    )).filter((row) => !isSyntheticMatchVote(row.entity_type, row.entity_id));

    const clubIds = favorites
        .filter((row) => row.entity_type === 'club')
        .map((row) => row.entity_id);
    const tournamentIds = favorites
        .filter((row) => row.entity_type === 'league' || row.entity_type === 'tournament')
        .map((row) => row.entity_id);
    const playerIds = favorites
        .filter((row) => row.entity_type === 'player')
        .map((row) => row.entity_id);
    const internalTournamentIds = tournamentIds.filter(isUuid);
    const internalPlayerIds = playerIds.filter(isUuid);
    const internalClubIds = clubIds.filter(isUuid);
    const externalClubCandidateIds = uniqueStrings(clubIds.flatMap(buildClubCandidateIds));
    const externalTournamentCandidateIds = uniqueStrings(tournamentIds.flatMap(buildTournamentCandidateIds));
    const externalLookupClient = supabase as unknown as ExternalLookupClient;

    const [
        clubsByIdRes,
        clubsByExternalIdRes,
        tournamentsByIdRes,
        tournamentsByExternalIdRes,
        externalClubsRes,
        externalTournamentsRes,
        peopleRes,
    ] = await Promise.all([
        internalClubIds.length > 0
            ? supabase.from('clubs').select('id, external_id, name, logo_url, primary_color').in('id', internalClubIds)
            : Promise.resolve({ data: [], error: null }),
        externalClubCandidateIds.length > 0
            ? supabase.from('clubs').select('id, external_id, name, logo_url, primary_color').in('external_id', externalClubCandidateIds)
            : Promise.resolve({ data: [], error: null }),
        internalTournamentIds.length > 0
            ? supabase.from('tournaments').select('id, external_id, name, display_name, logo_url').in('id', internalTournamentIds)
            : Promise.resolve({ data: [], error: null }),
        externalTournamentCandidateIds.length > 0
            ? supabase.from('tournaments').select('id, external_id, name, display_name, logo_url').in('external_id', externalTournamentCandidateIds)
            : Promise.resolve({ data: [], error: null }),
        externalClubCandidateIds.length > 0
            ? externalLookupClient.from('external_teams').select('id, name, short_name, logo_url').in('id', externalClubCandidateIds)
            : Promise.resolve({ data: [], error: null }),
        externalTournamentCandidateIds.length > 0
            ? externalLookupClient.from('external_tournaments').select('id, name, display_name, logo_url').in('id', externalTournamentCandidateIds)
            : Promise.resolve({ data: [], error: null }),
        internalPlayerIds.length > 0
            ? supabase.from('people').select('id, full_name, name, photo_url, avatar_url').in('id', internalPlayerIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const clubMap = new Map<string, { name: string; logo_url: string | null; color: string | null; type_label: string }>();
    ((clubsByIdRes.data || []) as ClubLookupRow[]).forEach((club) => registerClubLookup(clubMap, club));
    ((clubsByExternalIdRes.data || []) as ClubLookupRow[]).forEach((club) => registerClubLookup(clubMap, club));

    const externalClubMap = new Map<string, { name: string; logo_url: string | null; color: null; type_label: string }>();
    ((externalClubsRes.data || []) as ExternalTeamRow[]).forEach((club) => {
        const id = typeof club.id === 'string' ? club.id : '';
        const name = typeof club.name === 'string' && club.name.trim()
            ? club.name
            : typeof club.short_name === 'string' && club.short_name.trim()
                ? club.short_name
                : '';
        if (!id || !name) return;

        const resolved = {
            name,
            logo_url: typeof club.logo_url === 'string' ? club.logo_url : null,
            color: null,
            type_label: 'Club',
        };

        buildClubCandidateIds(id).forEach((candidate) => {
            if (!externalClubMap.has(candidate)) {
                externalClubMap.set(candidate, resolved);
            }
        });
    });

    const tournamentMap = new Map<string, { name: string; logo_url: string | null; color: string | null; type_label: string }>();
    ((tournamentsByIdRes.data || []) as TournamentLookupRow[]).forEach((tournament) => registerTournamentLookup(tournamentMap, tournament));
    ((tournamentsByExternalIdRes.data || []) as TournamentLookupRow[]).forEach((tournament) => registerTournamentLookup(tournamentMap, tournament));

    const externalTournamentMap = new Map<string, { name: string; logo_url: string | null; color: null; type_label: string }>();
    ((externalTournamentsRes.data || []) as ExternalTournamentRow[]).forEach((tournament) => {
        const id = typeof tournament.id === 'string' ? tournament.id : '';
        const name = typeof tournament.display_name === 'string' && tournament.display_name.trim()
            ? tournament.display_name
            : typeof tournament.name === 'string' && tournament.name.trim()
                ? tournament.name
                : '';
        if (!id || !name) return;

        const resolved = {
            name,
            logo_url: typeof tournament.logo_url === 'string' ? tournament.logo_url : null,
            color: null,
            type_label: 'Torneo',
        };

        buildTournamentCandidateIds(id).forEach((candidate) => {
            if (!externalTournamentMap.has(candidate)) {
                externalTournamentMap.set(candidate, resolved);
            }
        });
    });

    const playerMap = new Map<string, { name: string; logo_url: string | null; color: null; type_label: string }>();
    ((peopleRes.data || []) as PersonLookupRow[]).forEach((person) => {
        const id = typeof person.id === 'string' ? person.id.trim() : '';
        const name = typeof person.full_name === 'string' && person.full_name.trim()
            ? person.full_name.trim()
            : typeof person.name === 'string' && person.name.trim()
                ? person.name.trim()
                : '';
        if (!id || !name) return;

        playerMap.set(id, {
            name,
            logo_url: typeof person.photo_url === 'string' && person.photo_url.trim()
                ? person.photo_url.trim()
                : typeof person.avatar_url === 'string' && person.avatar_url.trim()
                    ? person.avatar_url.trim()
                    : null,
            color: null,
            type_label: 'Jugador',
        });
    });

    const items = favorites.map((favorite) => {
        const resolved = (favorite.entity_type === 'club' || favorite.entity_type === 'team')
            ? clubMap.get(favorite.entity_id) || externalClubMap.get(favorite.entity_id) || buildClubCandidateIds(favorite.entity_id).map((candidate) => externalClubMap.get(candidate)).find(Boolean)
            : favorite.entity_type === 'league' || favorite.entity_type === 'tournament'
                ? tournamentMap.get(favorite.entity_id) || externalTournamentMap.get(favorite.entity_id) || buildTournamentCandidateIds(favorite.entity_id).map((candidate) => externalTournamentMap.get(candidate)).find(Boolean)
                : favorite.entity_type === 'player'
                    ? playerMap.get(favorite.entity_id)
                    : null;

        return {
            id: favorite.entity_id,
            entity_type: favorite.entity_type,
            name: resolved?.name || PENDING_FAVORITE_NAME,
            logo_url: resolved?.logo_url || null,
            color: resolved?.color || null,
            type_label: resolved?.type_label || 'Favorito',
            created_at: favorite.created_at,
        };
    });

    return { ok: true, items };
}

export async function fetchResolvedFavorites(supabase: SupabaseClient, userId?: string | null): Promise<ResolvedFavorite[]> {
    // Previously we ran the enriched RPC and the manual fallback in parallel
    // on every call. The fallback fans out to ~7 lookup queries (clubs by id,
    // clubs by external_id, tournaments x2, external_teams, external_tournaments,
    // people) and was being executed even when the RPC succeeded — a huge
    // amount of unnecessary database work for one of the hottest hooks on the
    // app. Now we only resort to the fallback when both RPCs return nothing.
    const v2 = await tryFavoritesRpc(supabase, 'get_my_favorites_enriched_v2');
    if (v2 && v2.length > 0) {
        return sanitizeResolvedFavorites(v2, userId);
    }

    const v1 = await tryFavoritesRpc(supabase, 'get_my_favorites_enriched');
    if (v1 && v1.length > 0) {
        return sanitizeResolvedFavorites(v1, userId);
    }

    const fallback = await fetchFavoritesFallback(supabase);
    if (fallback.ok && fallback.items.length > 0) {
        return sanitizeResolvedFavorites(fallback.items, userId);
    }

    return [];
}
