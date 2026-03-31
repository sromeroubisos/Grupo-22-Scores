import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeSportId } from '@/lib/clubDerivatives';

const FINAL_STATUSES = ['final', 'finished', 'ft'] as const;

type ClubSideRow = {
    id: string;
    name: string | null;
    logo_url: string | null;
} | null;

type TournamentRow = {
    name: string | null;
    sport_id: string | null;
} | null;

type MatchScore = {
    home?: number | null;
    away?: number | null;
} | null;

type DbH2HMatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: MatchScore;
    sport_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home: ClubSideRow;
    away: ClubSideRow;
    tournament: TournamentRow;
};

type ClubDerivativeIncoming = {
    base_club_id: string;
};

type ClubDerivativeOutgoing = {
    derived_club_id: string;
};

type ClubDerivativesClient = {
    from(table: 'club_derivatives'): {
        select(columns: 'base_club_id'): {
            eq(column: 'derived_club_id', value: string): {
                maybeSingle(): Promise<{ data: ClubDerivativeIncoming | null }>;
            };
        };
        select(columns: 'derived_club_id'): {
            eq(column: 'base_club_id', value: string): Promise<{ data: ClubDerivativeOutgoing[] | null }>;
        };
    };
};

function looksOpaqueSportId(value: string | null) {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
}

async function resolveClubFamilyIds(supabase: Awaited<ReturnType<typeof createClient>>, clubId: string) {
    const familyIds = new Set<string>([clubId]);
    let baseClubId = clubId;

    try {
        const derivativesClient = supabase as unknown as ClubDerivativesClient;
        const { data: incoming } = await derivativesClient
            .from('club_derivatives')
            .select('base_club_id')
            .eq('derived_club_id', clubId)
            .maybeSingle();

        baseClubId = incoming?.base_club_id || clubId;
        familyIds.add(baseClubId);

        const { data: outgoing } = await derivativesClient
            .from('club_derivatives')
            .select('derived_club_id')
            .eq('base_club_id', baseClubId);

        (Array.isArray(outgoing) ? outgoing : []).forEach((row) => {
            if (row?.derived_club_id) familyIds.add(row.derived_club_id);
        });
    } catch {
        // Fall back to the original club id when derivative data is unavailable.
    }

    return Array.from(familyIds);
}

// GET /api/db/h2h?home=<clubId>&away=<clubId>
// Returns recent matches involving either club (for form columns) and
// direct head-to-head matches, mapped to the FlashScore H2H format used
// by the match detail page.
export async function GET(req: NextRequest) {
    const homeId = req.nextUrl.searchParams.get('home');
    const awayId = req.nextUrl.searchParams.get('away');
    const sportParam = req.nextUrl.searchParams.get('sport');
    const requestedSport = canonicalizeSportId(sportParam);

    if (!homeId || !awayId) {
        return NextResponse.json({ error: 'home and away params required' }, { status: 400 });
    }

    const supabase = await createClient();
    const [homeFamilyIds, awayFamilyIds] = await Promise.all([
        resolveClubFamilyIds(supabase, homeId),
        resolveClubFamilyIds(supabase, awayId),
    ]);
    const relevantClubIds = Array.from(new Set([...homeFamilyIds, ...awayFamilyIds]));
    const homeFamilySet = new Set(homeFamilyIds);
    const awayFamilySet = new Set(awayFamilyIds);
    const matchConditions = relevantClubIds.flatMap((clubId) => [
        `home_club_id.eq.${clubId}`,
        `away_club_id.eq.${clubId}`,
    ]);

    // Fetch recent matches for either club (covers form + H2H in one query)
    const { data, error } = await supabase
        .from('matches')
        .select(`
            id, date_time, status, score, sport_id,
            home_club_id, away_club_id,
            home:clubs!matches_home_club_id_fkey(id, name, logo_url),
            away:clubs!matches_away_club_id_fkey(id, name, logo_url),
            tournament:tournament_id(name, sport_id)
        `)
        .or(matchConditions.join(','))
        .in('status', [...FINAL_STATUSES])
        .order('date_time', { ascending: false })
        .limit(requestedSport ? 100 : 30);

    if (error) {
        console.error('[GET /api/db/h2h] query failed:', error);
        return NextResponse.json({ error: 'Failed to fetch H2H data' }, { status: 500 });
    }

    const baseRows = ((data || []) as DbH2HMatchRow[]);
    const shouldApplySportFilter = Boolean(requestedSport) && !looksOpaqueSportId(requestedSport);
    const filteredRows = (shouldApplySportFilter
        ? baseRows.filter((match) => {
            const matchSport = canonicalizeSportId(
                match?.sport_id ??
                match?.tournament?.sport_id ??
                null,
            );

            return !matchSport || matchSport === requestedSport;
        })
        : baseRows)
        .slice(0, 30);

    const matches = filteredRows.map((m) => {
        const homeLogo = m.home?.logo_url ?? '';
        const awayLogo = m.away?.logo_url ?? '';
        const normalizedHomeId = m.home_club_id && homeFamilySet.has(m.home_club_id)
            ? homeId
            : m.home_club_id && awayFamilySet.has(m.home_club_id)
                ? awayId
                : m.home_club_id;
        const normalizedAwayId = m.away_club_id && homeFamilySet.has(m.away_club_id)
            ? homeId
            : m.away_club_id && awayFamilySet.has(m.away_club_id)
                ? awayId
                : m.away_club_id;

        return ({
        match_id: m.id,
        timestamp: Math.floor(new Date(m.date_time).getTime() / 1000),
        status: 'finished',
        scores: m.score ?? { home: null, away: null },
        tournament_name: m.tournament?.name ?? '',
        home_club_id: normalizedHomeId ?? null,
        away_club_id: normalizedAwayId ?? null,
        home_team: {
            name: m.home?.name ?? '',
            logo: homeLogo,
            image_path: homeLogo,
            small_image_path: homeLogo,
            id: normalizedHomeId,
            team_id: normalizedHomeId,
        },
        away_team: {
            name: m.away?.name ?? '',
            logo: awayLogo,
            image_path: awayLogo,
            small_image_path: awayLogo,
            id: normalizedAwayId,
            team_id: normalizedAwayId,
        },
        });
    });

    return NextResponse.json({ ok: true, matches });
}
