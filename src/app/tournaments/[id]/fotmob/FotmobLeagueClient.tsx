'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { APP_TIMEZONE } from '@/lib/timezone';
import { useBannerColor } from '../useBannerColor';
import styles from './fotmob.module.css';

type StandingRow = {
    id: string;
    position: number | null;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    scored: number;
    conceded: number;
    phase_id: string | null;
    group_id: string | null;
    club?: { name?: string; short_name?: string; logo_url?: string | null } | null;
    stats?: { team_name?: string; team_logo?: string | null } | null;
};

type TeamRef = { name?: string; short_name?: string; logo_url?: string | null } | null;

type MatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: { home?: number | null; away?: number | null } | null;
    round_label?: string | null;
    venue?: string | null;
    home?: TeamRef;
    away?: TeamRef;
    home_source_label?: string | null;
    away_source_label?: string | null;
};

type TournamentData = {
    tournament: { name: string; display_name?: string | null; logo_url?: string | null; primary_color?: string | null; country_name?: string | null; season_id?: string | null };
    standings: StandingRow[];
    matches?: MatchRow[];
    phases?: { id: string; name: string }[];
};

type View = 'short' | 'full';
type Tab = 'summary' | 'table' | 'results' | 'fixtures';

const TABS: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Resumen' },
    { key: 'table', label: 'Tabla' },
    { key: 'results', label: 'Resultados' },
    { key: 'fixtures', label: 'Fixture' },
];

function dayKey(iso: string | null): string {
    if (!iso) return 'sin-fecha';
    return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date(iso));
}

function dayLabel(iso: string | null): string {
    if (!iso) return 'Fecha a confirmar';
    const label = new Intl.DateTimeFormat('es-AR', {
        timeZone: APP_TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(iso));
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function timeLabel(iso: string | null): string {
    if (!iso) return '--:--';
    return new Intl.DateTimeFormat('es-AR', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function MatchList({ matches, kind, empty }: { matches: MatchRow[]; kind: 'results' | 'fixtures'; empty: string }) {
    const groups = useMemo(() => {
        const sorted = [...matches].sort((a, b) => {
            const diff = (a.date_time ?? '').localeCompare(b.date_time ?? '');
            return kind === 'results' ? -diff : diff;
        });
        const out: { key: string; label: string; items: MatchRow[] }[] = [];
        for (const m of sorted) {
            const key = dayKey(m.date_time);
            const last = out[out.length - 1];
            if (last && last.key === key) last.items.push(m);
            else out.push({ key, label: dayLabel(m.date_time), items: [m] });
        }
        return out;
    }, [matches, kind]);

    if (!groups.length) return <div className={`${styles.card} ${styles.empty}`}>{empty}</div>;

    return (
        <>
            {groups.map((g) => (
                <section key={g.key} className={styles.day}>
                    <h2 className={styles.dayTitle}>{g.label}</h2>
                    <div className={styles.card}>
                        {g.items.map((m) => {
                            const home = m.home?.short_name || m.home?.name || m.home_source_label || 'A definir';
                            const away = m.away?.short_name || m.away?.name || m.away_source_label || 'A definir';
                            const played = kind === 'results';
                            return (
                                <div key={m.id} className={styles.match}>
                                    <span className={`${styles.side} ${styles.sideHome}`}>
                                        <span className={styles.teamName}>{home}</span>
                                        <Crest src={m.home?.logo_url} />
                                    </span>
                                    <span className={played ? styles.score : styles.kick}>
                                        {played ? `${m.score?.home ?? '-'} - ${m.score?.away ?? '-'}` : timeLabel(m.date_time)}
                                    </span>
                                    <span className={styles.side}>
                                        <Crest src={m.away?.logo_url} />
                                        <span className={styles.teamName}>{away}</span>
                                    </span>
                                    {m.round_label ? <span className={styles.round}>{m.round_label}</span> : null}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </>
    );
}

function teamName(t: TeamRef | undefined, source?: string | null) {
    return t?.short_name || t?.name || source || 'A definir';
}

// Resumen estilo FotMob: próximo partido, quién va arriba y lo último que pasó.
function Summary({ matches, leaders, onOpen }: { matches: MatchRow[]; leaders: StandingRow[]; onOpen: (tab: Tab) => void }) {
    const next = useMemo(
        () => matches
            .filter((m) => m.status !== 'final' && m.date_time)
            .sort((a, b) => (a.date_time ?? '').localeCompare(b.date_time ?? ''))[0],
        [matches],
    );
    const recent = useMemo(
        () => matches
            .filter((m) => m.status === 'final')
            .sort((a, b) => (b.date_time ?? '').localeCompare(a.date_time ?? ''))
            .slice(0, 3),
        [matches],
    );

    return (
        <>
            <section className={styles.panel}>
                <h2 className={styles.panelTitle}>Próximo partido</h2>
                {next ? (
                    <div className={styles.nextMatch}>
                        <div className={styles.nextMeta}>
                            <span>{dayLabel(next.date_time)}</span>
                            {next.round_label ? <span className={styles.pill}>{next.round_label}</span> : null}
                        </div>
                        <div className={styles.match}>
                            <span className={`${styles.side} ${styles.sideHome}`}>
                                <span className={styles.teamName}>{teamName(next.home, next.home_source_label)}</span>
                                <Crest src={next.home?.logo_url} />
                            </span>
                            <span className={styles.kick}>{timeLabel(next.date_time)}</span>
                            <span className={styles.side}>
                                <Crest src={next.away?.logo_url} />
                                <span className={styles.teamName}>{teamName(next.away, next.away_source_label)}</span>
                            </span>
                        </div>
                    </div>
                ) : (
                    <p className={styles.panelEmpty}>No quedan partidos programados.</p>
                )}
            </section>

            {leaders.length > 0 ? (
                <section className={styles.panel}>
                    <h2 className={styles.panelTitle}>Arriba en la tabla</h2>
                    {leaders.map((r) => {
                        const name = r.club?.short_name || r.club?.name || r.stats?.team_name || 'Club';
                        return (
                            <div key={r.id} className={styles.leader}>
                                <span className={styles.leaderPos}>{r.position}</span>
                                <Crest src={r.club?.logo_url || r.stats?.team_logo} />
                                <span className={styles.leaderName}>{name}</span>
                                <span className={styles.leaderPts}>{r.points} pts</span>
                            </div>
                        );
                    })}
                    <button type="button" className={styles.more} onClick={() => onOpen('table')}>Ver tabla completa</button>
                </section>
            ) : null}

            {recent.length > 0 ? (
                <section className={styles.panel}>
                    <h2 className={styles.panelTitle}>Últimos resultados</h2>
                    {recent.map((m) => (
                        <div key={m.id} className={styles.match}>
                            <span className={`${styles.side} ${styles.sideHome}`}>
                                <span className={styles.teamName}>{teamName(m.home, m.home_source_label)}</span>
                                <Crest src={m.home?.logo_url} />
                            </span>
                            <span className={styles.score}>{m.score?.home ?? '-'} - {m.score?.away ?? '-'}</span>
                            <span className={styles.side}>
                                <Crest src={m.away?.logo_url} />
                                <span className={styles.teamName}>{teamName(m.away, m.away_source_label)}</span>
                            </span>
                        </div>
                    ))}
                    <button type="button" className={styles.more} onClick={() => onOpen('results')}>Ver todos los resultados</button>
                </section>
            ) : null}
        </>
    );
}

function Crest({ src }: { src?: string | null }) {
    return src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className={styles.teamLogo} />
    ) : (
        <span className={styles.teamLogo} aria-hidden="true" />
    );
}

export default function FotmobLeagueClient({ id }: { id: string }) {
    const [data, setData] = useState<TournamentData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [phaseId, setPhaseId] = useState<string | null>(null);
    const [view, setView] = useState<View>('full');
    const [following, setFollowing] = useState(false);
    const [tab, setTab] = useState<Tab>('summary');

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/db/tournaments/${encodeURIComponent(id)}/data`, { signal: controller.signal })
            .then((res) => res.json())
            .then((json) => {
                if (!json?.ok) throw new Error('No se pudo cargar el torneo.');
                setData(json as TournamentData);
            })
            .catch((err) => {
                if (err?.name !== 'AbortError') setError('No se pudo cargar el torneo.');
            });
        return () => controller.abort();
    }, [id]);

    const hue = useBannerColor(data?.tournament.primary_color, data?.tournament.logo_url);

    const phases = useMemo(() => {
        if (!data) return [];
        const withRows = new Set<string>();
        for (const row of data.standings) {
            if (row.phase_id) withRows.add(row.phase_id);
        }
        return (data.phases ?? []).filter((p) => withRows.has(p.id));
    }, [data]);

    const activePhase = phaseId ?? phases[0]?.id ?? null;

    const rows = useMemo(() => {
        if (!data) return [];
        return data.standings
            .filter((r) => !activePhase || r.phase_id === activePhase)
            .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    }, [data, activePhase]);

    if (error) return <main className={styles.state}>{error}</main>;
    if (!data) return <main className={styles.state}>Cargando…</main>;

    const t = data.tournament;
    const title = t.display_name || t.name;
    const sub = [t.country_name, t.season_id].filter(Boolean).join(' · ');
    const full = view === 'full';
    const base = `/tournaments/${encodeURIComponent(id)}`;

    return (
        <main className={styles.screen} style={{ ['--hue' as string]: hue }}>
            <header className={styles.hero}>
                <div className={styles.bar}>
                    <Link href={base} className={styles.iconBtn} aria-label="Volver al torneo">‹</Link>
                    <div className={styles.barRight}>
                        <button type="button" className={styles.iconBtn} aria-label="Activar avisos">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
                                <path d="M10 20a2 2 0 0 0 4 0" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className={`${styles.follow} ${following ? styles.following : ''}`}
                            aria-pressed={following}
                            onClick={() => setFollowing((v) => !v)}
                        >
                            {following ? 'Siguiendo' : 'Seguir'}
                        </button>
                    </div>
                </div>

                <div className={styles.identity}>
                    {t.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logo_url} alt="" className={styles.crest} />
                    ) : (
                        <div className={styles.crest} aria-hidden="true" />
                    )}
                    <div>
                        <h1 className={styles.title}>{title}</h1>
                        {sub ? <p className={styles.sub}>{sub}</p> : null}
                    </div>
                </div>

                <nav className={styles.tabs} aria-label="Secciones del torneo">
                    {TABS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`${styles.tab} ${tab === item.key ? styles.tabOn : ''}`}
                            aria-current={tab === item.key ? 'page' : undefined}
                            onClick={() => setTab(item.key)}
                        >
                            {item.label}
                        </button>
                    ))}
                    <Link href={`${base}?tab=stats`} className={styles.tab}>Estadísticas</Link>
                </nav>
            </header>

            <section className={styles.body}>
                {tab === 'summary' ? (
                    <Summary
                        matches={data.matches ?? []}
                        leaders={rows.slice(0, 3)}
                        onOpen={setTab}
                    />
                ) : null}
                {tab === 'results' ? (
                    <MatchList
                        kind="results"
                        matches={(data.matches ?? []).filter((m) => m.status === 'final')}
                        empty="Todavía no hay resultados cargados."
                    />
                ) : null}
                {tab === 'fixtures' ? (
                    <MatchList
                        kind="fixtures"
                        matches={(data.matches ?? []).filter((m) => m.status !== 'final')}
                        empty="No quedan partidos por jugar."
                    />
                ) : null}
                {tab === 'table' ? <>
                <div className={styles.controls}>
                    <div className={styles.segment} role="radiogroup" aria-label="Vista de la tabla">
                        {(['short', 'full'] as View[]).map((v) => (
                            <button
                                key={v}
                                type="button"
                                role="radio"
                                aria-checked={view === v}
                                className={`${styles.seg} ${view === v ? styles.segOn : ''}`}
                                onClick={() => setView(v)}
                            >
                                {v === 'short' ? 'Corta' : 'Completa'}
                            </button>
                        ))}
                    </div>
                    {phases.length > 1 ? (
                        <select
                            className={styles.select}
                            aria-label="Fase"
                            value={activePhase ?? ''}
                            onChange={(e) => setPhaseId(e.target.value)}
                        >
                            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    ) : null}
                </div>

                <div className={styles.card}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.pos}>#</th>
                                <th className={styles.team}>Club</th>
                                <th>PJ</th>
                                {full ? <><th>G</th><th>E</th><th>P</th><th>+/-</th></> : null}
                                <th>DIF</th>
                                <th className={styles.pts}>PTS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => {
                                const name = r.club?.short_name || r.club?.name || r.stats?.team_name || 'Club';
                                const logo = r.club?.logo_url || r.stats?.team_logo || null;
                                const diff = r.scored - r.conceded;
                                return (
                                    <tr key={r.id}>
                                        <td className={styles.pos}>{r.position ?? i + 1}</td>
                                        <td className={styles.team}>
                                            <span className={styles.teamCell}>
                                                {logo ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={logo} alt="" loading="lazy" className={styles.teamLogo} />
                                                ) : (
                                                    <span className={styles.teamLogo} aria-hidden="true" />
                                                )}
                                                <span className={styles.teamName}>{name}</span>
                                            </span>
                                        </td>
                                        <td>{r.played}</td>
                                        {full ? (
                                            <>
                                                <td>{r.won}</td>
                                                <td>{r.drawn}</td>
                                                <td>{r.lost}</td>
                                                <td className={styles.nowrap}>{r.scored}-{r.conceded}</td>
                                            </>
                                        ) : null}
                                        <td>{diff > 0 ? `+${diff}` : diff}</td>
                                        <td className={styles.pts}>{r.points}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </> : null}
            </section>
        </main>
    );
}
