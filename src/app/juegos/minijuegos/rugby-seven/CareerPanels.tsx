'use client';

/*
 * Las piezas de la carrera que no son el torneo: la pretemporada, el armado
 * del siete (arrastrando o tocando), el cartel de noticias, el club (juveniles,
 * divisiones, récords e historial) y el nombre del entrenador.
 */

import { useEffect, useRef, useState } from 'react';

import SpritePreview from './SpritePreview';
import { POSITIONS } from './names';
import type { Kit } from './sprites';
import type { SevenTeam } from './teams';
import type { TourState } from './tours';
import {
    clubRecords,
    franchiseOf,
    MAX_BAJAS,
    myRoster,
    playerLook,
    preseasonDone,
    preseasonPoint,
    preseasonTrain,
    resetLineup,
    setLineupSlot,
    SKILL_LABEL,
    TRAIN_ODDS,
    type CareerNews,
    type CareerState,
    type RosterRow,
} from './career';
import styles from './seven.module.css';

const OUT_LABEL: Record<string, string> = { inj: 'Lesionado', fra: 'En la franquicia', eur: 'En Europa', pum: 'Con los Pumas' };

const fullOf = (p: RosterRow) => `${p.name.first} ${p.name.last}`.trim();

/** La carita del jugador: la cabeza del muñeco pixel, con la camiseta del club. */
function Face({ club, id, kit, big }: { club: string; id: number; kit?: Kit; big?: boolean }) {
    if (!kit) return null;
    return (
        <span className={big ? `${styles.face} ${styles.faceBig}` : styles.face} aria-hidden="true">
            <SpritePreview look={playerLook(club, id)} kit={kit} scale={big ? 3 : 2} />
        </span>
    );
}

/** Estado de un jugador que no está, para mostrarlo. */
function outText(p: RosterRow): string | null {
    if (!p.out) return null;
    const who = p.out.by ? ` (${p.out.by})` : '';
    const until = p.out.until >= 2 ? 'toda la temporada' : p.out.until >= 1 ? 'hasta el final de la fase regular' : `hasta el ${Math.round(p.out.until * 100)}% de la temporada`;
    return `${OUT_LABEL[p.out.kind] ?? 'Afuera'}${who} · ${until}`;
}

function Moral({ m }: { m: number }) {
    if (Math.abs(m) < 0.25) return <span className={styles.moralFlat} title="Moral normal">=</span>;
    return (
        <span className={m > 0 ? styles.moralUp : styles.moralDown} title={`Moral ${m > 0 ? '+' : ''}${m.toFixed(1)}`}>
            {m > 0 ? '▲' : '▼'}
            {Math.abs(m) >= 1.25 ? (m > 0 ? '▲' : '▼') : ''}
        </span>
    );
}

function Skills({ s }: { s: [number, number, number, number] }) {
    return (
        <span className={styles.skillRow} aria-label={SKILL_LABEL.map((l, k) => `${l} ${s[k]}`).join(', ')}>
            {s.map((v, k) => (
                <span key={k} title={SKILL_LABEL[k]}>
                    {SKILL_LABEL[k][0]}
                    <b>{v}</b>
                </span>
            ))}
        </span>
    );
}

/* ───────────────────────── el siete inicial ───────────────────────── */

/**
 * Los siete de la cancha y el banco. Se arma arrastrando un jugador sobre otro
 * (o sobre un puesto), o tocando uno y después el otro: los dos se cambian.
 */
export function LineupBoard({ tour, kit, onChange }: { tour: TourState; kit?: Kit; onChange: (s: TourState) => void }) {
    const career = tour.career as CareerState;
    const roster = myRoster(career);
    const starters = Array.from({ length: 7 }, (_, slot) => roster.find((p) => p.slot === slot) ?? null);
    const bench = roster.filter((p) => p.slot === null).sort((a, b) => Number(!!a.out) - Number(!!b.out) || b.ovr - a.ovr);
    const [picked, setPicked] = useState<number | null>(null);
    const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
    const start = useRef<{ id: number; x: number; y: number; moved: boolean; canDrag: boolean } | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    /** Mueve `id` adonde se soltó: un puesto o un jugador. */
    const apply = (id: number, target: { slot?: number; pid?: number }) => {
        const from = roster.find((p) => p.id === id);
        if (!from) return;
        if (from.out) {
            setMsg(`${fullOf(from)} no está disponible: ${(OUT_LABEL[from.out.kind] ?? 'afuera').toLowerCase()}.`);
            return;
        }
        let slot = target.slot;
        if (slot === undefined && target.pid !== undefined) {
            const to = roster.find((p) => p.id === target.pid);
            if (!to || to.id === id) return;
            if (to.slot !== null) slot = to.slot;
            else if (from.slot !== null) {
                // Un titular sobre un suplente: entra el suplente en su lugar.
                if (to.out) {
                    setMsg(`${fullOf(to)} no está disponible.`);
                    return;
                }
                onChange(setLineupSlot(tour, from.slot, to.id));
                setMsg(`Entra ${fullOf(to)} por ${fullOf(from)}.`);
                return;
            } else return;
        }
        if (slot === undefined) return;
        const was = starters[slot];
        onChange(setLineupSlot(tour, slot, id));
        setMsg(was && was.id !== id ? `${fullOf(from)} a ${POSITIONS[slot].toLowerCase()}; ${fullOf(was)} ${from.slot !== null ? `a ${POSITIONS[from.slot].toLowerCase()}` : 'al banco'}.` : null);
    };

    const targetAt = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
        if (!el) return null;
        const [k, v] = (el.dataset.drop ?? '').split(':');
        return k === 'slot' ? { slot: Number(v) } : k === 'pid' ? { pid: Number(v) } : null;
    };

    // Los manejadores se rearman en cada render para leer el plantel de ahora.
    useEffect(() => {
        const move = (e: PointerEvent) => {
            const st = start.current;
            if (!st) return;
            if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) {
                // Con el dedo fuera del número es un scroll de la lista, no un arrastre.
                if (!st.canDrag) {
                    start.current = null;
                    return;
                }
                st.moved = true;
            }
            if (st.moved) setDrag({ id: st.id, x: e.clientX, y: e.clientY });
        };
        const up = (e: PointerEvent) => {
            const st = start.current;
            start.current = null;
            setDrag(null);
            if (!st || e.type === 'pointercancel') return;
            if (st.moved) {
                const t = targetAt(e.clientX, e.clientY);
                if (t) apply(st.id, t);
                setPicked(null);
                return;
            }
            // Un toque: el primero elige, el segundo cambia.
            if (picked === null || picked === st.id) {
                setPicked(picked === st.id ? null : st.id);
                return;
            }
            const to = roster.find((p) => p.id === st.id);
            if (to) apply(picked, to.slot !== null ? { slot: to.slot } : { pid: to.id });
            setPicked(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
    });

    const chip = (p: RosterRow, slot: number | null) => (
        <button
            type="button"
            key={p.id}
            data-drop={`pid:${p.id}`}
            className={`${styles.lineChip} ${picked === p.id ? styles.lineChipOn : ''} ${p.out ? styles.lineChipOut : ''} ${drag?.id === p.id ? styles.lineChipDragging : ''}`}
            aria-pressed={picked === p.id}
            aria-label={`${fullOf(p)}, valoración ${p.ovr.toFixed(1)}${slot !== null ? `, ${POSITIONS[slot]}` : ', suplente'}${p.out ? `, ${OUT_LABEL[p.out.kind]}` : ''}`}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                // Con mouse se arrastra desde cualquier lado; con el dedo, desde el número (el resto scrollea).
                const handle = !!(e.target as HTMLElement).closest('[data-handle]');
                start.current = { id: p.id, x: e.clientX, y: e.clientY, moved: false, canDrag: e.pointerType === 'mouse' || handle };
            }}
        >
            <b className={styles.lineOvr} data-handle="" title="Arrastrá desde acá">{p.ovr.toFixed(1)}</b>
            <span className={styles.lineName}>
                <Face club={career.me} id={p.id} kit={kit} />
                {p.name.short} <Moral m={p.m} />
            </span>
            {p.out ? <small className={styles.lineOut}>{OUT_LABEL[p.out.kind]}</small> : <Skills s={p.s} />}
        </button>
    );

    const dragged = drag ? roster.find((p) => p.id === drag.id) : null;
    const bajas = career.bajas ?? 0;
    return (
        <div className={styles.lineBoard}>
            <p className={styles.note}>
                Arrastrá un jugador sobre otro para cambiarlos (en el celular, desde el número), o tocá uno y después el otro. El apertura patea, los de afuera corren, los de adelante tacklean y empujan el scrum con su peso, y los altos ganan el line. Bajas de la temporada: {bajas} de {MAX_BAJAS}.
            </p>
            <div className={styles.lineField} aria-label="Siete inicial">
                {starters.map((p, slot) => (
                    <div key={slot} className={styles.lineSlot} data-drop={`slot:${slot}`}>
                        <span className={styles.linePos}>
                            {slot + 1} · {POSITIONS[slot]}
                        </span>
                        {p ? chip(p, slot) : <span className={styles.lineEmpty}>Vacío</span>}
                    </div>
                ))}
            </div>
            <div className={styles.lineBench} aria-label="Suplentes">
                <span className={styles.linePos}>Banco</span>
                <div className={styles.lineBenchList}>{bench.map((p) => chip(p, null))}</div>
            </div>
            <div className={styles.lineActions}>
                <button type="button" className={styles.simBtn} onClick={() => onChange(resetLineup(tour))}>
                    Que lo arme el cuerpo técnico
                </button>
                {msg && <small className={styles.lineMsg}>{msg}</small>}
            </div>
            {dragged && drag && (
                <div className={styles.lineGhost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
                    <b>{dragged.ovr.toFixed(1)}</b> {dragged.name.short}
                </div>
            )}
        </div>
    );
}

/** El plantel entero, con nombres editables y las skills de cada uno. */
export function RosterTable({ tour, kit, onRename }: { tour: TourState; kit?: Kit; onRename: (id: number, text: string) => void }) {
    const career = tour.career as CareerState;
    const roster = [...myRoster(career)].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9) || b.ovr - a.ovr);
    return (
        <ul className={styles.rosterList}>
            {roster.map((p) => (
                <li key={`${p.id}-${p.name.first}-${p.name.last}`} className={p.out ? styles.rosterOut : undefined}>
                    <span className={styles.rosterPos}>
                        <Face club={career.me} id={p.id} kit={kit} big />
                        {p.slot !== null ? `${p.slot + 1} · ${POSITIONS[p.slot]}` : 'Suplente'}
                    </span>
                    <input
                        className={styles.rosterName}
                        defaultValue={fullOf(p)}
                        aria-label={`Nombre de ${fullOf(p)}`}
                        maxLength={40}
                        onBlur={(e) => {
                            const v = e.currentTarget.value;
                            if (v.trim() !== fullOf(p)) onRename(p.id, v);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                    />
                    <span className={styles.rosterAge}>
                        {p.age} años · {p.b[0]} kg · {(p.b[1] / 100).toFixed(2).replace('.', ',')} m · <Skills s={p.s} /> <Moral m={p.m} />
                        {outText(p) && <small className={styles.lineOut}> · {outText(p)}</small>}
                    </span>
                    <span className={p.ovr >= 7 ? styles.fixWin : p.ovr < 4 ? styles.fixLoss : undefined}>{p.ovr.toFixed(1)}</span>
                </li>
            ))}
        </ul>
    );
}

/* ───────────────────────── pretemporada ───────────────────────── */

export function PreseasonPanel({
    tour,
    rivals,
    nameOf,
    onChange,
    onFriendly,
}: {
    tour: TourState;
    rivals: { id: string; name: string }[];
    nameOf: (id: string) => string;
    onChange: (s: TourState) => void;
    onFriendly: (opp: string, sim: boolean) => void;
}) {
    const career = tour.career as CareerState;
    const pre = career.pre;
    const roster = myRoster(career);
    const [pick, setPick] = useState<number[]>([]);
    const [rival, setRival] = useState<string>(rivals[0]?.id ?? '');
    if (!pre) return null;
    const name = (id: number) => {
        const p = roster.find((x) => x.id === id);
        return p ? fullOf(p) : '—';
    };
    const okPlayers = roster.filter((p) => !p.out).sort((a, b) => b.ovr - a.ovr);
    const need = Math.min(3, okPlayers.length);

    return (
        <div className={styles.prePanel}>
            <span className={styles.nextLabel}>Pretemporada {career.season}</span>
            {pre.step === 'punto' && (
                <div className={styles.preStep}>
                    <strong>¿Dónde ponés el punto de este año?</strong>
                    <button type="button" className={styles.nacOpt} onClick={() => onChange(preseasonPoint(tour, 'juveniles'))}>
                        <strong>Juveniles</strong>
                        <small>Las camadas suben medio punto y la cantera mejora para siempre. La primera no recibe nada este año.</small>
                    </button>
                    <button type="button" className={styles.nacOpt} onClick={() => onChange(preseasonPoint(tour, 'primera'))}>
                        <strong>Primera</strong>
                        <small>El plantel arranca descansado y con un punto más de moral. Los juveniles no reciben nada.</small>
                    </button>
                </div>
            )}
            {pre.step === 'entreno' && (
                <div className={styles.preStep}>
                    <strong>Elegí {need} para entrenar</strong>
                    <small className={styles.preOdds}>
                        Cada uno: {TRAIN_ODDS.up}% sube un punto · {TRAIN_ODDS.same}% queda igual · {TRAIN_ODDS.inj}% se lesiona y se pierde media temporada.
                    </small>
                    <ul className={styles.preList}>
                        {okPlayers.map((p) => {
                            const on = pick.includes(p.id);
                            return (
                                <li key={p.id}>
                                    <label className={on ? styles.prePicked : undefined}>
                                        <input
                                            type="checkbox"
                                            aria-label={`Entrenar a ${fullOf(p)}`}
                                            checked={on}
                                            disabled={!on && pick.length >= need}
                                            onChange={() => setPick((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                                        />
                                        <b>{p.ovr.toFixed(1)}</b> {fullOf(p)} <small>{p.age} años</small> <Skills s={p.s} />
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                    <button type="button" className={styles.btnPrimary} disabled={pick.length < need} onClick={() => onChange(preseasonTrain(tour, pick))}>
                        Entrenar ▶
                    </button>
                    {pick.length < need && <small className={styles.missing}>Elegí {need - pick.length} más para entrenar.</small>}
                </div>
            )}
            {pre.step === 'amistosos' && (
                <div className={styles.preStep}>
                    {pre.trained?.length ? (
                        <ul className={styles.preResults}>
                            {pre.trained.map((t) => (
                                <li key={t.id} className={t.result === 'up' ? styles.fixWin : t.result === 'inj' ? styles.fixLoss : undefined}>
                                    {name(t.id)}: {t.result === 'up' ? 'subió un punto' : t.result === 'inj' ? 'se lesionó' : 'quedó igual'}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {pre.friendlies?.map((f, i) => (
                        <small key={i} className={f.us > f.them ? styles.fixWin : styles.fixLoss}>
                            Amistoso contra {nameOf(f.opp)}: {f.us}-{f.them}. {f.us > f.them ? 'La moral del plantel, arriba.' : 'La moral bajó.'}
                        </small>
                    ))}
                    <strong>{pre.friendlies?.length ? '¿Otro amistoso?' : '¿Querés jugar amistosos?'}</strong>
                    <small className={styles.preOdds}>Si ganás, la moral de todo el plantel sube al máximo. Si perdés, baja un punto y podés tener un lesionado. Se define sí o sí: si empatan, minuto extra.</small>
                    <label className={styles.othersPick}>
                        <span>Rival</span>
                        <select value={rival} onChange={(e) => setRival(e.target.value)}>
                            {rivals.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className={styles.simRow}>
                        <button type="button" className={styles.btnPrimary} disabled={!rival} onClick={() => onFriendly(rival, false)}>
                            Jugar el amistoso ▶
                        </button>
                        <button type="button" className={styles.simBtn} disabled={!rival} onClick={() => onFriendly(rival, true)}>
                            Simularlo
                        </button>
                    </div>
                    <button type="button" className={styles.textBtn} onClick={() => onChange(preseasonDone(tour))}>
                        {pre.friendlies?.length ? 'Listo, arrancar la temporada ▶' : 'Sin amistosos: arrancar la temporada ▶'}
                    </button>
                </div>
            )}
        </div>
    );
}

/* ───────────────────────── noticias ───────────────────────── */

const NEWS_TAG: Record<string, string> = { club: 'Novedades', fra: 'Super Rugby Américas', eur: 'Mercado', pum: 'Seleccionado', inj: 'Parte médico', back: 'Vuelta', youth: 'Juveniles', train: 'Pretemporada' };

/** El cartel animado de una noticia del club, con el jugador. */
export function NewsPopup({ news, team, more = 0, onClose, onSkipAll }: { news: CareerNews; team: SevenTeam; more?: number; onClose: () => void; onSkipAll?: () => void }) {
    const look = news.who !== undefined ? playerLook(team.id, news.who) : team.players[0];
    return (
        <div className={styles.newsPop} role="dialog" aria-modal="true" aria-labelledby="news-title">
            <div className={styles.newsCard}>
                <span className={styles.newsTag}>
                    {NEWS_TAG[news.kind] ?? 'Noticia'} · {news.season}
                </span>
                <div className={styles.newsSprite}>
                    <SpritePreview look={look} kit={team.kit} scale={5} celebrating={news.kind === 'fra' || news.kind === 'pum' || news.kind === 'back'} />
                </div>
                <h2 id="news-title" className={styles.newsTitle}>
                    {news.title}
                </h2>
                <p className={styles.newsText}>{news.text}</p>
                <button type="button" className={styles.btnPrimary} onClick={onClose} autoFocus>
                    {more > 0 ? `Siguiente (${more} más) ▶` : 'Cerrar'}
                </button>
                {more > 0 && onSkipAll && (
                    <button type="button" className={styles.textBtn} onClick={onSkipAll}>
                        Cerrar todas
                    </button>
                )}
            </div>
        </div>
    );
}

/* ───────────────────────── el club ───────────────────────── */

export function ClubPanel({ career, nameOf }: { career: CareerState; nameOf: (id: string) => string }) {
    const reports = [...(career.reports ?? [])].reverse();
    const records = clubRecords(career);
    const rivals = Object.entries(career.h2h ?? {})
        .map(([id, h]) => ({ id, h, n: h[0] + h[1] + h[2] }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 10);
    return (
        <div className={styles.rosterPanel}>
            <h3 className={styles.groupTitle}>Historia del club</h3>
            {records.length === 0 ? (
                <p className={styles.empty}>Todavía no hay números: se van sumando partido a partido.</p>
            ) : (
                <ul className={styles.clubRecords}>
                    {records.map((x) => (
                        <li key={x.label}>
                            <small>{x.label}</small>
                            <strong>{x.name}</strong>
                            <span>{x.n}</span>
                        </li>
                    ))}
                </ul>
            )}
            <h3 className={styles.groupTitle}>Juveniles y divisiones</h3>
            <p className={styles.note}>
                Las camadas siguen de una categoría a la otra: si la M16 es buena, la M17 del año que viene también tiende a estar arriba. Los campeones de cada región en M16, M17 y M19 juegan el nacional. La M19 es la que sube a la primera.
            </p>
            {reports.length === 0 && <p className={styles.empty}>El primer reporte llega al cerrar la temporada {career.season}.</p>}
            {reports.slice(0, 4).map((rep) => (
                <div key={rep.season} className={styles.groupCard}>
                    <h4 className={styles.scorerTitle}>Temporada {rep.season}</h4>
                    <ul className={styles.youthList}>
                        {rep.rows.map((row) => (
                            <li key={row.cat} className={row.place === 1 ? styles.fixWin : undefined}>
                                <span>{row.cat}</span>
                                <b>
                                    {row.place}.º de {row.of}
                                </b>
                                {row.nac && <small>Nacional: {row.nac.toLowerCase()}</small>}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
            <h3 className={styles.groupTitle}>Contra cada rival</h3>
            {rivals.length === 0 ? (
                <p className={styles.empty}>Todavía no jugaste partidos en esta carrera.</p>
            ) : (
                <ul className={styles.youthList}>
                    {rivals.map(({ id, h }) => (
                        <li key={id}>
                            <span>{nameOf(id)}</span>
                            <b>
                                {h[0]}-{h[1]}-{h[2]}
                            </b>
                            <small>
                                {h[3]}-{h[4]} · última: {h[6]}-{h[7]} ({h[5]})
                            </small>
                        </li>
                    ))}
                </ul>
            )}
            <p className={styles.note}>
                Si un jugador joven y muy bueno se destaca, {franchiseOf(career.me)} lo puede llamar para la primera mitad de la temporada; a los mejores los pueden convocar los Pumas o llevárselos un club de Europa.
            </p>
        </div>
    );
}

/* ───────────────────────── entrenador ───────────────────────── */

const COACH_KEY = 'g22-rugby-seven-coach';

/** El nombre del entrenador guardado en este navegador ('' si todavía no lo puso; null si no hay acceso). */
export function readCoach(): string | null {
    try {
        return localStorage.getItem(COACH_KEY) ?? '';
    } catch {
        return null;
    }
}

export function saveCoach(name: string) {
    try {
        localStorage.setItem(COACH_KEY, name);
    } catch {
        // Sin localStorage: vale para esta visita.
    }
}

/** La primera vez que se abre el juego: el nombre del entrenador. */
export function CoachPrompt({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
    const [v, setV] = useState(initial);
    const clean = v.replace(/\s+/g, ' ').trim().slice(0, 40);
    return (
        <div className={styles.newsPop} role="dialog" aria-modal="true" aria-labelledby="coach-title">
            <form
                className={styles.newsCard}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (clean) onDone(clean);
                }}
            >
                <span className={styles.newsTag}>Rugby Argento</span>
                <h2 id="coach-title" className={styles.newsTitle}>
                    ¿Cómo se llama el entrenador?
                </h2>
                <p className={styles.newsText}>Va en el palmarés de cada título y en la carrera. Lo podés cambiar después.</p>
                <label className={styles.coachField}>
                    <span>Entrenador</span>
                    <input value={v} onChange={(e) => setV(e.target.value)} maxLength={40} placeholder="Tu nombre" autoFocus />
                </label>
                <button type="submit" className={styles.btnPrimary} disabled={!clean}>
                    Empezar ▶
                </button>
                {!clean && <small className={styles.missing}>Escribí un nombre para empezar.</small>}
            </form>
        </div>
    );
}
