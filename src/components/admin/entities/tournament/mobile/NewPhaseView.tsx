'use client';

/**
 * Alta de fase: UN formulario, no un wizard.
 *
 * Es la segunda y la tercera diferencia con challenge.place que anoto
 * `GESTOR_TORNEOS_FASES_REDISENO.md`: alla el alta es un formulario, y la
 * pregunta tiene DOS respuestas (Tabla / Llaves) en vez de los cuatro
 * `phase_type` de la base, dos de los cuales son indistinguibles para el
 * gestor. La traduccion de esas dos respuestas a los cuatro tipos vive abajo,
 * en `resolvePhaseType`, y en ningun otro lado.
 *
 * Lo que NO se reescribe:
 *
 * - El payload lo arma `buildPhaseRequestBody`, la funcion pura que ya esta
 *   congelada por un test golden. Este formulario junta un `PhaseFormSnapshot`
 *   y delega. Si manana cambia el payload, cambia en un solo lugar y el test
 *   avisa.
 * - Los defaults por deporte salen de `getPhaseDefaults`. Un torneo de handball
 *   arranca en 2/1/0, uno de rugby en 4/2/0 con bonus, y basquet no muestra el
 *   campo Empate porque no hay empates.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from 'lucide-react';
import {
    getPhaseDefaults,
    hasDraws,
    BASE_TABLE_COLUMNS,
    type PhaseDefaults,
} from '@/lib/data/phaseDefaults';
import { buildPhaseRequestBody, type PhaseType } from '@/lib/data/phasePayload';
import { getDefaultPlayoffStageNames, getPlayoffMatchCounts } from '@/lib/utils/playoffStages';
import type { TiebreakerMetricItem } from '@/types/phase-settings';
import type { OffensiveBonusMode } from '@/lib/bonusRuleMetrics';
import { Stepper, phaseKind, type MobilePhase } from './shared';

/**
 * Lo que una fase ya guardada trae puesto, para que el formulario abra con SUS
 * valores y no con los del deporte. Lo que no se pueda leer cae en el default,
 * que es lo correcto: una fase vieja puede no tener una clave que hoy existe.
 */
function seedFrom(phase: MobilePhase | null | undefined) {
    const settings = (phase?.settings ?? {}) as Record<string, unknown>;
    const groupNames = Array.isArray(settings.group_names) ? settings.group_names : [];
    const points = (settings.pointsSystem ?? {}) as Record<string, unknown>;
    const numberOr = (value: unknown, fallback: number | null) => (
        Number.isFinite(Number(value)) ? Number(value) : fallback
    );
    return {
        kind: phase ? phaseKind(phase.phaseType) : null,
        groups: groupNames.length > 1 ? groupNames.length : 1,
        legs: Number(settings.legs) === 2 ? (2 as const) : (1 as const),
        teamsCount: numberOr(settings.teamsCount, 0) ?? 0,
        advanceCount: numberOr(settings.advanceCount, 0) ?? 0,
        tableColumns: (settings.tableColumns ?? null) as Record<string, boolean> | null,
        tiebreakers: Array.isArray(settings.tiebreakers)
            ? (settings.tiebreakers as TiebreakerMetricItem[])
            : null,
        pointsWin: numberOr(points.win, null),
        pointsDraw: numberOr(points.draw, null),
        pointsLoss: numberOr(points.loss, null),
        allowBonusPoints: typeof points.allowBonusPoints === 'boolean' ? points.allowBonusPoints : null,
        bonusTryMode: (points.bonusTryMode === 'difference' ? 'difference' : 'count') as OffensiveBonusMode,
        carryOver: Boolean(settings.carryOverPreviousPhase),
    };
}

/** Los rotulos de las columnas, con las mismas palabras que usa el escritorio. */
const COLUMN_LABEL: Record<string, string> = {
    posVariation: 'Variación de posición',
    points: 'Puntos',
    played: 'Partidos jugados',
    classification: 'Clasificación',
    won: 'Victorias',
    drawn: 'Empates',
    lost: 'Derrotas',
    percentage: 'Porcentaje',
    extraPlayed: 'Partidos con prórroga',
    extraWon: 'Victorias en prórroga',
    extraDrawn: 'Empates en prórroga',
    extraLost: 'Derrotas en prórroga',
    pointsFor: 'Puntos a favor',
    pointsAgainst: 'Puntos en contra',
    pointsDiff: 'Diferencia de puntos',
};

/*
 * Los desempates llegan con DOS formas de clave: `pointsDiff` (lo que escribe
 * el gestor) y `points_difference` (lo que cargan los scripts). El rótulo se
 * busca por la clave normalizada: antes la pantalla mostraba
 * "points_difference" y "points_for" tal cual.
 */
const TIEBREAKER_LABEL_BY_KEY: Record<string, string> = {
    points: 'Puntos',
    headtohead: 'Enfrentamiento directo',
    pointsdiff: 'Diferencia de puntos',
    pointsfor: 'Puntos a favor',
    pointsagainst: 'Puntos en contra',
    won: 'Victorias',
    wins: 'Victorias',
    lost: 'Derrotas',
    losses: 'Derrotas',
    drawn: 'Empates',
    tries: 'Tries',
    triesfor: 'Tries a favor',
    triesdiff: 'Diferencia de tries',
};

/** "points_difference" y "pointsDiff" son el mismo criterio. */
function normalizeMetric(metric: string): string {
    return metric.replace(/[_\s-]/g, '').toLowerCase().replace('pointsdifference', 'pointsdiff');
}

function tiebreakerLabel(metric: string): string {
    const known = TIEBREAKER_LABEL_BY_KEY[normalizeMetric(metric)];
    if (known) return known;
    const words = metric.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Lo que se puede sumar al desempate desde el teléfono. */
const TIEBREAKER_CANDIDATES = ['points', 'pointsDiff', 'pointsFor', 'pointsAgainst', 'headToHead', 'won', 'lost'];

/** Las dos respuestas del gestor, traducidas a los cuatro tipos de la base. */
function resolvePhaseType(kind: 'table' | 'bracket', groups: number): PhaseType {
    if (kind === 'bracket') return 'playoff';
    return groups > 1 ? 'group_stage' : 'league';
}

function groupNamesFor(groups: number): string[] {
    return Array.from({ length: groups }, (_, index) => `Grupo ${String.fromCharCode(65 + index)}`);
}

const BRACKET_SIZES = [2, 4, 8, 16, 32];

export function NewPhaseView({
    tournamentId,
    sportId,
    tournamentRuleset,
    phaseCount,
    participantsCount,
    hasPreviousPhase,
    editingPhase = null,
    onCancel,
    onCreated,
    onError,
}: {
    tournamentId: string;
    sportId: string | null;
    tournamentRuleset: Record<string, unknown> | null;
    phaseCount: number;
    participantsCount: number;
    hasPreviousPhase: boolean;
    /** Con fase, el formulario edita en vez de dar de alta. */
    editingPhase?: MobilePhase | null;
    onCancel: () => void;
    onCreated: (message: string) => void;
    onError: (message: string) => void;
}) {
    const isEditing = Boolean(editingPhase);
    const seed = useMemo(() => seedFrom(editingPhase), [editingPhase]);
    const defaults: PhaseDefaults = useMemo(
        () => getPhaseDefaults({ sportId, tournamentRuleset }),
        [sportId, tournamentRuleset],
    );
    const sportHasDraws = hasDraws(sportId);

    const [name, setName] = useState(editingPhase?.name ?? `Fase ${phaseCount + 1}`);
    const [nameTouched, setNameTouched] = useState(false);
    const [kind, setKind] = useState<'table' | 'bracket' | null>(seed.kind);
    const [groups, setGroups] = useState(seed.groups);
    const [legs, setLegs] = useState<1 | 2>(seed.legs);
    const [bracketTeams, setBracketTeams] = useState(
        seed.kind === 'bracket' && seed.teamsCount >= 2 ? seed.teamsCount : 8,
    );
    const [advanceCount, setAdvanceCount] = useState(seed.advanceCount);

    const [pointsWin, setPointsWin] = useState(seed.pointsWin ?? defaults.points.win);
    const [pointsDraw, setPointsDraw] = useState(seed.pointsDraw ?? defaults.points.draw);
    const [pointsLoss, setPointsLoss] = useState(seed.pointsLoss ?? defaults.points.loss);
    const [allowBonusPoints, setAllowBonusPoints] = useState(
        seed.allowBonusPoints ?? defaults.points.allowBonusPoints,
    );
    const [bonusTryMode, setBonusTryMode] = useState<OffensiveBonusMode>(seed.bonusTryMode);
    const [tableColumns, setTableColumns] = useState<Record<string, boolean>>(() => {
        if (seed.tableColumns) return { ...seed.tableColumns };
        const columns: Record<string, boolean> = { ...defaults.columns };
        for (const stat of defaults.statColumns) columns[stat.key] = true;
        return columns;
    });
    const [tiebreakers, setTiebreakers] = useState<TiebreakerMetricItem[]>(
        seed.tiebreakers ?? defaults.tiebreakers,
    );
    const [carryOver, setCarryOver] = useState(seed.carryOver);

    /* Qué fila de "Reglas de la tabla" está abierta. Una por vez: con todo
       abierto el formulario volvía a ser el bloque de 1.900px que era. */
    const [openRule, setOpenRule] = useState<'points' | 'tiebreak' | 'columns' | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [saving, setSaving] = useState(false);

    /* Los defaults se re-siembran cuando cambia el deporte del torneo. Sin esto,
       un formulario abierto antes del cambio guardaria el puntaje del deporte
       viejo. */
    useEffect(() => {
        // Al editar no se re-siembra: pisaria lo que la fase ya tiene guardado.
        if (isEditing) return;
        setPointsWin(defaults.points.win);
        setPointsDraw(defaults.points.draw);
        setPointsLoss(defaults.points.loss);
        setAllowBonusPoints(defaults.points.allowBonusPoints);
        setTiebreakers(defaults.tiebreakers);
        const columns: Record<string, boolean> = { ...defaults.columns };
        for (const stat of defaults.statColumns) columns[stat.key] = true;
        setTableColumns(columns);
    }, [defaults, isEditing]);

    const trimmedName = name.trim();
    const nameError = nameTouched && !trimmedName ? 'Poné un nombre a la fase.' : null;

    /* El boton deshabilitado dice que falta, no se queda mudo. */
    const missing = !trimmedName
        ? 'Poné un nombre a la fase.'
        : !kind
            ? 'Elegí si la fase se juega por tabla o por llaves.'
            : null;

    /* ¿Hay algo para perder? Cancelar con cambios pide confirmación; sin
       cambios, sale directo. */
    const formSignature = JSON.stringify([
        name, kind, groups, legs, bracketTeams, advanceCount, pointsWin, pointsDraw, pointsLoss,
        allowBonusPoints, bonusTryMode, tableColumns, tiebreakers, carryOver,
    ]);
    const [initialSignature] = useState(formSignature);
    const isDirty = formSignature !== initialSignature;

    /* El motor de la tabla ordena por `priority`, no por la posición en el
       array: cada cambio renumera, o el orden de la pantalla mentiría. */
    const renumber = (items: TiebreakerMetricItem[]) =>
        items.map((item, index) => ({ ...item, enabled: true, priority: index + 1 }));

    function moveTiebreaker(index: number, delta: -1 | 1) {
        setTiebreakers((current) => {
            const target = index + delta;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return renumber(next);
        });
    }

    function removeTiebreaker(index: number) {
        setTiebreakers((current) => renumber(current.filter((_, position) => position !== index)));
    }

    function addTiebreaker(metric: string) {
        setTiebreakers((current) => renumber([
            ...current,
            { metric, enabled: true, order: 'desc', priority: current.length + 1 },
        ]));
    }

    async function handleSave() {
        if (!kind || !trimmedName || saving) return;
        setSaving(true);

        const phaseType = resolvePhaseType(kind, groups);
        const teamsCount = kind === 'bracket' ? bracketTeams : participantsCount;
        const stageNames = kind === 'bracket' ? getDefaultPlayoffStageNames(bracketTeams) : [];
        const stageMatchCounts = kind === 'bracket'
            ? getPlayoffMatchCounts(bracketTeams, stageNames.length)
            : [];

        /* Esta pantalla no edita las etiquetas de la tabla, pero el endpoint
           PISA `settings` entero en vez de mezclarlo: mandar `groupLabels: []`
           al editar borraba TODAS las que se hubieran cargado desde "Etiquetas
           de la tabla". Se reenvian tal cual estaban. */
        const etiquetasActuales = Array.isArray(
            (editingPhase?.settings as { groupLabels?: unknown } | undefined)?.groupLabels,
        )
            ? ((editingPhase?.settings as { groupLabels?: unknown[] }).groupLabels ?? [])
            : [];

        const body = buildPhaseRequestBody(
            {
                phaseType,
                isCircuit: false,
                placementPoints: [],
                teamsCount,
                advanceCount: kind === 'bracket' ? 0 : advanceCount,
                legs,
                tableColumns,
                groupLabels: etiquetasActuales as never,
                groupNames: phaseType === 'group_stage' ? groupNamesFor(groups) : [],
                playoffStageNames: stageNames,
                playoffStageMatchCounts: stageMatchCounts,
                playoffTeamsCount: kind === 'bracket' ? bracketTeams : 0,
                /* El celular no tiene constructor: las llaves que crea se cargan a mano. */
                bracketMode: 'manual',
                statsAssignment: 'played',
                carryOverPreviousPhase: carryOver,
                canCarryOverPreviousPhase: hasPreviousPhase,
                pointsWin,
                pointsDraw: sportHasDraws ? pointsDraw : 0,
                pointsLoss,
                allowBonusPoints,
                bonusTryMode,
                useExtraTimePoints: false,
                pointsWinExtra: pointsWin,
                pointsDrawExtra: pointsDraw,
                pointsLossExtra: pointsLoss,
                tiebreakers,
            },
            {
                phaseName: trimmedName,
                editingPhaseId: editingPhase?.id ?? null,
                editingPhase: editingPhase ? { is_active: editingPhase.isActive } : null,
                phaseCount,
            },
        );

        try {
            const response = await fetch(
                editingPhase
                    ? `/api/tournaments/${tournamentId}/phases/${editingPhase.id}`
                    : `/api/tournaments/${tournamentId}/phases`,
                {
                    method: editingPhase ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
            );

            if (response.ok) {
                onCreated(editingPhase ? 'Fase guardada.' : `Fase "${trimmedName}" creada.`);
                return;
            }

            /* El error de la base no llega crudo a la pantalla: se lee el
               mensaje del endpoint, que ya viene en castellano. */
            let message = `Error ${response.status}`;
            try {
                const payload = await response.json();
                message = payload.error || payload.message || message;
            } catch {
                // Respuesta sin JSON: queda el codigo, que es mejor que nada.
            }
            onError(`No se pudo guardar la fase: ${message}`);
        } catch (error) {
            onError(
                `No se pudo guardar la fase: ${error instanceof Error ? error.message : 'error de red'}`,
            );
        } finally {
            setSaving(false);
        }
    }

    const statKeys = new Set(defaults.statColumns.map((stat) => stat.key));
    const columnKeys = [...BASE_TABLE_COLUMNS, ...defaults.statColumns.map((stat) => stat.key)];
    const visibleColumns = columnKeys.filter((key) => tableColumns[key]).length;
    const usedMetrics = new Set(tiebreakers.map((item) => normalizeMetric(item.metric)));
    const addableMetrics = TIEBREAKER_CANDIDATES.filter((metric) => !usedMetrics.has(normalizeMetric(metric)));

    /* El resumen de cada fila plegada: se lee la regla sin abrirla. */
    const pointsSummary = [
        sportHasDraws ? `${pointsWin} · ${pointsDraw} · ${pointsLoss}` : `${pointsWin} · ${pointsLoss}`,
        defaults.bonus && allowBonusPoints ? 'con bonus' : null,
    ].filter(Boolean).join(', ');
    const tiebreakSummary = tiebreakers.length === 0
        ? 'Sin criterios'
        : tiebreakers.length <= 2
            ? tiebreakers.map((item) => tiebreakerLabel(item.metric)).join(', ')
            : `${tiebreakerLabel(tiebreakers[0].metric)}, ${tiebreakerLabel(tiebreakers[1].metric)} y ${tiebreakers.length - 2} más`;

    /* Una fila plegable de "Reglas de la tabla". Es una función que devuelve
       JSX y no un componente: definido adentro de este, un componente se
       volvería a montar en cada render y los campos perderían el foco con cada
       tecla. */
    const renderRule = (
        id: 'points' | 'tiebreak' | 'columns',
        title: string,
        summary: string,
        children: ReactNode,
    ) => {
        const open = openRule === id;
        return (
            <div className="gtm-rule">
                <button
                    type="button"
                    className="gtm-rule-head"
                    aria-expanded={open}
                    onClick={() => setOpenRule(open ? null : id)}
                >
                    <span className="gtm-rule-title">{title}</span>
                    <span className="gtm-rule-summary">{summary}</span>
                    <ChevronDown size={18} className="gtm-rule-chevron" aria-hidden="true" />
                </button>
                {open ? <div className="gtm-rule-body">{children}</div> : null}
            </div>
        );
    };

    return (
        <>
            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-phase-name">Nombre de la fase</label>
                <input
                    id="gtm-phase-name"
                    className={`gtm-input${nameError ? ' gtm-input-invalid' : ''}`}
                    value={name}
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => setNameTouched(true)}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? 'gtm-phase-name-error' : undefined}
                />
                {nameError ? (
                    <span className="gtm-error" id="gtm-phase-name-error" role="alert">{nameError}</span>
                ) : null}
            </div>

            <div className="gtm-field">
                <span className="gtm-label" id="gtm-kind-label">Tipo de fase</span>
                <div className="gtm-choice" role="radiogroup" aria-labelledby="gtm-kind-label">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={kind === 'table'}
                        className="gtm-choice-btn"
                        onClick={() => setKind('table')}
                    >
                        <span className="gtm-choice-title">Tabla</span>
                        <span className="gtm-choice-desc">
                            Todos contra todos y una tabla de posiciones.
                        </span>
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={kind === 'bracket'}
                        className="gtm-choice-btn"
                        onClick={() => setKind('bracket')}
                    >
                        <span className="gtm-choice-title">Llaves</span>
                        <span className="gtm-choice-desc">
                            Eliminación directa: el que pierde queda afuera.
                        </span>
                    </button>
                </div>
            </div>

            {kind === 'table' ? (
                <>
                    <div className="gtm-field">
                        <span className="gtm-label">Número de grupos</span>
                        <span className="gtm-help">
                            Con un solo grupo es una liga. Con dos o más, fase de grupos.
                        </span>
                        <Stepper value={groups} min={1} max={8} label="grupos" onChange={setGroups} />
                    </div>
                    <div className="gtm-field">
                        <span className="gtm-label" id="gtm-legs-label">Formato de partido</span>
                        <div className="gtm-choice" role="radiogroup" aria-labelledby="gtm-legs-label">
                            <button
                                type="button"
                                role="radio"
                                aria-checked={legs === 1}
                                className="gtm-choice-btn"
                                style={{ minHeight: 66 }}
                                onClick={() => setLegs(1)}
                            >
                                <span className="gtm-choice-title">Solo ida</span>
                                <span className="gtm-choice-desc">Se cruzan una vez.</span>
                            </button>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={legs === 2}
                                className="gtm-choice-btn"
                                style={{ minHeight: 66 }}
                                onClick={() => setLegs(2)}
                            >
                                <span className="gtm-choice-title">Ida y vuelta</span>
                                <span className="gtm-choice-desc">Se cruzan dos veces.</span>
                            </button>
                        </div>
                    </div>
                    {/* Estaba escondido en "Opciones avanzadas", y es de lo
                        primero que se define de una fase de grupos. */}
                    <div className="gtm-field">
                        <span className="gtm-label">{groups > 1 ? 'Clasifican por grupo' : 'Clasifican'}</span>
                        <span className="gtm-help">
                            Cuántos pasan a la fase siguiente. Cero si todavía no se sabe.
                        </span>
                        <Stepper
                            value={advanceCount}
                            min={0}
                            max={16}
                            label="clasificados"
                            onChange={setAdvanceCount}
                        />
                    </div>
                </>
            ) : null}

            {kind === 'bracket' ? (
                <>
                    <div className="gtm-field">
                        <span className="gtm-label" id="gtm-bracket-label">Equipos en la llave</span>
                        <span className="gtm-help">
                            Define cuántas rondas tiene el cuadro. El torneo tiene {participantsCount}{' '}
                            {participantsCount === 1 ? 'equipo' : 'equipos'}.
                        </span>
                        <div
                            className="gtm-chip-grid"
                            role="radiogroup"
                            aria-labelledby="gtm-bracket-label"
                        >
                            {BRACKET_SIZES.map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    role="radio"
                                    aria-checked={bracketTeams === size}
                                    className="gtm-chip"
                                    onClick={() => setBracketTeams(size)}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                        <span className="gtm-help">
                            {getDefaultPlayoffStageNames(bracketTeams).join(' · ')}
                        </span>
                    </div>
                    <div className="gtm-field">
                        <span className="gtm-label" id="gtm-serie-label">Partidos por serie</span>
                        <div className="gtm-choice" role="radiogroup" aria-labelledby="gtm-serie-label">
                            <button
                                type="button"
                                role="radio"
                                aria-checked={legs === 1}
                                className="gtm-choice-btn"
                                style={{ minHeight: 66 }}
                                onClick={() => setLegs(1)}
                            >
                                <span className="gtm-choice-title">Partido único</span>
                                <span className="gtm-choice-desc">Se define en uno.</span>
                            </button>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={legs === 2}
                                className="gtm-choice-btn"
                                style={{ minHeight: 66 }}
                                onClick={() => setLegs(2)}
                            >
                                <span className="gtm-choice-title">Ida y vuelta</span>
                                <span className="gtm-choice-desc">Dos partidos por serie.</span>
                            </button>
                        </div>
                    </div>
                </>
            ) : null}

            {kind && hasPreviousPhase ? (
                <label className="gtm-check">
                    <input
                        type="checkbox"
                        checked={carryOver}
                        onChange={(event) => setCarryOver(event.target.checked)}
                    />
                    <span>Arrastrar los puntos de la fase anterior</span>
                </label>
            ) : null}

            {/* Reglas de la tabla: tres filas que se leen cerradas (cada una
                dice su valor) y se abren de a una. Antes era "Opciones
                avanzadas", un único bloque de ~1.000px con puntos, clasificados,
                arrastre, veintiuna columnas y un desempate que no se podía
                cambiar desde el teléfono. Una llave no tiene tabla: no aparecen. */}
            {kind === 'table' ? (
                <div className="gtm-field">
                    <span className="gtm-label">Reglas de la tabla</span>
                    <div className="gtm-rules">
                        {renderRule('points', 'Puntos', pointsSummary, (
                            <>
                                <span className="gtm-help">
                                    Ya vienen los del deporte del torneo. Cambialos solo si este
                                    torneo puntúa distinto.
                                </span>
                                <div className="gtm-triple">
                                    <label className="gtm-field">
                                        <span className="gtm-help">Victoria</span>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            className="gtm-input gtm-input-num"
                                            value={pointsWin}
                                            onChange={(event) => setPointsWin(Number(event.target.value) || 0)}
                                        />
                                    </label>
                                    {sportHasDraws ? (
                                        <label className="gtm-field">
                                            <span className="gtm-help">Empate</span>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                className="gtm-input gtm-input-num"
                                                value={pointsDraw}
                                                onChange={(event) => setPointsDraw(Number(event.target.value) || 0)}
                                            />
                                        </label>
                                    ) : null}
                                    <label className="gtm-field">
                                        <span className="gtm-help">Derrota</span>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            className="gtm-input gtm-input-num"
                                            value={pointsLoss}
                                            onChange={(event) => setPointsLoss(Number(event.target.value) || 0)}
                                        />
                                    </label>
                                </div>
                                {defaults.bonus ? (
                                    <>
                                        <label className="gtm-check">
                                            <input
                                                type="checkbox"
                                                checked={allowBonusPoints}
                                                onChange={(event) => setAllowBonusPoints(event.target.checked)}
                                            />
                                            <span>Puntos bonus</span>
                                        </label>
                                        {allowBonusPoints ? (
                                            <div className="gtm-chip-grid" role="radiogroup" aria-label="Bonus ofensivo">
                                                <button
                                                    type="button"
                                                    role="radio"
                                                    className="gtm-chip"
                                                    aria-checked={bonusTryMode === 'count'}
                                                    onClick={() => setBonusTryMode('count')}
                                                >
                                                    Por cantidad de tries
                                                </button>
                                                <button
                                                    type="button"
                                                    role="radio"
                                                    className="gtm-chip"
                                                    aria-checked={bonusTryMode === 'difference'}
                                                    onClick={() => setBonusTryMode('difference')}
                                                >
                                                    Por diferencia de tries
                                                </button>
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}
                            </>
                        ))}

                        {renderRule('tiebreak', 'Desempate', tiebreakSummary, (
                            <>
                                <span className="gtm-help">
                                    Si dos equipos empatan en puntos, se aplican en este orden.
                                </span>
                                <div className="gtm-order-list">
                                    {tiebreakers.map((item, index) => {
                                        const label = tiebreakerLabel(item.metric);
                                        return (
                                            <div key={`${item.metric}-${index}`} className="gtm-order-item">
                                                <span className="gtm-order-n">{index + 1}</span>
                                                <span className="gtm-grow">{label}</span>
                                                <button
                                                    type="button"
                                                    className="gtm-order-btn"
                                                    onClick={() => moveTiebreaker(index, -1)}
                                                    disabled={index === 0}
                                                    aria-label={`Subir ${label}`}
                                                >
                                                    <ArrowUp size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="gtm-order-btn"
                                                    onClick={() => moveTiebreaker(index, 1)}
                                                    disabled={index === tiebreakers.length - 1}
                                                    aria-label={`Bajar ${label}`}
                                                >
                                                    <ArrowDown size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="gtm-order-btn"
                                                    onClick={() => removeTiebreaker(index)}
                                                    aria-label={`Quitar ${label}`}
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                {addableMetrics.length > 0 ? (
                                    <div className="gtm-chip-grid" role="group" aria-label="Agregar criterio">
                                        {addableMetrics.map((metric) => (
                                            <button
                                                key={metric}
                                                type="button"
                                                className="gtm-chip gtm-chip-add"
                                                onClick={() => addTiebreaker(metric)}
                                            >
                                                <Plus size={14} aria-hidden="true" />
                                                {tiebreakerLabel(metric)}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </>
                        ))}

                        {renderRule('columns', 'Columnas', `${visibleColumns} de ${columnKeys.length} visibles`, (
                            <>
                                <span className="gtm-help">
                                    Qué se ve en la tabla pública. No cambia cómo se ordena.
                                </span>
                                <div className="gtm-chip-grid">
                                    {columnKeys.map((key) => {
                                        const label = COLUMN_LABEL[key]
                                            ?? defaults.statColumns.find((stat) => stat.key === key)?.label
                                            ?? key;
                                        const isStat = statKeys.has(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                className="gtm-chip"
                                                aria-pressed={Boolean(tableColumns[key])}
                                                onClick={() =>
                                                    setTableColumns((current) => ({
                                                        ...current,
                                                        [key]: !current[key],
                                                    }))
                                                }
                                            >
                                                {label}{isStat ? ' *' : ''}
                                            </button>
                                        );
                                    })}
                                </div>
                                <span className="gtm-help">
                                    Las marcadas con * son estadísticas del deporte que este torneo
                                    registra de verdad.
                                </span>
                            </>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Barra fija al pie, en la zona del pulgar, en lugar de la barra de
                secciones: mientras se edita no hay a dónde ir sin decidir antes
                qué pasa con los cambios. Antes Guardar quedaba al final del
                formulario, a ~1.900px con las opciones abiertas. */}
            <div className="gtm-editbar">
                {confirmDiscard ? (
                    <>
                        <span className="gtm-editbar-note">¿Descartar los cambios?</span>
                        <div className="gtm-editbar-row">
                            <button type="button" className="gtm-btn" onClick={() => setConfirmDiscard(false)}>
                                Seguir editando
                            </button>
                            <button type="button" className="gtm-btn gtm-btn-danger" onClick={onCancel}>
                                Descartar
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {missing ? <span className="gtm-editbar-note">{missing}</span> : null}
                        <div className="gtm-editbar-row">
                            <button
                                type="button"
                                className="gtm-btn"
                                onClick={() => (isDirty ? setConfirmDiscard(true) : onCancel())}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="gtm-btn gtm-btn-primary"
                                disabled={Boolean(missing) || saving}
                                onClick={handleSave}
                            >
                                {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear fase'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
