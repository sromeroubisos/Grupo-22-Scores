import Link from 'next/link';
import styles from './page.module.css';

// Mock data for tournaments
const tournaments = [
    {
        id: 'apertura-2026',
        name: 'Torneo Apertura 2026',
        season: '2026',
        status: 'active',
        sport: 'rugby',
        organization: 'Unión Argentina de Rugby',
        categories: ['Primera División', 'Reserva', 'M21'],
        teams: 12,
        matches: 66,
        startDate: '2026-02-01',
        endDate: '2026-06-30',
        currentRound: 'Fecha 8',
        image: '🏆',
    },
    {
        id: 'clausura-2025',
        name: 'Torneo Clausura 2025',
        season: '2025',
        status: 'finished',
        sport: 'rugby',
        organization: 'Unión Argentina de Rugby',
        categories: ['Primera División', 'Reserva'],
        teams: 12,
        matches: 66,
        startDate: '2025-08-01',
        endDate: '2025-12-15',
        currentRound: 'Finalizado',
        image: '🥇',
    },
    {
        id: 'liga-nacional-2026',
        name: 'Liga Nacional 2026',
        season: '2026',
        status: 'active',
        sport: 'rugby',
        organization: 'Federación Nacional',
        categories: ['Primera División'],
        teams: 16,
        matches: 120,
        startDate: '2026-01-15',
        endDate: '2026-07-30',
        currentRound: 'Fecha 12',
        image: '🏈',
    },
    {
        id: 'copa-juvenil-2026',
        name: 'Copa Juvenil 2026',
        season: '2026',
        status: 'upcoming',
        sport: 'rugby',
        organization: 'Unión Argentina de Rugby',
        categories: ['M19', 'M17', 'M15'],
        teams: 24,
        matches: 120,
        startDate: '2026-03-01',
        endDate: '2026-05-30',
        currentRound: 'Próximamente',
        image: '⭐',
    },
    {
        id: 'torneo-desarrollo-2026',
        name: 'Torneo Desarrollo 2026',
        season: '2026',
        status: 'upcoming',
        sport: 'rugby',
        organization: 'Unión Regional',
        categories: ['Desarrollo A', 'Desarrollo B'],
        teams: 20,
        matches: 90,
        startDate: '2026-04-01',
        endDate: '2026-08-30',
        currentRound: 'Próximamente',
        image: '🌟',
    },
];

const seasons = ['2026', '2025', '2024', '2023'];
const statuses = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'En curso' },
    { value: 'upcoming', label: 'Próximos' },
    { value: 'finished', label: 'Finalizados' },
];

export default function TorneosPage() {
    const activeTournaments = tournaments.filter(t => t.status === 'active');
    const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
    const finishedTournaments = tournaments.filter(t => t.status === 'finished');

    return (
        <div className={styles.page}>
            {/* Header Section */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Torneos</h1>
                            <p className={styles.subtitle}>
                                Explora todos los torneos oficiales gestionados en la plataforma
                            </p>
                        </div>

                        {/* Filters */}
                        <div className={styles.filters}>
                            <select className={styles.select}>
                                <option value="">Temporada</option>
                                {seasons.map(season => (
                                    <option key={season} value={season}>{season}</option>
                                ))}
                            </select>
                            <select className={styles.select}>
                                {statuses.map(status => (
                                    <option key={status.value} value={status.value}>{status.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            {/* Active Tournaments */}
            {activeTournaments.length > 0 && (
                <section className={styles.section}>
                    <div className="container">
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>
                                <span className={styles.statusDot} data-status="active"></span>
                                Torneos en curso
                            </h2>
                            <span className={styles.count}>{activeTournaments.length} torneos</span>
                        </div>

                        <div className={styles.tournamentsGrid}>
                            {activeTournaments.map((tournament) => (
                                <Link
                                    key={tournament.id}
                                    href={`/tournaments/${tournament.id}`}
                                    className={styles.tournamentCard}
                                >
                                    <div className={styles.cardHeader}>
                                        <span className={styles.cardIcon}>{tournament.image}</span>
                                        <span className={`${styles.statusBadge} ${styles[tournament.status]}`}>
                                            {tournament.status === 'active' ? 'En curso' :
                                                tournament.status === 'upcoming' ? 'Próximo' : 'Finalizado'}
                                        </span>
                                    </div>

                                    <h3 className={styles.cardTitle}>{tournament.name}</h3>
                                    <p className={styles.cardOrganization}>{tournament.organization}</p>

                                    <div className={styles.cardMeta}>
                                        <span className={styles.cardRound}>{tournament.currentRound}</span>
                                    </div>

                                    <div className={styles.cardStats}>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.teams}</span>
                                            <span className={styles.statLabel}>Equipos</span>
                                        </div>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.matches}</span>
                                            <span className={styles.statLabel}>Partidos</span>
                                        </div>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.categories.length}</span>
                                            <span className={styles.statLabel}>Categorías</span>
                                        </div>
                                    </div>

                                    <div className={styles.cardCategories}>
                                        {tournament.categories.slice(0, 3).map(cat => (
                                            <span key={cat} className={styles.categoryTag}>{cat}</span>
                                        ))}
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <span className={styles.cardAction}>
                                            Ver torneo
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M5 12h14M12 5l7 7-7 7" />
                                            </svg>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Upcoming Tournaments */}
            {upcomingTournaments.length > 0 && (
                <section className={styles.section}>
                    <div className="container">
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>
                                <span className={styles.statusDot} data-status="upcoming"></span>
                                Próximos torneos
                            </h2>
                            <span className={styles.count}>{upcomingTournaments.length} torneos</span>
                        </div>

                        <div className={styles.tournamentsGrid}>
                            {upcomingTournaments.map((tournament) => (
                                <Link
                                    key={tournament.id}
                                    href={`/tournaments/${tournament.id}`}
                                    className={`${styles.tournamentCard} ${styles.upcomingCard}`}
                                >
                                    <div className={styles.cardHeader}>
                                        <span className={styles.cardIcon}>{tournament.image}</span>
                                        <span className={`${styles.statusBadge} ${styles[tournament.status]}`}>
                                            Próximo
                                        </span>
                                    </div>

                                    <h3 className={styles.cardTitle}>{tournament.name}</h3>
                                    <p className={styles.cardOrganization}>{tournament.organization}</p>

                                    <div className={styles.cardMeta}>
                                        <span className={styles.cardDate}>
                                            Inicio: {new Date(tournament.startDate).toLocaleDateString('es-AR', {
                                                day: 'numeric',
                                                month: 'long'
                                            })}
                                        </span>
                                    </div>

                                    <div className={styles.cardStats}>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.teams}</span>
                                            <span className={styles.statLabel}>Equipos</span>
                                        </div>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.categories.length}</span>
                                            <span className={styles.statLabel}>Categorías</span>
                                        </div>
                                    </div>

                                    <div className={styles.cardCategories}>
                                        {tournament.categories.slice(0, 3).map(cat => (
                                            <span key={cat} className={styles.categoryTag}>{cat}</span>
                                        ))}
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <span className={styles.cardAction}>
                                            Ver detalles
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M5 12h14M12 5l7 7-7 7" />
                                            </svg>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Finished Tournaments */}
            {finishedTournaments.length > 0 && (
                <section className={styles.section}>
                    <div className="container">
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle}>
                                <span className={styles.statusDot} data-status="finished"></span>
                                Torneos finalizados
                            </h2>
                            <span className={styles.count}>{finishedTournaments.length} torneos</span>
                        </div>

                        <div className={styles.tournamentsGrid}>
                            {finishedTournaments.map((tournament) => (
                                <Link
                                    key={tournament.id}
                                    href={`/tournaments/${tournament.id}`}
                                    className={`${styles.tournamentCard} ${styles.finishedCard}`}
                                >
                                    <div className={styles.cardHeader}>
                                        <span className={styles.cardIcon}>{tournament.image}</span>
                                        <span className={`${styles.statusBadge} ${styles[tournament.status]}`}>
                                            Finalizado
                                        </span>
                                    </div>

                                    <h3 className={styles.cardTitle}>{tournament.name}</h3>
                                    <p className={styles.cardOrganization}>{tournament.organization}</p>

                                    <div className={styles.cardStats}>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.teams}</span>
                                            <span className={styles.statLabel}>Equipos</span>
                                        </div>
                                        <div className={styles.cardStat}>
                                            <span className={styles.statValue}>{tournament.matches}</span>
                                            <span className={styles.statLabel}>Partidos</span>
                                        </div>
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <span className={styles.cardAction}>
                                            Ver resultados
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M5 12h14M12 5l7 7-7 7" />
                                            </svg>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
