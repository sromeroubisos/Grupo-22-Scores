'use client';

import type { CareerSeasonEntry, CareerState } from '@/features/career';
import { contractLabel, getClub, MILESTONE_LABELS } from '@/features/career';
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
    const delta = entry.ovrDelta;
    const contractChanged = !previous
        || previous.employment !== entry.employment
        || previous.squadTrack !== entry.squadTrack;
    const clubChanged = previous && previous.clubId !== entry.clubId;

    // Títulos DEL JUGADOR (los disputó) vs títulos SOLO del club (no acreditados).
    const playerTitles = entry.participations.filter((c) => c.playerCredited);
    const clubOnlyTitles = entry.participations.filter((c) => c.clubWon && !c.playerCredited);

    // Una temporada quieta en el techo se cuenta distinto de una quieta a mitad
    // de camino: la primera es el pico de la carrera, la segunda es un año perdido.
    const atCeiling = delta === 0 && entry.ovr >= career.player.potential - 1;
    const flatNote = delta === 0 ? flatSeasonNote(career.history, entry) : null;

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
                {entry.points > 0 && <li><span className={styles.num}>{entry.points}</span> puntos</li>}
                {entry.tries > 0 && <li><span className={styles.num}>{entry.tries}</span> tries</li>}
                <li><span className={styles.num}>{entry.secondaryStat}</span> {entry.secondaryStatLabel.toLowerCase()}</li>
                {entry.caps > 0 && <li><span className={styles.num}>{entry.caps}</span> caps</li>}
                <li className={delta === 0 ? styles.deltaFlat : delta > 0 ? styles.deltaUp : styles.deltaDown}>
                    OVR <span className={styles.num}>{entry.ovr}</span>
                    <span className={styles.deltaSep} aria-hidden="true"> · </span>
                    {delta !== 0 ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : atCeiling ? 'en tu techo' : 'sin cambios'}
                </li>
            </ul>

            {flatNote && <p className={styles.flatNote}>{flatNote}</p>}

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

/**
 * Qué SÍ se movió cuando el OVR no se movió.
 *
 * Una temporada de pico no es una temporada vacía: se siguen jugando partidos,
 * sumando caps y anotando. Sin esta línea, las tres o cuatro temporadas que el
 * jugador pasa en su techo se leen como tiempo muerto — que es exactamente lo
 * que pasaba antes de 1.9.0, con "OVR 63 · sin cambios" repetido y nada más.
 *
 * Se muestra un solo récord personal, el más significativo que haya.
 */
function flatSeasonNote(history: CareerSeasonEntry[], entry: CareerSeasonEntry): string | null {
    const past = history.slice(0, -1);
    if (past.length === 0) return null;
    const bestBefore = (pick: (h: CareerSeasonEntry) => number) => Math.max(...past.map(pick));

    if (entry.caps > 0 && entry.caps >= bestBefore((h) => h.caps)) return 'Tu mejor temporada con el seleccionado';
    if (entry.points > 0 && entry.points >= bestBefore((h) => h.points)) return 'Tu mejor cosecha de puntos';
    if (entry.tries > 0 && entry.tries >= bestBefore((h) => h.tries)) return 'Tu mejor temporada de tries';
    if (entry.tackles > 0 && entry.tackles >= bestBefore((h) => h.tackles)) return 'Tu mejor temporada de tackles';
    if (entry.appearances > 0 && entry.appearances >= bestBefore((h) => h.appearances)) return 'Tu temporada de más rodaje';
    return null;
}

function headlineFromEntry(entry: { milestones: (keyof typeof MILESTONE_LABELS)[]; clubName: string }): string {
    const m = entry.milestones[0];
    return `${MILESTONE_LABELS[m]} · ${entry.clubName}`;
}
