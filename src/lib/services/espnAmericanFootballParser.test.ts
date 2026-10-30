import test from 'node:test';
import assert from 'node:assert/strict';

import {
    LEAGUES,
    buildAmericanFootballScoringPlays,
    buildAmericanFootballTeamStats,
    buildRosterPlayers,
    enrichStandingsRowsForUi,
    getEspnLiveClock,
    getEspnReferee,
    getEspnRoundLabel,
    inferEspnAmericanFootballLeague,
    mapEspnStatus,
    normalizeEspnAmericanFootballStandingsRows,
    normalizeEspnEventCore,
    normalizeEspnEventForTournamentViews,
    normalizeEspnSummaryStandingsRows,
    parseRecordSummary,
    parseScore,
    toFeedPhaseId,
} from './espnAmericanFootballParser.ts';

/**
 * Cada caso de acá es una forma REAL del JSON de ESPN que el conector leía
 * mal (medido el 2026-09-10). Los fixtures son sintéticos pero copian la
 * estructura exacta: si ESPN la cambia, esto es lo que hay que actualizar.
 */

function stat(name: string, value: number | undefined, extra: Record<string, unknown> = {}) {
    return { name, type: name.toLowerCase(), value, displayValue: value === undefined ? undefined : String(value), ...extra };
}

function nflEntry(id: string, abbr: string, w: number, l: number, t: number, pf: number, pa: number, seed: number) {
    return {
        team: { id, abbreviation: abbr, displayName: `Equipo ${abbr}`, logos: [{ href: `https://x/${abbr}.png` }] },
        stats: [
            stat('wins', w), stat('losses', l), stat('ties', t),
            stat('pointsFor', pf), stat('pointsAgainst', pa),
            stat('pointDifferential', pf - pa),
            stat('playoffSeed', seed),
            stat('winPercent', (w + t / 2) / (w + l + t)),
            { name: 'streak', type: 'streak', value: 3, displayValue: 'W3' },
            { name: 'overall', type: 'total', summary: t ? `${w}-${l}-${t}` : `${w}-${l}`, displayValue: `${w}-${l}` },
        ],
    };
}

// ── Estado ──────────────────────────────────────────────────────────────────

test('cancelado y postergado no son Final aunque vengan con state "post"', () => {
    assert.equal(mapEspnStatus({ id: '5', name: 'STATUS_CANCELED', state: 'post', completed: false, description: 'Canceled' }), 'cancelled');
    assert.equal(mapEspnStatus({ id: '6', name: 'STATUS_POSTPONED', state: 'post', completed: false, description: 'Postponed' }), 'postponed');
    assert.equal(mapEspnStatus({ id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final' }), 'final');
    assert.equal(mapEspnStatus({ id: '22', name: 'STATUS_HALFTIME', state: 'in', completed: false, description: 'Halftime' }), 'live');
    assert.equal(mapEspnStatus({ id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled' }), 'scheduled');
});

test('el reloj en vivo lleva cuarto y tiempo; el entretiempo se rotula solo', () => {
    assert.equal(getEspnLiveClock({ period: 3, displayClock: '5:12', type: { id: '2', state: 'in' } }).label, '3Q 5:12');
    assert.equal(getEspnLiveClock({ period: 5, displayClock: '2:00', type: { id: '2', state: 'in' } }).label, 'OT 2:00');
    assert.equal(getEspnLiveClock({ period: 2, displayClock: '0:00', type: { id: '22', state: 'in' } }).label, 'ET');
    assert.equal(getEspnLiveClock({ period: 4, displayClock: '0:00', type: { id: '3', state: 'post' } }).label, null);
});

// ── Marcador y calendario ───────────────────────────────────────────────────

test('el marcador se lee como string (scoreboard) y como objeto (calendario por equipo)', () => {
    assert.equal(parseScore('13'), 13);
    assert.equal(parseScore({ value: 41, displayValue: '41' }), 41);
    assert.equal(parseScore({ displayValue: '7' }), 7);
    assert.equal(parseScore(undefined), null);
});

test('el rótulo de la fecha distingue pretemporada, regular y playoffs', () => {
    assert.equal(getEspnRoundLabel({ season: { type: 2 }, week: { number: 1 }, competitions: [{}] }), 'Semana 1');
    assert.equal(getEspnRoundLabel({ season: { type: 1 }, week: { number: 1 }, competitions: [{}] }), 'Pretemporada · Semana 1');
    assert.equal(
        getEspnRoundLabel({ season: { type: 3 }, week: { number: 5 }, competitions: [{ notes: [{ headline: 'Super Bowl LX' }] }] }),
        'Super Bowl LX',
    );
    assert.equal(getEspnRoundLabel({ season: { type: 3 }, week: { number: 2 }, competitions: [{}] }), 'Playoffs · Semana 2');
    assert.equal(toFeedPhaseId('postseason'), 'playoffs');
    assert.equal(toFeedPhaseId('regular'), 'group');
});

test('el Pro Bowl no entra como partido', () => {
    const proBowl = {
        id: '1',
        date: '2026-02-04T20:00Z',
        season: { type: 3, year: 2025 },
        week: { number: 4 },
        competitions: [{
            type: { id: '4', abbreviation: 'ALLSTAR' },
            status: { type: { id: '3', state: 'post', completed: true } },
            competitors: [
                { homeAway: 'home', team: { id: '31', displayName: 'AFC' }, score: '30' },
                { homeAway: 'away', team: { id: '32', displayName: 'NFC' }, score: '27' },
            ],
        }],
    };
    assert.equal(normalizeEspnEventCore(proBowl, LEAGUES.nfl), null);
});

test('un evento del calendario por equipo sale con marcador, fase y récord', () => {
    const scheduleEvent = {
        id: '401',
        date: '2025-09-07T17:00Z',
        season: { year: 2025 },
        seasonType: { id: '2', type: 2, name: 'Regular Season' },
        week: { number: 1, text: 'Week 1' },
        competitions: [{
            date: '2025-09-07T17:00Z',
            status: { period: 4, displayClock: '0:00', type: { id: '3', state: 'post', completed: true } },
            venue: { fullName: 'Estadio' },
            competitors: [
                {
                    homeAway: 'home',
                    winner: true,
                    team: { id: '2', displayName: 'Buffalo Bills', abbreviation: 'BUF', logos: [{ href: 'https://x/buf.png' }] },
                    score: { value: 41, displayValue: '41' },
                    record: [{ type: 'total', displayValue: '1-0' }],
                    linescores: [{ value: 7 }, { value: 10 }, { value: 14 }, { value: 10 }],
                },
                {
                    homeAway: 'away',
                    team: { id: '3', displayName: 'Rival', abbreviation: 'RIV', logos: [] },
                    score: { value: 40, displayValue: '40' },
                },
            ],
        }],
    };
    const view = normalizeEspnEventForTournamentViews(scheduleEvent, LEAGUES.nfl);
    assert.ok(view);
    assert.equal(view.score.home, 41);
    assert.equal(view.score.away, 40);
    assert.equal(view.status, 'final');
    assert.equal(view.round, 'Semana 1');
    assert.equal(view.season_phase, 'regular');
    assert.equal(view.home_team.record, '1-0');
    assert.deepEqual(view.linescores.home, [7, 10, 14, 10]);
    assert.equal(view.home_team.logo, 'https://x/buf.png');
});

// ── Tabla ───────────────────────────────────────────────────────────────────

test('la NFL con level=3 recorre conferencia → división y ordena dentro de cada división', () => {
    const payload = {
        children: [
            {
                name: 'American Football Conference',
                children: [
                    { name: 'AFC East', standings: { entries: [
                        nflEntry('2', 'BUF', 12, 5, 0, 481, 365, 6),
                        nflEntry('17', 'NE', 14, 3, 0, 490, 320, 2),
                        nflEntry('15', 'MIA', 7, 10, 0, 347, 424, 10),
                    ] } },
                    { name: 'AFC West', standings: { entries: [
                        nflEntry('7', 'DEN', 14, 3, 0, 401, 311, 1),
                    ] } },
                ],
            },
        ],
    };
    const rows = normalizeEspnAmericanFootballStandingsRows(payload, 'nfl');
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((r) => [r.group_name, r.position, r.team_name]), [
        ['AFC East', 1, 'Equipo NE'],
        ['AFC East', 2, 'Equipo BUF'],
        ['AFC East', 3, 'Equipo MIA'],
        ['AFC West', 1, 'Equipo DEN'],
    ]);
    const ne = rows[0];
    assert.equal(ne.played, 17);
    assert.equal(ne.won, 14);
    assert.equal(ne.lost, 3);
    assert.equal(ne.win_percentage, 0.824);
    assert.equal(ne.seed, 2);
    assert.equal(ne.streak, 'W3');
    assert.equal(ne.differential, 170);
    assert.equal(ne.team_id, 'espn-team-17');
});

test('la NCAA sin "losses" toma el récord del resumen overall y no pierde la Sun Belt anidada', () => {
    const ncaaEntry = (id: string, name: string, record: string, confWins: number) => ({
        team: { id, displayName: name, rank: 7, logos: [] },
        stats: [
            // El primer bloque es el de la conferencia: sin `losses`, `wins` es el de conferencia.
            stat('wins', confWins), stat('pointsFor', 439), stat('pointsAgainst', 273), stat('pointDifferential', 166),
            stat('playoffSeed', 3), stat('leagueWinPercent', 0.875),
            { name: 'overall', type: 'total', summary: record, displayValue: record },
            { name: 'wins', type: 'homerecord_wins', value: 7 },
            { name: 'Home', type: 'homerecord', summary: '7-1' },
        ],
    });
    const payload = {
        children: [
            { name: 'Southeastern Conference', standings: { entries: [
                ncaaEntry('245', 'Texas A&M', '11-2', 7),
                ncaaEntry('61', 'Georgia', '12-2', 7),
            ] } },
            { name: 'Sun Belt Conference', children: [
                { name: 'Sun Belt - East', standings: { entries: [ncaaEntry('290', 'Troy', '5-7', 3)] } },
                { name: 'Sun Belt - West', standings: { entries: [ncaaEntry('309', 'Arkansas State', '9-4', 5)] } },
            ] },
        ],
    };
    const rows = normalizeEspnAmericanFootballStandingsRows(payload, 'college-football');
    assert.equal(rows.length, 4);
    const aggies = rows.find((r) => r.team_name === 'Texas A&M')!;
    assert.equal(aggies.won, 11);
    assert.equal(aggies.lost, 2);
    assert.equal(aggies.played, 13);
    assert.equal(aggies.rank, 7);
    assert.deepEqual(new Set(rows.map((r) => r.group_name)), new Set(['Southeastern Conference', 'Sun Belt - East', 'Sun Belt - West']));
});

test('fuera de temporada (todo 0-0) nadie queda en la posición 0', () => {
    const payload = {
        children: [
            { name: 'AFC', standings: { entries: [nflEntry('2', 'BUF', 0, 0, 0, 0, 0, 0), nflEntry('17', 'NE', 0, 0, 0, 0, 0, 0)] } },
            { name: 'NFC', standings: { entries: [nflEntry('26', 'SEA', 0, 0, 0, 0, 0, 0)] } },
        ],
    };
    const rows = normalizeEspnAmericanFootballStandingsRows(payload, 'nfl');
    assert.deepEqual(rows.map((r) => r.position), [1, 2, 1]);
    assert.ok(rows.every((r) => r.seed === null));
});

test('una tabla plana (UFL) no lleva nombre de grupo', () => {
    const payload = { standings: { entries: [nflEntry('1', 'A', 5, 3, 0, 100, 80, 1), nflEntry('2', 'B', 3, 5, 0, 80, 100, 2)] } };
    const rows = normalizeEspnAmericanFootballStandingsRows(payload, 'ufl');
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.group_name === undefined));
    const ui = enrichStandingsRowsForUi(rows, 'ufl');
    assert.equal(ui[0].matches_played, 8);
    assert.equal(ui[0].win_percentage, 0.625);
    assert.equal('group_name' in ui[0], false);
});

test('las filas para la UI conservan el grupo y el porcentaje que la tabla ordena', () => {
    const rows = normalizeEspnAmericanFootballStandingsRows({
        children: [
            { name: 'AFC East', standings: { entries: [nflEntry('17', 'NE', 14, 3, 0, 490, 320, 2)] } },
            { name: 'NFC West', standings: { entries: [nflEntry('26', 'SEA', 14, 3, 0, 483, 292, 1)] } },
        ],
    }, 'nfl');
    const ui = enrichStandingsRowsForUi(rows, 'nfl');
    assert.equal(ui[0].group_name, 'AFC East');
    assert.equal(ui[0].group, 'AFC East');
    assert.equal(ui[1].group_name, 'NFC West');
    assert.equal(ui[0].played, 17);
    assert.equal(ui[0].goal_difference, 170);
});

test('las mini-tablas del resumen del partido (equipo como string) se leen como tabla', () => {
    const summary = {
        standings: {
            groups: [
                {
                    header: '2026 AFC East Standings',
                    standings: { entries: [
                        { team: 'Buffalo', id: '2', logo: [{ href: 'https://x/buf.png' }], stats: [stat('wins', 1), stat('losses', 0), stat('ties', 0), stat('pointsFor', 30), stat('pointsAgainst', 10), { name: 'overall', type: 'total', summary: '1-0' }] },
                        { team: 'New England', id: '17', logo: [], stats: [stat('wins', 0), stat('losses', 1), stat('ties', 0), stat('pointsFor', 10), stat('pointsAgainst', 13), { name: 'overall', type: 'total', summary: '0-1' }] },
                    ] },
                },
                {
                    header: '2026 NFC West Standings',
                    standings: { entries: [
                        { team: 'Seattle', id: '26', logo: [], stats: [stat('wins', 1), stat('losses', 0), stat('ties', 0), { name: 'overall', type: 'total', summary: '1-0' }] },
                    ] },
                },
            ],
        },
    };
    const rows = normalizeEspnSummaryStandingsRows(summary);
    assert.deepEqual(rows.map((r) => [r.group_name, r.position, r.team_name, r.team_id]), [
        ['AFC East', 1, 'Buffalo', 'espn-team-2'],
        ['AFC East', 2, 'New England', 'espn-team-17'],
        ['NFC West', 1, 'Seattle', 'espn-team-26'],
    ]);
    assert.equal(rows[0].team_logo, 'https://x/buf.png');
    assert.equal(rows[1].lost, 1);
});

test('parseRecordSummary lee W-L y W-L-T', () => {
    assert.deepEqual(parseRecordSummary('11-2'), { w: 11, l: 2, t: 0 });
    assert.deepEqual(parseRecordSummary('9-7-1'), { w: 9, l: 7, t: 1 });
    assert.equal(parseRecordSummary('-'), null);
});

// ── Detalle del partido ─────────────────────────────────────────────────────

test('las estadísticas de equipo salen rotuladas en castellano y sin fundir las dos "interceptions"', () => {
    const summary = {
        boxscore: {
            teams: [
                { homeAway: 'away', statistics: [{ name: 'firstDowns', displayValue: '18' }, { name: 'interceptions', displayValue: '3' }, { name: 'turnovers', displayValue: '3' }, { name: 'interceptions', displayValue: '0' }] },
                { homeAway: 'home', statistics: [{ name: 'firstDowns', displayValue: '20' }, { name: 'interceptions', displayValue: '0' }, { name: 'turnovers', displayValue: '0' }, { name: 'interceptions', displayValue: '3' }] },
            ],
        },
    };
    const stats = buildAmericanFootballTeamStats(summary);
    assert.deepEqual(stats.map((s) => [s.label, s.home, s.away]), [
        ['Primeros downs', '20', '18'],
        ['Intercepciones lanzadas', '0', '3'],
        ['Pérdidas de balón', '0', '3'],
        ['Intercepciones (defensa)', '3', '0'],
    ]);
});

test('las jugadas de anotación se atribuyen al local o al visitante por id', () => {
    const summary = {
        scoringPlays: [
            { type: { abbreviation: 'TD', text: 'Passing Touchdown' }, text: 'Pase de 2 yardas', period: { number: 2 }, clock: { displayValue: '9:11' }, team: { id: '17', displayName: 'NE' }, homeScore: 0, awayScore: 7 },
            { type: { abbreviation: 'FG', text: 'Field Goal' }, text: 'FG de 40', period: { number: 3 }, clock: { displayValue: '1:00' }, team: { id: '26', displayName: 'SEA' }, homeScore: 3, awayScore: 7 },
        ],
    };
    const plays = buildAmericanFootballScoringPlays(summary, '26');
    assert.equal(plays[0].team, 'away');
    assert.equal(plays[0].clock_label, '2Q 9:11');
    // 2Q con 9:11 por jugar = 15 + 5:49 transcurridos → minuto 21.
    assert.equal(plays[0].time, 21);
    assert.equal(plays[0].type, 'touchdown');
    assert.equal(plays[0].description, 'Pase de 2 yardas (7-0)');
    assert.equal(plays[1].team, 'home');
    assert.equal(plays[1].type, 'field_goal');
    assert.equal(plays[1].time, 44);
});

test('el autor de la jugada sale del texto de ESPN y el tipo se traduce al catálogo', () => {
    const summary = {
        scoringPlays: [
            { type: { abbreviation: 'TD', text: 'Passing Touchdown' }, text: 'Eli Raridon 2 Yd pass from Drake Maye (Andy Borregales Kick)', period: { number: 2 }, clock: { displayValue: '9:11' }, team: { id: '17' }, homeScore: 0, awayScore: 7 },
            { type: { abbreviation: 'FG', text: 'Field Goal Good' }, text: 'Jason Myers 45 Yd Field Goal', period: { number: 4 }, clock: { displayValue: '5:50' }, team: { id: '26' }, homeScore: 13, awayScore: 10 },
            { type: { abbreviation: 'SF', text: 'Safety' }, text: 'Safety', period: { number: 1 }, clock: { displayValue: '0:30' }, team: { id: '26' }, homeScore: 2, awayScore: 0 },
            { type: { abbreviation: 'TD', text: 'Rushing Touchdown' }, text: 'X 1 Yd Run (Two-Point Pass Conversion Failed)', period: { number: 5 }, clock: { displayValue: '8:00' }, team: { id: '26' } },
        ],
    };
    const plays = buildAmericanFootballScoringPlays(summary, '26');
    assert.equal(plays[0].player, 'Eli Raridon');
    assert.equal(plays[1].player, 'Jason Myers');
    assert.equal(plays[2].type, 'safety');
    assert.equal(plays[2].player, 'Safety');
    // El texto menciona una conversión de dos puntos fallida, pero la jugada es un TD.
    assert.equal(plays[3].type, 'touchdown');
    assert.equal(plays[3].clock_label, 'OT 8:00');
});

test('el árbitro sale de los oficiales del resumen', () => {
    const summary = { gameInfo: { officials: [{ position: { name: 'Umpire' }, displayName: 'Otro' }, { position: { name: 'Referee' }, displayName: 'Adrian Hill' }] } };
    assert.equal(getEspnReferee(summary), 'Adrian Hill');
    assert.equal(getEspnReferee({}), null);
});

test('el plantel conserva el grupo y el estado de cada jugador', () => {
    const roster = {
        athletes: [
            { position: 'offense', items: [{ id: '1', displayName: 'Josh Allen', jersey: '17', position: { displayName: 'Quarterback', abbreviation: 'QB' }, status: { name: 'Active' }, experience: { years: 9 }, college: { name: 'Wyoming' } }] },
            { position: 'practiceSquad', items: [{ id: '2', displayName: 'Suplente', jersey: '', status: { name: 'Practice Squad' } }] },
        ],
    };
    const players = buildRosterPlayers(roster);
    assert.equal(players.length, 2);
    assert.equal(players[0].group_label, 'Ataque');
    assert.equal(players[0].status, 'Active');
    assert.equal(players[0].experience_years, 9);
    assert.equal(players[1].group, 'practicesquad');
    assert.equal(players[1].position, 'Practice squad');
});

// ── Ligas ───────────────────────────────────────────────────────────────────

test('una liga muerta en ESPN no captura un torneo aunque el id o el nombre coincidan', () => {
    assert.equal(inferEspnAmericanFootballLeague({ id: 'espn-league-cfl' }), null);
    assert.equal(inferEspnAmericanFootballLeague({ tournamentUrl: '/american-football/canada/cfl/' }), null);
    assert.equal(inferEspnAmericanFootballLeague({ name: 'XFL' }), null);
    assert.equal(inferEspnAmericanFootballLeague({ id: 'espn-league-nfl' }), 'nfl');
    assert.equal(inferEspnAmericanFootballLeague({ tournamentUrl: '/american-football/usa/ncaa/' }), 'college-football');
});

test('con URL la decisión es por URL: el nombre no arrastra una liga ajena a ESPN', () => {
    assert.equal(inferEspnAmericanFootballLeague({ tournamentUrl: '/american-football/europe/elf/', name: 'NFL Europe' }), null);
    assert.equal(inferEspnAmericanFootballLeague({ name: 'NFL' }), 'nfl');
});
