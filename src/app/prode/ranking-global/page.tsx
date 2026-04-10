import Link from 'next/link';
import styles from '../page.module.css';
import { listPublicProdeUserTotals } from '@/lib/server/prodeCompetitions';
import { refreshStoredProdeScoreboards } from '@/lib/server/prodeScoring';

export default async function ProdeGlobalRankingPage() {
    await refreshStoredProdeScoreboards();
    const { schemaReady, data } = await listPublicProdeUserTotals();

    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.detailShell}>
                    <Link href="/prode" className={styles.backLink}>← Volver al lobby</Link>

                    <section className={styles.section}>
                        <div className={styles.sectionHeaderLobby}>
                            <div>
                                <h1 className={styles.sectionTitle}>Ranking global</h1>
                                <p className={styles.sectionText}>
                                    Tabla total acumulada entre todos los prodes publicados en la plataforma.
                                </p>
                            </div>
                        </div>

                        {!schemaReady ? (
                            <div className={styles.warning}>
                                La tabla total todavía no puede cargarse porque la migración del prode aún no fue
                                aplicada en la base activa.
                            </div>
                        ) : data.length ? (
                            <div className={styles.leaderboard}>
                                {data.map((row) => (
                                    <article key={row.userId} className={styles.leaderboardRow}>
                                        <div className={styles.leaderboardPosition}>
                                            #{String(row.position || 0).padStart(2, '0')}
                                        </div>
                                        <div className={styles.leaderboardUser}>
                                            {row.avatarUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={row.avatarUrl} alt="" className={styles.leaderboardAvatar} />
                                            ) : (
                                                <span className={styles.leaderboardAvatarPlaceholder}>
                                                    {row.userName.slice(0, 2).toUpperCase()}
                                                </span>
                                            )}
                                            <div>
                                                <span className={styles.leaderboardName}>{row.userName}</span>
                                                <span className={styles.leaderboardSub}>
                                                    {row.competitionsJoined} competencia{row.competitionsJoined === 1 ? '' : 's'} jugadas
                                                </span>
                                            </div>
                                        </div>
                                        <div className={styles.leaderboardMetric}>
                                            <span className={styles.leaderboardMetricValue}>{row.totalPoints}</span>
                                            <span className={styles.leaderboardMetricLabel}>Puntos</span>
                                        </div>
                                        <div className={styles.leaderboardMetric}>
                                            <span className={styles.leaderboardMetricValue}>{row.exactHits}</span>
                                            <span className={styles.leaderboardMetricLabel}>Exactos</span>
                                        </div>
                                        <div className={styles.leaderboardMetric}>
                                            <span className={styles.leaderboardMetricValue}>{row.correctOutcomes}</span>
                                            <span className={styles.leaderboardMetricLabel}>Aciertos</span>
                                        </div>
                                        <div className={styles.leaderboardMetric}>
                                            <span className={styles.leaderboardMetricValue}>{row.competitionsScored}</span>
                                            <span className={styles.leaderboardMetricLabel}>Puntuadas</span>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.empty}>
                                Aún no hay usuarios puntuados en la tabla total.
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
