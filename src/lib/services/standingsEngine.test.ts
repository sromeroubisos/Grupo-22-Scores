import test from 'node:test';
import assert from 'node:assert/strict';
import { StandingsEngine } from './standingsEngine.ts';

/**
 * El motor de posiciones es puro y síncrono: participantes + partidos + reglas
 * entran, una tabla ordenada sale. Eso lo hace testeable sin base ni DOM, y es
 * lo que sostiene el resto del trabajo sobre `table_type`: antes de publicar la
 * tabla de local y la de visitante hay que poder probar que acumulan lo que
 * dicen acumular.
 *
 * Los tests van priorizados por riesgo, no por cobertura. No se testea
 * `buildTableRows` línea por línea ni el parseo defensivo de `score`: son la
 * mayoría de las 754 líneas y no es donde está el peligro.
 */

type Row = Record<string, any>;

const participant = (clubId: string, over: Record<string, unknown> = {}) => ({
    id: `part-${clubId}`,
    club_id: clubId,
    clubs: { name: clubId.toUpperCase(), logo_url: null },
    ...over,
});

const match = (over: Record<string, unknown> = {}) => ({
    id: 'm',
    home_club_id: 'a',
    away_club_id: 'b',
    score: { home: 0, away: 0 },
    status: 'final',
    date_time: '2026-03-01T18:00:00Z',
    events: [],
    ...over,
});

const rules = (over: Record<string, unknown> = {}) => ({
    points_for_win: 4,
    points_for_draw: 2,
    points_for_loss: 0,
    points_for_shootout_win: null,
    points_for_shootout_loss: null,
    offensive_bonus_rule: null,
    defensive_bonus_rule: null,
    tiebreakers: ['points_difference'],
    qualification_rules: null,
    adjustments: [],
    ...over,
});

const rowOf = (table: Row[], teamId: string): Row => {
    const row = table.find((r) => r.teamId === teamId);
    assert.ok(row, `esperaba una fila para ${teamId}`);
    return row;
};

const order = (table: Row[]) => table.map((r) => r.teamId);
const keysOf = (tiebreakers: unknown[]) => tiebreakers.map((tb) => StandingsEngine.tiebreakerKey(tb));

// ---------------------------------------------------------------------------
// A · Las perspectivas home/away — es lo que se va a publicar
// ---------------------------------------------------------------------------

const AB = [participant('a'), participant('b')];
const IDA_Y_VUELTA = [
    match({ id: 'm1', home_club_id: 'a', away_club_id: 'b', score: { home: 20, away: 10 } }),
    match({
        id: 'm2',
        home_club_id: 'b',
        away_club_id: 'a',
        score: { home: 30, away: 0 },
        date_time: '2026-03-08T18:00:00Z',
    }),
];

test('la tabla local sólo acumula lo que pasó de local', () => {
    const table = StandingsEngine.generateTable(AB, IDA_Y_VUELTA, rules(), 'home');
    const a = rowOf(table, 'a');
    const b = rowOf(table, 'b');

    assert.equal(a.played, 1, 'a jugó un solo partido de local');
    assert.equal(a.won, 1);
    assert.equal(a.points_for, 20);
    assert.equal(a.points_against, 10);
    assert.equal(a.total_points, 4);

    assert.equal(b.played, 1);
    assert.equal(b.points_for, 30);
    assert.equal(b.points_against, 0);
    assert.equal(b.total_points, 4);

    // Empatados en puntos, los separa la diferencia: b ganó por 30.
    assert.deepEqual(order(table), ['b', 'a']);
});

test('la tabla visitante sólo acumula lo que pasó de visitante', () => {
    const table = StandingsEngine.generateTable(AB, IDA_Y_VUELTA, rules(), 'away');
    const a = rowOf(table, 'a');
    const b = rowOf(table, 'b');

    assert.equal(a.played, 1);
    assert.equal(a.lost, 1);
    assert.equal(a.points_for, 0);
    assert.equal(a.points_against, 30);
    assert.equal(a.total_points, 0);

    assert.equal(b.played, 1);
    assert.equal(b.lost, 1);
    assert.equal(b.points_for, 10);
    assert.equal(b.points_against, 20);
    assert.equal(b.total_points, 0);
});

test('local más visitante da exactamente la general, incluso con bonus', () => {
    /**
     * El invariante que cubre las dos ramas de una sola vez. Vale porque no hay
     * ajustes manuales: `rules.adjustments` se aplica una vez por equipo sin
     * mirar la perspectiva, así que sumaría dos veces. `form` tampoco entra —
     * se recorta a los últimos cinco y no es aditiva.
     */
    const parts = ['a', 'b', 'c', 'd'].map((id) => participant(id));
    const jornada = [
        match({ id: 'm1', home_club_id: 'a', away_club_id: 'b', score: { home: 30, away: 26 } }),
        match({ id: 'm2', home_club_id: 'c', away_club_id: 'd', score: { home: 12, away: 40 } }),
        match({
            id: 'm3',
            home_club_id: 'b',
            away_club_id: 'c',
            score: { home: 19, away: 19 },
            date_time: '2026-03-08T18:00:00Z',
        }),
        match({
            id: 'm4',
            home_club_id: 'd',
            away_club_id: 'a',
            score: { home: 15, away: 11 },
            date_time: '2026-03-08T20:00:00Z',
        }),
    ];
    const conBonus = rules({ defensive_bonus_rule: { margin: 7, points: 1 } });

    const general = StandingsEngine.generateTable(parts, jornada, conBonus, 'general');
    const local = StandingsEngine.generateTable(parts, jornada, conBonus, 'home');
    const visita = StandingsEngine.generateTable(parts, jornada, conBonus, 'away');

    const aditivos = [
        'played', 'won', 'drawn', 'lost',
        'points_for', 'points_against',
        'base_points', 'bonus_offensive', 'bonus_defensive',
        'total_points',
    ];

    for (const id of ['a', 'b', 'c', 'd']) {
        const g = rowOf(general, id);
        const l = rowOf(local, id);
        const v = rowOf(visita, id);
        for (const campo of aditivos) {
            assert.equal(
                l[campo] + v[campo],
                g[campo],
                `${id}.${campo}: local(${l[campo]}) + visitante(${v[campo]}) debería dar ${g[campo]}`,
            );
        }
    }

    // Y el bonus defensivo existió de verdad, si no el invariante sería trivial.
    assert.ok(
        general.some((row) => row.bonus_defensive > 0),
        'la jornada tiene derrotas por siete o menos: alguien tiene que sumar bonus',
    );
});

test('un tipo de tabla desconocido no acumula nada', () => {
    /**
     * Documenta por qué existe la whitelist de `tableType`. El motor no valida:
     * un valor que no es general/home/away se cae de los dos `if` y devuelve la
     * tabla en cero. Publicar eso es indistinguible de "todavía no se jugó".
     */
    const table = StandingsEngine.generateTable(AB, IDA_Y_VUELTA, rules(), 'local');

    assert.equal(table.length, 2);
    for (const row of table) {
        assert.equal(row.played, 0);
        assert.equal(row.total_points, 0);
        assert.equal(row.points_for, 0);
    }
});

// ---------------------------------------------------------------------------
// B · resolveRules — la herencia fase → torneo → default
// ---------------------------------------------------------------------------

test('los puntos por ganar respetan el orden exacto de los seis niveles', () => {
    const torneo = { points: { win: 63 }, pointsSystem: { win: 64 }, pointsWin: 65 };

    assert.equal(
        StandingsEngine.resolveRules({ points: { win: 61 }, pointsSystem: { win: 62 } }, torneo).points_for_win,
        61,
        '1. settings.points.win de la fase',
    );
    assert.equal(
        StandingsEngine.resolveRules({ pointsSystem: { win: 62 } }, torneo).points_for_win,
        62,
        '2. settings.pointsSystem.win de la fase',
    );
    assert.equal(
        StandingsEngine.resolveRules({}, torneo).points_for_win,
        63,
        '3. ruleset.points.win del torneo',
    );
    assert.equal(
        StandingsEngine.resolveRules({}, { pointsSystem: { win: 64 }, pointsWin: 65 }).points_for_win,
        64,
        '4. ruleset.pointsSystem.win del torneo',
    );
    assert.equal(
        StandingsEngine.resolveRules({}, { pointsWin: 65 }).points_for_win,
        65,
        '5. ruleset.pointsWin (forma vieja)',
    );
    assert.equal(
        StandingsEngine.resolveRules({}, {}).points_for_win,
        4,
        '6. el default del rugby',
    );
});

test('sin nada configurado, el default es 4/2/0', () => {
    const resolved = StandingsEngine.resolveRules(null, null);
    assert.equal(resolved.points_for_win, 4);
    assert.equal(resolved.points_for_draw, 2);
    assert.equal(resolved.points_for_loss, 0);
});

test('el shootout respeta el orden exacto de los ocho niveles', () => {
    const torneo = {
        points: { shootoutWin: 34 },
        pointsSystem: { shootout: { win: 35 }, behavior: { shootoutLogic: { win: 36 } } },
        pointsShootoutWin: 37,
    };

    const nivel = (phase: unknown, ruleset: unknown = torneo) =>
        StandingsEngine.resolveRules(phase, ruleset).points_for_shootout_win;

    assert.equal(nivel({ points: { shootoutWin: 31 } }), 31, '1. fase points.shootoutWin');
    assert.equal(nivel({ pointsSystem: { shootout: { win: 32 } } }), 32, '2. fase pointsSystem.shootout.win');
    assert.equal(
        nivel({ pointsSystem: { behavior: { shootoutLogic: { win: 33 } } } }),
        33,
        '3. fase pointsSystem.behavior.shootoutLogic.win',
    );
    assert.equal(nivel({}), 34, '4. torneo points.shootoutWin');
    assert.equal(
        nivel({}, { pointsSystem: { shootout: { win: 35 }, behavior: { shootoutLogic: { win: 36 } } }, pointsShootoutWin: 37 }),
        35,
        '5. torneo pointsSystem.shootout.win',
    );
    assert.equal(
        nivel({}, { pointsSystem: { behavior: { shootoutLogic: { win: 36 } } }, pointsShootoutWin: 37 }),
        36,
        '6. torneo pointsSystem.behavior.shootoutLogic.win',
    );
    assert.equal(nivel({}, { pointsShootoutWin: 37 }), 37, '7. torneo pointsShootoutWin');
    assert.equal(nivel({}, {}), null, '8. sin shootout configurado, null (no cero)');
});

test('el bonus ofensivo de la fase le gana al del torneo', () => {
    const resolved = StandingsEngine.resolveRules(
        { bonus: { offensive: { tries: 3, points: 2 } } },
        { bonus: { offensive: { tries: 4, points: 1 } } },
    );

    assert.equal(resolved.offensive_bonus_rule.threshold, 3);
    assert.equal(resolved.offensive_bonus_rule.points, 2);
    assert.equal(resolved.offensive_bonus_rule.metric, 'event_count');
    assert.equal(resolved.offensive_bonus_rule.eventType, 'try');
});

test('sin bonus en la fase, hereda el del torneo', () => {
    const resolved = StandingsEngine.resolveRules({}, { bonus: { offensive: { tries: 4, points: 1 } } });
    assert.equal(resolved.offensive_bonus_rule.threshold, 4);
    assert.equal(resolved.offensive_bonus_rule.points, 1);
});

test('la forma vieja (bonusTry suelto) se traduce al umbral clásico de cuatro tries', () => {
    const resolved = StandingsEngine.resolveRules({ pointsSystem: { bonusTry: 2 } }, {});
    assert.equal(resolved.offensive_bonus_rule.threshold, 4);
    assert.equal(resolved.offensive_bonus_rule.points, 2);
});

test('sin bonus en ningún lado, no hay regla de bonus', () => {
    const resolved = StandingsEngine.resolveRules({}, {});
    assert.equal(resolved.offensive_bonus_rule, null);
    assert.equal(resolved.defensive_bonus_rule, null);
});

test('el desempate por defecto es la diferencia de puntos', () => {
    assert.deepEqual(keysOf(StandingsEngine.resolveRules({}, {}).tiebreakers), ['points_difference']);
});

test('un desempate en enabled:false se cae de la lista', () => {
    const resolved = StandingsEngine.resolveRules(
        {
            tiebreakers: [
                { key: 'points_difference' },
                { key: 'points_for', enabled: false },
                { key: '' },
            ],
        },
        {},
    );

    assert.deepEqual(keysOf(resolved.tiebreakers), ['points_difference']);
});

test('mezclando strings con objetos, los strings quedan primero', () => {
    /**
     * Los strings no llevan `priority`, así que valen 0 y encabezan. Es la razón
     * por la que aplanar la lista a `item.key` antes de guardarla —lo que hace
     * hoy el panel al reordenar— no es inocuo: además de perder el `order`,
     * cambia la prioridad de todo lo que tenía una.
     */
    const resolved = StandingsEngine.resolveRules(
        {
            tiebreakers: [
                { key: 'points_for', priority: 2 },
                'points_difference',
                { key: 'won', priority: 1 },
            ],
        },
        {},
    );

    assert.deepEqual(keysOf(resolved.tiebreakers), ['points_difference', 'won', 'points_for']);
});

test('modo de cálculo, edición y clasificación viajan tal cual', () => {
    const resolved = StandingsEngine.resolveRules(
        {
            standings: { mode: 'fully_manual', editable: true, adjustments: [{ team_id: 'a', points_delta: -3 }] },
            qualification: { promoted: 2, relegated: 1 },
        },
        {},
    );

    assert.equal(resolved.calculation_mode, 'fully_manual');
    assert.equal(resolved.editable_mode, true);
    assert.deepEqual(resolved.adjustments, [{ team_id: 'a', points_delta: -3 }]);
    assert.deepEqual(resolved.qualification_rules, { promoted: 2, relegated: 1 });
});

// ---------------------------------------------------------------------------
// C · Desempates
// ---------------------------------------------------------------------------

const CUATRO = ['a', 'b', 'c', 'd'].map((id) => participant(id));
const DOS_GANADORES = [
    match({ id: 'm1', home_club_id: 'a', away_club_id: 'c', score: { home: 20, away: 0 } }),
    match({ id: 'm2', home_club_id: 'b', away_club_id: 'd', score: { home: 20, away: 19 } }),
];

test('points_against como string ordena al revés que con order:asc', () => {
    /**
     * La prueba ejecutable de que aplanar un desempate a su `key` cambia el
     * campeón: a y b están empatados en puntos, y lo único que los separa es
     * cuánto recibieron. Como string el criterio se lee "de mayor a menor".
     */
    const comoString = StandingsEngine.generateTable(
        CUATRO,
        DOS_GANADORES,
        rules({ tiebreakers: ['points_against'] }),
    );
    assert.deepEqual(order(comoString).slice(0, 2), ['b', 'a'], 'desc: primero el que más recibió');

    const conOrden = StandingsEngine.generateTable(
        CUATRO,
        DOS_GANADORES,
        rules({ tiebreakers: [{ key: 'points_against', order: 'asc' }] }),
    );
    assert.deepEqual(order(conOrden).slice(0, 2), ['a', 'b'], 'asc: primero la valla menos vencida');
});

test('el head-to-head decide cuando hubo partido entre los empatados', () => {
    const parts = ['a', 'b', 'c'].map((id) => participant(id));
    const matches = [
        match({ id: 'm1', home_club_id: 'b', away_club_id: 'a', score: { home: 20, away: 10 } }),
        match({
            id: 'm2',
            home_club_id: 'a',
            away_club_id: 'c',
            score: { home: 30, away: 0 },
            date_time: '2026-03-08T18:00:00Z',
        }),
    ];

    const table = StandingsEngine.generateTable(
        parts,
        matches,
        rules({ tiebreakers: ['headToHead', 'points_difference'] }),
    );

    // a tiene mejor diferencia (+20 contra +10), pero b le ganó el mano a mano.
    assert.equal(rowOf(table, 'a').total_points, 4);
    assert.equal(rowOf(table, 'b').total_points, 4);
    assert.deepEqual(order(table).slice(0, 2), ['b', 'a']);
});

test('sin partido entre los empatados, el head-to-head se saltea', () => {
    const parts = CUATRO;
    const matches = [
        match({ id: 'm1', home_club_id: 'b', away_club_id: 'd', score: { home: 20, away: 10 } }),
        match({
            id: 'm2',
            home_club_id: 'a',
            away_club_id: 'c',
            score: { home: 30, away: 0 },
            date_time: '2026-03-08T18:00:00Z',
        }),
    ];

    const table = StandingsEngine.generateTable(
        parts,
        matches,
        rules({ tiebreakers: ['headToHead', 'points_difference'] }),
    );

    // a y b nunca se cruzaron: manda la diferencia (+30 contra +10).
    assert.deepEqual(order(table).slice(0, 2), ['a', 'b']);
});

test('un empate a cuatro se resuelve por escalones sucesivos', () => {
    /**
     * Los cuatro terminan con 4 puntos. El primer criterio (empates) parte la
     * tabla en dos grupos de dos, y cada subgrupo se resuelve con el criterio
     * siguiente — que es exactamente el `startAt` de la recursión.
     */
    const matches = [
        match({ id: 'm1', home_club_id: 'a', away_club_id: 'd', score: { home: 30, away: 0 } }),
        match({ id: 'm2', home_club_id: 'b', away_club_id: 'd', score: { home: 20, away: 10 } }),
        match({
            id: 'm3',
            home_club_id: 'c',
            away_club_id: 'd',
            score: { home: 15, away: 15 },
            date_time: '2026-03-08T18:00:00Z',
        }),
        match({
            id: 'm4',
            home_club_id: 'c',
            away_club_id: 'd',
            score: { home: 15, away: 15 },
            date_time: '2026-03-15T18:00:00Z',
        }),
    ];

    const table = StandingsEngine.generateTable(
        CUATRO,
        matches,
        rules({ tiebreakers: ['drawn', 'points_difference'] }),
    );

    for (const id of ['a', 'b', 'c', 'd']) {
        assert.equal(rowOf(table, id).total_points, 4, `${id} tiene que llegar a 4 puntos`);
    }

    // Empates desc parte [c,d] (2 cada uno) y [a,b] (0); adentro manda la diferencia.
    assert.deepEqual(order(table), ['c', 'd', 'a', 'b']);
});

test('con todo igual el orden es estable y repetible', () => {
    const parts = ['zeta', 'alfa'].map((id) => participant(id));
    const primera = StandingsEngine.generateTable(parts, [], rules());
    const segunda = StandingsEngine.generateTable(parts, [], rules());

    assert.deepEqual(order(primera), ['alfa', 'zeta']);
    assert.deepEqual(order(segunda), order(primera));
});

// ---------------------------------------------------------------------------
// D · Carry-over (puntos arrastrados de la fase anterior)
// ---------------------------------------------------------------------------

const ARRASTRE = {
    teamId: 'a',
    played: 3,
    won: 2,
    drawn: 0,
    lost: 1,
    points_for: 60,
    points_against: 40,
    total_points: 10,
    bonus_offensive: 2,
    bonus_defensive: 0,
    adjustments: 0,
    sourcePhaseId: 'fase-regular',
    sourcePhaseName: 'Fase regular',
};

test('lo arrastrado se suma una sola vez', () => {
    const matches = [match({ id: 'm1', home_club_id: 'a', away_club_id: 'b', score: { home: 25, away: 20 } })];
    const table = StandingsEngine.generateTable(AB, matches, rules(), 'general', { carryOverRows: [ARRASTRE] });
    const a = rowOf(table, 'a');

    assert.equal(a.played, 4, '3 arrastrados + 1 jugado');
    assert.equal(a.won, 3);
    assert.equal(a.points_for, 85);
    assert.equal(a.points_against, 60);
    assert.equal(a.total_points, 14, '10 arrastrados + 4 de la victoria');
    assert.equal(a.carry_over.played, 3);
    assert.equal(a.carry_over.points, 10);
    assert.equal(a.carry_over.source_phase_name, 'Fase regular');
});

test('cuando falta base_points se deriva del total menos bonus y ajustes', () => {
    const table = StandingsEngine.generateTable(AB, [], rules(), 'general', { carryOverRows: [ARRASTRE] });
    const a = rowOf(table, 'a');

    assert.equal(a.base_points, 8, '10 de total menos 2 de bonus ofensivo');
    assert.equal(a.bonus_offensive, 2);
    assert.equal(a.total_points, 10, 'la cuenta tiene que volver a cerrar en el total original');
});

test('un base_points explícito le gana a la derivación', () => {
    const table = StandingsEngine.generateTable(AB, [], rules(), 'general', {
        carryOverRows: [{ ...ARRASTRE, base_points: 7 }],
    });
    const a = rowOf(table, 'a');

    assert.equal(a.base_points, 7);
    assert.equal(a.total_points, 9, '7 de base + 2 de bonus');
});

test('un club ajeno a la fase se ignora sin romper la tabla', () => {
    const table = StandingsEngine.generateTable(AB, [], rules(), 'general', {
        carryOverRows: [ARRASTRE, { ...ARRASTRE, teamId: 'club-de-otra-fase' }],
    });

    assert.equal(table.length, 2, 'no aparece una fila para un club que no participa');
    assert.equal(rowOf(table, 'a').total_points, 10);
    assert.equal(rowOf(table, 'b').total_points, 0);
});

// ---------------------------------------------------------------------------
// E · Invariantes de la tabla
// ---------------------------------------------------------------------------

test('las posiciones son 1..N sin huecos ni repetidos', () => {
    const table = StandingsEngine.generateTable(CUATRO, DOS_GANADORES, rules());
    assert.deepEqual(table.map((r) => r.position), [1, 2, 3, 4]);
});

test('los partidos que no terminaron no cuentan', () => {
    const matches = [
        match({ id: 'm1', home_club_id: 'a', away_club_id: 'b', score: { home: 20, away: 10 }, status: 'scheduled' }),
        match({ id: 'm2', home_club_id: 'a', away_club_id: 'b', score: { home: 5, away: 0 }, status: 'live' }),
        match({
            id: 'm3',
            home_club_id: 'a',
            away_club_id: 'b',
            score: { home: 3, away: 0 },
            status: 'FT',
            date_time: '2026-03-08T18:00:00Z',
        }),
    ];

    const table = StandingsEngine.generateTable(AB, matches, rules());
    const a = rowOf(table, 'a');

    assert.equal(a.played, 1, 'sólo el terminado');
    assert.equal(a.points_for, 3);
    assert.equal(a.total_points, 4, 'FT en mayúsculas también es un partido terminado');
});

test('un partido con un club que no está en la fase no rompe nada', () => {
    const matches = [
        match({ id: 'm1', home_club_id: 'fantasma', away_club_id: 'b', score: { home: 99, away: 0 } }),
        match({
            id: 'm2',
            home_club_id: 'a',
            away_club_id: 'b',
            score: { home: 10, away: 5 },
            date_time: '2026-03-08T18:00:00Z',
        }),
    ];

    const table = StandingsEngine.generateTable(AB, matches, rules());

    assert.equal(table.length, 2);
    assert.equal(rowOf(table, 'b').played, 1, 'el partido del fantasma no le suma una derrota a b');
    assert.equal(rowOf(table, 'b').points_against, 10);
});

test('los ajustes manuales de la fase mueven los puntos del club que nombran', () => {
    const table = StandingsEngine.generateTable(
        AB,
        [match({ id: 'm1', home_club_id: 'a', away_club_id: 'b', score: { home: 20, away: 0 } })],
        rules({ adjustments: [{ team_id: 'a', points_delta: -3 }] }),
    );

    assert.equal(rowOf(table, 'a').adjustments, -3);
    assert.equal(rowOf(table, 'a').total_points, 1, '4 de la victoria menos 3 de quita');
});

test('la clasificación marca ascenso y descenso según el reglamento', () => {
    const table = StandingsEngine.generateTable(
        CUATRO,
        DOS_GANADORES,
        rules({ qualification_rules: { promoted: 1, zone: 1, relegated: 1 } }),
    );

    assert.equal(table[0].status, 'Clasificado');
    assert.equal(table[1].status, 'En Zona');
    assert.equal(table[3].status, 'Descenso');
});
