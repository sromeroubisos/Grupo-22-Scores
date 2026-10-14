'use client';

import { useMemo } from 'react';
import {
    HALF_ADJUSTS,
    KEY_PLANS,
    TRAMOS,
    getClub,
    halfAdjustChances,
    keyPlanChances,
    xvFatigueOf,
    type CoachState,
    type HalfAdjustId,
    type KeyPlanId,
    type TrainingFocus,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

const FOCUS_LABEL: Record<TrainingFocus, string> = {
    'scrum-line': 'el scrum y el line',
    defensa: 'la defensa',
    ataque: 'el ataque',
    fisico: 'lo físico',
    recuperacion: 'la recuperación',
};

/**
 * Minijuego 2: el partido clave del tramo, en dos tiempos.
 *
 * Antes de salir: el plan, con el clima y el cansancio a la vista. Se juega el
 * primer tiempo y frena con el marcador: el ajuste del entretiempo (cerrar,
 * arriesgar, rotar o seguir) juega el segundo y el resto de las fechas del tramo.
 * Las chances de cada opción salen de jugar el partido 300 veces con un azar
 * aparte: mirarlas no cambia lo que va a pasar.
 */
export default function KeyMatchBoard({
    state,
    onFirstHalf,
    onSecondHalf,
}: {
    state: CoachState;
    onFirstHalf: (plan: KeyPlanId) => void;
    onSecondHalf: (adjust: HalfAdjustId) => void;
}) {
    const ins = state.inSeason;
    const key = ins?.key ?? null;
    const half = key?.firstHalf ?? null;
    const planChances = useMemo(() => (key && !half ? keyPlanChances(state) : null), [state, key, half]);
    const adjustChances = useMemo(() => (half ? halfAdjustChances(state) : null), [state, half]);
    const fatigue = useMemo(() => xvFatigueOf(state), [state]);
    if (!ins || !key) return null;

    const me = getClub(state.clubId);
    const rival = getClub(key.rivalId);
    const home = key.home ? me : rival;
    const away = key.home ? rival : me;
    const posOf = (id: string) => ins.table.findIndex((r) => r.clubId === id) + 1;
    const myPts = half ? (key.home ? half.homePf : half.awayPf) : 0;
    const rivalPts = half ? (key.home ? half.awayPf : half.homePf) : 0;
    const attacked = (ins.week?.keyBonus ?? 0) > 0;

    return (
        <article className={styles.eventCard}>
            <div className={styles.eventHead}>
                <span className={styles.eventFamily}>Partido clave · fecha {key.round}</span>
                <span className={styles.eventStep}>
                    Tramo {ins.tramo + 1} de {TRAMOS}
                </span>
            </div>

            <div className={styles.poMatch}>
                {[home, away].map((club, i) =>
                    club ? (
                        <div key={club.id} className={`${styles.poTeam} ${club.id === state.clubId ? styles.poTeamMine : ''}`}>
                            <ClubCrest club={club} small />
                            <span className={styles.poTeamName}>{club.short}</span>
                            <span className={styles.poSeed}>
                                {posOf(club.id) > 0 ? `${posOf(club.id)}° en la tabla` : ''}
                                {i === 0 ? ' · local' : ''}
                            </span>
                            {half && (
                                <span className={styles.keyScore} aria-label={`${club.short}: ${i === 0 ? half.homePf : half.awayPf} puntos`}>
                                    {i === 0 ? half.homePf : half.awayPf}
                                </span>
                            )}
                        </div>
                    ) : null,
                )}
            </div>

            <ul className={styles.keyFacts}>
                <li>{key.rain ? 'Llueve: la cancha está pesada y el juego cerrado rinde más.' : 'Cancha seca: se puede mover la pelota.'}</li>
                <li>
                    Cansancio del XV: {fatigue}.{' '}
                    {fatigue > 55 ? 'Con las piernas así, el juego abierto se paga.' : 'Hay piernas para correr.'}
                </li>
                <li>
                    {rival?.short ?? key.rivalId} flojea en {FOCUS_LABEL[key.weakness]}.{' '}
                    {attacked ? 'La semana lo trabajó: suma en este partido.' : 'La semana no lo trabajó.'}
                </li>
            </ul>

            {!half && planChances && (
                <>
                    <p className={styles.optionsLead}>El plan antes de salir</p>
                    <div className={styles.options}>
                        {KEY_PLANS.map((p, idx) => (
                            <button key={p.id} type="button" className={styles.option} onClick={() => onFirstHalf(p.id)}>
                                <span className={styles.optionIndex}>{String.fromCharCode(65 + idx)}</span>
                                <span className={styles.optionBody}>
                                    <span className={styles.optionLabel}>{p.label}</span>
                                    <span className={styles.optionHint}>{p.hint}</span>
                                    <span className={styles.odds}>
                                        <span className={styles.oddsBar} aria-hidden="true">
                                            <span className={styles.oddsSeg} style={{ width: `${planChances[p.id]}%` }} />
                                        </span>
                                        <span className={styles.oddsText}>Chance de ganar: {planChances[p.id]}%</span>
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className={styles.objectiveNote}>Elegir el plan juega el primer tiempo.</p>
                </>
            )}

            {half && adjustChances && (
                <>
                    <p className={styles.poBanner} role="status">
                        Entretiempo: {myPts > rivalPts ? 'vas ganando' : myPts < rivalPts ? 'vas perdiendo' : 'van empatados'}{' '}
                        {myPts}–{rivalPts}.{half.note ? ` ${half.note}` : ''}
                    </p>
                    <p className={styles.optionsLead}>La charla del entretiempo</p>
                    <div className={styles.options}>
                        {HALF_ADJUSTS.map((a, idx) => (
                            <button key={a.id} type="button" className={styles.option} onClick={() => onSecondHalf(a.id)}>
                                <span className={styles.optionIndex}>{String.fromCharCode(65 + idx)}</span>
                                <span className={styles.optionBody}>
                                    <span className={styles.optionLabel}>{a.label}</span>
                                    <span className={styles.optionHint}>{a.hint}</span>
                                    <span className={styles.odds}>
                                        <span className={styles.oddsBar} aria-hidden="true">
                                            <span className={styles.oddsSeg} style={{ width: `${adjustChances[a.id]}%` }} />
                                        </span>
                                        <span className={styles.oddsText}>Chance de ganar: {adjustChances[a.id]}%</span>
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className={styles.objectiveNote}>Elegir juega el segundo tiempo y el resto de las fechas del tramo.</p>
                </>
            )}
        </article>
    );
}
