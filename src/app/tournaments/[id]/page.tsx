'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { getTournamentById } from '@/lib/data/tournaments';
import { ArrowLeft, Calendar, Trophy, Users, MapPin, ChevronRight, Share2, Star, Download } from 'lucide-react';
import ExportImage from '@/components/ExportImage';
import { useFavorites } from '@/hooks/useFavorites';
import { setCachedLogo } from '@/lib/utils/logoCache';

// Tabs configuration
const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'standings', label: 'Clasificación' },
    { id: 'teams', label: 'Equipos' },
    { id: 'stats', label: 'Estadísticas' }, // Future
];

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
    const [standingsView, setStandingsView] = useState<'overall' | 'form' | 'htft' | 'overunder'>('overall');

    const getTeamLogo = (team: any) => {
        if (!team) return '';
        return (
            team.small_image_path ||
            team.smaill_image_path ||
            team.image_path ||
            team.logo ||
            team.logo_path ||
            ''
        );
    };

    const getTournamentLogo = (detailsData: any, localData: any) => {
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
    };

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // 1. Get Local Data
                let localTournament = getTournamentById(id);

                if (!localTournament) {
                    const fsPrefix = 'fs-';
                    if (id.toLowerCase().startsWith(fsPrefix)) {
                        // Temporary object
                        localTournament = {
                            id: id,
                            name: 'Cargando...',
                            url: '', // Will try to find later
                            type: 'cup', // Default valid type
                            sportId: 'football',
                            countryId: 'international', // Default valid country
                            categories: [],
                            priority: 0
                        } as any;
                    } else {
                        setError('Torneo no encontrado en nuestra base de datos.');
                        setLoading(false);
                        return;
                    }
                }

                setTournamentData(localTournament);

                const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
                const overrideTournamentId = sp.get('tournament_id') || sp.get('tournamentId');
                const overrideStageId = sp.get('tournament_stage_id') || sp.get('tournamentStageId') || sp.get('stageId');
                const urlParam = sp.get('url');
                const finalUrl = localTournament?.url || urlParam;

                const query = new URLSearchParams();
                query.set('id', id);
                if (finalUrl) query.set('url', finalUrl);
                if (localTournament?.sportId) query.set('sport', localTournament.sportId);
                if (overrideTournamentId) query.set('tournament_id', overrideTournamentId);
                if (overrideStageId) query.set('tournament_stage_id', overrideStageId);

                const res = await fetch(`/api/tournaments?${query.toString()}`, {
                    cache: 'no-store'
                });
                const payload = await res.json();
                console.log('TOURNAMENT API PAYLOAD:', payload);

                const detailsValid = Array.isArray(payload?.details)
                    ? payload.details.length > 0
                    : !!(payload?.details && (
                        payload.details?.name ||
                        payload.details?.tournament?.name ||
                        payload.details?.tournament_name ||
                        payload.details?.league_name ||
                        payload.details?.competition?.name
                    ));

                const hasAnyData = !!(
                    detailsValid ||
                    (payload?.results && payload.results.length) ||
                    (payload?.fixtures && payload.fixtures.length) ||
                    (payload?.standings && payload.standings.length) ||
                    (payload?.topScorers && payload.topScorers.length)
                );

                if (!res.ok || !payload?.ok || !hasAnyData) {
                    setError(payload?.error || 'No se pudo conectar con la fuente de datos externa.');
                    return;
                }

                if (payload.details) {
                    setDetails(payload.details);

                    // Persistence: Save discovered logo to cache
                    const discoveredLogo =
                        payload.details.image_path ||
                        payload.details.logo ||
                        payload.details.logo_path ||
                        payload.details.tournament_logo ||
                        payload.details.tournament_image_path;

                    if (discoveredLogo) {
                        setCachedLogo(id, discoveredLogo);
                    }

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
                setArchives(payload.archives || []);
            } catch (err) {
                console.error('Error fetching tournament data:', err);
                setError('Error al cargar datos del torneo.');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [id]);

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

    // Helper to format match items
    const renderMatchItem = (match: any, isResult: boolean) => {
        // Handle various timestamp formats
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : new Date();
        const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        // Handle various score formats
        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score ?? '-';
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score ?? '-';

        // Handle various team formats
        const homeName = match.home_team?.name || match.event_home_team || match.home_team_name || 'Home';
        const awayName = match.away_team?.name || match.event_away_team || match.away_team_name || 'Away';

        const homeLogo = getTeamLogo(match.home_team) || match.home_team_logo || match.home_team_logo_path || '';
        const awayLogo = getTeamLogo(match.away_team) || match.away_team_logo || match.away_team_logo_path || '';

        // Determine winner
        const homeWon = typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreHome > scoreAway;
        const awayWon = typeof scoreHome === 'number' && typeof scoreAway === 'number' && scoreAway > scoreHome;

        const isLive = match.status === 'live' || match.status === 'in_play';
        const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;

        return (
            <Link
                href={`/partidos/${match.event_key || match.match_id}`}
                key={match.event_key || match.match_id}
                className={styles.matchRow}
            >
                <div className={styles.matchTime}>
                    {isLive ? (
                        <span className={styles.matchLive}>
                            <span className={styles.matchLiveDot}></span>
                            {match.minute || 'Live'}
                        </span>
                    ) : isFinished ? (
                        <span className={styles.matchFinished}>FT</span>
                    ) : (
                        <span className={styles.matchTimeText}>{timeStr}</span>
                    )}
                </div>

                <div className={styles.matchTeams}>
                    <div className={`${styles.matchTeam} ${homeWon ? styles.winner : ''}`}>
                        <span className={styles.teamLogo}>
                            {homeLogo ? (
                                <img src={homeLogo} alt={homeName} className={styles.logoImgSquare} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : null}
                        </span>
                        <span className={styles.teamName}>{homeName}</span>
                        <span className={styles.teamScore}>{scoreHome}</span>
                    </div>
                    <div className={`${styles.matchTeam} ${awayWon ? styles.winner : ''}`}>
                        <span className={styles.teamLogo}>
                            {awayLogo ? (
                                <img src={awayLogo} alt={awayName} className={styles.logoImgSquare} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : null}
                        </span>
                        <span className={styles.teamName}>{awayName}</span>
                        <span className={styles.teamScore}>{scoreAway}</span>
                    </div>
                </div>
            </Link>
        );
    };
    const renderStandingsHeader = () => (
        <div className={styles.tableHeader}>
            <div className={styles.colPos}>#</div>
            <div className={styles.colTeam}>Equipo</div>
            <div className={`${styles.colVal} styles.colValPJ`}>J</div>
            <div className={styles.colVal}>G</div>
            <div className={styles.colVal}>E</div>
            <div className={styles.colVal}>P</div>
            <div className={`${styles.colVal} styles.colValDG`}>DG</div>
            <div className={styles.colPts}>PTS</div>
        </div>
    );

    const renderStandingsRow = (row: any, idx: number) => {
        const pos = row.position || (idx + 1);
        const borderColor = pos <= 4 ? styles.borderGreen : pos <= 6 ? styles.borderYellow : '';
        const logo = row.team?.logo || row.team?.image_path || row.team?.small_image_path || row.participant?.image_path || row.participant?.small_image_path || row.logo || row.team_logo;
        const teamName = row.team?.name || row.participant?.name || row.name;
        const teamId = row.team?.id || row.team?.team_id || row.participant?.id || row.team_id;

        return (
            <div key={idx} className={styles.tableRow}>
                {borderColor && <div className={`${styles.rowBorder} ${borderColor}`} />}
                <div className={styles.colPos}>{pos}</div>
                <div className={styles.colTeam}>
                    {logo ? (
                        <img src={logo} alt={teamName} className={styles.teamLogo} />
                    ) : (
                        <div className={styles.teamLogoPlaceholder} style={{ width: 24, height: 24 }}></div>
                    )}
                    {teamId ? (
                        <Link href={`/clubes/fs-team-${teamId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {teamName}
                        </Link>
                    ) : (
                        <span>{teamName}</span>
                    )}
                </div>
                <div className={`${styles.colVal} styles.colValPJ`}>{row.matches_total || row.matches_played}</div>
                <div className={styles.colVal}>{row.wins_total || row.wins}</div>
                <div className={styles.colVal}>{row.draws_total || row.draws}</div>
                <div className={styles.colVal}>{row.losses_total || row.losses}</div>
                <div className={`${styles.colVal} styles.colValDG`}>
                    {(row.goals_for && row.goals_against) ? (row.goals_for - row.goals_against) : (row.goal_difference || '0')}
                </div>
                <div className={styles.colPts}>{row.points_total || row.points}</div>
            </div>
        );
    };

    const normalizeStandingsRows = (raw: any[]): any[] => {
        if (!Array.isArray(raw) || raw.length === 0) return [];

        // If it's a grouped list (A, B, C...) and not just one Overall group
        if (raw[0]?.rows) {
            if (raw.length > 1) {
                // Return original groups to preserve structure
                return raw;
            }
            return raw[0].rows || [];
        }

        if (raw[0]?.team_id || raw[0]?.participant || raw[0]?.name) {
            return raw;
        }
        return [];
    };

    const standingsSource =
        standingsView === 'form' ? standingsForm :
            standingsView === 'htft' ? standingsHtFt :
                standingsView === 'overunder' ? standingsOverUnder :
                    standings;

    const overallRows = normalizeStandingsRows(standings);
    const activeRows = normalizeStandingsRows(standingsSource);

    // Construct year string
    const yearDisplay = details?.is_current
        ? (details?.season || details?.season_id ? (details?.season || 'Temporada Actual') : 'Temporada Actual')
        : (details?.start_year && details?.end_year)
            ? `${details.start_year}/${details.end_year}`
            : (details?.season || new Date().getFullYear());

    const countryName = details?.country?.name || details?.country || 'Internacional';
    const countryFlag = details?.country?.image_path || details?.country?.small_image_path || details?.country_logo;
    const tournamentLogo = getTournamentLogo(details, tournamentData);

    // Build unique team list (for Teams tab)
    const teamMap = new Map<string, { name: string; logo: string }>();

    if (overallRows.length > 0) {
        overallRows.forEach((row: any) => {
            const name = row.team?.name || row.participant?.name || row.name;
            const logo =
                row.team?.logo ||
                row.team?.image_path ||
                row.team?.small_image_path ||
                row.participant?.image_path ||
                row.participant?.small_image_path ||
                row.logo ||
                row.team_logo ||
                '';
            if (name) teamMap.set(name, { name, logo });
        });
    }

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

    if (results.length > 0) addFromMatches(results);
    if (fixtures.length > 0) addFromMatches(fixtures);

    const teamsList = Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className={styles.page}>
            {/* Header / Hero */}
            <header className={styles.header}>
                <div className="g22-container">
                    <div className={styles.breadcrumb}>
                        <Link href="/">Partidos</Link>
                        <span className={styles.separator}>/</span>
                        <span className={styles.breadcrumbActive}>{tournamentData?.name}</span>
                    </div>

                    <div className={styles.headerContent}>
                        <div className={styles.logoContainer}>
                            {tournamentLogo ? (
                                <img src={tournamentLogo} alt={tournamentData?.name} className={styles.tournamentLogo} />
                            ) : (
                                <div className={styles.logoPlaceholder}>{tournamentData?.name?.[0]}</div>
                            )}
                        </div>
                        <div className={styles.headerInfo}>
                            <h1>{details?.name || details?.tournament?.name || tournamentData?.name}</h1>
                            <div className={styles.countryLabel}>{countryName}</div>
                        </div>
                        <button
                            className={`${styles.followBtn} ${isLeagueFavorite(id) ? styles.followBtnActive : ''}`}
                            onClick={() => toggleLeagueFavorite(id)}
                            type="button"
                        >
                            {isLeagueFavorite(id) ? 'Siguiendo' : 'Seguir'}
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className={styles.tabsContainer}>
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
            </header>

            <main className="g22-container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
                <div className={styles.contentLayout}>
                    {/* Main Feed */}
                    <div className={styles.mainColumn}>

                        {activeTab === 'summary' && (
                            <>
                                {/* Last Results Preview */}
                                {results.length > 0 && (
                                    <div className={styles.section}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Últimos Resultados</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('results')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {results.slice(0, 5).map(m => renderMatchItem(m, true))}
                                        </div>
                                    </div>
                                )}

                                {/* Next Fixtures Preview */}
                                {fixtures.length > 0 && (
                                    <div className={styles.section} style={{ marginTop: '32px' }}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Próximos Partidos</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('fixtures')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {fixtures.slice(0, 5).map(m => renderMatchItem(m, false))}
                                        </div>
                                    </div>
                                )}

                                {/* Standings Preview */}
                                {overallRows.length > 0 && (
                                    <div className={styles.section} style={{ marginTop: '32px' }}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Tabla de Posiciones</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('standings')}>Ver completa</button>
                                        </div>

                                        {overallRows[0]?.rows ? (
                                            // Grouped View Preview
                                            <div className={styles.groupsGridPreview}>
                                                {overallRows.slice(0, 4).map((group: any, gidx: number) => (
                                                    <div key={gidx} className={styles.groupPreview}>
                                                        <h3 className={styles.groupTitleSmall}>{group.group_name}</h3>
                                                        <div className={styles.tableCard}>
                                                            {renderStandingsHeader()}
                                                            {(group.rows || []).slice(0, 4).map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            // Flat View Preview
                                            <div className={styles.tableCard}>
                                                {renderStandingsHeader()}
                                                {overallRows.slice(0, 10).map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {activeTab === 'results' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
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
                                                status: 'finished'
                                            }))
                                        }}
                                    />
                                </div>
                                <div className={styles.matchList}>
                                    {results.length > 0 ? results.map(m => renderMatchItem(m, true)) : <p className={styles.emptyState}>No hay resultados registrados.</p>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'fixtures' && (
                            <div className={styles.section}>
                                <div className={styles.sectionHeader} style={{ marginBottom: '16px' }}>
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
                                                time: new Date((m.timestamp || m.start_time || m.time) * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date((m.timestamp || m.start_time || m.time) * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
                                                status: 'scheduled'
                                            }))
                                        }}
                                    />
                                </div>
                                <div className={styles.matchList}>
                                    {fixtures.length > 0 ? fixtures.map(m => renderMatchItem(m, false)) : <p className={styles.emptyState}>No hay partidos programados.</p>}
                                </div>
                            </div>
                        )}

                        {activeTab === 'standings' && (
                            <div className={styles.section}>
                                <div className={styles.standingsToolbar}>
                                    <div className={styles.pillsGroup}>
                                        <button
                                            className={`${styles.pillBtn} ${standingsView === 'overall' ? styles.pillBtnActive : ''}`}
                                            onClick={() => setStandingsView('overall')}
                                        >
                                            Resumida
                                        </button>
                                        <button
                                            className={`${styles.pillBtn} ${standingsView === 'overall' ? styles.pillBtnActive : ''}`}
                                            onClick={() => setStandingsView('overall')}
                                        >
                                            Completa
                                        </button>
                                        <button
                                            className={`${styles.pillBtn} ${standingsView === 'form' ? styles.pillBtnActive : ''}`}
                                            onClick={() => setStandingsView('form')}
                                        >
                                            Forma
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button className={styles.dropdownBtn}>
                                            Global <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                                        </button>
                                        <ExportImage
                                            template="standings"
                                            filename={`tabla-${tournamentData?.name}`}
                                            data={{
                                                title: tournamentData?.name || 'Tabla de Posiciones',
                                                subtitle: details?.season || 'Clasificación',
                                                rows: activeRows.map((row: any, idx: number) => ({
                                                    pos: row.position || (idx + 1),
                                                    team: row.team?.name || row.participant?.name || row.name || 'Equipo',
                                                    played: row.matches_total || row.matches_played || 0,
                                                    won: row.wins_total || row.wins || 0,
                                                    lost: row.losses_total || row.losses || 0,
                                                    diff: String((row.goals_for && row.goals_against) ? (row.goals_for - row.goals_against) : (row.goal_difference || '0')),
                                                    points: row.points_total || row.points || 0
                                                }))
                                            }}
                                        />
                                    </div>
                                </div>

                                {activeRows.length === 0 && (
                                    <p className={styles.emptyState}>Tabla no disponible.</p>
                                )}

                                {activeRows.length > 0 && (standingsView === 'overall' || standingsView === 'form') && (
                                    <div className={styles.standingsContainer}>
                                        {activeRows[0]?.rows ? (
                                            // Grouped Full View
                                            <div className={styles.groupsStack}>
                                                {activeRows.map((group: any, gidx: number) => (
                                                    <div key={gidx} className={styles.groupBlock}>
                                                        <h3 className={styles.groupTitleLarge}>{group.group_name}</h3>
                                                        <div className={styles.tableCard}>
                                                            {renderStandingsHeader()}
                                                            {(group.rows || []).map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            // Flat Full View
                                            <div className={styles.tableCard}>
                                                {renderStandingsHeader()}
                                                {activeRows.map((row: any, idx: number) => renderStandingsRow(row, idx))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeRows.length > 0 && standingsView === 'overunder' && (
                                    <div className={styles.tableCard}>
                                        <div className={styles.tableHeader} style={{ gridTemplateColumns: '40px 1fr 60px 60px 90px 90px' }}>
                                            <div className={styles.thPos}>#</div>
                                            <div className={styles.thTeam}>Equipo</div>
                                            <div className={styles.thVal}>Over</div>
                                            <div className={styles.thVal}>Under</div>
                                            <div className={styles.thVal}>Goles</div>
                                            <div className={styles.thVal}>Prom</div>
                                        </div>
                                        {activeRows.map((row: any, idx: number) => (
                                            <div key={idx} className={styles.tableRow} style={{ gridTemplateColumns: '40px 1fr 60px 60px 90px 90px' }}>
                                                <div className={styles.tdPos}>{idx + 1}</div>
                                                <div className={styles.tdTeam}>
                                                    <span>{row.team?.name || row.participant?.name || row.name}</span>
                                                </div>
                                                <div className={styles.tdVal}>{row.over ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.under ?? '-'}</div>
                                                <div className={styles.tdVal}>{row.goals ?? '-'}</div>
                                                <div className={styles.tdVal}>
                                                    {typeof row.average_goals_per_match === 'number'
                                                        ? row.average_goals_per_match.toFixed(1)
                                                        : (row.average_goals_per_match ?? '-')}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {activeRows.length > 0 && standingsView === 'htft' && (
                                    <div className={styles.tableScroll}>
                                        <div className={styles.tableCard} style={{ minWidth: '980px' }}>
                                            <div className={styles.tableHeader} style={{ gridTemplateColumns: '40px 1fr repeat(9, 50px) 60px' }}>
                                                <div className={styles.thPos}>#</div>
                                                <div className={styles.thTeam}>Equipo</div>
                                                <div className={styles.thVal}>WW</div>
                                                <div className={styles.thVal}>WD</div>
                                                <div className={styles.thVal}>WL</div>
                                                <div className={styles.thVal}>DW</div>
                                                <div className={styles.thVal}>DD</div>
                                                <div className={styles.thVal}>DL</div>
                                                <div className={styles.thVal}>LW</div>
                                                <div className={styles.thVal}>LD</div>
                                                <div className={styles.thVal}>LL</div>
                                                <div className={styles.thVal}>Pts</div>
                                            </div>
                                            {activeRows.map((row: any, idx: number) => (
                                                <div key={idx} className={styles.tableRow} style={{ gridTemplateColumns: '40px 1fr repeat(9, 50px) 60px' }}>
                                                    <div className={styles.tdPos}>{idx + 1}</div>
                                                    <div className={styles.tdTeam}>
                                                        <span>{row.team?.name || row.participant?.name || row.name}</span>
                                                    </div>
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
                                )}
                            </div>
                        )}

                        {activeTab === 'teams' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle}>Equipos</h2>
                                {teamsList.length > 0 ? (
                                    <div className={styles.matchList}>
                                        {teamsList.map((team) => (
                                            <div key={team.name} className={styles.matchItem} style={{ alignItems: 'center' }}>
                                                <div className={styles.teamInfo}>
                                                    {team.logo ? (
                                                        <img src={team.logo} alt={team.name} className={styles.teamLogoSmall} />
                                                    ) : (
                                                        <div className={styles.teamLogoPlaceholder} />
                                                    )}
                                                    <span>{team.name}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={styles.emptyState}>Equipos no disponibles.</p>
                                )}
                            </div>
                        )}

                        {activeTab === 'stats' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle}>Goleadores</h2>
                                {topScorers.length > 0 ? (
                                    <div className={styles.tableCard}>
                                        <div className={styles.tableHeader} style={{ gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                            <div>#</div>
                                            <div>Jugador</div>
                                            <div>Equipo</div>
                                            <div style={{ textAlign: 'center' }}>G</div>
                                            <div style={{ textAlign: 'center' }}>A</div>
                                        </div>
                                        {topScorers.slice(0, 20).map((player: any, idx: number) => (
                                            <div key={idx} className={styles.tableRow} style={{ gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                                <div className={styles.tdPos}>{idx + 1}</div>
                                                <div className={styles.tdTeam}>
                                                    <span>{player.player_name || player.name}</span>
                                                </div>
                                                <div className={styles.tdTeam} style={{ color: 'var(--color-text-secondary)' }}>
                                                    <span>{player.team_name || player.team?.name}</span>
                                                </div>
                                                <div className={`${styles.tdVal} ${styles.tdPoints}`}>{player.goals}</div>
                                                <div className={styles.tdVal}>{player.assists || '-'}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={styles.emptyState}>No hay estadísticas disponibles.</p>
                                )}
                            </div>
                        )}

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
                                                onClick={() => {
                                                    // Optional: Force reload or state reset if Link doesn't trigger full refresh
                                                    // In Next.js, parameters change triggers update in useEffect, so it should be fine.
                                                }}
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

                    </div>

                    {/* Right Sidebar */}
                    <aside className={styles.sidebarRight}>
                        <div className={styles.card}>
                            <h3>Torneo</h3>
                            {tournamentLogo && (
                                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 12px' }}>
                                    <img src={tournamentLogo} alt={tournamentData?.name} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                                </div>
                            )}
                            <div className={styles.infoRow}>
                                <span className={styles.label}>Deporte</span>
                                <span className={styles.value}>{tournamentData?.sportId}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.label}>País</span>
                                <span className={styles.value}>{countryName}</span>
                            </div>
                            {/* Additional Metadata from Details */}
                            {details?.winner && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Campeón Vigente</span>
                                    <span className={styles.value} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {details.winner.image_path && <img src={details.winner.image_path} alt="" width={16} height={16} />}
                                        {details.winner.name}
                                    </span>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

