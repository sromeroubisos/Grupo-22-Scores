import test from 'node:test';
import assert from 'node:assert/strict';

import {
    WR_EVENTS,
    WR_TTL_HOT_SECONDS,
    WR_TTL_IDLE_SECONDS,
    WR_TTL_MATCHDAY_SECONDS,
    applyWrManualResults,
    classifyWrStatus,
    computeWrPoolTables,
    parseWrManualResult,
    parseWrMatchId,
    parseWrSchedule,
    parseWrSquads,
    parseWrStandings,
    parseWrStats,
    parseWrSummary,
    parseWrTimeline,
    pickWrStandings,
    wrEventByTournamentId,
    wrLiveLabel,
    wrMatchIdOf,
    wrPeriodScores,
    wrPhaseLabel,
    wrPlaceholderLabel,
    wrRefereeOf,
    wrRefreshTtlSeconds,
    wrTimelineTotals,
    wrTriesOf,
} from './worldRugbyEventParser.ts';

const CHALLENGER = WR_EVENTS[0];
const HOUR = 3_600_000;

// Recortes con la forma real de `/event/{id}/schedule` (30/09/2026).
const KICKOFF_1 = 1790946000000; // 02/10 10:00 en Santiago (-03)
const KICKOFF_4 = 1790978400000; // 02/10 19:00

function team(id: string, name: string) {
    return { id, altId: 'x', name, abbreviation: null, countryCode: null, annotations: null, metadata: {} };
}

function match(opts: {
    id: string;
    n: number;
    millis: number;
    home: ReturnType<typeof team>;
    away: ReturnType<typeof team>;
    status?: string;
    scores?: [number, number];
    phase?: string | null;
    secs?: number;
}) {
    return {
        matchId: opts.id,
        description: `Match ${opts.n}`,
        eventPhase: opts.phase ?? null,
        venue: { id: '449', name: 'Centro de Alto Rendimiento del Rugby, La Reina', city: 'Santiago', country: 'Chile' },
        time: { millis: opts.millis, gmtOffset: -3.0, label: '2026-10-02' },
        teams: [opts.home, opts.away],
        scores: opts.scores ?? [0, 0],
        status: opts.status ?? 'U',
        clock: { secs: opts.secs ?? 0, label: '00:00' },
        outcome: 'N',
    };
}

const ROU = team('2766', 'Romania U20');
const BRA = team('3642', 'Brazil U20');
const CHI = team('2764', 'Chile U20');
const HKG = team('3675', 'Hong Kong China U20');
const NAM = team('2755', 'Namibia U20');
const CAN = team('2770', 'Canada U20');

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function schedule(matches: unknown[]) {
    return { event: { id: CHALLENGER.eventId }, matches };
}

const BEFORE = KICKOFF_1 - 48 * HOUR;

test('los ids de partido van y vuelven', () => {
    const id = 'B9BE79CB-7F27-431A-9390-F0C50A43B68E';
    assert.equal(wrMatchIdOf(id), 'wr-match-b9be79cb-7f27-431a-9390-f0c50a43b68e');
    assert.equal(parseWrMatchId(wrMatchIdOf(id)), id.toLowerCase());
    assert.equal(parseWrMatchId('wr-match-123'), null);
    assert.equal(parseWrMatchId('us7-match-31176'), null);
    assert.equal(wrEventByTournamentId('WR-U20-Challenger-2026'), CHALLENGER);
    assert.equal(wrEventByTournamentId('us7-m'), null);
});

test('estados: U, L1, LHT, L2, C, y las dos trampas de la mesa', () => {
    assert.equal(classifyWrStatus('U', KICKOFF_1, BEFORE), 'scheduled');
    assert.equal(classifyWrStatus('L1', KICKOFF_1, KICKOFF_1 + 10 * 60_000), 'live');
    assert.equal(classifyWrStatus('LHT', KICKOFF_1, KICKOFF_1 + 45 * 60_000), 'live');
    assert.equal(classifyWrStatus('C', KICKOFF_1, KICKOFF_1 + 2 * HOUR), 'final');
    // Un "en vivo" el día anterior es un ensayo de la mesa.
    assert.equal(classifyWrStatus('L1', KICKOFF_1, KICKOFF_1 - 20 * HOUR), 'scheduled');
    // Un "en vivo" a las cuatro horas es una mesa que no cerró.
    assert.equal(classifyWrStatus('L2', KICKOFF_1, KICKOFF_1 + 4 * HOUR), 'final');
    // La mesa puede arrancar unos minutos antes del horario publicado.
    assert.equal(classifyWrStatus('L1', KICKOFF_1, KICKOFF_1 - 10 * 60_000), 'live');
});

test('el rótulo en vivo sale del reloj oficial', () => {
    assert.equal(wrLiveLabel('L1', 170), "3'");
    assert.equal(wrLiveLabel('L2', 3398), "57'");
    assert.equal(wrLiveLabel('LHT', 2400), 'Entretiempo');
    assert.equal(wrLiveLabel('L1', 0), 'En juego');
});

test('fixture: nombres en castellano con la categoría, grupo declarado y fecha por día', () => {
    const fixtures = parseWrSchedule(schedule([
        match({ id: ID(4), n: 4, millis: KICKOFF_4, home: CHI, away: HKG }),
        match({ id: ID(1), n: 1, millis: KICKOFF_1, home: ROU, away: BRA }),
        match({ id: ID(2), n: 2, millis: KICKOFF_1 + 3 * HOUR, home: NAM, away: CAN }),
        match({ id: ID(8), n: 8, millis: KICKOFF_4 + 5 * 24 * HOUR, home: CHI, away: ROU }),
    ]), CHALLENGER, BEFORE);

    assert.deepEqual(fixtures.map((f) => f.number), [1, 2, 4, 8]);
    const [first, , chile, second] = fixtures;
    assert.equal(first.home.name, 'Rumania M20');
    assert.equal(first.away.name, 'Brasil M20');
    assert.equal(chile.away.name, 'Hong Kong China M20');
    assert.equal(first.pool, 'A');
    assert.equal(fixtures[1].pool, 'B');
    assert.equal(first.stageLabel, 'Grupo A · Fecha 1');
    assert.equal(second.stageLabel, 'Grupo A · Fecha 2');
    assert.equal(first.state, 'scheduled');
    assert.equal(first.home.score, null);
    assert.equal(first.kickoffIso, '2026-10-02T13:00:00.000Z');
    assert.equal(first.venue, 'Centro de Alto Rendimiento del Rugby, La Reina');
});

test('los cruces nombran lugares hasta que se definen', () => {
    const fixtures = parseWrSchedule(schedule([
        match({ id: ID(1), n: 1, millis: KICKOFF_1, home: ROU, away: BRA }),
        match({ id: ID(16), n: 16, millis: KICKOFF_4 + 15 * 24 * HOUR, home: team('', '1st Pool A'), away: team('', '1st Pool B'), phase: 'Final' }),
        match({ id: ID(15), n: 15, millis: KICKOFF_4 + 15 * 24 * HOUR - 3 * HOUR, home: CHI, away: NAM, phase: '3rd Place Play-Off' }),
    ]), CHALLENGER, BEFORE);

    const final = fixtures.find((f) => f.number === 16)!;
    assert.equal(final.home.name, '1.º Grupo A');
    assert.equal(final.home.placeholder, true);
    assert.equal(final.home.teamId, null);
    assert.equal(final.pool, null);
    assert.equal(final.stageLabel, 'Final');
    assert.equal(final.round, 2);

    // Definido el cruce, ya es de dos selecciones pero sigue siendo cruce:
    // Chile y Namibia no comparten grupo.
    const third = fixtures.find((f) => f.number === 15)!;
    assert.equal(third.home.name, 'Chile M20');
    assert.equal(third.pool, null);
    assert.equal(third.stageLabel, 'Por el 3.º puesto');
});

test('fases por puesto en castellano', () => {
    assert.equal(wrPhaseLabel('7th Place Play-Off'), 'Por el 7.º puesto');
    assert.equal(wrPhaseLabel('5th Place Semi Final'), 'Semifinal por el 5.º puesto');
    assert.equal(wrPhaseLabel('Semi-Finals'), 'Semifinal');
    assert.equal(wrPhaseLabel('Pool C'), 'Grupo C');
    assert.equal(wrPlaceholderLabel('4th Pool B'), '4.º Grupo B');
    assert.equal(wrPlaceholderLabel('Winner Match 13'), 'Ganador partido 13');
    assert.equal(wrPlaceholderLabel('Chile U20'), null);
});

test('en vivo trae marcador; programado no', () => {
    const [live] = parseWrSchedule(schedule([
        match({ id: ID(1), n: 1, millis: KICKOFF_1, home: ROU, away: BRA, status: 'L2', scores: [17, 12], secs: 3000 }),
    ]), CHALLENGER, KICKOFF_1 + 70 * 60_000);
    assert.equal(live.state, 'live');
    assert.equal(live.home.score, 17);
    assert.equal(live.away.score, 12);
    assert.equal(live.clockSecs, 3000);
});

test('caché: caliente con partido en juego, tibia el día del partido, fría el resto', () => {
    const fixtures = parseWrSchedule(schedule([
        match({ id: ID(1), n: 1, millis: KICKOFF_1, home: ROU, away: BRA }),
    ]), CHALLENGER, BEFORE);
    assert.equal(wrRefreshTtlSeconds(fixtures, BEFORE), WR_TTL_IDLE_SECONDS);
    assert.equal(wrRefreshTtlSeconds(fixtures, KICKOFF_1 - 6 * HOUR), WR_TTL_MATCHDAY_SECONDS);
    assert.equal(wrRefreshTtlSeconds(fixtures, KICKOFF_1 - 10 * 60_000), WR_TTL_HOT_SECONDS);
    assert.equal(wrRefreshTtlSeconds(fixtures, KICKOFF_1 + HOUR), WR_TTL_HOT_SECONDS);
});

// Recorte de `/match/{id}/timeline` (Argentina-USA, Mundial Juvenil 2026).
function ev(phase: string, secs: number, type: string, group: string, points: number, teamIndex: number, playerId: string | null) {
    return { phase, time: { secs, label: '' }, type, typeLabel: type, group, points, playerId, playerAltId: playerId, teamIndex, info: [] };
}

const TIMELINE = {
    timeline: [
        ev('L1', 170, 'T5', 'Try', 5, 0, 'p1'),
        ev('L1', 233, 'C2', 'Con', 2, 0, 'p2'),
        ev('L1', 1543, 'Yellow', 'YC', 0, 1, 'p9'),
        ev('L1', 1800, 'P3', 'Pen', 3, 1, 'p8'),
        ev('L2', 2403, 'MS', 'MS', 0, 0, null),
        ev('L2', 2900, 'Sub Off', 'Sub Off', 0, 0, 'p3'),
        ev('L2', 2900, 'Sub On', 'Sub On', 0, 0, 'p4'),
        ev('L2', 3100, 'PT5', 'Try', 7, 1, null),
        ev('L2', 3500, 'T5', 'Try', 5, 0, 'p1'),
        ev('L2', 3520, 'T5', 'Try', 5, 0, 'p5'),
        ev('L2', 3700, 'T5', 'Try', 5, 0, 'p5'),
        ev('C', 4800, 'MS', 'MS', 0, 0, null),
    ],
};

const NAMES = new Map([
    ['p1', 'Simón Pfister'],
    ['p2', 'Tomás Elizalde'],
    ['p3', 'Basilio Cañas'],
    ['p4', 'Jeremy Annand'],
    ['p5', 'Benjamín Ordiz'],
    ['p8', 'Jack Iscaro'],
    ['p9', 'Mason Gee'],
]);

test('cronología: tipos, jugadores, minuto y cambios juntos', () => {
    const events = parseWrTimeline(TIMELINE, NAMES);
    assert.deepEqual(events.map((e) => e.type), [
        'try', 'conversion', 'card_yellow', 'penalty_goal', 'substitution', 'penalty_try', 'try', 'try', 'try',
    ]);
    const [firstTry, , yellow, , sub, penaltyTry] = events;
    assert.equal(firstTry.minute, 3);
    assert.equal(firstTry.period, '1T');
    assert.equal(firstTry.description, 'Try de Simón Pfister');
    assert.equal(yellow.team, 'away');
    assert.equal(yellow.description, 'Tarjeta amarilla de Mason Gee');
    assert.equal(sub.player, 'Basilio Cañas');
    assert.equal(sub.subPlayer, 'Jeremy Annand');
    assert.equal(sub.period, '2T');
    assert.equal(penaltyTry.player, '');
    assert.equal(penaltyTry.points, 7);
    assert.deepEqual(events.map((e) => e.order), events.map((_, i) => i));
});

test('la cronología suma el marcador y los tiempos', () => {
    const events = parseWrTimeline(TIMELINE, NAMES);
    assert.deepEqual(wrTimelineTotals(events), { home: 22, away: 10 });
    assert.deepEqual(wrPeriodScores(events), [
        { period: '1', label: 'Primer tiempo', home: 7, away: 3 },
        { period: '2', label: 'Segundo tiempo', home: 15, away: 7 },
    ]);
    assert.deepEqual(wrTriesOf(TIMELINE), { home: 4, away: 1 });
});

test('formación: titulares por dorsal, suplentes aparte, capitán, técnico y árbitros', () => {
    const player = (id: string, name: string) => ({ id, name: { display: name, first: {}, last: {} } });
    const summary = parseWrSummary({
        teams: [
            {
                teamList: {
                    captainIds: ['a10'],
                    list: [
                        { player: player('a15', 'Simón Pfister'), number: '15', position: 'FB', positionLabel: 'Full Back', order: 26 },
                        { player: player('a23', 'Benjamín Ordiz'), number: '23', position: 'Rep', positionLabel: 'Replacement', order: 38 },
                        { player: player('a10', 'Tomás Elizalde'), number: '10', position: 'FH', positionLabel: 'Fly Half', order: 20 },
                        { player: player('c1', 'Juan Pérez'), number: null, position: null, positionLabel: 'Head Coach', order: 99 },
                    ],
                },
            },
            { teamList: { captainIds: [], list: [] } },
        ],
        officials: [
            { official: { id: 'r1', name: { display: 'Saba Makharadze' }, country: null }, position: 'Referee' },
            { official: { id: 'r2', name: { display: 'Matt Rodden' }, country: 'New Zealand' }, position: 'TV Match Official' },
        ],
    });

    assert.deepEqual(summary.home.starters.map((p) => [p.number, p.name, p.position, p.isCaptain]), [
        [10, 'Tomás Elizalde', 'Apertura', true],
        [15, 'Simón Pfister', 'Fullback', false],
    ]);
    assert.deepEqual(summary.home.replacements.map((p) => p.number), [23]);
    assert.equal(summary.home.coach, 'Juan Pérez');
    assert.equal(summary.away.starters.length, 0);
    assert.equal(wrRefereeOf(summary), 'Saba Makharadze');
    assert.deepEqual(summary.officials.map((o) => o.role), ['Árbitro', 'TMO']);
});

test('planteles por selección, en orden alfabético', () => {
    const squads = parseWrSquads({
        squads: [
            { team: { id: '2764', name: 'Chile U20' }, players: [
                { player: { id: 'b', name: { display: 'Lucas Pizarro' } }, number: '?', position: '?' },
                { player: { id: 'a', name: { display: 'Ignacio Valdés' } }, number: '?', position: '?' },
            ] },
        ],
    });
    assert.deepEqual(squads.get('2764')?.map((p) => p.name), ['Ignacio Valdés', 'Lucas Pizarro']);
});

test('estadísticas: porcentajes, metros y lo ganado sobre lo jugado', () => {
    const rows = parseWrStats({
        teamStats: [
            { stats: { Possession: 0.53, Metres: 910, Tackles: 150, ScrumsWon: 9, ScrumsTotal: 9 } },
            { stats: { Possession: 0.47, Metres: 574, Tackles: 116, ScrumsWon: 1, ScrumsTotal: 4 } },
        ],
    });
    assert.deepEqual(rows, [
        { label: 'Posesión', home: '53%', away: '47%' },
        { label: 'Metros ganados', home: '910 m', away: '574 m' },
        { label: 'Tackles', home: '150', away: '116' },
        { label: 'Scrums ganados', home: '9/9', away: '1/4' },
    ]);
    assert.deepEqual(parseWrStats({ teamStats: [] }), []);
});

test('tabla calculada: 4 el triunfo, bonus ofensivo y defensivo', () => {
    const now = KICKOFF_1 + 30 * 24 * HOUR;
    const fixtures = parseWrSchedule(schedule([
        match({ id: ID(1), n: 1, millis: KICKOFF_1, home: ROU, away: BRA, status: 'C', scores: [24, 19] }),
        match({ id: ID(4), n: 4, millis: KICKOFF_4, home: CHI, away: HKG, status: 'C', scores: [40, 10] }),
        match({ id: ID(6), n: 6, millis: KICKOFF_4 + 5 * 24 * HOUR, home: HKG, away: BRA, status: 'U' }),
    ]), CHALLENGER, now);

    const tries = new Map([
        [ID(1), { home: 3, away: 3 }],
        [ID(4), { home: 6, away: 1 }],
    ]);
    const [poolA] = computeWrPoolTables(fixtures, tries);
    assert.equal(poolA.name, 'Grupo A');
    assert.deepEqual(poolA.rows.map((r) => [r.name, r.played, r.points, r.bonusPoints]), [
        ['Chile M20', 1, 5, 1],
        ['Rumania M20', 1, 4, 0],
        // Perdió por cinco: bonus defensivo.
        ['Brasil M20', 1, 1, 1],
        ['Hong Kong China M20', 1, 0, 0],
    ]);

    // Sin la cronología de un partido, no hay bonus ofensivo inventado.
    const [withoutTries] = computeWrPoolTables(fixtures, new Map());
    assert.equal(withoutTries.rows[0].points, 4);
});

test('la tabla oficial manda solo si está al día', () => {
    const official = parseWrStandings({
        tables: [{ label: 'Pool A', shortLabel: 'A', entries: [
            { team: CHI, played: 1, won: 1, lost: 0, drawn: 0, pointsFor: 40, pointsAgainst: 10, triesFor: 6, triesAgainst: 1, bonusPoints: 1, points: 5 },
        ] }],
    }, CHALLENGER);
    assert.equal(official[0].rows[0].name, 'Chile M20');

    const computedSame = [{ pool: 'A', name: 'Grupo A', rows: [{ ...official[0].rows[0] }] }];
    assert.equal(pickWrStandings(official, computedSame).source, 'official');

    const computedAhead = [{ pool: 'A', name: 'Grupo A', rows: [{ ...official[0].rows[0], played: 2 }] }];
    assert.equal(pickWrStandings(official, computedAhead).source, 'computed');
    assert.equal(pickWrStandings([], computedSame).source, 'computed');
});

// --------------------------------------------------------------------------
// Carga manual
// --------------------------------------------------------------------------

const MANUAL_KICKOFF = Date.UTC(2026, 9, 2, 13, 0);
const MANUAL_ID = '400ae82f-b7d0-4b31-8ad6-35be501b6e2a';

function wrFixture(state: 'scheduled' | 'live' | 'final', score: [number, number] | null = null) {
    const side = (name: string, country: string, value: number | null) => ({
        teamId: country, name, country, abbreviation: null, placeholder: false, score: value,
    });
    return {
        matchId: MANUAL_ID,
        number: 1,
        pool: 'A',
        phase: '',
        stageLabel: 'Grupo A · Fecha 1',
        round: 1,
        kickoffMs: MANUAL_KICKOFF,
        kickoffIso: new Date(MANUAL_KICKOFF).toISOString(),
        venue: '',
        city: '',
        home: side('Rumania M20', 'Romania', score ? score[0] : null),
        away: side('Brasil M20', 'Brazil', score ? score[1] : null),
        rawStatus: state === 'scheduled' ? 'U' : state === 'live' ? 'L1' : 'C',
        state,
        clockSecs: null,
    };
}

function manualOf(raw: Record<string, unknown>) {
    const result = parseWrManualResult(raw);
    assert.ok(result);
    return new Map([[MANUAL_ID, result]]);
}

test('carga manual: valida estado y marcador, y descarta tries de un solo lado', () => {
    assert.equal(parseWrManualResult({ status: 'terminado', homeScore: 1, awayScore: 0 }), null);
    assert.equal(parseWrManualResult({ status: 'final', homeScore: -3, awayScore: 0 }), null);
    assert.equal(parseWrManualResult({ status: 'final', homeScore: 7.5, awayScore: 0 }), null);
    assert.deepEqual(parseWrManualResult({ status: 'final', homeScore: '24', awayScore: 17, homeTries: 3, minute: 50 }), {
        status: 'final', homeScore: 24, awayScore: 17, homeTries: null, awayTries: null, minute: null,
    });
});

test('carga manual: cubre el partido que World Rugby no publicó', () => {
    const now = MANUAL_KICKOFF + 2 * 3_600_000;
    const [fixture] = applyWrManualResults([wrFixture('scheduled')], manualOf({
        status: 'final', homeScore: 24, awayScore: 17, homeTries: 3, awayTries: 2,
    }), now);
    assert.equal(fixture.state, 'final');
    assert.equal(fixture.rawStatus, 'C');
    assert.equal(fixture.home.score, 24);
    assert.equal(fixture.away.score, 17);
    assert.equal(fixture.manual, true);
    assert.deepEqual(fixture.manualTries, { home: 3, away: 2 });
});

test('carga manual: World Rugby manda en cuanto publica algo', () => {
    const manual = manualOf({ status: 'final', homeScore: 24, awayScore: 17 });
    const now = MANUAL_KICKOFF + 30 * 60_000;
    for (const official of [wrFixture('live', [5, 0]), wrFixture('final', [22, 15])]) {
        const [fixture] = applyWrManualResults([official], manual, now);
        assert.equal(fixture, official);
    }
});

test('carga manual: el en vivo lleva minuto y entretiempo, y se cierra solo a las 3 h', () => {
    const during = MANUAL_KICKOFF + 60 * 60_000;
    const [live] = applyWrManualResults([wrFixture('scheduled')], manualOf({ status: 'live', homeScore: 10, awayScore: 7, minute: 54 }), during);
    assert.equal(live.state, 'live');
    assert.equal(wrLiveLabel(live.rawStatus, live.clockSecs), "54'");

    const [half] = applyWrManualResults([wrFixture('scheduled')], manualOf({ status: 'halftime', homeScore: 10, awayScore: 7 }), during);
    assert.equal(wrLiveLabel(half.rawStatus, half.clockSecs), 'Entretiempo');

    const [forgotten] = applyWrManualResults(
        [wrFixture('scheduled')],
        manualOf({ status: 'live', homeScore: 10, awayScore: 7, minute: 60 }),
        MANUAL_KICKOFF + 4 * 3_600_000,
    );
    assert.equal(forgotten.state, 'final');
});

test('carga manual: el partido cargado suma a la tabla, con bonus si hay tries', () => {
    const now = MANUAL_KICKOFF + 2 * 3_600_000;
    const [fixture] = applyWrManualResults([wrFixture('scheduled')], manualOf({
        status: 'final', homeScore: 31, awayScore: 26, homeTries: 5, awayTries: 4,
    }), now);
    const tries = new Map([[fixture.matchId, fixture.manualTries as { home: number; away: number }]]);
    const [table] = computeWrPoolTables([fixture], tries);
    const romania = table.rows.find((row) => row.country === 'Romania');
    const brazil = table.rows.find((row) => row.country === 'Brazil');
    assert.equal(romania?.points, 5);
    assert.equal(brazil?.points, 2);
});
