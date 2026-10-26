'use client';

/**
 * Panel: la primera pantalla del torneo en mobile.
 *
 * Contesta cuatro preguntas antes de que el gestor toque nada: en que estado
 * esta el torneo, cuanto hay cargado, que se juega ahora y que falta hacer.
 * Todo sale del fixture que ya trajo el shell — esta pantalla no pide nada.
 */

import { useEffect, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { Crest } from '../Crest';
import {
    EmptyState,
    SkeletonList,
    formatDayOnly,
    formatDayShort,
    formatTimeOnly,
    isPlayedStatus,
    matchCountOf,
    tournamentStatusLabel,
    type MobileFixture,
    type MobileMatch,
} from './shared';

type PanelViewProps = {
    tournamentName: string;
    sportLabel: string;
    seasonLabel: string | null;
    status: string;
    fixture: MobileFixture | null;
    loading: boolean;
    onGoToPhases: () => void;
    onNewPhase: () => void;
    onOpenMatch: (match: MobileMatch) => void;
};

const STATUS_PILL: Record<string, string> = {
    active: 'gtm-pill-live',
    published: 'gtm-pill-info',
    draft: 'gtm-pill-muted',
    archived: 'gtm-pill-muted',
};

/** Todos los partidos del torneo, ordenados por fecha. */
function allMatches(fixture: MobileFixture | null): MobileMatch[] {
    if (!fixture) return [];
    const matches: MobileMatch[] = [];
    for (const phase of fixture.phases) {
        for (const round of phase.rounds) matches.push(...round.matches);
    }
    return matches.sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));
}

export function PanelView({
    tournamentName,
    sportLabel,
    seasonLabel,
    status,
    fixture,
    loading,
    onGoToPhases,
    onNewPhase,
    onOpenMatch,
}: PanelViewProps) {
    /* El reloj se lee una vez, montado el componente. Ver el comentario de
       `upcoming` mas abajo. Va antes del early-return para que el orden de los
       hooks no dependa de `loading`. */
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => setNow(Date.now()), []);

    if (loading) {
        return (
            <>
                <div className="gtm-skel" style={{ height: 104 }} aria-hidden="true" />
                <div className="gtm-stats" aria-hidden="true">
                    <div className="gtm-skel" style={{ height: 76 }} />
                    <div className="gtm-skel" style={{ height: 76 }} />
                    <div className="gtm-skel" style={{ height: 76 }} />
                    <div className="gtm-skel" style={{ height: 76 }} />
                </div>
                <SkeletonList rows={2} height={92} />
            </>
        );
    }

    const phases = fixture?.phases ?? [];
    const matches = allMatches(fixture);
    const played = matches.filter((match) => isPlayedStatus(match.status)).length;
    const dated = matches.filter((match) => Boolean(match.dateTime));
    const first = dated[0]?.dateTime ?? null;
    const last = dated[dated.length - 1]?.dateTime ?? null;

    /* Los proximos tres: el primero sin jugar de ahora en adelante. El corte
       pone ADELANTE a los vencidos sin cargar, que son justo los que el gestor
       viene a completar; ordenar solo por fecha ascendente los escondia al
       final de la lista.

       `now` sale de un efecto y no de un `Date.now()` en el render: el reloj
       leido mientras se pinta es impuro y ademas no coincide entre el HTML del
       servidor y la hidratacion, asi que la lista saltaria de orden sola. En el
       primer render vale `null` y la lista queda por fecha, que es un orden
       valido; el reordenado llega en el mismo tick. */
    const upcoming = matches
        .filter((match) => !isPlayedStatus(match.status))
        .sort((a, b) => {
            const aTime = a.dateTime ? new Date(a.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.dateTime ? new Date(b.dateTime).getTime() : Number.MAX_SAFE_INTEGER;
            if (now !== null) {
                const aOverdue = aTime < now ? 0 : 1;
                const bOverdue = bTime < now ? 0 : 1;
                if (aOverdue !== bOverdue) return aOverdue - bOverdue;
            }
            return aTime - bTime;
        })
        .slice(0, 3);

    const totalMatches = phases.reduce((total, phase) => total + matchCountOf(phase), 0);

    return (
        <>
            <div className="gtm-card">
                <div className="gtm-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className={`gtm-pill ${STATUS_PILL[status] ?? 'gtm-pill-muted'}`}>
                        {tournamentStatusLabel(status)}
                    </span>
                    <span className="gtm-pill gtm-pill-muted">{sportLabel}</span>
                    {seasonLabel ? <span className="gtm-pill gtm-pill-muted">{seasonLabel}</span> : null}
                </div>
                <div className="gtm-row-title" style={{ whiteSpace: 'normal' }}>{tournamentName}</div>
                <div className="gtm-row-meta" style={{ marginTop: 6 }}>
                    {first
                        ? `${formatDayOnly(first)} — ${last ? formatDayOnly(last) : 'sin cierre'}`
                        : 'Todavía no hay partidos con fecha'}
                </div>
            </div>

            <div className="gtm-stats">
                <div className="gtm-stat">
                    <div className="gtm-stat-n">{phases.length}</div>
                    <div className="gtm-stat-l">{phases.length === 1 ? 'Fase' : 'Fases'}</div>
                </div>
                <div className="gtm-stat">
                    <div className="gtm-stat-n">{fixture?.participants.length ?? 0}</div>
                    <div className="gtm-stat-l">Equipos</div>
                </div>
                <div className="gtm-stat">
                    <div className="gtm-stat-n">{matches.length}</div>
                    <div className="gtm-stat-l">Partidos</div>
                </div>
                <div className="gtm-stat">
                    <div className="gtm-stat-n">{played}</div>
                    <div className="gtm-stat-l">Jugados</div>
                </div>
            </div>

            {fixture?.matchesTruncated ? (
                <div className="gtm-card" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                    <div className="gtm-row-sub" style={{ whiteSpace: 'normal' }}>
                        El fixture superó la cota de partidos y llegó recortado. Las cifras de arriba
                        cuentan lo que llegó, no el total del torneo.
                    </div>
                </div>
            ) : null}

            <div className="gtm-section-title">Próximos partidos</div>
            {upcoming.length === 0 ? (
                <EmptyState
                    title="No queda nada por jugar"
                    text={
                        matches.length === 0
                            ? 'Todavía no hay partidos. Creá una fase y generá el calendario.'
                            : 'Todos los partidos cargados están finalizados.'
                    }
                />
            ) : (
                upcoming.map((match) => {
                    /* Un partido programado trae `score` en 0-0: pintarlo como
                       marcador lo hacia pasar por un empate ya jugado. Solo el
                       vivo muestra tanteador; el resto, un guion como en el
                       Calendario. */
                    const showScore = match.status === 'live';
                    return (
                    <button
                        key={match.id}
                        type="button"
                        className={`gtm-match${match.status === 'live' ? ' gtm-match-vivo' : ''}`}
                        onClick={() => onOpenMatch(match)}
                    >
                        <span className="gtm-match-when">
                            {match.status === 'live' ? (
                                <span className="gtm-match-vivo-label">
                                    <span className="gtm-match-vivo-dot" aria-hidden="true" />
                                    VIVO
                                </span>
                            ) : (
                                <>
                                    <span>{formatDayShort(match.dateTime)}</span>
                                    <span>{formatTimeOnly(match.dateTime)}</span>
                                </>
                            )}
                        </span>
                        <span className="gtm-match-teams">
                            <span className="gtm-side">
                                <Crest club={match.homeClub} size="md" />
                                <span className={`gtm-side-name${match.homeClub ? '' : ' gtm-side-empty'}`}>
                                    {match.homeClub?.name ?? 'A definir'}
                                </span>
                                <span className="gtm-side-score">{showScore && match.score ? match.score.home : '-'}</span>
                            </span>
                            <span className="gtm-side">
                                <Crest club={match.awayClub} size="md" />
                                <span className={`gtm-side-name${match.awayClub ? '' : ' gtm-side-empty'}`}>
                                    {match.awayClub?.name ?? 'A definir'}
                                </span>
                                <span className="gtm-side-score">{showScore && match.score ? match.score.away : '-'}</span>
                            </span>
                            {match.venue ? <span className="gtm-match-venue">{match.venue}</span> : null}
                        </span>
                    </button>
                    );
                })
            )}

            <div className="gtm-section-title">Gestión</div>
            <button type="button" className="gtm-row-card" onClick={onGoToPhases}>
                <Layers size={20} className="gtm-chevron" />
                <div className="gtm-row-body">
                    <div className="gtm-row-title">Fases</div>
                    <div className="gtm-row-sub">
                        {phases.length === 0
                            ? 'Sin fases cargadas'
                            : `${phases.length} ${phases.length === 1 ? 'fase' : 'fases'} · ${totalMatches} partidos`}
                    </div>
                </div>
            </button>
            <button type="button" className="gtm-btn gtm-btn-primary" onClick={onNewPhase}>
                <Plus size={18} />
                Agregar fase
            </button>
        </>
    );
}
