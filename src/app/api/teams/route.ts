import { createClient } from '@/lib/supabase/server';
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

    // 1. Check Supabase for internal club info first
    let details: any = null;
    try {
        const supabase = await createClient();
        const { data: internalClub } = await supabase
            .from('clubs')
            .select('*')
            .eq('id', rawTeamId)
            .single();

        if (internalClub) {
            details = {
                id: internalClub.id,
                name: internalClub.name,
                image_path: internalClub.logo_url,
                logo: internalClub.logo_url,
                logo_url: internalClub.logo_url,
                country: internalClub.country,
                city: internalClub.city,
                region: internalClub.region,
                is_internal: true
            };
        }
    } catch (dbErr) {
        // Silently continue if not found or DB error
    }

    const teamId = stripFsTeamPrefix(rawTeamId);
    const isExternalId = /^[a-zA-Z0-9]+$/.test(teamId) && !teamId.includes('-');

    try {
        // Phase 1: Fetch endpoints that use team_id (only if it looks like an external ID)
        let resultsArr: any[] = [];
        let fixturesArr: any[] = [];
        let transfers: any[] = [];
        let resultsGrouped: any[] = [];

        if (isExternalId) {
            const [resultsRes, fixturesRes, transfersRes] = await Promise.allSettled([
                getTeamResults(teamId),
                getTeamFixtures(teamId),
                getTeamTransfers(teamId)
            ]);

            const resultsRaw = normalize(resultsRes);
            const fixturesRaw = normalize(fixturesRes);
            transfers = normalize(transfersRes) || [];

            const flattenMatches = (data: any): any[] => {
                if (!Array.isArray(data)) return [];
                if (data.length > 0 && data[0]?.match_id) return data;
                const flat: any[] = [];
                for (const group of data) {
                    const matches = group?.matches || [];
                    for (const m of matches) {
                        flat.push({ ...m, tournament_name: group.name || group.full_name || '' });
                    }
                }
                return flat;
            };

            resultsArr = flattenMatches(resultsRaw);
            fixturesArr = flattenMatches(fixturesRaw);
            resultsGrouped = Array.isArray(resultsRaw) ? resultsRaw : [];
        }

        // Phase 2: Handle Details & Squad
        let teamUrl = teamUrlParam;
        let extractedName = teamName;

        if (!teamUrl && !extractedName && isExternalId) {
            const info = extractTeamFromResults(teamId, resultsGrouped);
            if (info?.name) extractedName = info.name;
        }

        if (!teamUrl && extractedName && isExternalId) {
            teamUrl = `/team/${slugify(extractedName)}/${teamId}/`;
        }

        let squad: any = null;
        if (teamUrl && isExternalId) {
            const [detailsRes, squadRes] = await Promise.allSettled([
                getTeamDetails(teamUrl),
                getTeamSquad(teamUrl)
            ]);

            const remoteDetails = normalize(detailsRes);
            squad = normalize(squadRes);

            // Merge/Override details if external found and we don't have internal or want to prefer remote
            if (remoteDetails && !Array.isArray(remoteDetails)) {
                details = { ...details, ...remoteDetails };
            }
        }

        // Final Fallback for details
        if (!details && isExternalId) {
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
