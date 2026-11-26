'use client';

/*
 * Pantallas de Mi Club: la pirámide (todas las divisiones, con la etiqueta de cada puesto),
 * la tabla propia con esas mismas etiquetas y el plantel.
 */

import { useState, type ReactNode } from 'react';
import { SKILL_LABEL } from './career';
import { levelDef, levelOf, MC_ME, movesByLevel, myMove, myRating, pyramidTours, starters, tagFor, TAG_LABEL, zoneName, type McLevel, type McTag, type MiClubState } from './miClub';
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
    const [pick, setPick] = useState<McLevel>(mine);
    const cur = list.find((x) => x.level.id === pick) ?? list[0];
    const t = cur.state;
    const showTables = t.stage === 'grupos' || t.done;
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
            <div className={styles.pyramidPick} role="radiogroup" aria-label="División">
                {list.map((x) => (
                    <button key={x.level.id} type="button" role="radio" aria-checked={x.level.id === cur.level.id} className={`${styles.pyramidStep} ${x.level.id === cur.level.id ? styles.pyramidStepOn : ''}`} onClick={() => setPick(x.level.id)}>
                        <strong>{x.level.label}</strong>
                        <small>{x.mine ? 'tu división' : `${r.divisions[x.level.id].length} clubes`}</small>
                    </button>
                ))}
            </div>
            <p className={styles.note}>
                {cur.level.upHow}{' '}
                {t.done ? `Terminado · campeón: ${nameOf(t.champion ?? finalRanking(t)[0] ?? '')}.` : `Va por: ${roundLabel(t).toLowerCase()}.`}
            </p>
            {showTables && <McTables s={t} r={r} level={cur.level.id} nameOf={nameOf} flag={flag} mineFirst={cur.mine} />}
            {t.hasKo && t.stage === 'ko' && bracket(t)}
        </div>
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
