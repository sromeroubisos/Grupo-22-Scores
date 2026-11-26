'use client';

/*
 * Pantallas de Mi Club: la pirámide (todas las divisiones, con la etiqueta de cada puesto),
 * la tabla propia con esas mismas etiquetas y el plantel.
 */

import { useState, type ReactNode } from 'react';
import { SKILL_LABEL, type Player } from './career';
import { cupName, levelDef, levelOf, MC_ME, PAY, PAY_BY_LEVEL, PRIZE, releaseBlock, signBlock, SQUAD_MAX, trainBlock, trainCost, movesByLevel, myMove, myRating, NAC_HOW, NAC_NAME, NAC_SIZE, nacionalView, pyramidTours, seasonNews, starters, tagFor, TAG_LABEL, zoneName, type McLevel, type McTag, type MiClubState } from './miClub';
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
        <div className={`${styles.groupCard} ${styles.mcTableCard}`}>
            <h3 className={styles.groupTitle}>{title}</h3>
            <table className={`${styles.table} ${styles.mcTable}`}>
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Club</th>
                        <th scope="col">PJ</th>
                        <th scope="col" className={styles.mcHideNarrow}>G</th>
                        <th scope="col" className={styles.mcHideNarrow}>P</th>
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
                                    {flag(r.team)} <span className={styles.mcTeamName}>{nameOf(r.team)}</span>
                                </td>
                                <td>{r.pj}</td>
                                <td className={styles.mcHideNarrow}>{r.g}</td>
                                <td className={styles.mcHideNarrow}>{r.p}</td>
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

/**
 * Un jugador como tarjeta: nombre, edad y valoración, sus cuatro habilidades y las acciones abajo.
 * Tarjetas y no tabla: en el celular una tabla de nueve columnas deja el botón fuera de la pantalla.
 */
function PlayerCard({ name, p, note, mine, children }: { name: string; p: Player; note?: string; mine?: boolean; children: ReactNode }) {
    const s = p.s ?? [0, 0, 0, 0];
    return (
        <li className={`${styles.mcCard} ${mine ? styles.mcCardMine : ''}`}>
            <div className={styles.mcCardHead}>
                <strong>{name}</strong>
                <span className={styles.mcOvr} aria-label={`Valoración ${(p.ovr ?? 0).toFixed(1)}`}>
                    {(p.ovr ?? 0).toFixed(1)}
                </span>
            </div>
            <small className={styles.mcFrom}>
                {p.age} años{note ? ` · ${note}` : ''}
            </small>
            <ul className={styles.mcSkills} aria-label="Habilidades">
                {SKILL_LABEL.map((l, k) => (
                    <li key={l}>
                        <span>{l}</span> <b>{s[k]}</b>
                    </li>
                ))}
            </ul>
            <div className={styles.mcCardActions}>{children}</div>
        </li>
    );
}

/** El plantel: los siete que salen a la cancha y los suplentes; mejorar o liberar a cada uno. */
export function McSquad({ r, onTrain, onRelease }: { r: MiClubState; onTrain: (id: number) => void; onRelease: (id: number) => void }) {
    const xi = new Set(starters(r).map((p) => p.id));
    const list = [...r.squad].sort((a, b) => Number(xi.has(b.id)) - Number(xi.has(a.id)) || (b.ovr ?? 0) - (a.ovr ?? 0));
    const relBlock = releaseBlock(r);
    return (
        <div className={styles.othersPanel}>
            <p className={styles.note}>
                Nivel del club: {myRating(r)}. Salen a la cancha los siete mejores. Tenés {r.credits} créditos. Mejorar a un jugador sube 0,3 su valoración, una vez por temporada.
            </p>
            {!!r.lastNotes?.length && (
                <div className={styles.roadPending}>
                    <strong>Cierre de la temporada anterior</strong>
                    {r.lastNotes.map((n, i) => (
                        <span key={i}>{n}</span>
                    ))}
                </div>
            )}
            <ul className={styles.mcCards} aria-label="Plantel">
                {list.map((p) => {
                    const n = r.names[p.id!];
                    const name = n ? `${n.first} ${n.last}`.trim() : '—';
                    const tb = trainBlock(r, p);
                    return (
                        <PlayerCard key={p.id} name={name} p={p} note={xi.has(p.id) ? 'titular' : 'suplente'} mine={xi.has(p.id)}>
                            <button type="button" className={styles.btnGhost} disabled={!!tb} aria-label={tb ? `Mejorar a ${name}: ${tb}` : `Mejorar a ${name} por ${trainCost(p)} créditos`} onClick={() => onTrain(p.id!)}>
                                Mejorar · {trainCost(p)}
                            </button>
                            <button type="button" className={styles.btnGhost} disabled={!!relBlock} aria-label={relBlock ? `Liberar a ${name}: ${relBlock}` : `Liberar a ${name}`} onClick={() => onRelease(p.id!)}>
                                Liberar
                            </button>
                            {tb && tb !== 'Ya está en su techo.' && <small className={styles.mcWhy}>{tb}</small>}
                        </PlayerCard>
                    );
                })}
            </ul>
            {relBlock && <p className={styles.note}>{relBlock}</p>}
        </div>
    );
}

/** El mercado: los jugadores para fichar, con su precio y qué falta si todavía no se puede. */
export function McMarket({ r, nameOf, onSign }: { r: MiClubState; nameOf: (id: string) => string; onSign: (id: number) => void }) {
    const offers = r.offers ?? [];
    const worstXi = Math.min(...starters(r).map((p) => p.ovr ?? 1));
    return (
        <div className={styles.othersPanel}>
            <p className={styles.note}>
                Tenés {r.credits} créditos y {r.squad.length} de {SQUAD_MAX} lugares en el plantel. El mercado se renueva al empezar la temporada y a mitad de año. Los créditos se ganan jugando: no se compran.
            </p>
            {offers.length === 0 ? (
                <p className={styles.empty}>No quedan jugadores en el mercado. Vuelve a abrirse a mitad de año.</p>
            ) : (
                <ul className={styles.mcCards} aria-label="Jugadores para fichar">
                    {offers.map((o) => {
                        const block = signBlock(r, o);
                        const name = `${o.name.first} ${o.name.last}`.trim();
                        const note = [o.from ? `de ${nameOf(o.from)}` : null, (o.player.ovr ?? 0) > worstXi ? 'mejora a los titulares' : null].filter(Boolean).join(' · ');
                        return (
                            <PlayerCard key={o.id} name={name} p={o.player} note={note || undefined}>
                                <button type="button" className={styles.btnPrimary} disabled={!!block} aria-label={block ? `Fichar a ${name}: ${block}` : `Fichar a ${name} por ${o.price} créditos`} onClick={() => onSign(o.id)}>
                                    Fichar · {o.price}
                                </button>
                                {block && <small className={styles.mcWhy}>{block}</small>}
                            </PlayerCard>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/** El club: créditos, sponsors de la temporada, cómo se gana, títulos e historia. */
export function McClubPanel({ r }: { r: MiClubState }) {
    const sponsors = r.sponsors ?? [];
    const sponsorPay = sponsors.reduce((a, x) => a + x.pay, 0);
    const level = levelOf(r, MC_ME) ?? 'base';
    return (
        <div className={styles.othersPanel}>
            <div className={styles.roadPending}>
                <strong>{r.credits} créditos</strong>
                {r.lastGain && <span>Último partido: {r.lastGain}</span>}
                <span>
                    Por partido en {levelDef(level).label}: {PAY_BY_LEVEL[level]} por jugar, {PAY.win} más si ganás ({PAY.draw} si empatás), {PAY.try} por try y {PAY.cupRound} por pasar de ronda en la copa ({PAY.nacRound} en la {NAC_NAME}).
                </span>
                <span>
                    Al cierre: {PRIZE.ascenso} por ascender, {PRIZE.liga} por salir campeón de la liga, {PRIZE.copa} por la copa de la división y {PRIZE.nac} por la {NAC_NAME}.
                </span>
            </div>
            <div className={styles.roadPending}>
                <strong>Sponsors {r.season}</strong>
                {sponsors.length === 0 ? <span>Todavía ninguno.</span> : sponsors.map((sp) => <span key={sp.name}>{sp.name} · {sp.pay} por partido</span>)}
                <span>Suman {sponsorPay} por partido. Llegan más y mejores al subir de división y después de un buen año.</span>
            </div>
            {r.titles.length > 0 && (
                <div className={styles.roadPending}>
                    <strong>Vitrina</strong>
                    {r.titles.map((t, i) => (
                        <span key={i}>
                            {t.season} · {t.label}
                        </span>
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
        </div>
    );
}
