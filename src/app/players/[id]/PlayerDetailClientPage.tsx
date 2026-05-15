'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { ArrowLeft, Star } from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorites';
import { FAVORITE_PLAYERS_ENABLED } from '@/lib/favorites/config';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';

const TABS = [
    { id: 'summary', label: 'Resumen' },
    { id: 'career', label: 'Carrera' },
];

const getTeamLogo = (team: any) => {
    return resolveTeamLogo(team);
};

const buildTeamHref = (teamId?: string | null) => {
    if (!teamId) return '/clubs';
    if (
        teamId.startsWith('fs-team-') ||
        teamId.startsWith('ras-team-') ||
        teamId.startsWith('espn-soccer-team-') ||
        teamId.startsWith('espn-team-') ||
        teamId.startsWith('sofa-team-')
    ) {
        return `/clubs/${teamId}`;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId)) {
        return `/clubs/${teamId}`;
    }
    return `/clubs/fs-team-${teamId}`;
};

export default function PlayerDetailClientPage({ id }: { id: string }) {
    const router = useRouter();
    const playerId = id.trim();
    const { isFavorited, toggle: toggleFavorite } = useFavorite('player', playerId);

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<any>(null);
    const [career, setCareer] = useState<any[]>([]);

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
            <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff' }}>
                <div style={{ background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)', padding: '24px 16px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: 80, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ width: '50%', height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ width: 72, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                <div style={{ width: 90, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{ height: 64, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
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
    const seasonStats: Array<{
        display_name?: string;
        league_slug?: string;
        stats?: Array<{ key?: string; label?: string; short_label?: string; value?: string | number }>;
    }> = Array.isArray(details?.season_stats) ? details.season_stats : [];
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
                        <Link href="/players">Jugadores</Link>
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
                                    <Link href={buildTeamHref(currentTeamId)} className={styles.teamLink}>
                                        {currentTeamName}
                                    </Link>
                                )}
                            </div>
                        </div>
                        {FAVORITE_PLAYERS_ENABLED && (
                            <button
                                className={`${styles.followBtn} ${isFavorited ? styles.followBtnActive : ''}`}
                                onClick={() => toggleFavorite({
                                    name: playerName,
                                    logo_url: playerPhoto || null,
                                    type_label: 'Jugador',
                                })}
                                type="button"
                            >
                                <Star size={16} fill={isFavorited ? 'currentColor' : 'none'} />
                                {isFavorited ? 'Siguiendo' : 'Seguir'}
                            </button>
                        )}
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
                                                <Link href={buildTeamHref(currentTeamId)} className={styles.teamLink}>
                                                    {currentTeamName}
                                                </Link>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {seasonStats.length > 0 && (
                                    <div style={{ marginTop: 24 }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Estadisticas por temporada</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {seasonStats.map((split, idx) => {
                                                const items = (split.stats || []).filter(s => {
                                                    const raw = String(s?.value ?? '').trim();
                                                    return raw !== '' && raw !== '0' && raw !== '-';
                                                });
                                                if (items.length === 0) return null;
                                                return (
                                                    <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                                                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                                                            {split.display_name || 'Temporada'}
                                                        </div>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                                            {items.map((s, sidx) => (
                                                                <div key={sidx} style={{ minWidth: 64 }}>
                                                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }} title={s.label || ''}>{s.short_label || s.label || s.key}</div>
                                                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

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
                                                            <Link href={`/clubs/fs-team-${teamId}`} className={styles.teamLink}>
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
                                        <Link href={buildTeamHref(currentTeamId)} className={styles.teamLink}>
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
