'use client';

import type { CareerState } from '@/features/career';
import { clubLeagueIdentity, computeOvr, contractLabel, describePosition, getClub, getPosition } from '@/features/career';
import Flag from './Flag';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

/**
 * Cabecera de carrera FULL-WIDTH y COMPACTA. El OVR es el ANCLA visual (grande,
 * a la derecha). A la izquierda, la identidad: bandera, puesto+edad, club+escudo,
 * la DIVISIÓN REAL que disputa (no el sistema paraguas) y la condición
 * amateur/desarrollo/semipro/profesional. NO muestra apodo, atributos, potencial,
 * moral, forma, fatiga, fama, OVR efectivo, valor de mercado ni rating del club.
 */
export default function PlayerHeader({ career }: { career: CareerState }) {
    const p = career.player;
    const club = getClub(p.club);
    const posLabel = getPosition(p.position).labelEs;
    const primary = describePosition(p.position).stats[0];
    const division = clubLeagueIdentity(club).name;

    const matches = career.seasons.reduce((sum, s) => sum + s.matches, 0);
    const primaryTotal = career.seasons.reduce((sum, s) => sum + (s.stats[primary.key] as number), 0);
    const ovr = computeOvr(p.attributes, p.position);
    const countryCode = p.eligibility.nationalityCountryCode;

    return (
        <header className={styles.careerBar}>
            <div className={styles.cbIdentity}>
                {countryCode && <Flag code={countryCode} name={p.nationality} size={34} className={styles.cbFlag} />}
                <div className={styles.cbWho}>
                    <p className={styles.cbPos}>{posLabel}<span className={styles.cbAge}><span className={styles.num}>{p.age}</span> años</span></p>
                    <p className={styles.cbClub}>
                        <ClubBadge clubId={club.id} clubName={club.labelEs} size={24} />
                        <span className={styles.cbClubName}>{club.labelEs}</span>
                    </p>
                    <p className={styles.cbContext}>
                        <span className={styles.cbComp}>{division}</span>
                        <span className={styles.cbContract}>{contractLabel(p.employment, p.squadTrack)}</span>
                    </p>
                </div>
            </div>

            <div className={styles.cbScore}>
                <div className={styles.cbOvr}>
                    <span className={`${styles.cbOvrValue} ${styles.num}`}>{ovr}</span>
                    <span className={styles.cbOvrLabel}>OVR</span>
                </div>
                <dl className={styles.cbStats}>
                    <div className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num}`}>{matches}</dd>
                        <dt>Partidos</dt>
                    </div>
                    <div className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num}`}>{primaryTotal}</dd>
                        <dt>{primary.label}</dt>
                    </div>
                    <div className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num}`}>{p.caps}</dd>
                        <dt>Caps</dt>
                    </div>
                    <div className={styles.cbStat}>
                        <dd className={`${styles.cbStatValue} ${styles.num}`}>{p.titles}</dd>
                        <dt>Títulos</dt>
                    </div>
                </dl>
            </div>
        </header>
    );
}
