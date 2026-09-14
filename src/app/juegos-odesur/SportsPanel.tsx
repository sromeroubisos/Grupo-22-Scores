'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, Star } from 'lucide-react';
import FavoriteButton from '@/components/FavoriteButton';
import { ODESUR_DISCIPLINES, type OdesurDisciplineCode } from '@/lib/services/odesur2026Parser';
import AgendaList from './AgendaList';
import OdesurFlag from './OdesurFlag';
import { EmptyState, ErrorState, MedalDot, METALS, SkeletonRows } from './OdesurBits';
import { centerInScroller, dayLabels, plural, useOdesurApi } from './odesurClient';
import type {
    OdesurCompetitionView,
    OdesurMedallistView,
    OdesurSportView,
    OdesurSportsIndexView,
} from './types';
import type { OdesurFollows } from './useOdesurFollows';
import styles from './page.module.css';

type Gender = 'm' | 'w';
type MatrixFilter = 'todos' | 'sigo' | 'hoy';

const METAL_WORD: Record<string, string> = { gold: 'oro', silver: 'plata', bronze: 'bronce' };

function isTeamSport(code: string): code is OdesurDisciplineCode {
    return Boolean(ODESUR_DISCIPLINES[code as OdesurDisciplineCode]);
}

function normalize(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** La hora de ahora, después de hidratar y al minuto. */
function useNowIso(): string | null {
    const [now, setNow] = useState<string | null>(null);
    useEffect(() => {
        const tick = () => setNow(new Date().toISOString());
        tick();
        const timer = window.setInterval(tick, 60_000);
        return () => window.clearInterval(timer);
    }, []);
    return now;
}

// --------------------------------------------------------------------------
// El calendario de los 60 deportes
// --------------------------------------------------------------------------

/**
 * Los 60 deportes contra los 14 días: la grilla de siempre de unos Juegos.
 * Cada casillero dice si el deporte compite ese día y si reparte medallas, y
 * lleva a ese día del deporte. Es la respuesta a "¿cuándo juega el hockey?"
 * sin abrir 14 agendas.
 */
function SportsMatrix({
    days,
    today,
    index,
    loading,
    error,
    onRetry,
    follows,
    onOpenSport,
}: {
    days: string[];
    today: string;
    index: OdesurSportsIndexView | null;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    follows: OdesurFollows;
    onOpenSport: (code: string, day?: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<MatrixFilter>('todos');
    const searchId = useId();
    const wrapRef = useRef<HTMLDivElement>(null);
    const hasIndex = Boolean(index);

    // En el teléfono entran cuatro días: la grilla abre con hoy a la vista,
    // corrida lo que ocupa la columna fija de los deportes.
    useEffect(() => {
        const wrap = wrapRef.current;
        const sticky = wrap?.querySelector('thead th') as HTMLElement | null;
        centerInScroller(wrap, wrap?.querySelector('[data-today]') ?? null, sticky?.offsetWidth ?? 0);
    }, [hasIndex]);

    const rows = useMemo(() => {
        const needle = normalize(query.trim());
        return (index?.sports ?? []).filter((row) => {
            if (needle && !normalize(row.name).includes(needle)) return false;
            if (filter === 'sigo') return follows.sports.has(row.code);
            if (filter === 'hoy') return Boolean(row.days[today]);
            return true;
        });
    }, [index, query, filter, follows.sports, today]);

    if (!index) {
        if (error) return <ErrorState message={error} onRetry={onRetry} />;
        return loading ? <SkeletonRows count={10} label="Cargando el calendario de los deportes..." /> : null;
    }

    const todayCount = index.sports.filter((row) => row.days[today]).length;
    const filters: Array<{ id: MatrixFilter; label: string; count: number }> = [
        { id: 'todos', label: 'Todos', count: index.sports.length },
        { id: 'sigo', label: 'Los que sigo', count: follows.sports.size },
        ...(days.includes(today) ? [{ id: 'hoy' as const, label: 'Compiten hoy', count: todayCount }] : []),
    ];

    return (
        <div className={styles.stack}>
            <div className={styles.toolbar}>
                <div className={styles.segmented} role="radiogroup" aria-label="Qué deportes mostrar">
                    {filters.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={filter === option.id}
                            className={`${styles.segment} ${filter === option.id ? styles.segmentOn : ''}`}
                            onClick={() => setFilter(option.id)}
                        >
                            {option.label}
                            <span className={styles.segmentCount}>{option.count}</span>
                        </button>
                    ))}
                </div>
                <label className={styles.searchField} htmlFor={searchId}>
                    <Search size={15} aria-hidden="true" />
                    <span className={styles.srOnly}>Buscar un deporte</span>
                    <input
                        id={searchId}
                        type="search"
                        value={query}
                        placeholder="Buscar un deporte"
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
            </div>

            {index.missingDays.length ? (
                <p className={styles.hint}>
                    {plural(index.missingDays.length, 'día no respondió', 'días no respondieron')} a tiempo; el calendario los completa en el próximo refresco.
                </p>
            ) : null}

            {rows.length === 0 ? (
                filter === 'sigo' && follows.sports.size === 0 ? (
                    <EmptyState title="Todavía no seguís ningún deporte.">
                        <p>Tocá la ★ al lado de un deporte y la agenda te lo marca todos los días.</p>
                    </EmptyState>
                ) : (
                    <EmptyState title="Ningún deporte coincide con la búsqueda." />
                )
            ) : (
                <div ref={wrapRef} className={styles.matrixWrap}>
                    <table className={styles.matrix}>
                        <caption className={styles.srOnly}>
                            Calendario de los deportes de los Juegos: en qué días compite cada uno y cuáles reparten medallas.
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col" className={styles.matrixCorner}>Deporte</th>
                                {days.map((day) => {
                                    const labels = dayLabels(day);
                                    return (
                                        <th
                                            key={day}
                                            scope="col"
                                            data-today={day === today ? '' : undefined}
                                            className={`${styles.matrixDay} ${day === today ? styles.matrixToday : ''}`}
                                        >
                                            <abbr title={labels.long}>
                                                <span className={styles.matrixDayWeek}>{day === today ? 'hoy' : labels.weekday.slice(0, 2)}</span>
                                                <span className={styles.matrixDayNum}>{labels.number}</span>
                                            </abbr>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const on = follows.sports.has(row.code);
                                return (
                                    <tr key={row.code} className={on ? styles.matrixRowOn : undefined}>
                                        <th scope="row" className={styles.matrixSport}>
                                            <span className={styles.matrixSportInner}>
                                                <button
                                                    type="button"
                                                    className={`${styles.starBtn} ${on ? styles.starBtnOn : ''}`}
                                                    aria-pressed={on}
                                                    aria-label={on ? `Dejar de seguir ${row.name}` : `Seguir ${row.name}`}
                                                    onClick={() => follows.toggleSport(row.code)}
                                                >
                                                    <Star size={14} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
                                                </button>
                                                <button type="button" className={styles.matrixName} onClick={() => onOpenSport(row.code)}>
                                                    {row.name}
                                                </button>
                                            </span>
                                        </th>
                                        {days.map((day) => {
                                            const slot = row.days[day];
                                            const labels = dayLabels(day);
                                            const detail = slot
                                                ? `${plural(slot.units, 'prueba', 'pruebas')}${slot.finals ? `, ${plural(slot.finals, 'final', 'finales')}` : ''}${slot.live ? ', en vivo' : ''}`
                                                : '';
                                            return (
                                                <td key={day} className={day === today ? styles.matrixToday : undefined}>
                                                    {slot ? (
                                                        <button
                                                            type="button"
                                                            className={`${styles.cell} ${slot.finals ? styles.cellFinal : ''} ${slot.live ? styles.cellLive : ''}`}
                                                            aria-label={`${row.name}, ${labels.long}: ${detail}`}
                                                            title={`${labels.long}: ${detail}`}
                                                            onClick={() => onOpenSport(row.code, day)}
                                                        >
                                                            <span className={styles.cellMark} aria-hidden="true" />
                                                        </button>
                                                    ) : null}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <p className={styles.legend}>
                <span><span className={`${styles.cellMark} ${styles.legendMark}`} aria-hidden="true" /> Compite</span>
                <span><span className={`${styles.cellMark} ${styles.legendMark} ${styles.legendFinal}`} aria-hidden="true" /> Reparte medallas</span>
                <span>Tocá un casillero para ver ese día del deporte.</span>
            </p>
        </div>
    );
}

// --------------------------------------------------------------------------
// Un deporte
// --------------------------------------------------------------------------

function TeamCompetition({ code, gender, onGender }: { code: OdesurDisciplineCode; gender: Gender; onGender: (gender: Gender) => void }) {
    const { data, loading, error, reload } = useOdesurApi<OdesurCompetitionView>(
        `view=competition&disc=${code}&gender=${gender}`,
    );

    return (
        <section className={styles.block} aria-labelledby="torneo-titulo">
            <div className={styles.blockHead}>
                <h3 id="torneo-titulo" className={styles.subTitle}>Torneo</h3>
                <div className={styles.segmented} role="radiogroup" aria-label="Rama">
                    {(['w', 'm'] as Gender[]).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={gender === value}
                            className={`${styles.segment} ${gender === value ? styles.segmentOn : ''}`}
                            onClick={() => onGender(value)}
                        >
                            {value === 'w' ? 'Femenino' : 'Masculino'}
                        </button>
                    ))}
                </div>
            </div>

            {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}
            {!data ? (
                loading ? <SkeletonRows count={4} label="Cargando el torneo..." /> : null
            ) : (
                <>
                    <div className={styles.competitionActions}>
                        <Link href={`/tournaments/${data.tournamentId}`} className={styles.moreLink}>
                            Fixture completo <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                        {/* El torneo sí se sigue con la cuenta, como cualquier torneo del sitio. */}
                        <FavoriteButton
                            entityType="league"
                            entityId={data.tournamentId}
                            name={data.name}
                            typeLabel="Torneo"
                            showLabel
                            size={15}
                        />
                    </div>
                    {data.standings.length ? (
                        <div className={styles.standingsGrid}>
                            {data.standings.map((group) => (
                                <div key={group.name} className={styles.tableWrap}>
                                    <table className={`${styles.table} ${styles.tableCompact}`}>
                                        <caption className={styles.groupCaption}>{group.name}</caption>
                                        <thead>
                                            <tr>
                                                <th scope="col" className={styles.thPos}>#</th>
                                                <th scope="col">País</th>
                                                <th scope="col" className={styles.thNum}><abbr title="Partidos jugados">PJ</abbr></th>
                                                <th scope="col" className={styles.thNum}><abbr title="Diferencia">Dif</abbr></th>
                                                <th scope="col" className={styles.thNum}><abbr title="Puntos">Pts</abbr></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.rows.map((row) => (
                                                <tr key={row.code || row.name}>
                                                    <td className={styles.posCell}>{row.position ?? '-'}</td>
                                                    <td>
                                                        <span className={styles.teamCell}>
                                                            <OdesurFlag code={row.code} name={row.name} size={22} />
                                                            <strong>{row.name}</strong>
                                                        </span>
                                                    </td>
                                                    <td className={styles.numCell}>{row.played ?? 0}</td>
                                                    <td className={styles.numCell}>
                                                        {row.diff !== null && row.diff > 0 ? `+${row.diff}` : (row.diff ?? 0)}
                                                    </td>
                                                    <td className={`${styles.numCell} ${styles.totalCell}`}>{row.points ?? 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={styles.hint}>Este torneo todavía no tiene zonas publicadas.</p>
                    )}
                </>
            )}
        </section>
    );
}

function Medallists({ items }: { items: OdesurMedallistView[] }) {
    const byEvent = useMemo(() => {
        const groups = new Map<string, OdesurMedallistView[]>();
        for (const item of items) {
            const list = groups.get(item.eventName) ?? [];
            list.push(item);
            groups.set(item.eventName, list);
        }
        return [...groups.entries()];
    }, [items]);

    return (
        <section className={styles.block} aria-labelledby="medallistas-titulo">
            <h3 id="medallistas-titulo" className={styles.subTitle}>Medallistas</h3>
            <ul className={styles.podiumList}>
                {byEvent.map(([eventName, podium]) => (
                    <li key={eventName} className={styles.podiumEvent}>
                        <p className={styles.podiumTitle}>{eventName}</p>
                        <ol className={styles.podium}>
                            {podium.map((item, index) => (
                                <li key={`${item.metal}-${item.name}-${index}`} className={styles.podiumRow}>
                                    <MedalDot metal={item.metal} label={`Medalla de ${METAL_WORD[item.metal]}`} />
                                    <OdesurFlag code={item.orgCode} name={item.orgName} size={20} />
                                    <span className={styles.podiumName}>
                                        {item.name}
                                        {item.isTeam ? null : <span className={styles.rankingOrg}>{item.orgName}</span>}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function SportDetail({
    code,
    day,
    today,
    onDay,
    onBack,
    gender,
    onGender,
    follows,
}: {
    code: string;
    day: string;
    today: string;
    onDay: (day: string) => void;
    onBack: () => void;
    gender: Gender;
    onGender: (gender: Gender) => void;
    follows: OdesurFollows;
}) {
    const query = `view=sport&disc=${code}${day ? `&day=${day}` : ''}&today=${today}`;
    const { data, loading, error, reload } = useOdesurApi<OdesurSportView>(query);
    const now = useNowIso();
    const stripRef = useRef<HTMLDivElement>(null);
    const selectedDay = data?.day || day;

    useEffect(() => {
        centerInScroller(stripRef.current, stripRef.current?.querySelector('[aria-checked="true"]') ?? null);
    }, [selectedDay]);

    const following = follows.sports.has(code);
    const team = isTeamSport(code);
    const shownDay = selectedDay;
    const medalRows = data?.medals?.rows ?? [];
    const hasAside = team || medalRows.length > 0 || (data?.medallists.length ?? 0) > 0;

    return (
        <div className={styles.stack}>
            <div className={styles.sportHead}>
                <button type="button" className={styles.backBtn} onClick={onBack}>
                    <ArrowLeft size={14} aria-hidden="true" />
                    Todos los deportes
                </button>
                <div className={styles.sportTitleRow}>
                    <h2 className={styles.sportTitle}>{data?.name ?? ' '}</h2>
                    <button
                        type="button"
                        className={`${styles.followToggle} ${following ? styles.followToggleOn : ''}`}
                        aria-pressed={following}
                        onClick={() => follows.toggleSport(code)}
                    >
                        <Star size={15} fill={following ? 'currentColor' : 'none'} aria-hidden="true" />
                        {following ? 'Siguiendo' : 'Seguir'}
                    </button>
                </div>
                {data ? (
                    <p className={styles.agendaSummary}>
                        {data.days.length
                            ? `Compite ${plural(data.days.length, 'día', 'días')}, del ${dayLabels(data.days[0]).number} al ${dayLabels(data.days[data.days.length - 1]).number} de septiembre.`
                            : 'La organización todavía no publicó sus días.'}
                    </p>
                ) : null}
            </div>

            {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

            {!data ? (
                loading ? <SkeletonRows count={6} label="Cargando el deporte..." /> : null
            ) : (
                <>
                    {data.days.length ? (
                        <div ref={stripRef} className={styles.dayStrip} role="radiogroup" aria-label={`Días de ${data.name}`}>
                            {data.days.map((value) => {
                                const labels = dayLabels(value);
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={shownDay === value}
                                        aria-label={`${labels.long}${value === today ? ', hoy' : ''}`}
                                        className={`${styles.dayBtn} ${styles.dayBtnSlim} ${shownDay === value ? styles.dayBtnOn : ''} ${value === today ? styles.dayBtnToday : ''}`}
                                        onClick={() => onDay(value)}
                                    >
                                        <span className={styles.dayWeek}>{value === today ? 'hoy' : labels.weekday}</span>
                                        <span className={styles.dayNum}>{labels.number}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}

                    <div className={`${styles.sportLayout} ${hasAside ? '' : styles.sportLayoutSingle}`}>
                        <section aria-labelledby="deporte-dia" className={styles.block}>
                            <h3 id="deporte-dia" className={styles.subTitle}>
                                {shownDay ? `${shownDay === today ? 'Hoy, ' : ''}${dayLabels(shownDay).long}` : 'Agenda'}
                            </h3>
                            {data.items.length ? (
                                <AgendaList items={data.items} follows={follows} showSport={false} nowIso={shownDay === today ? now : null} />
                            ) : (
                                <EmptyState title="No hay pruebas publicadas para este día." />
                            )}
                        </section>

                        {hasAside ? (
                            <aside className={styles.sportAside}>
                                {team ? <TeamCompetition code={code} gender={gender} onGender={onGender} /> : null}
                                {medalRows.length ? (
                                    <section className={styles.block} aria-labelledby="medallero-deporte">
                                        <h3 id="medallero-deporte" className={styles.subTitle}>Medallero</h3>
                                        <ol className={styles.miniList}>
                                            {medalRows.map((row) => (
                                                <li key={row.code} className={`${styles.miniRow} ${follows.orgs.has(row.code) ? styles.miniRowOn : ''}`}>
                                                    <span className={styles.miniPos}>{row.position}</span>
                                                    <OdesurFlag code={row.code} name={row.name} size={22} />
                                                    <span className={styles.miniName}>{row.name}</span>
                                                    <span className={styles.miniMetals}>
                                                        {METALS.map((metal) => (
                                                            <span key={metal.id} className={styles.miniMetal}>
                                                                <MedalDot metal={metal.id} />
                                                                <span className={styles.srOnly}>{metal.label}: </span>
                                                                {row[metal.id]}
                                                            </span>
                                                        ))}
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    </section>
                                ) : null}
                                {data.medallists.length ? <Medallists items={data.medallists} /> : null}
                            </aside>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
}

export default function SportsPanel(props: {
    days: string[];
    today: string;
    index: OdesurSportsIndexView | null;
    indexLoading: boolean;
    indexError: string | null;
    onRetryIndex: () => void;
    sport: string;
    sportDay: string;
    onOpenSport: (code: string, day?: string) => void;
    onBack: () => void;
    gender: Gender;
    onGender: (gender: Gender) => void;
    follows: OdesurFollows;
}) {
    if (props.sport) {
        return (
            <SportDetail
                key={props.sport}
                code={props.sport}
                day={props.sportDay}
                today={props.today}
                onDay={(day) => props.onOpenSport(props.sport, day)}
                onBack={props.onBack}
                gender={props.gender}
                onGender={props.onGender}
                follows={props.follows}
            />
        );
    }

    return (
        <SportsMatrix
            days={props.days}
            today={props.today}
            index={props.index}
            loading={props.indexLoading}
            error={props.indexError}
            onRetry={props.onRetryIndex}
            follows={props.follows}
            onOpenSport={props.onOpenSport}
        />
    );
}
