'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    bonusDefensive,
    bonusOffensive,
    competitionName,
    getClub,
    sortTable,
    type CoachState,
    type MatchResult,
    type TableRow,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

/** Milisegundos por fecha cuando corre sola. */
const STEP_MS = 1100;

function emptyRow(clubId: string): TableRow {
    return { clubId, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pc: 0, tries: 0, bonusOf: 0, bonusDef: 0, points: 0 };
}

/**
 * La tabla HASTA una fecha, rearmada desde los partidos con la misma regla del
 * motor: cuatro por ganado, dos por empatado, más los bonus. El motor solo
 * guarda la tabla final; la de cada fecha se reconstruye acá para poder
 * mostrarla moviéndose.
 */
function standingsUpTo(matches: readonly MatchResult[], round: number, clubIds: readonly string[]): TableRow[] {
    const rows = new Map(clubIds.map((id) => [id, emptyRow(id)]));
    const apply = (row: TableRow | undefined, pf: number, pc: number, tries: number) => {
        if (!row) return;
        row.played += 1;
        row.pf += pf;
        row.pc += pc;
        row.tries += tries;
        if (pf > pc) {
            row.won += 1;
            row.points += 4;
        } else if (pf === pc) {
            row.drawn += 1;
            row.points += 2;
        } else {
            row.lost += 1;
        }
        if (bonusOffensive(tries)) {
            row.bonusOf += 1;
            row.points += 1;
        }
        if (bonusDefensive(pf, pc)) {
            row.bonusDef += 1;
            row.points += 1;
        }
    };
    for (const m of matches) {
        if (m.round > round) continue;
        apply(rows.get(m.homeId), m.homePf, m.awayPf, m.homeTries);
        apply(rows.get(m.awayId), m.awayPf, m.homePf, m.awayTries);
    }
    return sortTable([...rows.values()]);
}

function positionOf(table: readonly TableRow[], clubId: string): number {
    return table.findIndex((r) => r.clubId === clubId) + 1;
}

const RESULT_CLASS = { G: styles.pillWin, E: styles.pillDraw, P: styles.pillLoss } as const;
const RESULT_TEXT = { G: 'Ganado', E: 'Empatado', P: 'Perdido' } as const;

/**
 * Las fechas de un tramo, una por una. Todo ya está jugado y guardado —el motor
 * resolvió el tramo y el guardado es determinista—; esto es la forma de LEERLO:
 * tu partido en grande, los otros de la fecha, y la tabla acomodándose. Corre
 * sola, se puede pausar y se puede saltar al final. Al recargar no se repite:
 * la partida va directo al resumen del tramo.
 */
export default function SeasonPlayback({
    state,
    from,
    to,
    doneLabel,
    onDone,
}: {
    state: CoachState;
    /** Las fechas que se muestran, inclusive. */
    from: number;
    to: number;
    doneLabel: string;
    onDone: () => void;
}) {
    const matches = state.inSeason?.matches ?? state.lastMatches;
    const table0 = state.inSeason?.table ?? state.lastTable;
    const rounds = useMemo(() => Math.min(to, Math.max(0, ...matches.map((m) => m.round))), [matches, to]);
    const clubIds = useMemo(() => table0.map((r) => r.clubId), [table0]);
    const [round, setRound] = useState(from);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused || round >= rounds) return;
        const t = setTimeout(() => setRound((r) => Math.min(rounds, r + 1)), STEP_MS);
        return () => clearTimeout(t);
    }, [paused, round, rounds]);

    // Sin partidos no hay nada que reproducir: se pasa directo al resumen.
    useEffect(() => {
        if (rounds < from) onDone();
    }, [rounds, from, onDone]);
    if (rounds < from) return null;

    const table = standingsUpTo(matches, round, clubIds);
    const before = standingsUpTo(matches, round - 1, clubIds);
    const myPos = positionOf(table, state.clubId);
    const myPosBefore = round > 1 ? positionOf(before, state.clubId) : myPos;

    const fixtures = matches.filter((m) => m.round === round);
    const mine = fixtures.find((m) => m.homeId === state.clubId || m.awayId === state.clubId) ?? null;
    const others = fixtures.filter((m) => m !== mine);
    const finished = round >= rounds;

    let myCard: { home: boolean; pf: number; pc: number; rivalId: string; result: 'G' | 'E' | 'P' } | null = null;
    if (mine) {
        const home = mine.homeId === state.clubId;
        const pf = home ? mine.homePf : mine.awayPf;
        const pc = home ? mine.awayPf : mine.homePf;
        myCard = { home, pf, pc, rivalId: home ? mine.awayId : mine.homeId, result: pf > pc ? 'G' : pf < pc ? 'P' : 'E' };
    }
    const rival = myCard ? getClub(myCard.rivalId) : null;

    return (
        <section className={styles.panel} aria-live="polite">
            <div className={styles.playbackHead}>
                <p className={styles.panelTitle}>
                    {competitionName(state.competitionId)} · fecha {round} (de la {from} a la {rounds})
                </p>
                <div className={styles.playbackControls}>
                    <button type="button" className={styles.ghost} onClick={() => setPaused((p) => !p)} disabled={finished}>
                        {paused ? 'Seguir' : 'Pausar'}
                    </button>
                    <button type="button" className={styles.ghost} onClick={onDone}>
                        {finished ? 'Ver el resumen' : 'Saltar al final'}
                    </button>
                </div>
            </div>

            <div className={styles.playbackBar} aria-hidden="true">
                <span className={styles.playbackFill} style={{ width: `${((round - from + 1) / (rounds - from + 1)) * 100}%` }} />
            </div>

            {myCard ? (
                <div className={`${styles.matchHero} ${myCard.result === 'G' ? styles.heroGood : myCard.result === 'P' ? styles.heroBad : ''}`}>
                    <span className={`${styles.pill} ${RESULT_CLASS[myCard.result]}`}>{myCard.result}</span>
                    <span className={styles.matchHeroScore}>
                        {myCard.pf}–{myCard.pc}
                    </span>
                    <span className={styles.matchHeroRival}>
                        {rival && <ClubCrest club={rival} small />}
                        <span className={styles.matchHeroText}>
                            <span className={styles.teamName}>
                                {RESULT_TEXT[myCard.result]} contra {rival?.short ?? myCard.rivalId}
                            </span>
                            <span className={styles.matchVenue}>
                                {myCard.home ? 'de local' : 'de visitante'}
                                {mine?.note ? ` · ${mine.note}` : ''}
                            </span>
                        </span>
                    </span>
                    <span className={styles.matchHeroPos}>
                        {myPos}°
                        {myPosBefore !== myPos && (
                            <span className={myPos < myPosBefore ? styles.posUp : styles.posDown}>
                                {myPos < myPosBefore ? ' ▲' : ' ▼'}
                            </span>
                        )}
                    </span>
                </div>
            ) : (
                <p className={styles.objectiveNote}>Fecha libre para tu club.</p>
            )}

            <div className={styles.playbackGrid}>
                <ol className={styles.miniFixture} aria-label="Otros partidos de la fecha">
                    {others.map((m) => {
                        const h = getClub(m.homeId);
                        const a = getClub(m.awayId);
                        return (
                            <li key={`${m.homeId}-${m.awayId}`} className={styles.miniMatch}>
                                <span className={`${styles.miniSide} ${m.homePf > m.awayPf ? styles.tieWinner : ''}`}>
                                    {h?.short ?? m.homeId}
                                </span>
                                <span className={styles.miniScore}>
                                    {m.homePf}–{m.awayPf}
                                </span>
                                <span className={`${styles.miniSide} ${styles.miniAway} ${m.awayPf > m.homePf ? styles.tieWinner : ''}`}>
                                    {a?.short ?? m.awayId}
                                </span>
                            </li>
                        );
                    })}
                </ol>

                <ol className={styles.miniTable} aria-label="Tabla hasta esta fecha">
                    {table.map((row, i) => {
                        const club = getClub(row.clubId);
                        const prev = positionOf(before, row.clubId);
                        const pos = i + 1;
                        return (
                            <li key={row.clubId} className={`${styles.miniRow} ${row.clubId === state.clubId ? styles.rivalMine : ''}`}>
                                <span className={styles.rivalPos}>{pos}</span>
                                <span className={styles.miniMove} aria-hidden="true">
                                    {round > 1 && prev !== pos ? (pos < prev ? '▲' : '▼') : ''}
                                </span>
                                {club && <ClubCrest club={club} small />}
                                <span className={styles.rivalName}>{club?.short ?? row.clubId}</span>
                                <span className={styles.miniPts}>{row.points}</span>
                            </li>
                        );
                    })}
                </ol>
            </div>

            {finished && (
                <div className={styles.actionBar}>
                    <button type="button" className={styles.primary} onClick={onDone}>
                        {doneLabel}
                    </button>
                </div>
            )}
        </section>
    );
}
