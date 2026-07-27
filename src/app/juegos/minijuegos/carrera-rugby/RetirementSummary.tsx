'use client';

import type { CareerState } from '@/features/career';
import { buildCareerSummary, getClub, getPosition, kickAccuracy, secondaryStatOf } from '@/features/career';
import Flag from './Flag';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

export default function RetirementSummary({ career, onReplay }: { career: CareerState; onReplay: () => void }) {
    const summary = buildCareerSummary(career);
    const secondary = secondaryStatOf(summary.position, summary.totals);
    // El titular de la carrera lo decide el motor (engine/archetypes.ts): acá
    // solo se pinta.
    const { label: headline, blurb } = summary.archetype;
    const posLabel = getPosition(summary.position).labelEs;
    const countryCode = career.player.eligibility.nationalityCountryCode;

    // El % al palo es LA métrica del que patea, así que se muestra aparte además
    // de la ranura del puesto (para el fullback, cuya ranura son los metros).
    const accuracy = getPosition(summary.position).stats.goalKicker ? kickAccuracy(summary.totals) : null;

    const stats: { label: string; value: number | string; zero?: boolean }[] = [
        { label: 'Partidos', value: summary.totalMatches, zero: summary.totalMatches === 0 },
        { label: 'Puntos', value: summary.totals.points, zero: summary.totals.points === 0 },
        { label: 'Tries', value: summary.totals.tries, zero: summary.totals.tries === 0 },
        { label: 'Tackles', value: summary.totals.tackles, zero: summary.totals.tackles === 0 },
        { label: secondary.label, value: secondary.display, zero: secondary.isZero },
        ...(accuracy !== null && secondary.kind !== 'kick-accuracy'
            ? [{ label: 'Al palo', value: `${accuracy}%` }]
            : []),
        { label: 'Caps', value: summary.caps, zero: summary.caps === 0 },
        { label: 'Títulos', value: summary.titles, zero: summary.titles === 0 },
        { label: 'Mejor OVR', value: summary.peakOvr },
        { label: 'Temporadas', value: summary.seasons },
    ];

    return (
        <div className={styles.summary}>
            <div className={styles.summaryHero}>
                <span className={styles.eyebrow}>Fin de la carrera</span>
                <h2 className={styles.summaryTitle}>{headline}</h2>
                <p className={styles.summaryBlurb}>{blurb}</p>
                <div className={styles.summaryId}>
                    {countryCode && <Flag code={countryCode} name={summary.nationality} size={24} decorative />}
                    <span>{posLabel} · {summary.nationality}</span>
                </div>
                <p className={styles.summaryReason}>
                    Debut a los {summary.debutAge} · Retiro a los {summary.retirementAge}. {summary.retirementReason}.
                </p>
            </div>

            {summary.byClub.length > 0 && (
                <div className={styles.summaryClubs}>
                    {summary.byClub.slice(0, 3).map((c) => (
                        <span key={c.club} className={styles.clubChip}>
                            <ClubBadge clubId={c.club} clubName={getClub(c.club).labelEs} size={40} />
                            {getClub(c.club).labelEs} <span className={styles.num}>· {c.seasons}</span>
                        </span>
                    ))}
                </div>
            )}

            <div className={styles.summaryStats}>
                {stats.map((s) => (
                    <div key={s.label} className={styles.statItem}>
                        <span className={`${styles.statValue} ${s.zero ? styles.cbZero : ''}`}>{s.value}</span>
                        <span className={styles.statLabel}>{s.label}</span>
                    </div>
                ))}
            </div>

            {summary.honours.length > 0 && (
                <div className={styles.honours}>
                    {summary.honours.map((h) => (
                        <span key={h} className={styles.badgeStrong}>{h}</span>
                    ))}
                </div>
            )}

            <div className={styles.btnRow}>
                <button type="button" className={styles.primaryBtn} onClick={onReplay}>Volver a jugar</button>
            </div>
        </div>
    );
}
