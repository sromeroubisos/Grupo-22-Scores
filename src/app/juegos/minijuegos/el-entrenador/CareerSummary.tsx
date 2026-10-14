import { getClub, type CoachState } from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import SeasonTimeline from './SeasonTimeline.tsx';
import styles from './entrenador.module.css';

/**
 * El puntaje de la carrera. Los títulos pesan por su altura en la pirámide, y el
 * ascenso pesa parecido a un campeonato menor porque en el rugby de club subir de
 * categoría es lo que le cambia la vida a una institución.
 */
export function careerScore(state: CoachState): number {
    let score = state.coach.reputation;
    for (const s of state.seasons) {
        score += 2;
        if (s.nacional) score += 45;
        if (s.tdi === 'campeon') score += 30;
        if (s.champion) score += s.competitionId.includes('TOP') ? 25 : 12;
        if (s.movement === 'ascenso') score += 15;
    }
    return Math.round(score);
}

/** El cierre: te echaron o te retiraste. La trayectoria completa, temporada a temporada. */
export default function CareerSummary({
    state,
    fired,
    onTakeNewClub,
    onRestart,
}: {
    state: CoachState;
    fired: boolean;
    onTakeNewClub: () => void;
    onRestart: () => void;
}) {
    const titles = state.seasons.filter((s) => s.champion).length;
    const promotions = state.seasons.filter((s) => s.movement === 'ascenso').length;
    const cups = state.seasons.filter((s) => s.tdi === 'campeon').length;
    const nacionales = state.seasons.filter((s) => s.nacional).length;
    const met = state.seasons.filter((s) => s.objectiveMet).length;
    const clubs = state.history.map((h) => getClub(h.clubId)).filter((c) => c !== null);

    return (
        <>
            <section className={`${styles.panel} ${styles.hero} ${fired ? styles.heroBad : styles.heroGood}`}>
                <p className={styles.panelTitle}>{fired ? 'Fin del ciclo' : 'Carrera terminada'}</p>
                <p className={styles.heroPosition}>
                    {careerScore(state)}
                    <span className={styles.heroOf}> puntos de carrera</span>
                </p>
                <p className={styles.verdict}>
                    {fired
                        ? 'La subcomisión decidió que el ciclo estaba cumplido. Te agradecieron los servicios en una reunión de veinte minutos.'
                        : `${state.coach.name} colgó la carpeta después de ${state.seasons.length} ${
                              state.seasons.length === 1 ? 'temporada' : 'temporadas'
                          }.`}
                </p>

                <div className={styles.clubRow} aria-label="Clubes dirigidos">
                    {clubs.map((c, i) => (
                        <span key={`${c.id}-${i}`} className={styles.clubChip}>
                            <ClubCrest club={c} small />
                            {c.short}
                        </span>
                    ))}
                </div>

                <div className={styles.ledger}>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Temporadas</span>
                        <span className={styles.ledgerValue}>{state.seasons.length}</span>
                        <span className={styles.ledgerHint}>{met} con el objetivo cumplido</span>
                    </span>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Títulos</span>
                        <span className={styles.ledgerValue}>{titles}</span>
                    </span>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Ascensos</span>
                        <span className={styles.ledgerValue}>{promotions}</span>
                    </span>
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Reputación</span>
                        <span className={styles.ledgerValue}>{state.coach.reputation}</span>
                        <span className={styles.ledgerHint}>en el ambiente, de 0 a 100</span>
                    </span>
                    {cups > 0 && (
                        <span className={styles.ledgerItem}>
                            <span className={styles.ledgerLabel}>Torneo del Interior</span>
                            <span className={styles.ledgerValue}>{cups}</span>
                        </span>
                    )}
                    {nacionales > 0 && (
                        <span className={styles.ledgerItem}>
                            <span className={styles.ledgerLabel}>Nacional de Clubes</span>
                            <span className={styles.ledgerValue}>{nacionales}</span>
                        </span>
                    )}
                </div>
            </section>

            <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Trayectoria</h2>
                <SeasonTimeline seasons={state.seasons} />
            </section>

            <div className={styles.actions}>
                {fired && (
                    <button type="button" className={styles.primary} onClick={onTakeNewClub}>
                        Agarrar otro club
                    </button>
                )}
                <button type="button" className={fired ? styles.ghost : styles.primary} onClick={onRestart}>
                    Empezar de nuevo
                </button>
            </div>
        </>
    );
}
