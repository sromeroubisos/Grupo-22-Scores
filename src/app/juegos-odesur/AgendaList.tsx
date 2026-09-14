'use client';

import Link from 'next/link';
import { Fragment, useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { odesurOrgName } from '@/lib/services/odesur2026Parser';
import OdesurFlag from './OdesurFlag';
import { ErrorState, MedalDot, SkeletonRows } from './OdesurBits';
import { formatTime, keepUnits, plural, useOdesurApi } from './odesurClient';
import type { OdesurAgendaItemView, OdesurEntrantView, OdesurPodiumEntryView, OdesurRankingRowView } from './types';
import type { OdesurFollows } from './useOdesurFollows';
import styles from './page.module.css';

/**
 * Las filas de la agenda: una unidad por fila (un partido, una serie, una
 * final), en orden de hora.
 *
 * Lo que la hace práctica:
 *   - Cada fila dice QUIÉN compite: el cruce con su marcador, o las banderas
 *     de las delegaciones de una serie.
 *   - Una ronda larga (los 106 asaltos de esgrima de un día) va en UNA fila
 *     que se despliega, no en 106 que tapan el resto del día.
 *   - Una prueba individual se abre en el lugar con su clasificación.
 *   - Lo que se sigue lleva ★ y sus banderas van primero.
 */

type Item = OdesurAgendaItemView;

/** Desde cuántas unidades de la misma instancia se agrupan en una fila. */
const SESSION_MIN_UNITS = 4;
/** Un hueco más largo que esto parte la instancia en dos turnos (mañana y tarde). */
const SESSION_GAP_MS = 90 * 60 * 1000;
/** Cuántas filas de una clasificación se ven antes de "Ver todos". */
const RANKING_PREVIEW = 8;

type UnitBlock = { kind: 'unit'; key: string; start: string | null; item: Item };
type SessionBlock = { kind: 'session'; key: string; start: string | null; end: string | null; items: Item[] };
type Block = UnitBlock | SessionBlock;

function startMs(item: Item): number {
    return item.startsAtIso ? Date.parse(item.startsAtIso) : Number.NaN;
}

export function buildBlocks(items: Item[]): Block[] {
    const buckets = new Map<string, Item[]>();
    for (const item of items) {
        const bucket = `${item.discipline}|${item.eventName}|${item.phaseName}`;
        const list = buckets.get(bucket) ?? [];
        list.push(item);
        buckets.set(bucket, list);
    }

    const blocks: Block[] = [];
    const seen = new Map<string, number>();
    const uniqueKey = (base: string) => {
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}#${count}`;
    };

    for (const [bucket, list] of buckets) {
        const sorted = [...list].sort((a, b) => (a.startsAtIso ?? '').localeCompare(b.startsAtIso ?? ''));
        let run: Item[] = [];
        const flush = () => {
            // Un partido con ficha propia nunca se esconde adentro de un grupo.
            if (run.length >= SESSION_MIN_UNITS && !run.some((item) => item.matchId)) {
                blocks.push({
                    kind: 'session',
                    key: uniqueKey(`s|${bucket}|${run[0].startsAtIso}`),
                    start: run[0].startsAtIso,
                    end: run[run.length - 1].startsAtIso,
                    items: run,
                });
            } else {
                for (const item of run) {
                    blocks.push({
                        kind: 'unit',
                        key: uniqueKey(`u|${item.key}|${item.startsAtIso}|${item.home?.org ?? ''}|${item.away?.org ?? ''}`),
                        start: item.startsAtIso,
                        item,
                    });
                }
            }
            run = [];
        };
        for (const item of sorted) {
            const previous = run[run.length - 1];
            if (previous && startMs(item) - startMs(previous) > SESSION_GAP_MS) flush();
            run.push(item);
        }
        flush();
    }

    const sportOf = (block: Block) => (block.kind === 'unit' ? block.item.disciplineName : block.items[0].disciplineName);
    return blocks.sort((a, b) => (
        (a.start ?? '').localeCompare(b.start ?? '')
        || sportOf(a).localeCompare(sportOf(b), 'es')
        || a.key.localeCompare(b.key)
    ));
}

function sessionNoun(items: Item[]): [string, string] {
    const first = items[0].unitName.toLowerCase();
    if (first.startsWith('combate')) return ['combate', 'combates'];
    if (first.startsWith('partido')) return ['partido', 'partidos'];
    if (first.startsWith('serie')) return ['serie', 'series'];
    if (first.startsWith('ronda')) return ['ronda', 'rondas'];
    return ['turno', 'turnos'];
}

function sessionState(items: Item[]): string {
    if (items.some((item) => item.state === 'live')) return 'live';
    if (items.every((item) => item.state === 'final')) return 'final';
    return 'scheduled';
}

/** El separador de un rótulo, pegado a lo anterior: un renglón nunca empieza con "·". */
const DOT = ' · ';

function phaseLine(item: Item): string {
    // "Series · Serie 2" dice dos veces lo mismo: con la unidad alcanza.
    const stem = item.phaseName.toLowerCase().replace(/s$/, '');
    if (item.unitName && stem && item.unitName.toLowerCase().startsWith(stem)) return item.unitName;
    return [item.phaseName, item.unitName].filter(Boolean).join(DOT);
}

/**
 * El estado, solo cuando dice algo que la fila no dice sola: en vivo, o
 * postergado/cancelado. Una prueba terminada con clasificación dice
 * "Resultados" (es lo que abre el despliegue); un cruce terminado ya lo dice
 * su marcador.
 */
function StateTag({ state, results }: { state: string; results?: boolean }) {
    if (state === 'live') {
        return (
            <span className={`${styles.tag} ${styles.tagLive}`}>
                <span className={styles.liveDot} aria-hidden="true" />
                En vivo
            </span>
        );
    }
    if (state === 'final') return results ? <span className={`${styles.tag} ${styles.tagMuted} ${styles.tagResults}`}>Resultados</span> : null;
    if (state === 'postponed') return <span className={`${styles.tag} ${styles.tagWarn}`}>Postergado</span>;
    if (state === 'cancelled') return <span className={`${styles.tag} ${styles.tagWarn}`}>Cancelado</span>;
    return null;
}

function MedalTag() {
    return (
        <span className={styles.medalTag}>
            <MedalDot metal="gold" />
            <span className={styles.medalTagText}>Medallas</span>
        </span>
    );
}

/** Las banderas de una serie, con lo que se sigue primero. */
function FlagRow({ orgs, follows, max = 7 }: { orgs: string[]; follows: OdesurFollows; max?: number }) {
    if (orgs.length === 0) return null;
    const ordered = [...orgs].sort((a, b) => Number(follows.orgs.has(b)) - Number(follows.orgs.has(a)));
    const shown = ordered.slice(0, max);
    const rest = ordered.length - shown.length;
    return (
        <span className={styles.flagRow}>
            <span className={styles.srOnly}>Compiten: {ordered.map((code) => odesurOrgName(code)).join(', ')}.</span>
            {shown.map((code) => (
                <span
                    key={code}
                    className={`${styles.flagSlot} ${follows.orgs.has(code) ? styles.flagSlotOn : ''}`}
                    aria-hidden="true"
                    title={odesurOrgName(code)}
                >
                    <OdesurFlag code={code} size={22} />
                </span>
            ))}
            {rest > 0 ? <span className={styles.flagMore} aria-hidden="true">+{rest}</span> : null}
        </span>
    );
}

function DuelSide({ entrant, follows, showScore }: { entrant: OdesurEntrantView; follows: OdesurFollows; showScore: boolean }) {
    const country = odesurOrgName(entrant.org);
    const isCountry = entrant.name === country;
    return (
        <span className={`${styles.duelSide} ${entrant.winner ? styles.duelWinner : ''}`}>
            <OdesurFlag code={entrant.org} name={isCountry ? entrant.name : undefined} size={22} />
            <span className={styles.duelName}>
                {entrant.name}
                {!isCountry && entrant.org ? <span className={styles.srOnly}> ({country})</span> : null}
                {entrant.org && follows.orgs.has(entrant.org) ? (
                    <Star size={11} className={styles.duelStar} fill="currentColor" aria-label="Lo seguís" />
                ) : null}
            </span>
            <span className={styles.duelScore}>{showScore ? entrant.result : ''}</span>
        </span>
    );
}

const PENDING_SIDE: OdesurEntrantView = { org: null, name: 'Por definir', result: '', winner: false };

function Duel({ item, follows }: { item: Item; follows: OdesurFollows }) {
    // La fuente manda "0" en los cruces que todavía no empezaron: un 0 a 0
    // antes de jugar no es un resultado.
    const showScore = item.state === 'live' || item.state === 'final';
    return (
        <span className={styles.duel}>
            <DuelSide entrant={item.home ?? PENDING_SIDE} follows={follows} showScore={showScore} />
            <DuelSide entrant={item.away ?? PENDING_SIDE} follows={follows} showScore={showScore} />
        </span>
    );
}

const METAL_WORDS = { gold: 'oro', silver: 'plata', bronze: 'bronce' } as const;

function Ranking({ item, follows, id }: { item: Item; follows: OdesurFollows; id: string }) {
    const [showAll, setShowAll] = useState(false);
    const { data, loading, error, reload } = useOdesurApi<{ rows: OdesurRankingRowView[] }>(
        `view=result&disc=${item.discipline}&code=${encodeURIComponent(item.resCode)}`,
    );

    if (error) {
        return <div id={id} className={styles.ranking}><ErrorState message={error} onRetry={reload} /></div>;
    }
    if (loading || !data) {
        return <div id={id} className={styles.ranking}><SkeletonRows count={3} label="Cargando la clasificación..." /></div>;
    }

    const rows = data.rows;
    if (rows.length === 0) {
        return (
            <div id={id} className={styles.ranking}>
                <p className={styles.rankingNote}>La organización todavía no publicó quiénes compiten.</p>
            </div>
        );
    }

    const ranked = rows.some((row) => row.rank !== null);
    const visible = showAll ? rows : rows.slice(0, RANKING_PREVIEW);
    const podium = item.medal && item.state === 'final';

    return (
        <div id={id} className={styles.ranking}>
            <p className={styles.rankingTitle}>{ranked ? 'Clasificación' : 'Quiénes compiten'}</p>
            <ol className={styles.rankingList}>
                {visible.map((row, index) => {
                    const metal = podium && row.rank && row.rank <= 3
                        ? (['gold', 'silver', 'bronze'] as const)[row.rank - 1]
                        : null;
                    const country = odesurOrgName(row.org);
                    return (
                        <li
                            key={`${row.org}-${row.name}-${index}`}
                            className={`${styles.rankingRow} ${row.org && follows.orgs.has(row.org) ? styles.rankingRowOn : ''}`}
                        >
                            <span className={styles.rankingPos}>
                                {metal ? <MedalDot metal={metal} label={`Medalla de ${METAL_WORDS[metal]}`} /> : null}
                                {row.rank ?? '·'}
                            </span>
                            <OdesurFlag code={row.org} name={row.name === country ? row.name : undefined} size={20} />
                            <span className={styles.rankingName}>
                                {row.name}
                                {row.name !== country && row.org ? <span className={styles.rankingOrg}>{country}</span> : null}
                            </span>
                            <span className={styles.rankingResult}>
                                {row.note || row.result}
                                {row.qualified ? <abbr className={styles.qualified} title="Clasificó">Q</abbr> : null}
                            </span>
                        </li>
                    );
                })}
            </ol>
            {rows.length > RANKING_PREVIEW ? (
                <button type="button" className={styles.linkBtn} onClick={() => setShowAll((value) => !value)}>
                    {showAll ? 'Ver menos' : `Ver los ${rows.length}`}
                </button>
            ) : null}
        </div>
    );
}

/**
 * De qué se trata la fila, en un rótulo chico: deporte · prueba · instancia.
 * Es contexto, no el titular: el titular de una fila es su resultado.
 */
function Meta({ sport, event, phase, showSport }: { sport: string; event: string; phase: string; showSport: boolean }) {
    return (
        <span className={styles.rowMeta}>
            {showSport ? <strong className={styles.rowSport}>{sport}</strong> : null}
            <span className={showSport ? undefined : styles.rowSport}>{keepUnits(event)}</span>
            {phase ? <span>{keepUnits(phase)}</span> : null}
        </span>
    );
}

/**
 * Los tres primeros de una prueba terminada, con su marca: en una final, con
 * la medalla; en una serie, con el puesto. Es lo que se viene a buscar.
 */
function Podium({ entries, follows }: { entries: OdesurPodiumEntryView[]; follows: OdesurFollows }) {
    const withMedals = entries.some((entry) => entry.metal);
    return (
        <ol className={styles.podiumInline} aria-label={withMedals ? 'Podio' : 'Los tres primeros'}>
            {entries.map((entry, index) => {
                const country = odesurOrgName(entry.org);
                const isCountry = entry.name === country;
                return (
                    <li
                        key={`${entry.org}-${entry.name}-${index}`}
                        className={`${styles.podiumEntry} ${entry.org && follows.orgs.has(entry.org) ? styles.podiumEntryOn : ''}`}
                    >
                        {entry.metal ? (
                            <MedalDot metal={entry.metal} label={`Medalla de ${METAL_WORDS[entry.metal]}`} />
                        ) : (
                            <span className={styles.podiumRank}>{entry.rank ?? index + 1}</span>
                        )}
                        <OdesurFlag code={entry.org} name={isCountry ? entry.name : undefined} size={22} />
                        <span className={styles.podiumEntryName}>
                            {entry.name}
                            {!isCountry && entry.org ? <span className={styles.srOnly}> ({country})</span> : null}
                        </span>
                        <span className={styles.podiumEntryResult}>{entry.result}</span>
                    </li>
                );
            })}
        </ol>
    );
}

/** Todavía sin resultado: quiénes compiten. */
function Entrants({ item, follows }: { item: Item; follows: OdesurFollows }) {
    if (item.orgs.length === 0) return null;
    return (
        <span className={styles.entrants}>
            <FlagRow orgs={item.orgs} follows={follows} />
            {item.participants ? (
                <span className={styles.entrantsCount}>
                    {plural(item.participants, 'participante', 'participantes')}
                </span>
            ) : null}
        </span>
    );
}

function UnitRow({ item, follows, showSport }: { item: Item; follows: OdesurFollows; showSport: boolean }) {
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const duel = item.isH2H && Boolean(item.home || item.away);
    const expandable = !duel && item.hasResults && !item.matchId;
    // Un día que viene todavía no dice quién compite: sin resultado ni
    // banderas, el rótulo pasa a ser el texto de la fila y la fila se achica.
    const bare = !duel && (item.podium?.length ?? 0) === 0 && item.orgs.length === 0;

    const body = (
        <>
            <Meta sport={item.disciplineName} event={item.eventName} phase={phaseLine(item)} showSport={showSport} />
            <span className={styles.rowResult}>
                {duel ? (
                    <Duel item={item} follows={follows} />
                ) : (item.podium?.length ?? 0) > 0 ? (
                    // `?.`: una agenda guardada antes de que existiera el podio no lo trae.
                    <Podium entries={item.podium} follows={follows} />
                ) : (
                    <Entrants item={item} follows={follows} />
                )}
            </span>
            <span className={styles.rowSide}>
                {item.medal ? <MedalTag /> : null}
                <StateTag state={item.state} results={expandable} />
                {expandable ? (
                    <ChevronDown size={18} className={`${styles.chev} ${open ? styles.chevOpen : ''}`} aria-hidden="true" />
                ) : item.matchId ? (
                    <ChevronRight size={18} className={styles.chev} aria-hidden="true" />
                ) : null}
            </span>
        </>
    );

    const bodyClass = `${styles.rowBody} ${bare ? styles.rowBodyBare : ''}`;

    return (
        <>
            {item.matchId ? (
                <Link href={`/matches/${item.matchId}`} className={`${bodyClass} ${styles.rowAction}`}>
                    {body}
                </Link>
            ) : expandable ? (
                <button
                    type="button"
                    className={`${bodyClass} ${styles.rowAction}`}
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    onClick={() => setOpen((value) => !value)}
                >
                    {body}
                    <span className={styles.srOnly}>{open ? 'Ocultar la clasificación' : 'Ver la clasificación'}</span>
                </button>
            ) : (
                <div className={bodyClass}>{body}</div>
            )}
            {open ? <Ranking item={item} follows={follows} id={panelId} /> : null}
        </>
    );
}

function SessionRow({ block, follows, showSport }: { block: SessionBlock; follows: OdesurFollows; showSport: boolean }) {
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const first = block.items[0];
    const [one, many] = sessionNoun(block.items);
    const orgs = useMemo(() => [...new Set(block.items.flatMap((item) => item.orgs))].sort(), [block.items]);
    const state = sessionState(block.items);
    const liveCount = block.items.filter((item) => item.state === 'live').length;
    const phase = [first.phaseName, plural(block.items.length, one, many), `hasta las ${formatTime(block.end)}`]
        .filter(Boolean)
        .join(DOT);

    return (
        <>
            <button
                type="button"
                className={`${styles.rowBody} ${styles.rowAction}`}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={() => setOpen((value) => !value)}
            >
                <Meta sport={first.disciplineName} event={first.eventName} phase={phase} showSport={showSport} />
                <span className={styles.rowResult}>
                    <FlagRow orgs={orgs} follows={follows} />
                </span>
                <span className={styles.rowSide}>
                    {block.items.some((item) => item.medal) ? <MedalTag /> : null}
                    {state === 'live' ? (
                        <span className={`${styles.tag} ${styles.tagLive}`}>
                            <span className={styles.liveDot} aria-hidden="true" />
                            {liveCount > 1 ? `${liveCount} en vivo` : 'En vivo'}
                        </span>
                    ) : (
                        <StateTag state={state} results />
                    )}
                    <ChevronDown size={18} className={`${styles.chev} ${open ? styles.chevOpen : ''}`} aria-hidden="true" />
                </span>
            </button>
            {open ? (
                <ul id={panelId} className={styles.sessionList}>
                    {block.items.map((item, index) => (
                        <li key={`${item.key}-${index}`} className={styles.sessionItem}>
                            <span className={styles.sessionTime}>{formatTime(item.startsAtIso)}</span>
                            <span className={styles.sessionUnit}>
                                {item.unitName || item.phaseName}
                                {item.state === 'live' ? <span className={styles.liveDot} role="img" aria-label="En vivo" /> : null}
                            </span>
                            {item.isH2H && (item.home || item.away) ? (
                                <Duel item={item} follows={follows} />
                            ) : (
                                <FlagRow orgs={item.orgs} follows={follows} max={5} />
                            )}
                        </li>
                    ))}
                </ul>
            ) : null}
        </>
    );
}

export default function AgendaList({
    items,
    follows,
    showSport = true,
    nowIso = null,
}: {
    items: Item[];
    follows: OdesurFollows;
    /** Dentro de la página de un deporte, el deporte ya está dicho. */
    showSport?: boolean;
    /** La hora de ahora, solo si el día que se mira es hoy: marca la línea "Ahora". */
    nowIso?: string | null;
}) {
    const blocks = useMemo(() => buildBlocks(items), [items]);

    // La línea "Ahora" va antes de lo primero que todavía no empezó.
    const nowIndex = useMemo(() => {
        if (!nowIso) return -1;
        return blocks.findIndex((block) => {
            const state = block.kind === 'unit' ? block.item.state : sessionState(block.items);
            return state === 'scheduled' && (block.start ?? '') > nowIso;
        });
    }, [blocks, nowIso]);

    return (
        <ol className={styles.agenda}>
            {blocks.map((block, index) => {
                const time = formatTime(block.start);
                const previous = index > 0 ? formatTime(blocks[index - 1].start) : null;
                const blockItems = block.kind === 'unit' ? [block.item] : block.items;
                const followed = blockItems.some((item) => follows.isFollowed(item.discipline, item.orgs));
                const live = blockItems.some((item) => item.state === 'live');

                return (
                    <Fragment key={block.key}>
                        {index === nowIndex ? (
                            <li className={styles.nowLine} id="odesur-ahora">
                                <span>Ahora · {formatTime(nowIso)}</span>
                            </li>
                        ) : null}
                        <li className={`${styles.row} ${live ? styles.rowLive : ''} ${followed ? styles.rowFollowed : ''}`}>
                            <span className={styles.rowTime}>
                                {/* La hora se repite para el lector de pantalla; a la vista, solo cuando cambia. */}
                                <time dateTime={block.start ?? undefined} className={time === previous ? styles.timeRepeat : undefined}>
                                    {time}
                                </time>
                                {followed ? <Star size={12} className={styles.rowStar} fill="currentColor" aria-label="Lo seguís" /> : null}
                            </span>
                            <div className={styles.rowMain}>
                                {block.kind === 'unit' ? (
                                    <UnitRow item={block.item} follows={follows} showSport={showSport} />
                                ) : (
                                    <SessionRow block={block} follows={follows} showSport={showSport} />
                                )}
                            </div>
                        </li>
                    </Fragment>
                );
            })}
        </ol>
    );
}
