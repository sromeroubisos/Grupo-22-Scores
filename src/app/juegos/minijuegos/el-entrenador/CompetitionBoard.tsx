import {
    clubsIn,
    competitionName,
    fechasOf,
    formatFor,
    formatSummary,
    getClub,
    getCompetition,
    promotionSlotsOf,
    promotionSummary,
    relegationSlotsOf,
    relegationSummary,
    tierAbove,
    tierBelow,
    type CoachState,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

/**
 * El torneo antes de jugarlo: quiénes son los rivales, cuánto pesan y dónde
 * estás parado entre ellos. Y las reglas del año en una línea: cuántos suben,
 * cuántos bajan, cuántos van al Interior. El objetivo que te pide la subcomisión
 * sale de este orden, así que conviene mirarlo antes de quejarse.
 */
export default function CompetitionBoard({ state }: { state: CoachState }) {
    const comp = getCompetition(state.competitionId);
    if (!comp) return null;

    const ids = clubsIn(state.world, comp.id);
    const ratings = ids.map((id) => state.world.ratings[id]);
    const max = Math.max(...ratings);
    const min = Math.min(...ratings);
    const span = Math.max(1, max - min);
    const myRank = ids.indexOf(state.clubId) + 1;

    const up = tierAbove(comp.id);
    const down = tierBelow(comp.id);
    const format = formatFor(comp.id, state.year);
    const fechas = fechasOf(comp.id, state.year);
    const promotionSlots = up ? promotionSlotsOf(format) : 0;
    const relegationSlots = down ? relegationSlotsOf(format) : 0;
    const promo = up ? promotionSummary(format) : null;
    const releg = down ? relegationSummary(format) : null;

    return (
        <div className={styles.compBoard}>
            <div className={styles.squadStats}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Tu lugar por fuerza</span>
                    <span className={styles.ledgerValue}>
                        {myRank}° de {ids.length}
                    </span>
                    <span className={styles.ledgerHint}>de acá sale lo que te piden</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Formato</span>
                    <span className={styles.ledgerValue}>{fechas} fechas</span>
                    <span className={styles.ledgerHint}>{formatSummary(format)}</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Lo que se juega</span>
                    <span className={styles.ledgerValue}>
                        {[
                            promotionSlots > 0 ? `${promotionSlots} sube${promotionSlots > 1 ? 'n' : ''}` : null,
                            relegationSlots > 0 ? `${relegationSlots} baja${relegationSlots > 1 ? 'n' : ''}` : null,
                            comp.tdiSlots > 0 ? `${comp.tdiSlots} al Interior` : null,
                        ]
                            .filter(Boolean)
                            .join(' · ') || 'el título'}
                    </span>
                    <span className={styles.ledgerHint}>
                        {up ? `arriba: ${up.short}` : 'es el techo'}
                        {down ? ` · abajo: ${down.short}` : ''}
                    </span>
                </span>
            </div>

            <ul className={styles.formatRules} aria-label={`Reglamento ${state.year}`}>
                <li>
                    <strong>Formato {state.year}:</strong> {formatSummary(format)}.
                </li>
                {promo && (
                    <li>
                        <strong>Ascenso a {up?.short}:</strong> {promo}
                    </li>
                )}
                {releg && (
                    <li>
                        <strong>Descenso a {down?.short}:</strong> {releg}
                    </li>
                )}
                {format.caveat && <li className={styles.formatSource}>{format.caveat}</li>}
                <li className={styles.formatSource}>
                    {format.status === 'verificado' ? 'Verificado contra el reglamento' : 'Formato aproximado'} ·{' '}
                    {format.source}
                </li>
            </ul>

            <ol className={styles.rivalList} aria-label={`Clubes de ${competitionName(comp.id)} por fuerza`}>
                {ids.map((id, i) => {
                    const club = getClub(id);
                    const rating = state.world.ratings[id];
                    const pos = i + 1;
                    const zone =
                        comp.tdiSlots > 0 && pos <= comp.tdiSlots
                            ? styles.zoneTdi
                            : relegationSlots > 0 && pos > comp.teams - relegationSlots
                              ? styles.zoneRelegation
                              : '';
                    return (
                        <li key={id} className={`${styles.rival} ${id === state.clubId ? styles.rivalMine : ''} ${zone}`}>
                            <span className={styles.rivalPos}>{pos}</span>
                            {club && <ClubCrest club={club} small />}
                            <span className={styles.rivalName}>{club?.short ?? id}</span>
                            <span className={styles.rivalBar} aria-hidden="true">
                                <span
                                    className={styles.rivalFill}
                                    style={{ width: `${20 + ((rating - min) / span) * 80}%` }}
                                />
                            </span>
                            <span className={styles.rivalRating}>{rating.toFixed(1)}</span>
                        </li>
                    );
                })}
            </ol>
            <p className={styles.legend}>
                {comp.tdiSlots > 0 && (
                    <span>
                        <span className={styles.legendDot} style={{ background: '#2563eb' }} />
                        Cupo al Torneo del Interior
                    </span>
                )}
                {relegationSlots > 0 && (
                    <span>
                        <span className={styles.legendDot} style={{ background: '#dc2626' }} />
                        Zona de descenso
                    </span>
                )}
                <span>La barra es la fuerza del plantel. El orden es solo por fuerza, no por la tabla.</span>
            </p>
        </div>
    );
}
