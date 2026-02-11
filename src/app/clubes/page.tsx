import Link from 'next/link';
import styles from './page.module.css';

// Mock data
const clubs = [
    { id: 'club-atletico', name: 'Club Atlético', logo: '🔵', city: 'Buenos Aires', founded: 1908, tournaments: 3, players: 45, wins: 7, draws: 0, losses: 1 },
    { id: 'racing-club', name: 'Racing Club', logo: '🟢', city: 'Avellaneda', founded: 1903, tournaments: 3, players: 42, wins: 6, draws: 1, losses: 1 },
    { id: 'san-lorenzo', name: 'San Lorenzo', logo: '🟡', city: 'Buenos Aires', founded: 1908, tournaments: 2, players: 40, wins: 5, draws: 1, losses: 2 },
    { id: 'casi', name: 'CASI', logo: '⚪', city: 'San Isidro', founded: 1920, tournaments: 2, players: 38, wins: 5, draws: 0, losses: 3 },
    { id: 'deportivo-fc', name: 'Deportivo FC', logo: '🔴', city: 'La Plata', founded: 1915, tournaments: 2, players: 35, wins: 4, draws: 1, losses: 3 },
    { id: 'hindu-club', name: 'Hindu Club', logo: '🟠', city: 'Don Torcuato', founded: 1919, tournaments: 2, players: 36, wins: 4, draws: 0, losses: 4 },
    { id: 'newman', name: 'Newman', logo: '🔴', city: 'Benavídez', founded: 1917, tournaments: 2, players: 34, wins: 3, draws: 1, losses: 4 },
    { id: 'belgrano-ac', name: 'Belgrano AC', logo: '🔵', city: 'Buenos Aires', founded: 1896, tournaments: 2, players: 38, wins: 3, draws: 0, losses: 5 },
    { id: 'pucara', name: 'Pucará', logo: '🟣', city: 'Burzaco', founded: 1955, tournaments: 1, players: 32, wins: 2, draws: 1, losses: 5 },
    { id: 'la-plata-rc', name: 'La Plata RC', logo: '⚫', city: 'La Plata', founded: 1893, tournaments: 1, players: 30, wins: 2, draws: 0, losses: 6 },
];

export default function ClubesPage() {
    return (
        <div className={styles.page}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Clubes</h1>
                            <p className={styles.subtitle}>
                                Todos los clubes participantes en los torneos oficiales
                            </p>
                        </div>

                        <div className={styles.headerStats}>
                            <div className={styles.headerStat}>
                                <span className={styles.headerStatValue}>{clubs.length}</span>
                                <span className={styles.headerStatLabel}>Clubes</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.searchBox}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input type="text" placeholder="Buscar club..." className={styles.searchInput} />
                    </div>
                </div>
            </section>

            {/* Clubs Grid */}
            <section className={styles.content}>
                <div className="container">
                    <div className={styles.clubsGrid}>
                        {clubs.map((club) => (
                            <Link key={club.id} href={`/clubes/${club.id}`} className={styles.clubCard}>
                                <div className={styles.clubHeader}>
                                    <span className={styles.clubLogo}>{club.logo}</span>
                                    <div className={styles.clubInfo}>
                                        <h3 className={styles.clubName}>{club.name}</h3>
                                        <span className={styles.clubCity}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                                <circle cx="12" cy="10" r="3"></circle>
                                            </svg>
                                            {club.city}
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.clubStats}>
                                    <div className={styles.clubStat}>
                                        <span className={styles.statValue}>{club.tournaments}</span>
                                        <span className={styles.statLabel}>Torneos</span>
                                    </div>
                                    <div className={styles.clubStat}>
                                        <span className={styles.statValue}>{club.players}</span>
                                        <span className={styles.statLabel}>Jugadores</span>
                                    </div>
                                    <div className={styles.clubStat}>
                                        <span className={styles.statValue}>{club.founded}</span>
                                        <span className={styles.statLabel}>Fundado</span>
                                    </div>
                                </div>

                                <div className={styles.clubRecord}>
                                    <span className={styles.recordWins}>{club.wins}G</span>
                                    <span className={styles.recordDraws}>{club.draws}E</span>
                                    <span className={styles.recordLosses}>{club.losses}P</span>
                                </div>

                                <div className={styles.clubAction}>
                                    <span>Ver perfil</span>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
