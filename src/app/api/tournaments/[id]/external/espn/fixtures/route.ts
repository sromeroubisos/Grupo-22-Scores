import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getTournamentEspnAmericanFootballConfig,
    getTournamentEspnMotorsportConfig,
    isAmericanFootballSport,
    isMotorsportSport,
} from '@/lib/externalProviderPolicy';
import { getEspnAmericanFootballLeagueFixtures, isEspnAmericanFootballLeagueSlug } from '@/lib/services/espnAmericanFootball';
import { getEspnMotorsportLeagueFixtures, isEspnMotorsportLeagueSlug } from '@/lib/services/espnMotorsport';

function matchParticipantTeamName(
    name: string,
    participants: Array<{ club_id: string; clubs: { name: string; short_name: string | null } }>
) {
    const lower = name.toLowerCase().trim();

    for (const participant of participants) {
        const clubName = participant.clubs.name.toLowerCase().trim();
        const shortName = (participant.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName === lower || (shortName.length >= 2 && shortName === lower)) {
            return { club_id: participant.club_id, confidence: 'exact' as const };
        }
    }

    for (const participant of participants) {
        const clubName = participant.clubs.name.toLowerCase().trim();
        const shortName = (participant.clubs.short_name ?? '').toLowerCase().trim();

        if (clubName.length >= 3 && (lower.includes(clubName) || clubName.includes(lower))) {
            return { club_id: participant.club_id, confidence: 'partial' as const };
        }
        if (shortName.length >= 3 && (lower.includes(shortName) || shortName.includes(lower))) {
            return { club_id: participant.club_id, confidence: 'partial' as const };
        }
    }

    return { club_id: null, confidence: 'none' as const };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || '1'));
        const supabase = await createClient();

        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (error || !tournament) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        const sportKey = (tournament as any).sport_id ?? (tournament as any).sport ?? null;
        const isAmericanFootball = isAmericanFootballSport(sportKey);
        const isMotorsport = isMotorsportSport(sportKey);

        if (!isAmericanFootball && !isMotorsport) {
            return NextResponse.json({ error: 'This provider is only available for american football and motorsport tournaments.' }, { status: 409 });
        }

        const config = isAmericanFootball
            ? getTournamentEspnAmericanFootballConfig(tournament as any)
            : getTournamentEspnMotorsportConfig(tournament as any);

        if (isAmericanFootball && !isEspnAmericanFootballLeagueSlug(config?.league_slug)) {
            return NextResponse.json({ error: 'This tournament is not linked to ESPN yet.' }, { status: 400 });
        }

        if (isMotorsport && !isEspnMotorsportLeagueSlug(config?.league_slug)) {
            return NextResponse.json({ error: 'This tournament is not linked to ESPN yet.' }, { status: 400 });
        }

        const participants = isAmericanFootball
            ? (
                ((await supabase
                    .from('tournament_participants')
                    .select('club_id, clubs(id, name, short_name)')
                    .eq('tournament_id', tournamentId)
                    .eq('status', 'active')).data ?? [])
            )
                .map((participant: any) => ({
                    club_id: participant.club_id,
                    clubs: Array.isArray(participant.clubs) ? participant.clubs[0] : participant.clubs,
                }))
                .filter((participant: any) => participant.clubs)
            : [];

        const fixtures = isAmericanFootball
            ? await getEspnAmericanFootballLeagueFixtures(config!.league_slug as any, page)
            : await getEspnMotorsportLeagueFixtures(config!.league_slug as any, page);
        const matches = fixtures.matches
            .filter((match): match is NonNullable<(typeof fixtures.matches)[number]> => Boolean(match))
            .map((match) => {
            const homeMatch = isAmericanFootball
                ? matchParticipantTeamName(match.home_team_name, participants as any)
                : { club_id: null, confidence: 'none' as const };
            const awayMatch = isAmericanFootball
                ? matchParticipantTeamName(match.away_team_name, participants as any)
                : { club_id: null, confidence: 'none' as const };

            return {
                external_match_id: match.match_id,
                home_team_name: match.home_team_name,
                away_team_name: match.away_team_name,
                timestamp: match.timestamp,
                date_time: match.date,
                venue: match.venue ?? undefined,
                status: match.status,
                score: match.scores,
                home_club_id: homeMatch.club_id,
                away_club_id: awayMatch.club_id,
                home_match_confidence: homeMatch.confidence,
                away_match_confidence: awayMatch.confidence,
            };
            });

        return NextResponse.json({
            matches,
            page,
            has_more: fixtures.hasMore,
            total: fixtures.total,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
