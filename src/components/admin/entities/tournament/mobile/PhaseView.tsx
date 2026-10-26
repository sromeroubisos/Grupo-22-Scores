'use client';

/**
 * La fase, en UNA pantalla, y completa.
 *
 * Tres segmentos —Tabla (o Llaves), Calendario y Plantel— y una hoja de
 * acciones con todo lo demas: editar la fase, sus etiquetas, generar el
 * calendario, agregar una fecha, activarla o borrarla. No hay nada de la fase
 * que haya que ir a buscar al gestor de escritorio.
 *
 * LA FECHA ES UN PERIODO. Sale de `tournament_rounds.start_date`/`end_date`, y
 * si la ronda no los tiene se deriva de los dias de sus partidos. Cuando dos
 * fechas consecutivas caen en el mismo fin de semana, la pantalla lo dice: son
 * los 808 pares que documenta `lib/matchWeekend.ts`, y desde la hoja de la
 * fecha se unen.
 *
 * `generate-rounds` hace tres cosas distintas segun el tipo de fase y en los
 * tres casos AGREGA, no reemplaza. Por eso la hoja avisa cuantas fechas hay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CalendarDays,
    CalendarPlus,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    Tags,
    Trash2,
} from 'lucide-react';
import {
    dayKeyInTimeZone,
    formatPeriod,
    isDayKey,
    periodKeyOf,
    periodOfDays,
    type Period,
} from '@/lib/matchWeekend';
import { APP_TIMEZONE } from '@/lib/timezone';
import { Crest } from '../Crest';
import { MatchSheet } from './MatchSheet';
import { PhaseRosterView } from './PhaseRosterView';
import { LabelsSheet, RoundSheet } from './PhaseSheets';
import {
    EmptyState,
    Sheet,
    SkeletonList,
    Stepper,
    formatDayShort,
    formatTimeOnly,
    isPlayedStatus,
    phaseKind,
    phaseZones,
    zoneForPosition,
    type MobileMatch,
    type MobileParticipant,
    type MobilePhase,
    type MobileRound,
    type StandingRow,
} from './shared';

type Group = { id: string; name: string };

export type PhaseSegment = 'tabla' | 'calendario' | 'plantel';

/** El orden de las pestanas, que es tambien el que recorren las flechas. */
const SEGMENT_ORDER: PhaseSegment[] = ['tabla', 'calendario', 'plantel'];

/** La fecha con su periodo ya resuelto, que es como la trata toda la pantalla. */
type DatedRound = {
    round: MobileRound;
    period: Period | null;
    matchIds: string[];
};

/**
 * El periodo de una fecha.
 *
 * Se prefiere el guardado, y si no lo hay se deriva de los partidos. Derivar es
 * el caso de las rondas viejas y de las que crea `generate-rounds`, que nacen
 * sin fechas porque el Berger no sabe de calendario.
 */
function resolvePeriod(round: MobileRound): Period | null {
    const start = typeof round.startDate === 'string' ? round.startDate.slice(0, 10) : null;
    const end = typeof round.endDate === 'string' ? round.endDate.slice(0, 10) : null;
    if (isDayKey(start)) {
        return { start, end: isDayKey(end) && end >= start ? end : start };
    }
    const days = round.matches
        .map((match) => dayKeyInTimeZone(match.dateTime, APP_TIMEZONE))
        .filter((day): day is string => Boolean(day));
    return periodOfDays(days);
}

export function PhaseView({
    tournamentId,
    phase,
    participants,
    segment,
    onSegment,
    roundId,
    onRound,
    onReload,
    onToast,
    onEditPhase,
    onPhaseGone,
    actionsOpen,
    onActionsOpenChange,
}: {
    tournamentId: string;
    phase: MobilePhase;
    participants: MobileParticipant[];
    segment: PhaseSegment;
    onSegment: (next: PhaseSegment) => void;
    /* La fecha abierta en el Calendario, o `null` para que la elija el propio
       Calendario (ver `defaultRoundIndex`). Vive en la URL, no aca. */
    roundId: string | null;
    onRound: (next: string) => void;
    onReload: () => Promise<void>;
    onToast: (tone: 'ok' | 'err', message: string) => void;
    onEditPhase: () => void;
    onPhaseGone: () => void;
    /* Las acciones de la fase se abren desde los tres puntos de la cabecera,
       que vive en el manager. Por eso el estado viene de afuera: si fuera de
       aca, la cabecera no tendria como abrirlo. */
    actionsOpen: boolean;
    onActionsOpenChange: (open: boolean) => void;
}) {
    const setActionsOpen = onActionsOpenChange;
    const isBracket = phaseKind(phase.phaseType) === 'bracket';

    const [generateOpen, setGenerateOpen] = useState(false);
    const [labelsOpen, setLabelsOpen] = useState(false);
    const [confirmDeletePhase, setConfirmDeletePhase] = useState(false);
    const [busy, setBusy] = useState(false);

    /** `undefined` cerrado, `null` alta, o la fecha que se edita. */
    const [roundSheet, setRoundSheet] = useState<DatedRound | null | undefined>(undefined);
    /** `undefined` cerrado; `{ match: null }` es alta en esa fecha. */
    const [matchSheet, setMatchSheet] = useState<
        { match: MobileMatch | null; roundId: string | null } | undefined
    >(undefined);

    const dated: DatedRound[] = useMemo(
        () => phase.rounds.map((round) => ({
            round,
            period: resolvePeriod(round),
            matchIds: round.matches.map((match) => match.id),
        })),
        [phase.rounds],
    );

    async function afterWrite(message: string) {
        setRoundSheet(undefined);
        setMatchSheet(undefined);
        setGenerateOpen(false);
        setLabelsOpen(false);
        onToast('ok', message);
        await onReload();
    }

    function onWriteError(message: string) {
        setRoundSheet(undefined);
        setMatchSheet(undefined);
        setGenerateOpen(false);
        setLabelsOpen(false);
        onToast('err', message);
    }

    async function setActive() {
        setBusy(true);
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/phases/${phase.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: true }),
            });
            if (response.ok) {
                setActionsOpen(false);
                await afterWrite('Fase activada.');
                return;
            }
            onWriteError(`No se pudo activar la fase: error ${response.status}`);
        } finally {
            setBusy(false);
        }
    }

    async function deletePhase() {
        setBusy(true);
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/phases/${phase.id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setActionsOpen(false);
                onToast('ok', `Fase "${phase.name}" eliminada.`);
                await onReload();
                onPhaseGone();
                return;
            }
            let message = `Error ${response.status}`;
            try {
                const payload = await response.json();
                message = payload.error || message;
            } catch {
                // Sin JSON queda el codigo.
            }
            onWriteError(`No se pudo eliminar la fase: ${message}`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            {/* Un tablist de verdad: cada pestana apunta a su panel por
                `aria-controls`, solo la elegida es tabulable y las flechas
                mueven entre las tres. Sin esto el lector anunciaba "pestana"
                pero no tenia panel que asociarle. */}
            <div
                className="gtm-seg"
                role="tablist"
                aria-label="Vista de la fase"
                onKeyDown={(event) => {
                    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                    if (!delta) return;
                    event.preventDefault();
                    const index = SEGMENT_ORDER.indexOf(segment);
                    const next = SEGMENT_ORDER[(index + delta + SEGMENT_ORDER.length) % SEGMENT_ORDER.length];
                    onSegment(next);
                    /* El foco sigue a la pestana: el boton nuevo todavia no
                       existe cuando corre el handler, de ahi el rAF. */
                    requestAnimationFrame(() => {
                        document.getElementById(`gtm-seg-${next}`)?.focus();
                    });
                }}
            >
                {SEGMENT_ORDER.map((value) => {
                    const selected = segment === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            id={`gtm-seg-${value}`}
                            aria-controls={`gtm-panel-${value}`}
                            aria-selected={selected}
                            tabIndex={selected ? 0 : -1}
                            className="gtm-seg-btn"
                            onClick={() => onSegment(value)}
                        >
                            {value === 'tabla'
                                ? (isBracket ? 'Llaves' : 'Tabla')
                                : value === 'calendario' ? 'Calendario' : 'Plantel'}
                        </button>
                    );
                })}
            </div>

            <div
                role="tabpanel"
                id={`gtm-panel-${segment}`}
                aria-labelledby={`gtm-seg-${segment}`}
                className="gtm-panel"
            >
            {segment === 'tabla' ? (
                isBracket
                    ? (
                        <BracketBoard
                            phase={phase}
                            onOpenMatch={(match) => setMatchSheet({ match, roundId: match.roundId })}
                        />
                    )
                    : <StandingsBoard tournamentId={tournamentId} phase={phase} />
            ) : segment === 'calendario' ? (
                <Calendar
                    dated={dated}
                    roundId={roundId}
                    onRound={onRound}
                    onOpenMatch={(match, ownerRoundId) => setMatchSheet({ match, roundId: ownerRoundId })}
                    onNewMatch={(ownerRoundId) => setMatchSheet({ match: null, roundId: ownerRoundId })}
                    onEditRound={(item) => setRoundSheet(item)}
                    onNewRound={() => setRoundSheet(null)}
                    onGenerate={() => setGenerateOpen(true)}
                />
            ) : (
                <PhaseRosterView
                    tournamentId={tournamentId}
                    phaseId={phase.id}
                    participants={participants}
                    onToast={onToast}
                />
            )}
            </div>

            {actionsOpen ? (
                <Sheet title={phase.name} onClose={() => setActionsOpen(false)}>
                    <button
                        type="button"
                        className="gtm-sheet-item"
                        onClick={() => { setActionsOpen(false); onEditPhase(); }}
                    >
                        <Pencil size={20} />
                        Editar la fase
                    </button>
                    <button
                        type="button"
                        className="gtm-sheet-item"
                        onClick={() => { setActionsOpen(false); setLabelsOpen(true); }}
                    >
                        <Tags size={20} />
                        Etiquetas de la tabla
                    </button>
                    <button
                        type="button"
                        className="gtm-sheet-item"
                        onClick={() => { setActionsOpen(false); setRoundSheet(null); }}
                    >
                        <CalendarPlus size={20} />
                        Agregar una fecha
                    </button>
                    <button
                        type="button"
                        className="gtm-sheet-item"
                        onClick={() => { setActionsOpen(false); setGenerateOpen(true); }}
                    >
                        <CalendarDays size={20} />
                        Generar el calendario
                    </button>
                    {!phase.isActive ? (
                        <button
                            type="button"
                            className="gtm-sheet-item"
                            onClick={setActive}
                            disabled={busy}
                        >
                            <Plus size={20} />
                            Marcar en juego
                        </button>
                    ) : null}

                    {confirmDeletePhase ? (
                        <>
                            <div className="gtm-notice">
                                <div className="gtm-notice-body">
                                    Se borra la fase con sus fechas, sus partidos y su tabla. No se
                                    puede deshacer.
                                </div>
                            </div>
                            <button
                                type="button"
                                className="gtm-btn gtm-btn-danger"
                                onClick={deletePhase}
                                disabled={busy}
                            >
                                <Trash2 size={18} />
                                Sí, eliminar la fase
                            </button>
                            <button
                                type="button"
                                className="gtm-btn"
                                onClick={() => setConfirmDeletePhase(false)}
                                disabled={busy}
                            >
                                No, volver
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="gtm-sheet-item gtm-sheet-item-danger"
                            onClick={() => setConfirmDeletePhase(true)}
                        >
                            <Trash2 size={20} />
                            Eliminar la fase
                        </button>
                    )}
                </Sheet>
            ) : null}

            {generateOpen ? (
                <GenerateSheet
                    tournamentId={tournamentId}
                    phase={phase}
                    onClose={() => setGenerateOpen(false)}
                    onDone={afterWrite}
                    onError={onWriteError}
                />
            ) : null}

            {labelsOpen ? (
                <LabelsSheet
                    tournamentId={tournamentId}
                    phase={phase}
                    onClose={() => setLabelsOpen(false)}
                    onDone={afterWrite}
                    onError={onWriteError}
                />
            ) : null}

            {roundSheet !== undefined ? (
                <RoundSheet
                    tournamentId={tournamentId}
                    phaseId={phase.id}
                    round={roundSheet
                        ? {
                            id: roundSheet.round.id,
                            name: roundSheet.round.name,
                            period: roundSheet.period,
                            matchIds: roundSheet.matchIds,
                        }
                        : null}
                    nextRound={(() => {
                        if (!roundSheet) return null;
                        const index = dated.findIndex((item) => item.round.id === roundSheet.round.id);
                        const next = index >= 0 ? dated[index + 1] : undefined;
                        return next
                            ? {
                                id: next.round.id,
                                name: next.round.name,
                                period: next.period,
                                matchIds: next.matchIds,
                            }
                            : null;
                    })()}
                    onClose={() => setRoundSheet(undefined)}
                    onDone={afterWrite}
                    onError={onWriteError}
                />
            ) : null}

            {matchSheet !== undefined ? (
                <MatchSheet
                    tournamentId={tournamentId}
                    phaseId={phase.id}
                    roundId={matchSheet.roundId}
                    match={matchSheet.match}
                    participants={participants}
                    onClose={() => setMatchSheet(undefined)}
                    onDone={afterWrite}
                    onError={onWriteError}
                />
            ) : null}
        </>
    );
}

// ── TABLA DE POSICIONES ──────────────────────────────────────────────────

function StandingsBoard({ tournamentId, phase }: { tournamentId: string; phase: MobilePhase }) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [rows, setRows] = useState<StandingRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    /* Los grupos primero: sin `groupId`, el endpoint filtra por `group_id IS
       NULL` y una fase de grupos devolveria una tabla vacia sin decir por que. */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(
                    `/api/tournaments/${tournamentId}/groups?phaseId=${phase.id}`,
                );
                if (!response.ok) return;
                const data = (await response.json()) as Group[];
                if (cancelled) return;
                setGroups(Array.isArray(data) ? data : []);
                if (Array.isArray(data) && data.length > 0) setGroupId(data[0].id);
            } catch {
                // Sin grupos se pide la tabla general, que es el caso de una liga.
            }
        })();
        return () => { cancelled = true; };
    }, [tournamentId, phase.id]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        (async () => {
            try {
                const query = new URLSearchParams({ phaseId: phase.id });
                if (groupId) query.set('groupId', groupId);
                const response = await fetch(
                    `/api/admin/tournaments/${tournamentId}/standings/lite?${query.toString()}`,
                );
                if (!response.ok) throw new Error(String(response.status));
                const data = await response.json();
                if (cancelled) return;
                setRows(Array.isArray(data.table) ? data.table : []);
            } catch {
                /* Un fallo de red no puede disfrazarse de tabla vacia: el gestor
                   creeria que no hay posiciones cargadas. */
                if (!cancelled) {
                    setRows(null);
                    setFailed(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tournamentId, phase.id, groupId]);

    const zones = phaseZones(phase);

    if (loading) return <SkeletonList rows={5} height={40} />;

    if (failed) {
        return (
            <EmptyState
                title="No se pudo leer la tabla"
                text="La consulta de posiciones fallo. Volve a entrar a la fase para reintentar."
            />
        );
    }

    return (
        <>
            {groups.length > 1 ? (
                <div className="gtm-chip-grid" role="group" aria-label="Grupo">
                    {groups.map((group) => (
                        <button
                            key={group.id}
                            type="button"
                            className="gtm-chip"
                            aria-pressed={groupId === group.id}
                            onClick={() => setGroupId(group.id)}
                        >
                            {group.name}
                        </button>
                    ))}
                </div>
            ) : null}

            {!rows || rows.length === 0 ? (
                <EmptyState
                    title="La tabla esta vacia"
                    text="Se llena sola cuando hay partidos finalizados. Si ya los hay, recalcula las posiciones desde el gestor completo."
                />
            ) : (
                <>
                    <div className="gtm-table-wrap">
                        <div className="gtm-table-scroll">
                            <table className="gtm-table">
                                <caption
                                    className="gtm-section-title"
                                    style={{ textAlign: 'left', padding: '10px 10px 4px', margin: 0 }}
                                >
                                    Posiciones de {phase.name}
                                </caption>
                                <thead>
                                    <tr>
                                        <th scope="col" className="gtm-col-team">Club</th>
                                        <th scope="col">PJ</th>
                                        <th scope="col">G</th>
                                        <th scope="col">E</th>
                                        <th scope="col">P</th>
                                        <th scope="col">PF</th>
                                        <th scope="col">PC</th>
                                        <th scope="col">DIF</th>
                                        <th scope="col" className="gtm-col-pts">PTS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => {
                                        const zone = zoneForPosition(zones, row.position);
                                        return (
                                            <tr key={row.teamId}>
                                                <td className="gtm-col-team">
                                                    <div className="gtm-team-cell">
                                                        <span className="gtm-pos">{row.position}</span>
                                                        <Crest
                                                            club={{
                                                                id: row.teamId,
                                                                name: row.team.name,
                                                                logo: row.team.logo,
                                                            }}
                                                            size="md"
                                                        />
                                                        <span className="gtm-team-name">{row.team.name}</span>
                                                        {zone ? (
                                                            <span
                                                                className="gtm-zone"
                                                                style={{
                                                                    color: zone.color,
                                                                    background: `${zone.color}22`,
                                                                }}
                                                                title={zone.label}
                                                            >
                                                                {zone.short}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>{row.played}</td>
                                                <td>{row.won}</td>
                                                <td>{row.drawn}</td>
                                                <td>{row.lost}</td>
                                                <td>{row.points_for}</td>
                                                <td>{row.points_against}</td>
                                                <td>{row.difference}</td>
                                                <td className="gtm-col-pts">{row.total_points}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {zones.length > 0 ? (
                        <div className="gtm-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                            {zones.map((zone) => (
                                <span
                                    key={zone.id ?? zone.label}
                                    className="gtm-pill"
                                    style={{
                                        color: zone.color ?? '#38BDF8',
                                        borderColor: `${zone.color ?? '#38BDF8'}55`,
                                    }}
                                >
                                    {zone.label}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </>
            )}
        </>
    );
}

// ── CALENDARIO ───────────────────────────────────────────────────────────

/**
 * La fecha en foco cuando la URL no dice cual.
 *
 * NO es la primera. En un torneo empezado la fecha 1 se jugo hace meses, y al
 * Calendario se entra a cargar LA QUE VIENE: abrir siempre en la 1 obligaba a
 * tocar la flecha una vez por fecha jugada. Se elige la primera que tenga algo
 * pendiente —un partido sin jugar, o ningun partido cargado—, y si estan todas
 * cerradas, la ultima.
 */
function defaultRoundIndex(dated: DatedRound[]): number {
    const pending = dated.findIndex((item) => (
        item.round.matches.length === 0
        || item.round.matches.some((match) => !isPlayedStatus(match.status))
    ));
    return pending >= 0 ? pending : Math.max(0, dated.length - 1);
}

/**
 * El rotulo del chip: "Fecha 12" entra como "12".
 *
 * Dieciocho chips con la palabra "Fecha" adentro no entran en 390px, y ademas
 * repiten diecisiete veces un dato que ya dice la cabecera. El nombre completo
 * viaja igual en el `aria-label`.
 */
function chipLabel(name: string): string {
    const trimmed = name.trim();
    const tail = /(\d+)\s*$/.exec(trimmed);
    if (tail) return tail[1];
    return trimmed.length > 8 ? `${trimmed.slice(0, 7)}…` : trimmed;
}

function Calendar({
    dated,
    roundId,
    onRound,
    onOpenMatch,
    onNewMatch,
    onEditRound,
    onNewRound,
    onGenerate,
}: {
    dated: DatedRound[];
    roundId: string | null;
    onRound: (next: string) => void;
    onOpenMatch: (match: MobileMatch, roundId: string) => void;
    onNewMatch: (roundId: string) => void;
    onEditRound: (item: DatedRound) => void;
    onNewRound: () => void;
    onGenerate: () => void;
}) {
    const stripRef = useRef<HTMLDivElement>(null);

    /* La posicion sale de la URL, no de un `useState`: asi un F5 y el boton
       atras caen en la misma fecha. Si el id no es de esta fase —se cambio de
       fase, o la fecha se borro— se cae al default en vez de romper. */
    const fromUrl = roundId ? dated.findIndex((item) => item.round.id === roundId) : -1;
    const position = fromUrl >= 0 ? fromUrl : defaultRoundIndex(dated);

    /* El chip elegido se centra solo: con dieciocho fechas, la que esta abierta
       cae fuera de la tira y no se ve cual es. */
    useEffect(() => {
        const strip = stripRef.current;
        const chip = strip?.querySelector<HTMLElement>('[aria-checked="true"]');
        if (!strip || !chip) return;
        const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        strip.scrollTo({
            left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2,
            behavior: quieto ? 'auto' : 'smooth',
        });
    }, [position, dated.length]);

    if (dated.length === 0) {
        return (
            <EmptyState
                title="Sin calendario"
                text="La fase no tiene fechas. Generalo entero, o agregá una fecha a mano."
                action={(
                    <div className="gtm-actions">
                        <button
                            type="button"
                            className="gtm-btn gtm-btn-primary"
                            onClick={onGenerate}
                        >
                            <CalendarDays size={18} />
                            Generar calendario
                        </button>
                        <button type="button" className="gtm-btn" onClick={onNewRound}>
                            <CalendarPlus size={18} />
                            Agregar una fecha
                        </button>
                    </div>
                )}
            />
        );
    }

    const current = dated[position];
    const next = dated[position + 1];

    /* El aviso de la fecha partida: dos fechas seguidas en el mismo fin de
       semana. Es el sintoma de los 808 pares. */
    const splitWithNext = Boolean(
        current.period && next?.period
        && periodKeyOf(current.period.end) === periodKeyOf(next.period.start),
    );

    return (
        <>
            <div className="gtm-round-nav">
                <button
                    type="button"
                    className="gtm-icon-btn"
                    onClick={() => onRound(dated[position - 1].round.id)}
                    disabled={position === 0}
                    aria-label="Fecha anterior"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="gtm-round-name">
                    {current.round.name}
                    <span className="gtm-round-count">
                        {formatPeriod(current.period)} · {current.round.matches.length}{' '}
                        {current.round.matches.length === 1 ? 'partido' : 'partidos'}
                    </span>
                </div>
                <button
                    type="button"
                    className="gtm-icon-btn"
                    onClick={() => onRound(dated[position + 1].round.id)}
                    disabled={position >= dated.length - 1}
                    aria-label="Fecha siguiente"
                >
                    <ChevronRight size={20} />
                </button>
                <button
                    type="button"
                    className="gtm-icon-btn"
                    onClick={() => onEditRound(current)}
                    aria-label={`Editar ${current.round.name}`}
                >
                    <Pencil size={18} />
                </button>
            </div>

            {/* La tira de fechas. Con las flechas solas, ir de la 1 a la 18 eran
                diecisiete toques; aca es uno. La fecha ya cerrada se apaga, asi
                se ve de un vistazo hasta donde llego el torneo. */}
            {dated.length > 1 ? (
                <div
                    className="gtm-round-strip"
                    ref={stripRef}
                    /* `radiogroup`, no `tablist`: es la misma eleccion unica que
                       la posicion o la nacionalidad en el resto del gestor, y un
                       tablist pediria un panel por fecha que no existe. */
                    role="radiogroup"
                    aria-label="Fechas de la fase"
                    onKeyDown={(event) => {
                        const delta = event.key === 'ArrowRight' ? 1
                            : event.key === 'ArrowLeft' ? -1 : 0;
                        if (!delta) return;
                        const target = position + delta;
                        if (target < 0 || target >= dated.length) return;
                        event.preventDefault();
                        onRound(dated[target].round.id);
                        requestAnimationFrame(() => {
                            stripRef.current
                                ?.querySelector<HTMLElement>('[aria-checked="true"]')
                                ?.focus();
                        });
                    }}
                >
                    {dated.map((item, itemIndex) => {
                        const selected = itemIndex === position;
                        const played = item.round.matches.length > 0
                            && item.round.matches.every((match) => isPlayedStatus(match.status));
                        return (
                            <button
                                key={item.round.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                /* El chip dice "12"; el lector, "Fecha 12". */
                                aria-label={item.round.name}
                                tabIndex={selected ? 0 : -1}
                                className={`gtm-round-chip${played ? ' gtm-round-chip-done' : ''}`}
                                onClick={() => onRound(item.round.id)}
                            >
                                {chipLabel(item.round.name)}
                            </button>
                        );
                    })}
                </div>
            ) : null}

            {splitWithNext && next ? (
                <button
                    type="button"
                    className="gtm-notice gtm-notice-btn"
                    onClick={() => onEditRound(current)}
                >
                    <div className="gtm-notice-body">
                        <strong>{next.round.name}</strong> cae en el mismo fin de semana. Si son la
                        misma fecha, tocá acá para unirlas.
                    </div>
                </button>
            ) : null}

            {current.round.matches.length === 0 ? (
                <EmptyState
                    title="Fecha sin partidos"
                    text="Esta fecha existe pero no tiene cruces cargados."
                />
            ) : (
                /* Los partidos van DENTRO de una caja. Sueltos eran hijos
                   directos de `.gtm-main`, que es un flex con `gap: 10px`: la
                   linea divisoria de `.gtm-match + .gtm-match` quedaba flotando
                   entre dos bloques separados y de esquinas cuadradas, o sea
                   exactamente la "pila de cajas" que la fila queria evitar. */
                <div className="gtm-matches">
                    {current.round.matches.map((match) => (
                        <MatchCard
                            key={match.id}
                            match={match}
                            onClick={() => onOpenMatch(match, current.round.id)}
                        />
                    ))}
                </div>
            )}

            {/* Las dos acciones lado a lado y no apiladas: dos botones de ancho
                completo se comian media pantalla al final de cada fecha.

                No es `gtm-actionbar` —el de Clubes, que se pega al pie— porque
                el `sticky` se mide contra el bloque contenedor, y desde que el
                segmento tiene su `.gtm-panel` ese bloque termina justo donde
                termina la barra: no le queda recorrido y quedaria fijo de
                mentira. */}
            <div className="gtm-actions">
                <button
                    type="button"
                    className="gtm-btn gtm-btn-primary"
                    onClick={() => onNewMatch(current.round.id)}
                >
                    <Plus size={18} />
                    Agregar partido
                </button>
                <button type="button" className="gtm-btn" onClick={onNewRound}>
                    <CalendarPlus size={18} />
                    Agregar una fecha
                </button>
            </div>
        </>
    );
}

/** Estados sin hora util: se muestra la sigla donde iria la hora. */
const SHORT_STATUS: Record<string, string> = {
    postponed: 'POST',
    suspended: 'SUSP',
    cancelled: 'CANC',
};

function MatchCard({ match, onClick }: { match: MobileMatch; onClick: () => void }) {
    const played = isPlayedStatus(match.status);
    const home = match.score?.home ?? null;
    const away = match.score?.away ?? null;
    const homeWon = played && home !== null && away !== null && home > away;
    const awayWon = played && home !== null && away !== null && away > home;

    const live = match.status === 'live';
    /* Postergado, suspendido y cancelado no tienen hora util que mostrar: en su
       lugar va la sigla, en el mismo renglon donde iria la hora. */
    const corto = SHORT_STATUS[match.status] ?? null;

    return (
        <button
            type="button"
            className={`gtm-match${live ? ' gtm-match-vivo' : ''}`}
            onClick={onClick}
        >
            <span className="gtm-match-when">
                {live ? (
                    <span className="gtm-match-vivo-label">
                        <span className="gtm-match-vivo-dot" aria-hidden="true" />
                        VIVO
                    </span>
                ) : played ? (
                    <span className="gtm-match-ft">Final</span>
                ) : (
                    <>
                        <span>{formatDayShort(match.dateTime)}</span>
                        <span>{corto ?? formatTimeOnly(match.dateTime)}</span>
                    </>
                )}
            </span>

            <span className="gtm-match-teams">
                <span className={`gtm-side${homeWon ? ' gtm-side-win' : awayWon ? ' gtm-side-lose' : ''}`}>
                    {match.homeClub ? (
                        <Crest club={match.homeClub} size="md" />
                    ) : (
                        <span className="gtm-slot-disc" aria-hidden="true">?</span>
                    )}
                    <span className={`gtm-side-name${match.homeClub ? '' : ' gtm-side-empty'}`}>
                        {match.homeClub?.name ?? 'A definir'}
                    </span>
                    <span className="gtm-side-score">{played && home !== null ? home : '-'}</span>
                </span>
                <span className={`gtm-side${awayWon ? ' gtm-side-win' : homeWon ? ' gtm-side-lose' : ''}`}>
                    {match.awayClub ? (
                        <Crest club={match.awayClub} size="md" />
                    ) : (
                        <span className="gtm-slot-disc" aria-hidden="true">?</span>
                    )}
                    <span className={`gtm-side-name${match.awayClub ? '' : ' gtm-side-empty'}`}>
                        {match.awayClub?.name ?? 'A definir'}
                    </span>
                    <span className="gtm-side-score">{played && away !== null ? away : '-'}</span>
                </span>
                {match.venue ? <span className="gtm-match-venue">{match.venue}</span> : null}
            </span>
        </button>
    );
}

// ── CUADRO DE LLAVES ─────────────────────────────────────────────────────

/**
 * El cuadro, en columnas que se corren de a una.
 *
 * En escritorio los conectores se dibujan midiendo el DOM. En un telefono de
 * 390px no entran dos rondas a la vez, asi que no hay linea que dibujar: la
 * jerarquia la da el orden de las columnas y el que avanza queda en blanco y
 * negrita, con el eliminado en gris.
 */
function BracketBoard({
    phase,
    onOpenMatch,
}: {
    phase: MobilePhase;
    onOpenMatch: (match: MobileMatch) => void;
}) {
    if (phase.rounds.length === 0) {
        return (
            <EmptyState
                title="El cuadro esta vacio"
                text="La fase de llaves no tiene rondas. Generalas desde Calendario y se arma el cuadro completo."
            />
        );
    }

    return (
        <div className="gtm-bracket">
            <div className="gtm-bracket-cols">
                {phase.rounds.map((round) => (
                    <div key={round.id} className="gtm-bracket-col">
                        <div className="gtm-bracket-head">{round.name}</div>
                        {round.matches.length === 0 ? (
                            <div className="gtm-serie">
                                <div className="gtm-serie-label">Sin cruces</div>
                            </div>
                        ) : (
                            round.matches.map((match, matchIndex) => {
                                const played = isPlayedStatus(match.status);
                                const home = match.score?.home ?? null;
                                const away = match.score?.away ?? null;
                                const homeWon = played && home !== null && away !== null && home > away;
                                const awayWon = played && home !== null && away !== null && away > home;
                                return (
                                    <button
                                        key={match.id}
                                        type="button"
                                        className="gtm-serie"
                                        onClick={() => onOpenMatch(match)}
                                    >
                                        <div className="gtm-serie-label">Serie {matchIndex + 1}</div>
                                        <div className={`gtm-serie-side${homeWon ? ' gtm-side-win' : awayWon ? ' gtm-side-lose' : ''}`}>
                                            {match.homeClub ? (
                                                <Crest club={match.homeClub} size="md" />
                                            ) : (
                                                <span className="gtm-slot-disc" aria-hidden="true">?</span>
                                            )}
                                            <span className={`gtm-side-name${match.homeClub ? '' : ' gtm-side-empty'}`}>
                                                {match.homeClub?.name ?? 'A definir'}
                                            </span>
                                            <span className="gtm-side-score">
                                                {played && home !== null ? home : '-'}
                                            </span>
                                        </div>
                                        <div className={`gtm-serie-side${awayWon ? ' gtm-side-win' : homeWon ? ' gtm-side-lose' : ''}`}>
                                            {match.awayClub ? (
                                                <Crest club={match.awayClub} size="md" />
                                            ) : (
                                                <span className="gtm-slot-disc" aria-hidden="true">?</span>
                                            )}
                                            <span className={`gtm-side-name${match.awayClub ? '' : ' gtm-side-empty'}`}>
                                                {match.awayClub?.name ?? 'A definir'}
                                            </span>
                                            <span className="gtm-side-score">
                                                {played && away !== null ? away : '-'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── HOJA DE GENERAR CALENDARIO ───────────────────────────────────────────

function GenerateSheet({
    tournamentId,
    phase,
    onClose,
    onDone,
    onError,
}: {
    tournamentId: string;
    phase: MobilePhase;
    onClose: () => void;
    onDone: (message: string) => Promise<void>;
    onError: (message: string) => void;
}) {
    const isBracket = phaseKind(phase.phaseType) === 'bracket';
    const isGroupStage = phase.phaseType === 'group_stage';
    const [numRounds, setNumRounds] = useState(7);
    const [saving, setSaving] = useState(false);
    const existing = phase.rounds.length;

    const run = useCallback(async () => {
        setSaving(true);
        try {
            const response = await fetch(
                `/api/tournaments/${tournamentId}/phases/${phase.id}/generate-rounds`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        isGroupStage
                            ? { num_rounds: numRounds, name_pattern: 'Fecha {n}' }
                            : { name_pattern: 'Fecha {n}' },
                    ),
                },
            );

            if (response.ok) {
                const data = await response.json();
                await onDone(`Se generaron ${data.count ?? 0} fechas.`);
                return;
            }

            let message = `Error ${response.status}`;
            try {
                const payload = await response.json();
                message = payload.error || message;
            } catch {
                // Sin JSON queda el codigo.
            }
            onError(`No se pudo generar el calendario: ${message}`);
        } catch (error) {
            onError(
                `No se pudo generar el calendario: ${error instanceof Error ? error.message : 'error de red'}`,
            );
        } finally {
            setSaving(false);
        }
    }, [tournamentId, phase.id, isGroupStage, numRounds, onDone, onError]);

    return (
        <Sheet title="Generar calendario" onClose={onClose}>
            {isGroupStage ? (
                <>
                    <p className="gtm-sheet-text">
                        Se crean las fechas vacias de la fase de grupos. Los cruces se cargan despues.
                    </p>
                    <div className="gtm-field">
                        <span className="gtm-label">Cuantas fechas</span>
                        <Stepper
                            value={numRounds}
                            min={1}
                            max={60}
                            label="fechas"
                            onChange={setNumRounds}
                        />
                    </div>
                </>
            ) : isBracket ? (
                <p className="gtm-sheet-text">
                    Se arma el cuadro entero con sus rondas y sus cruces vacios, segun cuantos
                    competidores entran a la llave.
                </p>
            ) : (
                <p className="gtm-sheet-text">
                    Se arma el todos contra todos con los competidores activos del torneo, en el
                    formato de la fase. Se crean las fechas y sus partidos, sin dia asignado: el dia
                    se pone despues, fecha por fecha.
                </p>
            )}

            {existing > 0 ? (
                <div className="gtm-notice">
                    <div className="gtm-notice-body">
                        La fase ya tiene {existing} {existing === 1 ? 'fecha' : 'fechas'}. Generar de
                        nuevo <strong>agrega</strong> fechas, no las reemplaza.
                    </div>
                </div>
            ) : null}

            <button type="button" className="gtm-btn gtm-btn-primary" onClick={run} disabled={saving}>
                {saving ? 'Generando' : 'Generar'}
            </button>
            <button type="button" className="gtm-btn" onClick={onClose} disabled={saving}>
                Cancelar
            </button>
        </Sheet>
    );
}
