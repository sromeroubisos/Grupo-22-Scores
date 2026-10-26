'use client';

/**
 * Panel: la primera pantalla del gestor.
 *
 * Contesta una sola pregunta, "¿qué tengo que hacer hoy?": partidos vencidos
 * sin resultado, lo que se juega después y lo que falta configurar. Cada fila
 * lleva a donde se resuelve. Antes eran cuatro tarjetas que decían tres veces
 * que el torneo estaba publicado y repetían las pestañas como "acciones
 * rápidas", mientras tres partidos esperaban resultado sin que nada lo dijera.
 *
 * Los partidos salen de `/api/tournaments/[id]/fixture`, el mismo pedido del
 * gestor mobile: un solo fetch con fases, fechas y partidos.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, Trophy } from 'lucide-react';
import { Database } from '@/lib/database.types';
import { SPORTS } from '@/lib/data/sports';
import {
    formatDayShort,
    formatTimeOnly,
    isPlayedStatus,
    type MobileFixture,
    type MobileMatch,
} from './mobile/shared';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface SummaryTabProps {
    data: TournamentRow;
    id: string;
    unionName?: string;
    matchCount?: number;
}

const tabHref = (id: string, tab: string, extra = '') =>
    `/admin/entities/${id}/manage?type=tournament&tab=${tab}${extra}`;

const STATUS_LABEL: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    active: 'En curso',
    archived: 'Archivado',
};

type PanelMatch = MobileMatch & { phaseId: string; phaseName: string; roundName: string };

function MatchRow({ match, href, cta }: { match: PanelMatch; href: string; cta: string }) {
    return (
        <li className="summary-match">
            <span className="summary-match-when">
                <span>{formatDayShort(match.dateTime)}</span>
                <span>{formatTimeOnly(match.dateTime)}</span>
            </span>
            <span className="summary-match-teams">
                <strong>{match.homeClub?.name ?? 'A definir'}</strong>
                <strong>{match.awayClub?.name ?? 'A definir'}</strong>
                <small>{match.phaseName} · {match.roundName}</small>
            </span>
            <Link prefetch={false} href={href} className="summary-match-cta">
                {cta}
                <ChevronRight size={14} aria-hidden="true" />
            </Link>
        </li>
    );
}

export function TournamentSummaryTab({ data, id, unionName }: SummaryTabProps) {
    const [logoError, setLogoError] = useState(false);
    const [fixture, setFixture] = useState<MobileFixture | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    /* El reloj se lee en un efecto: leído en el render no coincide entre el
       HTML del servidor y la hidratación. */
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => setNow(Date.now()), []);

    useEffect(() => {
        const controller = new AbortController();
        setLoadFailed(false);
        fetch(`/api/tournaments/${id}/fixture`, { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.json() as Promise<MobileFixture>;
            })
            .then(setFixture)
            .catch((error: unknown) => {
                if ((error as { name?: string })?.name === 'AbortError') return;
                setLoadFailed(true);
            });
        return () => controller.abort();
    }, [id, reloadKey]);

    const statusLabel = STATUS_LABEL[data.status || 'draft'] ?? (data.status || 'Borrador');
    const sportLabel = (data.sport_id && SPORTS[data.sport_id as keyof typeof SPORTS]?.nameEs)
        || data.sport_id?.toUpperCase() || '';
    const showLogo = Boolean(data.logo_url) && !logoError;

    const { matches, overdue, upcoming, emptyPhases, phaseRows } = useMemo(() => {
        const all: PanelMatch[] = [];
        const rows: { id: string; name: string; played: number; total: number; active: boolean }[] = [];
        const empty: { id: string; name: string }[] = [];
        for (const phase of fixture?.phases ?? []) {
            let played = 0;
            let total = 0;
            for (const round of phase.rounds) {
                for (const match of round.matches) {
                    total += 1;
                    if (isPlayedStatus(match.status)) played += 1;
                    all.push({ ...match, phaseId: phase.id, phaseName: phase.name, roundName: round.name });
                }
            }
            rows.push({ id: phase.id, name: phase.name, played, total, active: phase.isActive });
            if (total === 0) empty.push({ id: phase.id, name: phase.name });
        }
        const pending = all.filter((match) => !isPlayedStatus(match.status) && match.status !== 'cancelled');
        const time = (match: PanelMatch) => (match.dateTime ? new Date(match.dateTime).getTime() : Number.MAX_SAFE_INTEGER);
        pending.sort((a, b) => time(a) - time(b));
        const late = now === null ? [] : pending.filter((match) => match.dateTime && time(match) < now);
        const next = now === null ? pending : pending.filter((match) => !match.dateTime || time(match) >= now);
        return { matches: all, overdue: late, upcoming: next.slice(0, 4), emptyPhases: empty, phaseRows: rows };
    }, [fixture, now]);

    const configIssues: { label: string; tab: string; cta: string }[] = [];
    if (!data.union_id) configIssues.push({ label: 'Falta el organizador del torneo', tab: 'detalles', cta: 'Asignar' });
    if (!data.slug) configIssues.push({ label: 'Falta la dirección pública', tab: 'detalles', cta: 'Asignar' });
    if (fixture && fixture.phases.length === 0) configIssues.push({ label: 'El torneo no tiene fases', tab: 'estructura', cta: 'Crear fase' });
    for (const phase of emptyPhases) {
        configIssues.push({ label: `${phase.name} no tiene partidos`, tab: 'operacion', cta: 'Agregar' });
    }

    const playedCount = matches.filter((match) => isPlayedStatus(match.status)).length;
    const nothingPending = fixture !== null && overdue.length === 0 && configIssues.length === 0;

    return (
        <div className="summary-console">
            <section className="basalt-card summary-panel summary-panel-wide summary-todo" aria-labelledby="summary-todo-title">
                <div className="summary-panel-head">
                    <h2 id="summary-todo-title" className="summary-todo-title">Por hacer</h2>
                    {fixture ? (
                        <span className={`summary-flag ${nothingPending ? 'is-ok' : 'is-warn'}`}>
                            {nothingPending
                                ? 'Al día'
                                : `${overdue.length + configIssues.length} pendiente${overdue.length + configIssues.length === 1 ? '' : 's'}`}
                        </span>
                    ) : null}
                </div>

                {loadFailed ? (
                    <div className="summary-error">
                        <span>No se pudieron leer los partidos del torneo.</span>
                        <button type="button" className="basalt-btn" onClick={() => setReloadKey((key) => key + 1)}>
                            <RefreshCw size={14} aria-hidden="true" />
                            Reintentar
                        </button>
                    </div>
                ) : !fixture ? (
                    <div className="summary-skeleton" aria-busy="true" aria-label="Cargando lo pendiente">
                        <span /><span /><span />
                    </div>
                ) : nothingPending && upcoming.length === 0 ? (
                    <p className="summary-done">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Nada pendiente. Todos los partidos tienen resultado.
                    </p>
                ) : (
                    <div className="summary-todo-body">
                        {overdue.length > 0 ? (
                            <div className="summary-todo-group">
                                <h3>
                                    <AlertTriangle size={14} aria-hidden="true" />
                                    {overdue.length === 1 ? '1 partido jugado sin resultado' : `${overdue.length} partidos jugados sin resultado`}
                                </h3>
                                <ul className="summary-matches">
                                    {overdue.slice(0, 6).map((match) => (
                                        <MatchRow
                                            key={match.id}
                                            match={match}
                                            cta="Cargar resultado"
                                            href={tabHref(id, 'operacion', `&phaseId=${match.phaseId}`)}
                                        />
                                    ))}
                                </ul>
                                {overdue.length > 6 ? (
                                    <Link prefetch={false} href={tabHref(id, 'operacion')} className="summary-more">
                                        Ver los {overdue.length} en Partidos
                                    </Link>
                                ) : null}
                            </div>
                        ) : null}

                        {configIssues.length > 0 ? (
                            <div className="summary-todo-group">
                                <h3>
                                    <AlertTriangle size={14} aria-hidden="true" />
                                    Falta configurar
                                </h3>
                                <ul className="summary-list">
                                    {configIssues.map((issue) => (
                                        <li key={issue.label}>
                                            <span>{issue.label}</span>
                                            <Link prefetch={false} href={tabHref(id, issue.tab)} className="summary-cta">{issue.cta}</Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {upcoming.length > 0 ? (
                            <div className="summary-todo-group">
                                <h3>Próximos partidos</h3>
                                <ul className="summary-matches">
                                    {upcoming.map((match) => (
                                        <MatchRow
                                            key={match.id}
                                            match={match}
                                            cta="Ver"
                                            href={tabHref(id, 'operacion', `&phaseId=${match.phaseId}`)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                )}
            </section>

            <section className="basalt-card summary-panel" aria-label="Estado del torneo">
                <div className="summary-panel-head">
                    <span className="summary-panel-title">Torneo</span>
                    <span className={`summary-flag ${data.is_visible ? 'is-public' : ''}`}>{statusLabel}</span>
                </div>
                <div className="summary-identity">
                    <span className="summary-crest">
                        {showLogo ? (
                            <img src={data.logo_url as string} alt="" loading="lazy" onError={() => setLogoError(true)} />
                        ) : (
                            <Trophy size={18} aria-hidden="true" />
                        )}
                    </span>
                    <span className="summary-identity-copy">
                        <strong title={data.name || 'Torneo sin nombre'}>{data.name || 'Torneo sin nombre'}</strong>
                        <small>{[sportLabel, data.season_id, unionName].filter(Boolean).join(' · ')}</small>
                    </span>
                </div>
                {fixture ? (
                    <div className="summary-progress">
                        <div className="summary-progress-text">
                            <span>Partidos jugados</span>
                            <strong>{playedCount} de {matches.length}</strong>
                        </div>
                        <div
                            className="summary-progress-bar"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={matches.length || 1}
                            aria-valuenow={playedCount}
                            aria-label="Partidos jugados"
                        >
                            <span style={{ width: `${matches.length ? (playedCount / matches.length) * 100 : 0}%` }} />
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="basalt-card summary-panel" aria-label="Fases">
                <div className="summary-panel-head">
                    <span className="summary-panel-title">Fases</span>
                    <Link prefetch={false} href={tabHref(id, 'estructura')} className="summary-cta">Ver todas</Link>
                </div>
                {!fixture ? (
                    <div className="summary-skeleton" aria-hidden="true"><span /><span /></div>
                ) : phaseRows.length === 0 ? (
                    <p className="summary-empty">Todavía no hay fases.</p>
                ) : (
                    <ul className="summary-list">
                        {phaseRows.map((phase) => (
                            <li key={phase.id}>
                                <span>
                                    {phase.name}
                                    {phase.active ? <em className="summary-live"> · en juego</em> : null}
                                </span>
                                <span className="summary-count">
                                    {phase.total === 0 ? 'sin partidos' : `${phase.played}/${phase.total}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
