import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import { getFlashScoreMatches, getFlashScoreLiveMatches } from '@/lib/services/flashscore';
import { persistFromExternalMatches } from '@/lib/sync/catalog';
import { formatDateKey, canonicalizeTimezone, toLocalMatch } from '@/lib/timezone';
import { createClient } from '@/lib/supabase/server';
import { getCountryById } from '@/lib/data/countries';
import {
    getMatchesForDate,
    getLiveMatches,
    mapCachedToEnrichedMatch
} from '@/lib/services/externalMatchCache';

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

function resolveTournamentCountry(tournament: any): string {
    const relationCountry = tournament?.country?.nameEs || tournament?.country?.name || null;
    if (relationCountry) return relationCountry;

    const countryId = tournament?.country_id;
    if (typeof countryId === 'string' && countryId.trim()) {
        const mapped = getCountryById(countryId.trim().toLowerCase());
        if (mapped?.nameEs) return mapped.nameEs;
        if (mapped?.name) return mapped.name;
        return countryId;
    }

    if (typeof tournament?.union?.country === 'string' && tournament.union.country.trim()) {
        return tournament.union.country;
    }

    return 'Internacional';
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
                            id, date_time, round_label, venue, status, score,
                            tournament_id, home_club_id, away_club_id, notes,
                            tournament:tournaments(id, name, sport_id, season_id, status, country_id, union:unions(id, name, country)),
                            home_team:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, primary_color),
                            away_team:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, primary_color)
                        `)
                        .eq('status', 'live');

                    if (!dbError && dbLiveMatches) {
                        const sportVariants = getSportVariants(sport);
                        const enrichedDbLive = dbLiveMatches.filter((m: any) => {
                            if (m.tournament && m.tournament.status && !['published', 'active'].includes(m.tournament.status)) return false;
                            if (sportVariants && m.tournament?.sport_id) {
                                return sportVariants.includes(m.tournament.sport_id.toLowerCase());
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
                                score: m.status === 'scheduled' ? null : (m.score ?? null),
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
                                    sport: m.tournament.sport_id || sport,
                                    status: m.tournament.status || 'published',
                                    country: resolveTournamentCountry(m.tournament)
                                } : { id: m.tournament_id || 'db-local', name: 'Partido Local', sport, status: 'published', country: 'Internacional' },
                                liveEnabled: m.status === 'live',
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
                console.error('Live-only fetch failed, trying external_match_cache:', e);
                try {
                    const supabase = await createClient();
                    const cachedLive = await getLiveMatches(sport, supabase);
                    const enriched = cachedLive.map(m => mapCachedToEnrichedMatch(m, sport));
                    return NextResponse.json({
                        data: enriched,
                        sources: { flashscore: { ok: false, count: 0, fromCache: cachedLive.length > 0 } }
                    });
                } catch {
                    return NextResponse.json({ data: [] });
                }
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
        let fsOk = false, fsCount = 0, fsFromCache = false;
        let dbOk = false, dbCount = 0, dbFallback = false;
        let fsReason: string | null = null;
        let fsMessage: string | null = null;
        let dbReason: string | null = null;
        let dbMessage: string | null = null;

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

                // Track whether FlashScore API actually failed (vs returned 0 results)
                let fsFetchFailed = false;

                // Parallel fetch if today, otherwise just list
                let [externalMatches, liveMatches] = await Promise.all([
                    getFlashScoreMatches(localDate, sport || 'rugby', {
                        timeZone,
                        targetDateKey: date || undefined
                    }).catch(e => {
                        console.warn('[matches] FlashScore fetch failed - trying cache', e?.message);
                        fsFetchFailed = true;
                        fsReason = 'flashscore_fetch_failed';
                        fsMessage = 'No se pudieron cargar los partidos desde FlashScore.';
                        return [];
                    }),
                    isToday ? getFlashScoreLiveMatches(sport || 'rugby').catch(e => {
                        console.warn('[matches] FlashScore live fetch failed', e?.message);
                        return [];
                    }) : Promise.resolve([])
                ]);

                // ── Cache fallback when FlashScore is unavailable ─────────────
                if (fsFetchFailed) {
                    try {
                        const supabaseForCache = await createClient();
                        const cached = await getMatchesForDate(date, sport || 'rugby', supabaseForCache);
                        if (cached.length > 0) {
                            const fromCache = cached.map(m => mapCachedToEnrichedMatch(m, sport || 'rugby'));
                            enrichedMatches = [...enrichedMatches, ...fromCache];
                            fsOk = false;
                            fsFromCache = true;
                            fsCount = fromCache.length;
                            fsReason = 'flashscore_cache_fallback';
                            fsMessage = 'Datos de FlashScore desde caché; puede haber un leve retraso.';
                            console.log(`[matches] FlashScore cache fallback: ${fsCount} matches for date=${date}`);
                        }
                    } catch (cacheErr) {
                        console.warn('[matches] Cache fallback also failed:', cacheErr);
                    }
                    // Skip the rest of the FlashScore enrichment path
                }

                if (!fsFetchFailed) {
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
                    } catch {
                        console.warn('Date conversion failed for match', m.id);
                    }

                    return {
                        id: m.id,
                        tournamentId: m.tournamentId,
                        dateTime: dateStr,
                        status: (m.status === 'final' ? 'final' : m.status === 'live' ? 'live' : 'scheduled') as any,
                        score: m.status === 'scheduled' ? null : (m.score ?? null),
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
                fsReason = fsCount === 0 ? 'empty_result' : null;
                fsMessage = fsCount === 0 ? 'No hay partidos de FlashScore para este filtro.' : null;
                console.log(`[matches] FlashScore: ${fsCount} matches for date=${date}`);

                if (externalMatches && externalMatches.length > 0) {
                    persistFromExternalMatches(externalMatches, sport || 'rugby');
                }
                } // end if (!fsFetchFailed)
            } catch (e) {
                console.error('External section processing failed:', e);
                fsReason = 'flashscore_processing_failed';
                fsMessage = 'No se pudo procesar la respuesta de FlashScore.';
            }
        }

        // ─── Supabase DB Matches ─────────────────────────────────────────────
        // Always fetch matches stored in the database (created via admin panel)
        // and merge them with external (FlashScore) matches.
        try {
            const supabase = await createClient();

            // Build the base query for the selected date
            const { localStart, localEnd } = (() => {
                // date is YYYY-MM-DD. We want the full range of that day in UTC for the DB query.
                // However, since we use TIMESTAMPTZ, comparing with string dates works well if they include the offset.
                // For simplicity, we use the date as-is which PostgreSQL interprets relative to UTC if no offset.
                return {
                    localStart: `${date}T00:00:00Z`,
                    localEnd: `${date}T23:59:59Z`
                };
            })();

            // Filter by sport through tournament relationship
            const sportVariants = sport ? getSportVariants(sport) : null;

            // Attempt 1: named FK joins (works when FK constraint names are stable)
            const query = supabase
                .from('matches')
                .select(`
                    id, date_time, round_label, venue, status, score,
                    tournament_id, home_club_id, away_club_id, notes,
                    tournament:tournaments!inner(id, name, sport_id, season_id, status, country_id, union:unions(id, name, country)),
                    home_team:clubs!matches_home_club_id_fkey(id, name, short_name, logo_url, primary_color),
                    away_team:clubs!matches_away_club_id_fkey(id, name, short_name, logo_url, primary_color)
                `)
                .gte('date_time', localStart)
                .lte('date_time', localEnd)
                .order('date_time', { ascending: true });

            let { data: dbMatches, error: dbError } = await query;

            // Attempt 2: if FK names changed, fall back to manual join but KEEP FILTERS
            if (dbError && /fkey|relationship|foreign/i.test(dbError.message)) {
                dbFallback = true;
                console.warn('[matches] FK join failed, falling back to manual club join:', dbError.message);

                const mQuery = supabase.from('matches').select(`
                        id, date_time, round_label, venue, status, score,
                        tournament_id, home_club_id, away_club_id, notes,
                        tournament:tournaments!inner(id, name, sport_id, season_id, status, country_id)
                    `)
                    .gte('date_time', localStart)
                    .lte('date_time', localEnd)
                    .order('date_time', { ascending: true });

                const [mRes, cRes] = await Promise.all([
                    mQuery,
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

            // Post-process sport filter (more reliable than embedded-resource .in() in PostgREST)
            if (!dbError && dbMatches && sportVariants) {
                dbMatches = dbMatches.filter((m: any) =>
                    sportVariants.includes(m.tournament?.sport_id) || sportVariants.includes(m.tournament?.sport)
                );
            }

            if (!dbError && dbMatches) {
                dbOk = true;
                const existingIds = new Set(enrichedMatches.map((m: any) => m.id));

                const enrichedDbMatches = dbMatches
                    .filter((m: any) => !existingIds.has(m.id))
                    .map((m: any) => {
                        const { localTime } = toLocalMatch(m.date_time, timeZone);
                        return {
                            id: m.id,
                            tournamentId: m.tournament_id,
                            dateTime: m.date_time,
                            time: localTime,
                            status: m.status || 'scheduled',
                            score: m.status === 'scheduled' ? null : (m.score ?? null),
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
                                sport: m.tournament.sport_id || m.tournament.sport || (sport || 'rugby'),
                                status: m.tournament.status || 'published',
                                country: resolveTournamentCountry(m.tournament)
                            } : {
                                id: m.tournament_id || 'db-local',
                                name: 'Partido Local',
                                sport: sport || 'rugby',
                                status: 'published',
                                country: 'Internacional'
                            },
                            liveEnabled: false,
                            source: 'db' // Mark as database-sourced
                        };
                    });

                enrichedMatches = [...enrichedMatches, ...enrichedDbMatches];
                dbCount = enrichedDbMatches.length;
                dbReason = dbCount === 0 ? 'empty_result' : null;
                dbMessage = dbCount === 0 ? 'No hay partidos en base de datos para este filtro.' : null;
                console.log(`[matches] Supabase: ${dbCount} matches (fallback=${dbFallback})`);
            } else if (dbError) {
                dbReason = 'database_query_failed';
                dbMessage = 'No se pudieron cargar los partidos desde la base de datos.';
                console.error('[matches] Supabase query failed:', JSON.stringify(dbError));
                if (process.env.NODE_ENV === 'development') {
                    dbMessage = `Supabase error: ${dbError.message} | code: ${dbError.code} | details: ${dbError.details}`;
                }
            }
        } catch (dbFetchError) {
            console.error('Supabase DB matches fetch failed (non-fatal):', dbFetchError);
            dbReason = 'database_fetch_failed';
            dbMessage = 'No se pudieron cargar los partidos desde la base de datos.';
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
                flashscore: { ok: fsOk, count: fsCount, fromCache: fsFromCache, reason: fsReason, message: fsMessage },
                supabase: { ok: dbOk, count: dbCount, fallback: dbFallback, reason: dbReason, message: dbMessage }
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
            dateTime,
            venue,
            status,
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


