'use client';

import Link from 'next/link';
import ExportImage from '@/components/ExportImage';
import styles from './page.module.css';

// Mock data
const players = [
    { id: 'martin-garcia', name: 'Martín García', position: 'Wing', team: 'Club Atlético', teamLogo: '🔵', tries: 12, matches: 8, rating: 8.5 },
    { id: 'lucas-rodriguez', name: 'Lucas Rodríguez', position: 'Fullback', team: 'Racing Club', teamLogo: '🟢', tries: 10, matches: 8, rating: 8.2 },
    { id: 'pablo-fernandez', name: 'Pablo Fernández', position: 'Centre', team: 'San Lorenzo', teamLogo: '🟡', tries: 8, matches: 8, rating: 7.9 },
    { id: 'nicolas-sanchez', name: 'Nicolás Sánchez', position: 'Fly-half', team: 'Club Atlético', teamLogo: '🔵', tries: 3, matches: 8, rating: 8.8 },
    { id: 'tomas-albornoz', name: 'Tomás Albornoz', position: 'Fly-half', team: 'Racing Club', teamLogo: '🟢', tries: 2, matches: 8, rating: 8.4 },
    { id: 'juan-perez', name: 'Juan Pérez', position: 'Wing', team: 'CASI', teamLogo: '⚪', tries: 7, matches: 7, rating: 7.8 },
    { id: 'diego-lopez', name: 'Diego López', position: 'Centre', team: 'Deportivo FC', teamLogo: '🔴', tries: 7, matches: 8, rating: 7.6 },
    { id: 'andres-martinez', name: 'Andrés Martínez', position: 'Number 8', team: 'Hindu Club', teamLogo: '🟠', tries: 6, matches: 8, rating: 7.7 },
    { id: 'carlos-sanchez', name: 'Carlos Sánchez', position: 'Scrum-half', team: 'Newman', teamLogo: '🔴', tries: 5, matches: 7, rating: 7.5 },
    { id: 'roberto-diaz', name: 'Roberto Díaz', position: 'Hooker', team: 'Belgrano AC', teamLogo: '🔵', tries: 5, matches: 8, rating: 7.4 },
    { id: 'federico-torres', name: 'Federico Torres', position: 'Lock', team: 'Pucará', teamLogo: '🟣', tries: 4, matches: 8, rating: 7.3 },
    { id: 'gonzalo-ruiz', name: 'Gonzalo Ruiz', position: 'Flanker', team: 'La Plata RC', teamLogo: '⚫', tries: 4, matches: 8, rating: 7.2 },
];

const positions = ['Todos', 'Backs', 'Forwards', 'Wing', 'Centre', 'Fly-half', 'Fullback', 'Scrum-half', 'Number 8', 'Flanker', 'Lock', 'Hooker', 'Prop'];

export default function JugadoresPage() {
    return (
        <div className={styles.page}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Jugadores</h1>
                            <p className={styles.subtitle}>
                                Perfiles de jugadores con estadísticas de la temporada
                            </p>
                        </div>

                        <div className={styles.headerStats}>
                            <div className={styles.headerStat}>
                                <span className={styles.headerStatValue}>{players.length}</span>
                                <span className={styles.headerStatLabel}>Jugadores</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.filters}>
                        <div className={styles.searchBox}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input type="text" placeholder="Buscar jugador..." className={styles.searchInput} />
                        </div>

                        <select className={styles.select}>
                            {positions.map(pos => (
                                <option key={pos} value={pos}>{pos}</option>
                            ))}
                        </select>

                        <select className={styles.select}>
                            <option value="all">Todos los equipos</option>
                            <option value="club-atletico">Club Atlético</option>
                            <option value="racing-club">Racing Club</option>
                        </select>
                    </div>
                </div>
            </section>

            {/* Players Grid */}
            <section className={styles.content}>
                <div className="container">
                    <div className={styles.playersGrid}>
                        {players.map((player) => (
                            <div key={player.id} className={styles.playerCard}>
                                <Link href={`/jugadores/${player.id}`} className={styles.playerLink}>
                                    <div className={styles.playerHeader}>
                                        <div className={styles.playerAvatar}>{player.teamLogo}</div>
                                        <div className={styles.playerRating}>
                                            <span className={styles.ratingValue}>{player.rating}</span>
                                        </div>
                                    </div>

                                    <div className={styles.playerInfo}>
                                        <h3 className={styles.playerName}>{player.name}</h3>
                                        <span className={styles.playerPosition}>{player.position}</span>
                                        <span className={styles.playerTeam}>{player.team}</span>
                                    </div>

                                    <div className={styles.playerStats}>
                                        <div className={styles.playerStat}>
                                            <span className={styles.statValue}>{player.tries}</span>
                                            <span className={styles.statLabel}>Tries</span>
                                        </div>
                                        <div className={styles.playerStat}>
                                            <span className={styles.statValue}>{player.matches}</span>
                                            <span className={styles.statLabel}>Partidos</span>
                                        </div>
                                        <div className={styles.playerStat}>
                                            <span className={styles.statValue}>{(player.tries / player.matches).toFixed(1)}</span>
                                            <span className={styles.statLabel}>Prom.</span>
                                        </div>
                                    </div>
                                </Link>

                                <div className={styles.playerActions}>
                                    <ExportImage
                                        template="playerStats"
                                        data={{
                                            name: player.name,
                                            team: player.team,
                                            position: player.position,
                                            stats: [
                                                { label: 'Tries', value: player.tries, highlight: true },
                                                { label: 'Partidos', value: player.matches },
                                                { label: 'Promedio', value: (player.tries / player.matches).toFixed(1) },
                                                { label: 'Rating', value: player.rating, highlight: true },
                                            ],
                                        }}
                                        filename={`jugador-${player.id}`}
                                    />
                                    <Link href={`/jugadores/${player.id}`} className={styles.viewProfileBtn}>
                                        Ver perfil →
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
