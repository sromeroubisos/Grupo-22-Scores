import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildPhaseRequestBody,
    buildPhaseSettings,
    type PhaseFormSnapshot,
} from './phasePayload.ts';

/**
 * Este archivo NO opina sobre si el payload está bien diseñado. Lo congela.
 *
 * El `settings` de una fase tiene claves que ninguna pantalla del gestor mira
 * pero que fases cargadas en otras épocas sí leen: `playoff_match_counts`,
 * `playoff_stage_names`, `carryOverPreviousPhase` al lado de `carryOver.enabled`.
 * Una refactorización del formulario que deje de escribir una de esas no rompe
 * nada visible: rompe una llave del año pasado, y se descubre tres semanas
 * después.
 *
 * Por eso el esperado está transcrito a mano y entero, no armado llamando a la
 * función. Si `phasePayload.ts` cambia el payload, acá tiene que doler.
 *
 * La comparación va sobre el JSON ida y vuelta a propósito: es lo que de verdad
 * viaja. `extraTimeLogic: undefined` desaparece al serializar, y esa ausencia es
 * parte del contrato con el endpoint.
 */
function wire(value: unknown): unknown {
    return JSON.parse(JSON.stringify(value));
}

/* Los desempates llegan del componente con `label` adentro. Sin anotar el tipo
   para que el excess property check no se queje: el punto del caso es justamente
   que la clave sobrante se cae al armar el payload. */
const TIEBREAKERS_IN = [
    { metric: 'points', label: 'Puntos', enabled: true, order: 'desc' as const, priority: 1 },
    { metric: 'headToHead', label: 'Enfrentamiento directo', enabled: true, order: 'desc' as const, priority: 2 },
    { metric: 'pointsDiff', label: 'Diferencia', enabled: false, order: 'desc' as const, priority: 3 },
];

/** Una fase de liga de rugby, que es el caso que más se carga. */
const LEAGUE_FORM: PhaseFormSnapshot = {
    phaseType: 'league',
    isCircuit: false,
    placementPoints: [{ position: 1, points: 10 }],
    teamsCount: 12,
    advanceCount: 4,
    legs: 1,
    tableColumns: { points: true, played: true, drawn: true },
    groupLabels: [{ name: 'Semifinal', colorMode: 'auto', color: '#22C55E' }],
    groupNames: [],
    playoffStageNames: [],
    playoffStageMatchCounts: [],
    playoffTeamsCount: 0,
    bracketMode: 'manual',
    statsAssignment: 'played',
    carryOverPreviousPhase: false,
    canCarryOverPreviousPhase: false,
    pointsWin: 4,
    pointsDraw: 2,
    pointsLoss: 0,
    allowBonusPoints: true,
    bonusTryMode: 'count',
    useExtraTimePoints: false,
    pointsWinExtra: 2,
    pointsDrawExtra: 1,
    pointsLossExtra: 0,
    tiebreakers: TIEBREAKERS_IN,
};

/**
 * El esperado de `LEAGUE_FORM`, entero y a mano. Los otros casos se escriben
 * como este objeto con las claves que cambian, así el diff del test se lee.
 */
function expectedLeagueSettings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        teamsCount: 12,
        advanceCount: 4,
        legs: 1,
        tableColumns: { points: true, played: true, drawn: true },
        groupLabels: [{ name: 'Semifinal', colorMode: 'auto', color: '#22C55E' }],
        statsAssignment: 'played',
        carryOverPreviousPhase: false,
        carryOver: {
            enabled: false,
            source: 'previous_phase',
            sourcePhaseId: null,
            mode: 'table_totals',
            include: { standings: true, points: true, scores: true, form: true },
        },
        group_names: [],
        playoffStages: [],
        playoff_stage_names: [],
        playoffStageMatchCounts: [],
        playoff_match_counts: [],
        groupTags: ['Semifinal'],
        playerStats: {
            assignTeamStatsToPlayersWhoPlayed: true,
            assignOnlyToStarters: false,
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
            type: 'single_match',
            label: 'Partido Único',
            behavior: {
                single_match: { seriesLength: 1, winnerDetermination: 'most_points_in_match' },
                series: { seriesLength: 2, aggregateMethod: 'points_sum', tieResolution: 'extra_time_then_penalty_shootout' },
            },
        },
        pointsSystem: {
            win: 4,
            draw: 2,
            loss: 0,
            extraTimeAlternativeSystem: false,
            allowBonusPoints: true,
            bonusTryMode: 'count',
            behavior: {
                whenToCalculate: 'on_match_finalized',
                input: { requires: ['score'], statusRequired: 'finalized' },
                output: { writesTo: ['standings'] },
                basePointsLogic: [
                    { if: { win: true }, then: { add: 4 } },
                    { if: { draw: true }, then: { add: 2 } },
                    { if: { loss: true }, then: { add: 0 } },
                ],
                idempotency: { key: 'match_id', rule: 'ignore_if_already_processed' },
            },
        },
        tiebreakers: [
            { metric: 'points', enabled: true, order: 'desc', priority: 1 },
            { metric: 'headToHead', enabled: true, order: 'desc', priority: 2 },
            { metric: 'pointsDiff', enabled: false, order: 'desc', priority: 3 },
        ],
        tiebreakerBehavior: {
            appliesTo: 'standings_sorting_only',
            evaluationTime: 'after_all_matches_in_scope_processed',
            scope: {
                tableScope: 'phase_group_or_pool',
                headToHeadScope: 'only_between_tied_teams_in_that_tableScope',
            },
            algorithm: {
                stepByStep: ['points', 'headToHead'],
                finalFallback: { mode: 'stable', rule: 'keep_previous_order_or_use_team_id_ascending' },
            },
        },
        ...overrides,
    };
}

test('liga: el payload es exactamente el de hoy', () => {
    assert.deepEqual(wire(buildPhaseSettings(LEAGUE_FORM)), expectedLeagueSettings());
});

test('el desempate viaja sin el rótulo: `label` es de la pantalla, no del guardado', () => {
    const built = buildPhaseSettings(LEAGUE_FORM) as unknown as { tiebreakers: Record<string, unknown>[] };
    for (const item of built.tiebreakers) {
        assert.deepEqual(Object.keys(item).sort(), ['enabled', 'metric', 'order', 'priority']);
    }
});

test('fase de grupos: los nombres se limpian y los vacíos se caen', () => {
    const settings = buildPhaseSettings({
        ...LEAGUE_FORM,
        phaseType: 'group_stage',
        groupNames: ['  Zona A  ', '', '   ', 'Zona B'],
    });
    assert.deepEqual(wire(settings), expectedLeagueSettings({ group_names: ['Zona A', 'Zona B'] }));
});

test('los nombres de grupo NO viajan si la fase no es de grupos', () => {
    const settings = buildPhaseSettings({ ...LEAGUE_FORM, groupNames: ['Zona A', 'Zona B'] });
    assert.deepEqual(settings.group_names, []);
});

/**
 * El caso que motivó el archivo. Las tres claves son el MISMO dato en tres
 * formas, y las lee gente distinta: `playoffStages` el cuadro de llaves nuevo,
 * `playoff_stage_names` y `playoff_match_counts` fases cargadas antes.
 */
test('playoff: las tres formas del dato viajan las tres, y de acuerdo entre sí', () => {
    const settings = buildPhaseSettings({
        ...LEAGUE_FORM,
        phaseType: 'playoff',
        playoffTeamsCount: 8,
        playoffStageNames: ['Cuartos de final', 'Semifinal', 'Final'],
        playoffStageMatchCounts: [4, 2, 1],
    });

    assert.deepEqual(settings.playoffStages, [
        { id: 'playoff_stage_1', name: 'Cuartos de final', orderIndex: 1, matchCount: 4 },
        { id: 'playoff_stage_2', name: 'Semifinal', orderIndex: 2, matchCount: 2 },
        { id: 'playoff_stage_3', name: 'Final', orderIndex: 3, matchCount: 1 },
    ]);
    assert.deepEqual(settings.playoff_stage_names, ['Cuartos de final', 'Semifinal', 'Final']);
    assert.deepEqual(settings.playoffStageMatchCounts, [4, 2, 1]);
    assert.deepEqual(settings.playoff_match_counts, [4, 2, 1]);
});

/**
 * El modo de carga de las llaves es lo que separa los dos sistemas de playoff:
 * las rutas de fase lo leen para NO armar slots manuales sobre un cuadro del
 * constructor. Viaja sólo en fases playoff; en una liga no significa nada.
 */
test('playoff: el modo de carga de las llaves viaja, y sólo en playoff', () => {
    const playoff = buildPhaseSettings({
        ...LEAGUE_FORM,
        phaseType: 'playoff',
        playoffTeamsCount: 8,
        playoffStageNames: ['Cuartos de final', 'Semifinal', 'Final'],
        playoffStageMatchCounts: [4, 2, 1],
        bracketMode: 'auto',
    });
    assert.equal(playoff.bracketMode, 'auto');

    const league = buildPhaseSettings({ ...LEAGUE_FORM, bracketMode: 'auto' });
    assert.equal('bracketMode' in league, false);
});

test('knockout arma el cuadro igual que playoff', () => {
    const stages = (form: PhaseFormSnapshot) => buildPhaseSettings(form).playoffStages;
    const base: PhaseFormSnapshot = {
        ...LEAGUE_FORM,
        playoffTeamsCount: 4,
        playoffStageNames: ['Semifinal', 'Final'],
        playoffStageMatchCounts: [2, 1],
    };
    assert.deepEqual(
        stages({ ...base, phaseType: 'knockout' }),
        stages({ ...base, phaseType: 'playoff' }),
    );
    assert.deepEqual(stages({ ...base, phaseType: 'knockout' }), [
        { id: 'playoff_stage_1', name: 'Semifinal', orderIndex: 1, matchCount: 2 },
        { id: 'playoff_stage_2', name: 'Final', orderIndex: 2, matchCount: 1 },
    ]);
});

test('circuito: el puntaje por puesto entra sólo si el torneo es circuito', () => {
    const conCircuito = buildPhaseSettings({ ...LEAGUE_FORM, isCircuit: true });
    assert.deepEqual(wire(conCircuito), expectedLeagueSettings({
        circuit: { pointsByPlacement: [{ position: 1, points: 10 }] },
    }));
    assert.equal('circuit' in buildPhaseSettings(LEAGUE_FORM), false);
});

/**
 * El arrastre pedido sin fase anterior de la que arrastrar tiene que quedar
 * apagado en las DOS claves. Prenderlo en una sola deja una fase que dice que
 * arrastra y no arrastra, o al revés.
 */
test('el arrastre no se prende si no hay fase anterior', () => {
    const sinAnterior = buildPhaseSettings({
        ...LEAGUE_FORM,
        carryOverPreviousPhase: true,
        canCarryOverPreviousPhase: false,
    }) as unknown as { carryOverPreviousPhase: boolean; carryOver: { enabled: boolean } };
    assert.equal(sinAnterior.carryOverPreviousPhase, false);
    assert.equal(sinAnterior.carryOver.enabled, false);
});

test('con fase anterior, el arrastre se prende en las dos claves', () => {
    const settings = buildPhaseSettings({
        ...LEAGUE_FORM,
        carryOverPreviousPhase: true,
        canCarryOverPreviousPhase: true,
    });
    assert.deepEqual(wire(settings), expectedLeagueSettings({
        carryOverPreviousPhase: true,
        carryOver: {
            enabled: true,
            source: 'previous_phase',
            sourcePhaseId: null,
            mode: 'table_totals',
            include: { standings: true, points: true, scores: true, form: true },
        },
    }));
});

test('ida y vuelta cambia el formato de partido a serie', () => {
    const settings = buildPhaseSettings({ ...LEAGUE_FORM, legs: 2 });
    assert.deepEqual(wire(settings), expectedLeagueSettings({
        legs: 2,
        matchFormat: {
            type: 'series',
            label: 'Ida y Vuelta',
            behavior: {
                single_match: { seriesLength: 1, winnerDetermination: 'most_points_in_match' },
                series: { seriesLength: 2, aggregateMethod: 'points_sum', tieResolution: 'extra_time_then_penalty_shootout' },
            },
        },
    }));
});

/**
 * `extraTimeLogic` va `undefined` cuando el alargue no reparte puntos, y
 * `JSON.stringify` tira la clave. Que la clave ESTÉ AUSENTE —no en `null`— es
 * lo que el endpoint lee como "sin sistema de alargue".
 */
test('sin puntos por alargue, la clave no viaja', () => {
    const wired = wire(buildPhaseSettings(LEAGUE_FORM)) as { pointsSystem: { behavior: Record<string, unknown> } };
    assert.equal('extraTimeLogic' in wired.pointsSystem.behavior, false);
});

test('con puntos por alargue, la clave viaja con los tres valores', () => {
    const wired = wire(buildPhaseSettings({ ...LEAGUE_FORM, useExtraTimePoints: true })) as {
        pointsSystem: { extraTimeAlternativeSystem: boolean; behavior: { extraTimeLogic: unknown } };
    };
    assert.equal(wired.pointsSystem.extraTimeAlternativeSystem, true);
    assert.deepEqual(wired.pointsSystem.behavior.extraTimeLogic, {
        enabledWhen: { extraTimeAlternativeSystem: true },
        requires: ['extra_time_score'],
        howToApply: 'override_base_points_with_extra_time_logic',
        win: 2,
        draw: 1,
        loss: 0,
    });
});

test('las estadísticas por titular cambian las dos banderas a la vez', () => {
    const settings = buildPhaseSettings({ ...LEAGUE_FORM, statsAssignment: 'starters' }) as unknown as {
        playerStats: { assignTeamStatsToPlayersWhoPlayed: boolean; assignOnlyToStarters: boolean };
    };
    assert.equal(settings.playerStats.assignTeamStatsToPlayersWhoPlayed, false);
    assert.equal(settings.playerStats.assignOnlyToStarters, true);
});

test('el campo vacío de equipos cuenta como cero, no como NaN', () => {
    const settings = buildPhaseSettings({ ...LEAGUE_FORM, teamsCount: '', advanceCount: '' });
    assert.equal(settings.teamsCount, 0);
    assert.equal(settings.advanceCount, 0);
});

/* ---------- el sobre: lo que no sale del formulario ---------- */

test('la primera fase de un torneo nace activa y en el lugar uno', () => {
    const body = wire(buildPhaseRequestBody(LEAGUE_FORM, {
        phaseName: 'Primera A',
        editingPhaseId: null,
        editingPhase: null,
        phaseCount: 0,
    })) as Record<string, unknown>;
    assert.equal(body.name, 'Primera A');
    assert.equal(body.phase_type, 'league');
    assert.equal(body.order_index, 1);
    assert.equal(body.is_active, true);
});

test('una fase agregada después no se roba la activa', () => {
    const body = buildPhaseRequestBody(LEAGUE_FORM, {
        phaseName: 'Playoff',
        editingPhaseId: null,
        editingPhase: null,
        phaseCount: 3,
    });
    assert.equal(body.order_index, 4);
    assert.equal(body.is_active, false);
});

/**
 * Al editar, `order_index` NO viaja. Mandarlo en 0 —o en `phaseCount + 1`—
 * reordenaría las fases del torneo por el sólo hecho de haber corregido un
 * nombre.
 */
test('al editar no se manda el orden, y la fase conserva si estaba activa', () => {
    const body = wire(buildPhaseRequestBody(LEAGUE_FORM, {
        phaseName: 'Primera A',
        editingPhaseId: 'phase-1',
        editingPhase: { is_active: true },
        phaseCount: 3,
    })) as Record<string, unknown>;
    assert.equal('order_index' in body, false);
    assert.equal(body.is_active, true);
});

test('editar una fase inactiva no la activa', () => {
    const body = buildPhaseRequestBody(LEAGUE_FORM, {
        phaseName: 'Playoff',
        editingPhaseId: 'phase-2',
        editingPhase: { is_active: false },
        phaseCount: 3,
    });
    assert.equal(body.is_active, false);
});
