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
                <section className={styles.headerCard}>
                    <div className={styles.profileRow}>
                        <div className={styles.avatar}>{profile.avatar}</div>
                        <div className={styles.profileInfo}>
                            <div className={styles.name}>{profile.name}</div>
                            <div className={styles.meta}>@{profile.username} Â· {profile.location}</div>
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
                        Configuracion
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
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Tus favoritos</h2>
                                <p className={styles.sectionSubtitle}>
                                    Personalizan el inicio, notificaciones y la prioridad de partidos en vivo.
                                </p>
                            </div>
                            <div className={styles.favoriteSport}>
                                <span className={styles.label}>Deporte principal</span>
                                <select className={styles.select} defaultValue={profile.favoriteSport}>
                                    <option>Rugby</option>
                                    <option>Hockey</option>
                                    <option>Futbol</option>
                                    <option>Basquet</option>
                                    <option>Otro</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.group}>
                            <h3 className={styles.groupTitle}>Equipos favoritos</h3>
                            {teams.length === 0 ? (
                                <div className={styles.emptyState}>
                                    No tienes equipos favoritos. Marca equipos con la estrella desde los partidos.
                                </div>
                            ) : (
                                <div className={styles.cardGrid}>
                                    {teams.map((team) => (
                                        <div key={team.id} className={styles.noteCard}>
                                            <div className={styles.cardHeaderRow}>
                                                {team.logo ? (
                                                    <img src={team.logo} alt={team.name} className={styles.logoCircle} style={{ objectFit: 'contain' }} />
                                                ) : (
                                                    <div className={styles.logoCircle}>
                                                        {team.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className={styles.itemTitle}>{team.name}</div>
                                                </div>
                                            </div>
                                            <div className={styles.cardActions}>
                                                <button
                                                    className="btn btn-ghost"
                                                    type="button"
                                                    onClick={() => toggleTeamFavorite(team.id)}
                                                >
                                                    Quitar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={styles.group}>
                            <h3 className={styles.groupTitle}>Ligas / Torneos favoritos</h3>
                            {leagues.length === 0 ? (
                                <div className={styles.emptyState}>
                                    No tienes ligas favoritas. Marca ligas con la estrella desde la pantalla principal.
                                </div>
                            ) : (
                                <div className={styles.cardGrid}>
                                    {leagues.map((league) => {
                                        const activeSeason = league.seasons?.find(s => s.isActive);
                                        const seasonLabel = activeSeason
                                            ? `Temporada ${activeSeason.year || activeSeason.seasonId}`
                                            : league.seasons?.[0]
                                                ? `Temporada ${league.seasons[0].year || league.seasons[0].seasonId}`
                                                : '';
                                        const isActive = !!activeSeason;

                                        return (
                                            <div key={league.id} className={styles.noteCard}>
                                                <div className={styles.cardHeaderRow}>
                                                    <div className={styles.logoCircle}>
                                                        {(league.nameEs || league.name).split(' ').map((word) => word[0]).join('').slice(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className={styles.itemTitle}>{league.nameEs || league.name}</div>
                                                        <div className={styles.itemMeta}>{seasonLabel}</div>
                                                    </div>
                                                </div>
                                                <div className={styles.cardFooter}>
                                                    <span className={`${styles.badge} ${isActive ? styles.badgeLive : ''}`}>
                                                        {isActive ? 'En curso' : 'Finalizado'}
                                                    </span>
                                                </div>
                                                <div className={styles.cardActions}>
                                                    <button
                                                        className="btn btn-ghost"
                                                        type="button"
                                                        onClick={() => toggleLeagueFavorite(league.id)}
                                                    >
                                                        Quitar
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className={styles.group}>
                            <h3 className={styles.groupTitle}>Jugadores favoritos</h3>
                            {players.length === 0 ? (
                                <div className={styles.emptyState}>
                                    No tienes jugadores favoritos. Marca jugadores con la estrella desde los partidos.
                                </div>
                            ) : (
                                <div className={styles.list}>
                                    {players.map((player) => (
                                        <div key={player.id} className={styles.listItem}>
                                            <div>
                                                <div className={styles.itemTitle}>{player.name}</div>
                                                {(player.team || player.position) && (
                                                    <div className={styles.itemMeta}>
                                                        {[player.team, player.position].filter(Boolean).join(' · ')}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                className="btn btn-ghost"
                                                type="button"
                                                onClick={() => togglePlayerFavorite(player.id)}
                                            >
                                                Quitar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === 'configuracion' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Configuracion basica</h2>
                                <p className={styles.sectionSubtitle}>Gestion minima de cuenta.</p>
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
                                        <div className={styles.itemTitle}>Contrasena</div>
                                        <div className={styles.itemMeta}>Gestiona tu acceso.</div>
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
                )}

                {activeTab === 'actividad' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Actividad</h2>
                                <p className={styles.sectionSubtitle}>V2: items recientes.</p>
                            </div>
                        </div>
                        <div className={styles.emptyState}>Disponible en la siguiente version.</div>
                    </section>
                )}
            </div>
        </div>
    );
}

