'use client';

import { useMemo } from 'react';
import {
    PLAYOFF_APPROACHES,
    getClub,
    getCompetition,
    mySideOf,
    playoffChances,
    type CoachState,
    type KnockoutTie,
    type PlayoffApproachId,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

/** La instancia con su artículo, para leerla en una frase. */
const STAGE_PHRASE: Record<string, string> = {
    octavos: 'los octavos',
    cuartos: 'los cuartos',
    semis: 'la semifinal',
    final: 'la final',
};

const STAGE_NAME: Record<string, string> = {
    octavos: 'Octavos',
    cuartos: 'Cuartos de final',
    semis: 'Semifinal',
    final: 'Final',
};

function TieRow({ tie, myClubId }: { tie: KnockoutTie; myClubId: string }) {
    const home = getClub(tie.homeId);
    const away = getClub(tie.awayId);
    // En eliminación el empate lo gana el local, que es el mejor ubicado.
    const homeWon = tie.homePf >= tie.awayPf;
    const mine = tie.homeId === myClubId || tie.awayId === myClubId;
    return (
        <li className={`${styles.poTie} ${mine ? styles.poTieMine : ''}`}>
            <span className={styles.poStage}>{STAGE_NAME[tie.stage] ?? tie.stage}</span>
            <span className={`${styles.poSide} ${homeWon ? styles.poWin : ''}`}>{home?.short ?? tie.homeId}</span>
            <span className={styles.poScore}>
                {tie.homePf}–{tie.awayPf}
            </span>
            <span className={`${styles.poSide} ${styles.poSideAway} ${!homeWon ? styles.poWin : ''}`}>
                {away?.short ?? tie.awayId}
            </span>
        </li>
    );
}

/**
 * El playoff, partido a partido. Muestra el cruce, la llave con lo que ya se
 * jugó, y las tres formas de encarar el partido con sus chances —calculadas
 * jugándolo 400 veces, no inventadas—. Elegir una juega el partido.
 */
export default function PlayoffBoard({
    state,
    onPlay,
}: {
    state: CoachState;
    onPlay: (approach: PlayoffApproachId) => void;
}) {
    const p = state.playoff;
    const chances = useMemo(() => playoffChances(state, mySideOf(state)), [state]);
    if (!p) return null;

    const comp = getCompetition(p.competitionId);
    const home = getClub(p.homeId);
    const away = getClub(p.awayId);
    // La posición en la TABLA, no en la siembra: en el reducido el primero de la
    // llave es el 2° de la tabla.
    const posOf = (id: string) => state.lastTable.findIndex((r) => r.clubId === id) + 1;
    const lastMine = [...p.played].reverse().find((t) => t.homeId === state.clubId || t.awayId === state.clubId);
    const rivalId = p.homeId === state.clubId ? p.awayId : p.homeId;
    const ascenso = p.kind === 'ascenso';
    const what = ascenso ? 'Reducido por el ascenso' : 'Playoff por el título';

    return (
        <article className={styles.eventCard}>
            <div className={styles.eventHead}>
                <span className={styles.eventFamily}>
                    {what} · {comp?.short ?? p.competitionId}
                </span>
                <span className={styles.eventStep}>{STAGE_NAME[p.stage]}</span>
            </div>

            {lastMine ? (
                <p className={styles.poBanner} role="status">
                    Pasaste {STAGE_PHRASE[lastMine.stage]}: {lastMine.homePf}–{lastMine.awayPf}. Ahora,{' '}
                    {STAGE_PHRASE[p.stage]}.
                </p>
            ) : (
                <p className={styles.poBanner} role="status">
                    {ascenso
                        ? `El campeón ya ascendió. La otra plaza se juega entre el ${posOf(p.seeds[0])}° y el ${posOf(p.seeds[p.seeds.length - 1])}°: el que gana la final, asciende.`
                        : `Entraste a la definición entre los ${p.seeds.length} primeros.`}
                    {p.played.length > 0 ? ' Por terminar arriba, esperaste la primera ronda.' : ''}
                </p>
            )}

            <div className={styles.poMatch}>
                {[home, away].map((club, i) =>
                    club ? (
                        <div key={club.id} className={`${styles.poTeam} ${club.id === state.clubId ? styles.poTeamMine : ''}`}>
                            <ClubCrest club={club} small />
                            <span className={styles.poTeamName}>{club.short}</span>
                            <span className={styles.poSeed}>
                                {posOf(club.id)}° en la tabla{i === 0 && !p.neutral ? ' · local' : ''}
                            </span>
                        </div>
                    ) : null,
                )}
            </div>
            <p className={styles.objectiveNote}>
                {p.neutral
                    ? 'Cancha neutral. Si empatan, gana el mejor ubicado en la tabla.'
                    : 'En cancha del mejor ubicado, que también pasa si empatan.'}{' '}
                Enfrente: {getClub(rivalId)?.name ?? rivalId}.
            </p>

            <p className={styles.optionsLead}>Cómo lo encarás</p>
            <div className={styles.options}>
                {PLAYOFF_APPROACHES.map((a, idx) => (
                    <button key={a.id} type="button" className={styles.option} onClick={() => onPlay(a.id)}>
                        <span className={styles.optionIndex}>{String.fromCharCode(65 + idx)}</span>
                        <span className={styles.optionBody}>
                            <span className={styles.optionLabel}>{a.label}</span>
                            <span className={styles.optionHint}>{a.hint}</span>
                            <span className={styles.odds}>
                                <span className={styles.oddsBar} aria-hidden="true">
                                    <span className={styles.oddsSeg} style={{ width: `${chances[a.id]}%` }} />
                                </span>
                                <span className={styles.oddsText}>Chance de ganar: {chances[a.id]}%</span>
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            {p.played.length > 0 && (
                <ol className={styles.poBracket} aria-label={ascenso ? 'El reducido' : 'La llave'}>
                    {p.played.map((t, i) => (
                        <TieRow key={i} tie={t} myClubId={state.clubId} />
                    ))}
                </ol>
            )}
        </article>
    );
}
