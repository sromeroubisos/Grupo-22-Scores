'use client';

/**
 * La tabla por fechas: el selector (a la derecha de la tabla), la flecha de
 * cuántos puestos se movió cada club y el gráfico de evolución de posiciones.
 *
 * Los cortes de cada fecha los calcula `computeRoundCutoffs`
 * (src/lib/standings/standingsTimeline.ts); acá solo se presentan.
 */

import React, {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
} from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, LineChart, Pause, Play } from 'lucide-react';
import styles from './StandingsTimeline.module.css';

export type TimelineOption = {
    round: number;
    dayKey: string;
    fromDayKey: string;
    leaderName?: string | null;
    leaderLogo?: string | null;
};

export type EvolutionColumn = {
    label: string;
    title: string;
    rows: Array<{ teamId: string; name: string; logo?: string | null; position: number }>;
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Fechas ────────────────────────────────────────────────────────────────

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function splitDayKey(dayKey: string) {
    const [y, m, d] = dayKey.split('-').map(Number);
    return { y, m, d };
}

/** "27 sep", "26-27 sep" o "30 sep-1 oct". */
export function formatRoundDays(fromDayKey: string, toDayKey: string): string {
    const from = splitDayKey(fromDayKey);
    const to = splitDayKey(toDayKey);
    if (!to.m) return toDayKey;
    if (fromDayKey === toDayKey || !from.m) return `${to.d} ${MONTHS[to.m - 1]}`;
    if (from.m === to.m && from.y === to.y) return `${from.d}-${to.d} ${MONTHS[to.m - 1]}`;
    return `${from.d} ${MONTHS[from.m - 1]}-${to.d} ${MONTHS[to.m - 1]}`;
}

// ── Reordenamiento animado (FLIP) ─────────────────────────────────────────

/**
 * Cuando cambia `trigger`, cada fila marcada con `data-flip-key` viaja desde
 * donde estaba hasta su lugar nuevo, y se ilumina un instante en verde si
 * subió o en rojo si bajó. Con movimiento reducido el cambio es instantáneo.
 */
export function useFlipReorder(ref: RefObject<HTMLElement | null>, trigger: unknown) {
    const previous = useRef<Map<string, number>>(new Map());
    const timers = useRef<number[]>([]);

    useIsomorphicLayoutEffect(() => {
        const root = ref.current;
        if (!root) return;
        const reduce = prefersReducedMotion();
        const rows = root.querySelectorAll<HTMLElement>('[data-flip-key]');
        const next = new Map<string, number>();

        rows.forEach((row, index) => {
            const key = row.dataset.flipKey;
            if (!key) return;
            const top = row.offsetTop;
            next.set(key, top);

            const before = previous.current.get(key);
            if (reduce || before === undefined || before === top || typeof row.animate !== 'function') return;

            const dy = before - top;
            row.animate(
                [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
                {
                    duration: 620,
                    delay: Math.min(index * 14, 140),
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    fill: 'backwards',
                },
            );
            row.dataset.moved = dy > 0 ? 'up' : 'down';
            const timer = window.setTimeout(() => {
                delete row.dataset.moved;
            }, 1100);
            timers.current.push(timer);
        });

        previous.current = next;
    }, [trigger]);

    useEffect(() => () => {
        timers.current.forEach((timer) => window.clearTimeout(timer));
    }, []);
}

// ── Flecha de puestos ─────────────────────────────────────────────────────

export function PositionDeltaChip({ delta }: { delta: number | null | undefined }) {
    if (delta === null || delta === undefined) return null;
    if (delta === 0) {
        return (
            <span className={`${styles.delta} ${styles.deltaSame}`} aria-label="Mantuvo el puesto">
                =
            </span>
        );
    }
    const up = delta > 0;
    const amount = Math.abs(delta);
    return (
        <span
            className={`${styles.delta} ${up ? styles.deltaUp : styles.deltaDown}`}
            aria-label={`${up ? 'Subió' : 'Bajó'} ${amount} ${amount === 1 ? 'puesto' : 'puestos'}`}
        >
            {up
                ? <ArrowUp size={10} strokeWidth={2.6} aria-hidden="true" />
                : <ArrowDown size={10} strokeWidth={2.6} aria-hidden="true" />}
            {amount}
        </span>
    );
}

// ── Selector de fecha ─────────────────────────────────────────────────────

type PickerProps = {
    options: TimelineOption[];
    /** Índice en `options`; null es la tabla actual. */
    value: number | null;
    onChange: (value: number | null) => void;
};

const PLAY_STEP_MS = 1500;

export function StandingsRoundPicker({ options, value, onChange }: PickerProps) {
    const [open, setOpen] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listId = useId();

    // La lista va de la más reciente a la primera, con "Tabla actual" arriba.
    const items = useMemo(
        () => [
            { key: 'actual', value: null as number | null, option: null as TimelineOption | null },
            ...options
                .map((option, index) => ({ key: `r-${option.round}`, value: index as number | null, option }))
                .reverse(),
        ],
        [options],
    );

    const selected = value === null ? null : options[value] ?? null;
    const lastIndex = options.length - 1;

    // "Anterior" desde la tabla actual va a la última fecha cerrada.
    const goPrevious = useCallback(() => {
        if (value === null) onChange(lastIndex);
        else if (value > 0) onChange(value - 1);
    }, [lastIndex, onChange, value]);

    const goNext = useCallback(() => {
        if (value === null) return;
        onChange(value >= lastIndex ? null : value + 1);
    }, [lastIndex, onChange, value]);

    // Reproducir: avanza una fecha cada tanto hasta llegar a la tabla actual.
    useEffect(() => {
        if (!playing) return;
        if (value === null) {
            setPlaying(false);
            return;
        }
        const timer = window.setTimeout(() => {
            onChange(value >= lastIndex ? null : value + 1);
        }, PLAY_STEP_MS);
        return () => window.clearTimeout(timer);
    }, [lastIndex, onChange, playing, value]);

    const togglePlay = () => {
        if (playing) {
            setPlaying(false);
            return;
        }
        if (value === null || value >= lastIndex) onChange(0);
        setPlaying(true);
    };

    const openList = () => {
        const current = items.findIndex((item) => item.value === value);
        setActiveIndex(current < 0 ? 0 : current);
        setOpen(true);
    };

    const choose = (next: number | null) => {
        setPlaying(false);
        onChange(next);
        setOpen(false);
        triggerRef.current?.focus();
    };

    // Clic afuera cierra.
    useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointer);
        return () => document.removeEventListener('pointerdown', onPointer);
    }, [open]);

    useEffect(() => {
        if (open) listRef.current?.focus();
    }, [open]);

    // La opción activa siempre a la vista cuando se navega con el teclado.
    useEffect(() => {
        if (!open) return;
        const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, open]);

    const onListKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((i) => Math.min(items.length - 1, i + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
        } else if (event.key === 'Home') {
            event.preventDefault();
            setActiveIndex(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            setActiveIndex(items.length - 1);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(items[activeIndex]?.value ?? null);
        } else if (event.key === 'Escape') {
            setOpen(false);
            triggerRef.current?.focus();
        } else if (event.key === 'Tab') {
            setOpen(false);
        }
    };

    const onTriggerKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
        }
    };

    return (
        <div className={styles.picker} ref={rootRef}>
            <button
                type="button"
                className={styles.stepBtn}
                onClick={() => { setPlaying(false); goPrevious(); }}
                disabled={value === 0}
                aria-label="Fecha anterior"
                title="Fecha anterior"
            >
                <ChevronLeft size={16} aria-hidden="true" />
            </button>

            <div className={styles.triggerWrap}>
                <button
                    ref={triggerRef}
                    type="button"
                    className={`${styles.trigger} ${selected ? styles.triggerHistoric : ''}`}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => (open ? setOpen(false) : openList())}
                    onKeyDown={onTriggerKeyDown}
                >
                    <span className={styles.triggerText}>
                        {/* La clave hace que el rótulo entre de nuevo con cada cambio. */}
                        <span key={selected ? selected.round : 'actual'} className={styles.triggerLabel}>
                            {selected ? `Fecha ${selected.round}` : 'Tabla actual'}
                        </span>
                        <span className={styles.triggerSub}>
                            {selected
                                ? formatRoundDays(selected.fromDayKey, selected.dayKey)
                                : `${options.length} ${options.length === 1 ? 'fecha' : 'fechas'}`}
                        </span>
                    </span>
                    <ChevronDown size={15} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
                </button>

                {open && (
                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        tabIndex={-1}
                        aria-label="Ver la tabla al cierre de una fecha"
                        aria-activedescendant={`${listId}-${activeIndex}`}
                        className={styles.list}
                        onKeyDown={onListKeyDown}
                    >
                        {items.map((item, index) => {
                            const isSelected = item.value === value;
                            const option = item.option;
                            return (
                                <li
                                    key={item.key}
                                    id={`${listId}-${index}`}
                                    data-index={index}
                                    role="option"
                                    aria-selected={isSelected}
                                    className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''} ${isSelected ? styles.optionSelected : ''}`}
                                    style={{ '--i': Math.min(index, 12) } as React.CSSProperties}
                                    onPointerEnter={() => setActiveIndex(index)}
                                    onClick={() => choose(item.value)}
                                >
                                    <span className={styles.optionMain}>
                                        <span className={styles.optionTitle}>
                                            {option ? `Fecha ${option.round}` : 'Tabla actual'}
                                        </span>
                                        <span className={styles.optionDate}>
                                            {option ? formatRoundDays(option.fromDayKey, option.dayKey) : 'Con todos los resultados'}
                                        </span>
                                    </span>
                                    {option?.leaderName && (
                                        <span className={styles.optionLeader} title={`Puntero: ${option.leaderName}`}>
                                            {option.leaderLogo
                                                ? <img src={option.leaderLogo} alt="" className={styles.optionCrest} loading="lazy" />
                                                : <span className={styles.optionCrestEmpty} aria-hidden="true" />}
                                            <span className={styles.optionLeaderName}>{option.leaderName}</span>
                                        </span>
                                    )}
                                    <Check size={14} className={styles.optionCheck} aria-hidden="true" />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <button
                type="button"
                className={styles.stepBtn}
                onClick={() => { setPlaying(false); goNext(); }}
                disabled={value === null}
                aria-label="Fecha siguiente"
                title="Fecha siguiente"
            >
                <ChevronRight size={16} aria-hidden="true" />
            </button>

            <button
                type="button"
                className={`${styles.stepBtn} ${styles.playBtn} ${playing ? styles.playBtnOn : ''}`}
                onClick={togglePlay}
                aria-label={playing ? 'Pausar el recorrido' : 'Recorrer el torneo fecha por fecha'}
                aria-pressed={playing}
                title={playing ? 'Pausar' : 'Recorrer fecha por fecha'}
                disabled={options.length < 2}
            >
                {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                {playing && value !== null && (
                    <span className={styles.playProgress} aria-hidden="true">
                        <span
                            key={value}
                            className={styles.playProgressFill}
                            style={{ animationDuration: `${PLAY_STEP_MS}ms` }}
                        />
                    </span>
                )}
            </button>
        </div>
    );
}

// ── Botón que abre el gráfico ─────────────────────────────────────────────

export function EvolutionToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
    return (
        <button
            type="button"
            className={`${styles.evolutionToggle} ${open ? styles.evolutionToggleOn : ''}`}
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={controls}
        >
            <LineChart size={14} aria-hidden="true" />
            <span>{open ? 'Ocultar evolución' : 'Ver evolución'}</span>
        </button>
    );
}

// ── Gráfico de evolución ──────────────────────────────────────────────────

/** Cuatro clubes resaltados como máximo: más que eso ya no se distingue. */
const MAX_PINNED = 4;
const SERIES_CLASSES = [styles.series1, styles.series2, styles.series3, styles.series4];

const ROW_H = 26;
const COL_W = 56;
const PAD_TOP = 18;
const PAD_BOTTOM = 30;
const PAD_LEFT = 30;
const LABEL_W = 156;
const NAME_MAX = 17;

type ChartProps = {
    id: string;
    columns: EvolutionColumn[];
    /** Columna marcada: la fecha que se está mirando en la tabla. */
    highlightColumn?: number | null;
    onColumnClick?: (index: number) => void;
};

export function StandingsEvolutionChart({ id, columns, highlightColumn, onColumnClick }: ChartProps) {
    const teams = useMemo(() => {
        const last = columns[columns.length - 1]?.rows ?? [];
        const order = [...last].sort((a, b) => a.position - b.position);
        const seen = new Set(order.map((row) => row.teamId));
        // Un club que estuvo en una tabla vieja y no en la última también entra.
        columns.forEach((column) => column.rows.forEach((row) => {
            if (!seen.has(row.teamId)) {
                seen.add(row.teamId);
                order.push(row);
            }
        }));
        return order.map((row) => {
            const positions = columns.map((column) => column.rows.find((r) => r.teamId === row.teamId)?.position ?? null);
            const known = positions.filter((p): p is number => p !== null);
            return {
                teamId: row.teamId,
                name: row.name,
                logo: row.logo ?? null,
                positions,
                best: Math.min(...known),
                worst: Math.max(...known),
            };
        });
    }, [columns]);

    // El color es del club, no del puesto: queda fijo mientras esté resaltado.
    const [pinned, setPinned] = useState<string[]>(() => (teams[0] ? [teams[0].teamId] : []));
    const [hovered, setHovered] = useState<string | null>(null);
    const [hoverColumn, setHoverColumn] = useState<number | null>(null);

    const teamCount = Math.max(teams.length, ...columns.map((c) => c.rows.length), 1);
    const plotW = Math.max(1, columns.length - 1) * COL_W;
    const width = PAD_LEFT + plotW + LABEL_W;
    const height = PAD_TOP + (teamCount - 1) * ROW_H + PAD_BOTTOM;
    const x = (i: number) => PAD_LEFT + (columns.length === 1 ? plotW / 2 : i * COL_W);
    const y = (position: number) => PAD_TOP + (position - 1) * ROW_H;

    const togglePin = (teamId: string) => {
        setPinned((current) => {
            if (current.includes(teamId)) return current.filter((t) => t !== teamId);
            if (current.length >= MAX_PINNED) return [...current.slice(1), teamId];
            return [...current, teamId];
        });
    };

    const pathFor = (positions: Array<number | null>) => {
        let d = '';
        let prevX = 0;
        let prevY = 0;
        let open = false;
        positions.forEach((position, i) => {
            if (position === null) {
                open = false;
                return;
            }
            const px = x(i);
            const py = y(position);
            if (!open) {
                d += `M${px},${py}`;
            } else {
                // Curva con tangentes horizontales: el clásico gráfico de "bump".
                const mid = (px - prevX) / 2;
                d += ` C${prevX + mid},${prevY} ${px - mid},${py} ${px},${py}`;
            }
            prevX = px;
            prevY = py;
            open = true;
        });
        return d;
    };

    const colorClassFor = (teamId: string) => {
        const slot = pinned.indexOf(teamId);
        return slot >= 0 ? SERIES_CLASSES[slot] : '';
    };

    // En pantallas angostas el gráfico se desplaza: arranca centrado en la
    // fecha que se mira (o en la última), que es lo que interesa ver primero.
    const scrollRef = useRef<HTMLDivElement>(null);
    const focusColumn = highlightColumn ?? columns.length - 1;
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || el.scrollWidth <= el.clientWidth) return;
        const target = PAD_LEFT + (columns.length === 1 ? plotW / 2 : focusColumn * COL_W) - el.clientWidth / 2;
        el.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, [columns.length, focusColumn, plotW]);

    const isRaised = (teamId: string) => pinned.includes(teamId) || teamId === hovered;
    const drawOrder = [...teams].sort((a, b) => Number(isRaised(a.teamId)) - Number(isRaised(b.teamId)));
    const hoverColumnRows = hoverColumn !== null
        ? [...(columns[hoverColumn]?.rows ?? [])].sort((a, b) => a.position - b.position)
        : [];

    return (
        <div id={id} className={styles.chartPanel}>
            <div className={styles.chartHead}>
                <p className={styles.chartTitle}>Evolución de posiciones</p>
                <p className={styles.chartHint}>Tocá un club para seguirlo, hasta {MAX_PINNED} a la vez.</p>
            </div>

            <div ref={scrollRef} className={styles.chartScroll} onPointerLeave={() => { setHovered(null); setHoverColumn(null); }}>
                <svg
                    className={styles.chart}
                    viewBox={`0 0 ${width} ${height}`}
                    width={width}
                    height={height}
                    role="img"
                    aria-label={`Posiciones de ${teams.length} clubes a lo largo de ${columns.length} fechas`}
                >
                    {/* Grilla: una guía por puesto, recesiva. */}
                    {Array.from({ length: teamCount }, (_, i) => (
                        <g key={`row-${i}`}>
                            <line className={styles.gridLine} x1={PAD_LEFT} x2={PAD_LEFT + plotW} y1={y(i + 1)} y2={y(i + 1)} />
                            <text className={styles.axisText} x={PAD_LEFT - 12} y={y(i + 1)} textAnchor="end" dominantBaseline="central">
                                {i + 1}
                            </text>
                        </g>
                    ))}

                    {/* Columnas: la fecha que se mira en la tabla queda marcada. */}
                    {columns.map((column, i) => (
                        <g key={`col-${i}`}>
                            {(highlightColumn === i || hoverColumn === i) && (
                                <rect
                                    className={highlightColumn === i ? styles.colMarkSelected : styles.colMark}
                                    x={x(i) - COL_W / 2 + 6}
                                    y={PAD_TOP - 13}
                                    width={COL_W - 12}
                                    height={(teamCount - 1) * ROW_H + 26}
                                    rx={8}
                                />
                            )}
                            <text
                                className={`${styles.axisText} ${highlightColumn === i ? styles.axisTextStrong : ''}`}
                                x={x(i)}
                                y={height - 9}
                                textAnchor="middle"
                            >
                                {column.label}
                            </text>
                        </g>
                    ))}

                    {/* Columnas de toque, debajo de las líneas: el tooltip por fecha. */}
                    {columns.map((_, i) => (
                        <rect
                            key={`hit-${i}`}
                            className={styles.colHit}
                            x={x(i) - COL_W / 2}
                            y={0}
                            width={COL_W}
                            height={height}
                            onPointerEnter={() => setHoverColumn(i)}
                            onClick={() => onColumnClick?.(i)}
                        />
                    ))}

                    {/* Líneas de fondo primero, resaltadas arriba. */}
                    {drawOrder.map((team) => {
                        const isPinned = pinned.includes(team.teamId);
                        const isFocus = team.teamId === hovered;
                        const dimmed = hovered !== null && !isFocus && !isPinned;
                        const d = pathFor(team.positions);
                        return (
                            <g
                                key={team.teamId}
                                className={[
                                    styles.series,
                                    isPinned ? styles.seriesPinned : '',
                                    colorClassFor(team.teamId),
                                    isFocus ? styles.seriesFocus : '',
                                    dimmed ? styles.seriesDim : '',
                                ].join(' ')}
                            >
                                <path className={styles.seriesLine} d={d} pathLength={1} />
                                {(isPinned || isFocus) && team.positions.map((position, i) => (
                                    position === null ? null : (
                                        <circle key={i} className={styles.seriesDot} cx={x(i)} cy={y(position)} r={4.5} />
                                    )
                                ))}
                                {/* Zona de toque más ancha que la línea. */}
                                <path
                                    className={styles.seriesHit}
                                    d={d}
                                    onPointerEnter={() => setHovered(team.teamId)}
                                    onPointerLeave={() => setHovered(null)}
                                    onClick={() => togglePin(team.teamId)}
                                />
                            </g>
                        );
                    })}

                    {/* Rótulo directo al final de cada línea: escudo y nombre. */}
                    {teams.map((team) => {
                        let lastIndex = team.positions.length - 1;
                        while (lastIndex >= 0 && team.positions[lastIndex] === null) lastIndex -= 1;
                        if (lastIndex < 0) return null;
                        const position = team.positions[lastIndex] as number;
                        const isPinned = pinned.includes(team.teamId);
                        const isFocus = team.teamId === hovered;
                        return (
                            <g
                                key={`label-${team.teamId}`}
                                className={[
                                    styles.endLabel,
                                    isPinned ? styles.endLabelPinned : '',
                                    colorClassFor(team.teamId),
                                    isFocus ? styles.endLabelFocus : '',
                                ].join(' ')}
                                transform={`translate(${x(lastIndex) + 14}, ${y(position)})`}
                                onPointerEnter={() => setHovered(team.teamId)}
                                onPointerLeave={() => setHovered(null)}
                                onClick={() => togglePin(team.teamId)}
                            >
                                <rect className={styles.endLabelHit} x={-4} y={-ROW_H / 2 + 1} width={LABEL_W - 12} height={ROW_H - 2} rx={6} />
                                {team.logo
                                    ? <image href={team.logo} x={0} y={-9} width={18} height={18} preserveAspectRatio="xMidYMid meet" />
                                    : <circle className={styles.endLabelDot} cx={9} cy={0} r={5} />}
                                <text className={styles.endLabelText} x={25} y={0} dominantBaseline="central">
                                    {team.name.length > NAME_MAX ? `${team.name.slice(0, NAME_MAX - 1)}…` : team.name}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                {hoverColumn !== null && hovered === null && hoverColumnRows.length > 0 && (
                    <div
                        className={styles.tooltip}
                        style={{ left: Math.max(4, Math.min(x(hoverColumn) + 18, width - 200)) }}
                        aria-hidden="true"
                    >
                        <p className={styles.tooltipTitle}>{columns[hoverColumn].title}</p>
                        {hoverColumnRows.slice(0, 5).map((row) => (
                            <p key={row.teamId} className={styles.tooltipRow}>
                                <span className={styles.tooltipPos}>{row.position}</span>
                                <span className={styles.tooltipName}>{row.name}</span>
                            </p>
                        ))}
                        {onColumnClick && <p className={styles.tooltipFoot}>Tocá para ver esa tabla</p>}
                    </div>
                )}
            </div>

            {/* La lista de clubes es la leyenda, el selector y el dato accesible. */}
            <ul className={styles.chips} aria-label="Clubes del gráfico">
                {teams.map((team) => {
                    const isPinned = pinned.includes(team.teamId);
                    return (
                        <li key={team.teamId}>
                            <button
                                type="button"
                                className={`${styles.chip} ${isPinned ? `${styles.chipOn} ${colorClassFor(team.teamId)}` : ''}`}
                                aria-pressed={isPinned}
                                onClick={() => togglePin(team.teamId)}
                                onPointerEnter={() => setHovered(team.teamId)}
                                onPointerLeave={() => setHovered(null)}
                                onFocus={() => setHovered(team.teamId)}
                                onBlur={() => setHovered(null)}
                                aria-label={`${team.name}: mejor puesto ${team.best}, peor puesto ${team.worst}`}
                            >
                                <span className={styles.chipSwatch} aria-hidden="true" />
                                {team.logo ? <img src={team.logo} alt="" className={styles.chipCrest} loading="lazy" /> : null}
                                <span className={styles.chipName}>{team.name}</span>
                                <span className={styles.chipRange} aria-hidden="true">
                                    {team.best === team.worst ? `${team.best}°` : `${team.best}°-${team.worst}°`}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
