'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, CalendarDays, Star } from 'lucide-react';
import AgendaList from './AgendaList';
import { EmptyState, ErrorState, SkeletonRows } from './OdesurBits';
import { centerInScroller, dayLabels, plural } from './odesurClient';
import type { OdesurAgendaView, OdesurSportsIndexView } from './types';
import type { OdesurFollows } from './useOdesurFollows';
import styles from './page.module.css';

type Filter = 'todo' | 'siguiendo' | 'vivo' | 'medallas';

const FILTERS: Array<{ id: Filter; label: string }> = [
    { id: 'todo', label: 'Todo' },
    { id: 'siguiendo', label: 'Siguiendo' },
    { id: 'vivo', label: 'En vivo' },
    { id: 'medallas', label: 'Medallas' },
];

/**
 * La agenda de un día de los Juegos, los 60 deportes.
 *
 * Arriba, los 14 días con las finales de cada uno; abajo, un filtro de lo que
 * se sigue, lo que está en juego y lo que reparte medallas, y un selector de
 * deporte. La lista va en orden de hora: la pregunta del que entra es "qué hay
 * ahora y qué viene", no "qué hace la esgrima" (para eso está Deportes).
 */
export default function AgendaPanel(props: {
    days: string[];
    day: string;
    today: string;
    onDay: (day: string) => void;
    agenda: OdesurAgendaView | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    index: OdesurSportsIndexView | null;
    follows: OdesurFollows;
    onOpenFollow: () => void;
    onOpenSport: (code: string, day?: string) => void;
}) {
    const { days, day, today, agenda, loading, error, index, follows } = props;
    const [filter, setFilter] = useState<Filter>('todo');
    const [sport, setSport] = useState('');
    const [now, setNow] = useState<string | null>(null);
    const stripRef = useRef<HTMLDivElement>(null);

    // En el teléfono la tira no entra entera: el día elegido queda a la vista.
    useEffect(() => {
        centerInScroller(stripRef.current, stripRef.current?.querySelector('[aria-checked="true"]') ?? null);
    }, [day]);

    // La hora de ahora sale del reloj del navegador y después de hidratar: el
    // servidor no sabe cuándo va a leer nadie la página.
    useEffect(() => {
        const tick = () => setNow(new Date().toISOString());
        tick();
        const timer = window.setInterval(tick, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const items = useMemo(() => agenda?.items ?? [], [agenda]);

    const finalsByDay = useMemo(() => {
        const totals: Record<string, number> = {};
        for (const row of index?.sports ?? []) {
            for (const [key, slot] of Object.entries(row.days)) {
                totals[key] = (totals[key] ?? 0) + slot.finals;
            }
        }
        return totals;
    }, [index]);

    const sportOptions = useMemo(() => {
        const counts = new Map<string, { name: string; count: number }>();
        for (const item of items) {
            const entry = counts.get(item.discipline) ?? { name: item.disciplineName, count: 0 };
            entry.count += 1;
            counts.set(item.discipline, entry);
        }
        return [...counts.entries()]
            .map(([code, entry]) => ({ code, ...entry }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [items]);

    const inSport = useMemo(() => (sport ? items.filter((item) => item.discipline === sport) : items), [items, sport]);

    const counts = useMemo(() => ({
        todo: inSport.length,
        siguiendo: inSport.filter((item) => follows.isFollowed(item.discipline, item.orgs)).length,
        vivo: inSport.filter((item) => item.state === 'live').length,
        medallas: inSport.filter((item) => item.medal).length,
    }), [inSport, follows]);

    const visible = useMemo(() => inSport.filter((item) => {
        if (filter === 'siguiendo') return follows.isFollowed(item.discipline, item.orgs);
        if (filter === 'vivo') return item.state === 'live';
        if (filter === 'medallas') return item.medal;
        return true;
    }), [inSport, filter, follows]);

    const isToday = day === today;
    const sportName = sportOptions.find((option) => option.code === sport)?.name
        ?? index?.sports.find((row) => row.code === sport)?.name
        ?? '';
    const labels = dayLabels(day);
    const sportsCount = new Set(inSport.map((item) => item.discipline)).size;
    const hasNowLine = isToday && now !== null
        && visible.some((item) => item.state === 'scheduled' && (item.startsAtIso ?? '') > now);

    return (
        <div className={styles.stack}>
            <div ref={stripRef} className={styles.dayStrip} role="radiogroup" aria-label="Día de los Juegos">
                {days.map((value, position) => {
                    const dayLabel = dayLabels(value);
                    const finals = finalsByDay[value] ?? 0;
                    const selected = day === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={`${dayLabel.long}, día ${position + 1}${finals ? `, ${plural(finals, 'final', 'finales')}` : ''}${value === today ? ', hoy' : ''}`}
                            className={`${styles.dayBtn} ${selected ? styles.dayBtnOn : ''} ${value === today ? styles.dayBtnToday : ''}`}
                            onClick={() => props.onDay(value)}
                        >
                            <span className={styles.dayWeek}>{value === today ? 'hoy' : dayLabel.weekday}</span>
                            <span className={styles.dayNum}>{dayLabel.number}</span>
                            <span className={styles.dayFinals} aria-hidden="true">
                                {finals ? <><span className={styles.dayFinalsDot} />{finals}</> : ' '}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className={styles.toolbar}>
                <div className={styles.segmented} role="radiogroup" aria-label="Qué mostrar">
                    {FILTERS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={filter === option.id}
                            className={`${styles.segment} ${filter === option.id ? styles.segmentOn : ''}`}
                            onClick={() => setFilter(option.id)}
                        >
                            {option.id === 'siguiendo' ? (
                                <Star size={13} aria-hidden="true" fill={filter === option.id ? 'currentColor' : 'none'} />
                            ) : null}
                            {option.id === 'vivo' && counts.vivo > 0 ? <span className={styles.liveDot} aria-hidden="true" /> : null}
                            {option.label}
                            {agenda ? <span className={styles.segmentCount}>{counts[option.id]}</span> : null}
                        </button>
                    ))}
                </div>

                <label className={styles.sportSelect}>
                    <span className={styles.srOnly}>Deporte</span>
                    <select value={sport} onChange={(event) => setSport(event.target.value)}>
                        <option value="">Todos los deportes{sportOptions.length ? ` (${sportOptions.length})` : ''}</option>
                        {sport && !sportOptions.some((option) => option.code === sport) ? (
                            <option value={sport}>{sportName} (0)</option>
                        ) : null}
                        {sportOptions.map((option) => (
                            <option key={option.code} value={option.code}>
                                {option.name} ({option.count})
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className={styles.agendaHead}>
                <div className={styles.agendaHeadText}>
                    <h2 className={styles.sectionTitle}>
                        {isToday ? 'Hoy, ' : ''}{labels.long}
                    </h2>
                    {agenda ? (
                        <p className={styles.agendaSummary}>
                            {plural(inSport.length, 'prueba', 'pruebas')}
                            {sport ? '' : ` de ${plural(sportsCount, 'deporte', 'deportes')}`}
                            {counts.medallas ? ` · ${plural(counts.medallas, 'reparte', 'reparten')} medallas` : ''}
                        </p>
                    ) : null}
                </div>
                <div className={styles.agendaHeadActions}>
                    {hasNowLine ? (
                        <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() => document.getElementById('odesur-ahora')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        >
                            <ArrowDown size={14} aria-hidden="true" />
                            Ir a ahora
                        </button>
                    ) : null}
                    {sport ? (
                        <button type="button" className={styles.ghostBtn} onClick={() => props.onOpenSport(sport, day)}>
                            <CalendarDays size={14} aria-hidden="true" />
                            Todo {sportName.toLowerCase() || 'el deporte'}
                        </button>
                    ) : null}
                </div>
            </div>

            {error && !agenda ? <ErrorState message={error} onRetry={props.onRetry} /> : null}

            {!agenda ? (
                loading || !error ? <SkeletonRows count={8} label="Cargando la agenda..." /> : null
            ) : visible.length > 0 ? (
                <AgendaList items={visible} follows={follows} showSport={!sport} nowIso={isToday ? now : null} />
            ) : filter === 'siguiendo' && follows.count === 0 ? (
                <EmptyState title="Todavía no seguís nada.">
                    <p>Elegí países o deportes y este filtro te deja solo lo tuyo, todos los días.</p>
                    <div className={styles.emptyActions}>
                        <button type="button" className={styles.primaryBtn} onClick={() => follows.toggleOrg('ARG')}>
                            Seguir a Argentina
                        </button>
                        <button type="button" className={styles.ghostBtn} onClick={props.onOpenFollow}>
                            Elegir qué seguir
                        </button>
                    </div>
                </EmptyState>
            ) : filter === 'siguiendo' ? (
                <EmptyState title={`El ${labels.long} no compite nada de lo que seguís.`}>
                    <p>Probá con otro día o sumá más países y deportes.</p>
                    <div className={styles.emptyActions}>
                        <button type="button" className={styles.ghostBtn} onClick={props.onOpenFollow}>Editar lo que sigo</button>
                    </div>
                </EmptyState>
            ) : filter === 'vivo' ? (
                <EmptyState title="No hay nada en juego en este momento." />
            ) : filter === 'medallas' ? (
                <EmptyState title={`El ${labels.long} no se reparten medallas${sport ? ` en ${sportName.toLowerCase()}` : ''}.`} />
            ) : sport ? (
                <EmptyState title={`${sportName || 'Ese deporte'} no compite el ${labels.long}.`}>
                    <div className={styles.emptyActions}>
                        <button type="button" className={styles.ghostBtn} onClick={() => props.onOpenSport(sport)}>
                            Ver sus días
                        </button>
                        <button type="button" className={styles.ghostBtn} onClick={() => setSport('')}>
                            Ver todos los deportes
                        </button>
                    </div>
                </EmptyState>
            ) : (
                <EmptyState title="No hay actividad este día." />
            )}
        </div>
    );
}
