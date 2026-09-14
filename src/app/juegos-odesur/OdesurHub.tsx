'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Medal, RefreshCw } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import {
    ODESUR_DISCIPLINES,
    ODESUR_DISCIPLINE_CODES,
    odesurOrgIso2,
    type OdesurDisciplineCode,
} from '@/lib/services/odesur2026Parser';
import styles from './page.module.css';
import type {
    OdesurAgendaItemView,
    OdesurAgendaView,
    OdesurCompetitionView,
    OdesurMatchView,
    OdesurMedalTableView,
    OdesurMedallistView,
    OdesurMedalsView,
} from './types';

type View = 'medallero' | 'equipos' | 'agenda' | 'medallistas';
type Gender = 'm' | 'w';
type Metal = 'gold' | 'silver' | 'bronze';

const VIEWS: Array<{ id: View; label: string }> = [
    { id: 'medallero', label: 'Medallero' },
    { id: 'equipos', label: 'Deportes de equipo' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'medallistas', label: 'Medallistas' },
];

const METALS: Array<{ id: Metal; label: string }> = [
    { id: 'gold', label: 'Oro' },
    { id: 'silver', label: 'Plata' },
    { id: 'bronze', label: 'Bronce' },
];

/** Cada cuánto se refresca la pestaña abierta mientras la página está a la vista. */
const REFRESH_MS = 45_000;

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

// El huso es fijo (el de las sedes) para que el servidor y el cliente pinten la
// misma hora: con el del navegador, la hidratación no coincidiría fuera del país.
const timeFormat = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
});
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const weekdayFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const longDayFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function formatTime(iso: string | null): string {
    if (!iso) return '--:--';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '--:--' : timeFormat.format(date);
}

function dayKeyOf(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : dayKeyFormat.format(date);
}

/** "2026-09-15" -> { short: "mar 15", long: "martes, 15 de septiembre" }. */
function dayLabels(day: string) {
    const date = new Date(`${day}T12:00:00Z`);
    return {
        short: `${weekdayFormat.format(date).replace('.', '')} ${Number(day.slice(8, 10))}`,
        long: longDayFormat.format(date),
    };
}

function daysBetween(first: string, last: string): string[] {
    const days: string[] = [];
    const cursor = new Date(`${first}T12:00:00Z`);
    const end = new Date(`${last}T12:00:00Z`);
    while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

/**
 * La bandera de una delegación, con la misma regla que el servidor: la curada
 * del sitio cuando existe y, si no, la SVG por el código ISO. Así el medallero
 * de acá y el de Rankings muestran la misma bandera.
 */
function flagFor(code: string | null, name: string): string {
    const curated = getNationalTeamFlag(name);
    if (curated) return curated;
    const iso2 = odesurOrgIso2(code);
    return iso2 ? `/flags/${iso2}.svg` : '';
}

const STATE_LABELS: Record<string, string> = {
    scheduled: 'Programado',
    live: 'En juego',
    final: 'Final',
    postponed: 'Postergado',
    cancelled: 'Cancelado',
};

function StateChip({ state, minute }: { state: string; minute?: string | null }) {
    const tone = state === 'live' ? styles.chipLive : state === 'final' ? styles.chipFinal : styles.chipScheduled;
    return (
        <span className={`${styles.chip} ${tone}`}>
            {state === 'live' ? <span className={styles.liveDot} aria-hidden="true" /> : null}
            {state === 'live' && minute ? minute : (STATE_LABELS[state] || state)}
        </span>
    );
}

function Flag({ name, logo, size = 24 }: { name: string; logo: string; size?: number }) {
    return (
        <TeamLogo
            name={name}
            logoUrl={logo || null}
            className={styles.flag}
            size={size}
            title={`Bandera de ${name}`}
            disableLookup
        />
    );
}

function MedalDot({ metal }: { metal: Metal }) {
    return <span className={`${styles.medalDot} ${styles[`medal_${metal}`]}`} aria-hidden="true" />;
}

async function fetchView<T>(query: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api/odesur?${query}`, { signal, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(body && typeof body.error === 'string' ? body.error : 'No se pudo cargar.');
    }
    return body as T;
}

function replaceUrl(params: Record<string, string>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
    }
    const query = search.toString();
    // replaceState nativo: `router.push` re-renderiza el árbol entero y pierde
    // el scroll, y acá solo cambia lo que se está mirando.
    window.history.replaceState(window.history.state, '', query ? `?${query}` : window.location.pathname);
}

function isView(value: string): value is View {
    return VIEWS.some((view) => view.id === value);
}

function isDiscipline(value: string): value is OdesurDisciplineCode {
    return Boolean(ODESUR_DISCIPLINES[value as OdesurDisciplineCode]);
}

// --------------------------------------------------------------------------

export type OdesurHubProps = {
    firstDay: string;
    lastDay: string;
    today: string;
    initialView: string;
    initialDay: string;
    initialDiscipline: string;
    initialGender: Gender | '';
    initialMedals: OdesurMedalsView | null;
    initialAgenda: OdesurAgendaView | null;
};

export default function OdesurHub(props: OdesurHubProps) {
    const { firstDay, lastDay, today } = props;
    const days = useMemo(() => daysBetween(firstDay, lastDay), [firstDay, lastDay]);

    const [view, setView] = useState<View>(isView(props.initialView) ? props.initialView : 'medallero');
    const [day, setDay] = useState(props.initialDay);
    const requestedDiscipline = props.initialDiscipline.toUpperCase();
    const [discipline, setDiscipline] = useState<OdesurDisciplineCode>(
        isDiscipline(requestedDiscipline) ? requestedDiscipline : 'HOC',
    );
    const [gender, setGender] = useState<Gender>(props.initialGender || 'w');

    const [medals, setMedals] = useState<OdesurMedalsView | null>(props.initialMedals);
    const [agendas, setAgendas] = useState<Record<string, OdesurAgendaView>>(
        props.initialAgenda ? { [props.initialAgenda.day]: props.initialAgenda } : {},
    );
    const [competitions, setCompetitions] = useState<Record<string, OdesurCompetitionView>>({});
    const [medallists, setMedallists] = useState<Record<string, OdesurMedallistView[]>>({});
    const [medallistDiscipline, setMedallistDiscipline] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);

    const competitionKey = `${discipline}-${gender}`;
    const medalDisciplines = useMemo(() => medals?.byDiscipline ?? [], [medals]);
    const activeMedallistDiscipline = medallistDiscipline || medalDisciplines[0]?.discipline || '';

    // La URL dice qué se está mirando, para compartirlo y para sobrevivir a un F5.
    useEffect(() => {
        replaceUrl({
            vista: view === 'medallero' ? '' : view,
            dia: view === 'agenda' ? day : '',
            deporte: view === 'equipos' ? discipline.toLowerCase() : '',
            rama: view === 'equipos' ? gender : '',
        });
    }, [view, day, discipline, gender]);

    /** Qué pedir para la vista abierta; vacío si ya está y no se fuerza. */
    const queryFor = useCallback((force: boolean): string => {
        if (view === 'medallero') return force || !medals ? 'view=medals' : '';
        if (view === 'medallistas') {
            if (!medals) return 'view=medals';
            if (activeMedallistDiscipline && (force || !medallists[activeMedallistDiscipline])) {
                return `view=medallists&disc=${activeMedallistDiscipline}`;
            }
            return '';
        }
        if (view === 'agenda') return force || !agendas[day] ? `view=agenda&day=${day}` : '';
        return force || !competitions[competitionKey] ? `view=competition&disc=${discipline}&gender=${gender}` : '';
    }, [view, medals, activeMedallistDiscipline, medallists, agendas, day, competitions, competitionKey, discipline, gender]);

    const load = useCallback(async (force: boolean) => {
        const query = queryFor(force);
        if (!query) return;

        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        // Un refresco en segundo plano no pone "Cargando": la tabla ya está.
        if (!force) setLoading(true);
        setError(null);

        try {
            if (query === 'view=medals') {
                setMedals(await fetchView<OdesurMedalsView>(query, controller.signal));
            } else if (query.startsWith('view=agenda')) {
                const data = await fetchView<OdesurAgendaView>(query, controller.signal);
                setAgendas((current) => ({ ...current, [data.day]: data }));
            } else if (query.startsWith('view=competition')) {
                const key = competitionKey;
                const data = await fetchView<OdesurCompetitionView>(query, controller.signal);
                setCompetitions((current) => ({ ...current, [key]: data }));
            } else if (query.startsWith('view=medallists')) {
                const code = activeMedallistDiscipline;
                const data = await fetchView<{ items: OdesurMedallistView[] }>(query, controller.signal);
                setMedallists((current) => ({ ...current, [code]: data.items }));
            }
        } catch (loadError) {
            if ((loadError as Error).name === 'AbortError') return;
            setError((loadError as Error).message || 'No se pudo cargar.');
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setLoading(false);
            }
        }
    }, [queryFor, competitionKey, activeMedallistDiscipline]);

    useEffect(() => {
        void load(false);
    }, [load]);

    // Refresco de la pestaña abierta, solo con la página a la vista: un
    // teléfono en el bolsillo no tiene por qué pedirle nada a nadie.
    const loadRef = useRef(load);
    useEffect(() => {
        loadRef.current = load;
    }, [load]);
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') void loadRef.current(true);
        }, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, []);

    const dayNumber = days.indexOf(today) + 1;
    const liveNow = (agendas[today]?.items ?? []).filter((item) => item.state === 'live').length;

    return (
        <div className={styles.page}>
            <div className="container">
                <header className={styles.header}>
                    <p className={styles.kicker}>Juegos ODESUR</p>
                    <h1 className={styles.title}>Juegos Suramericanos Santa Fe 2026</h1>
                    <p className={styles.lead}>
                        Del 13 al 26 de septiembre en Santa Fe, Rosario y Rafaela. 60 deportes y 15 delegaciones.
                    </p>
                    <ul className={styles.meta} aria-label="Datos de los Juegos">
                        {dayNumber > 0 ? <li>Día {dayNumber} de {days.length}</li> : null}
                        {liveNow > 0 ? (
                            <li className={styles.metaLive}>
                                <span className={styles.liveDot} aria-hidden="true" />
                                {liveNow} {liveNow === 1 ? 'prueba en juego' : 'pruebas en juego'}
                            </li>
                        ) : null}
                        <li>Horarios de Argentina</li>
                    </ul>
                </header>

                <div className={styles.tabs} role="tablist" aria-label="Secciones de los Juegos">
                    {VIEWS.map((item) => (
                        <button
                            key={item.id}
                            id={`tab-${item.id}`}
                            type="button"
                            role="tab"
                            aria-selected={view === item.id}
                            aria-controls={`panel-${item.id}`}
                            className={`${styles.tab} ${view === item.id ? styles.tabActive : ''}`}
                            onClick={() => setView(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {error ? (
                    <div className={styles.errorState} role="alert">
                        <AlertCircle size={16} aria-hidden="true" />
                        <span>{error}</span>
                        <button type="button" className={styles.linkBtn} onClick={() => void load(true)}>
                            Reintentar
                        </button>
                    </div>
                ) : null}

                <section id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className={styles.panel}>
                    {view === 'medallero' ? <MedalsPanel medals={medals} loading={loading} /> : null}

                    {view === 'equipos' ? (
                        <TeamSportsPanel
                            discipline={discipline}
                            gender={gender}
                            onDiscipline={setDiscipline}
                            onGender={setGender}
                            competition={competitions[competitionKey] ?? null}
                            loading={loading}
                        />
                    ) : null}

                    {view === 'agenda' ? (
                        <AgendaPanel
                            days={days}
                            day={day}
                            today={today}
                            onDay={setDay}
                            agenda={agendas[day] ?? null}
                            loading={loading}
                        />
                    ) : null}

                    {view === 'medallistas' ? (
                        <MedallistsPanel
                            disciplines={medalDisciplines}
                            discipline={activeMedallistDiscipline}
                            onDiscipline={setMedallistDiscipline}
                            items={medallists[activeMedallistDiscipline] ?? null}
                            loading={loading}
                        />
                    ) : null}
                </section>
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// Piezas comunes
// --------------------------------------------------------------------------

function LoadingState({ label }: { label: string }) {
    return (
        <div className={styles.inlineState}>
            <RefreshCw size={16} className={styles.spin} aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

function EmptyState({ children }: { children: ReactNode }) {
    return (
        <div className={styles.inlineState}>
            <Medal size={16} aria-hidden="true" />
            <span>{children}</span>
        </div>
    );
}

// --------------------------------------------------------------------------
// Medallero
// --------------------------------------------------------------------------

function MedalTable({ table, caption, highlight }: { table: OdesurMedalTableView; caption: string; highlight?: string }) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <caption className={styles.srOnly}>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col" className={styles.thPos}>Pos</th>
                        <th scope="col">Delegación</th>
                        {METALS.map((metal) => (
                            <th key={metal.id} scope="col" className={styles.thNum}>
                                <MedalDot metal={metal.id} />
                                <span className={styles.thMetalLabel}>{metal.label}</span>
                            </th>
                        ))}
                        <th scope="col" className={styles.thNum}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map((row) => (
                        <tr key={row.code} className={row.code === highlight ? styles.rowHighlight : undefined}>
                            <td className={styles.posCell}>{row.position}</td>
                            <td>
                                <span className={styles.teamCell}>
                                    <Flag name={row.name} logo={flagFor(row.code, row.name)} />
                                    <strong>{row.name}</strong>
                                </span>
                            </td>
                            <td className={styles.numCell}>{row.gold}</td>
                            <td className={styles.numCell}>{row.silver}</td>
                            <td className={styles.numCell}>{row.bronze}</td>
                            <td className={`${styles.numCell} ${styles.totalCell}`}>{row.total}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function MedalsPanel({ medals, loading }: { medals: OdesurMedalsView | null; loading: boolean }) {
    if (!medals) return loading ? <LoadingState label="Cargando el medallero..." /> : null;

    const { general, byDiscipline, latest } = medals;
    const argentina = general.rows.find((row) => row.code === 'ARG');

    return (
        <div className={styles.stack}>
            <div className={styles.argCard}>
                <Flag name="Argentina" logo={flagFor('ARG', 'Argentina')} size={36} />
                {argentina ? (
                    <p>
                        <strong>Argentina, {argentina.position}° en el medallero.</strong>{' '}
                        {argentina.gold} de oro, {argentina.silver} de plata y {argentina.bronze} de bronce.
                    </p>
                ) : (
                    <p><strong>Argentina todavía no ganó medallas.</strong> El medallero se mueve con cada final.</p>
                )}
            </div>

            <section aria-labelledby="medallero-general" className={styles.block}>
                <div className={styles.blockHead}>
                    <h2 id="medallero-general" className={styles.sectionTitle}>Medallero general</h2>
                    <Link href="/rankings?sport=rugby&ranking=odesur-2026-medallero" className={styles.moreLink}>
                        Ver en Rankings <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                </div>
                {general.rows.length ? (
                    <MedalTable table={general} caption="Medallero general de los Juegos" highlight="ARG" />
                ) : (
                    <EmptyState>Todavía no se entregaron medallas.</EmptyState>
                )}
            </section>

            {latest.length ? (
                <section aria-labelledby="ultimas-medallas" className={styles.block}>
                    <h2 id="ultimas-medallas" className={styles.sectionTitle}>Últimas medallas</h2>
                    <ul className={styles.latestList}>
                        {latest.slice(0, 12).map((item, index) => (
                            <li key={`${item.eventName}-${item.metal}-${item.name}-${index}`} className={styles.latestRow}>
                                <MedalDot metal={item.metal} />
                                <Flag name={item.orgName} logo={flagFor(item.orgCode, item.orgName)} size={20} />
                                <span className={styles.latestCopy}>
                                    <strong>{item.name}</strong>
                                    <span>{item.disciplineName} · {item.eventName}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {byDiscipline.length ? (
                <section aria-labelledby="medallero-deportes" className={styles.block}>
                    <h2 id="medallero-deportes" className={styles.sectionTitle}>Por deporte</h2>
                    <div className={styles.cardGrid}>
                        {byDiscipline.map((table) => (
                            <article key={table.discipline} className={styles.card}>
                                <h3 className={styles.cardTitle}>{table.disciplineName}</h3>
                                <ol className={styles.miniList}>
                                    {table.rows.map((row) => (
                                        <li key={row.code} className={styles.miniRow}>
                                            <span className={styles.miniPos}>{row.position}</span>
                                            <Flag name={row.name} logo={flagFor(row.code, row.name)} size={18} />
                                            <span className={styles.miniName}>{row.name}</span>
                                            <span className={styles.miniMetals}>
                                                {METALS.map((metal) => (
                                                    <span key={metal.id} className={styles.miniMetal} title={`${metal.label}: ${row[metal.id]}`}>
                                                        <MedalDot metal={metal.id} />
                                                        <span className={styles.srOnly}>{metal.label}: </span>
                                                        {row[metal.id]}
                                                    </span>
                                                ))}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

// --------------------------------------------------------------------------
// Deportes de equipo
// --------------------------------------------------------------------------

function MatchRow({ match }: { match: OdesurMatchView }) {
    const played = match.status === 'final' || match.status === 'live';
    const homeScore = match.home.score ?? 0;
    const awayScore = match.away.score ?? 0;
    const homeWon = match.status === 'final' && homeScore > awayScore;
    const awayWon = match.status === 'final' && awayScore > homeScore;

    return (
        <Link href={`/matches/${match.id}`} className={styles.matchRow}>
            <span className={styles.matchTime}>
                {formatTime(match.startsAt)}
                <StateChip state={match.status} minute={match.minute} />
            </span>
            <span className={styles.matchTeams}>
                <span className={`${styles.matchSide} ${homeWon ? styles.winner : ''}`}>
                    <Flag name={match.home.name} logo={match.home.logo} size={20} />
                    <span className={styles.matchName}>{match.home.name}</span>
                    <span className={styles.matchScore}>{played ? (match.home.score ?? '-') : ''}</span>
                </span>
                <span className={`${styles.matchSide} ${awayWon ? styles.winner : ''}`}>
                    <Flag name={match.away.name} logo={match.away.logo} size={20} />
                    <span className={styles.matchName}>{match.away.name}</span>
                    <span className={styles.matchScore}>{played ? (match.away.score ?? '-') : ''}</span>
                </span>
            </span>
            <span className={styles.matchStage}>{match.stage}</span>
        </Link>
    );
}

function TeamSportsPanel(props: {
    discipline: OdesurDisciplineCode;
    gender: Gender;
    onDiscipline: (code: OdesurDisciplineCode) => void;
    onGender: (gender: Gender) => void;
    competition: OdesurCompetitionView | null;
    loading: boolean;
}) {
    const { discipline, gender, competition, loading } = props;

    const byDay = useMemo(() => {
        const groups = new Map<string, OdesurMatchView[]>();
        for (const match of competition?.matches ?? []) {
            const key = dayKeyOf(match.startsAt);
            const list = groups.get(key) ?? [];
            list.push(match);
            groups.set(key, list);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [competition]);

    return (
        <div className={styles.stack}>
            <div className={styles.pickers}>
                <div className={styles.pills} role="radiogroup" aria-label="Deporte">
                    {ODESUR_DISCIPLINE_CODES.map((code) => (
                        <button
                            key={code}
                            type="button"
                            role="radio"
                            aria-checked={discipline === code}
                            className={`${styles.pill} ${discipline === code ? styles.pillActive : ''}`}
                            onClick={() => props.onDiscipline(code)}
                        >
                            {ODESUR_DISCIPLINES[code].nameEs}
                        </button>
                    ))}
                </div>
                <div className={styles.pills} role="radiogroup" aria-label="Rama">
                    {(['w', 'm'] as Gender[]).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={gender === value}
                            className={`${styles.pill} ${styles.pillSmall} ${gender === value ? styles.pillActive : ''}`}
                            onClick={() => props.onGender(value)}
                        >
                            {value === 'w' ? 'Femenino' : 'Masculino'}
                        </button>
                    ))}
                </div>
            </div>

            {!competition ? (
                loading ? <LoadingState label="Cargando el torneo..." /> : null
            ) : (
                <>
                    <div className={styles.blockHead}>
                        <h2 className={styles.sectionTitle}>{competition.name}</h2>
                        <Link href={`/tournaments/${competition.tournamentId}`} className={styles.moreLink}>
                            Abrir el torneo <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                    </div>

                    {competition.standings.length ? (
                        <section aria-labelledby="zonas-titulo" className={styles.block}>
                            <h3 id="zonas-titulo" className={styles.subTitle}>Posiciones</h3>
                            <div className={styles.cardGrid}>
                                {competition.standings.map((group) => (
                                    <div key={group.name} className={styles.tableWrap}>
                                        <table className={styles.table}>
                                            <caption className={styles.groupCaption}>{group.name}</caption>
                                            <thead>
                                                <tr>
                                                    <th scope="col" className={styles.thPos}>#</th>
                                                    <th scope="col">Selección</th>
                                                    <th scope="col" className={styles.thNum}><abbr title="Partidos jugados">PJ</abbr></th>
                                                    <th scope="col" className={styles.thNum}><abbr title="Ganados">G</abbr></th>
                                                    <th scope="col" className={styles.thNum}><abbr title="Perdidos">P</abbr></th>
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
                                                                <Flag name={row.name} logo={row.flag} size={20} />
                                                                <strong>{row.name}</strong>
                                                            </span>
                                                        </td>
                                                        <td className={styles.numCell}>{row.played ?? 0}</td>
                                                        <td className={styles.numCell}>{row.won ?? 0}</td>
                                                        <td className={styles.numCell}>{row.lost ?? 0}</td>
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
                        </section>
                    ) : null}

                    <section aria-labelledby="partidos-titulo" className={styles.block}>
                        <h3 id="partidos-titulo" className={styles.subTitle}>Partidos</h3>
                        {byDay.length ? (
                            <div className={styles.stack}>
                                {byDay.map(([key, matches]) => (
                                    <div key={key || 'sin-fecha'} className={styles.dayGroup}>
                                        <h4 className={styles.dayTitle}>{key ? dayLabels(key).long : 'Sin fecha'}</h4>
                                        <div className={styles.matchList}>
                                            {matches.map((match) => <MatchRow key={match.id} match={match} />)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState>
                                La organización todavía no confirmó los cruces de este torneo. Aparecen acá en cuanto los publique.
                            </EmptyState>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

// --------------------------------------------------------------------------
// Agenda
// --------------------------------------------------------------------------

type AgendaFilter = 'todo' | 'vivo' | 'medallas';

const AGENDA_FILTERS: Array<[AgendaFilter, string]> = [
    ['todo', 'Todo'],
    ['vivo', 'En juego'],
    ['medallas', 'Con medalla'],
];

function AgendaPanel(props: {
    days: string[];
    day: string;
    today: string;
    onDay: (day: string) => void;
    agenda: OdesurAgendaView | null;
    loading: boolean;
}) {
    const { days, day, today, agenda, loading } = props;
    const [filter, setFilter] = useState<AgendaFilter>('todo');

    const grouped = useMemo(() => {
        const items = (agenda?.items ?? []).filter((item) => (
            filter === 'todo' || (filter === 'vivo' ? item.state === 'live' : item.medal)
        ));
        const groups = new Map<string, OdesurAgendaItemView[]>();
        for (const item of items) {
            const list = groups.get(item.disciplineName) ?? [];
            list.push(item);
            groups.set(item.disciplineName, list);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
    }, [agenda, filter]);

    return (
        <div className={styles.stack}>
            <div className={styles.dayStrip} role="radiogroup" aria-label="Día de los Juegos">
                {days.map((value) => {
                    const labels = dayLabels(value);
                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={day === value}
                            aria-label={labels.long}
                            className={`${styles.dayPill} ${day === value ? styles.pillActive : ''} ${value === today ? styles.dayToday : ''}`}
                            onClick={() => props.onDay(value)}
                        >
                            {labels.short}
                        </button>
                    );
                })}
            </div>

            <div className={styles.pills} role="radiogroup" aria-label="Filtro de la agenda">
                {AGENDA_FILTERS.map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={filter === value}
                        className={`${styles.pill} ${styles.pillSmall} ${filter === value ? styles.pillActive : ''}`}
                        onClick={() => setFilter(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <h2 className={styles.sectionTitle}>Agenda del {dayLabels(day).long}</h2>

            {!agenda ? (
                loading ? <LoadingState label="Cargando la agenda..." /> : null
            ) : grouped.length === 0 ? (
                <EmptyState>
                    {filter === 'vivo'
                        ? 'No hay nada en juego en este momento.'
                        : filter === 'medallas'
                            ? 'Este día no se reparten medallas.'
                            : 'No hay actividad este día.'}
                </EmptyState>
            ) : (
                <div className={styles.cardGrid}>
                    {grouped.map(([name, items]) => (
                        <article key={name} className={styles.card}>
                            <h3 className={styles.cardTitle}>
                                {name}
                                <span className={styles.cardCount}>{items.length}</span>
                            </h3>
                            <ul className={styles.agendaList}>
                                {items.map((item, index) => {
                                    const content = (
                                        <>
                                            <span className={styles.agendaTime}>{formatTime(item.startsAtIso)}</span>
                                            <span className={styles.agendaCopy}>
                                                <strong>
                                                    {item.medal ? (
                                                        <span className={styles.medalTag} title="Reparte medallas">
                                                            <MedalDot metal="gold" />
                                                            <span className={styles.srOnly}>Reparte medallas. </span>
                                                        </span>
                                                    ) : null}
                                                    {item.eventName}
                                                </strong>
                                                <span>{[item.phaseName, item.unitName].filter(Boolean).join(' · ')}</span>
                                            </span>
                                            <StateChip state={item.state} />
                                        </>
                                    );
                                    return (
                                        <li key={`${item.key}-${index}`}>
                                            {item.matchId ? (
                                                <Link href={`/matches/${item.matchId}`} className={`${styles.agendaRow} ${styles.agendaLink}`}>
                                                    {content}
                                                </Link>
                                            ) : (
                                                <div className={styles.agendaRow}>{content}</div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

// --------------------------------------------------------------------------
// Medallistas
// --------------------------------------------------------------------------

function MedallistsPanel(props: {
    disciplines: OdesurMedalTableView[];
    discipline: string;
    onDiscipline: (code: string) => void;
    items: OdesurMedallistView[] | null;
    loading: boolean;
}) {
    const { disciplines, discipline, items, loading } = props;

    const byEvent = useMemo(() => {
        const groups = new Map<string, OdesurMedallistView[]>();
        for (const item of items ?? []) {
            const list = groups.get(item.eventName) ?? [];
            list.push(item);
            groups.set(item.eventName, list);
        }
        return [...groups.entries()];
    }, [items]);

    if (disciplines.length === 0) {
        return loading ? <LoadingState label="Cargando..." /> : <EmptyState>Todavía no se entregaron medallas.</EmptyState>;
    }

    return (
        <div className={styles.stack}>
            <div className={styles.selectRow}>
                <label htmlFor="medallistas-deporte" className={styles.selectLabel}>Deporte</label>
                <select
                    id="medallistas-deporte"
                    className={styles.select}
                    value={discipline}
                    onChange={(event) => props.onDiscipline(event.target.value)}
                >
                    {disciplines.map((table) => (
                        <option key={table.discipline} value={table.discipline}>{table.disciplineName}</option>
                    ))}
                </select>
            </div>

            {!items ? (
                loading ? <LoadingState label="Cargando los medallistas..." /> : null
            ) : byEvent.length === 0 ? (
                <EmptyState>Todavía no se entregaron medallas en este deporte.</EmptyState>
            ) : (
                <div className={styles.cardGrid}>
                    {byEvent.map(([eventName, podium]) => (
                        <article key={eventName} className={styles.card}>
                            <h3 className={styles.cardTitle}>{eventName}</h3>
                            <ol className={styles.podium}>
                                {podium.map((item, index) => (
                                    <li key={`${item.metal}-${item.name}-${index}`} className={styles.podiumRow}>
                                        <MedalDot metal={item.metal} />
                                        <Flag name={item.orgName} logo={item.flag || flagFor(item.orgCode, item.orgName)} size={20} />
                                        <span className={styles.latestCopy}>
                                            <strong>{item.name}</strong>
                                            {item.isTeam ? null : <span>{item.orgName}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
