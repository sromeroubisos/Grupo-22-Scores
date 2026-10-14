'use client';

import { useMemo } from 'react';
import {
    HALF_ADJUSTS,
    KEY_PLANS,
    TRAMOS,
    getClub,
    seasonFixture,
    totalRounds,
    tramoRange,
    type CoachState,
    type MatchResult,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

const RESULT_CLASS = { G: styles.pillWin, E: styles.pillDraw, P: styles.pillLoss } as const;

function mine(m: MatchResult, clubId: string): { home: boolean; pf: number; pc: number; rivalId: string; r: 'G' | 'E' | 'P' } {
    const home = m.homeId === clubId;
    const pf = home ? m.homePf : m.awayPf;
    const pc = home ? m.awayPf : m.homePf;
    return { home, pf, pc, rivalId: home ? m.awayId : m.homeId, r: pf > pc ? 'G' : pf < pc ? 'P' : 'E' };
}

/**
 * Se jugó el tramo: las fechas del club, el partido clave con su entretiempo,
 * la tabla parcial y el parte médico. Leído, sigue el tramo siguiente (o la
 * postemporada, si era el último).
 */
export default function TramoSummary({ state, onContinue }: { state: CoachState; onContinue: () => void }) {
    const ins = state.inSeason;
    const range = useMemo(() => tramoRange(totalRounds(seasonFixture(state)), ins?.tramo ?? 0), [state, ins?.tramo]);
    if (!ins) return null;

    const last = ins.tramo >= TRAMOS - 1;
    const played = ins.matches
        .filter((m) => m.round >= range.from && m.round <= range.to && (m.homeId === state.clubId || m.awayId === state.clubId))
        .sort((a, b) => a.round - b.round);
    const tally = played.map((m) => mine(m, state.clubId).r);
    const won = tally.filter((r) => r === 'G').length;
    const drawn = tally.filter((r) => r === 'E').length;
    const lost = tally.filter((r) => r === 'P').length;
    const position = ins.table.findIndex((r) => r.clubId === state.clubId) + 1;
    const key = ins.key;
    const keyMatch = key ? played.find((m) => m.round === key.round) : undefined;
    const newInjuries = ins.injuries.filter((n) => n.round >= range.from && n.round <= range.to);
    const out = state.squad.filter((p) => p.injury > 0).sort((a, b) => b.injury - a.injury || a.number - b.number);
    const tired = [...state.squad].sort((a, b) => b.fatigue - a.fatigue || a.number - b.number).slice(0, 3);

    return (
        <>
            <section className={styles.panel}>
                <p className={styles.panelTitle}>
                    Tramo {ins.tramo + 1} de {TRAMOS} · fechas {range.from} a {range.to}
                </p>
                <p className={styles.objective}>
                    {played.length === 0
                        ? 'El club no jugó en el tramo.'
                        : `${won} ganado${won === 1 ? '' : 's'}, ${drawn} empatado${drawn === 1 ? '' : 's'} y ${lost} perdido${lost === 1 ? '' : 's'}. Va ${position}° de ${ins.table.length}.`}
                </p>

                {key && keyMatch && (
                    <p className={styles.poBanner} role="status">
                        Partido clave contra {getClub(key.rivalId)?.short ?? key.rivalId}:{' '}
                        {mine(keyMatch, state.clubId).pf}–{mine(keyMatch, state.clubId).pc}
                        {key.firstHalf
                            ? ` (al entretiempo ${key.home ? key.firstHalf.homePf : key.firstHalf.awayPf}–${key.home ? key.firstHalf.awayPf : key.firstHalf.homePf})`
                            : ''}
                        . {KEY_PLANS.find((p) => p.id === key.plan)?.label ?? 'El plan de siempre'}
                        {key.adjust ? `, y en el entretiempo: ${HALF_ADJUSTS.find((a) => a.id === key.adjust)?.label.toLowerCase()}` : ''}.
                    </p>
                )}

                <ol className={styles.matchList}>
                    {played.map((m) => {
                        const x = mine(m, state.clubId);
                        const rival = getClub(x.rivalId);
                        return (
                            <li key={m.round} className={styles.matchRow}>
                                <span className={styles.matchRound}>F{m.round}</span>
                                <span className={`${styles.pill} ${RESULT_CLASS[x.r]}`}>{x.r}</span>
                                <span className={styles.matchScore}>
                                    {x.pf}–{x.pc}
                                </span>
                                <span className={styles.matchRival}>
                                    {rival && <ClubCrest club={rival} small />}
                                    <span className={styles.teamName}>{rival?.short ?? x.rivalId}</span>
                                    <span className={styles.matchVenue}>
                                        {x.home ? 'local' : 'visita'}
                                        {key && m.round === key.round ? ' · partido clave' : ''}
                                    </span>
                                </span>
                                {m.note && <span className={styles.matchNote}>{m.note}</span>}
                            </li>
                        );
                    })}
                </ol>
            </section>

            <section className={styles.panel}>
                <p className={styles.panelTitle}>Parte médico y piernas</p>
                {newInjuries.length === 0 && out.length === 0 ? (
                    <p className={styles.objectiveNote}>Nadie se lesionó en el tramo. El plantel está completo.</p>
                ) : (
                    <ul className={styles.keyFacts}>
                        {newInjuries.map((n) => (
                            <li key={`${n.playerId}-${n.round}`}>
                                Fecha {n.round}: {n.name}, {n.out === 1 ? 'una fecha afuera' : `${n.out} fechas afuera`}.
                            </li>
                        ))}
                        {out.length > 0 && (
                            <li>
                                Hoy afuera: {out.map((p) => `${p.name} (${p.injury === 1 ? 'vuelve en una fecha' : `${p.injury} fechas`})`).join(', ')}.
                            </li>
                        )}
                    </ul>
                )}
                <p className={styles.objectiveNote}>
                    Los más cansados: {tired.map((p) => `${p.name} (${p.fatigue})`).join(', ')}.
                </p>
            </section>

            <details className={`${styles.panel} ${styles.fold}`} open>
                <summary className={styles.foldSummary}>
                    <span className={styles.panelTitle}>Tabla parcial</span>
                    <span className={styles.summaryHint}>
                        {position}° después de la fecha {ins.round}
                    </span>
                </summary>
                <ol className={styles.miniTable} aria-label="Tabla hasta esta fecha">
                    {ins.table.map((row, i) => {
                        const club = getClub(row.clubId);
                        return (
                            <li key={row.clubId} className={`${styles.miniRow} ${row.clubId === state.clubId ? styles.rivalMine : ''}`}>
                                <span className={styles.rivalPos}>{i + 1}</span>
                                <span className={styles.miniMove} aria-hidden="true" />
                                {club && <ClubCrest club={club} small />}
                                <span className={styles.rivalName}>{club?.short ?? row.clubId}</span>
                                <span className={styles.miniPts}>{row.points}</span>
                            </li>
                        );
                    })}
                </ol>
            </details>

            <div className={styles.actionBar}>
                <button type="button" className={styles.primary} onClick={onContinue}>
                    {last ? 'Terminó la fase regular: a la definición' : `Al tramo ${ins.tramo + 2}`}
                    <span className={styles.primaryHint}>
                        {last
                            ? 'Playoff, reducido o el cierre del año'
                            : ins.tramo === 0
                              ? 'Antes, la ventana corta de pases'
                              : 'Las decisiones y la semana que vienen'}
                    </span>
                </button>
            </div>
        </>
    );
}
