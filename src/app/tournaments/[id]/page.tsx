'use client';

import React, { use, useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { getTournamentById } from '@/lib/data/tournaments';
import { ArrowLeft, Calendar, Trophy, Users, ChevronRight, Share2, MapPin } from 'lucide-react';
import ExportImage from '@/components/ExportImage';
import { useFavorites } from '@/hooks/useFavorites';
import { setCachedLogo } from '@/lib/utils/logoCache';
import PlayoffBracket from '@/components/PlayoffBracket';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import { getCountryById } from '@/lib/data/countries';

// Tabs
const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'standings', label: 'Clasificación' },
    { id: 'playoff', label: 'Playoff' },
    { id: 'teams', label: 'Equipos' },
    { id: 'stats', label: 'Estadísticas' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function getTeamLogo(team: any): string {
    if (!team) return '';
    return team.small_image_path || team.smaill_image_path || team.image_path || team.logo || team.logo_path || '';
}

function getTournamentLogo(detailsData: any, localData: any): string {
    if (detailsData) {
        return (
            detailsData.image_path ||
            detailsData.logo ||
            detailsData.logo_path ||
            detailsData.tournament_logo ||
            detailsData.tournament_image_path ||
            ''
        );
    }
    return localData?.logoUrl || '';
}

/**
 * Format a scheduled match date/time for the mobile score box.
 * Returns "Hoy • HH:MM", "Mañana • HH:MM", or "Sáb 28 feb • HH:MM".
 */
function formatMatchSchedule(date: Date | null): string {
    if (!date) return 'VS';
    const now = new Date();
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowDay  = new Date(now.getFullYear(),  now.getMonth(),  now.getDate());
    const diffDays = Math.round((dateDay.getTime() - nowDay.getTime()) / 86_400_000);
    const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (diffDays === 0) return `Hoy • ${timeStr}`;
    if (diffDays === 1) return `Mañana • ${timeStr}`;
    const dayName  = date.toLocaleDateString('es-AR', { weekday: 'short' });
    const dayMonth = date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    // Capitalise first letter of weekday abbrev ("sáb" → "Sáb")
    const dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1).replace('.', '');
    return `${dayLabel} ${dayMonth} • ${timeStr}`;
}

/** Pick the most relevant match to feature: live > next scheduled > last result */
function getFeaturedMatch(results: any[], fixtures: any[]): { match: any; isResult: boolean } | null {
    const all = [...results, ...fixtures];
    const live = all.find(m => m.status === 'live' || m.status === 'in_play');
    if (live) return { match: live, isResult: true };
    if (fixtures.length > 0) return { match: fixtures[0], isResult: false };
    if (results.length > 0) return { match: results[0], isResult: true };
    return null;
}

/** Derive tournament status label from available data */
function getTournamentStatus(details: any): 'active' | 'upcoming' | 'finished' {
    if (!details) return 'active';
    if (details.is_current === true) return 'active';
    if (details.is_current === false) return 'finished';
    return 'active';
}

/** Compute quick stats from available data */
function getQuickStats(
    results: any[],
    fixtures: any[],
    overallRows: any[],
    teamsCount: number,
) {
    const played = results.length;
    const upcoming = fixtures.length;
    const teams = teamsCount || overallRows.length;

    // Leader
    let leaderName = '—';
    if (overallRows.length > 0) {
        const firstRow = overallRows[0]?.rows ? overallRows[0].rows[0] : overallRows[0];
        if (firstRow) {
            leaderName = firstRow.team?.name || firstRow.participant?.name || firstRow.name || '—';
        }
    }

    // Next match date
    let nextDate = '—';
    if (fixtures.length > 0) {
        const ts = fixtures[0].timestamp || fixtures[0].start_time || fixtures[0].time;
        if (ts) {
            nextDate = new Date(ts * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        }
    }

    return { played, upcoming, teams, leaderName, nextDate };
}

function hexToRgba(color: string, alpha: number) {
    const normalized = color.trim();
    const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;

    if (/^[0-9a-f]{3}$/i.test(hex)) {
        const [r, g, b] = hex.split('').map((char) => parseInt(char + char, 16));
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    if (/^[0-9a-f]{6}$/i.test(hex)) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const rgbMatch = normalized.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
    if (rgbMatch) {
        return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }

    return normalized;
}

function buildRowAccentStyle(color?: string | null): CSSProperties | undefined {
    if (!color) return undefined;
    return {
        '--standings-row-accent': color,
        '--standings-row-bg': hexToRgba(color, 0.14),
        '--standings-row-bg-strong': hexToRgba(color, 0.2),
    } as CSSProperties;
}

function getAutoZoneColor(
    position: number,
    totalTeams: number,
    qualRules: any,
    groupLabels: any[],
): string | null {
    if (!qualRules || !Array.isArray(groupLabels) || groupLabels.length === 0) return null;
    const status = StandingsEngine.resolveStatus(position, totalTeams, qualRules);
    if (!status) return null;
    const label = groupLabels.find((l: any) => l.name === status);
    return label?.color ?? null;
}

function resolveStandingsRowLabel(row: any, assignments: any[]) {
    const teamId = row.team?.id || row.team?.team_id || row.participant?.id || row.team_id || null;
    if (!teamId) return null;

    const phaseId = row.phase_id ?? null;
    const groupId = row.group_id ?? null;

    const priority = (assignment: any) => {
        if (assignment.phase_id === phaseId && assignment.group_id === groupId) return 4;
        if (assignment.phase_id === phaseId && !assignment.group_id) return 3;
        if (!assignment.phase_id && !assignment.group_id) return 2;
        if (assignment.phase_id === phaseId) return 1;
        return 0;
    };

    return assignments
        .filter((assignment) => assignment.club_id === teamId && assignment.label?.color)
        .sort((left, right) => priority(right) - priority(left))[0]?.label || null;
}

function isGroupedStandingsData(rows: any[]): boolean {
    return Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0]?.rows);
}

function normalizeStandingsRows(raw: any[]): any[] {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (isGroupedStandingsData(raw)) return raw;
    if (raw[0]?.team_id || raw[0]?.participant || raw[0]?.name || raw[0]?.team) return raw;
    return [];
}

function flattenStandingsRows(raw: any[]): any[] {
    const normalized = normalizeStandingsRows(raw);
    if (normalized.length === 0) return [];
    if (isGroupedStandingsData(normalized)) {
        return normalized.flatMap((group: any) => Array.isArray(group.rows) ? group.rows : []);
    }
    return normalized;
}

function buildGroupedStandings(dbStandings: any[], dbGroups: any[], participants: any[]) {
    if (!Array.isArray(dbGroups) || dbGroups.length === 0) return [];

    const participantGroupByClubId = new Map<string, string>();
    participants.forEach((participant: any) => {
        if (participant?.club_id && participant?.group_id) {
            participantGroupByClubId.set(String(participant.club_id), String(participant.group_id));
        }
    });

    const groupPhaseById = new Map<string, string>();
    dbGroups.forEach((group: any) => {
        if (group?.id && group?.phase_id) {
            groupPhaseById.set(String(group.id), String(group.phase_id));
        }
    });

    const resolveTeamId = (row: any) =>
        row.team?.id || row.club_id || row.team_id || row.participant?.id || null;

    const resolveGroupId = (row: any) => {
        if (row.group_id) return String(row.group_id);
        const teamId = resolveTeamId(row);
        if (!teamId) return null;
        return participantGroupByClubId.get(String(teamId)) || null;
    };

    const grouped = [...dbGroups]
        .sort((left: any, right: any) => {
            const leftOrder = typeof left?.order_index === 'number' ? left.order_index : Number.MAX_SAFE_INTEGER;
            const rightOrder = typeof right?.order_index === 'number' ? right.order_index : Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return String(left?.name || '').localeCompare(String(right?.name || ''));
        })
        .map((group: any) => {
            const groupId = String(group.id);
            const rows = dbStandings
                .filter((row: any) => {
                    const effectiveGroupId = resolveGroupId(row);
                    if (effectiveGroupId !== groupId) return false;

                    const rowPhaseId = row.phase_id ? String(row.phase_id) : null;
                    const groupPhaseId = groupPhaseById.get(groupId) || null;
                    if (rowPhaseId && groupPhaseId && rowPhaseId !== groupPhaseId) return false;

                    return true;
                })
                .sort((left: any, right: any) => (left.position || 0) - (right.position || 0));

            return {
                group_name: group.name,
                rows,
            };
        })
        .filter((group: any) => group.rows.length > 0);

    if (grouped.length > 0) return grouped;

    if (dbGroups.length === 1 && dbStandings.length > 0) {
        return [{
            group_name: dbGroups[0].name,
            rows: [...dbStandings].sort((left: any, right: any) => (left.position || 0) - (right.position || 0)),
        }];
    }

    return [];
}

function resolveCountryName(detailsData: any, tournamentData: any): string {
    const detailsCountry = detailsData?.country?.name || detailsData?.country || detailsData?.country_name;
    if (detailsCountry) return detailsCountry;

    const tournamentCountryId = tournamentData?.countryId || tournamentData?.country_id || null;
    if (typeof tournamentCountryId === 'string' && tournamentCountryId.trim()) {
        const normalizedId = tournamentCountryId.trim().toLowerCase();
        const mappedCountry = getCountryById(normalizedId);
        if (mappedCountry?.nameEs) return mappedCountry.nameEs;
        if (mappedCountry?.name) return mappedCountry.name;
        return tournamentCountryId;
    }

    return 'Internacional';
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { isLeagueFavorite, toggleLeagueFavorite } = useFavorites();

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [tournamentData, setTournamentData] = useState<any>(null);
    const [standings, setStandings] = useState<any[]>([]);
    const [standingsForm, setStandingsForm] = useState<any[]>([]);
    const [standingsHtFt, setStandingsHtFt] = useState<any[]>([]);
    const [standingsOverUnder, setStandingsOverUnder] = useState<any[]>([]);
    const [archives, setArchives] = useState<any[]>([]);
    const [results, setResults] = useState<any[]>([]);
    const [fixtures, setFixtures] = useState<any[]>([]);
    const [details, setDetails] = useState<any>(null);
    const [topScorers, setTopScorers] = useState<any[]>([]);
    const [draw, setDraw] = useState<any[]>([]);
    const [standingsView, setStandingsView] = useState<'overall' | 'form' | 'htft' | 'overunder'>('overall');
    const [dbParticipants, setDbParticipants] = useState<any[]>([]);
    const [dbPhases, setDbPhases] = useState<any[]>([]);
    const [dbGroups, setDbGroups] = useState<any[]>([]);
    const [dbTeamLabels, setDbTeamLabels] = useState<any[]>([]);

    // ── Data fetch ────────────────────────────────────────────────────────

    useEffect(() => {
        const controller = new AbortController();

        async function fetchData() {
            setLoading(true);
            let localTournament: any = null;
            try {
                const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
                const overrideSport = sp.get('sport') || undefined;
                const overrideTournamentId = sp.get('tournament_id') || sp.get('tournamentId');
                const overrideStageId = sp.get('tournament_stage_id') || sp.get('tournamentStageId') || sp.get('stageId');
                const urlParam = sp.get('url');

                const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                localTournament = getTournamentById(id);

                if (!localTournament) {
                    if (id.toLowerCase().startsWith('fs-')) {
                        localTournament = {
                            id,
                            name: 'Cargando...',
                            url: '',
                            type: 'cup' as any,
                            sportId: (overrideSport || 'rugby') as any,
                            countryId: 'international',
                            categories: [],
                            priority: 0,
                        } as any;
                    } else if (UUID_RE.test(id)) {
                        // UUID → DB-only tournament. Skip metadata round-trip;
                        // metadata will be included in the /data response below.
                        localTournament = {
                            id,
                            name: 'Cargando...',
                            url: '',
                            type: 'league' as any,
                            sportId: (overrideSport || 'rugby') as any,
                            countryId: 'international',
                            categories: [],
                            priority: 0,
                            __isDbOnly: true,
                        } as any;
                    } else {
                        if (!controller.signal.aborted) {
                            setError('Torneo no encontrado en nuestra base de datos.');
                            setLoading(false);
                        }
                        return;
                    }
                }

                if (!controller.signal.aborted) setTournamentData(localTournament);

                // ── DB-only path (manually created tournaments) ───────────
                if ((localTournament as any)?.__isDbOnly) {
                    const dbDataRes = await fetch(`/api/db/tournaments/${id}/data`, { signal: controller.signal });
                    if (dbDataRes.ok) {
                        const dbData = await dbDataRes.json();
                        console.log('[FRONTEND] payload recibido desde API (DB-only):', dbData);
                        
                        if (dbData.ok) {
                            // Update tournament metadata from the /data response
                            if (dbData.tournament) {
                                const t = dbData.tournament;
                                const enriched = {
                                    ...localTournament,
                                    name: t.display_name || t.name || localTournament.name,
                                    sportId: t.sport_id || localTournament.sportId,
                                    countryId: t.country_id || localTournament.countryId,
                                    logoUrl: t.logo_url || localTournament.logoUrl,
                                };
                                if (!controller.signal.aborted) setTournamentData(enriched);
                            }

                            setDbParticipants(dbData.participants ?? []);
                            setDbPhases(dbData.phases ?? []);
                            setDbGroups(dbData.groups ?? []);
                            setDbTeamLabels(dbData.teamLabels ?? []);

                            // Map DB matches → frontend match format
                            const mapMatch = (m: any) => ({
                                match_id: m.id,
                                timestamp: Math.floor(new Date(m.date_time).getTime() / 1000),
                                // StandingsEngine uses 'final', frontend components use 'finished'
                                status: (m.status === 'final' || m.status === 'finished') ? 'finished' : (m.status ?? 'scheduled'),
                                scores: m.score ?? { home: null, away: null },
                                home_team: { name: m.home?.name ?? '', logo: m.home?.logo_url ?? '' },
                                away_team: { name: m.away?.name ?? '', logo: m.away?.logo_url ?? '' },
                                home_club_id: m.home_club_id,
                                away_club_id: m.away_club_id,
                                phase_id: m.phase_id,
                                group_id: m.group_id,
                                round_label: m.round_label,
                                venue: m.venue,
                            });
                            const allMatches: any[] = (dbData.matches ?? []).map(mapMatch);
                            setResults(allMatches.filter((m: any) => m.status === 'finished'));
                            setFixtures(allMatches.filter((m: any) => m.status !== 'finished'));

                            // Map DB standings → frontend standings format
                            const mapDbStanding = (row: any) => ({
                                position: row.position,
                                team: {
                                    name: row.club?.name ?? row.stats?.team_name ?? '',
                                    logo: row.club?.logo_url ?? row.stats?.team_logo ?? '',
                                    id: row.club_id,
                                },
                                matches_total: row.played,
                                wins_total: row.won,
                                draws_total: row.drawn,
                                losses_total: row.lost,
                                goals_for: row.scored,
                                goals_against: row.conceded,
                                goal_difference: row.stats?.difference ?? (row.scored - row.conceded),
                                points_total: row.points,
                                bonus_points: row.bonus_points,
                                form: row.form,
                                phase_id: row.phase_id,
                                group_id: row.group_id,
                            });

                            let dbStandings = (dbData.standings ?? []).map(mapDbStanding);
                            console.log('[FRONTEND] initial dbStandings count:', dbStandings.length);

                            // Fallback Calculation if no standings are persisted
                            if (dbStandings.length === 0 && (dbData.participants?.length > 0)) {
                                console.log('[FRONTEND] Triggering on-the-fly standings calculation fallback');
                                const activePhase = dbData.phases?.[0];
                                const rules = StandingsEngine.resolveRules(activePhase?.settings ?? {}, {});
                                
                                // Ensure participants have 'clubs' property for Engine
                                const engineParticipants = dbData.participants.map((p: any) => ({
                                    ...p,
                                    clubs: p.clubs || p.club // support both plural and singular from API
                                }));

                                const calculated = StandingsEngine.generateTable(
                                    engineParticipants,
                                    dbData.matches.filter((m: any) => m.status === 'final' || m.status === 'finished'),
                                    rules
                                );
                                
                                console.log('[FRONTEND] Calculated standings rows:', calculated.length);
                                
                                dbStandings = calculated.map(row => {
                                    // Find participant to recover group_id
                                    const part = dbData.participants.find((p: any) => p.club_id === row.teamId || p.id === row.participantId);
                                    return {
                                        position: row.position,
                                        team: {
                                            name: row.team.name,
                                            logo: row.team.logo,
                                            id: row.teamId
                                        },
                                        matches_total: row.played,
                                        wins_total: row.won,
                                        draws_total: row.drawn,
                                        losses_total: row.lost,
                                        goals_for: row.points_for,
                                        goals_against: row.points_against,
                                        goal_difference: row.difference,
                                        points_total: row.total_points,
                                        form: row.form,
                                        group_id: part?.group_id || null, // CRITICAL: preserve group_id for filtering
                                        phase_id: activePhase?.id || null
                                    };
                                });
                            }

                            console.log('[FRONTEND] mappedStandings count:', dbStandings.length);
                            if (dbStandings.length > 0) {
                                console.log('[FRONTEND] mappedStandings sample row:', JSON.stringify(dbStandings[0], null, 2));
                            }

                            // Grouping Logic for Standings
                            if (dbData.groups?.length > 0) {
                                console.log('[FRONTEND] Processing grouped standings for', dbData.groups.length, 'groups');
                                const grouped = buildGroupedStandings(
                                    dbStandings,
                                    dbData.groups ?? [],
                                    dbData.participants ?? [],
                                );

                                console.log('[FRONTEND] final rows passed to standings component (grouped):', grouped.length, 'groups');
                                if (grouped.length > 0) {
                                    setStandings(grouped);
                                } else {
                                    console.log('[FRONTEND] condition that triggers empty state: grouped.length === 0');
                                    setStandings(dbStandings);
                                }
                            } else {
                                console.log('[FRONTEND] final rows passed to standings component (flat):', dbStandings.length);
                                setStandings(dbStandings);
                            }
                        }
                    } else {
                        console.error('[FRONTEND] Error fetching dbData:', dbDataRes.status);
                    }
                    return; // Skip FlashScore for DB-only tournaments
                }

                const finalUrl = localTournament?.url || urlParam;
                const query = new URLSearchParams();
                query.set('id', id);
                if (finalUrl) query.set('url', finalUrl);
                if (localTournament?.sportId) query.set('sport', localTournament.sportId);
                if (overrideTournamentId) query.set('tournament_id', overrideTournamentId);
                if (overrideStageId) query.set('tournament_stage_id', overrideStageId);

                const res = await fetch(`/api/tournaments?${query.toString()}`, {
                    cache: 'no-store',
                    signal: controller.signal,
                });

                if (!res.ok) throw new Error(res.statusText);

                const payload = await res.json();
                console.log('TOURNAMENT API PAYLOAD:', payload);
                if (controller.signal.aborted) return;

                if (!res.ok || !payload?.ok) {
                    if ((localTournament as any).__isDbOnly) {
                        // DB-only tournament has no FlashScore data — render with empty sections
                    } else {
                        setError(payload?.error || 'No se pudo conectar con la fuente de datos externa.');
                        return;
                    }
                }

                if (payload.details) {
                    setDetails(payload.details);
                    const discoveredLogo =
                        payload.details.image_path ||
                        payload.details.logo ||
                        payload.details.logo_path ||
                        payload.details.tournament_logo ||
                        payload.details.tournament_image_path;
                    if (discoveredLogo) setCachedLogo(id, discoveredLogo);

                    const detailsName =
                        payload.details?.name ||
                        payload.details?.tournament?.name ||
                        payload.details?.tournament_name ||
                        payload.details?.league_name ||
                        payload.details?.competition?.name;
                    if (detailsName) {
                        setTournamentData((prev: any) => prev ? { ...prev, name: detailsName } : prev);
                    }
                }

                setResults(payload.results || []);
                setFixtures(payload.fixtures || []);
                setStandings(payload.standings || []);
                setTopScorers(payload.topScorers || []);
                setStandingsForm(payload.standingsForm || []);
                setStandingsHtFt(payload.standingsHtFt || []);
                setStandingsOverUnder(payload.standingsOverUnder || []);
                setDraw(payload.draw || []);
                setArchives(payload.archives || []);
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                console.error('Error fetching tournament data:', err);
                // For DB-only tournaments the external API may not have data — don't replace the tournament with an error
                if (!controller.signal.aborted && !(localTournament as any)?.__isDbOnly) {
                    setError('Error al cargar datos del torneo.');
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        fetchData();
        return () => controller.abort();
    }, [id]);

    // ── Loading / Error ────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Cargando torneo...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p>{error}</p>
                <div className={styles.backButton} onClick={() => router.push('/')}>
                    <ArrowLeft size={16} /> Volver al Inicio
                </div>
            </div>
        );
    }

    // ── Derived data ──────────────────────────────────────────────────────

    const overallRows = flattenStandingsRows(standings);
    const standingsSource =
        standingsView === 'form' ? standingsForm :
            standingsView === 'htft' ? standingsHtFt :
                standingsView === 'overunder' ? standingsOverUnder :
                    standings;
    const activeRows = normalizeStandingsRows(standingsSource);
    const activeFlatRows = flattenStandingsRows(standingsSource);

    const resolvedQualRules = (() => {
        try {
            return dbPhases.length > 0
                ? StandingsEngine.resolveRules(dbPhases[0].settings ?? {}, {}).qualification_rules
                : null;
        } catch { return null; }
    })();
    const phaseGroupLabels: any[] = (() => {
        try { return dbPhases[0]?.settings?.groupLabels ?? []; } catch { return []; }
    })();

    // Team map (for Teams tab)
    const teamMap = new Map<string, { name: string; logo: string }>();
    const addFromMatches = (list: any[]) => {
        list.forEach(match => {
            const homeName = match.home_team?.name || match.event_home_team || match.home_team_name;
            const awayName = match.away_team?.name || match.event_away_team || match.away_team_name;
            const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
            const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
            if (homeName) teamMap.set(homeName, { name: homeName, logo: homeLogo });
            if (awayName) teamMap.set(awayName, { name: awayName, logo: awayLogo });
        });
    };
    if (overallRows.length > 0) {
        overallRows.forEach((row: any) => {
            const name = row.team?.name || row.participant?.name || row.name;
            const logo = row.team?.logo || row.team?.image_path || row.team?.small_image_path ||
                row.participant?.image_path || row.participant?.small_image_path || row.logo || row.team_logo || '';
            if (name) teamMap.set(name, { name, logo });
        });
    }
    if (results.length > 0) addFromMatches(results);
    if (fixtures.length > 0) addFromMatches(fixtures);
    const teamsList = Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    const yearDisplay = details?.is_current
        ? (details?.season || 'Temporada Actual')
        : (details?.start_year && details?.end_year)
            ? `${details.start_year}/${details.end_year}`
            : (details?.season || new Date().getFullYear());

    const countryName = resolveCountryName(details, tournamentData);
    const tournamentLogo = getTournamentLogo(details, tournamentData);
    const tournamentName = details?.name || details?.tournament?.name || tournamentData?.name || 'Torneo';
    const sportLabel = tournamentData?.sportId ? tournamentData.sportId.charAt(0).toUpperCase() + tournamentData.sportId.slice(1) : '';

    // Quick stats
    const stats = getQuickStats(results, fixtures, overallRows, teamsList.length);

    // Status
    const tournamentStatus = getTournamentStatus(details);

    // Featured match
    const featured = getFeaturedMatch(results, fixtures);

    // Standings preview (top 8 flat rows only)
    const standingsPreviewRows: any[] = overallRows.slice(0, 8);

    // ── Render helpers ────────────────────────────────────────────────────

    const renderMatchItem = (match: any, isResult: boolean) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const timeStr = date ? date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const dateStr = date ? date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '';

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;
        const hasScore = scoreHome !== undefined && scoreHome !== null;

        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Local';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante';
        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';

        const homeWon = hasScore && typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreHome > scoreAway;
        const awayWon = hasScore && typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreAway > scoreHome;
        const isLive = match.status === 'live' || match.status === 'in_play';
        const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;

        return (
            <Link
                href={`/matches/${match.event_key || match.match_id || 'unknown'}`}
                key={match.event_key || match.match_id || Math.random()}
                className={styles.matchRow}
            >
                {/* Date / Time / Live */}
                <div className={styles.matchDate}>
                    {isLive ? (
                        <span className={styles.matchLive}>
                            <span className={styles.matchLiveDot} />
                            {match.minute || 'Live'}
                        </span>
                    ) : (
                        <>
                            <span className={styles.matchDateDay}>{dateStr}</span>
                            <span className={styles.matchDateTime}>{isFinished ? 'FT' : timeStr}</span>
                        </>
                    )}
                </div>

                {/* Home Team (right-aligned) */}
                <div className={`${styles.matchSideTeam} ${styles.matchHomeTeam} ${homeWon ? styles.matchWinner : ''}`}>
                    <span className={styles.matchTeamName}>{homeName}</span>
                    {homeLogo && (
                        <img src={homeLogo} alt={homeName} className={styles.matchTeamLogo}
                            onError={(e) => (e.currentTarget.style.display = 'none')} />
                    )}
                </div>

                {/* Score / VS box */}
                <div className={styles.matchScoreBox}>
                    {hasScore
                        ? <span className={styles.matchScore}>{scoreHome} - {scoreAway}</span>
                        : <>
                            <span className={styles.matchVS}>VS</span>
                            {!isLive && (
                                <span className={styles.matchScheduled}>
                                    {formatMatchSchedule(date)}
                                </span>
                            )}
                          </>
                    }
                </div>

                {/* Away Team (left-aligned) */}
                <div className={`${styles.matchSideTeam} ${styles.matchAwayTeam} ${awayWon ? styles.matchWinner : ''}`}>
                    {awayLogo && (
                        <img src={awayLogo} alt={awayName} className={styles.matchTeamLogo}
                            onError={(e) => (e.currentTarget.style.display = 'none')} />
                    )}
                    <span className={styles.matchTeamName}>{awayName}</span>
                </div>

                {/* Status badge */}
                <div className={styles.matchStatus}>
                    {isFinished && !isLive && <span className={styles.ftBadge}>FT</span>}
                </div>
            </Link>
        );
    };

    const renderStandingsHeader = () => (
        <div className={styles.tableHeader}>
            <div className={styles.colPos}>#</div>
            <div className={styles.colTeam}>Equipo</div>
            <div className={`${styles.colVal} ${styles.colValPJ}`}>J</div>
            <div className={styles.colVal}>G</div>
            <div className={styles.colVal}>E</div>
            <div className={styles.colVal}>P</div>
            <div className={`${styles.colVal} ${styles.colValDG}`}>DG</div>
            <div className={styles.colPts}>PTS</div>
        </div>
    );

    const renderStandingsRow = (row: any, idx: number, totalTeams = activeFlatRows.length) => {
        const pos = row.position || (idx + 1);
        const logo = row.team?.logo || row.team?.image_path || row.team?.small_image_path ||
            row.participant?.image_path || row.participant?.small_image_path || row.logo || row.team_logo;
        const teamName = row.team?.name || row.participant?.name || row.name;
        const teamId = row.team?.id || row.team?.team_id || row.participant?.id || row.team_id;
        const rowLabel = resolveStandingsRowLabel(row, dbTeamLabels);
        const accentColor = rowLabel?.color
            ?? getAutoZoneColor(pos, totalTeams, resolvedQualRules, phaseGroupLabels);
        const rowAccentStyle = buildRowAccentStyle(accentColor);

        return (
            <div
                key={idx}
                className={`${styles.tableRow} ${rowAccentStyle ? styles.tableRowTinted : ''}`}
                style={rowAccentStyle}
            >
                <div className={styles.colPos}>{pos}</div>
                <div className={styles.colTeam}>
                    {logo
                        ? <img src={logo} alt={teamName} className={styles.teamLogo} />
                        : <div className={styles.teamLogoPlaceholder} />}
                    {teamId
                        ? <Link href={`/clubs/fs-team-${teamId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{teamName}</Link>
                        : <span>{teamName}</span>}
                </div>
                <div className={`${styles.colVal} ${styles.colValPJ}`}>{row.matches_total || row.matches_played}</div>
                <div className={styles.colVal}>{row.wins_total || row.wins}</div>
                <div className={styles.colVal}>{row.draws_total || row.draws}</div>
                <div className={styles.colVal}>{row.losses_total || row.losses}</div>
                <div className={`${styles.colVal} ${styles.colValDG}`}>
                    {(row.goals_for && row.goals_against) ? (row.goals_for - row.goals_against) : (row.goal_difference || '0')}
                </div>
                <div className={styles.colPts}>{row.points_total ?? row.points ?? 0}</div>
            </div>
        );
    };

    // ── Featured match renderer ───────────────────────────────────────────

    const renderFeaturedMatch = () => {
        if (!featured) return null;
        const { match, isResult } = featured;

        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : null;
        const timeStr = date ? date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const dateStr = date ? date.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }) : '';

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score;
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score;
        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Local';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Visitante';
        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';
        const isLive = match.status === 'live' || match.status === 'in_play';
        const hasScore = scoreHome !== undefined && scoreHome !== null && scoreHome !== '-';

        const badgeLabel = isLive ? '🔴 En vivo' : isResult ? 'Último resultado' : 'Próximo partido';

        return (
            <div className={styles.featuredMatchCard}>
                <div className={styles.featuredBadge}>{badgeLabel}</div>
                <div className={styles.featuredTeams}>
                    {/* Home */}
                    <div className={styles.featuredTeam}>
                        {homeLogo
                            ? <img src={homeLogo} alt={homeName} className={styles.featuredTeamLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            : <div className={styles.featuredTeamLogoPlaceholder}>{homeName[0]}</div>}
                        <span className={styles.featuredTeamName}>{homeName}</span>
                    </div>

                    {/* Score / Time */}
                    <div className={styles.featuredCenter}>
                        {isLive && (
                            <div className={styles.featuredLiveIndicator}>
                                <span className={styles.liveDot} />
                                {match.minute || 'LIVE'}
                            </div>
                        )}
                        <div className={styles.featuredScoreBox}>
                            {hasScore ? (
                                <>
                                    <span className={styles.featuredScoreNum}>{scoreHome}</span>
                                    <span className={styles.featuredScoreSep}>-</span>
                                    <span className={styles.featuredScoreNum}>{scoreAway}</span>
                                </>
                            ) : (
                                <>
                                    <span className={styles.featuredVS}>VS</span>
                                </>
                            )}
                        </div>
                        {!hasScore && !isLive && dateStr && (
                            <span className={styles.featuredMobileDate}>{dateStr}</span>
                        )}
                        {!isLive && (
                            <span className={styles.featuredScoreTime}>
                                {isResult ? 'FT' : timeStr}
                            </span>
                        )}
                    </div>

                    {/* Away */}
                    <div className={styles.featuredTeam}>
                        {awayLogo
                            ? <img src={awayLogo} alt={awayName} className={styles.featuredTeamLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            : <div className={styles.featuredTeamLogoPlaceholder}>{awayName[0]}</div>}
                        <span className={styles.featuredTeamName}>{awayName}</span>
                    </div>
                </div>

                {dateStr && (
                    <div className={styles.featuredMatchMeta}>
                        <span style={{ textTransform: 'capitalize' }}>{dateStr}</span>
                        {!isResult && timeStr && <span>· {timeStr} hs</span>}
                        {match.venue && <span>· {match.venue}</span>}
                    </div>
                )}
            </div>
        );
    };

    // ── Main render ───────────────────────────────────────────────────────

    return (
        <div className={styles.page}>

            {/* ── Hero Section ───────────────────────────────────────── */}
            <div className={styles.heroSection}>
                <div className="g22-container">
                    {/* Breadcrumb */}
                    <nav className={styles.breadcrumb}>
                        <Link href="/">Partidos</Link>
                        <span className={styles.separator}>/</span>
                        <Link href="/tournaments">Torneos</Link>
                        <span className={styles.separator}>/</span>
                        <span>{tournamentName}</span>
                    </nav>

                    {/* Hero Card */}
                    <div className={styles.heroCard}>
                        <div className={styles.heroLeft}>
                            {/* Logo */}
                            <div className={styles.heroLogoWrap}>
                                {tournamentLogo
                                    ? <img src={tournamentLogo} alt={tournamentName} className={styles.heroLogoImg} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    : <span className={styles.heroLogoPlaceholder}>{tournamentName[0]}</span>}
                            </div>

                            {/* Info */}
                            <div className={styles.heroInfo}>
                                <h1 className={styles.heroTitle}>{tournamentName}</h1>
                                <div className={styles.heroMeta}>
                                    {sportLabel && <span className={styles.heroMetaItem}>{sportLabel}</span>}
                                    {sportLabel && countryName && <span className={styles.heroMetaDot} />}
                                    {countryName && <span className={styles.heroMetaItem}>{countryName}</span>}
                                    {yearDisplay && (
                                        <>
                                            <span className={styles.heroMetaDot} />
                                            <span className={styles.heroMetaItem}>{yearDisplay}</span>
                                        </>
                                    )}
                                    {details?.current_stage_has_cup_trees && (
                                        <>
                                            <span className={styles.heroMetaDot} />
                                            <span className={styles.heroMetaItem}>Fase Eliminatoria</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: status + CTAs */}
                        <div className={styles.heroRight}>
                            <span className={`${styles.statusBadge} ${tournamentStatus === 'active' ? styles.statusActive : tournamentStatus === 'upcoming' ? styles.statusUpcoming : styles.statusFinished}`}>
                                {tournamentStatus === 'active' ? 'En Curso' : tournamentStatus === 'upcoming' ? 'Próximamente' : 'Finalizado'}
                            </span>
                            <div className={styles.heroCTAs}>
                                <button
                                    className={styles.ctaBtnSecondary}
                                    onClick={() => setActiveTab('fixtures')}
                                    type="button"
                                >
                                    Ver Fixture
                                </button>
                                <button
                                    className={styles.ctaBtnSecondary}
                                    onClick={() => setActiveTab('standings')}
                                    type="button"
                                >
                                    Ver Tabla
                                </button>
                                <button
                                    className={`${styles.followBtn} ${isLeagueFavorite(id) ? styles.followBtnActive : ''}`}
                                    onClick={() => toggleLeagueFavorite(id, tournamentName)}
                                    type="button"
                                >
                                    {isLeagueFavorite(id) ? '★ Siguiendo' : '☆ Seguir'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Quick Stats Row ─────────────────────────────── */}
                    <div className={styles.quickStatsRow}>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.teams || '—'}</span>
                            <span className={styles.statCardLabel}>Equipos</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.played}</span>
                            <span className={styles.statCardLabel}>Jugados</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.upcoming}</span>
                            <span className={styles.statCardLabel}>Restantes</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValueSm}>{stats.leaderName}</span>
                            <span className={styles.statCardLabel}>Líder</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statCardValue}>{stats.nextDate}</span>
                            <span className={styles.statCardLabel}>Próxima Fecha</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Sticky Tabs ─────────────────────────────────────────── */}
            <div className={styles.tabsBar}>
                <div className="g22-container">
                    <nav className={styles.navTabs}>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {/* ── Main Content ─────────────────────────────────────────── */}
            <main className="g22-container" style={{ paddingBottom: '24px' }}>

                {/* ── SUMMARY TAB ──────────────────────────────────────── */}
                {activeTab === 'summary' && (
                    <div className={styles.contentGrid}>

                        {/* Left: Content Area */}
                        <div className={styles.contentArea}>

                            {/* Featured Match */}
                            {featured && renderFeaturedMatch()}

                            {/* Latest Results */}
                            {results.length > 0 && (
                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Últimos Resultados</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('results')}>Ver todos</button>
                                    </div>
                                    <div className={styles.matchList}>
                                        {results.slice(0, 5).map(m => renderMatchItem(m, true))}
                                    </div>
                                </div>
                            )}

                            {/* Upcoming Matches */}
                            {fixtures.length > 0 && (
                                <div className={styles.sectionCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Próximos Partidos</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('fixtures')}>Ver todos</button>
                                    </div>
                                    <div className={styles.matchList}>
                                        {fixtures.slice(0, 5).map(m => renderMatchItem(m, false))}
                                    </div>
                                </div>
                            )}

                            {/* Empty state */}
                            {!featured && results.length === 0 && fixtures.length === 0 && (
                                <div className={styles.sectionCard}>
                                    <p className={styles.emptyState}>No hay partidos cargados aún.</p>
                                </div>
                            )}
                        </div>

                        {/* Right: Sidebar */}
                        <aside className={styles.sidebar}>

                            {/* Standings Preview */}
                            {standingsPreviewRows.length > 0 && (
                                <div className={styles.standingsPreviewCard}>
                                    <div className={styles.sectionHeader}>
                                        <h2 className={styles.sectionTitle}>Posiciones</h2>
                                        <button className={styles.linkButton} onClick={() => setActiveTab('standings')}>Ver tabla</button>
                                    </div>
                                    <div className={styles.tableCard}>
                                        {renderStandingsHeader()}
                                        {standingsPreviewRows.map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                    </div>
                                </div>
                            )}

                            {/* Tournament Info Card */}
                            <div className={styles.infoCard}>
                                <div className={styles.infoCardHeader}>
                                    <h3 className={styles.infoCardTitle}>Información</h3>
                                </div>
                                <div className={styles.infoCardBody}>
                                    {sportLabel && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Deporte</span>
                                            <span className={styles.infoValue}>{sportLabel}</span>
                                        </div>
                                    )}
                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>País / Región</span>
                                        <span className={styles.infoValue}>{countryName}</span>
                                    </div>
                                    {yearDisplay && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Temporada</span>
                                            <span className={styles.infoValue}>{yearDisplay}</span>
                                        </div>
                                    )}
                                    {stats.teams > 0 && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Equipos</span>
                                            <span className={styles.infoValue}>{stats.teams}</span>
                                        </div>
                                    )}
                                    {details?.winner && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>Campeón Vigente</span>
                                            <span className={styles.infoValue}>
                                                {details.winner.image_path && <img src={details.winner.image_path} alt="" width={16} height={16} />}
                                                {details.winner.name}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </aside>
                    </div>
                )}

                {/* ── RESULTS TAB ──────────────────────────────────────── */}
                {activeTab === 'results' && (
                    <div className={styles.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 className={styles.pageTitle}>Resultados</h2>
                            <ExportImage
                                template="dailyMatches"
                                filename={`resultados-${tournamentData?.name}`}
                                data={{
                                    date: details?.season || 'Resultados',
                                    tournament: tournamentData?.name || 'Torneo',
                                    matches: results.slice(0, 15).map(m => ({
                                        homeTeam: m.home_team?.name || m.event_home_team || m.home_team_name || 'Home',
                                        awayTeam: m.away_team?.name || m.event_away_team || m.away_team_name || 'Away',
                                        homeScore: m.scores?.home ?? m.scores?.home_score ?? m.home_score,
                                        awayScore: m.scores?.away ?? m.scores?.away_score ?? m.away_score,
                                        time: new Date((m.timestamp || m.start_time || m.time) * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
                                        status: 'finished',
                                    })),
                                }}
                            />
                        </div>
                        <div className={styles.sectionCard}>
                            <div className={styles.matchList}>
                                {results.length > 0
                                    ? results.map(m => renderMatchItem(m, true))
                                    : <p className={styles.emptyState}>No hay resultados registrados.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── FIXTURES TAB ─────────────────────────────────────── */}
                {activeTab === 'fixtures' && (
                    <div className={styles.section}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 className={styles.pageTitle}>Fixture</h2>
                            <ExportImage
                                template="dailyMatches"
                                filename={`fixture-${tournamentData?.name}`}
                                data={{
                                    date: 'Próximos Partidos',
                                    tournament: tournamentData?.name || 'Torneo',
                                    matches: fixtures.slice(0, 15).map(m => ({
                                        homeTeam: m.home_team?.name || m.event_home_team || m.home_team_name || 'Home',
                                        awayTeam: m.away_team?.name || m.event_away_team || m.away_team_name || 'Away',
                                        time: new Date((m.timestamp || m.start_time || m.time) * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' +
                                            new Date((m.timestamp || m.start_time || m.time) * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
                                        status: 'scheduled',
                                    })),
                                }}
                            />
                        </div>
                        <div className={styles.sectionCard}>
                            <div className={styles.matchList}>
                                {fixtures.length > 0
                                    ? fixtures.map(m => renderMatchItem(m, false))
                                    : <p className={styles.emptyState}>No hay partidos programados.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STANDINGS TAB ─────────────────────────────────────── */}
                {activeTab === 'standings' && (
                    <div className={styles.section}>
                        <div className={styles.standingsToolbar}>
                            <div className={styles.pillsGroup}>
                                <button className={`${styles.pillBtn} ${standingsView === 'overall' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('overall')}>General</button>
                                <button className={`${styles.pillBtn} ${standingsView === 'form' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('form')}>Forma</button>
                                <button className={`${styles.pillBtn} ${standingsView === 'overunder' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('overunder')}>Over/Under</button>
                                <button className={`${styles.pillBtn} ${standingsView === 'htft' ? styles.pillBtnActive : ''}`} onClick={() => setStandingsView('htft')}>HT/FT</button>
                            </div>
                            <ExportImage
                                template="standings"
                                filename={`tabla-${tournamentData?.name}`}
                                data={{
                                    title: tournamentData?.name || 'Tabla de Posiciones',
                                    subtitle: details?.season || 'Clasificación',
                                    rows: activeFlatRows.map((row: any, idx: number) => ({
                                        pos: row.position || (idx + 1),
                                        team: row.team?.name || row.participant?.name || row.name || 'Equipo',
                                        played: row.matches_total || row.matches_played || 0,
                                        won: row.wins_total || row.wins || 0,
                                        lost: row.losses_total || row.losses || 0,
                                        diff: String((row.goals_for && row.goals_against) ? (row.goals_for - row.goals_against) : (row.goal_difference || '0')),
                                        points: row.points_total || row.points || 0,
                                    })),
                                }}
                            />
                        </div>

                        {activeRows.length === 0 && <p className={styles.emptyState}>Tabla no disponible.</p>}

                        {activeRows.length > 0 && (standingsView === 'overall' || standingsView === 'form') && (
                            <div className={styles.standingsContainer}>
                                {activeRows[0]?.rows ? (
                                    <div className={styles.groupsStack}>
                                        {activeRows.map((group: any, gidx: number) => (
                                            <div key={gidx} className={styles.groupBlock}>
                                                <h3 className={styles.groupTitleLarge}>{group.group_name}</h3>
                                                <div className={styles.tableCard}>
                                                    {renderStandingsHeader()}
                                                    {(group.rows || []).map((row: any, idx: number) => renderStandingsRow(row, idx, group.rows.length))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.sectionCard}>
                                        <div className={styles.tableCard}>
                                            {renderStandingsHeader()}
                                            {activeRows.map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeRows.length > 0 && standingsView === 'overunder' && (
                            <div className={styles.sectionCard}>
                                <div className={styles.tableScroll}>
                                    <div className={styles.tableCard} style={{ minWidth: 600 }}>
                                        <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 90px 90px' }}>
                                            <div className={styles.thPos}>#</div>
                                            <div className={styles.thTeam}>Equipo</div>
                                            <div className={styles.thVal}>Over</div>
                                            <div className={styles.thVal}>Under</div>
                                            <div className={styles.thVal}>Goles</div>
                                            <div className={styles.thVal}>Prom</div>
                                        </div>
                                        {activeRows.map((row: any, idx: number) => (
                                            <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 90px 90px' }}>
                                                <div className={styles.tdPos}>{idx + 1}</div>
                                                <div className={styles.tdTeam}><span>{row.team?.name || row.participant?.name || row.name}</span></div>
                                                <div className={styles.tdVal}>{row.over ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.under ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.goals ?? '-'}</div>
                                                <div className={styles.tdVal}>{typeof row.average_goals_per_match === 'number' ? row.average_goals_per_match.toFixed(1) : (row.average_goals_per_match ?? '-')}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeRows.length > 0 && standingsView === 'htft' && (
                            <div className={styles.sectionCard}>
                                <div className={styles.tableScroll}>
                                    <div className={styles.tableCard} style={{ minWidth: 980 }}>
                                        <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(9, 50px) 60px' }}>
                                            <div className={styles.thPos}>#</div>
                                            <div className={styles.thTeam}>Equipo</div>
                                            {['WW', 'WD', 'WL', 'DW', 'DD', 'DL', 'LW', 'LD', 'LL'].map(h => (
                                                <div key={h} className={styles.thVal}>{h}</div>
                                            ))}
                                            <div className={styles.thVal}>Pts</div>
                                        </div>
                                        {activeRows.map((row: any, idx: number) => (
                                            <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(9, 50px) 60px' }}>
                                                <div className={styles.tdPos}>{idx + 1}</div>
                                                <div className={styles.tdTeam}><span>{row.team?.name || row.participant?.name || row.name}</span></div>
                                                <div className={styles.tdVal}>{row.win_win ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.win_draw ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.win_loss ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.draw_win ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.draw_draw ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.draw_loss ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.loss_win ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.loss_draw ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.loss_loss ?? '-'}</div>
                                                <div className={`${styles.tdVal} ${styles.tdPoints}`}>{row.points ?? '-'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TEAMS TAB ─────────────────────────────────────────── */}
                {activeTab === 'teams' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Equipos</h2>
                        {(() => {
                            const isDbOnly = (tournamentData as any)?.__isDbOnly;
                            const participantTeams = dbParticipants
                                .map((p: any) => ({
                                    name: p.club?.name ?? p.name ?? '',
                                    logo: p.club?.logo_url ?? '',
                                }))
                                .filter((t: any) => t.name);
                            // For DB-only tournaments, participants are the authoritative source
                            const displayTeams = isDbOnly && participantTeams.length > 0
                                ? participantTeams
                                : teamsList.length > 0
                                    ? teamsList
                                    : participantTeams;
                            return displayTeams.length > 0 ? (
                                <div className={styles.teamsGrid}>
                                    {displayTeams.map((team: any) => (
                                        <div key={team.name} className={styles.teamCard}>
                                            {team.logo
                                                ? <img src={team.logo} alt={team.name} className={styles.teamCardLogo} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                : <div className={styles.teamCardLogoPlaceholder}>{team.name[0]}</div>}
                                            <span className={styles.teamCardName}>{team.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className={styles.emptyState}>Equipos no disponibles.</p>
                            );
                        })()}
                    </div>
                )}

                {/* ── PLAYOFF TAB ───────────────────────────────────────── */}
                {activeTab === 'playoff' && (
                    <div className={styles.section}>
                        <PlayoffBracket data={draw} title={`Cuadro - ${tournamentName}`} />
                    </div>
                )}

                {/* ── STATS TAB ─────────────────────────────────────────── */}
                {activeTab === 'stats' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Goleadores</h2>
                        {topScorers.length > 0 ? (
                            <div className={styles.sectionCard}>
                                <div className={styles.tableCard}>
                                    <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                        <div>#</div>
                                        <div>Jugador</div>
                                        <div>Equipo</div>
                                        <div style={{ textAlign: 'center' }}>G</div>
                                        <div style={{ textAlign: 'center' }}>A</div>
                                    </div>
                                    {topScorers.slice(0, 20).map((player: any, idx: number) => (
                                        <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                            <div className={styles.tdPos}>{idx + 1}</div>
                                            <div className={styles.tdTeam}><span>{player.player_name || player.name}</span></div>
                                            <div className={styles.tdTeam} style={{ color: '#94a3b8' }}><span>{player.team_name || player.team?.name}</span></div>
                                            <div className={`${styles.tdVal} ${styles.tdPoints}`}>{player.goals}</div>
                                            <div className={styles.tdVal}>{player.assists || '-'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className={styles.emptyState}>No hay estadísticas disponibles.</p>
                        )}
                    </div>
                )}

                {/* ── ARCHIVE TAB ───────────────────────────────────────── */}
                {activeTab === 'archive' && (
                    <div className={styles.section}>
                        <h2 className={styles.pageTitle}>Archivo de Temporadas</h2>
                        {archives.length > 0 ? (
                            <div className={styles.archiveGrid}>
                                {archives.map((season: any) => (
                                    <Link
                                        key={season.season_id || season.id}
                                        href={`/tournaments/${id}?season_id=${season.season_id || season.id}`}
                                        className={styles.archiveItem}
                                    >
                                        {season.name || season.season_name}
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.emptyState}>No hay temporadas archivadas disponibles.</p>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
}
