'use client';

import React, { use, useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { ArrowLeft, ChevronRight, Star } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';

const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'results', label: 'Resultados' },
    { id: 'fixtures', label: 'Fixture' },
    { id: 'squad', label: 'Plantilla' },
    { id: 'transfers', label: 'Transferencias' },
];

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

function TeamDetailInner({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const sp = useSearchParams();
    const { isTeamFavorite, toggleTeamFavorite } = useFavorites();

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<any>(null);
    const [results, setResults] = useState<any[]>([]);
    const [fixtures, setFixtures] = useState<any[]>([]);
    const [squad, setSquad] = useState<any>(null);
    const [transfers, setTransfers] = useState<any[]>([]);

    // Strip fs-team- prefix for the raw FlashScore ID
    const rawId = id.startsWith('fs-team-') ? id.slice(8) : id;

    // Hints from URL search params (passed from match/tournament page links)
    const hintName = sp.get('name') || '';
    const hintTeamUrl = sp.get('team_url') || '';

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const query = new URLSearchParams();
                query.set('team_id', rawId);
                if (hintName) query.set('team_name', hintName);
                if (hintTeamUrl) query.set('team_url', hintTeamUrl);

                const res = await fetch(`/api/teams?${query.toString()}`, { cache: 'no-store' });
                const payload = await res.json();

                if (!res.ok || !payload?.ok) {
                    setError(payload?.error || 'No se pudo cargar los datos del equipo.');
                    return;
                }

                setDetails(payload.details || null);
                setResults(payload.results || []);
                setFixtures(payload.fixtures || []);
                setSquad(payload.squad || null);
                setTransfers(payload.transfers || []);
            } catch (err) {
                console.error('Error fetching team data:', err);
                setError('Error al cargar datos del equipo.');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [rawId, hintName, hintTeamUrl]);

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Cargando equipo...</p>
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
        details?.image_path ||
        details?.logo ||
        details?.team?.image_path ||
        details?.team?.logo ||
        details?.small_image_path ||
        '';
    const countryName = details?.country?.name || details?.country || '';
    const countryFlag = details?.country?.image_path || details?.country?.small_image_path || '';
    const venue = details?.venue?.name || details?.venue || details?.stadium || '';
    const coachName = details?.coach?.name || details?.manager?.name || '';

    // Render a match item (same pattern as tournament page)
    const renderMatchItem = (match: any) => {
        const timestamp = match.timestamp || match.start_time || match.time;
        const date = timestamp ? new Date(timestamp * 1000) : new Date();

        const scoreHome = match.scores?.home ?? match.scores?.home_score ?? match.home_score ?? '-';
        const scoreAway = match.scores?.away ?? match.scores?.away_score ?? match.away_score ?? '-';

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
            <Link href={`/partidos/${match.event_key || match.match_id}`} key={match.event_key || match.match_id} className={styles.matchItem}>
                <div className={styles.matchTime}>
                    <span className={styles.matchDateStr}>{date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', weekday: 'short' })}</span>
                    <span>{date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
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

    // Group squad by position
    const squadGroups = groupSquadByPosition(squad);
    const sortedPositionKeys = Object.keys(squadGroups).map(Number).sort((a, b) => a - b);

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.breadcrumb}>
                        <Link href="/">Inicio</Link>
                        <span className={styles.separator}>/</span>
                        <Link href="/clubes">Clubes</Link>
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
                        </div>
                        <button
                            className={`${styles.followBtn} ${isTeamFavorite(id) ? styles.followBtnActive : ''}`}
                            onClick={() => toggleTeamFavorite(id, { name: teamName, logo: teamLogoUrl })}
                            type="button"
                        >
                            <Star size={16} fill={isTeamFavorite(id) ? 'currentColor' : 'none'} />
                            {isTeamFavorite(id) ? 'Siguiendo' : 'Seguir'}
                        </button>
                    </div>

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
            </header>

            <main className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
                <div className={styles.contentLayout}>
                    <div className={styles.mainColumn}>

                        {/* Summary Tab */}
                        {activeTab === 'summary' && (
                            <>
                                {results.length > 0 && (
                                    <div className={styles.section}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Ultimos Resultados</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('results')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {results.slice(0, 5).map(m => renderMatchItem(m))}
                                        </div>
                                    </div>
                                )}

                                {fixtures.length > 0 && (
                                    <div className={styles.section} style={{ marginTop: '32px' }}>
                                        <div className={styles.sectionHeader}>
                                            <h2>Proximos Partidos</h2>
                                            <button className={styles.linkButton} onClick={() => setActiveTab('fixtures')}>Ver todos</button>
                                        </div>
                                        <div className={styles.matchList}>
                                            {fixtures.slice(0, 5).map(m => renderMatchItem(m))}
                                        </div>
                                    </div>
                                )}

                                {results.length === 0 && fixtures.length === 0 && (
                                    <p className={styles.emptyState}>No hay datos de partidos disponibles.</p>
                                )}
                            </>
                        )}

                        {/* Results Tab */}
                        {activeTab === 'results' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Resultados</h2>
                                <div className={styles.matchList}>
                                    {results.length > 0
                                        ? results.map(m => renderMatchItem(m))
                                        : <p className={styles.emptyState}>No hay resultados registrados.</p>
                                    }
                                </div>
                            </div>
                        )}

                        {/* Fixtures Tab */}
                        {activeTab === 'fixtures' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Fixture</h2>
                                <div className={styles.matchList}>
                                    {fixtures.length > 0
                                        ? fixtures.map(m => renderMatchItem(m))
                                        : <p className={styles.emptyState}>No hay partidos programados.</p>
                                    }
                                </div>
                            </div>
                        )}

                        {/* Squad Tab */}
                        {activeTab === 'squad' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Plantilla</h2>
                                {sortedPositionKeys.length > 0 ? (
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
                                                                    {pId ? <Link href={`/jugadores/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{playerName}</Link> : playerName}
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
