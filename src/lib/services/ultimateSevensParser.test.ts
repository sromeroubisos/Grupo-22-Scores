import test from 'node:test';
import assert from 'node:assert/strict';

import {
    US7_TTL_HOT_SECONDS,
    US7_TTL_IDLE_SECONDS,
    buildUs7Brackets,
    classifyUs7Status,
    parseUs7DateTime,
    parseUs7Fixture,
    parseUs7Fixtures,
    parseUs7MatchId,
    parseUs7Clubs,
    parseUs7Players,
    parseUs7TeamId,
    parseUs7TournamentId,
    resolveUs7Roster,
    us7StageTimeZone,
    us7MatchIdOf,
    us7RefreshTtlSeconds,
    us7CountryName,
    us7PositionGroup,
    us7ShortPosition,
    us7StageLabel,
    us7TeamIdOf,
} from './ultimateSevensParser.ts';

// Recortes con la forma real de `/wp-json/afz/v1/fixtures` (2026-09-11), sin
// los campos de presentación (colores, redes, sponsor).
function equipo(id: string, name: string, score: number | null, teamPlayers: number[] = []) {
    return {
        id,
        name,
        logo: `https://www.ultimatesevens.com/wp-content/uploads/2026/07/${name.replace(/ /g, '_')}_Logo-300x300.png`,
        category: 'men',
        score,
        parentTeam: 1982,
        teamPlayers,
    };
}

function partido(overrides: Record<string, unknown> = {}) {
    return {
        gameId: '31176',
        // hora de Cardiff (BST): son las 18:00 UTC de KICKOFF
        date: '2026-09-12T19:00:00',
        seasonId: '1',
        category: 'men',
        seasonName: '2026 Season',
        competitionId: '2222',
        competition: 'Cardiff',
        homeTeam: equipo('4730', 'Foudre Bleue', null, [40, 41, 48]),
        awayTeam: equipo('4742', 'Clan Taran', null, [37, 39]),
        venue: 'Cardiff Arms Park',
        status: 'Fixture',
        round: '1',
        webUrl: 'https://www.ultimatesevens.com/match-centre/fixtures/foudre-bleue-men-vs-clan-taran-men/',
        wpid: 3129,
        ...overrides,
    };
}

const KICKOFF = Date.parse('2026-09-12T18:00:00Z');
const UN_DIA_ANTES = KICKOFF - 24 * 60 * 60 * 1000;
const MINUTO = 60 * 1000;

test('la hora sin huso es la de la SEDE aunque el sitio diga GMT', () => {
    // Cardiff: el sitio dice "KICK OFF 15:00 GMT" y la ticketera "show 15:00",
    // puertas 13:30+01:00. Son las 15:00 de Cardiff = 14:00 UTC.
    assert.equal(parseUs7DateTime('2026-09-12 15:00:00', 'Europe/London'), '2026-09-12T14:00:00.000Z');
    assert.equal(parseUs7DateTime('2026-09-12T16:35:00', us7StageTimeZone('Cardiff')), '2026-09-12T15:35:00.000Z');
    // Biarritz es Francia: 18:30 de allá = 16:30 UTC, no 17:30
    assert.equal(parseUs7DateTime('2026-09-18 18:30:00', us7StageTimeZone('Biarritz')), '2026-09-18T16:30:00.000Z');
    // en invierno Londres SÍ es GMT: el huso se calcula en la fecha, no fijo
    assert.equal(parseUs7DateTime('2026-12-12T15:00:00', 'Europe/London'), '2026-12-12T15:00:00.000Z');
    // una sede que no está en la tabla cae en Londres
    assert.equal(us7StageTimeZone('Dublin'), 'Europe/London');
    // si algún día manda el huso, se respeta
    assert.equal(parseUs7DateTime('2026-09-12T18:00:00+01:00', 'Europe/Paris'), '2026-09-12T17:00:00.000Z');
    assert.equal(parseUs7DateTime(''), null);
    assert.equal(parseUs7DateTime('pronto'), null);
});

test('un partido programado se lee entero', () => {
    const fixture = parseUs7Fixture(partido(), UN_DIA_ANTES);
    assert.ok(fixture);
    assert.equal(fixture.gameId, '31176');
    assert.equal(fixture.key, 'm');
    assert.equal(fixture.startsAtIso, '2026-09-12T18:00:00.000Z');
    assert.equal(fixture.season, '2026');
    assert.equal(fixture.stageId, '2222');
    assert.equal(fixture.stageName, 'Cardiff');
    assert.equal(fixture.round, 1);
    assert.equal(fixture.home.name, 'Foudre Bleue');
    assert.equal(fixture.away.name, 'Clan Taran');
    assert.deepEqual(fixture.home.playerIds, [40, 41, 48]);
    assert.equal(fixture.state, 'scheduled');
    assert.equal(fixture.home.score, null);
    assert.equal(fixture.venue, 'Cardiff Arms Park');
    assert.equal(us7StageLabel(fixture), 'Cardiff · Ronda 1');
});

test('el ensayo de la mesa: un Live 22-22 un día antes del torneo NO es un partido en juego', () => {
    const ensayo = partido({
        gameId: '31180',
        date: '2026-09-12T16:35:00',
        category: 'women',
        status: 'Live',
        round: '',
        homeTeam: equipo('4743', 'Clan Taran', 22),
        awayTeam: equipo('4758', 'Sol Feroz', 22),
    });
    const fixture = parseUs7Fixture(ensayo, Date.parse('2026-09-11T19:30:00Z'));
    assert.ok(fixture);
    assert.equal(fixture.key, 'w');
    assert.equal(fixture.state, 'scheduled');
    assert.equal(fixture.home.score, null, 'el marcador del ensayo no se publica');
    assert.equal(fixture.away.score, null);
    assert.equal(fixture.round, null);
    assert.equal(us7StageLabel(fixture), 'Cardiff');
});

test('en el horario, Live con marcador es en juego y el marcador cuenta', () => {
    const fixture = parseUs7Fixture(partido({
        status: 'Live',
        homeTeam: equipo('4730', 'Foudre Bleue', 7),
        awayTeam: equipo('4742', 'Clan Taran', 0),
    }), KICKOFF + 5 * MINUTO);
    assert.equal(fixture?.state, 'live');
    assert.equal(fixture?.home.score, 7);
    assert.equal(fixture?.away.score, 0);
});

test('la etapa puede correr adelantada al fixture publicado', () => {
    const iso = '2026-09-12T18:00:00.000Z';
    assert.equal(classifyUs7Status('Live', true, iso, KICKOFF - 10 * MINUTO), 'live');
    // Cardiff (12/09) corrió ~40 minutos adelantada a su propio fixture: con la
    // tolerancia vieja de 30 minutos, el partido en juego se mostraba
    // programado y sin marcador mientras se jugaba.
    assert.equal(classifyUs7Status('Live', true, iso, KICKOFF - 40 * MINUTO), 'live');
    assert.equal(classifyUs7Status('Result', true, iso, KICKOFF - 40 * MINUTO), 'final');
    // Tres horas sigue siendo el techo: más lejos que eso es la mesa probando.
    assert.equal(classifyUs7Status('Live', true, iso, KICKOFF - 4 * 60 * MINUTO), 'scheduled');
});

test('las formas habituales del cierre se leen como final', () => {
    const after = KICKOFF + 30 * MINUTO;
    for (const status of ['Result', 'Results', 'Full Time', 'FT', 'Final', 'Completed', 'Finished', 'Played']) {
        assert.equal(classifyUs7Status(status, true, '2026-09-12T18:00:00.000Z', after), 'final', status);
    }
});

test('un estado desconocido con marcador se decide por el reloj', () => {
    const iso = '2026-09-12T18:00:00.000Z';
    assert.equal(classifyUs7Status('Awaiting', true, iso, KICKOFF + 10 * MINUTO), 'live');
    assert.equal(classifyUs7Status('Awaiting', true, iso, KICKOFF + 61 * MINUTO), 'final');
    assert.equal(classifyUs7Status('Awaiting', false, iso, KICKOFF + 61 * MINUTO), 'scheduled');
});

test('Fixture con el horario pasado sigue programado: no se inventa un resultado', () => {
    assert.equal(classifyUs7Status('Fixture', false, '2026-09-12T18:00:00.000Z', KICKOFF + 90 * MINUTO), 'scheduled');
});

test('suspendido y cancelado', () => {
    assert.equal(classifyUs7Status('Postponed', false, null, KICKOFF), 'postponed');
    assert.equal(classifyUs7Status('Cancelled', false, null, KICKOFF), 'cancelled');
    assert.equal(classifyUs7Status('Abandoned', true, null, KICKOFF), 'cancelled');
});

test('sin rama reconocible, sin id o sin un equipo, no es un partido', () => {
    assert.equal(parseUs7Fixture(partido({ category: 'mixed' }), KICKOFF), null);
    assert.equal(parseUs7Fixture(partido({ gameId: '' }), KICKOFF), null);
    assert.equal(parseUs7Fixture(partido({ awayTeam: null }), KICKOFF), null);
    assert.equal(parseUs7Fixture('31176', KICKOFF), null);
});

test('la lista sale ordenada por horario y sin ids repetidos', () => {
    const fixtures = parseUs7Fixtures([
        partido({ gameId: '31176', date: '2026-09-12T18:00:00' }),
        partido({ gameId: '31174', date: '2026-09-12T17:26:00' }),
        partido({ gameId: '31176', date: '2026-09-12T18:00:00' }),
        partido({ gameId: '31175', date: '2026-09-12T17:43:00' }),
    ], UN_DIA_ANTES);
    assert.deepEqual(fixtures.map((fixture) => fixture.gameId), ['31174', '31175', '31176']);
    assert.deepEqual(parseUs7Fixtures({ error: true }, UN_DIA_ANTES), []);
});

test('el plantel se arma con el wpid de /players, en orden de camiseta', () => {
    const players = parseUs7Players([
        { id: null, name: 'Jugador Diez', shirtNumber: '10', position: 'Back', wpid: 41 },
        { id: null, name: 'Jugador Dos', shirtNumber: '2', position: 'Prop/Hooker (Middle forward)', wpid: 40 },
        { id: null, name: 'Sin Número', shirtNumber: '', position: '', wpid: 48 },
        { id: null, name: '', shirtNumber: '5', wpid: 99 },
    ]);
    assert.equal(players.size, 3, 'sin nombre no entra');
    const roster = resolveUs7Roster([41, 48, 40, 77], players);
    assert.deepEqual(roster.map((player) => player.name), ['Jugador Dos', 'Jugador Diez', 'Sin Número']);
    assert.equal(roster[0].number, '2');
    assert.equal(roster[0].position, 'Forward');
    assert.equal(roster[1].position, 'Back');
    assert.equal(roster[2].number, null);
});

test('el jugador trae su foto y su país, y el país se dice en castellano', () => {
    const players = parseUs7Players([
        { name: 'Aaron Cummings', shirtNumber: '1', position: 'Prop/Hooker (Middle forward)', country: 'US', mugshot: 'https://x/Aaron.png', wpid: 42 },
        { name: 'Sin País', shirtNumber: '3', position: '', country: '', mugshot: null, wpid: 43 },
    ]);
    assert.equal(players.get(42)?.photo, 'https://x/Aaron.png');
    assert.equal(players.get(42)?.countryCode, 'US');
    assert.equal(us7CountryName('US'), 'Estados Unidos');
    assert.equal(players.get(43)?.countryCode, null);
    assert.equal(us7CountryName(null), '');
});

test('las franquicias salen de /teams con sus dos ramas, y las ramas sueltas no son clubes', () => {
    const clubs = parseUs7Clubs([
        {
            id: '123', name: 'Foudre Bleue', logo: 'https://x/fb.png',
            webUrl: 'https://www.ultimatesevens.com/match-centre/clubs/foudre-bleue/',
            subTeams: [
                { id: '4731', category: 'women', teamPlayers: [51, 52] },
                { id: '4730', category: 'men', teamPlayers: [40, 41, '48'] },
            ],
        },
        // la rama suelta, tal como viene repetida en la misma lista
        { id: '4730', name: 'Foudre Bleue Men', category: 'men', subTeams: null, parentTeam: 1982, teamPlayers: [40] },
        { id: '1234', name: 'Sol Feroz', logo: '', webUrl: '', subTeams: [{ id: '4757', category: 'men', teamPlayers: [] }] },
    ]);
    assert.deepEqual(clubs.map((club) => club.name), ['Foudre Bleue', 'Sol Feroz']);
    assert.deepEqual(clubs[0].branches, [
        { teamId: '4730', key: 'm', playerIds: [40, 41, 48] },
        { teamId: '4731', key: 'w', playerIds: [51, 52] },
    ]);
    assert.deepEqual(parseUs7Clubs({ error: true }), []);
});

test('el id de un plantel', () => {
    assert.equal(parseUs7TeamId('us7-team-4730'), '4730');
    assert.equal(parseUs7TeamId('us7-match-31176'), null);
    assert.equal(parseUs7TeamId('rp-team-auckland'), null);
    assert.equal(parseUs7TeamId(4730), null);
});

test('el puesto se acorta al primero, en castellano de seven', () => {
    assert.equal(us7ShortPosition('Prop/Hooker (Edge forward), Prop/Hooker (Middle forward)'), 'Forward');
    assert.equal(us7ShortPosition('Playmaker (9/10), Centre'), 'Medio');
    assert.equal(us7ShortPosition('Centre, Wing'), 'Centro');
    assert.equal(us7ShortPosition('Wing, Centre, Playmaker (9/10)'), 'Wing');
    assert.equal(us7ShortPosition(''), '');
});

test('el plantel se parte en forwards y tres cuartos; sin puesto no se inventa', () => {
    assert.equal(us7PositionGroup('Forward'), 'forwards');
    assert.equal(us7PositionGroup('Medio'), 'backs');
    assert.equal(us7PositionGroup('Centro'), 'backs');
    assert.equal(us7PositionGroup('Wing'), 'backs');
    assert.equal(us7PositionGroup(''), 'otros');
    assert.equal(us7PositionGroup('Utility'), 'otros');
});

test('ida y vuelta de los ids', () => {
    assert.equal(us7MatchIdOf({ gameId: '31176' }), 'us7-match-31176');
    assert.deepEqual(parseUs7MatchId('us7-match-31176'), { gameId: '31176' });
    assert.equal(parseUs7MatchId('fisu-match-m-PO03-000100'), null);
    assert.equal(us7TeamIdOf({ teamId: '4730', name: 'Foudre Bleue' }), 'us7-team-4730');
    assert.equal(us7TeamIdOf({ teamId: '', name: 'Por definir' }), 'us7-team-por-definir');

    assert.equal(parseUs7TournamentId('us7-m'), 'm');
    assert.equal(parseUs7TournamentId('US7-W'), 'w');
    // los prefijos de partido y equipo empiezan igual: no son un torneo
    assert.equal(parseUs7TournamentId('us7-match-31176'), null);
    assert.equal(parseUs7TournamentId('us7-team-4730'), null);
    assert.equal(parseUs7TournamentId(undefined), null);
});

test('el cuadro: una etapa, sus rondas en orden, y el partido sin ronda cae en la que corresponde', () => {
    const fixtures = parseUs7Fixtures([
        partido({ gameId: '31181', category: 'women', date: '2026-09-12T16:52:00', round: '1' }),
        partido({ gameId: '31180', category: 'women', date: '2026-09-12T16:35:00', round: '' }),
        partido({ gameId: '31182', category: 'women', date: '2026-09-12T17:09:00', round: '1' }),
        partido({ gameId: '31190', category: 'women', date: '2026-09-12T18:30:00', round: '2' }),
        partido({ gameId: '31191', category: 'women', date: '2026-09-12T18:47:00', round: '' }),
    ], UN_DIA_ANTES);
    const [cardiff, ...otras] = buildUs7Brackets(fixtures);
    assert.equal(otras.length, 0);
    assert.equal(cardiff.stageId, '2222');
    assert.equal(cardiff.name, 'Cardiff');
    assert.equal(cardiff.active, true);
    assert.deepEqual(cardiff.rounds.map((round) => round.name), ['Ronda 1', 'Ronda 2']);
    // el ensayo (sin ronda, antes que todos) va a la primera; el de las 18:47, a la segunda
    assert.deepEqual(cardiff.rounds[0].matches.map((match) => match.match_id), ['us7-match-31180', 'us7-match-31181', 'us7-match-31182']);
    assert.deepEqual(cardiff.rounds[1].matches.map((match) => match.match_id), ['us7-match-31190', 'us7-match-31191']);
    assert.equal(cardiff.rounds[0].matches[0].status, 'Programado');
    assert.equal(cardiff.rounds[0].matches[0].score_home, null);
    assert.equal(cardiff.rounds[0].matches[0].home_team.id, 'us7-team-4730');
});

test('el cuadro marca al ganador solo con el partido cerrado y sin empate', () => {
    const cerrado = parseUs7Fixtures([partido({
        status: 'Result',
        homeTeam: equipo('4730', 'Foudre Bleue', 12),
        awayTeam: equipo('4742', 'Clan Taran', 19),
    })], KICKOFF + 40 * MINUTO);
    const [match] = buildUs7Brackets(cerrado)[0].rounds[0].matches;
    assert.equal(match.status, 'finished');
    assert.equal(match.score_home, 12);
    assert.equal(match.winner_id, 'us7-team-4742');

    const enJuego = parseUs7Fixtures([partido({
        status: 'Live',
        homeTeam: equipo('4730', 'Foudre Bleue', 7),
        awayTeam: equipo('4742', 'Clan Taran', 0),
    })], KICKOFF + 5 * MINUTO);
    const [vivo] = buildUs7Brackets(enJuego)[0].rounds[0].matches;
    assert.equal(vivo.status, 'En juego');
    assert.equal(vivo.winner_id, null);
});

test('con dos etapas, el cuadro activo es la que tiene partidos por jugar', () => {
    const ahora = Date.parse('2026-09-15T12:00:00Z');
    const fixtures = parseUs7Fixtures([
        partido({
            gameId: '1', status: 'Result',
            homeTeam: equipo('4730', 'Foudre Bleue', 21), awayTeam: equipo('4742', 'Clan Taran', 5),
        }),
        partido({ gameId: '2', date: '2026-09-18T18:30:00', competitionId: '1111', competition: 'Biarritz' }),
    ], ahora);
    const brackets = buildUs7Brackets(fixtures);
    assert.deepEqual(brackets.map((bracket) => [bracket.name, bracket.active]), [['Cardiff', false], ['Biarritz', true]]);

    const terminado = parseUs7Fixtures([partido({
        gameId: '1', status: 'Result',
        homeTeam: equipo('4730', 'Foudre Bleue', 21), awayTeam: equipo('4742', 'Clan Taran', 5),
    })], ahora);
    assert.equal(buildUs7Brackets(terminado)[0].active, true, 'todo jugado: queda activa la última');
    assert.deepEqual(buildUs7Brackets([]), []);
});

test('refresco: caliente alrededor del horario, tibio fuera de las etapas', () => {
    const fixtures = parseUs7Fixtures([partido()], UN_DIA_ANTES);
    assert.equal(us7RefreshTtlSeconds(fixtures, UN_DIA_ANTES), US7_TTL_IDLE_SECONDS);
    assert.equal(us7RefreshTtlSeconds(fixtures, KICKOFF - 10 * MINUTO), US7_TTL_HOT_SECONDS);
    // La ventana cubre la etapa entera, no el partido: con el fixture corrido,
    // una ventana ajustada dejaba la lista tibia justo mientras se jugaba.
    assert.equal(us7RefreshTtlSeconds(fixtures, KICKOFF - 60 * MINUTO), US7_TTL_HOT_SECONDS);
    assert.equal(us7RefreshTtlSeconds(fixtures, KICKOFF + 2 * 60 * MINUTO), US7_TTL_HOT_SECONDS);
    assert.equal(us7RefreshTtlSeconds(fixtures, KICKOFF + 4 * 60 * MINUTO), US7_TTL_IDLE_SECONDS);

    const live = parseUs7Fixtures([partido({
        status: 'Live',
        homeTeam: equipo('4730', 'Foudre Bleue', 5),
        awayTeam: equipo('4742', 'Clan Taran', 0),
    })], KICKOFF + 5 * MINUTO);
    assert.equal(us7RefreshTtlSeconds(live, KICKOFF + 3 * 60 * MINUTO), US7_TTL_HOT_SECONDS);
});
