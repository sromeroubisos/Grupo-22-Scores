import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchFlashScore } from '@/lib/services/flashscore';
import { getRugbyApiSportsLeagues, getRugbyApiSportsTeams } from '@/lib/services/rugbyApiSports';

type SearchResult = {
    id: string;
    type: 'tournament' | 'club';
    title: string;
    subtitle: string;
    url: string;
    logo_url: string | null;
    searchWeight: number;
};

type TournamentSearchRow = {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    logo_url: string | null;
    sport_id: string | null;
    country_id: string | null;
    is_visible: boolean | null;
    sport: { name: string } | null;
    country: { name: string } | null;
};

type ClubSearchRow = {
    id: string;
    name: string;
    short_name: string | null;
    slug: string | null;
    city: string | null;
    country: string | null;
    logo_url: string | null;
    is_visible: boolean | null;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '12', 10);

    if (!search || search.length < 2) {
        return NextResponse.json({ data: [] });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const lSearch = search.toLowerCase();

    let debugInfo: Record<string, unknown> = {
        query: search,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };

    try {
        const [tournamentsRes, clubsRes, fsSearchRaw, rugbyTeams, rugbyLeagues] = await Promise.all([
            supabase.from('tournaments')
                .select('id, name, display_name, slug, logo_url, sport_id, country_id, is_visible, sport:sports(name), country:countries(name)')
                .or(`name.ilike.%${search}%,display_name.ilike.%${search}%,slug.ilike.%${search}%`)
                .limit(limit),
            supabase.from('clubs')
                .select('id, name, short_name, slug, city, country, logo_url, is_visible')
                .or(`name.ilike.%${search}%,short_name.ilike.%${search}%,slug.ilike.%${search}%`)
                .limit(limit),
            searchFlashScore(search).catch(() => null),
            search.length >= 3 ? getRugbyApiSportsTeams({ search }).catch(() => []) : Promise.resolve([]),
            search.length >= 3 ? getRugbyApiSportsLeagues({ search }).catch(() => []) : Promise.resolve([]),
        ]);

        debugInfo = {
            ...debugInfo,
            tError: tournamentsRes.error,
            cError: clubsRes.error,
            tCount: tournamentsRes.data?.length || 0,
            cCount: clubsRes.data?.length || 0
        };

        if (tournamentsRes.error) {
            console.error('[Universal Search] Tournament Query Error:', tournamentsRes.error);
        }
        if (clubsRes.error) {
            console.error('[Universal Search] Club Query Error:', clubsRes.error);
        }

        const rawResults: SearchResult[] = [];

        if (tournamentsRes.data) {
            rawResults.push(...(tournamentsRes.data as any[]).map((t) => {
                const title = t.display_name || t.name;
                const sportLabel = t.sport?.name || t.sport_id || 'Torneo';
                const countryLabel = t.country?.name || t.country_id || 'Internacional';

                return {
                    id: t.id,
                    type: 'tournament' as const,
                    title,
                    subtitle: `${sportLabel} · ${countryLabel}`,
                    url: `/tournaments/${t.slug || t.id}`,
                    logo_url: t.logo_url,
                    searchWeight: calculateWeight(title, t.name, t.slug, lSearch, 0)
                };
            }));
        }

        if (clubsRes.data) {
            rawResults.push(...(clubsRes.data as any[]).map((c) => ({
                id: c.id,
                type: 'club' as const,
                title: c.name,
                subtitle: `Club · ${c.city || c.country || ''}`,
                url: `/clubs/${c.slug || c.id}`,
                logo_url: c.logo_url,
                searchWeight: calculateWeight(c.name, c.short_name, c.slug, lSearch, 1)
            })));
        }

        // Merge FlashScore API results (teams only), avoiding duplicates with DB results
        const dbClubNames = new Set(rawResults.filter(r => r.type === 'club').map(r => r.title.toLowerCase()));
        if (fsSearchRaw) {
            const fsItems: any[] = Array.isArray(fsSearchRaw)
                ? fsSearchRaw
                : (fsSearchRaw?.teams || fsSearchRaw?.data || []);

            for (const item of fsItems) {
                const name: string = item.name || item.team_name || '';
                if (!name) continue;
                if (dbClubNames.has(name.toLowerCase())) continue; // skip if already in DB results

                const teamUrl: string = item.team_url || '';
                const teamId: string = item.team_id || item.id || '';
                const clubUrl = teamId
                    ? `/clubs/${teamId}?name=${encodeURIComponent(name)}&team_url=${encodeURIComponent(teamUrl)}`
                    : '';
                if (!clubUrl) continue;

                rawResults.push({
                    id: `fs-${teamId}`,
                    type: 'club' as const,
                    title: name,
                    subtitle: `Club · FlashScore`,
                    url: clubUrl,
                    logo_url: item.image_path || item.logo || null,
                    searchWeight: calculateWeight(name, null, null, lSearch, 2)
                });
            }
        }

        if (Array.isArray(rugbyTeams)) {
            for (const team of rugbyTeams) {
                const name = String(team?.name || '').trim();
                if (!name || dbClubNames.has(name.toLowerCase())) continue;

                rawResults.push({
                    id: `ras-team-${team.id}`,
                    type: 'club',
                    title: name,
                    subtitle: `Club · Rugby API-Sports`,
                    url: `/clubs/ras-team-${team.id}?name=${encodeURIComponent(name)}&sport=rugby`,
                    logo_url: team.logo || null,
                    searchWeight: calculateWeight(name, null, null, lSearch, 2),
                });
            }
        }

        if (Array.isArray(rugbyLeagues)) {
            for (const league of rugbyLeagues) {
                const name = String(league?.name || '').trim();
                if (!name) continue;

                const seasons = Array.isArray(league.seasons) ? [...league.seasons] : [];
                seasons.sort((left, right) => Number(right?.season || 0) - Number(left?.season || 0));
                const selectedSeason = seasons.find((season) => season.current === true)?.season ?? seasons[0]?.season ?? '';
                const countryName = String(league.country?.name || 'Internacional').trim();

                rawResults.push({
                    id: `ras-league-${league.id}`,
                    type: 'tournament',
                    title: name,
                    subtitle: `Rugby · ${countryName}`,
                    url: `/tournaments/ras-league-${league.id}?sport=rugby${selectedSeason ? `&season=${selectedSeason}` : ''}`,
                    logo_url: league.logo || null,
                    searchWeight: calculateWeight(name, null, null, lSearch, 1),
                });
            }
        }

        const finalResults = rawResults
            .sort((a, b) => {
                if (a.searchWeight !== b.searchWeight) return a.searchWeight - b.searchWeight;
                if (a.type !== b.type) return a.type === 'tournament' ? -1 : 1;
                return a.title.localeCompare(b.title);
            })
            .slice(0, limit);

        return NextResponse.json({
            data: finalResults
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Universal Search Error]:', error, debugInfo);
        return NextResponse.json({
            error: message
        }, { status: 500 });
    }
}

function calculateWeight(title: string, secondary: string | null, slug: string | null, search: string, entityPriority: number): number {
    const t = title.toLowerCase();
    const s = secondary?.toLowerCase() || '';
    const sl = slug?.toLowerCase() || '';

    if (t === search || s === search) return 0 + entityPriority * 0.1;
    if (t.startsWith(search) || s.startsWith(search) || sl.startsWith(search)) return 1 + entityPriority * 0.1;
    if (t.includes(search) || s.includes(search)) return 2 + entityPriority * 0.1;

    return 3 + entityPriority * 0.1;
}
