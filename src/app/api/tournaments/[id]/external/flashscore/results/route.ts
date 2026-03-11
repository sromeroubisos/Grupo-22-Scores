import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTournamentResults } from '@/lib/services/flashscore';
import type { ExternalMatchWithMapping, MatchConfidence } from '@/lib/types/flashscore-integration';

interface DbParticipant {
    club_id: string;
    clubs: {
        id: string;
        name: string;
        short_name: string | null;
    };
}

function matchTeamName(
    name: string,
    participants: DbParticipant[]
): { club_id: string | null; confidence: MatchConfidence } {
    const lower = name.toLowerCase().trim();

    for (const p of participants) {
        const clubName = p.clubs.name.toLowerCase().trim();
        const shortName = (p.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName === lower || (shortName.length >= 2 && shortName === lower)) {
            return { club_id: p.club_id, confidence: 'exact' };
        }
    }

    for (const p of participants) {
        const clubName = p.clubs.name.toLowerCase().trim();
        const shortName = (p.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName.length >= 3 && (lower.includes(clubName) || clubName.includes(lower))) {
            return { club_id: p.club_id, confidence: 'partial' };
        }
        if (shortName.length >= 3 && (lower.includes(shortName) || shortName.includes(lower))) {
            return { club_id: p.club_id, confidence: 'partial' };
        }
    }

    return { club_id: null, confidence: 'none' };
}

function normalizeMatches(raw: any): Array<{
    id: string; home: string; away: string; ts: number; venue?: string;
    scoreHome?: number; scoreAway?: number;
}> {
    const matches: Array<{
        id: string; home: string; away: string; ts: number; venue?: string;
        scoreHome?: number; scoreAway?: number;
    }> = [];
    const data = raw?.DATA ?? raw?.data ?? raw;

    if (!Array.isArray(data)) return matches;

    for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        if (Array.isArray(item.matches)) {
            for (const m of item.matches) {
                const normalized = extractMatch(m);
                if (normalized) matches.push(normalized);
            }
        } else {
            const normalized = extractMatch(item);
            if (normalized) matches.push(normalized);
        }
    }

    return matches;
}

function extractMatch(m: any): {
    id: string; home: string; away: string; ts: number; venue?: string;
    scoreHome?: number; scoreAway?: number;
} | null {
    const id = m.id ?? m.match_id ?? m.event_id;
    const home = m.home_team?.name ?? m.home?.name ?? m.homeTeam?.name ?? m.home_name;
    const away = m.away_team?.name ?? m.away?.name ?? m.awayTeam?.name ?? m.away_name;
    const ts = m.start_time ?? m.timestamp ?? m.startTime ?? m.time;

    if (!id || !home || !away || !ts) return null;

    const scoreHome = m.scores?.home ?? m.score?.home ?? m.home_score;
    const scoreAway = m.scores?.away ?? m.score?.away ?? m.away_score;

    return {
        id: String(id),
        home: String(home),
        away: String(away),
        ts: Number(ts),
        venue: m.venue ?? undefined,
        scoreHome: scoreHome != null ? Number(scoreHome) : undefined,
        scoreAway: scoreAway != null ? Number(scoreAway) : undefined,
    };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1;

        const supabase = await createClient();

        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        if (error || !tournament) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const fsConfig = (tournament as any).ruleset?.flashscore;
        if (!fsConfig?.tournament_template_id || fsConfig?.season_id == null) {
            return NextResponse.json(
                { error: 'Este torneo no tiene IDs de FlashScore resueltos. Ve a Detalles y usá "Resolver IDs" primero.' },
                { status: 400 }
            );
        }

        const raw = await getTournamentResults(
            fsConfig.tournament_template_id,
            String(fsConfig.season_id),
            page
        );

        if (!raw) {
            return NextResponse.json(
                { error: 'No se pudo obtener resultados de FlashScore. Intentá nuevamente.' },
                { status: 502 }
            );
        }

        // Load tournament participants for club matching
        const { data: participantsData } = await supabase
            .from('tournament_participants')
            .select('club_id, clubs(id, name, short_name)')
            .eq('tournament_id', tournamentId)
            .eq('status', 'active');

        const participants: DbParticipant[] = (participantsData ?? []).map((p: any) => ({
            club_id: p.club_id,
            clubs: Array.isArray(p.clubs) ? p.clubs[0] : p.clubs,
        })).filter((p: DbParticipant) => p.clubs);

        const rawMatches = normalizeMatches(raw);

        const matches: ExternalMatchWithMapping[] = rawMatches.map(m => {
            const homeMatch = matchTeamName(m.home, participants);
            const awayMatch = matchTeamName(m.away, participants);
            const dateTime = new Date(m.ts * 1000).toISOString();

            return {
                flashscore_match_id: m.id,
                home_team_name: m.home,
                away_team_name: m.away,
                timestamp: m.ts,
                date_time: dateTime,
                venue: m.venue,
                status: 'final' as const,
                score: m.scoreHome != null && m.scoreAway != null
                    ? { home: m.scoreHome, away: m.scoreAway }
                    : undefined,
                home_club_id: homeMatch.club_id,
                away_club_id: awayMatch.club_id,
                home_match_confidence: homeMatch.confidence,
                away_match_confidence: awayMatch.confidence,
            };
        });

        return NextResponse.json({ matches, page, has_more: rawMatches.length >= 20 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
