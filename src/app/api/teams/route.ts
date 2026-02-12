import {
    getTeamDetails,
    getTeamResults,
    getTeamFixtures,
    getTeamSquad,
    getTeamTransfers
} from '@/lib/services/flashscore';

function stripFsTeamPrefix(val: string): string {
    if (val.toLowerCase().startsWith('fs-team-')) return val.slice(8);
    if (val.toLowerCase().startsWith('fs-')) return val.slice(3);
    return val;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Extract team info (name, logo, team_url) from the results/fixtures response.
 * Results are grouped by tournament, each containing matches with home_team/away_team.
 */
function extractTeamFromResults(teamId: string, data: any[]): { name: string; image_path: string; teamUrl: string } | null {
    for (const tournament of data) {
        const matches = tournament?.matches || [];
        for (const m of matches) {
            if (String(m.home_team?.team_id) === teamId) {
                return {
                    name: m.home_team.name || '',
                    image_path: m.home_team.small_image_path || m.home_team.image_path || '',
                    teamUrl: '', // results don't include team_url
                };
            }
            if (String(m.away_team?.team_id) === teamId) {
                return {
                    name: m.away_team.name || '',
                    image_path: m.away_team.small_image_path || m.away_team.image_path || '',
                    teamUrl: '',
                };
            }
        }
    }
    return null;
}

const normalize = (res: PromiseSettledResult<any>) => {
    if (res.status !== 'fulfilled' || !res.value) return null;
    const v = res.value;
    return v?.DATA || v?.data || v;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawTeamId = searchParams.get('team_id') || '';
    const teamName = searchParams.get('team_name') || '';
    const teamUrlParam = searchParams.get('team_url') || '';

    if (!rawTeamId) {
        return Response.json({ ok: false, error: 'team_id is required' }, { status: 400 });
    }

    const teamId = stripFsTeamPrefix(rawTeamId);

    try {
        // Phase 1: Fetch endpoints that use team_id (always reliable)
        const [resultsRes, fixturesRes, transfersRes] = await Promise.allSettled([
            getTeamResults(teamId),
            getTeamFixtures(teamId),
            getTeamTransfers(teamId)
        ]);

        const resultsRaw = normalize(resultsRes);
        const fixturesRaw = normalize(fixturesRes);
        const transfers = normalize(transfersRes);

        // Results/fixtures come grouped by tournament: [{tournament_id, matches: [...]}, ...]
        // Flatten to a simple array of matches for the frontend
        const flattenMatches = (data: any): any[] => {
            if (!Array.isArray(data)) return [];
            // Check if already flat (each item has match_id)
            if (data.length > 0 && data[0]?.match_id) return data;
            // Grouped by tournament - flatten
            const flat: any[] = [];
            for (const group of data) {
                const matches = group?.matches || [];
                for (const m of matches) {
                    flat.push({ ...m, tournament_name: group.name || group.full_name || '' });
                }
            }
            return flat;
        };

        const resultsArr = flattenMatches(resultsRaw);
        const fixturesArr = flattenMatches(fixturesRaw);
        // Keep raw grouped data for team name extraction
        const resultsGrouped = Array.isArray(resultsRaw) ? resultsRaw : [];

        // Determine team_url for details/squad endpoints
        // Priority: 1) explicit param from frontend, 2) build from team name
        let teamUrl = teamUrlParam;
        let extractedName = teamName;

        if (!teamUrl && !extractedName) {
            // Try to extract the team name from results data (grouped format)
            const info = extractTeamFromResults(teamId, resultsGrouped);
            if (info?.name) {
                extractedName = info.name;
            }
        }

        if (!teamUrl && extractedName) {
            teamUrl = `/team/${slugify(extractedName)}/${teamId}/`;
        }

        // Phase 2: Fetch details & squad (require team_url)
        let details: any = null;
        let squad: any = null;

        if (teamUrl) {
            const [detailsRes, squadRes] = await Promise.allSettled([
                getTeamDetails(teamUrl),
                getTeamSquad(teamUrl)
            ]);

            details = normalize(detailsRes);
            squad = normalize(squadRes);

            // If details returned empty array (wrong slug), treat as null
            if (Array.isArray(details) && details.length === 0) details = null;
            if (Array.isArray(squad) && squad.length === 0) squad = null;
        }

        // Fallback: if details still null, build from results data
        if (!details) {
            const info = extractTeamFromResults(teamId, resultsGrouped);
            if (info) {
                details = { name: info.name, image_path: info.image_path };
            }
        }

        return Response.json({
            ok: true,
            details,
            results: resultsArr,
            fixtures: fixturesArr,
            squad: squad || [],
            transfers: Array.isArray(transfers) ? transfers : []
        });
    } catch (e: any) {
        console.error('Teams API error', e);
        return Response.json(
            { ok: false, error: 'Failed to load team data', details: e.message || String(e) },
            { status: 500 }
        );
    }
}
