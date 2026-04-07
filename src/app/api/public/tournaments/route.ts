import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { isFlashScoreEnabledForSport, isRugbySport } from '@/lib/externalProviderPolicy';
import {
    getCountriesBySport,
    getTournamentsBySportAndEntity,
} from '@/lib/services/flashscore';
import {
    applyExternalTournamentOverride,
    getStoredExternalTournamentOverrides,
} from '@/lib/server/externalTournamentOverrides';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { sortTournamentsByPriority } from '@/lib/utils/tournamentOrdering';

const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];
const RUGBY_FLASHSCORE_SPORT_KEY = 'rugby';
const SELECT_WITH_LEGACY_SPORT_AND_PRIORITY = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, priority, category, age_grade';
const SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, priority, category, age_grade';
const SELECT_WITH_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, category, age_grade';
const SELECT_WITHOUT_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, category, age_grade';
const FLAT_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';
const CATALOG_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

type PublicTournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    country: string | null;
    country_id: string | null;
    country_ref: { name?: string } | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    logo_url: string | null;
    slug: string | null;
    is_visible: boolean | null;
    status: string | null;
    priority: number | null;
    category: string | null;
    age_grade: string | null;
};

type PublicTournamentQueryResult = {
    data: PublicTournamentRow[] | null;
    error: { code?: string | null; message?: string | null; details?: string | null } | null;
};

type FlashScoreCountryListItem = {
    country_id?: string | number | null;
    id?: string | number | null;
    name?: string | null;
    flag?: string | null;
    tournament_count?: number | null;
};

type FlashScoreTournamentListItem = {
    tournament_id?: string | number | null;
    id?: string | number | null;
    name?: string | null;
    image?: string | null;
    logo?: string | null;
    url?: string | null;
    link?: string | null;
    tournament_url?: string | null;
};

type FlashScoreTournamentEntity = {
    id: string;
    name: string;
    type: 'country';
    flag?: string | null;
};

type PublicExternalTournament = {
    id: string;
    name: string;
    display_name: string;
    country: string;
    country_id: string;
    sport_id: string;
    logo_url: string | null;
    slug: null;
    priority: number;
    type: 'international' | 'local';
    seasons: [];
    external_country_id?: string | null;
    url?: string | null;
};

type PublicRugbyCountrySummary = {
    id: string;
    external_country_id: string;
    name: string;
    flag?: string | null;
    tournament_count?: number | null;
    type: 'country';
};

function withCacheControl(payload: unknown, cacheControl: string) {
    return NextResponse.json(payload, { headers: { 'Cache-Control': cacheControl } });
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeIdentifier(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return normalizeText(value);
}

function normalizeLookupValue(value: unknown): string {
    return normalizeIdentifier(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function resolveFlashScoreSportKey(rawSport: string | null): string {
    const normalized = normalizeText(rawSport);
    return normalized || RUGBY_FLASHSCORE_SPORT_KEY;
}

function slugifyCountryId(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function resolveRugbyCountryId(countryName: string): string {
    const slug = slugifyCountryId(countryName);

    if (!slug || slug === 'world' || slug === 'worldwide' || slug === 'global' || slug === 'international') {
        return 'international';
    }

    return slug;
}

function extractListData<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];

    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        if (Array.isArray(record.data)) return record.data as T[];
        if (Array.isArray(record.DATA)) return record.DATA as T[];
    }

    return [];
}

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex++;
            if (currentIndex >= items.length) return;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, () => worker());
    await Promise.all(workers);
    return results;
}

function buildFlashScoreTournamentId(value: unknown): string | null {
    const normalized = normalizeIdentifier(value);
    if (!normalized) return null;

    return normalized.toLowerCase().startsWith('fs-') ? normalized : `fs-${normalized}`;
}

function buildFlashScoreTournamentIdFromUrl(value: unknown): string | null {
    const rawUrl = normalizeText(value);
    if (!rawUrl) return null;

    let pathname = rawUrl;
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        try {
            pathname = new URL(rawUrl).pathname;
        } catch {
            pathname = rawUrl;
        }
    }

    const slug = pathname
        .split('/')
        .filter(Boolean)
        .join('-');

    return slug ? `fs-${slugifyCountryId(slug)}` : null;
}

async function applyStoredTournamentOverrides(
    tournaments: PublicExternalTournament[],
): Promise<PublicExternalTournament[]> {
    if (tournaments.length === 0) return tournaments;

    const overrides = await getStoredExternalTournamentOverrides(
        tournaments.map((tournament) => tournament.id),
    );

    return tournaments.map((tournament) => {
        const override = overrides.get(tournament.id) || overrides.get(tournament.id.toLowerCase()) || null;
        return applyExternalTournamentOverride(tournament, override);
    });
}

function buildRugbyCountrySummaries(payload: unknown): PublicRugbyCountrySummary[] {
    const countries = extractListData<FlashScoreCountryListItem>(payload);
    const byCountryId = new Map<string, PublicRugbyCountrySummary>();

    for (const country of countries) {
        const externalCountryId = normalizeIdentifier(country.country_id ?? country.id);
        const countryName = normalizeText(country.name);

        if (!externalCountryId || !countryName) continue;
        if (byCountryId.has(externalCountryId)) continue;

        byCountryId.set(externalCountryId, {
            id: resolveRugbyCountryId(countryName),
            external_country_id: externalCountryId,
            name: countryName,
            flag: normalizeText(country.flag) || null,
            tournament_count: typeof country.tournament_count === 'number' ? country.tournament_count : null,
            type: 'country',
        });
    }

    return [...byCountryId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function mapFlashScoreTournamentToPublicTournament(
    tournament: FlashScoreTournamentListItem,
    entity: FlashScoreTournamentEntity,
    sportKey = RUGBY_FLASHSCORE_SPORT_KEY,
): PublicExternalTournament | null {
    const tournamentUrl = normalizeText(tournament.url || tournament.link || tournament.tournament_url) || null;
    const tournamentId =
        buildFlashScoreTournamentId(tournament.tournament_id ?? tournament.id) ||
        buildFlashScoreTournamentIdFromUrl(tournamentUrl);
    if (!tournamentId || isBlockedTournamentId(tournamentId)) {
        return null;
    }

    const countryName = normalizeText(entity.name) || 'Internacional';
    const countryId = resolveRugbyCountryId(countryName);
    const name = normalizeText(tournament.name) || tournamentId;

    return {
        id: tournamentId,
        name,
        display_name: name,
        country: countryName,
        country_id: countryId,
        sport_id: sportKey,
        logo_url: normalizeText(tournament.image || tournament.logo) || null,
        slug: null,
        priority: 0,
        type: countryId === 'international' ? 'international' : 'local',
        seasons: [],
        external_country_id: entity.id,
        url: tournamentUrl,
    };
}

async function queryRugbyCountrySummaries() {
    const payloads = await Promise.all([
        getCountriesBySport('rugby-union'),
        getCountriesBySport('rugby-league'),
    ]);

    const byCountryId = new Map<string, PublicRugbyCountrySummary>();
    for (const country of payloads.flatMap((payload) => buildRugbyCountrySummaries(payload))) {
        if (!byCountryId.has(country.external_country_id)) {
            byCountryId.set(country.external_country_id, country);
        }
    }

    return [...byCountryId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function queryFlashScoreCountrySummaries(sportKey: string) {
    const payload = await getCountriesBySport(sportKey);
    return buildRugbyCountrySummaries(payload);
}

async function queryRugbyCountryTournaments(args: {
    externalCountryId: string;
    countryName: string;
    flag?: string | null;
    search: string;
    audience: TournamentAudience;
}) {
    const entity: FlashScoreTournamentEntity = {
        id: args.externalCountryId,
        name: args.countryName,
        type: 'country',
        flag: args.flag || null,
    };

    const payloads = await Promise.all([
        getTournamentsBySportAndEntity('rugby-union', args.externalCountryId),
        getTournamentsBySportAndEntity('rugby-league', args.externalCountryId),
    ]);

    const mapped = payloads.flatMap((payload, index) => {
        const sportKey = index === 0 ? 'rugby-union' : 'rugby-league';
        return extractListData<FlashScoreTournamentListItem>(payload)
            .map((tournament) => mapFlashScoreTournamentToPublicTournament(tournament, entity, sportKey))
            .filter((tournament): tournament is PublicExternalTournament => tournament !== null);
    });

    const withOverrides = await applyStoredTournamentOverrides(mapped);

    return sortTournamentsByPriority(withOverrides.filter((tournament) => {
        if (resolveTournamentAudience({
            name: tournament.name,
            displayName: tournament.display_name,
        }) !== args.audience) {
            return false;
        }

        if (!args.search) return true;

        const name = tournament.name.toLowerCase();
        const displayName = tournament.display_name.toLowerCase();
        const country = tournament.country.toLowerCase();

        return name.includes(args.search) || displayName.includes(args.search) || country.includes(args.search);
    }));
}

async function queryFlashScoreCountryTournaments(args: {
    sportKey: string;
    externalCountryId: string;
    countryName: string;
    flag?: string | null;
    search: string;
    audience: TournamentAudience;
}) {
    const payload = await getTournamentsBySportAndEntity(args.sportKey, args.externalCountryId);
    const entity: FlashScoreTournamentEntity = {
        id: args.externalCountryId,
        name: args.countryName,
        type: 'country',
        flag: args.flag || null,
    };

    const mapped = extractListData<FlashScoreTournamentListItem>(payload)
        .map((tournament) => mapFlashScoreTournamentToPublicTournament(tournament, entity, args.sportKey))
        .filter((tournament): tournament is PublicExternalTournament => tournament !== null);

    const withOverrides = await applyStoredTournamentOverrides(mapped);

    return sortTournamentsByPriority(withOverrides.filter((tournament) => {
        if (resolveTournamentAudience({
            name: tournament.name,
            displayName: tournament.display_name,
        }) !== args.audience) {
            return false;
        }

        if (!args.search) return true;

        const name = tournament.name.toLowerCase();
        const displayName = tournament.display_name.toLowerCase();
        const country = tournament.country.toLowerCase();

        return name.includes(args.search) || displayName.includes(args.search) || country.includes(args.search);
    }));
}

async function queryPublicRugbyFlashScoreTournaments(args: {
    search: string;
    audience: TournamentAudience;
}) {
    const countries = await queryRugbyCountrySummaries();
    if (countries.length === 0) {
        throw new Error('FlashScore rugby catalog is unavailable.');
    }

    const grouped = await mapWithConcurrency(countries, 6, (country) =>
        queryRugbyCountryTournaments({
            externalCountryId: country.external_country_id,
            countryName: country.name,
            flag: country.flag,
            search: args.search,
            audience: args.audience,
        }),
    );

    const uniqueById = new Map<string, PublicExternalTournament>();
    for (const tournament of grouped.flat()) {
        if (!uniqueById.has(tournament.id)) {
            uniqueById.set(tournament.id, tournament);
        }
    }

    return sortTournamentsByPriority([...uniqueById.values()]);
}

async function queryPublicFlashScoreTournaments(args: {
    sportKey: string;
    search: string;
    audience: TournamentAudience;
}) {
    const countries = await queryFlashScoreCountrySummaries(args.sportKey);
    if (countries.length === 0) {
        throw new Error(`FlashScore catalog is unavailable for ${args.sportKey}.`);
    }

    const grouped = await mapWithConcurrency(countries, 6, (country) =>
        queryFlashScoreCountryTournaments({
            sportKey: args.sportKey,
            externalCountryId: country.external_country_id,
            countryName: country.name,
            flag: country.flag,
            search: args.search,
            audience: args.audience,
        }),
    );

    const uniqueById = new Map<string, PublicExternalTournament>();
    for (const tournament of grouped.flat()) {
        if (!uniqueById.has(tournament.id)) {
            uniqueById.set(tournament.id, tournament);
        }
    }

    return sortTournamentsByPriority([...uniqueById.values()]);
}

function filterPublicDbTournaments(args: {
    tournaments: PublicTournamentRow[];
    sportFilter: string[];
    audience: TournamentAudience;
    search: string;
}) {
    return sortTournamentsByPriority(args.tournaments
        .filter((tournament) => {
            const status = tournament.status?.toLowerCase?.() || null;
            if (status === 'archived' || status === 'deleted') return false;

            const normalizedSport = tournament.sport_id || tournament.legacy_sport || 'rugby';
            if (!args.sportFilter.includes(normalizedSport)) return false;

            if (resolveTournamentAudience({ ageGrade: tournament.age_grade, category: tournament.category }) !== args.audience) {
                return false;
            }

            if (!args.search) return true;

            const name = tournament.name?.toLowerCase?.() || '';
            const displayName = tournament.display_name?.toLowerCase?.() || '';
            const country = (tournament.country || tournament.country_ref?.name || '').toLowerCase();

            return name.includes(args.search) || displayName.includes(args.search) || country.includes(args.search);
        })
        .map((tournament) => ({
            id: tournament.id,
            name: tournament.name,
            display_name: tournament.display_name,
            country: tournament.country || (tournament.country_ref as { name?: string } | null)?.name || null,
            country_id: tournament.country_id,
            sport_id: tournament.sport_id || tournament.legacy_sport || 'rugby',
            logo_url: tournament.logo_url,
            slug: tournament.slug,
            priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
        })));
}

function buildTournamentMergeKey(tournament: {
    id?: string | null;
    name?: string | null;
    display_name?: string | null;
    country?: string | null;
    country_id?: string | null;
}) {
    const name = normalizeLookupValue(tournament.display_name || tournament.name);
    const country = normalizeLookupValue(tournament.country_id || tournament.country);

    if (!name) {
        return normalizeLookupValue(tournament.id);
    }

    return `${country}::${name}`;
}

function mergePublicTournamentLists<T extends {
    id?: string | null;
    name?: string | null;
    display_name?: string | null;
    country?: string | null;
    country_id?: string | null;
    priority?: number | null;
}>(primary: T[], secondary: T[]) {
    const merged = new Map<string, T>();

    for (const tournament of [...primary, ...secondary]) {
        const key = buildTournamentMergeKey(tournament);
        if (!key || merged.has(key)) continue;
        merged.set(key, tournament);
    }

    return sortTournamentsByPriority([...merged.values()]);
}

function resolveSportFilter(rawSport: string | null) {
    if (!rawSport || rawSport === 'rugby') {
        return RUGBY_SPORT_IDS;
    }

    return [rawSport];
}

function resolveAudienceFilter(rawAudience: string | null): TournamentAudience {
    return rawAudience === 'juveniles' ? 'juveniles' : 'mayores';
}

async function queryVisiblePublicTournaments(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
): Promise<PublicTournamentQueryResult> {
    const attempts: Array<{ select: string; usesLegacySport: boolean; usesPriority: boolean }> = [
        { select: SELECT_WITH_LEGACY_SPORT_AND_PRIORITY, usesLegacySport: true, usesPriority: true },
        { select: SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY, usesLegacySport: false, usesPriority: true },
        { select: SELECT_WITH_LEGACY_SPORT, usesLegacySport: true, usesPriority: false },
        { select: SELECT_WITHOUT_LEGACY_SPORT, usesLegacySport: false, usesPriority: false },
    ];

    for (const attempt of attempts) {
        let query = supabase
            .from('tournaments')
            .select(attempt.select)
            .neq('is_visible', false);

        if (attempt.usesPriority) {
            query = query.order('priority', { ascending: false, nullsFirst: false });
        }

        const result = await query
            .order('display_name', { ascending: true })
            .order('name', { ascending: true }) as unknown as PublicTournamentQueryResult;

        if (!result.error) {
            return result;
        }

        const missingSport = attempt.usesLegacySport && isMissingColumnError(result.error, 'sport');
        const missingPriority = attempt.usesPriority && isMissingColumnError(result.error, 'priority');

        if (missingSport || missingPriority) {
            continue;
        }

        return result;
    }

    return {
        data: null,
        error: { message: 'No compatible tournament query could be built for the current schema.' },
    };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sport = searchParams.get('sport');
        const flashScoreSportKey = resolveFlashScoreSportKey(sport);
        const flashScoreCatalogEnabled = Boolean(sport) && isFlashScoreEnabledForSport(flashScoreSportKey);
        const shouldAggregateRugby = flashScoreSportKey === RUGBY_FLASHSCORE_SPORT_KEY;
        const scope = searchParams.get('scope');
        const forceFullCatalog = scope === 'full';
        const search = searchParams.get('search')?.trim().toLowerCase() || '';
        const audience = resolveAudienceFilter(searchParams.get('audience'));

        if (flashScoreCatalogEnabled && scope === 'summary') {
            try {
                const countries = await queryFlashScoreCountrySummaries(flashScoreSportKey);
                return withCacheControl({ data: { countries } }, CATALOG_CACHE_CONTROL);
            } catch (error) {
                console.error('[GET /api/public/tournaments] catalog summary failed:', error);
                return withCacheControl({ data: { countries: [] } }, CATALOG_CACHE_CONTROL);
            }
        }

        if (flashScoreCatalogEnabled && scope === 'country') {
            const externalCountryId = searchParams.get('external_country_id')?.trim() || '';
            const countryName = searchParams.get('country_name')?.trim() || '';
            const countryFlag = searchParams.get('country_flag')?.trim() || '';

            if (!externalCountryId || !countryName) {
                return NextResponse.json(
                    { error: 'Faltan external_country_id o country_name.' },
                    { status: 400 },
                );
            }

            try {
                const tournaments = shouldAggregateRugby
                    ? await queryRugbyCountryTournaments({
                        externalCountryId,
                        countryName,
                        flag: countryFlag || null,
                        search,
                        audience,
                    })
                    : await queryFlashScoreCountryTournaments({
                        sportKey: flashScoreSportKey,
                        externalCountryId,
                        countryName,
                        flag: countryFlag || null,
                        search,
                        audience,
                    });
                return withCacheControl({ data: tournaments }, CATALOG_CACHE_CONTROL);
            } catch (error) {
                console.error('[GET /api/public/tournaments] catalog country failed:', error);
                return NextResponse.json(
                    { error: 'No se pudieron cargar las ligas de FlashScore.' },
                    { status: 500 },
                );
            }
        }

        const supabase = await getReadClient();
        const sportFilter = resolveSportFilter(sport);
        const queryResult = await queryVisiblePublicTournaments(supabase);
        const { data, error } = queryResult;

        const dbTournaments = !error
            ? filterPublicDbTournaments({
                tournaments: data || [],
                sportFilter,
                audience,
                search,
            })
            : [];

        if (scope === 'db') {
            if (error) {
                console.error('[GET /api/public/tournaments] query failed:', error);
                return NextResponse.json(
                    { error: 'No se pudieron cargar los torneos.' },
                    { status: 500 },
                );
            }

            return withCacheControl({ data: dbTournaments }, FLAT_CACHE_CONTROL);
        }

        if (flashScoreCatalogEnabled && (isRugbySport(flashScoreSportKey) || Boolean(search) || forceFullCatalog)) {
            try {
                const flashScoreTournaments = shouldAggregateRugby
                    ? await queryPublicRugbyFlashScoreTournaments({ search, audience })
                    : await queryPublicFlashScoreTournaments({ sportKey: flashScoreSportKey, search, audience });
                const combinedTournaments = mergePublicTournamentLists(dbTournaments, flashScoreTournaments);

                return withCacheControl({ data: combinedTournaments }, FLAT_CACHE_CONTROL);
            } catch (flashScoreError) {
                console.error('[GET /api/public/tournaments] flashscore catalog fallback:', flashScoreError);

                if (!error) {
                    return withCacheControl({ data: dbTournaments }, FLAT_CACHE_CONTROL);
                }
            }
        }

        if (error) {
            console.error('[GET /api/public/tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos.' },
                { status: 500 },
            );
        }

        return withCacheControl({ data: dbTournaments }, FLAT_CACHE_CONTROL);
    } catch (error) {
        console.error('[GET /api/public/tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos.' },
            { status: 500 },
        );
    }
}
