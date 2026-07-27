'use client';

import type { CareerState, CareerSummary } from '@/features/career';
import { buildCareerSummary, describePosition, getClub, getPosition } from '@/features/career';
import Flag from './Flag';
import styles from './carrera.module.css';

// Titular generado para la carrera, según lo más destacado que logró.
function careerHeadline(summary: CareerSummary, flags: Record<string, number>): string {
    if ((flags['campeon_mundo'] ?? 0) > 0) return 'Campeón del Mundo';
    if (summary.honours.includes('Salón de la Fama')) return 'Miembro del Salón de la Fama';
    if (summary.titles >= 4) return 'Multicampeón';
    if (summary.caps >= 30) return 'Emblema de la selección';
    if (summary.peakOvr >= 80) return 'Crack de su generación';
    if (summary.peakOvr >= 72) return 'Un jugador de jerarquía';
    if (summary.seasons >= 12) return 'Un guerrero de mil batallas';
    return 'Una carrera de pura entrega';
}

export default function RetirementSummary({ career, onReplay }: { career: CareerState; onReplay: () => void }) {
    const summary = buildCareerSummary(career);
    const primary = describePosition(summary.position).stats[0];
    const primaryTotal = summary.totals[primary.key];
    const headline = careerHeadline(summary, career.player.flags);
    const posLabel = getPosition(summary.position).labelEs;
    const countryCode = career.player.eligibility.nationalityCountryCode;

    const stats: { label: string; value: number | string }[] = [
        { label: 'Partidos', value: summary.totalMatches },
        { label: primary.label, value: primaryTotal },
        { label: 'Caps', value: summary.caps },
        { label: 'Títulos', value: summary.titles },
        { label: 'Mejor OVR', value: summary.peakOvr },
        { label: 'Temporadas', value: summary.seasons },
    ];

    return (
        <div className={styles.summary}>
            <div className={styles.summaryHero}>
                <span className={styles.eyebrow}>Fin de la carrera</span>
                <h2 className={styles.summaryTitle}>{headline}</h2>
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
                            {getClub(c.club).labelEs} <span className={styles.num}>· {c.seasons}</span>
                        </span>
                    ))}
                </div>
            )}

            <div className={styles.summaryStats}>
                {stats.map((s) => (
                    <div key={s.label} className={styles.statItem}>
                        <span className={styles.statValue}>{s.value}</span>
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
