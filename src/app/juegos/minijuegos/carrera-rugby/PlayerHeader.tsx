'use client';

import type { CareerState } from '@/features/career';
import { clubLeagueIdentity, computeOvr, contractLabel, emptyStats, getClub, getPosition, secondaryStatOf } from '@/features/career';
import Flag from './Flag';
import ClubBadge from './ClubBadge';
import EmploymentLadder from './EmploymentLadder';
import styles from './carrera.module.css';

/**
 * Cabecera de carrera FULL-WIDTH y COMPACTA. El OVR es el ANCLA visual (grande,
 * a la derecha). A la izquierda, la identidad: bandera, puesto+edad, club+escudo,
 * la DIVISIÓN REAL que disputa (no el sistema paraguas) y la condición
 * amateur/desarrollo/semipro/profesional. NO muestra apodo, atributos, potencial,
 * moral, forma, fatiga, fama, OVR efectivo, valor de mercado ni rating del club.
 *
 * Debajo, con el mismo peso, el ESCALAFÓN DE EMPLEO: la otra forma de medir la
 * carrera, y la que de verdad importa cuando se arranca de amateur.
 */
export default function PlayerHeader({ career }: { career: CareerState }) {
    const p = career.player;
    const club = getClub(p.club);
    const posLabel = getPosition(p.position).labelEs;
    const division = clubLeagueIdentity(club).name;

    const matches = career.seasons.reduce((sum, s) => sum + s.matches, 0);
    const ovr = computeOvr(p.attributes, p.position);
    const countryCode = p.eligibility.nationalityCountryCode;

    // Acumulado de TODA la carrera. Puntos, tries y tackles se muestran siempre;
    // la cuarta ranura depende del puesto (scrums, lineouts, % al palo…).
    const totals = career.seasons.reduce((acc, s) => {
        for (const key of Object.keys(acc) as (keyof typeof acc)[]) acc[key] += s.stats[key];
        return acc;
    }, emptyStats());
    const secondary = secondaryStatOf(p.position, totals);

    const cells: { label: string; value: string; zero: boolean }[] = [
        { label: 'Partidos', value: String(matches), zero: matches === 0 },
        { label: 'Puntos', value: String(totals.points), zero: totals.points === 0 },
        { label: 'Tries', value: String(totals.tries), zero: totals.tries === 0 },
        { label: 'Tackles', value: String(totals.tackles), zero: totals.tackles === 0 },
        { label: secondary.label, value: secondary.display, zero: secondary.isZero },
    ];

    return (
        <header className={styles.careerBar}>
            <div className={styles.cbTop}>
            <div className={styles.cbIdentity}>
                {countryCode && <Flag code={countryCode} name={p.nationality} size={34} className={styles.cbFlag} />}
                <div className={styles.cbWho}>
                    <p className={styles.cbPos}>{posLabel}<span className={styles.cbAge}><span className={styles.num}>{p.age}</span> años</span></p>
                    <p className={styles.cbClub}>
                        <ClubBadge clubId={club.id} clubName={club.labelEs} size={28} />
                        <span className={styles.cbClubName}>{club.labelEs}</span>
                    </p>
                    <p className={styles.cbContext}>
                        <span className={styles.cbComp}>{division}</span>
                        <span className={styles.cbContract}>{contractLabel(p.employment, p.squadTrack)}</span>
                    </p>
                </div>
            </div>

            {/* OVR + honores. Los caps van acá y no en la planilla: en rugby
                pesan más que los títulos, y la selección va antes que la vitrina. */}
            <div className={styles.cbScore}>
                <div className={styles.cbOvr}>
                    <span className={`${styles.cbOvrValue} ${styles.num}`}>{ovr}</span>
                    <span className={styles.cbOvrLabel}>OVR</span>
                </div>
                <dl className={styles.cbHonours}>
                    <div className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num} ${p.caps === 0 ? styles.cbZero : ''}`}>{p.caps}</dd>
                        <dt>Caps</dt>
                    </div>
                    <div className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num} ${p.titles === 0 ? styles.cbZero : ''}`}>{p.titles}</dd>
                        <dt>Títulos</dt>
                    </div>
                </dl>
            </div>
            </div>

            {/* Planilla: partidos, puntos, tries y tackles SIEMPRE, más la
                métrica del puesto. Un pilar termina con 0 puntos y 0 tries: esos
                ceros van en gris tenue para que no se lean como un error. */}
            <dl className={styles.cbStatline}>
                {cells.map((cell) => (
                    <div key={cell.label} className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num} ${cell.zero ? styles.cbZero : ''}`}>{cell.value}</dd>
                        <dt>{cell.label}</dt>
                    </div>
                ))}
            </dl>

            <EmploymentLadder employment={p.employment} squadTrack={p.squadTrack} history={career.history} />
        </header>
    );
}
