import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import { getFlashScoreMatches, getFlashScoreLiveMatches } from '@/lib/services/flashscore';

// GET /api/matches
// Parameters: 
// - date: YYYY-MM-DD
// - sport: 'rugby' | 'football' | ...
// - status: 'live' | 'scheduled' | ...
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const sport = searchParams.get('sport');
    const status = searchParams.get('status');

    let matches = db.matches;

    // Filter by Date
    if (date) {
        matches = matches.filter(m => m.dateTime.startsWith(date));
    }

    // Filter by Status
    if (status) {
        matches = matches.filter(m => m.status === status);
    }

    // Enrich data (join relationships)
    let enrichedMatches = matches.map(m => {
        const home = db.clubs.find(c => c.id === m.homeClubId);
        const away = db.clubs.find(c => c.id === m.awayClubId);
        const tournament = db.tournaments.find(t => t.id === m.tournamentId);

        return {
            ...m,
            homeTeam: {
                id: home?.id,
                name: home?.name,
                logo: home?.logoUrl,
                shortName: home?.shortName
            },
            awayTeam: {
                id: away?.id,
                name: away?.name,
                logo: away?.logoUrl,
                shortName: away?.shortName
            },
            tournament: {
                id: tournament?.id,
                name: tournament?.name,
                sport: tournament?.sport,
                status: tournament?.status
            }
        };
    });

    // Filter by Sport (needs enriched data to know the sport)
    if (sport) {
        enrichedMatches = enrichedMatches.filter(m => m.tournament?.sport === sport);
    }

    // Filter public visibility (only published tournaments)
    enrichedMatches = enrichedMatches.filter(m => m.tournament?.status === 'published');

    // External API Integration
    const useExternal = searchParams.get('external') === 'true';
    if (useExternal && date) {
        try {
            // Fix: Parse YYYY-MM-DD as local date to avoid UTC timezone shift
            const [year, month, day] = date.split('-').map(Number);
            const localDate = new Date(year, month - 1, day);

            // Check if date is today for live updates
            const today = new Date();
            const isToday = localDate.getDate() === today.getDate() &&
                localDate.getMonth() === today.getMonth() &&
                localDate.getFullYear() === today.getFullYear();

            // Parallel fetch if today, otherwise just list
            let [externalMatches, liveMatches] = await Promise.all([
                getFlashScoreMatches(localDate, sport || 'football'),
                isToday ? getFlashScoreLiveMatches(sport || 'football') : Promise.resolve([])
            ]);

            // Merge live data into list
            if (liveMatches.length > 0) {
                const liveMap = new Map(liveMatches.map(m => [m.id, m]));
                externalMatches = externalMatches.map(match => {
                    const liveMatch = liveMap.get(match.id);
                    if (liveMatch) {
                        return {
                            ...match,
                            status: 'live',
                            score: liveMatch.score,
                            // You might want to carry over other live attributes if available
                        };
                    }
                    return match;
                });
            }

            const enrichedExternalMatches = externalMatches.map(m => ({
                id: m.id,
                tournamentId: m.tournamentId,
                dateTime: m.scheduledAt ? m.scheduledAt.toISOString() : new Date().toISOString(),
                status: m.status as any,
                score: m.score as any,
                clock: {
                    running: m.status === 'live',
                    seconds: 0,
                    period: m.currentMinute || (m.status === 'live' ? 'En Vivo' : '1T')
                },
                roundId: `F${m.round}`, // Convert number to F# format
                venue: m.venueName || 'External Venue',
                homeClubId: m.homeTeamId,
                awayClubId: m.awayTeamId,
                homeTeam: {
                    id: m.homeTeamId,
                    name: m.homeTeamName,
                    logo: m.homeTeamLogo || '',
                    shortName: m.homeTeamName.substring(0, 3).toUpperCase()
                },
                awayTeam: {
                    id: m.awayTeamId,
                    name: m.awayTeamName,
                    logo: m.awayTeamLogo || '',
                    shortName: m.awayTeamName.substring(0, 3).toUpperCase()
                },
                tournament: {
                    id: m.tournamentId,
                    name: (m as any).leagueName || 'Leagues (EXT)',
                    sport: (sport || 'football') as any,
                    status: 'published' as const
                },
                liveEnabled: false // specific to internal
            }));

            enrichedMatches = [...enrichedMatches, ...enrichedExternalMatches];
        } catch (e) {
            console.error('External fetch failed', e);
        }
    }

    return NextResponse.json(enrichedMatches);
}

// POST /api/matches
// Create a new match
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Basic validation
        if (!body.tournamentId || !body.homeClubId || !body.awayClubId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const newMatch = {
            id: `m${Date.now()}`,
            ...body,
            createdAt: new Date().toISOString(),
            status: body.status || 'scheduled',
            score: body.score || { home: 0, away: 0 },
            clock: body.clock || { running: false, seconds: 0, period: '1T' }
        };

        // In a real DB we would save here
        db.matches.push(newMatch);

        return NextResponse.json(newMatch, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
