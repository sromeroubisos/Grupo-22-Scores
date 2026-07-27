'use client';

import type { ReactNode } from 'react';
import type { CareerSeasonEntry } from '@/features/career';
import { contractLabel, MILESTONE_LABELS } from '@/features/career';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

interface Props {
    /** Historial CONGELADO por el motor. No se recalcula desde el catálogo. */
    history: CareerSeasonEntry[];
    /** Índice de la temporada recién jugada. */
    highlight?: number | null;
}

/** Marcador de la temporada: icono + etiqueta accesible (NO solo color). */
type Marker = { kind: string; label: string; icon: ReactNode; strong?: boolean };

function markerFor(entry: CareerSeasonEntry): Marker | null {
    const has = (m: string) => entry.milestones.includes(m as never);
    if (entry.titlesWon.length > 0) return { kind: 'title', label: 'Título', icon: <TrophyIcon />, strong: true };
    if (has('first-professional')) return { kind: 'pro', label: 'Primer profesional', icon: <StarIcon />, strong: true };
    if (has('first-call-up')) return { kind: 'cap', label: 'Selección', icon: <ShieldIcon /> };
    if (has('international-transfer')) return { kind: 'intl', label: 'Pase internacional', icon: <PlaneIcon /> };
    if (has('return-home')) return { kind: 'home', label: 'Regreso a casa', icon: <HomeIcon /> };
    if (entry.squadTrack === 'development') return { kind: 'academy', label: 'Academia', icon: <SeedIcon /> };
    if (entry.severeInjury) return { kind: 'injury', label: 'Lesión grave', icon: <CrossIcon /> };
    if (entry.caps > 0) return { kind: 'cap', label: 'Caps', icon: <ShieldIcon /> };
    return null;
}

/**
 * Línea temporal vertical. Una entrada por temporada realmente jugada, con el
 * dato tal como estaba ESE año. Cada temporada lleva un MARCADOR (icono +
 * etiqueta) que diferencia título, primer contrato, pase, academia, selección o
 * lesión sin depender solo del color.
 */
export default function CareerTimeline({ history, highlight = null }: Props) {
    if (history.length === 0) {
        return <p className={styles.timelineEmpty}>La trayectoria aparece cuando se juegue la primera temporada.</p>;
    }

    return (
        <ol className={styles.timeline}>
            {history.map((entry, index) => {
                const isLatest = highlight === index;
                const marker = markerFor(entry);
                return (
                    <li
                        key={entry.season}
                        className={`${styles.tlItem} ${isLatest ? styles.tlItemNow : ''}`}
                        aria-current={isLatest ? 'true' : undefined}
                    >
                        <div className={styles.tlRail}>
                            <span className={`${styles.tlMarker} ${marker?.strong ? styles.tlMarkerStrong : ''}`} title={marker?.label} aria-hidden="true">
                                {marker ? marker.icon : <span className={styles.tlDot} />}
                            </span>
                        </div>

                        <div className={styles.tlAge}>
                            <span className={styles.num}>{entry.age}</span>
                            {isLatest && <span className={styles.tlNowTag}>Actual</span>}
                        </div>

                        <div className={styles.tlBody}>
                            <p className={styles.tlClub}>
                                <ClubBadge clubId={entry.clubId} clubName={entry.clubName} size={40} />
                                <span className={styles.tlClubName}>{entry.clubName}</span>
                            </p>
                            <p className={styles.tlMeta}>
                                <span className={styles.tlComp}>{entry.competitionName}</span>
                                <span className={styles.tlContract}>{contractLabel(entry.employment, entry.squadTrack)}</span>
                            </p>
                            {(marker || entry.milestones.length > 0) && (
                                <p className={styles.tlMilestones}>
                                    {marker && <span className={styles.tlMarkerTag}>{marker.label}</span>}
                                    {entry.milestones
                                        .filter((m) => m !== 'first-title')
                                        .map((m) => (
                                            <span key={m} className={styles.tlMilestone}>{MILESTONE_LABELS[m]}</span>
                                        ))}
                                </p>
                            )}
                        </div>

                        <div className={styles.tlNumbers}>
                            <span className={styles.tlOvr}>
                                <span className={styles.num}>{entry.ovr}</span>
                                <span className={styles.tlOvrLabel}>OVR</span>
                            </span>
                            {/* Planilla de la temporada. Los ceros van tenues: un
                                pilar no anota, y eso no es un dato faltante. */}
                            <span className={styles.tlLine}>
                                <Stat value={entry.appearances} label="PJ" />
                                <Stat value={entry.points} label="pts" />
                                <Stat value={entry.tries} label="tries" />
                                <Stat value={entry.tackles} label="tackles" />
                                <Stat value={entry.secondaryStat} label={entry.secondaryStatLabel.toLowerCase()} />
                            </span>
                            {entry.caps > 0 && (
                                <span className={styles.tlCaps}>
                                    <span className={styles.num}>{entry.caps}</span> caps
                                </span>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

/** Una celda de la planilla. El cero (o el guion del que no patea) va tenue. */
function Stat({ value, label }: { value: number | string; label: string }) {
    const zero = value === 0 || value === '0' || value === '—';
    return (
        <span className={`${styles.tlStat} ${zero ? styles.tlStatZero : ''}`}>
            <span className={styles.num}>{value}</span> {label}
        </span>
    );
}

function TrophyIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" /><path d="M6 4H4v1a4 4 0 0 0 4 4" /><path d="M18 4h2v1a4 4 0 0 1-4 4" /><path d="M12 11v4" /><path d="M9 19h6" />
        </svg>
    );
}
function StarIcon() {
    return <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" /></svg>;
}
function ShieldIcon() {
    return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>;
}
function PlaneIcon() {
    return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13L2 9l2-1 6 1 5-6 2 1-3 7 5 4-1 2-6-3-3 5-2-1z" /></svg>;
}
function HomeIcon() {
    return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></svg>;
}
function SeedIcon() {
    return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20V9" /><path d="M12 9c0-3 2-5 6-5 0 4-2 6-6 6z" /><path d="M12 12C12 9 10 7 6 7c0 4 2 5 6 5z" /></svg>;
}
function CrossIcon() {
    return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></svg>;
}
