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
    readTournamentsFeedSnapshotPayload,
    readUsableTournamentsFeedSnapshot,
    upsertTournamentsFeedSnapshot,
    type TournamentsFeedType,
} from '@/lib/server/tournamentsFeedCache';
import { PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX } from '@/lib/server/cacheKeys';
import {
    applyExternalTournamentOverride,
    getStoredExternalTournamentOverrides,
} from '@/lib/server/externalTournamentOverrides';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { sortTournamentsByPriority } from '@/lib/utils/tournamentOrdering';
import { isTournamentVisibleToPublic } from '@/lib/tournamentReview';
import { ocultarGradosSubordinados } from '@/lib/tournamentNavigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];
const RUGBY_FLASHSCORE_SPORT_KEY = 'rugby';
const SELECT_WITH_LEGACY_SPORT_AND_PRIORITY = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, priority, category, age_grade, subcategory, season_id, gender';
const SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, priority, category, age_grade, subcategory, season_id, gender';
const SELECT_WITH_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, category, age_grade, subcategory, season_id, gender';
const SELECT_WITHOUT_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, category, age_grade, subcategory, season_id, gender';
const SELECT_WITH_LEGACY_SPORT_AND_PRIORITY_REVIEW = `${SELECT_WITH_LEGACY_SPORT_AND_PRIORITY}, review_status`;
const SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY_REVIEW = `${SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY}, review_status`;
const SELECT_WITH_LEGACY_SPORT_REVIEW = `${SELECT_WITH_LEGACY_SPORT}, review_status`;
const SELECT_WITHOUT_LEGACY_SPORT_REVIEW = `${SELECT_WITHOUT_LEGACY_SPORT}, review_status`;
const FLAT_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';
const CATALOG_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const PUBLIC_TOURNAMENTS_DB_QUERY_LIMIT = 3000;

// La lectura de `tournaments` es la MISMA para todos los scopes y para todos los
// paises: el recorte por deporte, audiencia y pais se hace despues, en memoria.
// Sin este cache, abrir cinco paises son cinco lecturas completas de la tabla.
const PUBLIC_TOURNAMENTS_ROWS_CACHE_KEY = `${PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX}:rows:visible`;
const PUBLIC_TOURNAMENTS_ROWS_TTL_SECONDS = 60;

// El catalogo externo cambia poco —una liga nueva por pais cada tanto— y cuesta
// 33 paises x 2 llamadas al proveedor. Con 10 minutos se rehacia ~144 veces por
// dia (unas 9.500 llamadas, casi la cuota entera); con 6 horas son 4.
const EXTERNAL_CATALOG_FRESH_TTL_SECONDS = 6 * 60 * 60;
const EXTERNAL_CATALOG_STALE_TTL_SECONDS = 24 * 60 * 60;

// Un payload degradado (el proveedor externo no contesto) no se guarda en el
// snapshot durable y vive poco en memoria, para reintentar pronto.
const DEGRADED_PAYLOAD_FRESH_TTL_SEC = 15;
const DEGRADED_PAYLOAD_STALE_TTL_SEC = 60;

type PublicTournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    country: string | null;
    country_id: string | null;
    country_ref: { name?: string } | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    logo_url?: string | null;
    slug: string | null;
    is_visible: boolean | null;
    status: string | null;
    review_status?: string | null;
    priority: number | null;
    category: string | null;
    age_grade: string | null;
    /** El grado. Decide si el torneo es reserva y si va al listado o al desplegable. */
    subcategory: string | null;
    /** Las tres, junto con category y age_grade, forman la división de un torneo. */
    season_id: string | null;
    gender: string | null;
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
    external_country_ids?: string[];
    name: string;
    flag?: string | null;
    tournament_count?: number | null;
    type: 'country';
};

type PublicTournamentsPayload = {
    data: unknown;
    // Presente solo cuando la fuente externa no respondio: lo que va en `data`
    // es lo que hay en base de datos, no el catalogo completo. La UI lo usa para
    // avisar en vez de mostrar un pais vacio como si no tuviera ligas.
    meta?: {
        externalUnavailable: true;
    };
};

type PublicDbTournamentListItem = {
    id: string;
    name: string | null;
    display_name: string | null;
    country: string | null;
    country_id: string | null;
    sport_id: string;
    logo_url: string | null;
    slug: string | null;
    priority: number;
};

type PublicTournamentCountryFilter = {
    externalCountryId: string | null;
    externalCountryIds?: string[];
    countryName: string | null;
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
    externalCountryIds: string[];
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

function uniqueNormalizedIdentifiers(values: unknown[]): string[] {
    const unique = new Set<string>();

    values.forEach((value) => {
        const normalized = normalizeIdentifier(value);
        if (normalized) unique.add(normalized);
    });

    return [...unique];
}

function parseRequestIdentifierList(values: string[]) {
    return uniqueNormalizedIdentifiers(
        values.flatMap((value) => value.split(',').map((part) => part.trim())),
    );
}

function normalizeLookupValue(value: unknown): string {
    return normalizeIdentifier(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function sanitizePublicLogoUrl(value: unknown, proxyKey?: string | null): string | null {
    const normalized = normalizeText(value);
    if (!normalized) return null;

    // Avoid serving giant inline base64 images in list/catalog feeds.
    if (normalized.startsWith('data:')) {
        return proxyKey ? `/api/assets/team-logo?key=${encodeURIComponent(proxyKey)}` : null;
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

// Ojo con el castellano: en base los torneos sin pais figuran como
// 'Internacional', y sin este alias quedaban en un pais propio, separado del
// 'World' del proveedor. Sintoma: dos acordeones "Internacional" en la pantalla.
const INTERNATIONAL_COUNTRY_SLUGS = new Set([
    'world',
    'worldwide',
    'global',
    'international',
    'internacional',
    'mundial',
    'mundo',
]);

function resolveRugbyCountryId(countryName: string): string {
    const slug = slugifyCountryId(countryName);

    if (!slug || INTERNATIONAL_COUNTRY_SLUGS.has(slug)) {
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
            external_country_ids: [externalCountryId],
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
    const requests = [
        getCountriesBySport('rugby-union'),
        getCountriesBySport('rugby-league'),
    ];
    const results = await Promise.allSettled(requests);
    const payloads = results
        .filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled')
        .map((result) => result.value);

    if (payloads.length === 0) {
        const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw firstError?.reason || new Error('FlashScore rugby countries are unavailable.');
    }

    return mergeRugbyCountrySummaries(
        payloads.flatMap((payload) => buildRugbyCountrySummaries(payload)),
        [],
    );
}

async function queryFlashScoreCountrySummaries(sportKey: string) {
    const payload = await getCountriesBySport(sportKey);
    return buildRugbyCountrySummaries(payload);
}

async function queryRugbyCountryTournaments(args: {
    externalCountryId: string;
    externalCountryIds?: string[];
    countryName: string;
    flag?: string | null;
    search: string;
    audience: TournamentAudience;
}) {
    const externalCountryIds = uniqueNormalizedIdentifiers([
        ...(args.externalCountryIds || []),
        args.externalCountryId,
    ]);

    if (externalCountryIds.length === 0) return [];

    const requests = externalCountryIds.flatMap((externalCountryId) => [
        {
            sportKey: 'rugby-union',
            externalCountryId,
            promise: getTournamentsBySportAndEntity('rugby-union', externalCountryId),
        },
        {
            sportKey: 'rugby-league',
            externalCountryId,
            promise: getTournamentsBySportAndEntity('rugby-league', externalCountryId),
        },
    ]);
    const results = await Promise.allSettled(requests.map((request) => request.promise));
    const fulfilledCount = results.filter((result) => result.status === 'fulfilled').length;

    // Si NO contesto ninguna, el pais no esta vacio: la fuente esta caida. Lanzar
    // es lo que permite distinguir "no hay ligas" de "no pudimos preguntar".
    if (fulfilledCount === 0) {
        const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw firstError?.reason || new Error('FlashScore rugby tournaments are unavailable.');
    }

    const mapped = results.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return [];
        const { sportKey, externalCountryId } = requests[index];
        const entity: FlashScoreTournamentEntity = {
            id: externalCountryId,
            name: args.countryName,
            type: 'country',
            flag: args.flag || null,
        };
        return extractListData<FlashScoreTournamentListItem>(result.value)
            .map((tournament) => mapFlashScoreTournamentToPublicTournament(tournament, entity, sportKey))
            .filter((tournament): tournament is PublicExternalTournament => tournament !== null);
    });

    const uniqueById = new Map<string, PublicExternalTournament>();
    for (const tournament of mapped) {
        if (!uniqueById.has(tournament.id)) {
            uniqueById.set(tournament.id, tournament);
        }
    }

    const withOverrides = await applyStoredTournamentOverrides([...uniqueById.values()]);

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

    // En el catalogo completo un pais caido no puede tumbar a los otros 32: acá
    // sí se absorbe el fallo. La honestidad va en el scope por pais, que es el
    // que la UI usa para decidir si avisa.
    const grouped = await mapWithConcurrency(countries, 6, (country) =>
        queryRugbyCountryTournaments({
            externalCountryId: country.external_country_id,
            externalCountryIds: country.external_country_ids,
            countryName: country.name,
            flag: country.flag,
            search: args.search,
            audience: args.audience,
        }).catch(() => [] as PublicExternalTournament[]),
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

    // Mismo criterio que en rugby: un pais caido no invalida el catalogo entero.
    const grouped = await mapWithConcurrency(countries, 6, (country) =>
        queryFlashScoreCountryTournaments({
            sportKey: args.sportKey,
            externalCountryId: country.external_country_id,
            countryName: country.name,
            flag: country.flag,
            search: args.search,
            audience: args.audience,
        }).catch(() => [] as PublicExternalTournament[]),
    );

    const uniqueById = new Map<string, PublicExternalTournament>();
    for (const tournament of grouped.flat()) {
        if (!uniqueById.has(tournament.id)) {
            uniqueById.set(tournament.id, tournament);
        }
    }

    return sortTournamentsByPriority([...uniqueById.values()]);
}

function matchesExternalTournamentSearch(tournament: PublicExternalTournament, search: string) {
    if (!search) return true;

    return tournament.name.toLowerCase().includes(search)
        || tournament.display_name.toLowerCase().includes(search)
        || tournament.country.toLowerCase().includes(search);
}

const externalCatalogInFlight = new Map<string, Promise<PublicExternalTournament[]>>();

type ExternalCatalogArgs = {
    sportKey: string;
    shouldAggregateRugby: boolean;
    audience: TournamentAudience;
};

function buildExternalCatalogCacheKey(args: ExternalCatalogArgs) {
    return [
        PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX,
        'catalog',
        buildCacheKeyPart(args.sportKey),
        buildCacheKeyPart(args.audience),
    ].join(':');
}

async function computeExternalTournamentCatalog(args: ExternalCatalogArgs) {
    return args.shouldAggregateRugby
        ? queryPublicRugbyFlashScoreTournaments({ search: '', audience: args.audience })
        : queryPublicFlashScoreTournaments({
            sportKey: args.sportKey,
            search: '',
            audience: args.audience,
        });
}

async function persistExternalTournamentCatalog(
    cacheKey: string,
    args: ExternalCatalogArgs,
    catalog: PublicExternalTournament[],
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

    try {
        await upsertTournamentsFeedSnapshot(createAdminClient(), {
            cacheKey,
            feedType: 'catalog',
            sport: args.sportKey,
            scope: 'catalog',
            audience: args.audience,
            payload: { data: catalog },
            generatedAt: new Date(),
            freshTtlSeconds: EXTERNAL_CATALOG_FRESH_TTL_SECONDS,
            staleTtlSeconds: EXTERNAL_CATALOG_STALE_TTL_SECONDS,
        });
    } catch (error) {
        console.error('[public-tournaments] catalog snapshot persist failed:', error);
    }
}

function refreshExternalTournamentCatalog(cacheKey: string, args: ExternalCatalogArgs) {
    if (externalCatalogInFlight.has(cacheKey)) return;

    const promise = (async () => {
        try {
            const catalog = await computeExternalTournamentCatalog(args);
            memoryCache.set(cacheKey, catalog, EXTERNAL_CATALOG_FRESH_TTL_SECONDS);
            await persistExternalTournamentCatalog(cacheKey, args, catalog);
            return catalog;
        } finally {
            externalCatalogInFlight.delete(cacheKey);
        }
    })();

    externalCatalogInFlight.set(cacheKey, promise);
    void promise.catch(() => { /* el fallo ya se registra donde importa */ });
}

// El catalogo externo completo, sin filtrar, por deporte y audiencia. Vive en
// tres niveles: memoria del proceso, snapshot durable en Supabase (compartido
// entre instancias y sobrevive a los reinicios) y, ultimo recurso, el barrido de
// 33 paises x 2 llamadas al proveedor.
//
// Con `allowStale` el pedido nunca espera el barrido: devuelve lo que hay —o
// nada— y refresca de fondo. Es lo que usan los contadores por pais, que no
// justifican 12 s de espera.
async function getExternalTournamentCatalog(
    args: ExternalCatalogArgs,
    options: { allowStale?: boolean } = {},
): Promise<PublicExternalTournament[] | null> {
    const cacheKey = buildExternalCatalogCacheKey(args);

    const cached = memoryCache.get<PublicExternalTournament[]>(cacheKey);
    if (cached) return cached;

    const inFlight = externalCatalogInFlight.get(cacheKey);
    if (inFlight && !options.allowStale) return inFlight;

    try {
        const snapshot = await readTournamentsFeedSnapshotPayload<{ data: PublicExternalTournament[] }>(
            await getReadClient(),
            cacheKey,
        );

        if (snapshot && Array.isArray(snapshot.payload?.data)) {
            const state = getTournamentsFeedState(
                snapshot.generatedAt,
                snapshot.expiresAt,
                snapshot.staleUntil,
            );

            if (state.state === 'fresh') {
                memoryCache.set(cacheKey, snapshot.payload.data, EXTERNAL_CATALOG_FRESH_TTL_SECONDS);
                return snapshot.payload.data;
            }

            if (state.state === 'stale') {
                // Sirve lo viejo ya y renueva atras: nadie espera el barrido.
                refreshExternalTournamentCatalog(cacheKey, args);
                return snapshot.payload.data;
            }
        }
    } catch (error) {
        console.error('[public-tournaments] catalog snapshot read failed:', error);
    }

    if (options.allowStale) {
        refreshExternalTournamentCatalog(cacheKey, args);
        return null;
    }

    const existing = externalCatalogInFlight.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const catalog = await computeExternalTournamentCatalog(args);
            memoryCache.set(cacheKey, catalog, EXTERNAL_CATALOG_FRESH_TTL_SECONDS);
            void persistExternalTournamentCatalog(cacheKey, args, catalog);
            return catalog;
        } finally {
            externalCatalogInFlight.delete(cacheKey);
        }
    })();

    externalCatalogInFlight.set(cacheKey, promise);
    return promise;
}

function filterPublicDbTournaments(args: {
    tournaments: PublicTournamentRow[];
    sportFilter: string[];
    audience: TournamentAudience | 'all';
    search: string;
    countryFilter?: PublicTournamentCountryFilter | null;
}): PublicDbTournamentListItem[] {
    const countryFilterValues = buildCountryFilterLookupValues(args.countryFilter);

    // Intermedia y Preintermedia son GRADOS de una división de mayores, no
    // competencias sueltas: se llegan desde el desplegable del torneo. Sin esto,
    // el Top 14 ocupa ocho entradas de la portada.
    //
    // Se sacan de la vista general y de la de mayores, PERO NO de la de
    // juveniles/reserva, que es adonde pertenecen (`resolveTournamentAudience`
    // los manda ahí). Si se filtraran también en esa vista no habría dónde verlos.
    //
    // Se aplica sobre las filas ya visibles para que la condición "su Superior
    // está en la lista" mire el mismo conjunto que se va a mostrar.
    const visibles = args.tournaments.filter((tournament) => isTournamentVisibleToPublic(tournament));
    const base = args.audience === 'juveniles' ? visibles : ocultarGradosSubordinados(visibles);

    return sortTournamentsByPriority(base
        .filter((tournament) => {

            const normalizedSport = tournament.sport_id || tournament.legacy_sport || 'rugby';
            if (!args.sportFilter.includes(normalizedSport)) return false;

            if (countryFilterValues && !tournamentMatchesCountryFilter(tournament, countryFilterValues)) {
                return false;
            }

            if (
                args.audience !== 'all' &&
                resolveTournamentAudience({
                    ageGrade: tournament.age_grade,
                    category: tournament.category,
                    // La reserva (Intermedia / Preintermedia) va con juveniles.
                    subcategory: tournament.subcategory,
                }) !== args.audience
            ) {
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
            logo_url: sanitizePublicLogoUrl(tournament.logo_url, tournament.id),
            slug: tournament.slug,
            priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
        })));
}

function addCountryLookupValue(values: Set<string>, value: unknown) {
    const normalized = normalizeLookupValue(value);
    if (normalized) values.add(normalized);

    const text = normalizeText(value);
    if (!text) return;

    const slug = slugifyCountryId(text);
    if (slug) values.add(normalizeLookupValue(slug));

    const rugbyCountryId = resolveRugbyCountryId(text);
    if (rugbyCountryId) values.add(normalizeLookupValue(rugbyCountryId));
}

function buildCountryFilterLookupValues(countryFilter?: PublicTournamentCountryFilter | null) {
    if (
        !countryFilter?.externalCountryId &&
        !countryFilter?.countryName &&
        (!countryFilter?.externalCountryIds || countryFilter.externalCountryIds.length === 0)
    ) {
        return null;
    }

    const values = new Set<string>();
    addCountryLookupValue(values, countryFilter.externalCountryId);
    (countryFilter.externalCountryIds || []).forEach((externalCountryId) => {
        addCountryLookupValue(values, externalCountryId);
    });
    addCountryLookupValue(values, countryFilter.countryName);
    return values.size > 0 ? values : null;
}

function tournamentMatchesCountryFilter(tournament: PublicTournamentRow, countryFilterValues: Set<string>) {
    const values = new Set<string>();
    addCountryLookupValue(values, tournament.country_id);
    addCountryLookupValue(values, tournament.country);
    addCountryLookupValue(values, tournament.country_ref?.name);

    for (const value of values) {
        if (countryFilterValues.has(value)) return true;
    }

    return false;
}

function tournamentMatchesCountryKeys(
    tournament: { country?: string | null; country_id?: string | null },
    countryKeys: Set<string>,
) {
    const values = new Set<string>();
    addCountryLookupValue(values, tournament.country_id);
    addCountryLookupValue(values, tournament.country);

    for (const value of values) {
        if (countryKeys.has(value)) return true;
    }

    return false;
}

// Cuenta por pais SIN salir a la red: cruza lo de base con el catalogo externo ya
// cacheado, con la MISMA funcion de merge y el MISMO criterio de coincidencia que
// usa el scope por pais. Por eso el numero del encabezado coincide con la lista
// que se abre debajo.
//
// Coincidir por nombre no alcanza: en base, Estados Unidos figura como
// country='Estados Unidos' con country_id='usa', y el resumen lo llama 'USA'.
// Hay que mirar el conjunto de valores, no uno solo.
function buildCountryTournamentCounts(
    countries: PublicRugbyCountrySummary[],
    dbTournaments: PublicDbTournamentListItem[],
    externalCatalog: PublicExternalTournament[],
) {
    const counts = new Map<string, number>();

    countries.forEach((country) => {
        const countryKeys = new Set<string>();
        addCountryLookupValue(countryKeys, country.id);
        addCountryLookupValue(countryKeys, country.name);

        const db = dbTournaments.filter((tournament) => tournamentMatchesCountryKeys(tournament, countryKeys));
        const external = externalCatalog.filter((tournament) => tournamentMatchesCountryKeys(tournament, countryKeys));

        counts.set(country.id, mergePublicTournamentLists(db, external).length);
    });

    return counts;
}

function buildDbCountrySummaries(tournaments: PublicDbTournamentListItem[]) {
    const summaries = new Map<string, PublicRugbyCountrySummary>();

    for (const tournament of tournaments) {
        const rawCountryName = normalizeText(tournament.country);
        const rawCountryId = normalizeText(tournament.country_id);
        const countryName = rawCountryName || (rawCountryId === 'international' ? 'Internacional' : rawCountryId);
        if (!countryName) continue;

        const countryId = rawCountryId || resolveRugbyCountryId(countryName);
        const key = slugifyCountryId(countryName) || normalizeLookupValue(countryId);
        if (!key) continue;

        const existing = summaries.get(key);
        if (existing) {
            existing.tournament_count = (existing.tournament_count || 0) + 1;
            continue;
        }

        summaries.set(key, {
            id: resolveRugbyCountryId(countryName),
            external_country_id: countryId || key,
            name: countryName,
            flag: null,
            tournament_count: 1,
            type: 'country',
        });
    }

    return [...summaries.values()].sort((left, right) => left.name.localeCompare(right.name));
}

// Se agrupa por el id YA resuelto, no por el nombre: es lo unico que hace que
// "World" del proveedor e "Internacional" de base sean el mismo pais.
function buildCountrySummaryMergeKey(summary: PublicRugbyCountrySummary) {
    return normalizeLookupValue(summary.id)
        || slugifyCountryId(summary.name)
        || normalizeLookupValue(summary.external_country_id);
}

function collectSummaryExternalCountryIds(...summaries: PublicRugbyCountrySummary[]) {
    const ids = new Set<string>();

    summaries.forEach((summary) => {
        const localIds = new Set([
            normalizeLookupValue(summary.id),
            normalizeLookupValue(slugifyCountryId(summary.name)),
            'international',
        ]);
        const fallbackCountryId = normalizeIdentifier(summary.external_country_id);
        const sourceIds = summary.external_country_ids?.length
            ? summary.external_country_ids
            : /^\d+$/.test(fallbackCountryId)
                ? [fallbackCountryId]
                : [];

        sourceIds.forEach((value) => {
            const normalized = normalizeIdentifier(value);
            if (!normalized || localIds.has(normalizeLookupValue(normalized))) return;
            ids.add(normalized);
        });
    });

    return [...ids];
}

function mergeRugbyCountrySummaries(
    primary: PublicRugbyCountrySummary[],
    secondary: PublicRugbyCountrySummary[],
) {
    const merged = new Map<string, PublicRugbyCountrySummary>();

    for (const summary of [...primary, ...secondary]) {
        const key = buildCountrySummaryMergeKey(summary);
        if (!key) continue;

        const existing = merged.get(key);
        if (!existing) {
            const externalCountryIds = collectSummaryExternalCountryIds(summary);
            merged.set(key, {
                ...summary,
                external_country_ids: externalCountryIds.length > 0 ? externalCountryIds : summary.external_country_ids,
            });
            continue;
        }

        const externalCountryIds = collectSummaryExternalCountryIds(existing, summary);
        merged.set(key, {
            ...existing,
            external_country_id: externalCountryIds[0] || existing.external_country_id || summary.external_country_id,
            external_country_ids: externalCountryIds.length > 0 ? externalCountryIds : existing.external_country_ids,
            flag: existing.flag || summary.flag || null,
            tournament_count:
                typeof existing.tournament_count === 'number' || typeof summary.tournament_count === 'number'
                    ? (existing.tournament_count || 0) + (summary.tournament_count || 0)
                    : null,
        });
    }

    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
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
        { select: SELECT_WITH_LEGACY_SPORT_AND_PRIORITY_REVIEW, usesLegacySport: true, usesPriority: true },
        { select: SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY_REVIEW, usesLegacySport: false, usesPriority: true },
        { select: SELECT_WITH_LEGACY_SPORT_REVIEW, usesLegacySport: true, usesPriority: false },
        { select: SELECT_WITHOUT_LEGACY_SPORT_REVIEW, usesLegacySport: false, usesPriority: false },
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
            .order('name', { ascending: true })
            .limit(PUBLIC_TOURNAMENTS_DB_QUERY_LIMIT) as unknown as PublicTournamentQueryResult;

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

let visiblePublicTournamentRowsInFlight: Promise<PublicTournamentQueryResult> | null = null;

// Comparte una sola lectura de la tabla entre todos los pedidos en vuelo y la
// deja cacheada un minuto. La clave usa el prefijo de respuestas publicas, asi
// que la invalidacion existente (`deleteByPrefix`) tambien la limpia.
async function readVisiblePublicTournamentRows(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
): Promise<{ result: PublicTournamentQueryResult; cached: boolean }> {
    const cachedRows = memoryCache.get<PublicTournamentRow[]>(PUBLIC_TOURNAMENTS_ROWS_CACHE_KEY);
    if (cachedRows) {
        return { result: { data: cachedRows, error: null }, cached: true };
    }

    if (visiblePublicTournamentRowsInFlight) {
        return { result: await visiblePublicTournamentRowsInFlight, cached: true };
    }

    visiblePublicTournamentRowsInFlight = (async () => {
        try {
            const result = await queryVisiblePublicTournaments(supabase);
            if (!result.error && result.data) {
                memoryCache.set(PUBLIC_TOURNAMENTS_ROWS_CACHE_KEY, result.data, PUBLIC_TOURNAMENTS_ROWS_TTL_SECONDS);
            }
            return result;
        } finally {
            visiblePublicTournamentRowsInFlight = null;
        }
    })();

    return { result: await visiblePublicTournamentRowsInFlight, cached: false };
}

async function queryPublicDbTournamentsForRequest(
    params: PublicTournamentsRequestParams,
    trace: TournamentsTraceContext | undefined,
    options: {
        audience?: TournamentAudience | 'all';
        countryFilter?: PublicTournamentCountryFilter | null;
    } = {},
) {
    const supabase = await getReadClient();
    const supabaseReadStartedAt = Date.now();
    const { result: queryResult, cached: rowsFromCache } = await readVisiblePublicTournamentRows(supabase);
    if (trace) {
        trackDuration(trace.metrics, 'supabase_tournaments_read_ms', supabaseReadStartedAt);
        trace.metrics.supabase_tournaments_rows_cached = rowsFromCache ? 1 : 0;
        if ((queryResult.data?.length || 0) >= PUBLIC_TOURNAMENTS_DB_QUERY_LIMIT) {
            logTournamentsEvent('warn', 'tournaments_db_row_cap_reached', trace, {
                row_cap: PUBLIC_TOURNAMENTS_DB_QUERY_LIMIT,
            });
        }
    }

    const buildDbPayloadStartedAt = Date.now();
    const dbTournaments = !queryResult.error
        ? filterPublicDbTournaments({
            tournaments: queryResult.data || [],
            sportFilter: resolveSportFilter(params.sport),
            audience: options.audience ?? params.audience,
            search: params.search,
            countryFilter: options.countryFilter ?? null,
        })
        : [];
    if (trace) {
        addDurationMetric(trace.metrics, 'build_payload_ms', Date.now() - buildDbPayloadStartedAt);
    }

    return {
        dbTournaments,
        error: queryResult.error,
    };
}

function normalizePublicTournamentsRequest(request: Request): PublicTournamentsRequestParams {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport');
    const flashScoreSportKey = resolveFlashScoreSportKey(sport);
    const scope = searchParams.get('scope');
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const explicitExternalCountryId = searchParams.get('external_country_id')?.trim() || null;
    const externalCountryIds = uniqueNormalizedIdentifiers([
        explicitExternalCountryId,
        ...parseRequestIdentifierList(searchParams.getAll('external_country_ids')),
    ]);

    return {
        sport,
        flashScoreSportKey,
        flashScoreCatalogEnabled: Boolean(sport) && isFlashScoreEnabledForSport(flashScoreSportKey),
        shouldAggregateRugby: flashScoreSportKey === RUGBY_FLASHSCORE_SPORT_KEY,
        scope,
        forceFullCatalog: scope === 'full',
        search,
        audience: resolveAudienceFilter(searchParams.get('audience')),
        externalCountryId: explicitExternalCountryId || externalCountryIds[0] || null,
        externalCountryIds,
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

function buildCacheKeyPart(value: string | null | undefined, fallback = 'none') {
    return value ? encodeURIComponent(value) : fallback;
}

function buildPublicTournamentsCacheKey(params: PublicTournamentsRequestParams) {
    return [
        PUBLIC_TOURNAMENTS_RESPONSE_CACHE_PREFIX,
        buildCacheKeyPart(params.scope, 'default'),
        buildCacheKeyPart(params.sport, 'all'),
        buildCacheKeyPart(params.audience),
        buildCacheKeyPart(params.search, 'all'),
        buildCacheKeyPart(params.externalCountryId),
        buildCacheKeyPart(params.externalCountryIds.length > 0 ? params.externalCountryIds.join(',') : null),
        buildCacheKeyPart(params.countryName ? slugifyCountryId(params.countryName) : null),
        buildCacheKeyPart(params.countryFlag),
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
        return { freshTtlSec: 60, staleTtlSec: 5 * 60 };
    }

    if (params.flashScoreCatalogEnabled && params.scope === 'country') {
        return { freshTtlSec: 60, staleTtlSec: 5 * 60 };
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

function isDegradedPayload(payload: PublicTournamentsPayload) {
    return payload.meta?.externalUnavailable === true;
}

function writeTournamentsResponseCache(
    key: string,
    payload: PublicTournamentsPayload,
    params: PublicTournamentsRequestParams,
    createdAt: number = Date.now(),
) {
    const policy = isDegradedPayload(payload)
        ? { freshTtlSec: DEGRADED_PAYLOAD_FRESH_TTL_SEC, staleTtlSec: DEGRADED_PAYLOAD_STALE_TTL_SEC }
        : getPublicTournamentsCachePolicy(params);
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

    // Un payload sin la fuente externa no merece la ventana larga del snapshot
    // durable: se serviria degradado durante horas.
    if (isDegradedPayload(payload)) {
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
            const { dbTournaments, error } = await queryPublicDbTournamentsForRequest(params, trace, {
                audience: 'all',
            });
            dbItemsCount = dbTournaments.length;
            const dbCountries = error ? [] : buildDbCountrySummaries(dbTournaments);
            let countries = dbCountries;
            let externalUnavailable = false;
            const externalFetchStartedAt = Date.now();
            try {
                const externalCountries = params.shouldAggregateRugby
                    ? await queryRugbyCountrySummaries()
                    : await queryFlashScoreCountrySummaries(params.flashScoreSportKey);
                externalItemsCount = externalCountries.length;
                if (trace) {
                    trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                }

                const mergeStartedAt = Date.now();
                countries = mergeRugbyCountrySummaries(externalCountries, dbCountries);
                if (trace) {
                    trackDuration(trace.metrics, 'merge_sources_ms', mergeStartedAt);
                }
            } catch (error) {
                console.error('[GET /api/public/tournaments] catalog summary failed:', error);
                externalUnavailable = true;
                if (trace) {
                    trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
                }
            }

            // Contadores exactos por pais, solo si el catalogo ya esta cacheado.
            // Si no lo esta, se dispara el barrido de fondo y esta respuesta sale
            // sin numeros: nadie espera 12 s por un contador.
            const catalog = await getExternalTournamentCatalog({
                sportKey: params.flashScoreSportKey,
                shouldAggregateRugby: params.shouldAggregateRugby,
                audience: params.audience,
            }, { allowStale: true });

            if (catalog) {
                const { dbTournaments: audienceDbTournaments } = await queryPublicDbTournamentsForRequest(params, trace, {
                    audience: params.audience,
                });
                const counts = buildCountryTournamentCounts(countries, audienceDbTournaments, catalog);

                countries = countries.map((country) => ({
                    ...country,
                    tournament_count: counts.get(country.id) ?? 0,
                }));
            } else {
                // Sin catalogo no hay numero honesto que dar.
                countries = countries.map((country) => ({ ...country, tournament_count: null }));
            }

            finalItemsCount = countries.length;
            if (trace) {
                trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                logSlowTournamentsComputeStageWarnings(trace);
                logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                    db_items_count: dbItemsCount,
                    external_items_count: externalItemsCount,
                    final_items_count: finalItemsCount,
                    fallback_path: externalItemsCount === 0 && dbCountries.length > 0 ? 'db_country_summary' : undefined,
                    external_unavailable: externalUnavailable,
                    catalog_counts: catalog ? 'ready' : 'warming',
                });
            }
            return externalUnavailable
                ? { data: { countries }, meta: { externalUnavailable: true } }
                : { data: { countries } };
        }

        if (params.flashScoreCatalogEnabled && params.scope === 'country') {
            const countryFilter = {
                externalCountryId: params.externalCountryId,
                externalCountryIds: params.externalCountryIds,
                countryName: params.countryName,
            };
            const { dbTournaments, error } = await queryPublicDbTournamentsForRequest(params, trace, {
                countryFilter,
            });
            dbItemsCount = dbTournaments.length;
            let externalTournaments: PublicExternalTournament[] = [];
            let externalUnavailable = false;
            const externalFetchStartedAt = Date.now();
            try {
                externalTournaments = params.shouldAggregateRugby
                    ? await queryRugbyCountryTournaments({
                        externalCountryId: params.externalCountryId || '',
                        externalCountryIds: params.externalCountryIds,
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
                externalItemsCount = externalTournaments.length;
            } catch (externalError) {
                console.error('[GET /api/public/tournaments] catalog country failed, using DB fallback:', externalError);
                externalUnavailable = true;
            }

            if (trace) {
                trackDuration(trace.metrics, 'external_tournaments_fetch_ms', externalFetchStartedAt);
            }

            const mergeStartedAt = Date.now();
            const tournaments = mergePublicTournamentLists(dbTournaments, externalTournaments);
            finalItemsCount = tournaments.length;
            if (trace) {
                trackDuration(trace.metrics, 'merge_sources_ms', mergeStartedAt);
                trace.metrics.compute_total_ms = Date.now() - computeStartedAt;
                logSlowTournamentsComputeStageWarnings(trace);
                logTournamentsEvent('info', 'tournaments_compute_summary', trace, {
                    db_items_count: dbItemsCount,
                    external_items_count: externalItemsCount,
                    final_items_count: finalItemsCount,
                    fallback_path: externalItemsCount === 0 && dbItemsCount > 0 ? 'db_country' : undefined,
                    external_unavailable: externalUnavailable,
                });
            }

            if (error && finalItemsCount === 0) {
                throw error;
            }

            return externalUnavailable
                ? { data: tournaments, meta: { externalUnavailable: true } }
                : { data: tournaments };
        }

        const { dbTournaments, error } = await queryPublicDbTournamentsForRequest(params, trace);
        dbItemsCount = dbTournaments.length;

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
                // El catalogo se pide sin termino y se filtra aca: asi la segunda
                // busqueda distinta tampoco vuelve a salir a la red.
                const catalog = await getExternalTournamentCatalog({
                    sportKey: params.flashScoreSportKey,
                    shouldAggregateRugby: params.shouldAggregateRugby,
                    audience: params.audience,
                }) || [];
                const flashScoreTournaments = params.search
                    ? catalog.filter((tournament) => matchesExternalTournamentSearch(tournament, params.search))
                    : catalog;
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

    // La validacion NO puede colgar de flashScoreCatalogEnabled: sin `sport` ese
    // flag es false y el pedido se caia al listado plano, devolviendo 200 con un
    // catalogo entero cuando lo que se pidio era un pais.
    if (params.scope === 'country') {
        const missingCountry = (!params.externalCountryId && params.externalCountryIds.length === 0) || !params.countryName;

        if (!params.sport) {
            const response = NextResponse.json(
                { error: 'Falta sport para pedir un pais.' },
                { status: 400 },
            );
            attachObservabilityHeaders(response, trace, 'BYPASS');
            return response;
        }

        if (missingCountry) {
            const response = NextResponse.json(
                { error: 'Faltan external_country_id o country_name.' },
                { status: 400 },
            );
            attachObservabilityHeaders(response, trace, 'BYPASS');
            return response;
        }
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
