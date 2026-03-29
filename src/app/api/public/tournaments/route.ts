import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { isRugbySport } from '@/lib/externalProviderPolicy';
import {
    getRugbyApiSportsLeagues,
    toRugbyApiSportsTournamentId,
    type RugbyApiSportsLeague,
} from '@/lib/services/rugbyApiSports';
import {
    isBlockedRugbyApiSportsLeagueId,
} from '@/lib/utils/blockedTournaments';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { resolveTournamentAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import { sortTournamentsByPriority } from '@/lib/utils/tournamentOrdering';

const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];
const SELECT_WITH_LEGACY_SPORT_AND_PRIORITY = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, priority, category, age_grade';
const SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, priority, category, age_grade';
const SELECT_WITH_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, category, age_grade';
const SELECT_WITHOUT_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, category, age_grade';

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

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeLookupValue(value: unknown): string {
    return normalizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
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

    if (!slug || slug === 'world' || slug === 'worldwide' || slug === 'global') {
        return 'international';
    }

    return slug;
}

function mapRugbyLeagueToPublicTournament(league: RugbyApiSportsLeague) {
    const countryName = normalizeText(league.country?.name) || 'Internacional';
    const countryId = resolveRugbyCountryId(countryName);
    const seasons = Array.isArray(league.seasons)
        ? [...league.seasons]
            .sort((left, right) => Number(right?.season || 0) - Number(left?.season || 0))
            .map((season) => ({
                seasonId: String(season.season),
                year: Number.isFinite(Number(season.season)) ? Number(season.season) : undefined,
                startDate: season.start || undefined,
                endDate: season.end || undefined,
                teamsCount: 0,
                isActive: season.current === true,
            }))
        : [];

    return {
        id: toRugbyApiSportsTournamentId(league.id),
        name: normalizeText(league.name) || `League ${league.id}`,
        display_name: normalizeText(league.name) || `League ${league.id}`,
        country: countryName,
        country_id: countryId,
        sport_id: 'rugby',
        logo_url: league.logo || null,
        slug: null,
        priority: 0,
        type: league.type === 'cup' ? 'cup' : (countryId === 'international' ? 'international' : 'local'),
        seasons,
    };
}

async function queryPublicRugbyApiTournaments(args: {
    search: string;
    audience: TournamentAudience;
}) {
    const leagues = await getRugbyApiSportsLeagues();

    return sortTournamentsByPriority(leagues
        .filter((league) => !isBlockedRugbyApiSportsLeagueId(league.id))
        .map(mapRugbyLeagueToPublicTournament)
        .filter((league) => {
            if (resolveTournamentAudience({
                name: league.name,
                displayName: league.display_name,
            }) !== args.audience) {
                return false;
            }

            if (!args.search) return true;

            const name = league.name.toLowerCase();
            const displayName = league.display_name?.toLowerCase() || '';
            const country = league.country?.toLowerCase() || '';

            return name.includes(args.search) || displayName.includes(args.search) || country.includes(args.search);
        }));
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
        const search = searchParams.get('search')?.trim().toLowerCase() || '';
        const audience = resolveAudienceFilter(searchParams.get('audience'));
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

        if (sport && isRugbySport(sport)) {
            try {
                const rugbyTournaments = await queryPublicRugbyApiTournaments({ search, audience });
                const combinedTournaments = mergePublicTournamentLists(dbTournaments, rugbyTournaments);

                return NextResponse.json(
                    { data: combinedTournaments },
                    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
                );
            } catch (rugbyError) {
                console.error('[GET /api/public/tournaments] rugby api fallback:', rugbyError);

                if (!error) {
                    return NextResponse.json(
                        { data: dbTournaments },
                        { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
                    );
                }
            }
        }

        if (error) {
            console.error('[GET /api/public/tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ data: dbTournaments });
    } catch (error) {
        console.error('[GET /api/public/tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos.' },
            { status: 500 }
        );
    }
}
