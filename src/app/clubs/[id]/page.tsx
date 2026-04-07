'use client';

import React, { use, useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { ArrowLeft, ChevronRight, Star } from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorites';
import { SPORTS_BY_ID } from '@/lib/sports';
import { canonicalizeSportId } from '@/lib/clubDerivatives';
import ExportImage from '@/components/ExportImage';
import { APP_TIMEZONE, formatDateInTimeZone } from '@/lib/timezone';
import { sortMatchesByDate } from '@/lib/utils/matchOrdering';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { useAuth } from '@/context/AuthContext';

const SPORT_LABEL: Record<string, string> = Object.fromEntries(
    Object.entries(SPORTS_BY_ID).map(([id, s]) => [id, s.name])
);

const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'squad', label: 'Plantilla' },
    { id: 'transfers', label: 'Transferencias' },
];

const DEFAULT_PUBLIC_TABS = new Set(['summary', 'results', 'fixtures']);

function isRugbyApiSportsTeamId(value: string) {
    return /^ras-team-\d+$/i.test(value);
}

function isEspnAmericanFootballTeamId(value: string) {
    return /^espn-team-\d+$/i.test(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getExternalTeamId(value: string, teamUrl?: string) {
    if (value.startsWith('fs-team-')) return value.slice(8);
    const rugbyMatch = /^ras-team-(\d+)$/i.exec(value);
    if (rugbyMatch?.[1]) return rugbyMatch[1];
    const espnMatch = /^espn-team-(\d+)$/i.exec(value);
    if (espnMatch?.[1]) return espnMatch[1];
    if (teamUrl && !UUID_RE.test(value)) return value;
    return null;
}

const getTeamLogo = (team: any) => {
    return resolveTeamLogo(team);
};

const POSITION_ORDER: Record<string, number> = {
    goalkeeper: 0, goalkeepers: 0, portero: 0, g: 0,
    defender: 1, defenders: 1, defensa: 1, d: 1,
    midfielder: 2, midfielders: 2, mediocampista: 2, m: 2,
    forward: 3, forwards: 3, striker: 3, strikers: 3, delantero: 3, f: 3,
    coach: 4, manager: 4, entrenador: 4,
};

const POSITION_LABELS: Record<number, string> = {
    0: 'Porteros',
    1: 'Defensas',
    2: 'Mediocampistas',
    3: 'Delanteros',
    4: 'Cuerpo Tecnico',
};

function groupSquadByPosition(squad: any): Record<number, any[]> {
    const groups: Record<number, any[]> = {};

    // FlashScore v2 squad format: array of { team_name, tab_name, list: [{ name: "Goalkeepers", players: [...] }] }
    if (Array.isArray(squad) && squad.length > 0 && squad[0]?.list) {
        // Flatten all tournaments' lists into position groups
        for (const tab of squad) {
            if (!Array.isArray(tab.list)) continue;
            for (const posGroup of tab.list) {
                const posName = (posGroup.name || '').toLowerCase();
                const orderIdx = POSITION_ORDER[posName] ?? POSITION_ORDER[posName.replace(/s$/, '')] ?? 3;
                const playersArr = Array.isArray(posGroup.players) ? posGroup.players : [];
                for (const p of playersArr) {
                    if (!groups[orderIdx]) groups[orderIdx] = [];
                    // Normalize player fields for rendering
                    groups[orderIdx].push({
                        ...p,
                        player_id: p.player_id || p.id || '',
                        name: p.name || p.player_name || '',
                        jersey_number: p.number || p.jersey_number || '',
                        nationality: p.country_name || p.nationality || '',
                        age: p.age || '',
                    });
                }
            }
        }
        if (Object.keys(groups).length > 0) return groups;
    }

    // Flat array of players
    let players: any[] = [];

    if (Array.isArray(squad)) {
        players = squad;
    } else if (squad && typeof squad === 'object') {
        if (Array.isArray(squad.DATA)) {
            players = squad.DATA;
        } else {
            // Object with position keys like { goalkeepers: [...], defenders: [...] }
            Object.entries(squad).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    const posKey = key.toLowerCase();
                    const orderIdx = POSITION_ORDER[posKey] ?? 3;
                    value.forEach((p: any) => {
                        if (!groups[orderIdx]) groups[orderIdx] = [];
                        groups[orderIdx].push(p);
                    });
                }
            });
            if (Object.keys(groups).length > 0) return groups;
        }
    }

    // Group flat player list by position field
    players.forEach((p: any) => {
        const pos = (p.position || p.position_name || p.role || '').toLowerCase().trim();
        const orderIdx = POSITION_ORDER[pos] ?? 3;
        if (!groups[orderIdx]) groups[orderIdx] = [];
        groups[orderIdx].push(p);
    });

    return groups;
}

function formatClubDate(timestamp: number, options: Intl.DateTimeFormatOptions) {
    return formatDateInTimeZone(new Date(timestamp * 1000), 'es-AR', options, APP_TIMEZONE) || '';
}

function TeamDetailInner({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const sp = useSearchParams();
    const { user } = useAuth();
    const { isFavorited, toggle: toggleFavorite } = useFavorite('club', id);

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [squadLoading, setSquadLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<any>(null);
    const [results, setResults] = useState<any[]>([]);
    const [fixtures, setFixtures] = useState<any[]>([]);
    const [squad, setSquad] = useState<any>(null);
    const [squadFetched, setSquadFetched] = useState(false);
    const [transfers, setTransfers] = useState<any[]>([]);
    const [resolvedClubId, setResolvedClubId] = useState<string | null>(null);

    const [selectedSport, setSelectedSport] = useState<string>('all');
    const [selectedSquadTab, setSelectedSquadTab] = useState<string>('');

    // Keep provider-prefixed IDs so the API route can detect the correct external source.
    const rawId = id;

    // Hints from URL search params (passed from match/tournament page links)
    const hintName = sp.get('name') || '';
    const hintTeamUrl = sp.get('team_url') || '';
    const hintLeague = sp.get('league') || '';
    const preferredSport = sp.get('sport') || (isRugbyApiSportsTeamId(id) ? 'rugby' : isEspnAmericanFootballTeamId(id) ? 'american-football' : '');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            setResolvedClubId(null);
            try {
                const query = new URLSearchParams();
                query.set('team_id', rawId);
                if (hintName) query.set('team_name', hintName);
                if (hintTeamUrl) query.set('team_url', hintTeamUrl);
                if (hintLeague) query.set('league', hintLeague);
                if (preferredSport) query.set('preferred_sport', preferredSport);
                query.set('skip_squad', 'true');

                const res = await fetch(`/api/teams?${query.toString()}`, { cache: 'no-store' });
                const payload = await res.json();

                if (!res.ok || !payload?.ok) {
                    setError(payload?.error || 'No se pudo cargar los datos del equipo.');
                    return;
                }

                if (
                    payload?.resolvedClubId &&
                    payload.resolvedClubId !== id &&
                    !id.startsWith('fs-team-') &&
                    !isRugbyApiSportsTeamId(id) &&
                    !isEspnAmericanFootballTeamId(id)
                ) {
                    const nextParams = new URLSearchParams();
                    if (preferredSport) nextParams.set('sport', preferredSport);
                    if (hintName) nextParams.set('name', hintName);
                    if (hintTeamUrl) nextParams.set('team_url', hintTeamUrl);
                    if (hintLeague) nextParams.set('league', hintLeague);

                    const queryString = nextParams.toString();
                    router.replace(`/clubs/${payload.resolvedClubId}${queryString ? `?${queryString}` : ''}`);
                    return;
                }

                setResolvedClubId(payload.resolvedClubId || null);
                setDetails(payload.details || null);
                setResults(sortMatchesByDate(payload.results || [], 'desc'));
                setFixtures(sortMatchesByDate(payload.fixtures || [], 'asc'));
                setSquad(null);
                setSquadFetched(false);
                setTransfers(payload.transfers || []);
            } catch (err) {
                console.error('Error fetching team data:', err);
                setError('Error al cargar datos del equipo.');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [hintLeague, hintName, hintTeamUrl, id, preferredSport, rawId, router]);

    // Derived: unique sports from matches
    const availableSports = useMemo(() => {
        const seen = new Set<string>();
        [...results, ...fixtures].forEach(m => { if (m.sport_id) seen.add(String(m.sport_id)); });
        return Array.from(seen);
    }, [results, fixtures]);

    useEffect(() => {
        const normalizedPreferredSport = canonicalizeSportId(preferredSport);
        if (!normalizedPreferredSport) return;
        const matchingSport = availableSports.find((sportId) => canonicalizeSportId(sportId) === normalizedPreferredSport);
        if (!matchingSport) return;
        setSelectedSport((current) => current === matchingSport ? current : matchingSport);
    }, [availableSports, preferredSport]);

    // Derived: squad tabs
    const squadTabs: string[] = useMemo(() => {
        if (Array.isArray(squad) && squad.length > 0 && squad[0]?.tab_name) {
            const seen = new Set<string>();
            squad.forEach((t: any) => { if (t.tab_name) seen.add(t.tab_name); });
            return Array.from(seen);
        }
        return [];
    }, [squad]);

    // Lazy-load squad when the squad tab is first selected
    useEffect(() => {
        if (activeTab !== 'squad' || squadFetched || loading) return;

        async function fetchSquad() {
            setSquadLoading(true);
            try {
                const query = new URLSearchParams();
                query.set('team_id', rawId);
                if (hintName) query.set('team_name', hintName);
                if (hintTeamUrl) query.set('team_url', hintTeamUrl);
                if (hintLeague) query.set('league', hintLeague);
                if (preferredSport) query.set('preferred_sport', preferredSport);

                const res = await fetch(`/api/teams?${query.toString()}`, { cache: 'no-store' });
                const payload = await res.json();
                if (res.ok && payload?.ok) {
                    setSquad(payload.squad || null);
                }
            } catch {
                // Silently ignore — squad just won't show
            } finally {
                setSquadLoading(false);
                setSquadFetched(true);
            }
        }

        fetchSquad();
    }, [activeTab, squadFetched, loading, rawId, hintLeague, hintName, hintTeamUrl, preferredSport]);

    // Auto-select first squad tab when squad loads
    useEffect(() => {
        if (squadTabs.length > 0 && !selectedSquadTab) {
            setSelectedSquadTab(squadTabs[0]);
        }
    }, [squadTabs]);

    // Filtered matches by sport
    const filteredResults = selectedSport === 'all' ? results : results.filter(m => String(m.sport_id) === selectedSport);
    const filteredFixtures = selectedSport === 'all' ? fixtures : fixtures.filter(m => String(m.sport_id) === selectedSport);
    const isSuperAdminUser = user?.role === 'super_admin' || user?.role === 'admin_general';
    const externalTeamId = getExternalTeamId(rawId, hintTeamUrl);
    const adminClubId = useMemo(() => {
        if (resolvedClubId) return resolvedClubId;
        if (!externalTeamId && !rawId.startsWith('fs-team-') && !isRugbyApiSportsTeamId(rawId) && !isEspnAmericanFootballTeamId(rawId)) return rawId;
        return null;
    }, [externalTeamId, rawId, resolvedClubId]);
    const visibleTabs = useMemo(() => {
        const supportedTabs = Array.isArray(details?.supported_tabs) ? details.supported_tabs : null;
        if (!supportedTabs) {
            return TABS.filter((tab) => DEFAULT_PUBLIC_TABS.has(tab.id));
        }
        return TABS.filter((tab) => supportedTabs.includes(tab.id));
    }, [details?.supported_tabs]);

    useEffect(() => {
        if (visibleTabs.some((tab) => tab.id === activeTab)) return;
        setActiveTab('summary');
    }, [activeTab, visibleTabs]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)', padding: '24px 16px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: 80, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 72, height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.08)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ width: '55%', height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ width: 60, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                <div style={{ width: 48, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[80, 96, 72, 80, 104].map((w, i) => (
                        <div key={i} style={{ width: w, height: 32, borderRadius: 6, flexShrink: 0, background: i === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
                <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
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

    // Extract team info from details, fallback to hintName from URL
    const teamName = details?.name || details?.team?.name || details?.team_name || hintName || rawId;
    const teamLogoUrl =
        resolveTeamLogo(details, details?.team) ||
        '';
    const returnTo = `/clubs/${rawId}${sp.toString() ? `?${sp.toString()}` : ''}`;
    const adminEditHref = adminClubId
        ? `/admin/super/clubes/${adminClubId}/editar`
        : externalTeamId
            ? (() => {
                const params = new URLSearchParams();
                params.set('name', teamName);
                params.set('returnTo', returnTo);
                if (preferredSport) params.set('sport', preferredSport);
                if (hintTeamUrl) params.set('team_url', hintTeamUrl);
                if (hintLeague) params.set('league', hintLeague);
                if (rawId.startsWith('fs-team-')) params.set('source', 'flashscore');
                if (isRugbyApiSportsTeamId(rawId)) params.set('source', 'rugby-api-sports');
                if (isEspnAmericanFootballTeamId(rawId)) params.set('source', 'espn');

                return `/admin/super/clubes/externos/${externalTeamId}/logo?${params.toString()}`;
            })()
            : null;
    const countryName = details?.country?.name || details?.country || '';
    const countryFlag = details?.country?.image_path || details?.country?.small_image_path || '';
    const venue = details?.venue?.name || details?.venue || details?.stadium || '';
    const coachName = details?.coach?.name || details?.manager?.name || '';

    // Render a match item (same pattern as tournament page)
    const renderMatchItem = (match: any) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : new Date();

        const matchStatus = match.match_status || match.event_status || match.status || '';
        const isScheduled = matchStatus === 'scheduled' || matchStatus === 'NS' || matchStatus === 'Not Started';
        const rawScoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score ?? null;
        const rawScoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score ?? null;
        const scoreHome = isScheduled || rawScoreHome == null ? '-' : rawScoreHome;
        const scoreAway = isScheduled || rawScoreAway == null ? '-' : rawScoreAway;

        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Home';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Away';

        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || '';

        let homeClass = '';
        let awayClass = '';
        if (typeof scoreHome === 'number' && typeof scoreAway === 'number') {
            if (scoreHome > scoreAway) homeClass = styles.winnerName;
            if (scoreAway > scoreHome) awayClass = styles.winnerName;
        }

        return (
            <Link href={`/matches/${match.event_key || match.match_id}`} key={match.event_key || match.match_id} className={styles.matchItem}>
                <div className={styles.matchTime}>
                    <span className={styles.matchDateStr}>{date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', weekday: 'short', timeZone: APP_TIMEZONE })}</span>
                    <span>{date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE })}</span>
                </div>
                <div className={styles.matchTeams}>
                    <div className={styles.teamRow}>
                        <div className={styles.teamInfo}>
                            {homeLogo ? (
                                <img src={homeLogo} alt={homeName} className={styles.teamLogoSmall} />
                            ) : (
                                <div className={styles.teamLogoPlaceholder} />
                            )}
                            <span className={homeClass}>{homeName}</span>
                        </div>
                        <span className={styles.score}>{scoreHome}</span>
                    </div>
                    <div className={styles.teamRow}>
                        <div className={styles.teamInfo}>
                            {awayLogo ? (
                                <img src={awayLogo} alt={awayName} className={styles.teamLogoSmall} />
                            ) : (
                                <div className={styles.teamLogoPlaceholder} />
                            )}
                            <span className={awayClass}>{awayName}</span>
                        </div>
                        <span className={styles.score}>{scoreAway}</span>
                    </div>
                </div>
                <div className={styles.matchMeta}>
                    <ChevronRight size={16} />
                </div>
            </Link>
        );
    };

    // Group squad by position, filtered by selected tab
    const selectedSquadData = squadTabs.length > 0 && selectedSquadTab
        ? (Array.isArray(squad) ? squad.filter((t: any) => t.tab_name === selectedSquadTab) : squad)
        : squad;
    const squadGroups = groupSquadByPosition(selectedSquadData);
    const sortedPositionKeys = Object.keys(squadGroups).map(Number).sort((a, b) => a - b);

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.breadcrumb}>
                        <Link href="/">Inicio</Link>
                        <span className={styles.separator}>/</span>
                        <Link href="/clubs">Clubes</Link>
                        <span className={styles.separator}>/</span>
                        <span className={styles.breadcrumbActive}>{teamName}</span>
                    </div>

                    <div className={styles.headerContent}>
                        <div className={styles.logoContainer}>
                            {teamLogoUrl ? (
                                <img src={teamLogoUrl} alt={teamName} className={styles.teamLogo} />
                            ) : (
                                <div className={styles.logoPlaceholder}>{teamName?.[0]}</div>
                            )}
                        </div>
                        <div className={styles.headerInfo}>
                            <h1 className={styles.title}>{teamName}</h1>
                            <div className={styles.meta}>
                                {countryName && (
                                    <span className={styles.country}>
                                        {countryFlag && <img src={countryFlag} alt="" className={styles.countryFlag} />}
                                        {countryName}
                                    </span>
                                )}
                                {venue && <span>{venue}</span>}
                            </div>
                            {(availableSports.length > 1 || squadTabs.length > 1) && (
                                <div className={styles.headerDropdowns}>
                                    {availableSports.length > 1 && (
                                        <select
                                            className={styles.headerSelect}
                                            value={selectedSport}
                                            onChange={e => setSelectedSport(e.target.value)}
                                        >
                                            <option value="all">Todos los deportes</option>
                                            {availableSports.map(s => (
                                                <option key={s} value={s}>{SPORT_LABEL[s] || s}</option>
                                            ))}
                                        </select>
                                    )}
                                    {squadTabs.length > 1 && (
                                        <select
                                            className={styles.headerSelect}
                                            value={selectedSquadTab}
                                            onChange={e => setSelectedSquadTab(e.target.value)}
                                        >
                                            {squadTabs.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className={styles.headerActions}>
                            {isSuperAdminUser && adminEditHref ? (
                                <Link href={adminEditHref} className={styles.adminActionBtn}>
                                    Editar logo
                                </Link>
                            ) : null}
                            <button
                                className={`${styles.followBtn} ${isFavorited ? styles.followBtnActive : ''}`}
                                onClick={() => toggleFavorite()}
                                type="button"
                            >
                                <Star size={16} fill={isFavorited ? 'currentColor' : 'none'} />
                                {isFavorited ? 'Siguiendo' : 'Seguir'}
                            </button>
                        </div>
                    </div>

                    <nav className={styles.navTabs}>
                        {visibleTabs.map(tab => (
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
            </header>

            <main className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
                <div className={styles.contentLayout}>
                    <div className={styles.mainColumn}>

                        {/* Summary Tab */}
                        {activeTab === 'summary' && (
                            <>
                                {filteredResults.length > 0 && (
                                    <div className={styles.section}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Ultimos Resultados</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('results')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {filteredResults.slice(0, 5).map(m => renderMatchItem(m))}
                                        </div>
                                    </div>
                                )}

                                {filteredFixtures.length > 0 && (
                                    <div className={styles.section} style={{ marginTop: '32px' }}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Proximos Partidos</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('fixtures')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {filteredFixtures.slice(0, 5).map(m => renderMatchItem(m))}
                                        </div>
                                    </div>
                                )}

                                {filteredResults.length === 0 && filteredFixtures.length === 0 && (
                                    <p className={styles.emptyState}>No hay datos de partidos disponibles.</p>
                                )}
                            </>
                        )}

                        {/* Results Tab */}
                        {activeTab === 'results' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
                                    <h2 className={styles.pageTitle}>Resultados</h2>
                                    <ExportImage
                                        template="dailyMatches"
                                        filename={`resultados-${teamName}`}
                                        data={{
                                            date: 'Resultados',
                                            tournament: teamName,
                                            tournamentLogo: teamLogoUrl,
                                            matches: filteredResults.map(m => ({
                                                homeTeam: m.home_team?.name || m.event_home_team || m.home_team_name || 'Local',
                                                awayTeam: m.away_team?.name || m.event_away_team || m.away_team_name || 'Visitante',
                                                homeLogo: getTeamLogo(m.home_team) || m.home_team_logo || '',
                                                awayLogo: getTeamLogo(m.away_team) || m.away_team_logo || '',
                                                homeScore: m.scores?.home ?? m.scores?.home_score ?? m.home_score,
                                                awayScore: m.scores?.away ?? m.scores?.away_score ?? m.away_score,
                                                time: formatClubDate(m.timestamp || m.start_time || m.time, { day: '2-digit', month: '2-digit' }),
                                                status: 'finished' as const,
                                                dateLabel: formatClubDate(m.timestamp || m.start_time || m.time, { weekday: 'short', day: '2-digit', month: '2-digit' }),
                                                kickoffAt: (m.timestamp || m.start_time || m.time)
                                                    ? new Date((m.timestamp || m.start_time || m.time) * 1000).toISOString()
                                                    : undefined,
                                            })),
                                        }}
                                    />
                                </div>
                                <div className={styles.matchList}>
                                    {filteredResults.length > 0
                                        ? filteredResults.map(m => renderMatchItem(m))
                                        : <p className={styles.emptyState}>No hay resultados registrados.</p>
                                    }
                                </div>
                            </div>
                        )}

                        {/* Fixtures Tab */}
                        {activeTab === 'fixtures' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
                                    <h2 className={styles.pageTitle}>Fixture</h2>
                                    <ExportImage
                                        template="dailyMatches"
                                        filename={`fixture-${teamName}`}
                                        data={{
                                            date: 'Próximos Partidos',
                                            tournament: teamName,
                                            tournamentLogo: teamLogoUrl,
                                            matches: filteredFixtures.map(m => ({
                                                homeTeam: m.home_team?.name || m.event_home_team || m.home_team_name || 'Local',
                                                awayTeam: m.away_team?.name || m.event_away_team || m.away_team_name || 'Visitante',
                                                homeLogo: getTeamLogo(m.home_team) || m.home_team_logo || '',
                                                awayLogo: getTeamLogo(m.away_team) || m.away_team_logo || '',
                                                time: formatClubDate(m.timestamp || m.start_time || m.time, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' +
                                                    formatClubDate(m.timestamp || m.start_time || m.time, { day: '2-digit', month: '2-digit' }),
                                                status: 'scheduled' as const,
                                                dateLabel: formatClubDate(m.timestamp || m.start_time || m.time, { weekday: 'short', day: '2-digit', month: '2-digit' }),
                                                kickoffAt: (m.timestamp || m.start_time || m.time)
                                                    ? new Date((m.timestamp || m.start_time || m.time) * 1000).toISOString()
                                                    : undefined,
                                            })),
                                        }}
                                    />
                                </div>
                                <div className={styles.matchList}>
                                    {filteredFixtures.length > 0
                                        ? filteredFixtures.map(m => renderMatchItem(m))
                                        : <p className={styles.emptyState}>No hay partidos programados.</p>
                                    }
                                </div>
                            </div>
                        )}

                        {/* Squad Tab */}
                        {activeTab === 'squad' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Plantilla</h2>
                                {squadLoading ? (
                                    <div>
                                        {[1, 2, 3, 4, 5, 6].map(i => (
                                            <div key={i} style={{ height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
                                        ))}
                                        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                                    </div>
                                ) : sortedPositionKeys.length > 0 ? (
                                    sortedPositionKeys.map(posIdx => (
                                        <div key={posIdx} className={styles.positionGroup}>
                                            <div className={styles.positionTitle}>
                                                {POSITION_LABELS[posIdx] || 'Otros'}
                                            </div>
                                            <div className={styles.tableCard}>
                                                {squadGroups[posIdx].map((player: any, idx: number) => {
                                                    const playerName = player.name || player.player_name || 'Jugador';
                                                    const playerPhoto = player.image_path || player.small_image_path || player.photo || '';
                                                    const playerCountry = player.country?.name || player.nationality || '';
                                                    const jerseyNumber = player.jersey_number || player.shirt_number || player.number || '';
                                                    const pId = player.player_id || player.id || '';

                                                    return (
                                                        <div key={pId || idx} className={styles.playerRow}>
                                                            <div>
                                                                {playerPhoto ? (
                                                                    <img src={playerPhoto} alt={playerName} className={styles.playerPhoto} />
                                                                ) : (
                                                                    <div className={styles.playerPhotoPlaceholder} />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className={styles.playerName}>
                                                                    {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{playerName}</Link> : playerName}
                                                                </div>
                                                                {playerCountry && <div className={styles.playerCountry}>{playerCountry}</div>}
                                                            </div>
                                                            <div className={styles.playerNumber}>{jerseyNumber || '-'}</div>
                                                            <div className={styles.tdVal}>{player.age || '-'}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className={styles.emptyState}>Plantilla no disponible.</p>
                                )}
                            </div>
                        )}

                        {/* Transfers Tab */}
                        {activeTab === 'transfers' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Transferencias</h2>
                                {transfers.length > 0 ? (
                                    <div className={styles.tableCard}>
                                        <div className={styles.transferHeader}>
                                            <div>Jugador</div>
                                            <div>Desde</div>
                                            <div>Hacia</div>
                                            <div>Tipo</div>
                                            <div style={{ textAlign: 'right' }}>Fecha</div>
                                        </div>
                                        {transfers.map((transfer: any, idx: number) => {
                                            const playerName = transfer.player?.name || transfer.player_name || transfer.name || 'Jugador';
                                            const fromTeam = transfer.from_team?.name || transfer.team_from?.name || transfer.from || '-';
                                            const toTeam = transfer.to_team?.name || transfer.team_to?.name || transfer.to || '-';
                                            const fromLogo = getTeamLogo(transfer.from_team || transfer.team_from) || '';
                                            const toLogo = getTeamLogo(transfer.to_team || transfer.team_to) || '';
                                            const type = transfer.type || transfer.transfer_type || '-';
                                            const date = transfer.date || transfer.transfer_date || '-';

                                            return (
                                                <div key={transfer.id || idx} className={styles.transferRow}>
                                                    <div className={styles.transferPlayer}>{playerName}</div>
                                                    <div className={styles.transferTeam}>
                                                        {fromLogo && <img src={fromLogo} alt="" className={styles.teamLogoSmall} />}
                                                        {fromTeam}
                                                    </div>
                                                    <div className={styles.transferTeam}>
                                                        {toLogo && <img src={toLogo} alt="" className={styles.teamLogoSmall} />}
                                                        {toTeam}
                                                    </div>
                                                    <div className={styles.transferType}>{type}</div>
                                                    <div className={styles.transferDate}>{date}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className={styles.emptyState}>No hay transferencias disponibles.</p>
                                )}
                            </div>
                        )}

                    </div>

                    {/* Sidebar */}
                    <aside className={styles.sidebarRight}>
                        <div className={styles.card}>
                            <h3>Equipo</h3>
                            {teamLogoUrl && (
                                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 12px' }}>
                                    <img src={teamLogoUrl} alt={teamName} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                                </div>
                            )}
                            {countryName && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Pais</span>
                                    <span className={styles.value}>{countryName}</span>
                                </div>
                            )}
                            {details?.current_league && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Liga</span>
                                    <span className={styles.value}>{details.current_league}</span>
                                </div>
                            )}
                            {details?.current_season && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Temporada</span>
                                    <span className={styles.value}>{details.current_season}</span>
                                </div>
                            )}
                            {details?.standing?.position && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Posicion</span>
                                    <span className={styles.value}>#{details.standing.position}</span>
                                </div>
                            )}
                            {venue && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Estadio</span>
                                    <span className={styles.value}>{venue}</span>
                                </div>
                            )}
                            {coachName && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Director Tecnico</span>
                                    <span className={styles.value}>{coachName}</span>
                                </div>
                            )}
                            {details?.founded && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Fundado</span>
                                    <span className={styles.value}>{details.founded}</span>
                                </div>
                            )}
                            {details?.statistics && (
                                <>
                                    <div className={styles.infoRow}>
                                        <span className={styles.label}>PJ</span>
                                        <span className={styles.value}>{details.statistics.played ?? '-'}</span>
                                    </div>
                                    <div className={styles.infoRow}>
                                        <span className={styles.label}>G-E-P</span>
                                        <span className={styles.value}>
                                            {[details.statistics.wins, details.statistics.draws, details.statistics.losses]
                                                .map((value: any) => value ?? '-')
                                                .join('-')}
                                        </span>
                                    </div>
                                    <div className={styles.infoRow}>
                                        <span className={styles.label}>Pts +/-</span>
                                        <span className={styles.value}>
                                            {(details.statistics.pointsFor ?? '-')}/{(details.statistics.pointsAgainst ?? '-')}
                                        </span>
                                    </div>
                                </>
                            )}
                            {(details?.type || details?.club_type) && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Tipo</span>
                                    <span className={styles.value}>{details.type || details.club_type}</span>
                                </div>
                            )}
                            {(details?.short_code || details?.code) && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Codigo</span>
                                    <span className={styles.value}>{details.short_code || details.code}</span>
                                </div>
                            )}
                            {(details?.website || details?.website_url) && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Web</span>
                                    <a href={details.website || details.website_url} target="_blank" rel="noopener noreferrer" className={styles.value} style={{ wordBreak: 'break-all' }}>
                                        {(details.website || details.website_url).replace(/^https?:\/\//, '')}
                                    </a>
                                </div>
                            )}
                            {details?.description || details?.about ? (
                                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary, #888)', lineHeight: 1.5 }}>
                                    {details.description || details.about}
                                </div>
                            ) : null}
                            {details?.social_links && typeof details.social_links === 'object' && Object.keys(details.social_links).length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary, #888)', marginBottom: 6 }}>Redes</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {Object.entries(details.social_links as Record<string, string>).map(([network, url]) =>
                                            url ? (
                                                <a key={network} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                                                    {network}
                                                </a>
                                            ) : null
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Cargando equipo...</p>
            </div>
        }>
            <TeamDetailInner params={params} />
        </Suspense>
    );
}
