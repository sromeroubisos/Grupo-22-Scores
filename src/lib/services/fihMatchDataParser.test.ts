import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fihFixtureJoinKey,
    parseBoxScore,
    parseFihH2H,
    parseFihSquad,
    parseFihTour,
    parseIsoDurationSeconds,
    parseSportradarFixtures,
    parseSportradarMatchDetail,
} from './fihMatchDataParser.ts';

/**
 * Los payloads de acá están calcados de los que sirvieron las dos plataformas
 * el 15/08/2026 para India 3-1 Gales (partido 1 del Mundial), recortados a lo
 * que el parser mira. Se conservan las trampas del original:
 *
 *  · el reloj cuenta HACIA ATRÁS adentro del cuarto y viene en ISO-8601, a
 *    veces con cero adelante ("PT09M30S") y a veces sin él ("PT8M4S");
 *  · Sportradar escribe el UTC SIN la Z, así que leerlo crudo lo interpreta
 *    como hora local del servidor;
 *  · sólo los goles traen el nombre del jugador: el resto hay que buscarlo en
 *    la planilla;
 *  · antes del bols la planilla existe con TODOS los campos en null;
 *  · el cuadro final trae partidos sin equipos definidos.
 */

const SR_FIXTURES = {
    data: {
        fixtures: [
            {
                fixtureId: 'b842bb4e-22b1-11f1-803d-ed8395d112a8',
                startTimeUTC: '2026-08-15T11:00:00',
                pool: 'D',
                status: { value: 'CONFIRMED', label: 'Confirmed' },
                competitors: [
                    { code: 'IND', name: 'India', isHome: true, score: '3' },
                    { code: 'WAL', name: 'Wales', isHome: false, score: '1' },
                ],
            },
            {
                fixtureId: 'b840757d-22b1-11f1-9997-274bff8845a1',
                startTimeUTC: '2026-08-15T17:00:00',
                pool: 'D',
                status: { value: 'SCHEDULED', label: 'Scheduled' },
                competitors: [
                    { code: 'ENG', name: 'England', isHome: true, score: null },
                    { code: 'PAK', name: 'Pakistan', isHome: false, score: null },
                ],
            },
            {
                // Cruce del cuadro final: todavía no se sabe quién juega.
                fixtureId: 'aa000000-0000-11f1-0000-000000000000',
                startTimeUTC: '2026-08-28T07:30:00',
                pool: '',
                status: { value: 'SCHEDULED', label: 'Scheduled' },
                competitors: [
                    { code: null, name: null, isHome: true, score: null },
                    { code: null, name: null, isHome: false, score: null },
                ],
            },
        ],
    },
};

const HOME_ID = '8b89fb15-4727-11ef-98a6-ffae7c73f6b4';
const AWAY_ID = '9b01ffa4-4727-11ef-94dd-c7d3e096c370';

const SR_DETAIL = {
    data: {
        seasonId: '9ecc146f-211f-11f1-bab4-fd87722676e2',
        periodData: {
            periodLabels: { '1': 'Q1', '2': 'Q2', '3': 'Q3', '4': 'Q4', '10': 'OT1', '12': 'PEN' },
            teamScores: {
                [HOME_ID]: [
                    { periodId: 1, score: 2 },
                    { periodId: 2, score: 0 },
                    { periodId: 3, score: 1 },
                    { periodId: 4, score: 0 },
                ],
                [AWAY_ID]: [
                    { periodId: 1, score: 0 },
                    { periodId: 2, score: 0 },
                    { periodId: 3, score: 0 },
                    { periodId: 4, score: 1 },
                ],
            },
        },
        teamStaff: {
            matchOfficials: [
                { name: 'BURT Josh', role: 'TECHNICAL_OFFICIAL', roleLabel: 'Technical official' },
                { name: 'EDWARDS Sean', role: 'UMPIRE_VIDEO', roleLabel: 'Video umpire' },
                { name: 'RUSSELL Kate', role: 'UMPIRE', roleLabel: 'Umpire' },
            ],
        },
        banner: {
            fixture: {
                attendance: 8100,
                status: 'CONFIRMED',
                competitors: [
                    { code: 'IND', name: 'India', isHome: true, entityId: HOME_ID, score: '3' },
                    { code: 'WAL', name: 'Wales', isHome: false, entityId: AWAY_ID, score: '1' },
                ],
                matchEvents: {
                    '1': {
                        durationMinutes: 15,
                        elapsedMinutesBeforePeriod: 0,
                        events: [
                            {
                                eventId: 'ev-1', eventType: 'penaltyCorner', eventSubType: null,
                                desc: 'Penalty Corner', clock: 'PT8M4S', entityId: HOME_ID,
                                name: '', bib: null, personId: null,
                                scores: { [HOME_ID]: 0, [AWAY_ID]: 0 },
                            },
                            {
                                eventId: 'ev-2', eventType: 'goal', eventSubType: null,
                                desc: 'Goal', clock: 'PT7M53S', entityId: HOME_ID,
                                name: 'Sanjay', bib: '70', personId: 'p-sanjay',
                                scores: { [HOME_ID]: 1, [AWAY_ID]: 0 },
                            },
                            {
                                // Tarjeta sin nombre: sale de la planilla.
                                eventId: 'ev-3', eventType: 'greenCard', eventSubType: null,
                                desc: 'Green Card', clock: 'PT01M00S', entityId: AWAY_ID,
                                name: '', bib: null, personId: 'p-welsh',
                                scores: { [HOME_ID]: 1, [AWAY_ID]: 0 },
                            },
                            {
                                // Vocabulario que no mapeamos: no ensucia la cronología.
                                eventId: 'ev-4', eventType: 'timeout', desc: 'Timeout',
                                clock: 'PT00M30S', entityId: HOME_ID, name: '', personId: null,
                                scores: { [HOME_ID]: 1, [AWAY_ID]: 0 },
                            },
                        ],
                    },
                    '3': {
                        durationMinutes: 15,
                        elapsedMinutesBeforePeriod: 30,
                        events: [
                            {
                                eventId: 'ev-5', eventType: 'goal', eventSubType: null,
                                desc: 'Goal', clock: 'PT2M31S', entityId: HOME_ID,
                                name: 'SINGH Harmanpreet', bib: '13', personId: 'p-singh',
                                scores: { [HOME_ID]: 3, [AWAY_ID]: 0 },
                            },
                        ],
                    },
                },
            },
        },
        statistics: {
            data: {
                base: {
                    home: {
                        totalEntityStats: {
                            fieldGoalsScored: 0, goalsConceded: 1, goalsScored: 3, greenCards: 0,
                            penaltyCornersEarned: 5, penaltyCornersEfficency: 60.0,
                            penaltyCornersScored: 3, penaltyStrokesEarned: 0,
                            penaltyStrokesMissed: 0, penaltyStrokesSaved: 0,
                            penaltyStrokesScored: 0, redCards: 0, yellowCards: 0,
                        },
                        persons: [{
                            label: 'Players',
                            rows: [
                                {
                                    personId: 'p-singh', personName: 'SINGH Harmanpreet', bib: '13',
                                    position: null, starter: true, participated: true,
                                    statistics: { goalsScored: 2, greenCards: 0, yellowCards: 0, redCards: 0 },
                                },
                                {
                                    personId: 'p-pathak', personName: 'PATHAK Krishan', bib: '1',
                                    position: 'GK', starter: true, participated: true,
                                    statistics: { goalsScored: 0, greenCards: 0, yellowCards: 0, redCards: 0 },
                                },
                                {
                                    personId: 'p-sanjay', personName: 'Sanjay', bib: '70',
                                    position: null, starter: false, participated: true,
                                    statistics: { goalsScored: 1, greenCards: 0, yellowCards: 0, redCards: 0 },
                                },
                            ],
                        }],
                    },
                    away: {
                        totalEntityStats: {
                            fieldGoalsScored: 1, goalsConceded: 3, goalsScored: 1, greenCards: 1,
                            penaltyCornersEarned: 1, penaltyCornersEfficency: 0.0,
                            penaltyCornersScored: 0, penaltyStrokesEarned: 0,
                            penaltyStrokesMissed: 0, penaltyStrokesSaved: 0,
                            penaltyStrokesScored: 0, redCards: 0, yellowCards: 0,
                        },
                        persons: [{
                            label: 'Players',
                            rows: [{
                                personId: 'p-welsh', personName: 'WELSH Sam', bib: '16',
                                position: null, starter: true, participated: true,
                                statistics: { goalsScored: 1, greenCards: 1, yellowCards: 0, redCards: 0 },
                            }],
                        }],
                    },
                },
            },
        },
    },
};

const SR_DETAIL_PREMATCH = {
    data: {
        periodData: { periodLabels: { '1': 'Q1' }, teamScores: {} },
        banner: {
            fixture: {
                attendance: null,
                status: 'SCHEDULED',
                competitors: [
                    { code: 'ENG', isHome: true, entityId: 'e1' },
                    { code: 'PAK', isHome: false, entityId: 'e2' },
                ],
                matchEvents: {},
            },
        },
        statistics: {
            data: {
                base: {
                    home: {
                        totalEntityStats: {
                            goalsScored: null, fieldGoalsScored: null, penaltyCornersEarned: null,
                            greenCards: null, yellowCards: null, redCards: null,
                        },
                        persons: [],
                    },
                    away: {
                        totalEntityStats: {
                            goalsScored: null, fieldGoalsScored: null, penaltyCornersEarned: null,
                            greenCards: null, yellowCards: null, redCards: null,
                        },
                        persons: [],
                    },
                },
            },
        },
    },
};

const FIH_TOUR = {
    tour_id: 1866,
    tour_name: 'FIH Hockey World Cup Belgium & Netherlands 2026 (M)',
    sr_tour_id: '9ecc146f-211f-11f1-bab4-fd87722676e2',
    series: [{
        series_id: 1866,
        series_name: 'FIH Hockey World Cup Belgium & Netherlands 2026 (M)',
        participants: [
            { team_id: 35, team_name: 'Argentina', team_name_short: 'ARG', sr_team_id: '7e70cf51-4727-11ef-807d-ffae7c73f6b4' },
            { team_id: 17, team_name: 'India', team_name_short: 'IND', sr_team_id: '8b89fb15-4727-11ef-98a6-ffae7c73f6b4' },
            { team_id: 5, team_name: 'Wales', team_name_short: 'WAL', sr_team_id: null },
        ],
    }],
};

const FIH_SQUAD = {
    team_id: 17,
    team_name: 'India',
    squads: {
        players: [
            {
                id: 909, person_id: 909, name: 'SINGH Mandeep', jersey_no: '11', caps: '306',
                is_goalkeeper: false, si_person_id: '9c12b17e-4731-11ef-9681-5da4012dcd04',
                player_image_url: 'https://images.dc.connect.sportradar.com/k11s0/ce97',
            },
            {
                id: 910, person_id: 910, name: 'PATHAK Krishan', jersey_no: '1', caps: '150',
                is_goalkeeper: true, si_person_id: 'p-pathak', player_image_url: '',
            },
        ],
    },
};

const FIH_H2H = {
    match_details: { match_id: 22334, comp_id: 1866, vs: 'India vs Wales' },
    teams: [
        { team_id: 17, team_name: 'India', team_short_name: 'IND', matches_played: 5, won: 5, lost: 0, tied: 0 },
        { team_id: 5, team_name: 'Wales', team_short_name: 'WAL', matches_played: 5, won: 0, lost: 5, tied: 0 },
    ],
    last_n_matches: [
        {
            match_id: 22334, match_date: '2026-08-15', match_time: '13:00:00',
            comp_name: 'FIH Hockey World Cup Belgium & Netherlands 2026 (M)',
            team1_name: 'India', team1_short_name: 'IND', team1_score: 3,
            team2_name: 'Wales', team2_short_name: 'WAL', team2_score: 1,
        },
        {
            match_id: 20155, match_date: '2023-01-19', match_time: '19:00:00',
            comp_name: 'FIH Odisha Hockey Men\'s World Cup 2023',
            team1_name: 'India', team1_short_name: 'IND', team1_score: 4,
            team2_name: 'Wales', team2_short_name: 'WAL', team2_score: 2,
        },
    ],
};

// --------------------------------------------------------------------------

test('el reloj ISO se lee con y sin cero adelante', () => {
    assert.equal(parseIsoDurationSeconds('PT8M4S'), 484);
    assert.equal(parseIsoDurationSeconds('PT09M30S'), 570);
    assert.equal(parseIsoDurationSeconds('PT15M'), 900);
    assert.equal(parseIsoDurationSeconds('PT0M0S'), 0);
});

test('lo que no es una duración devuelve null en vez de cero', () => {
    // Un cero acá pondría todos los eventos al final del cuarto.
    assert.equal(parseIsoDurationSeconds(''), null);
    assert.equal(parseIsoDurationSeconds('15:00'), null);
    assert.equal(parseIsoDurationSeconds('PT'), null);
    assert.equal(parseIsoDurationSeconds(null), null);
});

test('la llave de cruce no depende de quién figure como local', () => {
    const asPublished = fihFixtureJoinKey('IND', 'WAL', '2026-08-15T11:00:00Z');
    const reversed = fihFixtureJoinKey('WAL', 'IND', '2026-08-15T11:00:00Z');
    assert.equal(asPublished, reversed);
    assert.equal(asPublished, 'IND-WAL@2026-08-15');
});

test('la llave de cruce aguanta un cambio de horario dentro del día', () => {
    // Altius y Sportradar pueden diferir media hora si se adelanta el partido.
    assert.equal(
        fihFixtureJoinKey('IND', 'WAL', '2026-08-15T11:00:00Z'),
        fihFixtureJoinKey('ind', 'wal', '2026-08-15T13:30:00Z'),
    );
});

test('sin equipos definidos no hay llave: el cuadro final no se cruza a ciegas', () => {
    assert.equal(fihFixtureJoinKey(null, 'WAL', '2026-08-28T07:30:00Z'), null);
    assert.equal(fihFixtureJoinKey('', '', '2026-08-28T07:30:00Z'), null);
});

test('la grilla de Sportradar se lee con el UTC marcado como UTC', () => {
    const fixtures = parseSportradarFixtures(SR_FIXTURES);
    assert.equal(fixtures.length, 3);

    const first = fixtures[0];
    assert.equal(first.fixtureId, 'b842bb4e-22b1-11f1-803d-ed8395d112a8');
    // Sin la Z el servidor lo leería como hora local y el partido se correría.
    assert.equal(first.startsAtIso, '2026-08-15T11:00:00Z');
    assert.equal(Date.parse(first.startsAtIso!), Date.UTC(2026, 7, 15, 11, 0, 0));
    assert.equal(first.homeCode, 'IND');
    assert.equal(first.awayCode, 'WAL');
    assert.equal(first.status, 'CONFIRMED');
});

test('un cruce sin rivales entra a la grilla pero sin códigos', () => {
    const placeholder = parseSportradarFixtures(SR_FIXTURES)[2];
    assert.equal(placeholder.homeCode, null);
    assert.equal(placeholder.awayCode, null);
});

test('el minuto sale de un reloj que cuenta hacia atrás', () => {
    const { events } = parseSportradarMatchDetail(SR_DETAIL);

    // Q1, cuarto de 15': a falta de 7'53" van corridos 7'07".
    const goal = events.find((event) => event.id === 'ev-2')!;
    assert.equal(goal.period, 'Q1');
    assert.equal(goal.minute, 7);

    // Q3 arranca con 30' ya jugados: 30 + (15 - 2'31") = 42'.
    const secondHalfGoal = events.find((event) => event.id === 'ev-5')!;
    assert.equal(secondHalfGoal.period, 'Q3');
    assert.equal(secondHalfGoal.minute, 42);
});

test('los eventos hablan el vocabulario de hockey de la app', () => {
    const { events } = parseSportradarMatchDetail(SR_DETAIL);
    assert.deepEqual(
        events.map((event) => event.type),
        ['penalty_corner', 'goal', 'green_card', 'goal'],
    );
});

test('un tipo de evento que no mapeamos no entra a la cronología', () => {
    const { events } = parseSportradarMatchDetail(SR_DETAIL);
    assert.equal(events.some((event) => event.id === 'ev-4'), false);
});

test('cada evento queda del lado del equipo que lo hizo', () => {
    const { events } = parseSportradarMatchDetail(SR_DETAIL);
    assert.equal(events.find((event) => event.id === 'ev-2')!.team, 'home');
    assert.equal(events.find((event) => event.id === 'ev-3')!.team, 'away');
});

test('la tarjeta sin nombre lo saca de la planilla', () => {
    // El feed sólo pone `name` en los goles: sin este cruce las tarjetas y los
    // corners aparecen sin jugador.
    const card = parseSportradarMatchDetail(SR_DETAIL).events.find((event) => event.id === 'ev-3')!;
    assert.equal(card.player, 'WELSH Sam');
    assert.equal(card.number, 16);
});

test('los eventos van en orden de partido, no en orden de cuarto suelto', () => {
    const { events } = parseSportradarMatchDetail(SR_DETAIL);
    const minutes = events.map((event) => event.minute);
    assert.deepEqual(minutes, [...minutes].sort((left, right) => left - right));
});

test('el marcador corriente viaja con cada evento', () => {
    const goal = parseSportradarMatchDetail(SR_DETAIL).events.find((event) => event.id === 'ev-5')!;
    assert.equal(goal.scoreHome, 3);
    assert.equal(goal.scoreAway, 0);
});

test('la planilla del equipo llega ordenada y con la efectividad en porcentaje', () => {
    const { teamStats } = parseSportradarMatchDetail(SR_DETAIL);
    assert.equal(teamStats[0].key, 'goalsScored');
    assert.equal(teamStats[0].home, '3');
    assert.equal(teamStats[0].away, '1');

    const efficiency = teamStats.find((stat) => stat.key === 'penaltyCornersEfficency')!;
    assert.equal(efficiency.home, '60%');
    assert.equal(efficiency.away, '0%');
    assert.equal(efficiency.home_value, 60);
});

test('los goles recibidos no se muestran: son los del rival dados vuelta', () => {
    const { teamStats } = parseSportradarMatchDetail(SR_DETAIL);
    assert.equal(teamStats.some((stat) => stat.key === 'goalsConceded'), false);
});

test('antes del bols la planilla en null no dibuja trece filas vacías', () => {
    const detail = parseSportradarMatchDetail(SR_DETAIL_PREMATCH);
    assert.deepEqual(detail.teamStats, []);
    assert.deepEqual(detail.events, []);
    assert.deepEqual(detail.players, []);
    assert.equal(detail.attendance, null);
});

test('la planilla por jugador distingue titular, arquero y suplente', () => {
    const players = parseBoxScore(SR_DETAIL);
    assert.equal(players.length, 4);

    const keeper = players.find((player) => player.name === 'PATHAK Krishan')!;
    assert.equal(keeper.isGoalkeeper, true);
    assert.equal(keeper.starter, true);
    assert.equal(keeper.team, 'home');

    const substitute = players.find((player) => player.name === 'Sanjay')!;
    assert.equal(substitute.starter, false);
    assert.equal(substitute.isGoalkeeper, false);
    assert.equal(substitute.stats.goalsScored, 1);
});

test('el marcador por cuarto sale con la etiqueta en castellano', () => {
    const { periods } = parseSportradarMatchDetail(SR_DETAIL);
    assert.equal(periods.length, 4);
    assert.deepEqual(periods[0], { period: 'Q1', label: '1° cuarto', home: 2, away: 0 });
    assert.deepEqual(periods[3], { period: 'Q4', label: '4° cuarto', home: 0, away: 1 });
});

test('los oficiales conservan el código del rol', () => {
    const { officials } = parseSportradarMatchDetail(SR_DETAIL);
    // Sin el código, filtrar "umpire" en el texto mete al de video y al reserva
    // en la cabecera como si hubieran dirigido el partido.
    assert.deepEqual(officials.map((official) => official.role), ['TECHNICAL_OFFICIAL', 'UMPIRE_VIDEO', 'UMPIRE']);
    assert.equal(officials[2].name, 'RUSSELL Kate');
});

test('el tour es el puente de identificadores entre las tres fuentes', () => {
    const tour = parseFihTour(FIH_TOUR);
    assert.equal(tour.seasonId, '9ecc146f-211f-11f1-bab4-fd87722676e2');
    assert.equal(tour.teams.length, 3);

    const india = tour.teams.find((team) => team.code === 'IND')!;
    assert.equal(india.teamId, 17);
    assert.equal(india.srTeamId, '8b89fb15-4727-11ef-98a6-ffae7c73f6b4');
});

test('el plantel trae los caps y el id con el que se cruza el box score', () => {
    const squad = parseFihSquad(FIH_SQUAD);
    assert.equal(squad.length, 2);

    const keeper = squad.find((player) => player.isGoalkeeper)!;
    assert.equal(keeper.name, 'PATHAK Krishan');
    assert.equal(keeper.number, 1);
    assert.equal(keeper.caps, 150);
    assert.equal(keeper.srPersonId, 'p-pathak');
});

test('el historial se lee como UTC y no como hora del servidor', () => {
    const { matches, balance } = parseFihH2H(FIH_H2H);
    assert.equal(matches.length, 2);
    assert.equal(matches[0].timestamp, Math.floor(Date.UTC(2026, 7, 15, 13, 0, 0) / 1000));
    assert.equal(matches[0].homeScore, 3);
    assert.equal(matches[0].awayCode, 'WAL');

    assert.equal(balance[0].name, 'India');
    assert.equal(balance[0].won, 5);
    assert.equal(balance[1].lost, 5);
});

test('un payload vacío no revienta ningún parser', () => {
    assert.deepEqual(parseSportradarFixtures(null), []);
    assert.deepEqual(parseSportradarFixtures({}), []);
    assert.deepEqual(parseFihSquad({}), []);
    assert.deepEqual(parseFihTour({}).teams, []);
    assert.equal(parseFihTour({}).seasonId, null);
    assert.deepEqual(parseFihH2H(null).matches, []);

    const detail = parseSportradarMatchDetail(undefined);
    assert.deepEqual(detail.events, []);
    assert.deepEqual(detail.teamStats, []);
    assert.deepEqual(detail.periods, []);
    assert.deepEqual(detail.officials, []);
});
