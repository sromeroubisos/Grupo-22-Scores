'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, ChevronRight, Plus } from 'lucide-react';
import styles from '../tournament-admin.module.css';
import p from './partidos.module.css';

type Club = {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
} | null;

type MatchRow = {
    id: string;
    tournament_id: string;
    date_time: string | null;
    venue: string | null;
    status: string | null;
    score: { home?: number; away?: number } | null;
    homeClub?: Club;
    awayClub?: Club;
    tournament?: { id: string; name: string; display_name: string | null } | null;
};

type FilterKey = 'proximos' | 'finalizados';

const FINAL_STATUSES = new Set(['final', 'finished', 'cancelled', 'abandoned']);

function isFinal(status: string | null): boolean {
    return FINAL_STATUSES.has((status || '').toLowerCase());
}

function clubLabel(c: Club): string {
    return c?.short_name?.trim() || c?.name?.trim() || '—';
}

function clubInitials(c: Club): string {
    const base = c?.name?.trim() || c?.short_name?.trim() || '?';
    return base
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}

function matchHref(matchId: string): string {
    return `/admin/torneo/partidos/${matchId}`;
}

function fmtFull(iso: string | null): string {
    if (!iso) return 'Sin fecha';
    try {
        return new Date(iso).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function fmtDayParts(iso: string | null): { strong: string; sub: string } {
    if (!iso) return { strong: 'Sin fecha', sub: '' };
    try {
        const d = new Date(iso);
        const now = new Date();
        const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const dayDiff = Math.round((startOf(d) - startOf(now)) / 86400000);
        const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const longDate = d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
        let strong: string;
        if (dayDiff === 0) strong = `Hoy, ${time}`;
        else if (dayDiff === 1) strong = `Mañana, ${time}`;
        else if (dayDiff === -1) strong = `Ayer, ${time}`;
        else strong = `${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}, ${time}`;
        return { strong, sub: longDate };
    } catch {
        return { strong: iso, sub: '' };
    }
}

function StatusBadge({ status }: { status: string | null }) {
    const s = (status || 'scheduled').toLowerCase();
    let cls = p.statusOther;
    if (s === 'scheduled') cls = p.statusScheduled;
    else if (s === 'live') cls = p.statusLive;
    else if (isFinal(s)) cls = p.statusFinal;
    const label =
        s === 'scheduled' ? 'Programado'
        : s === 'live' ? 'En vivo'
        : s === 'final' || s === 'finished' ? 'Finalizado'
        : (status || 'scheduled');
    return <span className={`${p.statusBadge} ${cls}`}>{label}</span>;
}

function Crest({ club }: { club: Club }) {
    if (club?.logo_url) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className={p.crestImg} src={club.logo_url} alt="" loading="lazy" />;
    }
    return <span className={p.crestFallback} aria-hidden>{clubInitials(club)}</span>;
}

export default function TournamentAdminMatchesPage() {
    const router = useRouter();
    const [matches, setMatches] = useState<MatchRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterKey>('proximos');
    const [tournamentSel, setTournamentSel] = useState<string>('all');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/torneo/matches', {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los partidos');
                setMatches(Array.isArray(payload.data) ? payload.data : []);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error inesperado');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Operational snapshot — computed from real data, not the active filter.
    const snapshot = useMemo(() => {
        const total = matches.length;
        const live = matches.filter((m) => (m.status || '').toLowerCase() === 'live').length;
        const upcoming = matches.filter(
            (m) => !isFinal(m.status) && (m.status || '').toLowerCase() !== 'live',
        ).length;
        const now = Date.now();
        const next = matches
            .filter((m) => !isFinal(m.status) && m.date_time && new Date(m.date_time).getTime() >= now)
            .sort((a, b) => new Date(a.date_time!).getTime() - new Date(b.date_time!).getTime())[0] ?? null;
        return { total, live, upcoming, next };
    }, [matches]);

    // Every tournament that has at least one match — derived from the full
    // (unfiltered) list so the choice survives switching the status tab.
    const tournamentOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of matches) {
            if (!map.has(m.tournament_id)) {
                map.set(
                    m.tournament_id,
                    m.tournament?.display_name || m.tournament?.name || 'Torneo',
                );
            }
        }
        return Array.from(map.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [matches]);

    // If the selected tournament is no longer present, fall back to "Todos".
    useEffect(() => {
        if (
            tournamentSel !== 'all' &&
            tournamentOptions.length > 0 &&
            !tournamentOptions.some((t) => t.id === tournamentSel)
        ) {
            setTournamentSel('all');
        }
    }, [tournamentOptions, tournamentSel]);

    const visible = useMemo(
        () =>
            matches.filter((m) => {
                const statusOk =
                    filter === 'finalizados' ? isFinal(m.status) : !isFinal(m.status);
                const tournamentOk =
                    tournamentSel === 'all' || m.tournament_id === tournamentSel;
                return statusOk && tournamentOk;
            }),
        [matches, filter, tournamentSel],
    );

    const grouped = useMemo(() => {
        const map = new Map<string, { name: string; rows: MatchRow[] }>();
        for (const m of visible) {
            const key = m.tournament_id;
            const name = m.tournament?.display_name || m.tournament?.name || 'Torneo';
            if (!map.has(key)) map.set(key, { name, rows: [] });
            map.get(key)!.rows.push(m);
        }
        return Array.from(map.entries());
    }, [visible]);

    return (
        <div>
            <div className={styles.pageHeader}>
                <div className={styles.eyebrow}>
                    <div className={styles.eyebrowDash} />
                    <span className={styles.eyebrowLabel}>Operación</span>
                </div>
                <div className={p.headerBar}>
                    <h1 className={styles.pageTitle}>Editar partidos</h1>
                    <div className={p.filterRow}>
                        {tournamentOptions.length > 1 && (
                            <select
                                className={p.filterSelect}
                                value={tournamentSel}
                                onChange={(e) => setTournamentSel(e.target.value)}
                                aria-label="Filtrar por torneo"
                            >
                                <option value="all">Todos los torneos</option>
                                {tournamentOptions.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <div className={p.tabGroup} role="tablist" aria-label="Filtrar partidos">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={filter === 'proximos'}
                                className={`${p.tab} ${filter === 'proximos' ? p.tabActive : ''}`}
                                onClick={() => setFilter('proximos')}
                            >
                                Próximos
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={filter === 'finalizados'}
                                className={`${p.tab} ${filter === 'finalizados' ? p.tabActive : ''}`}
                                onClick={() => setFilter('finalizados')}
                            >
                                Finalizados
                            </button>
                        </div>
                        <Link className={p.crearBtn} href="/admin/torneo/partidos/crear">
                            <Plus size={16} aria-hidden />
                            Crear
                        </Link>
                    </div>
                </div>
            </div>

            {!loading && !error && matches.length > 0 && (
                <div className={p.bento}>
                    <div className={p.bentoMain}>
                        <h2 className={p.bentoTitle}>Estado de la operación</h2>
                        <p className={p.bentoBody}>
                            Resumen de los partidos de tus torneos. En torneos con plantel fijo, los
                            jugadores ya vienen precargados en cada partido.
                        </p>
                        <div className={p.statRow}>
                            <div className={p.stat}>
                                <span className={p.statLabel}>Total partidos</span>
                                <span className={p.statValue}>{snapshot.total}</span>
                            </div>
                            <div className={p.statDivider} />
                            <div className={p.stat}>
                                <span className={p.statLabel}>En vivo</span>
                                <span className={`${p.statValue} ${p.statValueAccent}`}>
                                    {String(snapshot.live).padStart(2, '0')}
                                </span>
                            </div>
                            <div className={p.statDivider} />
                            <div className={p.stat}>
                                <span className={p.statLabel}>Próximos</span>
                                <span className={p.statValue}>{snapshot.upcoming}</span>
                            </div>
                        </div>
                    </div>
                    <div className={p.bentoSide}>
                        <div>
                            <h2 className={`${p.bentoTitle} ${p.bentoTitleAccent}`}>
                                Siguiente encuentro
                            </h2>
                            <p className={p.nextMatchMeta}>
                                {snapshot.next
                                    ? `${snapshot.next.tournament?.display_name || snapshot.next.tournament?.name || 'Torneo'} · ${fmtFull(snapshot.next.date_time)}`
                                    : 'No hay partidos próximos'}
                            </p>
                        </div>
                        {snapshot.next && (
                            <div className={p.nextMatchTeams}>
                                <div className={p.nextMatchTeam}>
                                    <Crest club={snapshot.next.homeClub} />
                                    <span>{clubLabel(snapshot.next.homeClub)}</span>
                                </div>
                                <span className={p.nextMatchVs}>VS</span>
                                <div className={p.nextMatchTeam}>
                                    <Crest club={snapshot.next.awayClub} />
                                    <span>{clubLabel(snapshot.next.awayClub)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {error && <div className={`${p.stateCard} ${p.stateError}`}>{error}</div>}

            {loading ? (
                <div className={p.stateCard}>Cargando partidos…</div>
            ) : matches.length === 0 ? (
                <div className={p.stateCard}>No hay partidos en tus torneos.</div>
            ) : visible.length === 0 ? (
                <div className={p.stateCard}>
                    {(() => {
                        const scope =
                            tournamentSel === 'all'
                                ? ''
                                : ` en ${tournamentOptions.find((t) => t.id === tournamentSel)?.name ?? 'este torneo'}`;
                        return filter === 'finalizados'
                            ? `No hay partidos finalizados${scope}.`
                            : `No hay partidos próximos${scope}.`;
                    })()}
                </div>
            ) : (
                grouped.map(([tournamentId, group]) => (
                    <section key={tournamentId} className={p.group}>
                        <div className={p.groupHeader}>
                            <p className={p.groupLabel}>{group.name}</p>
                            <span className={p.groupCount}>
                                {group.rows.length} {group.rows.length === 1 ? 'PARTIDO' : 'PARTIDOS'}
                            </span>
                        </div>

                        {/* Mobile: dense, fully-clickable cards */}
                        <div className={p.mobileView}>
                            <div className={p.matchList}>
                                {group.rows.map((m) => (
                                    <Link key={m.id} href={matchHref(m.id)} className={p.matchCard}>
                                        <div className={p.matchCardTop}>
                                            <div className={p.matchTeams}>
                                                <span>{clubLabel(m.homeClub)}</span>
                                                {isFinal(m.status) && m.score ? (
                                                    <span className={p.score}>
                                                        {m.score.home ?? '-'} : {m.score.away ?? '-'}
                                                    </span>
                                                ) : (
                                                    <span className={p.vs}>VS</span>
                                                )}
                                                <span>{clubLabel(m.awayClub)}</span>
                                            </div>
                                            <StatusBadge status={m.status} />
                                        </div>
                                        <div className={p.matchMeta}>
                                            <Calendar size={14} aria-hidden />
                                            <span>{fmtFull(m.date_time)}</span>
                                        </div>
                                        <div className={p.matchCardBottom}>
                                            <div className={p.matchMeta} style={{ marginTop: 0 }}>
                                                <MapPin size={14} aria-hidden />
                                                <span>{m.venue || 'Sin cancha'}</span>
                                            </div>
                                            <ChevronRight size={18} className={p.chevron} aria-hidden />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            <Link
                                href={`/admin/torneo/partidos/crear?tournamentId=${tournamentId}`}
                                className={p.addCard}
                            >
                                <Plus size={20} aria-hidden />
                                <span className={p.addCardLabel}>Añadir nuevo partido</span>
                            </Link>
                        </div>

                        {/* Desktop: data table */}
                        <div className={p.tableWrap}>
                            <table className={p.table}>
                                <thead>
                                    <tr>
                                        <th>Partido</th>
                                        <th>Fecha y hora</th>
                                        <th>Cancha / Venue</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.rows.map((m) => {
                                        const date = fmtDayParts(m.date_time);
                                        return (
                                            <tr
                                                key={m.id}
                                                onClick={() => router.push(matchHref(m.id))}
                                            >
                                                <td>
                                                    <div className={p.cellMatch}>
                                                        <div className={p.cellTeam}>
                                                            <Crest club={m.homeClub} />
                                                            <span>{clubLabel(m.homeClub)}</span>
                                                        </div>
                                                        <span className={p.cellVs}>
                                                            {isFinal(m.status) && m.score
                                                                ? `${m.score.home ?? '-'} : ${m.score.away ?? '-'}`
                                                                : 'VS'}
                                                        </span>
                                                        <div className={p.cellTeam}>
                                                            <Crest club={m.awayClub} />
                                                            <span>{clubLabel(m.awayClub)}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={p.cellDateStrong}>{date.strong}</span>
                                                    <span className={p.cellDateSub}>{date.sub}</span>
                                                </td>
                                                <td>
                                                    <div className={p.cellVenue}>
                                                        <MapPin size={16} aria-hidden />
                                                        <span>{m.venue || 'Sin cancha'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <StatusBadge status={m.status} />
                                                </td>
                                                <td className={p.cellActions}>
                                                    <Link
                                                        href={matchHref(m.id)}
                                                        className={p.editBtn}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Editar
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))
            )}
        </div>
    );
}
