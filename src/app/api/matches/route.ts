import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import { getFlashScoreMatches, getFlashScoreLiveMatches } from '@/lib/services/flashscore';
import { persistFromExternalMatches } from '@/lib/sync/catalog';
import { formatDateKey, canonicalizeTimezone } from '@/lib/timezone';

// GET /api/matches
// Parameters: 
// - date: YYYY-MM-DD
// - sport: 'rugby' | 'football' | ...
// - status: 'live' | 'scheduled' | ...
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const sport = searchParams.get('sport') || undefined;
        const status = searchParams.get('status');
        const rawTimeZone = searchParams.get('tz') || undefined;
        const timeZone = (() => {
            if (!rawTimeZone) return undefined;
            try {
                // Validate the timezone is recognized by Node.js
                new Intl.DateTimeFormat('en-CA', { timeZone: rawTimeZone }).format(new Date());
                // Canonicalize legacy names that FlashScore rejects (HTTP 400)
                // e.g. 'America/Buenos_Aires' -> 'America/Argentina/Buenos_Aires'
                return canonicalizeTimezone(rawTimeZone);
            } catch {
                return undefined;
            }
        })();

        // Fast path: live=true returns only live matches (for polling)
        const liveOnly = searchParams.get('live') === 'true';
        if (liveOnly && sport) {
            try {
                const liveMatches = await getFlashScoreLiveMatches(sport);
                const enrichedLive = (liveMatches || []).map(m => {
                    let dateStr = new Date().toISOString();
                    try {
                        if (m.scheduledAt instanceof Date && !isNaN(m.scheduledAt.getTime())) {
                            dateStr = m.scheduledAt.toISOString();
                        } else if (typeof m.scheduledAt === 'string') {
                            const d = new Date(m.scheduledAt);
                            if (!isNaN(d.getTime())) dateStr = d.toISOString();
                        }
                    } catch { /* ignore */ }

                    return {
                        id: m.id,
                        tournamentId: m.tournamentId,
                        dateTime: dateStr,
                        status: 'live' as const,
                        score: m.score as any,
                        clock: {
                            running: true,
                            seconds: 0,
                            period: m.currentMinute || 'En Vivo'
                        },
                        roundId: m.round ? `F${m.round}` : 'General',
                        venue: m.venueName || 'Estadio',
                        homeClubId: m.homeTeamId,
                        awayClubId: m.awayTeamId,
                        homeTeam: {
                            id: m.homeTeamId,
                            name: m.homeTeamName,
                            logo: m.homeTeamLogo || '',
                            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC'
                        },
                        awayTeam: {
                            id: m.awayTeamId,
                            name: m.awayTeamName,
                            logo: m.awayTeamLogo || '',
                            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS'
                        },
                        tournament: {
                            id: m.tournamentId,
                            name: (m as any).leagueName || 'Liga',
                            sport: sport as any,
                            status: 'published' as const
                        },
                        liveEnabled: true
                    };
                });
                if (liveMatches && liveMatches.length > 0) {
                    persistFromExternalMatches(liveMatches, sport);
                }
                return NextResponse.json(enrichedLive);
            } catch (e) {
                console.error('Live-only fetch failed:', e);
                return NextResponse.json([]);
            }
        }

        // formatDateKey is imported from @/lib/timezone - uses Intl when
        // timeZone is provided, falls back to UTC otherwise.

        // External API Integration
        const useExternal = searchParams.get('external') === 'true';

        // When using external data, skip mock-db matches entirely
        // so the user only sees real FlashScore data.
        let enrichedMatches: any[] = [];

        if (!useExternal) {
            let matches = db.matches;

            // Filter by Status
            if (status) {
                matches = matches.filter(m => m.status === status);
            }

            // Enrich data (join relationships)
            enrichedMatches = matches.map(m => {
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
            enrichedMatches = enrichedMatches.filter(m => m.tournament?.status === 'published' || m.id.startsWith('ext-') || m.id.startsWith('fs-'));
        }

        if (useExternal && date) {
            try {
                // Fix: Parse YYYY-MM-DD as local date to avoid UTC timezone shift
                const [year, month, day] = date.split('-').map(Number);
                const localDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

                // Check if date is today for live updates (user timezone aware when provided)
                const todayKey = formatDateKey(new Date(), timeZone);
                const isToday = date === todayKey;

                // Parallel fetch if today, otherwise just list
                let [externalMatches, liveMatches] = await Promise.all([
                    getFlashScoreMatches(localDate, sport || 'rugby', {
                        timeZone,
                        targetDateKey: date || undefined
                    }).catch(e => {
                        console.error('getFlashScoreMatches failed:', e);
                        return [];
                    }),
                    isToday ? getFlashScoreLiveMatches(sport || 'rugby').catch(e => {
                        console.error('getFlashScoreLiveMatches failed:', e);
                        return [];
                    }) : Promise.resolve([])
                ]);

                // Merge live data into list
                if (liveMatches && liveMatches.length > 0) {
                    const liveMap = new Map(liveMatches.map(m => [m.id, m]));
                    externalMatches = externalMatches.map(match => {
                        const liveMatch = liveMap.get(match.id);
                        if (liveMatch) {
                            return {
                                ...match,
                                status: 'live',
                                score: liveMatch.score,
                            };
                        }
                        return match;
                    });
                }

                const enrichedExternalMatches = (externalMatches || []).map(m => {
                    // Defensive date conversion
                    let dateStr = new Date().toISOString();
                    try {
                        if (m.scheduledAt instanceof Date && !isNaN(m.scheduledAt.getTime())) {
                            dateStr = m.scheduledAt.toISOString();
                        } else if (typeof m.scheduledAt === 'string') {
                            const d = new Date(m.scheduledAt);
                            if (!isNaN(d.getTime())) dateStr = d.toISOString();
                        }
                    } catch (e) {
                        console.warn('Date conversion failed for match', m.id);
                    }

                    return {
                        id: m.id,
                        tournamentId: m.tournamentId,
                        dateTime: dateStr,
                        status: (m.status === 'final' ? 'final' : m.status === 'live' ? 'live' : 'scheduled') as any,
                        score: m.score as any,
                        clock: {
                            running: m.status === 'live',
                            seconds: 0,
                            period: m.currentMinute || (m.status === 'live' ? 'En Vivo' : '1T')
                        },
                        roundId: m.round ? `F${m.round}` : 'General',
                        venue: m.venueName || 'Estadio',
                        homeClubId: m.homeTeamId,
                        awayClubId: m.awayTeamId,
                        homeTeam: {
                            id: m.homeTeamId,
                            name: m.homeTeamName,
                            logo: m.homeTeamLogo || '',
                            shortName: m.homeTeamName?.substring(0, 3).toUpperCase() || 'LOC'
                        },
                        awayTeam: {
                            id: m.awayTeamId,
                            name: m.awayTeamName,
                            logo: m.awayTeamLogo || '',
                            shortName: m.awayTeamName?.substring(0, 3).toUpperCase() || 'VIS'
                        },
                        tournament: {
                            id: m.tournamentId,
                            name: (m as any).leagueName || 'Liga (EXT)',
                            sport: (sport || 'rugby') as any,
                            status: 'published' as const
                        },
                        liveEnabled: false
                    };
                });

                enrichedMatches = [...enrichedMatches, ...enrichedExternalMatches];

                if (externalMatches && externalMatches.length > 0) {
                    persistFromExternalMatches(externalMatches, sport || 'rugby');
                }
            } catch (e) {
                console.error('External section processing failed:', e);
            }
        }

        // Filter by Date - always use timezone-aware comparison so that
        // e.g. 00:00 UTC correctly maps to 21:00 previous day in UTC-3.
        if (date) {
            enrichedMatches = enrichedMatches.filter(m => {
                const dt = new Date(m.dateTime);
                if (Number.isNaN(dt.getTime())) return false;
                return formatDateKey(dt, timeZone) === date;
            });
        }

        return NextResponse.json(enrichedMatches);
    } catch (error) {
        console.error('Fatal API Error [GET /api/matches]:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
    }
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
        db.addMatch(newMatch);

        return NextResponse.json(newMatch, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}


