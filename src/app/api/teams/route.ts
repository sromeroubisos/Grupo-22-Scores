import { createClient } from '@/lib/supabase/server';
import {
    getTeamDetails,
    getTeamSquad,
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


const normalize = (res: PromiseSettledResult<any>) => {
    if (res.status !== 'fulfilled' || !res.value) return null;
    const v = res.value;
    return v?.DATA || v?.data || v;
};

function normalizeInternalMatch(m: any): any {
    const dt = m.date_time ? new Date(m.date_time) : null;
    const timestamp = dt ? dt.getTime() / 1000 : 0;
    const scoreHome = m.score?.home ?? m.score?.home_score ?? null;
    const scoreAway = m.score?.away ?? m.score?.away_score ?? null;
    return {
        match_id: m.id,
        home_team: {
            name: m.home_name || m.home_club_id || '',
            small_image_path: m.home_logo || '',
            team_id: m.home_club_id || '',
        },
        away_team: {
            name: m.away_name || m.away_club_id || '',
            small_image_path: m.away_logo || '',
            team_id: m.away_club_id || '',
        },
        scores: { home: scoreHome, away: scoreAway },
        match_status: m.status || 'NS',
        timestamp,
        tournament_name: m.tournament_name || '',
        sport_id: m.sport_id || null,
    };
}

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
    let internalResults: any[] = [];
    let internalFixtures: any[] = [];
    let internalExternalId: string | null = null;
    let internalClubName: string = '';

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
            internalExternalId = internalClub.external_id || null;
            internalClubName = internalClub.name || '';

            // Query internal matches from Supabase
            const { data: matchRows } = await supabase
                .from('matches')
                .select(`
                    id, date_time, status, score,
                    home_club_id, away_club_id, tournament_id,
                    home_club:clubs!matches_home_club_id_fkey(name, logo_url),
                    away_club:clubs!matches_away_club_id_fkey(name, logo_url),
                    tournament:tournaments(name, sport_id)
                `)
                .or(`home_club_id.eq.${rawTeamId},away_club_id.eq.${rawTeamId}`)
                .order('date_time', { ascending: false });

            if (matchRows && matchRows.length > 0) {
                const FINISHED_STATUSES = new Set([
                    'finished', 'completed', 'scored', 'ft', 'aet', 'pen', 'awarded',
                    'finalizado', 'jugado', 'played', 'result'
                ]);
                const SCHEDULED_STATUSES = new Set([
                    'scheduled', 'ns', 'not started', 'pendiente', 'programado', 'upcoming'
                ]);
                const now = Date.now();
                for (const row of matchRows) {
                    const homeClub = Array.isArray(row.home_club) ? row.home_club[0] : row.home_club;
                    const awayClub = Array.isArray(row.away_club) ? row.away_club[0] : row.away_club;
                    const tournament = Array.isArray(row.tournament) ? row.tournament[0] : row.tournament;
                    const normalized = normalizeInternalMatch({
                        ...row,
                        home_name: homeClub?.name,
                        home_logo: homeClub?.logo_url,
                        away_name: awayClub?.name,
                        away_logo: awayClub?.logo_url,
                        tournament_name: tournament?.name,
                        sport_id: tournament?.sport_id,
                    });
                    const st = (row.status || '').toLowerCase();
                    const matchDate = row.date_time ? new Date(row.date_time).getTime() : 0;
                    const isPast = matchDate > 0 && matchDate < now;
                    const isFinished = FINISHED_STATUSES.has(st) || (isPast && !SCHEDULED_STATUSES.has(st));
                    if (isFinished) {
                        internalResults.push(normalized);
                    } else {
                        internalFixtures.push(normalized);
                    }
                }
            }
        }
    } catch (dbErr) {
        // Silently continue if not found or DB error
    }

    const teamId = stripFsTeamPrefix(rawTeamId);
    const isExternalId = /^[a-zA-Z0-9]+$/.test(teamId) && !teamId.includes('-');
    // Also treat internal clubs with external_id as having external data
    const effectiveExternalId = isExternalId ? teamId : (internalExternalId ? stripFsTeamPrefix(internalExternalId) : null);

    try {
        // Matches come exclusively from local Supabase DB (internalResults/internalFixtures)
        // FlashScore is only used for team details and squad if external_id is available

        let teamUrl = teamUrlParam;
        const extractedName = teamName || internalClubName;

        if (!teamUrl && extractedName && effectiveExternalId) {
            teamUrl = `/team/${slugify(extractedName)}/${effectiveExternalId}/`;
        }

        let squad: any = null;
        if (teamUrl && effectiveExternalId) {
            const [detailsRes, squadRes] = await Promise.allSettled([
                getTeamDetails(teamUrl),
                getTeamSquad(teamUrl)
            ]);

            const remoteDetails = normalize(detailsRes);
            squad = normalize(squadRes);

            if (remoteDetails && !Array.isArray(remoteDetails)) {
                details = { ...details, ...remoteDetails };
            }
        }

        return Response.json({
            ok: true,
            details,
            results: internalResults,
            fixtures: internalFixtures,
            squad: squad || [],
            transfers: []
        });
    } catch (e: any) {
        console.error('Teams API error', e);
        return Response.json(
            { ok: false, error: 'Failed to load team data', details: e.message || String(e) },
            { status: 500 }
        );
    }
}
