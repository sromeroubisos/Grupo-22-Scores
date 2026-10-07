'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { APP_TIMEZONE } from '@/lib/timezone';

interface MatchesTabProps {
    clubId: string;
    onCreate: () => void;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type AgendaTeam = { name: string; team_id: string };

type AgendaMatch = {
    match_id: string;
    home_team: AgendaTeam;
    away_team: AgendaTeam;
    scores: { home: number | null; away: number | null };
    match_status: string;
    timestamp: number;
    tournament_name: string;
    can_delete: boolean;
    level_rank: number;
};

const RECENT_RESULTS = 15;

/** El día de una fecha en la hora del sitio, como `YYYY-MM-DD`. */
function dayKeyOf(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function formatWhen(timestamp: number, withDay: boolean): string {
    if (!timestamp) return 'Sin fecha';
    const options: Intl.DateTimeFormatOptions = withDay
        ? { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: '2-digit', minute: '2-digit', hour12: false };
    return new Intl.DateTimeFormat('es-AR', { ...options, timeZone: APP_TIMEZONE }).format(new Date(timestamp * 1000));
}

function scoreOf(match: AgendaMatch): string | null {
    const { home, away } = match.scores;
    if (home === null || home === undefined || away === null || away === undefined) return null;
    return `${home} - ${away}`;
}

/**
 * Los partidos de la familia del club, desde el gestor.
 *
 * Lee la MISMA agenda que el panel "Hoy" de la ficha pública
 * (`/api/clubs/[id]/agenda`): toda la familia, con el permiso de baja ya
 * resuelto por partido (`can_delete`). La baja va por
 * `DELETE /api/clubs/[id]/panel-matches`, que revalida por su cuenta: un
 * dirigente solo borra lo que cargó su club, nunca un partido de torneo.
 */
export function MatchesTab({ clubId, onCreate, notify }: MatchesTabProps) {
    const [matches, setMatches] = useState<AgendaMatch[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ day: dayKeyOf(new Date()) });
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(clubId)}/agenda?${params.toString()}`,
                { cache: 'no-store' },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar los partidos del club.');
            const rows = [
                ...(Array.isArray(payload.fixtures) ? payload.fixtures : []),
                ...(Array.isArray(payload.results) ? payload.results : []),
            ] as AgendaMatch[];
            setMatches(rows);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los partidos del club.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    const sections = useMemo(() => {
        const today = dayKeyOf(new Date());
        const all = matches ?? [];
        const dayOf = (match: AgendaMatch) => (match.timestamp ? dayKeyOf(new Date(match.timestamp * 1000)) : '');

        // Hoy por escalafón (Primera arriba), como el panel de la ficha.
        const todays = all
            .filter((match) => dayOf(match) === today)
            .sort((a, b) => a.level_rank - b.level_rank || a.timestamp - b.timestamp);
        const upcoming = all
            .filter((match) => dayOf(match) > today)
            .sort((a, b) => a.timestamp - b.timestamp);
        const past = all
            .filter((match) => dayOf(match) < today)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, RECENT_RESULTS);

        return { todays, upcoming, past };
    }, [matches]);

    const remove = async (match: AgendaMatch) => {
        setDeletingId(match.match_id);
        try {
            const params = new URLSearchParams({ matchId: match.match_id });
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(clubId)}/panel-matches?${params.toString()}`,
                { method: 'DELETE' },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudo borrar el partido.');
            setMatches((prev) => (prev ? prev.filter((row) => row.match_id !== match.match_id) : prev));
            notify('Partido borrado');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo borrar el partido.', 'error');
        } finally {
            setDeletingId(null);
            setConfirmId(null);
        }
    };

    const renderRow = (match: AgendaMatch, withDay: boolean) => {
        const score = scoreOf(match);
        const confirming = confirmId === match.match_id;
        const deleting = deletingId === match.match_id;
        const title = `${match.home_team.name} vs ${match.away_team.name}`;

        return (
            <div key={match.match_id} className="cm-row cm-match-row">
                <div className="cm-match-when">{formatWhen(match.timestamp, withDay)}</div>
                <div className="cm-row-main">
                    <div className="cm-row-title">
                        {match.home_team.name}
                        <span className="cm-match-score">{score ?? 'vs'}</span>
                        {match.away_team.name}
                    </div>
                    <div className="cm-row-sub">{match.tournament_name || 'Amistoso'}</div>
                </div>
                <div className="cm-row-actions">
                    {confirming ? (
                        <>
                            <span className="cm-hint">¿Borrarlo?</span>
                            <button
                                type="button"
                                className="cm-btn cm-btn-sm cm-btn-danger"
                                onClick={() => { void remove(match); }}
                                disabled={deleting}
                            >
                                {deleting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                                Sí, borrar
                            </button>
                            <button
                                type="button"
                                className="cm-btn cm-btn-sm"
                                onClick={() => setConfirmId(null)}
                                disabled={deleting}
                            >
                                No
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href={`/matches/${encodeURIComponent(match.match_id)}`}
                                prefetch={false}
                                target="_blank"
                                rel="noreferrer"
                                className="cm-btn cm-btn-icon"
                                aria-label={`Abrir la ficha de ${title}`}
                                title="Ver partido"
                            >
                                <ExternalLink size={14} aria-hidden="true" />
                            </Link>
                            {match.can_delete && (
                                <button
                                    type="button"
                                    className="cm-btn cm-btn-icon cm-btn-danger"
                                    onClick={() => setConfirmId(match.match_id)}
                                    aria-label={`Borrar ${title}`}
                                    title="Borrar partido"
                                >
                                    <Trash2 size={14} aria-hidden="true" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    const header = (
        <div className="cm-card-head">
            <div>
                <h2>Hoy</h2>
                <p>Los partidos de hoy de todas las categorías del club.</p>
            </div>
            <div className="cm-row-actions">
                <button
                    type="button"
                    className="cm-btn cm-btn-icon"
                    onClick={() => { void load(); }}
                    disabled={loading}
                    aria-label="Actualizar los partidos"
                    title="Actualizar"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
                </button>
                <button type="button" className="cm-btn cm-btn-primary" onClick={onCreate}>
                    <CalendarPlus size={14} aria-hidden="true" />
                    Crear partido
                </button>
            </div>
        </div>
    );

    if (loading && !matches) {
        return (
            <section className="cm-card">
                {header}
                <div className="cm-loading">Cargando los partidos del club...</div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="cm-card">
                {header}
                <div className="cm-alert">{error}</div>
            </section>
        );
    }

    return (
        <>
            <section className="cm-card">
                {header}
                {sections.todays.length === 0 ? (
                    <div className="cm-empty">
                        <strong>Hoy no juega ninguna categoría</strong>
                        Los partidos que cargues con fecha de hoy aparecen acá.
                    </div>
                ) : (
                    <div className="cm-list">{sections.todays.map((match) => renderRow(match, false))}</div>
                )}
            </section>

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Próximos</h2>
                        <p>Lo que viene. Los que cargó el club se pueden borrar; los de torneo, no.</p>
                    </div>
                </div>
                {sections.upcoming.length === 0 ? (
                    <div className="cm-empty">
                        <strong>No hay partidos programados</strong>
                        Cargá uno con Crear partido.
                    </div>
                ) : (
                    <div className="cm-list">{sections.upcoming.map((match) => renderRow(match, true))}</div>
                )}
            </section>

            {sections.past.length > 0 && (
                <section className="cm-card">
                    <div className="cm-card-head">
                        <div>
                            <h2>Últimos resultados</h2>
                            <p>Los {sections.past.length} más recientes.</p>
                        </div>
                    </div>
                    <div className="cm-list">{sections.past.map((match) => renderRow(match, true))}</div>
                </section>
            )}
        </>
    );
}
