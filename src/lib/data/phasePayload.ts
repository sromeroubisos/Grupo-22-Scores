/**
 * El cuerpo que el gestor manda al crear o editar una fase.
 *
 * Vivía adentro de `handleCreatePhase`, fundido con los veinticinco `useState`
 * del formulario: un `JSON.stringify` de ochenta líneas que leía el estado
 * directo. Así no se puede cambiar la forma del formulario sin arriesgar el
 * payload, y el payload tiene claves que ninguna pantalla mira pero que fases
 * viejas sí leen.
 *
 * Acá está aparte y es una función pura, así que se puede congelar con un test.
 * Ese test (`phasePayload.test.ts`) no juzga si el objeto está bien diseñado:
 * fija lo que se escribe HOY, duplicados incluidos, para que el rediseño del
 * formulario no cambie el payload sin que nadie se entere.
 *
 * Las tres claves de playoff repetidas —`playoff_stage_names`,
 * `playoffStageMatchCounts` y `playoff_match_counts`— NO son un descuido: son
 * tres formas del mismo dato que leen fases cargadas en distintas épocas. Sacar
 * una no rompe ninguna pantalla del gestor; rompe una llave del año pasado, y se
 * descubre tres semanas después.
 */

import { resolvePlayoffStagesForTeams } from '../utils/playoffStages.ts';
import type { GroupLabel, TiebreakerMetricItem } from '../../types/phase-settings.ts';
type OffensiveBonusMode = 'count' | 'difference';

export type PhaseType = 'league' | 'knockout' | 'group_stage' | 'playoff';

/**
 * Lo que el formulario tiene cargado en el momento de guardar.
 *
 * Es una foto del estado, no el estado: el componente decide cómo lo guarda
 * (hoy son `useState` sueltos, mañana puede ser un reducer) y arma esto al
 * enviar. Por eso `carryOver` llega en dos booleanos y no resuelto — el `&&`
 * entre "lo pidió el gestor" y "hay fase anterior" es parte de lo que se congela.
 */
export interface PhaseFormSnapshot {
    phaseType: PhaseType;
    isCircuit: boolean;
    placementPoints: { position: number; points: number }[];

    teamsCount: number | '';
    advanceCount: number | '';
    legs: 1 | 2;

    tableColumns: Record<string, boolean>;
    groupLabels: GroupLabel[];
    groupNames: string[];

    /** Los nombres y la cantidad de partidos por ronda, como los dejó el gestor. */
    playoffStageNames: string[];
    playoffStageMatchCounts: number[];
    /** Cuántos equipos entran al cuadro: define cuántas rondas sobreviven. */
    playoffTeamsCount: number;
    /**
     * Cómo se cargan las llaves. 'manual' arma los slots vacíos de arriba;
     * 'auto' deja el cuadro en manos del constructor, que crea rondas, partidos
     * y reglas de avance. Sólo viaja en fases playoff.
     */
    bracketMode: 'manual' | 'auto';

    statsAssignment: 'played' | 'starters';

    /** Lo que marcó el gestor. */
    carryOverPreviousPhase: boolean;
    /** Si existe una fase anterior de la que arrastrar. Sin ella, lo anterior no cuenta. */
    canCarryOverPreviousPhase: boolean;

    pointsWin: number;
    pointsDraw: number;
    pointsLoss: number;
    allowBonusPoints: boolean;
    bonusTryMode: OffensiveBonusMode;

    useExtraTimePoints: boolean;
    pointsWinExtra: number;
    pointsDrawExtra: number;
    pointsLossExtra: number;

    tiebreakers: TiebreakerMetricItem[];
}

/** Los datos de la fase que no salen del formulario sino de la lista de fases. */
export interface PhaseEnvelope {
    phaseName: string;
    /** `null` al crear. */
    editingPhaseId: string | null;
    /** La fase que se está editando, si se encontró en la lista. */
    editingPhase: { is_active: boolean } | null;
    /** Cuántas fases tiene ya el torneo. */
    phaseCount: number;
}

function toCount(value: number | ''): number {
    return value === '' ? 0 : Number(value);
}

/** El objeto `settings` de la fase, tal cual viaja al endpoint. */
export function buildPhaseSettings(form: PhaseFormSnapshot): Record<string, unknown> {
    const sanitizedGroupNames = form.phaseType === 'group_stage'
        ? form.groupNames.map(name => name.trim()).filter(Boolean)
        : [];

    const sanitizedPlayoffStages = (form.phaseType === 'playoff' || form.phaseType === 'knockout')
        ? resolvePlayoffStagesForTeams(
            {
                teamsCount: form.playoffTeamsCount,
                playoffStages: form.playoffStageNames.map((name, index) => ({
                    name,
                    matchCount: form.playoffStageMatchCounts[index],
                })),
            },
            form.playoffTeamsCount,
        )
        : [];

    const sanitizedPlayoffStageNames = sanitizedPlayoffStages.map(stage => stage.name);
    const sanitizedPlayoffStageMatchCounts = sanitizedPlayoffStages.map(stage => stage.matchCount);

    const carryOverEnabled = form.carryOverPreviousPhase && form.canCarryOverPreviousPhase;

    return {
        ...(form.isCircuit ? { circuit: { pointsByPlacement: form.placementPoints } } : {}),
        teamsCount: toCount(form.teamsCount),
        advanceCount: toCount(form.advanceCount),
        legs: form.legs,
        tableColumns: form.tableColumns,
        groupLabels: form.groupLabels,
        statsAssignment: form.statsAssignment,
        carryOverPreviousPhase: carryOverEnabled,
        carryOver: {
            enabled: carryOverEnabled,
            source: 'previous_phase',
            sourcePhaseId: null,
            mode: 'table_totals',
            include: {
                standings: true,
                points: true,
                scores: true,
                form: true,
            },
        },
        group_names: sanitizedGroupNames,
        ...((form.phaseType === 'playoff' || form.phaseType === 'knockout')
            ? { bracketMode: form.bracketMode }
            : {}),
        playoffStages: sanitizedPlayoffStages.map((stage, index) => ({
            id: `playoff_stage_${index + 1}`,
            name: stage.name,
            orderIndex: index + 1,
            matchCount: stage.matchCount,
        })),
        playoff_stage_names: sanitizedPlayoffStageNames,
        playoffStageMatchCounts: sanitizedPlayoffStageMatchCounts,
        playoff_match_counts: sanitizedPlayoffStageMatchCounts,
        groupTags: form.groupLabels.map(l => l.name),
        playerStats: {
            assignTeamStatsToPlayersWhoPlayed: form.statsAssignment === 'played',
            assignOnlyToStarters: form.statsAssignment === 'starters',
            behavior: {
                whenToAttribute: 'on_match_finalized',
                eligibility: {
                    mode: 'played_or_starter',
                    playedFlagField: 'lineup.played',
                    starterFlagField: 'lineup.is_starter',
                    rules: [
                        { if: { assignOnlyToStarters: true }, then: { eligiblePlayers: 'starters_only' } },
                        { if: { assignOnlyToStarters: false }, then: { eligiblePlayers: 'played_true' } },
                    ],
                },
                attribution: {
                    teamStatsToPlayers: ['points_for', 'points_against', 'wins', 'draws', 'losses', 'bonus_points'],
                    howToApply: 'for_each_eligible_player_add_same_team_stat_delta_as_in_team_totals',
                },
            },
        },
        matchFormat: {
            type: form.legs === 2 ? 'series' : 'single_match',
            label: form.legs === 2 ? 'Ida y Vuelta' : 'Partido Único',
            behavior: {
                single_match: { seriesLength: 1, winnerDetermination: 'most_points_in_match' },
                series: { seriesLength: 2, aggregateMethod: 'points_sum', tieResolution: 'extra_time_then_penalty_shootout' },
            },
        },
        pointsSystem: {
            win: form.pointsWin,
            draw: form.pointsDraw,
            loss: form.pointsLoss,
            extraTimeAlternativeSystem: form.useExtraTimePoints,
            allowBonusPoints: form.allowBonusPoints,
            bonusTryMode: form.bonusTryMode,
            behavior: {
                whenToCalculate: 'on_match_finalized',
                input: { requires: ['score'], statusRequired: 'finalized' },
                output: { writesTo: ['standings'] },
                basePointsLogic: [
                    { if: { win: true }, then: { add: form.pointsWin } },
                    { if: { draw: true }, then: { add: form.pointsDraw } },
                    { if: { loss: true }, then: { add: form.pointsLoss } },
                ],
                extraTimeLogic: form.useExtraTimePoints ? {
                    enabledWhen: { extraTimeAlternativeSystem: true },
                    requires: ['extra_time_score'],
                    howToApply: 'override_base_points_with_extra_time_logic',
                    win: form.pointsWinExtra,
                    draw: form.pointsDrawExtra,
                    loss: form.pointsLossExtra,
                } : undefined,
                idempotency: { key: 'match_id', rule: 'ignore_if_already_processed' },
            },
        },
        tiebreakers: form.tiebreakers.map(({ metric, enabled, order, priority }) => ({ metric, enabled, order, priority })),
        tiebreakerBehavior: {
            appliesTo: 'standings_sorting_only',
            evaluationTime: 'after_all_matches_in_scope_processed',
            scope: {
                tableScope: 'phase_group_or_pool',
                headToHeadScope: 'only_between_tied_teams_in_that_tableScope',
            },
            algorithm: {
                stepByStep: form.tiebreakers.filter(t => t.enabled).map(t => t.metric),
                finalFallback: { mode: 'stable', rule: 'keep_previous_order_or_use_team_id_ascending' },
            },
        },
    };
}

/**
 * El cuerpo completo del POST/PATCH.
 *
 * `order_index` va `undefined` al editar a propósito: `JSON.stringify` tira la
 * clave, y el endpoint lee la ausencia como "no la muevas de lugar". Mandarla en
 * 0 reordenaría las fases del torneo.
 */
export function buildPhaseRequestBody(form: PhaseFormSnapshot, envelope: PhaseEnvelope): Record<string, unknown> {
    return {
        name: envelope.phaseName,
        phase_type: form.phaseType,
        order_index: envelope.editingPhaseId ? undefined : envelope.phaseCount + 1,
        is_active: envelope.editingPhase ? envelope.editingPhase.is_active : envelope.phaseCount === 0,
        settings: buildPhaseSettings(form),
    };
}
