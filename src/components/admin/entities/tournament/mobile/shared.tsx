'use client';

/**
 * Lo que comparten las cinco pantallas del gestor mobile: los tipos que
 * devuelve el fixture, los rotulos, y los cuatro primitivos de UI que se
 * repiten (hoja inferior, contador, vacio, esqueleto).
 *
 * Nada de esto sabe de red ni de rutas: son datos que entran y markup que sale.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { formatDateInTimeZone } from '@/lib/timezone';

// ── TIPOS ────────────────────────────────────────────────────────────────
// Recortes de `TournamentFixture` (src/lib/types/fixture.ts): sólo los campos
// que estas pantallas leen. Se declaran aparte para que el dia que el fixture
// crezca, esto no arrastre campos que nadie usa.

export type MobileClub = {
    id: string;
    name: string;
    shortName: string | null;
    logo: string | null;
} | null;

export type MobileMatch = {
    id: string;
    roundId: string | null;
    roundLabel?: string | null;
    dateTime: string;
    venue: string | null;
    status: string;
    score: { home: number; away: number } | null;
    homeClub: MobileClub;
    awayClub: MobileClub;
    homeClubId: string | null;
    awayClubId: string | null;
};

export type MobileRound = {
    id: string;
    name: string;
    orderIndex: number;
    /** El PERIODO de la fecha. Ver `lib/matchWeekend.ts`: una fecha no es un dia. */
    startDate?: string | null;
    endDate?: string | null;
    matches: MobileMatch[];
};

export type MobilePhase = {
    id: string;
    name: string;
    phaseType: string;
    orderIndex: number;
    isActive: boolean;
    settings: Record<string, unknown>;
    rounds: MobileRound[];
};

export type MobileParticipant = {
    id: string;
    clubId: string | null;
    name: string;
    shortCode: string | null;
    logo: string | null;
};

export type MobileFixture = {
    tournamentName: string;
    tournamentSeason: string | null;
    phases: MobilePhase[];
    participants: MobileParticipant[];
    matchesTruncated?: boolean;
};

export type StandingRow = {
    teamId: string;
    team: { name: string; logo: string | null };
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points_for: number;
    points_against: number;
    difference: number;
    total_points: number;
};

/** Etiqueta de grupo tal como la guarda `settings.groupLabels`. */
export type PhaseZone = {
    id?: string;
    label?: string;
    color?: string;
    positions?: number[];
};

// ── ROTULOS Y DERIVADOS ──────────────────────────────────────────────────

/**
 * Los cuatro `phase_type` de la base, reducidos a las DOS preguntas que hace el
 * gestor: se juega una tabla, o se juega un cuadro.
 *
 * `league` y `group_stage` son la misma pregunta con distinta cantidad de
 * grupos; `playoff` y `knockout` son el mismo cuadro con distinto nombre
 * historico. Esta funcion es el unico lugar donde vive esa reduccion.
 */
export function phaseKind(phaseType: string): 'table' | 'bracket' {
    return phaseType === 'playoff' || phaseType === 'knockout' ? 'bracket' : 'table';
}

export function phaseTypeLabel(phaseType: string): string {
    return phaseKind(phaseType) === 'bracket' ? 'Llaves' : 'Tabla';
}

/** "Fase 2 · Tabla · Ida y vuelta" */
export function phaseSubtitle(phase: MobilePhase): string {
    const legs = Number((phase.settings as { legs?: unknown })?.legs ?? 1);
    const format = phaseKind(phase.phaseType) === 'bracket'
        ? (legs === 2 ? 'Serie de ida y vuelta' : 'Partido único')
        : (legs === 2 ? 'Ida y vuelta' : 'Solo ida');
    return `Fase ${phase.orderIndex} · ${phaseTypeLabel(phase.phaseType)} · ${format}`;
}

/** "1 grupo · 8 competidores" — lo que challenge.place pone a la derecha. */
export function phaseMeta(phase: MobilePhase): string {
    const groupNames = (phase.settings as { group_names?: unknown })?.group_names;
    const groups = Array.isArray(groupNames) && groupNames.length > 0 ? groupNames.length : 1;
    const teams = Number((phase.settings as { teamsCount?: unknown })?.teamsCount ?? 0);
    // "1 grupo" no dice nada: una tabla sola no tiene grupos, y una llave tampoco.
    const parts = groups > 1 ? [`${groups} grupos`] : [];
    if (teams > 0) parts.push(`${teams} equipos`);
    return parts.join(' · ');
}

export function matchCountOf(phase: MobilePhase): number {
    return phase.rounds.reduce((total, round) => total + round.matches.length, 0);
}

export function isPlayedStatus(status: string): boolean {
    return status === 'final';
}

const STATUS_LABEL: Record<string, string> = {
    scheduled: 'Programado',
    live: 'En juego',
    final: 'Finalizado',
    postponed: 'Postergado',
    suspended: 'Suspendido',
    cancelled: 'Cancelado',
};

export function matchStatusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
}

const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    active: 'En curso',
    archived: 'Archivado',
};

export function tournamentStatusLabel(status: string): string {
    return TOURNAMENT_STATUS_LABEL[status] ?? status;
}

/**
 * "Sab 15/3 · 16:00". Siempre con `timeZone` explicito: el servidor guarda en
 * UTC y sin la zona el horario de un partido de la noche se corre de dia.
 */
export function formatWhen(dateTime: string | null | undefined): string {
    if (!dateTime) return 'Sin fecha';
    const day = formatDateInTimeZone(dateTime, 'es-AR', {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
    });
    const time = formatDateInTimeZone(dateTime, 'es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    if (!day) return 'Sin fecha';
    return time ? `${day} · ${time}` : day;
}

/**
 * "12/3" y "16:00" por separado, para la columna de hora del partido.
 *
 * La web muestra solo la hora porque agrupa por dia; aca un mismo "fecha 5"
 * puede tener partidos de sabado y de domingo, asi que la columna lleva las dos
 * lineas. Con `timeZone` explicito, como todo lo que formatea fechas en este
 * proyecto: el servidor guarda en UTC y sin la zona un partido de la noche se
 * corre de dia.
 */
export function formatDayShort(dateTime: string | null | undefined): string {
    if (!dateTime) return '--';
    return formatDateInTimeZone(dateTime, 'es-AR', {
        day: 'numeric',
        month: 'numeric',
    }) || '--';
}

export function formatTimeOnly(dateTime: string | null | undefined): string {
    if (!dateTime) return '';
    return formatDateInTimeZone(dateTime, 'es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }) || '';
}

export function formatDayOnly(dateTime: string | null | undefined): string {
    if (!dateTime) return 'Sin fecha';
    return formatDateInTimeZone(dateTime, 'es-AR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }) ?? 'Sin fecha';
}

/** Las zonas de la tabla, en la forma que guarda el formulario de fase. */
export function phaseZones(phase: MobilePhase | null | undefined): PhaseZone[] {
    const raw = (phase?.settings as { groupLabels?: unknown })?.groupLabels;
    return Array.isArray(raw) ? (raw as PhaseZone[]) : [];
}

/**
 * La zona que le toca a una posicion, si hay alguna.
 *
 * La sigla que devuelve no es decorativa: la franja de color sola no alcanza
 * para decir "clasifica", y esa fue una de las nueve correcciones de la pasada
 * de UI/UX sobre el mockup de fases.
 */
export function zoneForPosition(
    zones: PhaseZone[],
    position: number,
): { label: string; short: string; color: string } | null {
    for (const zone of zones) {
        if (Array.isArray(zone.positions) && zone.positions.includes(position)) {
            const label = zone.label || 'Zona';
            const short = label
                .split(/\s+/)
                .map((word) => word[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
            return { label, short, color: zone.color || '#38BDF8' };
        }
    }
    return null;
}

// ── PRIMITIVOS DE UI ─────────────────────────────────────────────────────

/**
 * Hoja inferior. Se cierra con Escape y con el fondo, devuelve el foco al
 * elemento que la abrio, y atrapa el foco adentro mientras esta abierta.
 */
export function Sheet({
    title,
    onClose,
    children,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        openerRef.current = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        panel?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !panel) return;
            const focusables = Array.from(
                panel.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ),
            ).filter((element) => !element.hasAttribute('disabled'));
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            openerRef.current?.focus?.();
        };
    }, [onClose]);

    return (
        <div
            className="gtm-sheet-back"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="gtm-sheet" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
                <div className="gtm-sheet-grip" />
                <div className="gtm-row">
                    <div className="gtm-sheet-title gtm-grow">{title}</div>
                    <button type="button" className="gtm-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <X size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

/** Contador +/- con areas tactiles de 44 y el valor en mono. */
export function Stepper({
    value,
    min,
    max,
    step = 1,
    label,
    onChange,
}: {
    value: number;
    min: number;
    max: number;
    step?: number;
    label: string;
    onChange: (next: number) => void;
}) {
    return (
        <div className="gtm-stepper">
            <button
                type="button"
                className="gtm-icon-btn"
                onClick={() => onChange(Math.max(min, value - step))}
                disabled={value <= min}
                aria-label={`Restar a ${label}`}
            >
                <Minus size={18} />
            </button>
            <output className="gtm-stepper-v" aria-live="polite">{value}</output>
            <button
                type="button"
                className="gtm-icon-btn"
                onClick={() => onChange(Math.min(max, value + step))}
                disabled={value >= max}
                aria-label={`Sumar a ${label}`}
            >
                <Plus size={18} />
            </button>
        </div>
    );
}

export function EmptyState({
    title,
    text,
    action,
}: {
    title: string;
    text: string;
    action?: ReactNode;
}) {
    return (
        <div className="gtm-empty">
            <div className="gtm-empty-title">{title}</div>
            <p className="gtm-empty-text">{text}</p>
            {action}
        </div>
    );
}

/** Esqueletos con el alto real de la fila: al llegar el dato nada salta. */
export function SkeletonList({ rows = 3, height = 66 }: { rows?: number; height?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="gtm-skel" style={{ height }} />
            ))}
        </div>
    );
}
