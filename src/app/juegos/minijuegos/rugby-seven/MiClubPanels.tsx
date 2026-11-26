'use client';

/*
 * Pantallas de Mi Club: la pirámide (todas las divisiones, con la etiqueta de cada puesto),
 * la tabla propia con esas mismas etiquetas y el plantel.
 */

import { useState, type ReactNode } from 'react';
import { SKILL_LABEL } from './career';
import { cupName, levelDef, levelOf, MC_ME, movesByLevel, myMove, myRating, NAC_HOW, NAC_NAME, NAC_SIZE, nacionalView, pyramidTours, seasonNews, starters, tagFor, TAG_LABEL, zoneName, type McLevel, type McTag, type MiClubState } from './miClub';
import { groupStandings, roundLabel, finalRanking, type TourState } from './tours';
import styles from './seven.module.css';

type Flag = (id: string) => ReactNode;

const TAG_CLASS: Record<Exclude<McTag, null>, string> = {
    playoff: styles.tagPlayoff,
    ascenso: styles.tagUp,
    descenso: styles.tagDown,
};

/** Las etiquetas que aparecen en una división, para la leyenda. */
function tagsOf(level: McLevel): Exclude<McTag, null>[] {
    const l = levelDef(level);
    const out: Exclude<McTag, null>[] = [];
    if (l.advance) out.push('playoff');
    else if (l.up) out.push('ascenso');
    if (l.down) out.push('descenso');
    return out;
}

export function McLegend({ level }: { level: McLevel }) {
    return (
        <ul className={styles.tagLegend} aria-label="Qué significa cada color">
            {tagsOf(level).map((t) => (
                <li key={t}>
                    <span className={`${styles.tagDot} ${TAG_CLASS[t]}`} aria-hidden="true" /> {TAG_LABEL[t]}
                </li>
            ))}
        </ul>
    );
}

/** Una tabla de la pirámide: cada puesto con su etiqueta (color al costado y texto para lectores). */
export function McTable({ title, s, gi, level, nameOf, flag }: { title: string; s: TourState; gi: number; level: McLevel; nameOf: (id: string) => string; flag: Flag }) {
    const rows = groupStandings(s, gi);
    return (
        <div className={styles.groupCard}>
            <h3 className={styles.groupTitle}>{title}</h3>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Club</th>
                        <th scope="col">PJ</th>
                        <th scope="col">G</th>
                        <th scope="col">P</th>
                        <th scope="col">Dif</th>
                        <th scope="col">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => {
                        const tag = tagFor(level, i, rows.length);
                        return (
                            <tr key={r.team} className={`${r.team === MC_ME ? styles.rowMine : ''} ${tag ? TAG_CLASS[tag] : ''}`}>
                                <td>
                                    {i + 1}
                                    {tag && <span className={styles.srOnly}> · {TAG_LABEL[tag]}</span>}
                                </td>
                                <td className={styles.tableTeam}>
                                    {flag(r.team)} {nameOf(r.team)}
                                </td>
                                <td>{r.pj}</td>
                                <td>{r.g}</td>
                                <td>{r.p}</td>
                                <td>{r.pf - r.pc > 0 ? `+${r.pf - r.pc}` : r.pf - r.pc}</td>
                                <td>
                                    <strong>{r.pts}</strong>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Las zonas (o la tabla única) de una división, con su leyenda. La propia va primero. */
export function McTables({ s, r, level, nameOf, flag, mineFirst }: { s: TourState; r: MiClubState; level: McLevel; nameOf: (id: string) => string; flag: Flag; mineFirst?: boolean }) {
    const order = s.groups.map((_, gi) => gi);
    if (mineFirst) order.sort((a, b) => Number(s.groups[b].includes(MC_ME)) - Number(s.groups[a].includes(MC_ME)));
    return (
        <>
            <McLegend level={level} />
            <div className={styles.groupGrid}>
                {order.map((gi) => (
                    <McTable
                        key={gi}
                        title={s.groups.length === 1 ? 'Tabla de posiciones' : zoneName(r, s.groups[gi], gi)}
                        s={s}
                        gi={gi}
                        level={level}
                        nameOf={nameOf}
                        flag={flag}
                    />
                ))}
            </div>
        </>
    );
}

/** La pirámide: cualquier división, en vivo, con lo que pasa en cada puesto. */
export function McPyramid({ s, nameOf, flag, bracket }: { s: TourState; nameOf: (id: string) => string; flag: Flag; bracket: (t: TourState) => ReactNode }) {
    const r = s.miclub!;
    const list = pyramidTours(s);
    const mine = levelOf(r, MC_ME) ?? 'base';
    const nac = nacionalView(s);
    const [pick, setPick] = useState<McLevel | 'nac'>(mine);
    const cur = pick === 'nac' ? null : list.find((x) => x.level.id === pick) ?? list[0];
    const news = seasonNews(r);
    const moves = movesByLevel(r);
    const mineMove = myMove(r);
    const names = (ids: string[]) => ids.map((id) => (id === MC_ME ? `${nameOf(id)} (vos)` : nameOf(id))).join(', ');
    return (
        <div className={styles.othersPanel}>
            {r.moves && moves.length > 0 && (
                <details className={styles.movesBox}>
                    <summary>
                        <strong>Ascensos y descensos {r.moves.season}</strong>
                        {mineMove ? ` · ${mineMove.up ? 'subiste' : 'bajaste'} a ${levelDef(mineMove.to).label}` : ` · ${moves.reduce((a, m) => a + m.up.length, 0)} clubes suben y otros tantos bajan`}
                    </summary>
                    {moves.map((m) => (
                        <p key={m.level.id} className={styles.movesLevel}>
                            <strong>{m.level.label}</strong>
                            {m.up.length > 0 && <span>▲ Suben: {names(m.up)}.</span>}
                            {m.down.length > 0 && <span>▼ Bajan: {names(m.down)}.</span>}
                        </p>
                    ))}
                </details>
            )}
            {news.length > 0 && (
                <div className={styles.roadPending}>
                    <strong>Tu temporada {r.season}</strong>
                    {news.map((n, i) => (
                        <span key={i}>{n}</span>
                    ))}
                </div>
            )}
            <div className={styles.pyramidPick} role="radiogroup" aria-label="División o copa">
                {list.map((x) => (
                    <button key={x.level.id} type="button" role="radio" aria-checked={pick === x.level.id} className={`${styles.pyramidStep} ${pick === x.level.id ? styles.pyramidStepOn : ''}`} onClick={() => setPick(x.level.id)}>
                        <strong>{x.level.label}</strong>
                        <small>{x.mine ? 'tu división' : `${r.divisions[x.level.id].length} clubes`}</small>
                    </button>
                ))}
                <button type="button" role="radio" aria-checked={pick === 'nac'} className={`${styles.pyramidStep} ${pick === 'nac' ? styles.pyramidStepOn : ''}`} onClick={() => setPick('nac')}>
                    <strong>{NAC_NAME}</strong>
                    <small>{nac ? `${nac.def?.teams.length ?? NAC_SIZE} clubes` : 'desde mitad de año'}</small>
                </button>
            </div>
            {cur ? (
                <>
                    {cur.liga && (
                        <section className={styles.mcSection} aria-label={`Liga de ${cur.level.label}`}>
                            <h3 className={styles.groupTitle}>Liga · {cur.level.label}</h3>
                            <p className={styles.note}>
                                {cur.level.upHow} {status(cur.liga, nameOf)}
                            </p>
                            {(cur.liga.stage === 'grupos' || cur.liga.done) && <McTables s={cur.liga} r={r} level={cur.level.id} nameOf={nameOf} flag={flag} mineFirst={cur.mine} />}
                            {cur.liga.hasKo && cur.liga.stage === 'ko' && bracket(cur.liga)}
                        </section>
                    )}
                    {cur.cup ? (
                        <CupBlock title={cupName(cur.level.id)} t={cur.cup} how="Todos los clubes de la división, a eliminación directa. Los más fuertes arrancan una ronda más adelante." nameOf={nameOf} flag={flag} bracket={bracket} />
                    ) : (
                        cur.level.id === 'primera' && <p className={styles.note}>Primera no juega copa de división: juega la {NAC_NAME}.</p>
                    )}
                </>
            ) : nac ? (
                <CupBlock title={NAC_NAME} t={nac} how={`${NAC_SIZE} clubes, armada a mitad de año. ${NAC_HOW}.`} nameOf={nameOf} flag={flag} bracket={bracket} />
            ) : (
                <p className={styles.note}>
                    La {NAC_NAME} se arma a mitad de año con la tabla de ese momento: {NAC_HOW}.
                </p>
            )}
        </div>
    );
}

/** Lo que va de un torneo, en una línea. */
function status(t: TourState, nameOf: (id: string) => string): string {
    return t.done ? `Terminado · campeón: ${nameOf(t.champion ?? finalRanking(t)[0] ?? '')}.` : `Va por: ${roundLabel(t).toLowerCase()}.`;
}

/** Una copa (mata-mata): cómo va, la última ronda jugada y el cuadro desde octavos. */
function CupBlock({ title, t, how, nameOf, flag, bracket }: { title: string; t: TourState; how: string; nameOf: (id: string) => string; flag: Flag; bracket: (t: TourState) => ReactNode }) {
    const last = t.koHistory.at(-1);
    const alive = t.done ? 0 : t.alive.filter((id) => id !== '__bye__').length;
    return (
        <section className={styles.mcSection} aria-label={title}>
            <h3 className={styles.groupTitle}>{title}</h3>
            <p className={styles.note}>
                {how} {status(t, nameOf)} {alive > 16 ? `Quedan ${alive}.` : ''}
            </p>
            {last && alive > 16 && (
                <div className={styles.results}>
                    <div className={styles.histRound}>
                        <h4 className={styles.groupTitle}>Última ronda · {last.label}</h4>
                        <ul className={styles.histList}>
                            {last.results.map((x) => (
                                <li key={`${x.a}-${x.b}`} className={x.a === MC_ME || x.b === MC_ME ? styles.rowMine : undefined}>
                                    <span>
                                        {flag(x.a)} {nameOf(x.a)}
                                    </span>
                                    <strong>
                                        {x.sa} - {x.sb}
                                    </strong>
                                    <span>
                                        {nameOf(x.b)} {flag(x.b)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            {bracket(t)}
        </section>
    );
}

/** El plantel: los siete que salen a la cancha y los suplentes. */
export function McSquad({ r }: { r: MiClubState }) {
    const xi = new Set(starters(r).map((p) => p.id));
    const list = [...r.squad].sort((a, b) => Number(xi.has(b.id)) - Number(xi.has(a.id)) || (b.ovr ?? 0) - (a.ovr ?? 0));
    return (
        <div className={styles.othersPanel}>
            <p className={styles.note}>
                Nivel del club: {myRating(r)}. Salen a la cancha los siete mejores. Créditos: {r.credits}.
            </p>
            {!!r.lastNotes?.length && (
                <div className={styles.roadPending}>
                    <strong>Cambios de la pretemporada {r.season}</strong>
                    {r.lastNotes.map((n, i) => (
                        <span key={i}>{n}</span>
                    ))}
                </div>
            )}
            {r.history.length > 0 && (
                <div className={styles.roadPending}>
                    <strong>Historia del club</strong>
                    {[...r.history].reverse().map((h) => (
                        <span key={h.season}>
                            {h.season} · {levelDef(h.level).label} · {h.place}
                        </span>
                    ))}
                </div>
            )}
            <div className={styles.groupCard}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">Jugador</th>
                            <th scope="col">Edad</th>
                            <th scope="col">Valoración</th>
                            {SKILL_LABEL.map((l) => (
                                <th key={l} scope="col">{l}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((p) => {
                            const n = r.names[p.id!];
                            return (
                                <tr key={p.id} className={xi.has(p.id) ? styles.rowMine : undefined}>
                                    <td className={styles.tableTeam}>
                                        {n ? `${n.first} ${n.last}`.trim() : '—'}
                                        {xi.has(p.id) && <span className={styles.srOnly}> · titular</span>}
                                    </td>
                                    <td>{p.age}</td>
                                    <td>
                                        <strong>{(p.ovr ?? 0).toFixed(1)}</strong>
                                    </td>
                                    {(p.s ?? [0, 0, 0, 0]).map((v, k) => (
                                        <td key={k}>{v}</td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
