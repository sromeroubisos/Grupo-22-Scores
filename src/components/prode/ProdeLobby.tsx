'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '@/app/prode/page.module.css';
import type { PublicProdeCompetition, PublicProdeUserTotal } from '@/lib/prode/types';

type ProdeLobbyProps = {
    competitions: PublicProdeCompetition[];
    totals: PublicProdeUserTotal[];
    schemaReady: boolean;
};

type StateFilter = 'all' | 'active' | 'upcoming';

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha';

    try {
        return new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function getSportLabel(sportId: string | null) {
    switch (sportId) {
        case 'rugby':
            return 'Rugby';
        case 'football':
            return 'Futbol';
        case 'basketball':
            return 'Basquet';
        case 'tennis':
            return 'Tenis';
        default:
            return sportId || 'General';
    }
}

function getStatusLabel(status: string, openEvents: number) {
    if (status === 'active' || openEvents > 0) return 'Activa';
    if (status === 'finished') return 'Cerrada';
    return 'Proxima';
}

function getTypeLabel(competition: PublicProdeCompetition) {
    if (competition.metadata?.featured === true) return 'Destacada';
    if (competition.visibility === 'unlisted') return 'Especial';
    return 'Publica';
}

function isCompetitionActive(competition: PublicProdeCompetition) {
    return competition.status === 'active' || competition.stats.open > 0;
}

function isCompetitionUpcoming(competition: PublicProdeCompetition) {
    if (isCompetitionActive(competition) || competition.status === 'finished') return false;
    if (!competition.startAt) return competition.status === 'published';
    return new Date(competition.startAt).getTime() > Date.now();
}

export default function ProdeLobby({ competitions, totals, schemaReady }: ProdeLobbyProps) {
    const [sportFilter, setSportFilter] = useState<string>('all');
    const [stateFilter, setStateFilter] = useState<StateFilter>('all');

    const sportFilters = useMemo(() => {
        const uniqueSports = Array.from(
            new Set(
                competitions
                    .map((competition) => competition.sportId)
                    .filter((sportId): sportId is string => Boolean(sportId)),
            ),
        );

        return ['all', ...uniqueSports];
    }, [competitions]);

    const filteredCompetitions = useMemo(() => {
        return [...competitions]
            .filter((competition) => sportFilter === 'all' || competition.sportId === sportFilter)
            .filter((competition) => {
                if (stateFilter === 'active') return isCompetitionActive(competition);
                if (stateFilter === 'upcoming') return isCompetitionUpcoming(competition);
                return true;
            })
            .sort((left, right) => {
                const leftFeatured = left.metadata?.featured === true ? 1 : 0;
                const rightFeatured = right.metadata?.featured === true ? 1 : 0;
                if (leftFeatured !== rightFeatured) return rightFeatured - leftFeatured;

                const leftActive = isCompetitionActive(left) ? 1 : 0;
                const rightActive = isCompetitionActive(right) ? 1 : 0;
                if (leftActive !== rightActive) return rightActive - leftActive;

                const leftTime = left.stats.nextLockAt || left.startAt || '';
                const rightTime = right.stats.nextLockAt || right.startAt || '';
                return leftTime.localeCompare(rightTime);
            });
    }, [competitions, sportFilter, stateFilter]);

    const activeCount = competitions.filter((competition) => isCompetitionActive(competition)).length;
    const totalPlayers = competitions.reduce((sum, competition) => sum + competition.members.totalMembers, 0);

    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.shell}>
                    <section className={styles.posterHero}>
                        <div className={styles.posterCopy}>
                            <p className={styles.posterKicker}>G22 Prode Lobby</p>
                            <h1 className={styles.posterTitle}>Elegi una competencia y entra a jugar.</h1>
                            <p className={styles.posterLead}>
                                Ligas publicas por torneo, donde los usuarios compiten con sus pronosticos dentro
                                de cada competencia, junto a ligas privadas con acceso mediante codigo unico para
                                jugar entre amigos o comunidades. Todo dentro de un entorno 100% gratuito y
                                recreativo, sin apuestas ni premios economicos, con un ranking global de usuarios
                                que permite seguir el rendimiento de los mejores en toda la plataforma.
                            </p>
                            <div className={styles.posterActions}>
                                <a href="#ligas" className={styles.posterPrimaryCta}>Ver ligas disponibles</a>
                                <Link href="/prode/ligas/nueva" className={styles.posterSecondaryCta}>
                                    Crear liga privada
                                </Link>
                            </div>
                        </div>

                        <div className={styles.posterRail}>
                            <article className={styles.posterStat}>
                                <strong>{competitions.length}</strong>
                                <span>Ligas abiertas</span>
                            </article>
                            <article className={styles.posterStat}>
                                <strong>{activeCount}</strong>
                                <span>Activas ahora</span>
                            </article>
                            <article className={styles.posterStat}>
                                <strong>{totalPlayers}</strong>
                                <span>Jugadores</span>
                            </article>
                        </div>
                    </section>

                    {!schemaReady ? (
                        <section className={styles.warning}>
                            La UI del lobby ya esta lista, pero la base activa todavia no tiene aplicadas las
                            tablas del prode. Al correr la migracion de Supabase se van a poblar estas vistas.
                        </section>
                    ) : null}

                    <section id="ligas" className={styles.section}>
                        <div className={styles.sectionHeaderLobby}>
                            <div>
                                <h2 className={styles.sectionTitle}>Ligas disponibles</h2>
                                <p className={styles.sectionText}>
                                    Aca elegis donde jugar. Cada tarjeta representa una competencia lista para
                                    entrar, seguir su cierre y competir en su liga global.
                                </p>
                            </div>
                            <Link href="/prode/ligas/unirse" className={styles.joinLink}>
                                Ingresar con codigo
                            </Link>
                        </div>

                        <div className={styles.filterBar}>
                            {sportFilters.map((filter) => (
                                <button
                                    key={filter}
                                    type="button"
                                    className={`${styles.filterChip} ${sportFilter === filter ? styles.filterChipActive : ''}`}
                                    onClick={() => setSportFilter(filter)}
                                >
                                    {filter === 'all' ? 'Todas' : getSportLabel(filter)}
                                </button>
                            ))}

                            <button
                                type="button"
                                className={`${styles.filterChip} ${stateFilter === 'active' ? styles.filterChipActive : ''}`}
                                onClick={() => setStateFilter((current) => current === 'active' ? 'all' : 'active')}
                            >
                                Activas
                            </button>

                            <button
                                type="button"
                                className={`${styles.filterChip} ${stateFilter === 'upcoming' ? styles.filterChipActive : ''}`}
                                onClick={() => setStateFilter((current) => current === 'upcoming' ? 'all' : 'upcoming')}
                            >
                                Proximas
                            </button>
                        </div>

                        {filteredCompetitions.length ? (
                            <div className={styles.lobbyGrid}>
                                {filteredCompetitions.map((competition) => {
                                    const featured = competition.metadata?.featured === true;
                                    const deadlineText = competition.stats.nextLockAt
                                        ? `Cierra: ${formatDate(competition.stats.nextLockAt)}`
                                        : `Inicio: ${formatDate(competition.startAt)}`;

                                    return (
                                        <article
                                            key={competition.id}
                                            className={`${styles.leagueCard} ${featured ? styles.leagueCardFeatured : ''}`}
                                        >
                                            <div className={styles.leagueTopline}>
                                                <span className={styles.leagueType}>{getTypeLabel(competition)}</span>
                                                <span className={styles.leagueSport}>{getSportLabel(competition.sportId)}</span>
                                            </div>

                                            <div className={styles.leagueHeader}>
                                                <div>
                                                    <h3 className={styles.leagueTitle}>{competition.name}</h3>
                                                    <p className={styles.leagueSubtitle}>
                                                        {featured ? 'Prode destacado' : 'Prode oficial'}
                                                    </p>
                                                </div>
                                                <span className={styles.leagueStatus}>
                                                    {getStatusLabel(competition.status, competition.stats.open)}
                                                </span>
                                            </div>

                                            <div className={styles.leagueMeta}>
                                                <span>Jugadores: {competition.members.totalMembers}</span>
                                                <span>Fechas cerradas: {competition.stats.finished}</span>
                                                <span>{deadlineText}</span>
                                            </div>

                                            <div className={styles.leagueFooter}>
                                                <Link href={`/prode/${competition.slug}`} className={styles.leaguePrimaryCta}>
                                                    Jugar
                                                </Link>
                                                <Link href={`/prode/${competition.slug}`} className={styles.leagueSecondaryCta}>
                                                    Ver tabla
                                                </Link>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className={styles.empty}>
                                No hay ligas que coincidan con esos filtros. Proba ver todas o cambiar el estado.
                            </div>
                        )}
                    </section>

                    <section className={styles.privateLeagueCta}>
                        <div>
                            <p className={styles.privateLeagueEyebrow}>Viralidad</p>
                            <h2 className={styles.privateLeagueTitle}>Crea tu propia liga privada.</h2>
                            <p className={styles.privateLeagueText}>
                                Arma una liga con amigos, comparti un codigo unico y competi sobre cualquier prode
                                oficial ya publicado en G22 Scores.
                            </p>
                        </div>
                        <div className={styles.privateLeagueActions}>
                            <Link href="/prode/ligas/nueva" className={styles.posterPrimaryCta}>Crear liga</Link>
                            <Link href="/prode/ligas/unirse" className={styles.posterSecondaryCta}>Ingresar con codigo</Link>
                        </div>
                    </section>

                    <section id="ranking-global" className={styles.section}>
                        <div className={styles.sectionHeaderLobby}>
                            <div>
                                <h2 className={styles.sectionTitle}>Ranking global</h2>
                                <p className={styles.sectionText}>
                                    El acumulado total junta los puntos de todos los prodes y muestra quien domina
                                    la plataforma completa.
                                </p>
                            </div>
                            <Link href="/prode/ranking-global" className={styles.joinLink}>
                                Ver ranking completo
                            </Link>
                        </div>

                        {totals.length ? (
                            <div className={styles.globalLeaderboardList}>
                                {totals.slice(0, 3).map((row) => (
                                    <article key={row.userId} className={styles.globalLeaderboardRow}>
                                        <span className={styles.globalLeaderboardPosition}>
                                            {row.position ? `${row.position}.` : '-'}
                                        </span>
                                        <div className={styles.globalLeaderboardIdentity}>
                                            <strong>{row.userName}</strong>
                                            <span>{row.exactHits} exactos - {row.correctOutcomes} aciertos</span>
                                        </div>
                                        <span className={styles.globalLeaderboardPoints}>{row.totalPoints} pts</span>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.empty}>
                                Todavia no hay puntajes acumulados. Cuando se empiecen a puntuar competencias,
                                esta tabla total va a tomar protagonismo automaticamente.
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
