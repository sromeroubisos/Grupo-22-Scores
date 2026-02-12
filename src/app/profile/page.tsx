'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/hooks/useFavorites';
import { getTournamentById } from '@/lib/data/tournaments';
import styles from './page.module.css';

type TabKey = 'favoritos' | 'configuracion' | 'actividad';



export default function ProfilePage() {
    const { user } = useAuth();
    const { favorites, toggleLeagueFavorite, toggleTeamFavorite, togglePlayerFavorite } = useFavorites();
    const [activeTab, setActiveTab] = useState<TabKey>('favoritos');
    const [searchQuery, setSearchQuery] = useState('');

    const profile = useMemo(() => {
        const baseName = user?.name || 'Usuario Regular';
        const avatar = baseName
            .split(' ')
            .map((chunk) => chunk[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

        return {
            name: baseName,
            username: user?.email ? user.email.split('@')[0] : 'usuario',
            location: 'Buenos Aires, AR',
            favoriteSport: 'Rugby',
            avatar
        };
    }, [user]);

    const teams = useMemo(() => {
        return Array.from(favorites.teams.entries()).map(([id, info]) => ({
            id,
            name: info.name,
            logo: info.logo,
        }));
    }, [favorites.teams]);

    const leagues = useMemo(() => {
        return Array.from(favorites.leagues)
            .map(id => getTournamentById(id))
            .filter((t): t is NonNullable<typeof t> => t != null);
    }, [favorites.leagues]);

    const players = useMemo(() => {
        return Array.from(favorites.players.entries()).map(([id, info]) => ({
            id,
            name: info.name,
            team: info.team,
            position: info.position,
        }));
    }, [favorites.players]);

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <section className={`${styles.headerCard} ${activeTab === 'favoritos' ? styles.hideOnMobile : ''}`}>
                    <div className={styles.profileRow}>
                        <div className={styles.avatar}>{profile.avatar}</div>
                        <div className={styles.profileInfo}>
                            <div className={styles.name}>{profile.name}</div>
                            <div className={styles.meta}>@{profile.username} · {profile.location}</div>
                            <div className={styles.badgeRow}>
                                <span className={styles.badge}>Deporte favorito</span>
                                <span className={`${styles.badge} ${styles.badgeHighlight}`}>{profile.favoriteSport}</span>
                            </div>
                        </div>
                    </div>
                    <div className={styles.headerActions}>
                        <button className="btn btn-secondary" type="button">Editar perfil</button>
                    </div>
                </section>

                <section className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'favoritos' ? styles.tabActive : ''}`}
                        type="button"
                        onClick={() => setActiveTab('favoritos')}
                    >
                        Favoritos
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'configuracion' ? styles.tabActive : ''}`}
                        type="button"
                        onClick={() => setActiveTab('configuracion')}
                    >
                        Configuración
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'actividad' ? styles.tabActive : ''}`}
                        type="button"
                        onClick={() => setActiveTab('actividad')}
                    >
                        Actividad
                    </button>
                </section>

                {activeTab === 'favoritos' && (
                    <section className={styles.section}>
                        <div className={styles.followingHeader}>
                            <div className={styles.listSectionHeader}>
                                <h2 className={styles.listSectionTitle}>Siguiendo</h2>
                                <span className={styles.listAction}>Editar</span>
                            </div>
                            <div className={styles.searchArea}>
                                <div className={styles.mainSearchField}>
                                    <span className={styles.searchIcon}>🔍</span>
                                    <input
                                        type="text"
                                        className={styles.searchInput}
                                        placeholder="Buscar torneo, país o deporte..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Mixed Results / Filtered View */}
                        <div className={styles.followingList}>
                            {/* Filtered Teams */}
                            {teams
                                .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map((team) => (
                                    <div key={team.id} className={styles.followingListItem}>
                                        <div className={styles.listIcon}>
                                            {team.logo ? <img src={team.logo} alt={team.name} /> : <span>🛡️</span>}
                                        </div>
                                        <div className={styles.listInfo}>
                                            <div className={styles.listTitle}>{team.name}</div>
                                            <div className={styles.listMeta}>Equipo</div>
                                        </div>
                                    </div>
                                ))}

                            {/* Filtered Leagues */}
                            {leagues
                                .filter(l => (l.nameEs || l.name).toLowerCase().includes(searchQuery.toLowerCase()))
                                .map((league) => (
                                    <div key={league.id} className={styles.followingListItem}>
                                        <div className={styles.listIcon}>
                                            <span>🏆</span>
                                        </div>
                                        <div className={styles.listInfo}>
                                            <div className={styles.listTitle}>{league.nameEs || league.name}</div>
                                            <div className={styles.listMeta}>Torneo</div>
                                        </div>
                                    </div>
                                ))}

                            {/* Filtered Players */}
                            {players
                                .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map((player) => (
                                    <div key={player.id} className={styles.followingListItem}>
                                        <div className={styles.listIcon}>
                                            <span>👤</span>
                                        </div>
                                        <div className={styles.listInfo}>
                                            <div className={styles.listTitle}>{player.name}</div>
                                            <div className={styles.listMeta}>{player.team} · Jugador</div>
                                        </div>
                                    </div>
                                ))}

                            {searchQuery &&
                                teams.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                                leagues.filter(l => (l.nameEs || l.name).toLowerCase().includes(searchQuery.toLowerCase())).length === 0 &&
                                players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                                    <div className={styles.emptyState}>No se han encontrado resultados para "{searchQuery}"</div>
                                )}

                            {!searchQuery && teams.length === 0 && leagues.length === 0 && players.length === 0 && (
                                <div className={styles.emptyState}>No tienes elementos siguiendo.</div>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === 'configuracion' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Configuración básica</h2>
                                <p className={styles.sectionSubtitle}>Gestión mínima de tu cuenta y preferencias.</p>
                            </div>
                        </div>

                        <div className={styles.configGrid}>
                            <div className={styles.configCard}>
                                <h3 className={styles.groupTitle}>Cuenta</h3>
                                <div className={styles.configItem}>
                                    <div>
                                        <div className={styles.itemTitle}>Foto de perfil</div>
                                        <div className={styles.itemMeta}>Actualiza tu avatar.</div>
                                    </div>
                                    <button className="btn btn-secondary" type="button">Cambiar foto</button>
                                </div>
                                <div className={styles.configItem}>
                                    <div>
                                        <div className={styles.itemTitle}>Contraseña</div>
                                        <div className={styles.itemMeta}>Gestiona tu nivel de seguridad.</div>
                                    </div>
                                    <button className="btn btn-secondary" type="button">Cambiar</button>
                                </div>
                            </div>

                            <div className={styles.configCard}>
                                <h3 className={styles.groupTitle}>Notificaciones</h3>
                                <div className={styles.toggleList}>
                                    <div className={styles.toggleItem}>
                                        <span>Partidos en vivo</span>
                                        <button className={styles.switch} aria-pressed="true" type="button" />
                                    </div>
                                    <div className={styles.toggleItem}>
                                        <span>Resultados</span>
                                        <button className={styles.switch} aria-pressed="true" type="button" />
                                    </div>
                                    <div className={styles.toggleItem}>
                                        <span>Noticias</span>
                                        <button className={styles.switch} aria-pressed="false" type="button" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )
                }

                {
                    activeTab === 'actividad' && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <div>
                                    <h2 className={styles.sectionTitle}>Actividad reciente</h2>
                                    <p className={styles.sectionSubtitle}>Próximamente: Historial de interacciones y comentarios.</p>
                                </div>
                            </div>
                            <div className={styles.emptyState}>Disponible en la siguiente versión.</div>
                        </section>
                    )
                }
            </div >
        </div >
    );
}

