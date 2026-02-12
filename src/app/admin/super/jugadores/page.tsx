'use client';

import Link from 'next/link';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';

const players = [
    {
        id: 'p1',
        name: 'Juan Perez',
        position: 'Wing',
        nationality: 'Argentina',
        club: 'SIC',
        status: 'Activo',
        source: 'API',
        sport: 'rugby',
        matches: 18,
        points: 12,
        minutes: 980,
        followers: 420,
        views: 3200
    },
    {
        id: 'p2',
        name: 'Martin Lopez',
        position: 'Apertura',
        nationality: 'Argentina',
        club: 'CASI',
        status: 'Retirado',
        source: 'Manual',
        sport: 'rugby',
        matches: 40,
        points: 128,
        minutes: 2100,
        followers: 980,
        views: 4100
    },
    {
        id: 'p3',
        name: 'Lucas Diaz',
        position: 'Defensor',
        nationality: 'Argentina',
        club: 'Hindu',
        status: 'Activo',
        source: 'API',
        sport: 'hockey',
        matches: 22,
        points: 8,
        minutes: 1500,
        followers: 300,
        views: 2100
    },
    {
        id: 'p4',
        name: 'Santiago Ruiz',
        position: 'Centro',
        nationality: 'Uruguay',
        club: 'Belgrano',
        status: 'Activo',
        source: 'Manual',
        sport: 'football',
        matches: 14,
        points: 4,
        minutes: 890,
        followers: 650,
        views: 3600
    }
];

const sportLabels: Record<string, string> = {
    rugby: 'Rugby',
    football: 'Futbol',
    hockey: 'Hockey'
};

export default function JugadoresPage() {
    const { filters } = useSuperConsole();

    const filtered = players.filter((player) => {
        if (filters.sport !== 'all' && player.sport !== filters.sport) return false;
        if (filters.country !== 'all' && player.nationality !== filters.country) return false;
        if (filters.status !== 'all') {
            const statusKey = player.status === 'Activo' ? 'activo' : 'pendiente';
            if (statusKey !== filters.status) return false;
        }
        if (filters.source !== 'all' && player.source !== filters.source) return false;
        if (filters.search && !player.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        return true;
    });

    const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, player) => {
        if (!acc[player.sport]) acc[player.sport] = [];
        acc[player.sport].push(player);
        return acc;
    }, {});

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Jugadores</div>
                    <div className={styles.consoleSubtitle}>Vista en cartas con metricas</div>
                </div>
                <div className={styles.consoleActions}>
                    <Link href="/admin/super/jugadores" className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                        + Crear
                    </Link>
                </div>
            </div>

            {Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem}>No se encontraron jugadores con los filtros actuales.</div>
            )}

            {Object.entries(grouped).map(([sport, list]) => (
                <section key={sport} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                        <span className={styles.groupTitle}>{sportLabels[sport] || sport}</span>
                        <span className={styles.groupMeta}>{list.length} jugadores</span>
                    </div>
                    <div className={styles.cardGrid}>
                        {list.map((player) => (
                            <div key={player.id} className={styles.cardItem}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.avatar}>{player.name.split(' ').map((c) => c[0]).join('')}</div>
                                    <div>
                                        <div className={styles.cardTitle}>{player.name}</div>
                                        <div className={styles.cardMeta}>{player.club} · {player.position}</div>
                                        <div className={styles.cardMeta}>{player.nationality}</div>
                                    </div>
                                </div>
                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${player.status === 'Activo' ? styles.badgeActive : styles.badgeArchived}`}>
                                        {player.status}
                                    </span>
                                    <span className={`${styles.badgePill} ${player.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {player.source}
                                    </span>
                                </div>
                                <div className={styles.metricsGrid}>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Partidos</span>
                                        <span className={styles.metricValue}>{player.matches}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Puntos</span>
                                        <span className={styles.metricValue}>{player.points}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Minutos</span>
                                        <span className={styles.metricValue}>{player.minutes}</span>
                                    </div>
                                </div>
                                <div className={styles.metricsGrid}>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Seguidores</span>
                                        <span className={styles.metricValue}>{player.followers}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Views mes</span>
                                        <span className={styles.metricValue}>{player.views}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Equipo</span>
                                        <span className={styles.metricValue}>{player.club}</span>
                                    </div>
                                </div>
                                <div className={styles.cardActions}>
                                    <button className={styles.cardAction}>Ver perfil</button>
                                    <button className={styles.cardAction}>Editar</button>
                                    <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>Vincular</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
