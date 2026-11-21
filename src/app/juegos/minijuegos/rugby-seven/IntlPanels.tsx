'use client';

/*
 * Pantallas de la carrera internacional: ranking de World Rugby en vivo, la
 * unión (fondos e inversiones), el plantel con sus juveniles y elegibles, y la
 * temporada con el calendario y los otros torneos.
 */

import { useState, type ReactNode } from 'react';
import {
    AREA_HINT,
    AREA_LABEL,
    AREAS,
    income,
    intlCalendar,
    intlLadder,
    intlOthers,
    levelName,
    liveRanking,
    maxLevel,
    myLevel,
    upgradeCost,
    upgradeYears,
    upkeepOf,
    xv,
    type Area,
    type IntlState,
} from './intl';
import styles from './seven.module.css';

type Flag = (id: string) => ReactNode;

/** Ranking de World Rugby, en vivo: lo jugado hasta la etapa de la selección. */
export function IntlRanking({ r, nameOf, flag }: { r: IntlState; nameOf: (id: string) => string; flag: Flag }) {
    const [all, setAll] = useState(false);
    const rows = liveRanking(r);
    const mine = rows.find((x) => x.id === r.me);
    const shown = all ? rows : rows.filter((x) => x.pos <= 20 || Math.abs(x.pos - (mine?.pos ?? 0)) <= 3);
    return (
        <div className={styles.groupCard}>
            <h3 className={styles.groupTitle}>Ranking World Rugby · en vivo</h3>
            <p className={styles.note}>Se mueve con cada partido: el que gana le saca puntos al que pierde, más si el rival estaba más arriba. Ganar por más de 15 vale una vez y media; en el Mundial, el doble.</p>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Selección</th>
                        <th scope="col">Puntos</th>
                        <th scope="col">Antes</th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((x) => (
                        <tr key={x.id} className={x.id === r.me ? styles.rowMine : undefined}>
                            <td>{x.pos}</td>
                            <td className={styles.tableTeam}>
                                {flag(x.id)} {nameOf(x.id)}
                            </td>
                            <td>{x.pts.toFixed(2)}</td>
                            <td>{x.prev === null ? '—' : x.prev > x.pos ? `▲ ${x.prev}` : x.prev < x.pos ? `▼ ${x.prev}` : '='}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button type="button" className={styles.simBtn} onClick={() => setAll((v) => !v)}>
                {all ? 'Ver menos' : `Ver las ${rows.length}`}
            </button>
        </div>
    );
}

/** La unión: fondos, mantenimiento y lo que se puede mejorar (con sus plazos). */
export function IntlUnion({ r, onInvest }: { r: IntlState; onInvest: (a: Area) => void }) {
    const u = r.union;
    return (
        <div className={styles.rosterPanel}>
            <h3 className={styles.groupTitle}>La unión</h3>
            <ul className={styles.clubRecords}>
                <li>
                    <small>Fondos de desarrollo</small>
                    <strong>{u.fondos.toFixed(1)}</strong>
                    <span>disponibles</span>
                </li>
                <li>
                    <small>Ingreso estimado del año</small>
                    <strong>+{income(r)}</strong>
                    <span>World Rugby, ranking y Mundial</span>
                </li>
                <li>
                    <small>Mantenimiento</small>
                    <strong>−{upkeepOf(r)}</strong>
                    <span>por año</span>
                </li>
                <li>
                    <small>Nivel de la selección</small>
                    <strong>{myLevel(r)}</strong>
                    <span>los 15 mejores disponibles</span>
                </li>
            </ul>
            <p className={styles.note}>Los fondos llegan al cerrar el año: World Rugby reparte según el escalón en el que compite tu selección, el ranking y el Mundial. Lo que construyas hay que sostenerlo: si un año no alcanza, algo se cae.</p>
            {AREAS.map((a) => {
                const pend = u.pend.filter((p) => p.area === a);
                const lvl = u[a] + pend.length;
                const top = lvl >= maxLevel(a);
                const cost = top ? 0 : upgradeCost(a, lvl);
                const years = upgradeYears(a);
                const can = !top && u.fondos >= cost;
                return (
                    <div key={a} className={styles.nacAsk}>
                        <span className={styles.nacAskQ}>
                            {AREA_LABEL[a]}: {levelName(a, u[a])}
                        </span>
                        <small className={styles.nacAskNote}>{AREA_HINT[a]}</small>
                        {pend.map((p, i) => (
                            <small key={i} className={styles.nacAskNote}>
                                En obra: {levelName(a, u[a] + i + 1).toLowerCase()}, lista para la temporada {p.ready}.
                            </small>
                        ))}
                        {top ? (
                            <small className={styles.nacAskNote}>Ya está en lo más alto.</small>
                        ) : (
                            <button type="button" className={styles.btnPrimary} disabled={!can} onClick={() => onInvest(a)}>
                                Subir a {levelName(a, lvl + 1).toLowerCase()} · {cost} fondos{years ? ` · ${years === 1 ? '1 temporada' : `${years} temporadas`}` : ''}
                            </button>
                        )}
                        {!top && !can && <small className={styles.nacAskNote}>Faltan {(cost - u.fondos).toFixed(1)} fondos.</small>}
                    </div>
                );
            })}
        </div>
    );
}

const ORIGIN: Record<string, string> = { local: 'Local', herencia: 'Herencia', residencia: 'Residencia' };

/** El plantel: los 15 que juegan, el resto, los juveniles de la academia y los elegibles que se pueden convocar. */
export function IntlSquad({ r, onSign }: { r: IntlState; onSign: (id: number) => void }) {
    const titulares = new Set(xv(r).map((p) => p.id));
    const squad = [...r.squad].sort((a, b) => Number(titulares.has(b.id)) - Number(titulares.has(a.id)) || b.ovr - a.ovr);
    const youth = [...r.youth].sort((a, b) => b.pot - a.pot);
    return (
        <div className={styles.rosterPanel}>
            <h3 className={styles.groupTitle}>Plantel · {r.squad.length} jugadores</h3>
            <p className={styles.note}>Juegan los 15 mejores disponibles. Crecen hasta los 27-28, se sostienen hasta los 30 y después bajan; se retiran entre los 33 y los 36.</p>
            <ul className={styles.rosterList}>
                {squad.map((p) => {
                    const waiting = !!p.from && p.from > r.season;
                    return (
                        <li key={p.id} className={waiting ? styles.rosterOut : undefined}>
                            <span className={styles.rosterPos}>{titulares.has(p.id) ? 'XV' : waiting ? 'Espera' : 'Plantel'}</span>
                            <span className={styles.rosterName}>
                                {p.first} {p.last}
                            </span>
                            <span className={styles.rosterAge}>
                                {p.pos === 'fw' ? 'Forward' : 'Back'} · {p.age} años · {p.caps} caps · {ORIGIN[p.origin]}
                                {waiting ? ` · elegible en ${p.from}` : ''} · techo {p.pot.toFixed(1)}
                            </span>
                            <span className={p.ovr >= 7 ? styles.fixWin : p.ovr < 4 ? styles.fixLoss : undefined}>{p.ovr.toFixed(1)}</span>
                        </li>
                    );
                })}
            </ul>
            <h3 className={styles.groupTitle}>Academia · {youth.length} juveniles</h3>
            <p className={styles.note}>Entran a los 17 y llegan a la selección a los 20. Cuántos llegan, y con cuánto techo, depende de la academia y de la liga local.</p>
            {youth.length === 0 ? (
                <p className={styles.empty}>Sin juveniles en la academia todavía.</p>
            ) : (
                <ul className={styles.rosterList}>
                    {youth.map((p) => (
                        <li key={p.id}>
                            <span className={styles.rosterPos}>{p.age} años</span>
                            <span className={styles.rosterName}>
                                {p.first} {p.last}
                            </span>
                            <span className={styles.rosterAge}>
                                {p.pos === 'fw' ? 'Forward' : 'Back'} · llega en {r.season + (20 - p.age)} · techo {p.pot.toFixed(1)}
                            </span>
                            <span>{p.ovr.toFixed(1)}</span>
                        </li>
                    ))}
                </ul>
            )}
            <h3 className={styles.groupTitle}>Elegibles</h3>
            {r.offers.length === 0 ? (
                <p className={styles.empty}>{r.union.red === 0 ? 'Sin red de elegibles no llegan ofertas: armala desde la unión.' : 'No hay ofertas este año. Llegan nuevas al cerrar la temporada.'}</p>
            ) : (
                r.offers.map((o) => (
                    <div key={o.id} className={styles.nacAsk}>
                        <span className={styles.nacAskQ}>
                            {o.first} {o.last} · {o.pos === 'fw' ? 'Forward' : 'Back'} · {o.age} años · nivel {o.ovr.toFixed(1)} · techo {o.pot.toFixed(1)}
                        </span>
                        <small className={styles.nacAskNote}>
                            {o.kind === 'herencia' ? 'Por herencia' : 'Por residencia'}. {o.note}
                        </small>
                        <button type="button" className={styles.btnPrimary} disabled={r.union.fondos < o.cost} onClick={() => onSign(o.id)}>
                            Convocarlo · {o.cost} fondos
                        </button>
                    </div>
                ))
            )}
        </div>
    );
}

/** El año: el calendario propio, los campeones de los otros torneos, las divisiones y la historia. */
export function IntlSeason({ r, done, nameOf, flag }: { r: IntlState; done: boolean; nameOf: (id: string) => string; flag: Flag }) {
    const cal = intlCalendar(r, done);
    const others = intlOthers(r, done);
    const ladder = intlLadder(r);
    return (
        <div className={styles.roadPanel}>
            {r.lastNotes && r.lastNotes.length > 0 && (
                <div className={styles.roadPending}>
                    <strong>Cierre del {r.season - 1}</strong>
                    {r.lastNotes.map((n, i) => (
                        <span key={i}>{n}</span>
                    ))}
                </div>
            )}
            <h3 className={styles.groupTitle}>Calendario {r.season}</h3>
            <ul className={styles.roadSlots}>
                {cal.map((c) => (
                    <li key={c.key} className={c.state === 'live' ? styles.rowMine : undefined}>
                        <span>
                            {c.state === 'done' ? '✓' : c.state === 'live' ? '▶' : '·'} {c.name}
                        </span>
                        <small>
                            {c.month}
                            {c.place ? ` · ${c.place}.º` : ''}
                        </small>
                    </li>
                ))}
            </ul>
            {others.length > 0 && (
                <>
                    <h3 className={styles.groupTitle}>Los otros torneos del año</h3>
                    <ul className={styles.roadSlots}>
                        {others.map((o) => (
                            <li key={o.name}>
                                <span>{o.name}</span>
                                <small>
                                    {flag(o.champion)} {nameOf(o.champion)}
                                </small>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {ladder.map((d) => (
                <div key={d.key}>
                    <h3 className={styles.groupTitle}>{d.name}</h3>
                    <ul className={styles.roadSlots}>
                        {d.teams.map((id) => (
                            <li key={id} className={id === r.me ? styles.rowMine : undefined}>
                                <span>
                                    {flag(id)} {nameOf(id)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
            {r.titles.length > 0 && (
                <>
                    <h3 className={styles.groupTitle}>Títulos</h3>
                    <ul className={styles.roadLog}>
                        {r.titles.map((t, i) => (
                            <li key={i}>
                                {t.season} · {t.label}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {r.history.length > 0 && (
                <>
                    <h3 className={styles.groupTitle}>Temporadas</h3>
                    <ul className={styles.roadLog}>
                        {[...r.history].reverse().map((h) => (
                            <li key={h.season}>
                                {h.season} · {h.text}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {r.log.length > 0 && (
                <>
                    <h3 className={styles.groupTitle}>Lo que pasó en el mundo</h3>
                    <ul className={styles.roadLog}>
                        {[...r.log]
                            .reverse()
                            .slice(0, 40)
                            .map((l, i) => (
                                <li key={i}>{l}</li>
                            ))}
                    </ul>
                </>
            )}
        </div>
    );
}
