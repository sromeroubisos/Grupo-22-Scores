import { getReadClient } from '@/lib/supabase/read';
import { getProdeSourceSummary, normalizeProdeSourceBinding } from '@/lib/prode/source';
import type {
    ProdeBaseCompetitionOption,
    ProdeCompetitionEventStats,
    PublicProdeCompetition,
    PublicProdeCompetitionDetail,
    PublicProdeEventSummary,
    PublicProdeUserTotal,
} from '@/lib/prode/types';

type AnyRow = Record<string, unknown>;
type SchemaStatus<T> = { schemaReady: boolean; data: T };
type QueryError = { code?: string; message?: string } | null;

interface SupabaseQueryLike<T> extends PromiseLike<{ data: T[] | null; error: QueryError }> {
    select(columns: string): SupabaseQueryLike<T>;
    in(column: string, values: readonly string[]): SupabaseQueryLike<T>;
    eq(column: string, value: string): SupabaseQueryLike<T>;
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): SupabaseQueryLike<T>;
}

interface SupabaseClientLike {
    from(table: string): SupabaseQueryLike<AnyRow>;
}

interface SupabaseRpcClientLike extends SupabaseClientLike {
    rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: AnyRow[] | null; error: QueryError }>;
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
    if (!error) return false;

    return (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('relation') ||
        false
    );
}

function toSafeString(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toNullableString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
}

function toFiniteNumber(value: unknown, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toFinitePriority(value: unknown, fallback = -1) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toBoolean(value: unknown, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
}

function toRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function toSentenceCase(value: string | null) {
    if (!value) return null;

    const cleaned = value
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');

    if (!cleaned) return null;

    return cleaned
        .split(' ')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

function getDefaultStats(): ProdeCompetitionEventStats {
    return {
        total: 0,
        open: 0,
        live: 0,
        finished: 0,
        nextLockAt: null,
    };
}

function getDefaultMemberStats() {
    return {
        totalMembers: 0,
    };
}

function buildStatsMap(rows: AnyRow[]) {
    const now = Date.now();
    const statsMap = new Map<string, ProdeCompetitionEventStats>();

    rows.forEach((row) => {
        const competitionId = toSafeString(row.competition_id);
        if (!competitionId) return;

        const current = statsMap.get(competitionId) || getDefaultStats();
        current.total += 1;

        const status = toSafeString(row.status);
        if (status === 'live') current.live += 1;
        if (status === 'final' || status === 'scored') current.finished += 1;

        const lockAt = toNullableString(row.locks_at);
        if (lockAt) {
            const lockTime = new Date(lockAt).getTime();
            if (Number.isFinite(lockTime) && lockTime > now) {
                current.open += 1;
                if (!current.nextLockAt || lockTime < new Date(current.nextLockAt).getTime()) {
                    current.nextLockAt = lockAt;
                }
            }
        }

        statsMap.set(competitionId, current);
    });

    return statsMap;
}

function buildMemberStatsMap(rows: AnyRow[]) {
    const memberMap = new Map<string, { totalMembers: number }>();

    rows.forEach((row) => {
        const competitionId = toSafeString(row.competition_id);
        if (!competitionId) return;

        const current = memberMap.get(competitionId) || getDefaultMemberStats();
        current.totalMembers += 1;
        memberMap.set(competitionId, current);
    });

    return memberMap;
}

function mapCompetition(
    row: AnyRow,
    statsMap: Map<string, ProdeCompetitionEventStats>,
    memberStatsMap: Map<string, { totalMembers: number }>,
): PublicProdeCompetition {
    const binding = normalizeProdeSourceBinding({
        source_type: row.source_type,
        local_tournament_id: row.local_tournament_id,
        external_provider: row.external_provider,
        external_tournament_id: row.external_tournament_id,
    });

    return {
        id: toSafeString(row.id),
        name: toSafeString(row.name),
        slug: toSafeString(row.slug),
        description: toNullableString(row.description),
        sportId: toNullableString(row.sport_id),
        status: (toSafeString(row.status) || 'draft') as PublicProdeCompetition['status'],
        visibility: (toSafeString(row.visibility) || 'public') as PublicProdeCompetition['visibility'],
        sourceBinding: binding,
        sourceSummary: getProdeSourceSummary(binding),
        predictionLeadMinutes: toFiniteNumber(row.prediction_lead_minutes),
        startAt: toNullableString(row.start_at),
        endAt: toNullableString(row.end_at),
        metadata: toRecord(row.metadata),
        stats: statsMap.get(toSafeString(row.id)) || getDefaultStats(),
        members: memberStatsMap.get(toSafeString(row.id)) || getDefaultMemberStats(),
    };
}

function mapEvent(row: AnyRow): PublicProdeEventSummary {
    return {
        id: toSafeString(row.id),
        homeLabel: toSafeString(row.home_label),
        awayLabel: toSafeString(row.away_label),
        startsAt: toSafeString(row.starts_at),
        locksAt: toSafeString(row.locks_at),
        status: (toSafeString(row.status) || 'scheduled') as PublicProdeEventSummary['status'],
        scoringStatus: toSafeString(row.scoring_status) || 'pending',
        sourceBinding: normalizeProdeSourceBinding({
            source_type: row.source_type,
            local_match_id: row.local_match_id,
            external_provider: row.external_provider,
            external_match_id: row.external_match_id,
        }),
        officialResult: row.official_result && typeof row.official_result === 'object'
            ? row.official_result as Record<string, unknown>
            : null,
    };
}

function mapBaseCompetitionFromTournament(row: AnyRow): ProdeBaseCompetitionOption {
    const rawId = toSafeString(row.id);
    const displayName = toSafeString(row.display_name) || toSafeString(row.name);
    const isApiManaged = toBoolean(row.is_api_managed);
    const dataSource = toNullableString(row.data_source);
    const sportLabel = toNullableString(row.sport_name) || toNullableString(row.sport_id) || toNullableString(row.sport);
    const countryLabel = toNullableString(row.country_name) || toNullableString(row.country);
    const catalogSource = isApiManaged ? 'api' as const : 'local' as const;

    return {
        id: `tournament:${rawId}`,
        name: toSafeString(row.name),
        displayName,
        sportId: toNullableString(row.sport_id),
        sportLabel,
        countryLabel,
        logoUrl: toNullableString(row.logo_url),
        status: toSafeString(row.status) || (toBoolean(row.is_active, true) ? 'active' : 'published'),
        catalogSource,
        catalogLabel: catalogSource === 'api'
            ? `API${dataSource ? ` - ${toSentenceCase(dataSource)}` : ''}`
            : 'Base local',
        isVisible: row.is_visible === null || row.is_visible === undefined ? true : toBoolean(row.is_visible, true),
        isApiManaged,
        dataSource,
        sourceBinding: normalizeProdeSourceBinding({
            source_type: 'local',
            local_tournament_id: rawId,
        }),
    };
}

function mapBaseCompetitionFromExternalTournament(row: AnyRow): ProdeBaseCompetitionOption {
    const externalId = toSafeString(row.id);
    const provider = toNullableString(row.source) || 'external';
    const displayName = toSafeString(row.display_name) || toSafeString(row.name);
    const sportLabel = toNullableString(row.sport);
    const countryLabel = toNullableString(row.country);

    return {
        id: `external:${provider}:${externalId}`,
        name: toSafeString(row.name),
        displayName,
        sportId: sportLabel,
        sportLabel,
        countryLabel,
        logoUrl: toNullableString(row.logo_url),
        status: 'available',
        catalogSource: 'api',
        catalogLabel: `API - ${toSentenceCase(provider) || 'Externa'}`,
        isVisible: true,
        isApiManaged: true,
        dataSource: provider,
        sourceBinding: normalizeProdeSourceBinding({
            source_type: 'external',
            external_provider: provider,
            external_tournament_id: externalId,
        }),
    };
}

async function getAllTournamentCatalogRows() {
    const supabase = await getReadClient() as unknown as SupabaseRpcClientLike;

    try {
        const rpcResponse = await supabase.rpc('get_all_tournaments', {
            p_include_hidden: true,
            p_viewer_user_id: null,
        });

        if (!rpcResponse.error) {
            return rpcResponse.data || [];
        }
    } catch {
        // Fall back to direct table queries when the RPC is unavailable.
    }

    const selectVariants = [
        'id,name,display_name,logo_url,sport_id,sport_name,country,country_name,status,is_visible,priority,is_api_managed,data_source,external_id',
        'id,name,display_name,logo_url,sport_id,country,status,is_visible,priority,is_api_managed,data_source,external_id',
        'id,name,display_name,logo_url,sport_id,country,status,is_visible,priority,is_api_managed,data_source',
        'id,name,display_name,logo_url,sport_id,country,status,is_visible,priority',
        'id,name,display_name,logo_url,sport_id,country,status,is_visible',
        'id,name,display_name,logo_url,sport_id,country,status',
        'id,name,display_name,logo_url,sport_id,country',
        'id,name,display_name',
        'id,name',
    ];

    for (const selectColumns of selectVariants) {
        const fallbackResponse = await supabase.from('tournaments').select(selectColumns);

        if (!fallbackResponse.error) {
            return (fallbackResponse.data || []) as AnyRow[];
        }

        if (!isMissingRelationError(fallbackResponse.error) && fallbackResponse.error.code !== 'PGRST204') {
            throw new Error(fallbackResponse.error.message || 'No se pudo cargar el catalogo de torneos.');
        }
    }

    throw new Error('No se pudo cargar el catalogo de torneos.');
}

export async function listProdeBaseCompetitions(): Promise<SchemaStatus<ProdeBaseCompetitionOption[]>> {
    const supabase = await getReadClient() as unknown as SupabaseRpcClientLike;
    const [tournamentResult, externalResult] = await Promise.allSettled([
        getAllTournamentCatalogRows(),
        supabase
            .from('external_tournaments')
            .select('id, source, name, display_name, logo_url, sport, country'),
    ]);

    const tournamentRows = tournamentResult.status === 'fulfilled' ? tournamentResult.value : [];
    const externalRows = externalResult.status === 'fulfilled' && !externalResult.value.error
        ? (externalResult.value.data || []) as AnyRow[]
        : [];

    if (tournamentResult.status === 'rejected' && externalResult.status === 'rejected') {
        return { schemaReady: false, data: [] };
    }

    if (externalResult.status === 'fulfilled' && externalResult.value.error && !isMissingRelationError(externalResult.value.error)) {
        throw new Error(externalResult.value.error.message || 'No se pudo cargar el catalogo externo de torneos.');
    }

    if (tournamentResult.status === 'rejected' && externalRows.length === 0) {
        return { schemaReady: false, data: [] };
    }

    const normalizedTournaments = tournamentRows.map((row) => ({
        row,
        mapped: mapBaseCompetitionFromTournament(row),
        priority: toFinitePriority(row.priority),
    }));
    const priorityMap = new Map(normalizedTournaments.map(({ mapped, priority }) => [mapped.id, priority]));

    const coveredExternalIds = new Set(
        normalizedTournaments
            .map(({ row }) => toNullableString(row.external_id))
            .filter((candidate): candidate is string => Boolean(candidate)),
    );

    const catalog = [
        ...normalizedTournaments.map(({ mapped }) => mapped),
        ...externalRows
            .filter((row) => {
                const externalId = toSafeString(row.id);
                return Boolean(externalId) && !coveredExternalIds.has(externalId);
            })
            .map((row) => mapBaseCompetitionFromExternalTournament(row)),
    ];

    catalog.sort((left, right) => {
        const leftPriority = priorityMap.get(left.id) ?? -1;
        const rightPriority = priorityMap.get(right.id) ?? -1;

        if (left.catalogSource !== right.catalogSource) {
            return left.catalogSource === 'local' ? -1 : 1;
        }
        if (leftPriority !== rightPriority) {
            return rightPriority - leftPriority;
        }
        if (left.displayName !== right.displayName) {
            return left.displayName.localeCompare(right.displayName, 'es');
        }
        return left.id.localeCompare(right.id, 'es');
    });

    return {
        schemaReady: true,
        data: catalog,
    };
}

async function getCompetitionRows(filter?: { slug?: string }) {
    const supabase = await getReadClient() as unknown as SupabaseClientLike;
    let query = supabase
        .from('prode_competitions')
        .select([
            'id',
            'name',
            'slug',
            'description',
            'status',
            'visibility',
            'source_type',
            'local_tournament_id',
            'external_provider',
            'external_tournament_id',
            'sport_id',
            'prediction_lead_minutes',
            'start_at',
            'end_at',
            'metadata',
        ].join(','))
        .in('status', ['published', 'active', 'finished'])
        .order('start_at', { ascending: true, nullsFirst: false });

    if (filter?.slug) {
        query = query.eq('slug', filter.slug);
    }

    return query;
}

export async function listPublicProdeCompetitions(): Promise<SchemaStatus<PublicProdeCompetition[]>> {
    const { data: competitionRows, error } = await getCompetitionRows();

    if (error) {
        if (isMissingRelationError(error)) {
            return { schemaReady: false, data: [] };
        }
        throw new Error(error.message || 'No se pudieron cargar las competencias de prode.');
    }

    const competitions = (competitionRows || []) as AnyRow[];
    if (!competitions.length) {
        return { schemaReady: true, data: [] };
    }

    const competitionIds = competitions.map((competition) => toSafeString(competition.id)).filter(Boolean);
    const supabase = await getReadClient() as unknown as SupabaseClientLike;
    const [{ data: eventRows, error: eventsError }, { data: memberRows, error: membersError }] = await Promise.all([
        supabase
            .from('prode_events')
            .select('competition_id, status, locks_at')
            .in('competition_id', competitionIds),
        supabase
            .from('prode_competition_members')
            .select('competition_id')
            .in('competition_id', competitionIds)
            .eq('status', 'active'),
    ]);

    if (eventsError && !isMissingRelationError(eventsError)) {
        throw new Error(eventsError.message || 'No se pudieron cargar los eventos de prode.');
    }
    if (membersError && !isMissingRelationError(membersError)) {
        throw new Error(membersError.message || 'No se pudieron cargar los participantes del prode.');
    }

    const statsMap = buildStatsMap((eventRows || []) as AnyRow[]);
    const memberStatsMap = buildMemberStatsMap((memberRows || []) as AnyRow[]);

    return {
        schemaReady: true,
        data: competitions.map((competition) => mapCompetition(competition, statsMap, memberStatsMap)),
    };
}

export async function getPublicProdeCompetitionDetail(slug: string): Promise<SchemaStatus<PublicProdeCompetitionDetail | null>> {
    const { data: competitionRows, error } = await getCompetitionRows({ slug });

    if (error) {
        if (isMissingRelationError(error)) {
            return { schemaReady: false, data: null };
        }
        throw new Error(error.message || 'No se pudo cargar la competencia de prode.');
    }

    const competition = ((competitionRows || [])[0] || null) as AnyRow | null;
    if (!competition) {
        return { schemaReady: true, data: null };
    }

    const supabase = await getReadClient() as unknown as SupabaseClientLike;
    const [{ data: eventRows, error: eventsError }, { data: memberRows, error: membersError }] = await Promise.all([
        supabase
            .from('prode_events')
            .select([
                'id',
                'competition_id',
                'home_label',
                'away_label',
                'starts_at',
                'locks_at',
                'status',
                'scoring_status',
                'source_type',
                'local_match_id',
                'external_provider',
                'external_match_id',
                'official_result',
            ].join(','))
            .eq('competition_id', toSafeString(competition.id))
            .order('starts_at', { ascending: true }),
        supabase
            .from('prode_competition_members')
            .select('competition_id')
            .eq('competition_id', toSafeString(competition.id))
            .eq('status', 'active'),
    ]);

    if (eventsError && !isMissingRelationError(eventsError)) {
        throw new Error(eventsError.message || 'No se pudieron cargar los eventos de la competencia.');
    }
    if (membersError && !isMissingRelationError(membersError)) {
        throw new Error(membersError.message || 'No se pudieron cargar los participantes de la competencia.');
    }

    const eventRowsList = (eventRows || []) as AnyRow[];
    const statsMap = buildStatsMap(eventRowsList.map((eventRow) => ({
        competition_id: competition.id,
        status: eventRow.status,
        locks_at: eventRow.locks_at,
    })));
    const memberStatsMap = buildMemberStatsMap((memberRows || []) as AnyRow[]);

    return {
        schemaReady: true,
        data: {
            competition: mapCompetition(competition, statsMap, memberStatsMap),
            events: eventRowsList.map((event) => mapEvent(event)),
        },
    };
}

export async function listPublicProdeUserTotals(): Promise<SchemaStatus<PublicProdeUserTotal[]>> {
    const supabase = await getReadClient() as unknown as SupabaseClientLike;
    const { data: rows, error } = await supabase
        .from('prode_user_totals')
        .select([
            'user_id',
            'total_points',
            'exact_hits',
            'correct_outcomes',
            'competitions_joined',
            'competitions_scored',
            'position',
            'users!inner(name, avatar_url)',
        ].join(','))
        .order('position', { ascending: true });

    if (error) {
        if (isMissingRelationError(error)) {
            return { schemaReady: false, data: [] };
        }
        throw new Error(error.message || 'No se pudo cargar la tabla total del prode.');
    }

    return {
        schemaReady: true,
        data: ((rows || []) as AnyRow[]).map((row) => {
            const userRow = toRecord(row.users);
            return {
                userId: toSafeString(row.user_id),
                userName: toSafeString(userRow.name) || 'Usuario',
                avatarUrl: toNullableString(userRow.avatar_url),
                totalPoints: toFiniteNumber(row.total_points),
                exactHits: toFiniteNumber(row.exact_hits),
                correctOutcomes: toFiniteNumber(row.correct_outcomes),
                competitionsJoined: toFiniteNumber(row.competitions_joined),
                competitionsScored: toFiniteNumber(row.competitions_scored),
                position: Number.isFinite(Number(row.position)) ? Number(row.position) : null,
            };
        }),
    };
}
