'use client';

/*
 * Pantallas de Mi Club: la pirámide (todas las divisiones, con la etiqueta de cada puesto),
 * la tabla propia con esas mismas etiquetas y el plantel.
 */

import { useState, type ReactNode } from 'react';
import { SKILL_LABEL, type Player } from './career';
import { browseScopes, cupSpot, type McBrowseItem, type McBrowseScope, facCost, FAC_MAX, FACILITIES, levelDef, levelOf, MC_ME, nextLicense, upgradeBlock, type McFacility, PAY, PAY_BY_LEVEL, PRIZE, releaseBlock, signBlock, SQUAD_MAX, trainBlock, trainCostFor, trainStepFor, divisionCap, seasonGain, SEASON_GROWTH_MAX, movesByLevel, myMove, myRating, LIB_NAME, nacNameOf, seasonNews, starters, tagFor as levelTag, TAG_LABEL, kindOf, WCC_NAME, zoneName, type McLevel, type McTag, type MiClubState } from './miClub';
import { groupStandings, roundLabel, finalRanking, type TourState } from './tours';
import styles from './seven.module.css';

type Flag = (id: string) => ReactNode;

const TAG_CLASS: Record<Exclude<McTag, null>, string> = {
    playoff: styles.tagPlayoff,
    ascenso: styles.tagUp,
    reducido: styles.tagRed,
    descenso: styles.tagDown,
};

/** Las etiquetas que aparecen en una división, para la leyenda. */
function tagsOf(level: McLevel): Exclude<McTag, null>[] {
    const l = levelDef(level);
    const out: Exclude<McTag, null>[] = [];
    if (l.red) out.push('ascenso', 'reducido');
    else if (l.advance) out.push('playoff');
    else if (l.up) out.push('ascenso');
    if (l.down) out.push('descenso');
    return out;
}

/** Los créditos del club, con su moneda: siempre a la vista donde se gastan. */
export function McCredits({ n, gain }: { n: number; gain?: string }) {
    return (
        <span className={styles.coinPill} aria-label={`${n} créditos`}>
            <span className={styles.coin} aria-hidden="true" />
            <strong>{n}</strong>
            <small>créditos{gain ? ` · ${gain}` : ''}</small>
        </span>
    );
}

export function McLegend({ level, cups }: { level: McLevel; cups?: boolean }) {
    return (
        <ul className={styles.tagLegend} aria-label="Qué significa cada color">
            {tagsOf(level).map((t) => (
                <li key={t}>
                    <span className={`${styles.tagDot} ${TAG_CLASS[t]}`} aria-hidden="true" /> {TAG_LABEL[t]}
                </li>
            ))}
            {cups && (
                <li>
                    <span className={styles.cupNum} aria-hidden="true">
                        1
                    </span>{' '}
                    Clasifica a copa
                </li>
            )}
        </ul>
    );
}

/** Una tabla de la pirámide: cada puesto con su etiqueta (color al costado y texto para lectores) y la copa a la que da (en amarillo). */
export function McTable({ title, s, gi, level, nameOf, flag, advanceOnly, cupOf }: { title: string; s: TourState; gi: number; level: McLevel; nameOf: (id: string) => string; flag: Flag; advanceOnly?: number; cupOf?: (place: number) => string | null }) {
    const rows = groupStandings(s, gi);
    // En una copa de grupos (la del Mundo) solo importa quién pasa: los primeros `advanceOnly`.
    const tagFor = (lvl: McLevel, i: number, n: number): McTag => (advanceOnly !== undefined ? (i < advanceOnly ? 'playoff' : null) : levelTag(lvl, i, n));
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
                        const cup = cupOf?.(i) ?? null;
                        return (
                            <tr key={r.team} className={`${r.team === MC_ME ? styles.rowMine : ''} ${tag ? TAG_CLASS[tag] : ''}`}>
                                <td>
                                    {cup ? (
                                        <span className={styles.cupNum} title={`Clasifica a: ${cup}`}>
                                            {i + 1}
                                        </span>
                                    ) : (
                                        i + 1
                                    )}
                                    {tag && <span className={styles.srOnly}> · {TAG_LABEL[tag]}</span>}
                                    {cup && <span className={styles.srOnly}> · clasifica a {cup}</span>}
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

/** Los grupos de la Copa del Mundo: pasan los 2 primeros de cada uno a octavos. */
export function WccTables({ s, nameOf, flag }: { s: TourState; nameOf: (id: string) => string; flag: Flag }) {
    const order = s.groups.map((_, gi) => gi).sort((a, b) => Number(s.groups[b].includes(MC_ME)) - Number(s.groups[a].includes(MC_ME)));
    return (
        <>
            <ul className={styles.tagLegend} aria-label="Qué significa cada color">
                <li>
                    <span className={`${styles.tagDot} ${TAG_CLASS.playoff}`} aria-hidden="true" /> Pasa a octavos
                </li>
            </ul>
            <div className={styles.groupGrid}>
                {order.map((gi) => (
                    <McTable key={gi} title={`Grupo ${gi + 1}`} s={s} gi={gi} level="primera" nameOf={nameOf} flag={flag} advanceOnly={2} />
                ))}
            </div>
        </>
    );
}

/** Las tablas del torneo propio en pantalla: la Copa del Mundo por grupos, el resto como división. */
export function McTourTables({ s, r, nameOf, flag }: { s: TourState; r: MiClubState; nameOf: (id: string) => string; flag: Flag }) {
    if (kindOf(s) === 'wcc') return <WccTables s={s} nameOf={nameOf} flag={flag} />;
    return <McTables s={s} r={r} level={levelOf(r, MC_ME) ?? 'base'} nameOf={nameOf} flag={flag} mineFirst />;
}

/** Las zonas (o la tabla única) de una división, con su leyenda. La propia va primero. */
export function McTables({ s, r, level, nameOf, flag, mineFirst, ext }: { s: TourState; r: MiClubState; level: McLevel; nameOf: (id: string) => string; flag: Flag; mineFirst?: boolean; ext?: boolean }) {
    const order = s.groups.map((_, gi) => gi);
    if (mineFirst) order.sort((a, b) => Number(s.groups[b].includes(MC_ME)) - Number(s.groups[a].includes(MC_ME)));
    const cupOf = (place: number) => cupSpot(r, level, place, ext);
    const anyCup = [0, 1, 2, 3].some((i) => cupOf(i));
    return (
        <>
            <McLegend level={level} cups={anyCup} />
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
                        cupOf={cupOf}
                    />
                ))}
            </div>
        </>
    );
}

/** La pirámide: cualquier división, en vivo, con lo que pasa en cada puesto. */
export function McPyramid({ s, nameOf, flag, bracket }: { s: TourState; nameOf: (id: string) => string; flag: Flag; bracket: (t: TourState) => ReactNode }) {
    const r = s.miclub!;
    const scopes = browseScopes(s);
    const [scopeId, setScopeId] = useState<McBrowseScope['id']>('mine');
    const [kind, setKind] = useState<'ligas' | 'copas'>('ligas');
    const [key, setKey] = useState<string | null>(null);
    const scope = scopes.find((x) => x.id === scopeId) ?? scopes[0];
    const items = scope[kind];
    const item = items.find((i) => i.key === key) ?? items.find((i) => i.mine) ?? items[0];
    const at = items.indexOf(item);
    const news = seasonNews(r);
    const moves = movesByLevel(r);
    const mineMove = myMove(r);
    const names = (ids: string[]) => ids.map((id) => (id === MC_ME ? `${nameOf(id)} (vos)` : nameOf(id))).join(', ');
    const go = (d: number) => setKey(items[(at + d + items.length) % items.length].key);
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
            <div className={styles.browsePick}>
                <label className={styles.browseField}>
                    <span>Dónde</span>
                    <select
                        value={scope.id}
                        onChange={(e) => {
                            setScopeId(e.target.value as McBrowseScope['id']);
                            setKey(null);
                        }}
                    >
                        {scopes.map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.browseField}>
                    <span>Qué</span>
                    <select
                        value={kind}
                        onChange={(e) => {
                            setKind(e.target.value as 'ligas' | 'copas');
                            setKey(null);
                        }}
                    >
                        <option value="ligas">Ligas ({scope.ligas.length})</option>
                        <option value="copas">Copas ({scope.copas.length})</option>
                    </select>
                </label>
                <div className={`${styles.browseField} ${styles.browseWhich}`}>
                    <label htmlFor="mc-browse-which">Cuál</label>
                    <div className={styles.browseRow}>
                        <button type="button" className={styles.browseArrow} onClick={() => go(-1)} aria-label="Torneo anterior" disabled={items.length < 2}>
                            ◀
                        </button>
                        <select id="mc-browse-which" value={item?.key ?? ''} onChange={(e) => setKey(e.target.value)}>
                            {items.map((i) => (
                                <option key={i.key} value={i.key}>
                                    {i.label}
                                    {i.t ? '' : ' · todavía no'}
                                    {i.mine && !i.label.includes('tu división') ? ' · jugás vos' : ''}
                                </option>
                            ))}
                        </select>
                        <button type="button" className={styles.browseArrow} onClick={() => go(1)} aria-label="Torneo siguiente" disabled={items.length < 2}>
                            ▶
                        </button>
                    </div>
                </div>
            </div>
            {item && <BrowseView item={item} r={r} nameOf={nameOf} flag={flag} bracket={bracket} />}
        </div>
    );
}

/** Un torneo del explorador: la tabla (todas las zonas o grupos) y, si tiene, el cuadro. */
function BrowseView({ item, r, nameOf, flag, bracket }: { item: McBrowseItem; r: MiClubState; nameOf: (id: string) => string; flag: Flag; bracket: (t: TourState) => ReactNode }) {
    const t = item.t;
    const title = item.label.replace(' · tu división', '');
    if (!t) {
        return (
            <section className={styles.mcSection} aria-label={title}>
                <h3 className={styles.groupTitle}>{title}</h3>
                <p className={styles.note}>
                    Se arma {item.when ?? 'más adelante'}. {item.how}
                </p>
            </section>
        );
    }
    const onlyKo = t.def?.stage.kind === 'ko';
    if (onlyKo) return <CupBlock title={title} t={t} how={item.how} nameOf={nameOf} flag={flag} bracket={bracket} />;
    const showKo = t.hasKo && (t.stage === 'ko' || t.koHistory.length > 0);
    return (
        <section className={styles.mcSection} aria-label={title}>
            <h3 className={styles.groupTitle}>{title}</h3>
            <p className={styles.note}>
                {item.how} {status(t, nameOf)}
            </p>
            {item.key === 'wcc' ? (
                <WccTables s={t} nameOf={nameOf} flag={flag} />
            ) : item.level ? (
                <McTables s={t} r={r} level={item.level} nameOf={nameOf} flag={flag} mineFirst={item.mine} ext={item.ext} />
            ) : (
                <>
                    {t.hasKo && (
                        <ul className={styles.tagLegend} aria-label="Qué significa cada color">
                            <li>
                                <span className={`${styles.tagDot} ${TAG_CLASS.playoff}`} aria-hidden="true" /> Pasa a semifinales
                            </li>
                        </ul>
                    )}
                    <div className={styles.groupGrid}>
                        {t.groups.map((_, gi) => (
                            <McTable key={gi} title={t.groups.length === 1 ? 'Tabla de posiciones' : `Grupo ${gi + 1}`} s={t} gi={gi} level="primera" nameOf={nameOf} flag={flag} advanceOnly={t.hasKo ? 4 : 0} />
                        ))}
                    </div>
                </>
            )}
            {showKo && (
                <>
                    <h4 className={styles.groupTitle}>Cuadro</h4>
                    {bracket(t)}
                </>
            )}
        </section>
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
    const cap = divisionCap(r);
    const f2 = (v: number) => v.toFixed(2).replace('.', ',');
    // Tu jugador, primero.
    list.sort((a, b) => Number(b.id === r.marquee?.id) - Number(a.id === r.marquee?.id));
    return (
        <div className={styles.othersPanel}>
            <McCredits n={r.credits} />
            <p className={styles.note}>
                Nivel del club: {myRating(r)}. Entrenar sube {f2(trainStepFor(r))} (más con mejor entrenamiento y cuanto mejor va el equipo) y cada vez cuesta más. En el año, cada jugador mejora como mucho {SEASON_GROWTH_MAX.toFixed(1).replace('.', ',')} entre entrenamiento y rendimiento, y no pasa el techo de la división: {cap.toFixed(1).replace('.', ',')}.
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
                    const cost = trainCostFor(r, p);
                    const isMarquee = r.marquee?.id === p.id;
                    const rb = releaseBlock(r, p.id);
                    const gain = seasonGain(r, p.id!);
                    const note = [isMarquee ? '⭐ tu jugador' : null, xi.has(p.id) ? 'titular' : 'suplente', gain > 0 ? `+${gain.toFixed(1).replace('.', ',')} este año` : null].filter(Boolean).join(' · ');
                    return (
                        <PlayerCard key={p.id} name={name} p={p} note={note} mine={xi.has(p.id)}>
                            <button type="button" className={styles.btnGhost} disabled={!!tb} aria-label={tb ? `Entrenar a ${name}: ${tb}` : `Entrenar a ${name} por ${cost} créditos`} onClick={() => onTrain(p.id!)}>
                                Entrenar · {cost}
                            </button>
                            {!isMarquee && (
                                <button type="button" className={styles.btnGhost} disabled={!!rb} aria-label={rb ? `Liberar a ${name}: ${rb}` : `Liberar a ${name}`} onClick={() => onRelease(p.id!)}>
                                    Liberar
                                </button>
                            )}
                            {tb && <small className={styles.mcWhy}>{tb}</small>}
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
            <McCredits n={r.credits} />
            <p className={styles.note}>
                {r.squad.length} de {SQUAD_MAX} lugares en el plantel. El mercado se renueva al empezar la temporada y a mitad de año. Los créditos se ganan jugando: no se compran.
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

/** Las instalaciones: una barrita de 5 por cada una, lo que da y lo que cuesta subirla. */
function Facilities({ r, onUpgrade }: { r: MiClubState; onUpgrade: (f: McFacility) => void }) {
    const lic = nextLicense(r);
    return (
        <section className={styles.mcSection} aria-label="Instalaciones">
            <h3 className={styles.groupTitle}>Instalaciones</h3>
            {lic && lic.need > 1 && (
                <p className={`${styles.note} ${lic.ok ? '' : styles.mcWarn}`}>
                    {lic.ok
                        ? `Licencia al día: ${levelDef(lic.level).label} pide la cancha en nivel ${lic.need} y la tuya está en ${r.facilities.cancha}.`
                        : `Para jugar ${levelDef(lic.level).label} hace falta la cancha en nivel ${lic.need} (la tuya está en ${r.facilities.cancha}). Si ganás el ascenso sin ella, sube otro en tu lugar.`}
                </p>
            )}
            <ul className={styles.mcCards} aria-label="Instalaciones del club">
                {FACILITIES.map((f) => {
                    const lvl = r.facilities?.[f.id] ?? 1;
                    const cost = facCost(r, f.id);
                    const block = upgradeBlock(r, f.id);
                    return (
                        <li key={f.id} className={styles.mcCard}>
                            <div className={styles.mcCardHead}>
                                <strong>{f.label}</strong>
                                <span className={styles.mcOvr}>
                                    {lvl}/{FAC_MAX}
                                </span>
                            </div>
                            <div className={styles.facBar} role="meter" aria-valuemin={1} aria-valuemax={FAC_MAX} aria-valuenow={lvl} aria-label={`${f.label}: nivel ${lvl} de ${FAC_MAX}`}>
                                {Array.from({ length: FAC_MAX }, (_, i) => (
                                    <span key={i} className={i < lvl ? styles.facOn : undefined} />
                                ))}
                            </div>
                            <small className={styles.mcFrom}>{f.effect(lvl)}</small>
                            {cost !== null && <small className={styles.mcFrom}>Nivel {lvl + 1}: {f.effect(lvl + 1).charAt(0).toLowerCase() + f.effect(lvl + 1).slice(1)}</small>}
                            <div className={styles.mcCardActions}>
                                <button type="button" className={styles.btnPrimary} disabled={!!block} aria-label={block ? `Mejorar ${f.label}: ${block}` : `Mejorar ${f.label} a nivel ${lvl + 1} por ${cost} créditos`} onClick={() => onUpgrade(f.id)}>
                                    {cost === null ? 'Al máximo' : `Mejorar · ${cost}`}
                                </button>
                                {block && cost !== null && <small className={styles.mcWhy}>{block}</small>}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** El club: créditos, instalaciones, sponsors de la temporada, cómo se gana, títulos e historia. */
export function McClubPanel({ r, onUpgrade }: { r: MiClubState; onUpgrade: (f: McFacility) => void }) {
    const sponsors = r.sponsors ?? [];
    const sponsorPay = sponsors.reduce((a, x) => a + x.pay, 0);
    const level = levelOf(r, MC_ME) ?? 'base';
    return (
        <div className={styles.othersPanel}>
            <McCredits n={r.credits} />
            <Facilities r={r} onUpgrade={onUpgrade} />
            <div className={styles.roadPending}>
                <strong>{r.credits} créditos</strong>
                {r.lastGain && <span>Último partido: {r.lastGain}</span>}
                <span>
                    Por partido en {levelDef(level).label}: {PAY_BY_LEVEL[level]} por jugar, {PAY.win} más si ganás ({PAY.draw} si empatás), {PAY.try} por try y {PAY.cupRound} por pasar de ronda en la copa ({PAY.nacRound} en la {nacNameOf(r)}, {PAY.libRound} en la {LIB_NAME} y {PAY.wccRound} en la {WCC_NAME}).
                </span>
                <span>
                    Al cierre: {PRIZE.ascenso} por ascender, {PRIZE.liga} por salir campeón de la liga, {PRIZE.copa} por la copa de la división, {PRIZE.nac} por la {nacNameOf(r)}, {PRIZE.lib} por la {LIB_NAME} y {PRIZE.wcc} por la {WCC_NAME}.
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

/** El Histórico: cada temporada cerrada con sus campeones, quién subió y bajó, y cómo le fue al club. */
export function McArchive({ r, nameOf, flag }: { r: MiClubState; nameOf: (id: string) => string; flag: Flag }) {
    // Las temporadas que ya cerraron, de la más nueva a la más vieja (las de antes del Histórico, solo con lo propio).
    const seasons = [...new Set([...r.history.map((h) => h.season), ...(r.archive ?? []).map((a) => a.season)])].sort((a, b) => b - a);
    const [pick, setPick] = useState<number | null>(null);
    if (!seasons.length) {
        return (
            <div className={styles.othersPanel}>
                <p className={styles.note}>Todavía no cerró ninguna temporada. Cuando termine la primera, queda acá: campeones, ascensos, descensos y tu año.</p>
            </div>
        );
    }
    const season = pick !== null && seasons.includes(pick) ? pick : seasons[0];
    const at = seasons.indexOf(season);
    const arc = (r.archive ?? []).find((a) => a.season === season);
    const hist = r.history.find((h) => h.season === season);
    const who = (id: string) => (
        <span className={`${styles.arcClub} ${id === MC_ME ? styles.arcMine : ''}`}>
            {flag(id)} {nameOf(id)}
        </span>
    );
    const list = (ids: string[]) =>
        ids.length
            ? ids.map((id, i) => (
                  <span key={id}>
                      {i > 0 && ', '}
                      {who(id)}
                  </span>
              ))
            : '—';
    const mine = arc?.mine;
    const [w, d, l] = mine?.record ?? [0, 0, 0];
    const moveText = mine?.move === 'up' ? '▲ Ascendió' : mine?.move === 'down' ? '▼ Descendió' : mine ? '= Se mantuvo' : null;
    return (
        <div className={styles.othersPanel}>
            <div className={`${styles.browseField} ${styles.arcPick}`}>
                <label htmlFor="arc-season">Temporada</label>
                <div className={styles.browseRow}>
                    <button type="button" className={styles.browseArrow} onClick={() => setPick(seasons[at + 1])} aria-label="Temporada anterior" disabled={at >= seasons.length - 1}>
                        ◀
                    </button>
                    <select id="arc-season" value={season} onChange={(e) => setPick(Number(e.target.value))}>
                        {seasons.map((x) => (
                            <option key={x} value={x}>
                                Temporada {x}
                            </option>
                        ))}
                    </select>
                    <button type="button" className={styles.browseArrow} onClick={() => setPick(seasons[at - 1])} aria-label="Temporada siguiente" disabled={at <= 0}>
                        ▶
                    </button>
                </div>
            </div>

            <section className={`${styles.arcCard} ${styles.arcMineCard}`} aria-label="Tu temporada">
                <h3 className={styles.arcTitle}>
                    {r.team.name} · {mine?.label ?? (hist ? levelDef(hist.level).label : '')}
                </h3>
                <p className={styles.arcPlace}>{mine?.place ?? hist?.place ?? '—'}</p>
                {mine && (
                    <div className={styles.arcFacts}>
                        <span>
                            {w} G · {d} E · {l} P
                        </span>
                        {moveText && <span className={mine.move === 'up' ? styles.arcUp : mine.move === 'down' ? styles.arcDown : undefined}>{moveText}</span>}
                    </div>
                )}
                {mine && mine.titles.length > 0 && <p className={styles.arcTitles}>🏆 {mine.titles.join(' · ')}</p>}
            </section>

            {arc ? (
                <>
                    {arc.divisions.map((dv) => (
                        <section key={dv.level} className={styles.arcCard} aria-label={dv.label}>
                            <h3 className={styles.arcTitle}>{dv.label}</h3>
                            <dl className={styles.arcList}>
                                <dt>Campeón</dt>
                                <dd>{dv.champion ? who(dv.champion) : '—'}</dd>
                                {dv.red && (
                                    <>
                                        <dt>Reducido</dt>
                                        <dd>{who(dv.red)}</dd>
                                    </>
                                )}
                                {dv.cup && (
                                    <>
                                        <dt>Copa</dt>
                                        <dd>{who(dv.cup)}</dd>
                                    </>
                                )}
                                {dv.up.length > 0 && (
                                    <>
                                        <dt className={styles.arcUp}>▲ Suben</dt>
                                        <dd>{list(dv.up)}</dd>
                                    </>
                                )}
                                {dv.down.length > 0 && (
                                    <>
                                        <dt className={styles.arcDown}>▼ Bajan</dt>
                                        <dd>{list(dv.down)}</dd>
                                    </>
                                )}
                            </dl>
                        </section>
                    ))}
                    {arc.cups.length > 0 && (
                        <section className={styles.arcCard} aria-label="Copas">
                            <h3 className={styles.arcTitle}>Copas</h3>
                            <dl className={styles.arcList}>
                                {arc.cups.map((c) => (
                                    <div key={c.name} className={styles.arcPair}>
                                        <dt>{c.name}</dt>
                                        <dd>{who(c.champion)}</dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    )}
                </>
            ) : (
                <section className={styles.arcCard} aria-label="Campeones">
                    <h3 className={styles.arcTitle}>Campeones</h3>
                    <ul className={styles.roadLog}>
                        {r.log
                            .filter((x) => x.startsWith(`${season}:`))
                            .map((x, i) => (
                                <li key={i}>{x.slice(String(season).length + 2)}</li>
                            ))}
                    </ul>
                    <p className={styles.note}>Esta temporada se jugó antes del Histórico: quedaron los campeones, no los ascensos y descensos.</p>
                </section>
            )}
        </div>
    );
}
