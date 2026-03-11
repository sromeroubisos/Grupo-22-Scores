import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import { getFlashScoreMatches, getFlashScoreLiveMatches } from '@/lib/services/flashscore';
import { persistFromExternalMatches } from '@/lib/sync/catalog';
import { formatDateKey, canonicalizeTimezone, toLocalMatch } from '@/lib/timezone';
import { createClient } from '@/lib/supabase/server';

// Maps internal sport IDs to all DB variants that should match
function getSportVariants(sport: string): string[] {
    const lower = sport.toLowerCase();
    switch (lower) {
        case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
        case 'rugby-union': return ['rugby', 'rugby-union'];
        case 'rugby-league': return ['rugby', 'rugby-league'];
        case 'football': return ['football', 'soccer'];
        case 'hockey': return ['hockey', 'field-hockey'];
        default: return [lower];
    }
}

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
            const tz = rawTimeZone || 'America/Argentina/Buenos_Aires';
            try {
                // Validate the timezone is recognized by Node.js
                new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
                return canonicalizeTimezone(tz);
            } catch {
                return 'America/Argentina/Buenos_Aires';
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
                            status: 'published' as const,
                            country: (m as any).countryName || 'Internacional'
                        },
                        liveEnabled: true
                    };
                });
                if (liveMatches && liveMatches.length > 0) {
                    persistFromExternalMatches(liveMatches, sport);
                }

                let finalLiveMatches = [...enrichedLive];

                // Append DB live matches
                try {
                    const supabase = await createClient();
                    const { data: dbLiveMatches, error: dbError } = await supabase
                        .from('matches')
                        .select(`
                            id, date_time, round_label, venue, status, score, live_enabled,
                            tournament_id, home_club_id, away_club_id, notes, stream_url, replay_url,
                            tournament:tournaments(id, name, sport, season_id, status, union:unions(id, name, country)),
                            home_team:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, primary_color),
                            away_team:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, primary_color)
                        `)
                        .eq('status', 'live');

                    if (!dbError && dbLiveMatches) {
                        const sportVariants = getSportVariants(sport);
                        const enrichedDbLive = dbLiveMatches.filter((m: any) => {
                            if (m.tournament && m.tournament.status && !['published', 'active'].includes(m.tournament.status)) return false;
                            if (sportVariants && m.tournament?.sport) {
                                return sportVariants.includes(m.tournament.sport.toLowerCase());
                            }
                            return true;
                        }).map((m: any) => {
                           const { localTime } = toLocalMatch(m.date_time, timeZone);
                           return {
                                id: m.id,
                                tournamentId: m.tournament_id,
                                dateTime: m.date_time,
                                time: localTime,
                                status: m.status || 'scheduled',
                                score: m.score || { home: 0, away: 0 },
                                clock: { running: true, seconds: 0, period: 'En Vivo' },
                                roundId: m.round_label || 'General',
                                venue: m.venue || 'Sede',
                                homeClubId: m.home_club_id,
                                awayClubId: m.away_club_id,
                                homeTeam: m.home_team ? {
                                    id: m.home_team.id,
                                    name: m.home_team.name,
                                    logo: m.home_team.logo_url || '',
                                    shortName: m.home_team.short_name || m.home_team.name?.substring(0, 3).toUpperCase() || 'LOC'
                                } : { id: m.home_club_id, name: 'Local', logo: '', shortName: 'LOC' },
                                awayTeam: m.away_team ? {
                                    id: m.away_team.id,
                                    name: m.away_team.name,
                                    logo: m.away_team.logo_url || '',
                                    shortName: m.away_team.short_name || m.away_team.name?.substring(0, 3).toUpperCase() || 'VIS'
                                } : { id: m.away_club_id, name: 'Visitante', logo: '', shortName: 'VIS' },
                                tournament: m.tournament ? {
                                    id: m.tournament.id,
                                    name: m.tournament.name,
                                    sport: m.tournament.sport || sport,
                                    status: m.tournament.status || 'published',
                                    country: (m.tournament as any).union?.country || 'Internacional'
                                } : { id: m.tournament_id || 'db-local', name: 'Partido Local', sport, status: 'published', country: 'Internacional' },
                                liveEnabled: m.live_enabled || false,
                                source: 'db'
                           }
                        });
                        finalLiveMatches = [...finalLiveMatches, ...enrichedDbLive];
                    }
                } catch (dbErr) {
                    console.error('DB Live-only fetch failed:', dbErr);
                }

                return NextResponse.json({ data: finalLiveMatches });
            } catch (e) {
                console.error('Live-only fetch failed:', e);
                return NextResponse.json({ data: [] });
            }
        }

        // formatDateKey is imported from @/lib/timezone - uses Intl when
        // timeZone is provided, falls back to UTC otherwise.

        // External API Integration
        const useExternal = searchParams.get('external') === 'true';

        // When using external data, skip mock-db matches entirely
        // so the user only sees real FlashScore data.
        let enrichedMatches: any[] = [];

        // Per-source tracking (returned in response for client error visibility)
        let fsOk = false, fsCount = 0;
        let dbOk = false, dbCount = 0, dbFallback = false;

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
                        console.warn('[matches] FlashScore fetch failed - source disabled', e?.message);
                        return [];
                    }),
                    isToday ? getFlashScoreLiveMatches(sport || 'rugby').catch(e => {
                        console.warn('[matches] FlashScore live fetch failed', e?.message);
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
                            status: 'published' as const,
                            country: (m as any).countryName || 'Internacional'
                        },
                        liveEnabled: false
                    };
                });

                enrichedMatches = [...enrichedMatches, ...enrichedExternalMatches];
                fsOk = true;
                fsCount = enrichedExternalMatches.length;
                console.log(`[matches] FlashScore: ${fsCount} matches for date=${date}`);

                if (externalMatches && externalMatches.length > 0) {
                    persistFromExternalMatches(externalMatches, sport || 'rugby');
                }
            } catch (e) {
                console.error('External section processing failed:', e);
            }
        }

        // ─── Supabase DB Matches ─────────────────────────────────────────────
        // Always fetch matches stored in the database (created via admin panel)
        // and merge them with external (FlashScore) matches.
        try {
            const supabase = await createClient();

            // Attempt 1: named FK joins (works when FK constraint names are stable)
            let { data: dbMatches, error: dbError } = await supabase
                .from('matches')
                .select(`
                    id, date_time, round_label, venue, status, score, live_enabled,
                    tournament_id, home_club_id, away_club_id, notes, stream_url, replay_url,
                    tournament:tournaments(id, name, sport, season_id, status, union:unions(id, name, country)),
                    home_team:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, primary_color),
                    away_team:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, primary_color)
                `)
                .order('date_time', { ascending: true });

            // Attempt 2: if FK names changed (e.g. after schema migration), fall back to manual join
            if (dbError && /fkey|relationship|foreign/i.test(dbError.message)) {
                dbFallback = true;
                console.warn('[matches] FK join failed, falling back to manual club join:', dbError.message);
                const [mRes, cRes] = await Promise.all([
                    supabase.from('matches').select(`
                        id, date_time, round_label, venue, status, score, live_enabled,
                        tournament_id, home_club_id, away_club_id, notes, stream_url, replay_url,
                        tournament:tournaments(id, name, sport, season_id, status)
                    `).order('date_time', { ascending: true }),
                    supabase.from('clubs').select('id, name, short_name, logo_url, primary_color')
                ]);
                const clubMap = new Map((cRes.data || []).map((c: any) => [c.id, c]));
                dbMatches = (mRes.data || []).map((m: any) => ({
                    ...m,
                    home_team: clubMap.get(m.home_club_id) || null,
                    away_team: clubMap.get(m.away_club_id) || null,
                })) as any;
                dbError = mRes.error;
            }

            if (!dbError && dbMatches && dbMatches.length > 0) {
                // Track existing IDs to avoid duplicates
                const existingIds = new Set(enrichedMatches.map((m: any) => m.id));

                // Filter by sport through tournament relationship
                const sportVariants = sport ? getSportVariants(sport) : null;

                const enrichedDbMatches = dbMatches
                    .filter((m: any) => {
                        // Skip if already present from FlashScore
                        if (existingIds.has(m.id)) return false;
                        // Allow all manually created matches to appear by default, regardless of tournament status.
                        // (Alternatively, we could filter by ['published', 'active', 'draft'])
                        // We will just not restrict by tournament status for now, as manual matches are explicitly created by the admin.
                        // Filter by sport if provided
                        if (sportVariants && m.tournament?.sport) {
                            return sportVariants.includes(m.tournament.sport.toLowerCase());
                        }
                        // If match has no tournament or no sport assigned, always include it
                        // (these are likely friendlies or matches created without tournament link)
                        return true;
                    })
                    .map((m: any) => {
                        const { localTime } = toLocalMatch(m.date_time, timeZone);
                        return {
                            id: m.id,
                            tournamentId: m.tournament_id,
                            dateTime: m.date_time,
                            time: localTime,
                            status: m.status || 'scheduled',
                            score: m.score || { home: 0, away: 0 },
                            clock: {
                                running: m.status === 'live',
                                seconds: 0,
                                period: m.status === 'live' ? 'En Vivo' : (m.status === 'final' ? 'Final' : '1T')
                            },
                            roundId: m.round_label || 'General',
                            venue: m.venue || 'Sede',
                            homeClubId: m.home_club_id,
                            awayClubId: m.away_club_id,
                            homeTeam: m.home_team ? {
                                id: m.home_team.id,
                                name: m.home_team.name,
                                logo: m.home_team.logo_url || '',
                                shortName: m.home_team.short_name || m.home_team.name?.substring(0, 3).toUpperCase() || 'LOC'
                            } : {
                                id: m.home_club_id,
                                name: 'Local',
                                logo: '',
                                shortName: 'LOC'
                            },
                            awayTeam: m.away_team ? {
                                id: m.away_team.id,
                                name: m.away_team.name,
                                logo: m.away_team.logo_url || '',
                                shortName: m.away_team.short_name || m.away_team.name?.substring(0, 3).toUpperCase() || 'VIS'
                            } : {
                                id: m.away_club_id,
                                name: 'Visitante',
                                logo: '',
                                shortName: 'VIS'
                            },
                            tournament: m.tournament ? {
                                id: m.tournament.id,
                                name: m.tournament.name,
                                sport: m.tournament.sport || (sport || 'rugby'),
                                status: m.tournament.status || 'published',
                                country: (m.tournament as any).union?.country || 'Internacional'
                            } : {
                                id: m.tournament_id || 'db-local',
                                name: 'Partido Local',
                                sport: sport || 'rugby',
                                status: 'published',
                                country: 'Internacional'
                            },
                            liveEnabled: m.live_enabled || false,
                            source: 'db' // Mark as database-sourced
                        };
                    });

                enrichedMatches = [...enrichedMatches, ...enrichedDbMatches];
                dbOk = true;
                dbCount = enrichedDbMatches.length;
                console.log(`[matches] Supabase: ${dbCount} matches (fallback=${dbFallback})`);
            }
        } catch (dbFetchError) {
            console.error('Supabase DB matches fetch failed (non-fatal):', dbFetchError);
            // Non-fatal: FlashScore data still available
        }

        // ─── Date Filter ─────────────────────────────────────────────────────
        // Always use timezone-aware comparison so that
        // e.g. 00:00 UTC correctly maps to 21:00 previous day in UTC-3.
        if (date) {
            enrichedMatches = enrichedMatches.filter(m => {
                const dt = new Date(m.dateTime);
                if (Number.isNaN(dt.getTime())) return false;
                return formatDateKey(dt, timeZone) === date;
            });
        }

        // Final sort by date_time
        enrichedMatches.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

        console.log(`[matches] Final after filter (${date ?? 'no-date'}): ${enrichedMatches.length} total (fs=${fsCount}, db=${dbCount})`);

        return NextResponse.json({
            data: enrichedMatches,
            sources: {
                flashscore: { ok: fsOk, count: fsCount },
                supabase: { ok: dbOk, count: dbCount, fallback: dbFallback }
            }
        });
    } catch (error) {
        console.error('Fatal API Error [GET /api/matches]:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
    }
}


// POST /api/matches
// Create a new match
export async function POST(request: Request) {
    try {
        const { createClient } = await import('@/lib/supabase/server');
        const supabase = await createClient();

        // Check authentication
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const {
            tournamentId,
            phaseId,
            roundId,
            homeClubId,
            awayClubId,
            homeSquadId,
            awaySquadId,
            dateTime,
            venue,
            city,
            isNeutralVenue,
            address,
            referee,
            status,
            isPublic,
            isFeatured,
            notes,
        } = body;

        // Validate required fields
        if (!homeClubId || !awayClubId) {
            return NextResponse.json(
                { error: 'Home and away clubs are required' },
                { status: 400 }
            );
        }

        if (homeClubId === awayClubId) {
            return NextResponse.json(
                { error: 'Home and away clubs must be different' },
                { status: 400 }
            );
        }

        if (!dateTime) {
            return NextResponse.json({ error: 'Date and time are required' }, { status: 400 });
        }

        if (!venue) {
            return NextResponse.json({ error: 'Venue is required' }, { status: 400 });
        }

        // Get tournament_id if roundId is provided
        let finalTournamentId = tournamentId;
        if (roundId && !finalTournamentId) {
            const { data: round } = await supabase
                .from('tournament_rounds')
                .select('phase_id, tournament_phases(tournament_id)')
                .eq('id', roundId)
                .single();

            if (round && round.tournament_phases) {
                finalTournamentId = (round.tournament_phases as any).tournament_id;
            }
        }

        // Helper to check if string is valid UUID
        const isValidUUID = (id: string | null) => {
            if (!id) return false;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return uuidRegex.test(id);
        };

        const isRoundUUID = isValidUUID(roundId);
        const isPhaseUUID = isValidUUID(phaseId);

        // Insert match
        // Only include columns that are confirmed in the database schema
        const matchPayload: any = {
            tournament_id: finalTournamentId || null,
            round_id: roundId || null,
            home_club_id: homeClubId,
            away_club_id: awayClubId,
            date_time: dateTime,
            venue,
            status: status || 'scheduled',
            score: { home: 0, away: 0 },
            live_enabled: false,
            notes: notes || null,
            stream_url: body.streamUrl || null,
            replay_url: body.replayUrl || null,
            round_label: body.roundLabel || null,
        };

        // Note: The following columns were removed because they are not currently in the DB schema:
        // phase_id, city, address, is_neutral_venue, home_squad_id, away_squad_id, is_public, is_featured, referee

        const { data: match, error: insertError } = await supabase
            .from('matches')
            .insert(matchPayload)
            .select('id, notes, stream_url, replay_url')
            .single();

        if (insertError) {
            console.error('Error creating match:', insertError);
            return NextResponse.json(
                { error: 'Failed to create match', details: insertError.message },
                { status: 500 }
            );
        }

        return NextResponse.json(match, { status: 201 });
    } catch (error) {
        console.error('Unexpected error creating match:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}


