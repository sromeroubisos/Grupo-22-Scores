import { NextRequest, NextResponse } from 'next/server';
import { memoryCache } from '@/lib/cache';
import { getReadClient } from '@/lib/supabase/read';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFlashScoreEnabledForSport, isRugbySport } from '@/lib/externalProviderPolicy';
import {
    getCountriesBySport,
    getTournamentsBySportAndEntity,
} from '@/lib/services/flashscore';
import {
    readTournamentsFeedSnapshotMetadata,
    readUsableTournamentsFeedSnapshot,
    upsertTournamentsFeedSnapshot,
    type TournamentsFeedType,
} from '@/lib/server/tournamentsFeedCache';
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

type PublicTournamentsPayload = {
    data: unknown;
};

type PublicTournamentsRequestParams = {
    sport: string | null;
    flashScoreSportKey: string;
    flashScoreCatalogEnabled: boolean;
    shouldAggregateRugby: boolean;
    scope: string | null;
    forceFullCatalog: boolean;
    search: string;
    audience: TournamentAudience;
    externalCountryId: string | null;
    countryName: string | null;
    countryFlag: string | null;
};

type TournamentsResponseCacheEntry = {
    payload: PublicTournamentsPayload;
    createdAt: number;
    freshTtlMs: number;
    staleTtlMs: number;
};

type TournamentsRequestMetrics = Record<string, number>;

type TournamentsTraceContext = {
    requestId: string;
    cacheKey: string;
    params: PublicTournamentsRequestParams;
    metrics: TournamentsRequestMetrics;
    backgroundRefresh?: boolean;
    refreshId?: string;
    parentRequestId?: string;
};

const TOURNAMENTS_RESPONSE_CACHE_PREFIX = 'public-tournaments-response:v3';
const tournamentsRefreshLocks = new Map<string, Promise<void>>();
const tournamentsInFlightResponses = new Map<string, Promise<PublicTournamentsPayload>>();
const tournamentsSnapshotPersistLocks = new Map<string, Promise<boolean>>();

function createTraceId(prefix: 'req' | 'refresh') {
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `${prefix}_${randomPart}`;
}

function trackDuration(metrics: TournamentsRequestMetrics, metricName: string, startedAt: number) {
    const durationMs = Date.now() - startedAt;
    metrics[metricName] = durationMs;
    return durationMs;
}

function addDurationMetric(metrics: TournamentsRequestMetrics, metricName: string, durationMs: number) {
    metrics[metricName] = (metrics[metricName] || 0) + durationMs;
    return metrics[metricName];
}

function buildTraceLogPayload(
    trace: TournamentsTraceContext,
    extra: Record<string, unknown> = {},
) {
    return {
        request_id: trace.requestId,
        refresh_id: trace.refreshId ?? null,
        parent_request_id: trace.parentRequestId ?? null,
        cache_key: trace.cacheKey,
        sport: trace.params.sport || 'all',
        scope: trace.params.scope || 'default',
        audience: trace.params.audience,
        search: trace.params.search,
        external_country_id: trace.params.externalCountryId,
        background_refresh: trace.backgroundRefresh === true,
        ...trace.metrics,
        ...extra,
    };
}

function logTournamentsEvent(
    level: 'info' | 'warn' | 'error',
    event: string,
    trace: TournamentsTraceContext,
    extra: Record<string, unknown> = {},
) {
    const payload = buildTraceLogPayload(trace, { event, ...extra });
    const line = `[public-tournaments] ${JSON.stringify(payload)}`;

    if (level === 'warn') {
        console.warn(line);
        return;
    }

    if (level === 'error') {
        console.error(line);
        return;
    }

    console.info(line);
}

function attachObservabilityHeaders(
    response: NextResponse,
    trace: TournamentsTraceContext,
    cacheStatus: string,
) {
    response.headers.set('X-G22-Cache', cacheStatus);
    response.headers.set('X-G22-Request-Id', trace.requestId);

    if (process.env.NODE_ENV !== 'production') {
        response.headers.set('X-G22-Cache-Key', trace.cacheKey);
        if (typeof trace.metrics.compute_payload_ms === 'number') {
            response.headers.set('X-G22-Compute-Ms', String(trace.metrics.compute_payload_ms));
        }
    }

    return response;
}

function finalizeRequestMetrics(trace: TournamentsTraceContext, requestStartedAt: number) {
    const totalMs = trackDuration(trace.metrics, 'response_time_ms', requestStartedAt);
    trace.metrics.total_request_ms = totalMs;
    return totalMs;
}

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

function sanitizePublicLogoUrl(value: unknown): string | null {
    const normalized = normalizeText(value);
    if (!normalized) return null;

    // Avoid serving giant inline base64 images in list/catalog feeds.
    if (normalized.startsWith('data:')) {
        return null;
    }

    return normalized;
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
            logo_url: sanitizePublicLogoUrl(tournament.logo_url),
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

function normalizePublicTournamentsRequest(request: Request): PublicTournamentsRequestParams {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport');
    const flashScoreSportKey = resolveFlashScoreSportKey(sport);
    const scope = searchParams.get('scope');
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    return {
        sport,
        flashScoreSportKey,
        flashScoreCatalogEnabled: Boolean(sport) && isFlashScoreEnabledForSport(flashScoreSportKey),
        shouldAggregateRugby: flashScoreSportKey === RUGBY_FLASHSCORE_SPORT_KEY,
        scope,
        forceFullCatalog: scope === 'full',
        search,
        audience: resolveAudienceFilter(searchParams.get('audience')),
        externalCountryId: searchParams.get('external_country_id')?.trim() || null,
        countryName: searchParams.get('country_name')?.trim() || null,
        countryFlag: searchParams.get('country_flag')?.trim() || null,
    };
}

function resolveCacheControl(params: PublicTournamentsRequestParams) {
    if (params.flashScoreCatalogEnabled && (params.scope === 'summary' || params.scope === 'country')) {
        return CATALOG_CACHE_CONTROL;
    }

    return FLAT_CACHE_CONTROL;
}

function buildPublicTournamentsResponse(payload: PublicTournamentsPayload, params: PublicTournamentsRequestParams) {
    return withCacheControl(payload, resolveCacheControl(params));
}

function buildPublicTournamentsCacheKey(params: PublicTournamentsRequestParams) {
    return [
        TOURNAMENTS_RESPONSE_CACHE_PREFIX,
        params.scope || 'default',
        params.sport || 'all',
        params.audience,
        params.search || 'all',
        params.externalCountryId || 'none',
        params.countryName ? slugifyCountryId(params.countryName) : 'none',
        params.countryFlag || 'none',
        params.forceFullCatalog ? 'full' : 'normal',
    ].join(':');
}

function getTournamentsFeedType(params: PublicTournamentsRequestParams): TournamentsFeedType {
    if (params.scope === 'summary') return 'summary';
    if (params.scope === 'country') return 'country';
    if (params.scope === 'db') return 'db';
    return 'list';
}

function getPublicTournamentsCachePolicy(params: PublicTournamentsRequestParams) {
    if (params.flashScoreCatalogEnabled && params.scope === 'summary') {
        return { freshTtlSec: 6 * 60 * 60, staleTtlSec: 7 * 24 * 60 * 60 };
    }

    if (params.flashScoreCatalogEnabled && params.scope === 'country') {
        return { freshTtlSec: 60 * 60, staleTtlSec: 24 * 60 * 60 };
    }

    if (params.search || params.forceFullCatalog) {
        return { freshTtlSec: 10 * 60, staleTtlSec: 60 * 60 };
    }

    return { freshTtlSec: 5 * 60, staleTtlSec: 30 * 60 };
}

function readTournamentsResponseCache(key: string) {
    const entry = memoryCache.get<TournamentsResponseCacheEntry>(key);
    if (!entry) return { state: 'miss' as const, entry: null };

    const ageMs = Date.now() - entry.createdAt;
    if (ageMs <= entry.freshTtlMs) {
        return { state: 'fresh' as const, entry };
    }
    if (ageMs <= entry.staleTtlMs) {
        return { state: 'stale' as const, entry };
    }

    memoryCache.delete(key);
    return { state: 'miss' as const, entry: null };
}

function writeTournamentsResponseCache(
    key: string,
    payload: PublicTournamentsPayload,
    params: PublicTournamentsRequestParams,
    createdAt: number = Date.now(),
) {
    const policy = getPublicTournamentsCachePolicy(params);
    const entry: TournamentsResponseCacheEntry = {
        payload,
        createdAt,
        freshTtlMs: policy.freshTtlSec * 1000,
        staleTtlMs: policy.staleTtlSec * 1000,
    };

    memoryCache.set(key, entry, Math.ceil(entry.staleTtlMs / 1000));
}

function getTournamentsFeedState(
    generatedAtIso: string,
    expiresAtIso: string,
    staleUntilIso?: string | null,
) {
    const generatedAtMs = new Date(generatedAtIso).getTime();
    const expiresAtMs = new Date(expiresAtIso).getTime();
    const staleUntilMs = staleUntilIso ? new Date(staleUntilIso).getTime() : Number.NaN;
    const nowMs = Date.now();

    if (Number.isNaN(generatedAtMs) || Number.isNaN(expiresAtMs)) {
        return { state: 'miss' as const, createdAt: Date.now() };
    }

    if (nowMs <= expiresAtMs) {
        return { state: 'fresh' as const, createdAt: generatedAtMs };
    }

    if (!Number.isNaN(staleUntilMs) && nowMs <= staleUntilMs) {
        return { state: 'stale' as const, createdAt: generatedAtMs };
    }

    return { state: 'miss' as const, createdAt: generatedAtMs };
}

async function persistTournamentsFeedSnapshot(
    key: string,
    params: PublicTournamentsRequestParams,
    payload: PublicTournamentsPayload,
    generatedAt: Date = new Date(),
    trace?: TournamentsTraceContext,
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return false;
    }

    const policy = getPublicTournamentsCachePolicy(params);
    const persistStartedAt = Date.now();

    try {
        const persisted = await upsertTournamentsFeedSnapshot(createAdminClient(), {
            cacheKey: key,
            feedType: getTournamentsFeedType(params),
            sport: params.sport,
            scope: params.scope,
            audience: params.audience,
            searchQuery: params.search,
            externalCountryId: params.externalCountryId,
            payload,
            sourceSummary: {
                flashscore_catalog_enabled: params.flashScoreCatalogEnabled,
                should_aggregate_rugby: params.shouldAggregateRugby,
            },
            generatedAt,
            freshTtlSeconds: policy.freshTtlSec,
            staleTtlSeconds: policy.staleTtlSec,
            lastRefreshStartedAt: generatedAt,
            lastRefreshCompletedAt: new Date(),
        });

        if (trace) {
            const durationMs = trackDuration(trace.metrics, 'snapshot_write_time_ms', persistStartedAt);
            if (durationMs > 400) {
                logTournamentsEvent('warn', 'tournaments_slow_snapshot_write', trace, {
                    threshold_ms: 400,
                    snapshot_persisted: persisted,
                });
            }
        }

        return persisted;
    } catch (error) {
        console.error('[public-tournaments] persisted snapshot failed:', error);
        if (trace) {
            trackDuration(trace.metrics, 'snapshot_write_time_ms', persistStartedAt);
        }
        return false;
    }
}

function queuePersistTournamentsFeedSnapshot(
    key: string,
    params: PublicTournamentsRequestParams,
    payload: PublicTournamentsPayload,
    generatedAt: Date = new Date(),
    trace?: TournamentsTraceContext,
) {
    const existing = tournamentsSnapshotPersistLocks.get(key);
    if (existing) return existing;

    const persistPromise = persistTournamentsFeedSnapshot(key, params, payload, generatedAt, trace)
        .finally(() => {
            tournamentsSnapshotPersistLocks.delete(key);
        });

    tournamentsSnapshotPersistLocks.set(key, persistPromise);
    return persistPromise;
}

function logSlowTournamentsComputeStageWarnings(trace: TournamentsTraceContext) {
    const warnings: Array<{ metric: string; threshold: number; event: string }> = [
        { metric: 'supabase_tournaments_read_ms', threshold: 400, event: 'tournaments_slow_supabase_read' },
        { metric: 'external_tournaments_fetch_ms', threshold: 1200, event: 'tournaments_slow_external_fetch' },
        { metric: 'merge_sources_ms', threshold: 250, event: 'tournaments_slow_merge_sources' },
    ];

    warnings.forEach(({ metric, threshold, event }) => {
        const value = trace.metrics[metric];
        if (typeof value === 'number' && value > threshold) {
            logTournamentsEvent('warn', event, trace, { threshold_ms: threshold, metric, value_ms: value });
        }
    });
}

async function computePublicTournamentsPayload(
    params: PublicTournamentsRequestParams,
    trace?: TournamentsTraceContext,
): Promise<PublicTournamentsPayload> {
    const computeStartedAt = Date.now();
    let dbItemsCount = 0;
    let externalItemsCount = 0;
    let finalItemsCount = 0;

    try {
        if (params.flashScoreCatalogEnabled && params.scope === 'summary') {
            const externalFetchStartedAt = Date.now();
            try {
                const countries = await queryFlashScoreCountrySummaries(params.flashScoreSportKey);
                externalItemsCount = countries.length;
                if (trace) {
                    trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                    trace.metrics.build_payload_ms = 0;
                    trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                    logSlowTournamentsComputeStageWarnings(trace);
                    logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                        db_items_count: dbItemsCount,
                        external_items_count: externalItemsCount,
                        final_items_count: externalItemsCount,
                    });
                }
                return { data: { countries } };
            } catch (error) {
                console.error('[GET /api/public/tournaments] catalog summary failed:', error);
                if (trace) {
                    trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                }
                return { data: { countries: [] } };
            }
        }

        if (params.flashScoreCatalogEnabled && params.scope === 'country') {
            const externalFetchStartedAt = Date.now();
            const tournaments = params.shouldAggregateRugby
                ? await queryRugbyCountryTournaments({
                    externalCountryId: params.externalCountryId || '',
                    countryName: params.countryName || '',
                    flag: params.countryFlag || null,
                    search: params.search,
                    audience: params.audience,
                })
                : await queryFlashScoreCountryTournaments({
                    sportKey: params.flashScoreSportKey,
                    externalCountryId: params.externalCountryId || '',
                    countryName: params.countryName || '',
                    flag: params.countryFlag || null,
                    search: params.search,
                    audience: params.audience,
                });

            externalItemsCount = tournaments.length;
            finalItemsCount = tournaments.length;
            if (trace) {
                trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                logSlowTournamentsComputeStageWarnings(trace);
                logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                    db_items_count: dbItemsCount,
                    external_items_count: externalItemsCount,
                    final_items_count: finalItemsCount,
                });
            }
            return { data: tournaments };
        }

        const supabase = await getReadClient();
        const supabaseReadStartedAt = Date.now();
        const queryResult = await queryVisiblePublicTournaments(supabase);
        if (trace) {
            trackDuration(trace.metrics, 'supabase_tournaments_read_ms', supabaseReadStartedAt);
        }
        const { data, error } = queryResult;

        const buildDbPayloadStartedAt = Date.now();
        const dbTournaments = !error
            ? filterPublicDbTournaments({
                tournaments: data || [],
                sportFilter: resolveSportFilter(params.sport),
                audience: params.audience,
                search: params.search,
            })
            : [];
        dbItemsCount = dbTournaments.length;
        if (trace) {
            addDurationMetric(trace.metrics, 'build_payload_ms', Date.now() - buildDbPayloadStartedAt);
        }

        if (params.scope === 'db') {
            if (error) {
                throw error;
            }

            finalItemsCount = dbTournaments.length;
            if (trace) {
                trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                logSlowTournamentsComputeStageWarnings(trace);
                logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                    db_items_count: dbItemsCount,
                    external_items_count: externalItemsCount,
                    final_items_count: finalItemsCount,
                });
            }
            return { data: dbTournaments };
        }

        const shouldLoadExternalCatalog =
            params.flashScoreCatalogEnabled &&
            (
                params.forceFullCatalog ||
                Boolean(params.search) ||
                !isRugbySport(params.flashScoreSportKey)
            );

        if (shouldLoadExternalCatalog) {
            const externalFetchStartedAt = Date.now();
            try {
                const flashScoreTournaments = params.shouldAggregateRugby
                    ? await queryPublicRugbyFlashScoreTournaments({ search: params.search, audience: params.audience })
                    : await queryPublicFlashScoreTournaments({
                        sportKey: params.flashScoreSportKey,
                        search: params.search,
                        audience: params.audience,
                    });
                externalItemsCount = flashScoreTournaments.length;
                if (trace) {
                    trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                }

                const mergeStartedAt = Date.now();
                const combinedTournaments = mergePublicTournamentLists(dbTournaments, flashScoreTournaments);
                finalItemsCount = combinedTournaments.length;
                if (trace) {
                    trackDuration(trace.metrics, 'merge_sources_ms', mergeStartedAt);
                    trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                    logSlowTournamentsComputeStageWarnings(trace);
                    logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                        db_items_count: dbItemsCount,
                        external_items_count: externalItemsCount,
                        final_items_count: finalItemsCount,
                    });
                }

                return { data: combinedTournaments };
            } catch (flashScoreError) {
                console.error('[GET /api/public/tournaments] flashscore catalog fallback:', flashScoreError);
                if (trace) {
                    trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                }

                if (!error) {
                    finalItemsCount = dbTournaments.length;
                    if (trace) {
                        trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                        logSlowTournamentsComputeStageWarnings(trace);
                        logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                            db_items_count: dbItemsCount,
                            external_items_count: externalItemsCount,
                            final_items_count: finalItemsCount,
                            fallback_path: 'db_only',
                        });
                    }
                    return { data: dbTournaments };
                }
            }
        }

        if (error) {
            throw error;
        }

        finalItemsCount = dbTournaments.length;
        if (trace) {
            trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
            logSlowTournamentsComputeStageWarnings(trace);
            logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                db_items_count: dbItemsCount,
                external_items_count: externalItemsCount,
                final_items_count: finalItemsCount,
            });
        }
        return { data: dbTournaments };
    } catch (error) {
        if (trace) {
            trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
            logTournamentsEvent('error', 'tournaments_compute_failed', trace, {
                error: String(error),
                db_items_count: dbItemsCount,
                external_items_count: externalItemsCount,
                final_items_count: finalItemsCount,
            });
        }
        throw error;
    }
}

async function refreshPublicTournamentsResponseCache(
    key: string,
    params: PublicTournamentsRequestParams,
    parentRequestId?: string,
) {
    const existing = tournamentsRefreshLocks.get(key);
    if (existing) return existing;

    const refreshPromise = (async () => {
        const startedAt = new Date();
        const trace: TournamentsTraceContext = {
            requestId: parentRequestId || createTraceId('req'),
            parentRequestId,
            refreshId: createTraceId('refresh'),
            cacheKey: key,
            params,
            metrics: {},
            backgroundRefresh: true,
        };

        logTournamentsEvent('info', 'tournaments_refresh_started', trace);
        try {
            const computeStartedAt = Date.now();
            const payload = await computePublicTournamentsPayload(params, trace);
            const computeDurationMs = trackDuration(trace.metrics, 'compute_payload_ms', computeStartedAt);
            writeTournamentsResponseCache(key, payload, params, startedAt.getTime());
            void queuePersistTournamentsFeedSnapshot(key, params, payload, startedAt, trace);
            if (computeDurationMs > 1500) {
                logTournamentsEvent('warn', 'tournaments_slow_compute', trace, { threshold_ms: 1500 });
            }
            trackDuration(trace.metrics, 'refresh_total_ms', startedAt.getTime());
            logTournamentsEvent('info', 'tournaments_refresh_succeeded', trace);
        } catch (error) {
            trackDuration(trace.metrics, 'refresh_total_ms', startedAt.getTime());
            logTournamentsEvent('error', 'tournaments_refresh_failed', trace, { error: String(error) });
        } finally {
            tournamentsRefreshLocks.delete(key);
        }
    })();

    tournamentsRefreshLocks.set(key, refreshPromise);
    return refreshPromise;
}

async function getOrComputePublicTournamentsPayload(
    key: string,
    params: PublicTournamentsRequestParams,
    trace: TournamentsTraceContext,
) {
    const existing = tournamentsInFlightResponses.get(key);
    if (existing) return existing;

    const promise = (async () => {
        const startedAt = new Date();
        try {
            const computeStartedAt = Date.now();
            const payload = await computePublicTournamentsPayload(params, trace);
            const computeDurationMs = trackDuration(trace.metrics, 'compute_payload_ms', computeStartedAt);
            writeTournamentsResponseCache(key, payload, params, startedAt.getTime());
            void queuePersistTournamentsFeedSnapshot(key, params, payload, startedAt, trace);
            if (computeDurationMs > 1500) {
                logTournamentsEvent('warn', 'tournaments_slow_compute', trace, { threshold_ms: 1500 });
            }
            return payload;
        } finally {
            tournamentsInFlightResponses.delete(key);
        }
    })();

    tournamentsInFlightResponses.set(key, promise);
    return promise;
}

export async function GET(request: NextRequest) {
    const requestStartedAt = Date.now();
    const params = normalizePublicTournamentsRequest(request);
    const cacheKey = buildPublicTournamentsCacheKey(params);
    const trace: TournamentsTraceContext = {
        requestId: createTraceId('req'),
        cacheKey,
        params,
        metrics: {},
    };

    if (
        params.flashScoreCatalogEnabled &&
        params.scope === 'country' &&
        (!params.externalCountryId || !params.countryName)
    ) {
        const response = NextResponse.json(
            { error: 'Faltan external_country_id o country_name.' },
            { status: 400 },
        );
        attachObservabilityHeaders(response, trace, 'BYPASS');
        return response;
    }

    const memoryLookupStartedAt = Date.now();
    const cacheState = readTournamentsResponseCache(cacheKey);
    trackDuration(trace.metrics, 'memory_cache_lookup_ms', memoryLookupStartedAt);

    if (cacheState.state === 'fresh' && cacheState.entry) {
        const serializeStartedAt = Date.now();
        const response = buildPublicTournamentsResponse(cacheState.entry.payload, params);
        trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
        finalizeRequestMetrics(trace, requestStartedAt);
        attachObservabilityHeaders(response, trace, 'HIT');
        logTournamentsEvent('info', 'tournaments_cache_hit', trace, { cache_status: 'HIT' });
        return response;
    }

    if (cacheState.state === 'stale' && cacheState.entry) {
        void refreshPublicTournamentsResponseCache(cacheKey, params, trace.requestId);
        const serializeStartedAt = Date.now();
        const response = buildPublicTournamentsResponse(cacheState.entry.payload, params);
        trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
        finalizeRequestMetrics(trace, requestStartedAt);
        attachObservabilityHeaders(response, trace, 'STALE');
        logTournamentsEvent('info', 'tournaments_cache_stale', trace, { cache_status: 'STALE' });
        return response;
    }

    try {
        const readClient = await getReadClient();
        const persistedLookupStartedAt = Date.now();
        const persistedSnapshot = await readUsableTournamentsFeedSnapshot<PublicTournamentsPayload>(
            readClient,
            cacheKey,
            new Date().toISOString(),
        );
        const persistedLookupMs = trackDuration(trace.metrics, 'persisted_cache_lookup_ms', persistedLookupStartedAt);
        if (persistedLookupMs > 300) {
            logTournamentsEvent('warn', 'tournaments_slow_persisted_lookup', trace, { threshold_ms: 300 });
        }

        if (persistedSnapshot) {
            const persistedState = getTournamentsFeedState(
                persistedSnapshot.generatedAt,
                persistedSnapshot.expiresAt,
                persistedSnapshot.staleUntil,
            );
            trace.metrics.persisted_payload_bytes = persistedSnapshot.payloadSizeBytes || 0;

            if (persistedState.state === 'fresh') {
                writeTournamentsResponseCache(cacheKey, persistedSnapshot.payload, params, persistedState.createdAt);
                const serializeStartedAt = Date.now();
                const response = buildPublicTournamentsResponse(persistedSnapshot.payload, params);
                trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
                finalizeRequestMetrics(trace, requestStartedAt);
                attachObservabilityHeaders(response, trace, 'PERSISTED-HIT');
                logTournamentsEvent('info', 'tournaments_cache_persisted_hit', trace, {
                    cache_status: 'PERSISTED-HIT',
                    persisted_snapshot_state: 'fresh',
                });
                return response;
            }

            if (persistedState.state === 'stale') {
                writeTournamentsResponseCache(cacheKey, persistedSnapshot.payload, params, persistedState.createdAt);
                void refreshPublicTournamentsResponseCache(cacheKey, params, trace.requestId);
                const serializeStartedAt = Date.now();
                const response = buildPublicTournamentsResponse(persistedSnapshot.payload, params);
                trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
                finalizeRequestMetrics(trace, requestStartedAt);
                attachObservabilityHeaders(response, trace, 'PERSISTED-STALE');
                logTournamentsEvent('info', 'tournaments_cache_persisted_stale', trace, {
                    cache_status: 'PERSISTED-STALE',
                    persisted_snapshot_state: 'stale',
                });
                return response;
            }
        }

        const persistedMetaStartedAt = Date.now();
        const persistedSnapshotMeta = await readTournamentsFeedSnapshotMetadata(readClient, cacheKey);
        if (persistedSnapshotMeta) {
            trackDuration(trace.metrics, 'persisted_metadata_recheck_ms', persistedMetaStartedAt);
            trace.metrics.persisted_payload_bytes = persistedSnapshotMeta.payloadSizeBytes || 0;
            logTournamentsEvent('info', 'tournaments_cache_persisted_expired', trace, {
                cache_status: 'EXPIRED',
                persisted_snapshot_state: 'expired',
            });
        }

        const payload = await getOrComputePublicTournamentsPayload(cacheKey, params, trace);
        const serializeStartedAt = Date.now();
        const response = buildPublicTournamentsResponse(payload, params);
        trackDuration(trace.metrics, 'serialize_response_ms', serializeStartedAt);
        finalizeRequestMetrics(trace, requestStartedAt);
        attachObservabilityHeaders(response, trace, 'MISS');
        logTournamentsEvent('info', 'tournaments_cache_miss', trace, { cache_status: 'MISS' });
        return response;
    } catch (error) {
        console.error('[GET /api/public/tournaments] unexpected error:', error);
        finalizeRequestMetrics(trace, requestStartedAt);
        logTournamentsEvent('error', 'tournaments_request_failed', trace, { error: String(error) });
        const response = NextResponse.json(
            { error: 'No se pudieron cargar los torneos.' },
            { status: 500 },
        );
        attachObservabilityHeaders(response, trace, 'ERROR');
        return response;
    }
}
