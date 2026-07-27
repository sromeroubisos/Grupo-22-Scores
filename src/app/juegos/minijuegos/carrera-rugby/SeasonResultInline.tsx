'use client';

import type { CareerState } from '@/features/career';
import { contractLabel, describePosition, getClub, MILESTONE_LABELS } from '@/features/career';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

/**
 * Actualización COMPACTA de la temporada recién jugada (no repite la cabecera).
 * Lee la entrada histórica CONGELADA. Muestra la DIVISIÓN REAL, separa el título
 * DEL JUGADOR (lo disputó) del título institucional DEL CLUB, y anuncia el
 * cambio de contrato/club solo si ocurrió. Se anuncia con aria-live.
 */
export default function SeasonResultInline({ career }: { career: CareerState }) {
    const entry = career.history[career.history.length - 1];
    if (!entry) return null;
    const previous = career.history[career.history.length - 2];

    const club = getClub(entry.clubId);
    const primary = describePosition(career.player.position).stats[0];
    const delta = entry.ovrDelta;
    const contractChanged = !previous
        || previous.employment !== entry.employment
        || previous.squadTrack !== entry.squadTrack;
    const clubChanged = previous && previous.clubId !== entry.clubId;

    // Títulos DEL JUGADOR (los disputó) vs títulos SOLO del club (no acreditados).
    const playerTitles = entry.participations.filter((c) => c.playerCredited);
    const clubOnlyTitles = entry.participations.filter((c) => c.clubWon && !c.playerCredited);

    return (
        <section className={styles.result} aria-live="polite" aria-label="Resultado de la temporada">
            <p className={styles.resultHeadline}>{entry.milestones.length > 0 ? headlineFromEntry(entry) : seasonHeadline(entry)}</p>

            <p className={styles.resultMeta}>
                <span className={styles.resultTag}>Temporada {entry.season}</span>
                <span className={styles.num}>{entry.age} años</span>
                <span className={styles.resultClub}>
                    <ClubBadge clubId={club.id} clubName={entry.clubName} size={16} />
                    {entry.clubName}
                </span>
                <span className={styles.resultComp}>{entry.competitionName}</span>
            </p>

            <ul className={styles.resultStats}>
                <li><span className={styles.num}>{entry.appearances}</span> partidos</li>
                <li><span className={styles.num}>{entry.primaryStat}</span> {primary.label.toLowerCase()}</li>
                {entry.caps > 0 && <li><span className={styles.num}>{entry.caps}</span> caps</li>}
                <li className={delta === 0 ? styles.deltaFlat : delta > 0 ? styles.deltaUp : styles.deltaDown}>
                    OVR <span className={styles.num}>{entry.ovr}</span>
                    <span className={styles.deltaSep} aria-hidden="true"> · </span>
                    {delta === 0 ? 'sin cambios' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
                </li>
            </ul>

            {(playerTitles.length > 0 || clubOnlyTitles.length > 0 || contractChanged || clubChanged || entry.milestones.length > 0) && (
                <p className={styles.resultBadges}>
                    {playerTitles.map((c) => (
                        <span key={c.competitionId} className={styles.badgeWin}>🏆 {c.competitionName}</span>
                    ))}
                    {clubOnlyTitles.map((c) => (
                        <span key={`club-${c.competitionId}`} className={styles.badgeClubOnly}>El club: campeón de {c.competitionName}</span>
                    ))}
                    {clubChanged && <span className={styles.badgeMove}>Nuevo club</span>}
                    {contractChanged && <span className={styles.badgeContract}>{contractLabel(entry.employment, entry.squadTrack)}</span>}
                    {entry.milestones.map((m) => (
                        <span key={m} className={styles.badgeMilestone}>{MILESTONE_LABELS[m]}</span>
                    ))}
                </p>
            )}
        </section>
    );
}

function seasonHeadline(entry: { appearances: number; ovrDelta: number; clubName: string }): string {
    if (entry.ovrDelta >= 3) return `Temporada de crecimiento en ${entry.clubName}`;
    if (entry.ovrDelta <= -2) return `Temporada difícil en ${entry.clubName}`;
    if (entry.appearances >= 18) return `Temporada de mucho rodaje en ${entry.clubName}`;
    return `Otra temporada en ${entry.clubName}`;
}

function headlineFromEntry(entry: { milestones: (keyof typeof MILESTONE_LABELS)[]; clubName: string }): string {
    const m = entry.milestones[0];
    return `${MILESTONE_LABELS[m]} · ${entry.clubName}`;
}
