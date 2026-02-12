'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { ArrowLeft, Star } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';

const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'career', label: 'Carrera' },
];

const getTeamLogo = (team: any) => {
    if (!team) return '';
    return team.small_image_path || team.smaill_image_path || team.image_path || team.logo || '';
};

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { isPlayerFavorite, togglePlayerFavorite } = useFavorites();

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<any>(null);
    const [career, setCareer] = useState<any[]>([]);

    const playerId = id.trim();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/players?player_id=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
                const payload = await res.json();

                if (!res.ok || !payload?.ok) {
                    setError(payload?.error || 'No se pudo cargar los datos del jugador.');
                    return;
                }

                setDetails(payload.details || null);
                setCareer(payload.career || []);
            } catch (err) {
                console.error('Error fetching player data:', err);
                setError('Error al cargar datos del jugador.');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [playerId]);

    if (loading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.spinner}></div>
                <p>Cargando jugador...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p>{error}</p>
                <div className={styles.backButton} onClick={() => router.back()}>
                    <ArrowLeft size={16} /> Volver
                </div>
            </div>
        );
    }

    // Extract player info
    const playerName = details?.name || details?.player_name || details?.PLAYER_NAME || playerId;
    const playerPhoto = details?.image_path || details?.photo || details?.small_image_path || '';
    const countryName = details?.country?.name || details?.nationality || '';
    const countryFlag = details?.country?.image_path || details?.country?.small_image_path || '';
    const position = details?.position || details?.player_position || '';
    const age = details?.age || '';
    const height = details?.height || '';
    const weight = details?.weight || '';
    const foot = details?.preferred_foot || details?.foot || '';
    const birthDate = details?.birth_date || details?.birthday || '';
    const currentTeam = details?.team || details?.current_team || null;
    const currentTeamName = currentTeam?.name || currentTeam?.team_name || '';
    const currentTeamId = currentTeam?.team_id || currentTeam?.id || '';
    const currentTeamLogo = getTeamLogo(currentTeam);
    const jerseyNumber = details?.jersey_number || details?.shirt_number || '';

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.breadcrumb}>
                        <Link href="/">Inicio</Link>
                        <span className={styles.separator}>/</span>
                        <Link href="/jugadores">Jugadores</Link>
                        <span className={styles.separator}>/</span>
                        <span className={styles.breadcrumbActive}>{playerName}</span>
                    </div>

                    <div className={styles.headerContent}>
                        <div className={styles.photoContainer}>
                            {playerPhoto ? (
                                <img src={playerPhoto} alt={playerName} className={styles.playerPhoto} />
                            ) : (
                                <div className={styles.photoPlaceholder}>{playerName?.[0]}</div>
                            )}
                        </div>
                        <div className={styles.headerInfo}>
                            <h1 className={styles.title}>{playerName}</h1>
                            <div className={styles.meta}>
                                {countryName && (
                                    <span className={styles.country}>
                                        {countryFlag && <img src={countryFlag} alt="" className={styles.countryFlag} />}
                                        {countryName}
                                    </span>
                                )}
                                {position && <span className={styles.positionBadge}>{position}</span>}
                                {currentTeamName && (
                                    <Link href={`/clubes/fs-team-${currentTeamId}`} className={styles.teamLink}>
                                        {currentTeamName}
                                    </Link>
                                )}
                            </div>
                        </div>
                        <button
                            className={`${styles.followBtn} ${isPlayerFavorite(playerId) ? styles.followBtnActive : ''}`}
                            onClick={() => togglePlayerFavorite(playerId, { name: playerName, team: currentTeamName, position })}
                            type="button"
                        >
                            <Star size={16} fill={isPlayerFavorite(playerId) ? 'currentColor' : 'none'} />
                            {isPlayerFavorite(playerId) ? 'Siguiendo' : 'Seguir'}
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
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Informacion del Jugador</h2>
                                <div className={styles.infoGrid}>
                                    {age && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Edad</div>
                                            <div className={styles.infoValue}>{age}</div>
                                        </div>
                                    )}
                                    {birthDate && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Fecha de Nacimiento</div>
                                            <div className={styles.infoValue}>{birthDate}</div>
                                        </div>
                                    )}
                                    {countryName && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Nacionalidad</div>
                                            <div className={styles.infoValue}>{countryName}</div>
                                        </div>
                                    )}
                                    {position && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Posicion</div>
                                            <div className={styles.infoValue}>{position}</div>
                                        </div>
                                    )}
                                    {height && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Altura</div>
                                            <div className={styles.infoValue}>{height}</div>
                                        </div>
                                    )}
                                    {weight && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Peso</div>
                                            <div className={styles.infoValue}>{weight}</div>
                                        </div>
                                    )}
                                    {foot && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Pie Habil</div>
                                            <div className={styles.infoValue}>{foot}</div>
                                        </div>
                                    )}
                                    {jerseyNumber && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Dorsal</div>
                                            <div className={styles.infoValue}>#{jerseyNumber}</div>
                                        </div>
                                    )}
                                    {currentTeamName && (
                                        <div className={styles.infoItem}>
                                            <div className={styles.infoLabel}>Club Actual</div>
                                            <div className={styles.infoValue}>
                                                <Link href={`/clubes/fs-team-${currentTeamId}`} className={styles.teamLink}>
                                                    {currentTeamName}
                                                </Link>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!age && !position && !countryName && (
                                    <p className={styles.emptyState}>No hay informacion disponible del jugador.</p>
                                )}
                            </div>
                        )}

                        {/* Career Tab */}
                        {activeTab === 'career' && (
                            <div className={styles.section}>
                                <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Trayectoria</h2>
                                {career.length > 0 ? (
                                    <div className={styles.tableCard}>
                                        <div className={styles.tableHeader}>
                                            <div>Equipo</div>
                                            <div>Temporada</div>
                                            <div style={{ textAlign: 'center' }}>PJ</div>
                                            <div style={{ textAlign: 'center' }}>G</div>
                                            <div style={{ textAlign: 'center' }}>A</div>
                                            <div style={{ textAlign: 'center' }}>TA</div>
                                        </div>
                                        {career.map((entry: any, idx: number) => {
                                            const teamName = entry.team?.name || entry.team_name || '-';
                                            const teamId = entry.team?.team_id || entry.team?.id || '';
                                            const teamLogo = getTeamLogo(entry.team) || '';
                                            const season = entry.season || entry.season_name || '-';
                                            const appearances = entry.appearances ?? entry.matches_played ?? entry.games ?? '-';
                                            const goals = entry.goals ?? '-';
                                            const assists = entry.assists ?? '-';
                                            const cards = entry.yellow_cards ?? entry.cards ?? '-';

                                            return (
                                                <div key={idx} className={styles.tableRow}>
                                                    <div className={styles.tdTeam}>
                                                        {teamLogo && <img src={teamLogo} alt="" className={styles.teamLogoSmall} />}
                                                        {teamId ? (
                                                            <Link href={`/clubes/fs-team-${teamId}`} className={styles.teamLink}>
                                                                {teamName}
                                                            </Link>
                                                        ) : (
                                                            <span>{teamName}</span>
                                                        )}
                                                    </div>
                                                    <div style={{ color: 'var(--color-text-secondary)' }}>{season}</div>
                                                    <div className={styles.tdVal}>{appearances}</div>
                                                    <div className={styles.tdHighlight}>{goals}</div>
                                                    <div className={styles.tdVal}>{assists}</div>
                                                    <div className={styles.tdVal}>{cards}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className={styles.emptyState}>No hay datos de trayectoria disponibles.</p>
                                )}
                            </div>
                        )}

                    </div>

                    {/* Sidebar */}
                    <aside className={styles.sidebarRight}>
                        <div className={styles.card}>
                            <h3>Jugador</h3>
                            {playerPhoto && (
                                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 12px' }}>
                                    <img src={playerPhoto} alt={playerName} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                                </div>
                            )}
                            {position && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Posicion</span>
                                    <span className={styles.value}>{position}</span>
                                </div>
                            )}
                            {countryName && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Nacionalidad</span>
                                    <span className={styles.value}>{countryName}</span>
                                </div>
                            )}
                            {age && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Edad</span>
                                    <span className={styles.value}>{age}</span>
                                </div>
                            )}
                            {currentTeamName && (
                                <div className={styles.infoRow}>
                                    <span className={styles.label}>Club</span>
                                    <span className={styles.value}>
                                        <Link href={`/clubes/fs-team-${currentTeamId}`} className={styles.teamLink}>
                                            {currentTeamName}
                                        </Link>
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
