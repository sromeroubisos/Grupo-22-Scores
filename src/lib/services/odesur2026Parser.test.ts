import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ODESUR_DISCIPLINES,
    classifyOdesurStatus,
    odesurCompetition,
    odesurCompetitionsForSport,
    odesurEventKey,
    odesurLiveLabel,
    odesurMatchIdOf,
    odesurPeriodName,
    odesurStageName,
    odesurEventType,
    findOdesurUnit,
    isOdesurCopyLeague,
    odesurDisciplineName,
    odesurEventName,
    odesurOrgIso2,
    odesurPersonName,
    parseOdesurActions,
    parseOdesurAgenda,
    parseOdesurMedalDisciplines,
    parseOdesurMedallists,
    parseOdesurDateTime,
    parseOdesurDaily,
    parseOdesurGroups,
    parseOdesurMatchId,
    parseOdesurMedals,
    parseOdesurResultDetail,
    parseOdesurTournamentId,
    parseOdesurUnit,
    rankMedals,
    splitResCode,
} from './odesur2026Parser.ts';

// Recortes con la forma real de la API (2026-09-13), con planteles inventados y acortados.
const PARTIDO_DE_HOCKEY = {
    Orgs: ['CHI', 'PAR'],
    IsPhase: false,
    ResCode: 'W.TEAM11------------.GP01.000100--',
    Disc: 'HOC',
    Key: 'W.TEAM11------------.GP01.000100--',
    isH2H: true,
    Medal: '',
    Status: 'OFFICIAL',
    // El huso que manda la API para el hockey. Está mal: ver parseOdesurDateTime.
    DateTimeRaw: '2026-09-13T09:00:00-06:00',
    VenueDesc: 'Estadio Ash',
    LocDesc: 'Pista 1',
    PhaseDescA: 'Group A',
    UnitDescA: 'Match 1',
    IsLive: false,
    Home: { Org: 'CHI', Name: 'Chile', Result: '16' },
    Away: { Org: 'PAR', Name: 'Paraguay', Result: '0' },
};

test('la hora de pared manda: el -06:00 del hockey se descarta y se lee como hora argentina', () => {
    // 09:00 en Argentina son las 12:00 UTC, no las 15:00 que daría el offset crudo.
    assert.equal(parseOdesurDateTime('2026-09-13T09:00:00-06:00'), '2026-09-13T12:00:00.000Z');
    // Las disciplinas que ya informan -03:00 dan lo mismo que antes.
    assert.equal(parseOdesurDateTime('2026-09-13T14:45:00-03:00'), '2026-09-13T17:45:00.000Z');
    // Dos partidos a la misma hora de pared quedan en el mismo instante, sea cual sea el offset.
    assert.equal(
        parseOdesurDateTime('2026-09-13T14:00:00-06:00'),
        parseOdesurDateTime('2026-09-13T14:00:00-03:00'),
    );
    assert.equal(parseOdesurDateTime(''), null);
    assert.equal(parseOdesurDateTime('mañana'), null);
});

test('el EvKey se arma con el ancho fijo de la API para cada tamaño de equipo', () => {
    assert.equal(odesurEventKey('w', 11), 'W.TEAM11------------');
    assert.equal(odesurEventKey('m', 7), 'M.TEAM7-------------');
    assert.equal(odesurEventKey('m', 2), 'M.TEAM2-------------');
    for (const key of ['W.TEAM11------------', 'M.TEAM7-------------', 'M.TEAM6-------------']) {
        assert.equal(key.length, 20);
    }
});

test('splitResCode separa evento, fase y unidad con cualquier tamaño de equipo', () => {
    assert.deepEqual(splitResCode('W.TEAM11------------.GP01.000100--'), {
        eventKey: 'W.TEAM11------------',
        phaseCode: 'GP01',
        unitCode: '000100',
    });
    assert.equal(splitResCode('M.TEAM7-------------.SFNL.000200--')?.phaseCode, 'SFNL');
    assert.equal(splitResCode(''), null);
    assert.equal(splitResCode('M.TEAM7-------------.GP--'), null);
});

test('un partido de hockey se lee con el marcador, la zona y la hora corregida', () => {
    const unit = parseOdesurUnit(PARTIDO_DE_HOCKEY);
    assert.ok(unit);
    assert.equal(unit.code, 'HOC');
    assert.equal(unit.gender, 'w');
    assert.equal(unit.homeName, 'Chile');
    assert.equal(unit.awayName, 'Paraguay');
    assert.equal(unit.homeScore, 16);
    assert.equal(unit.awayScore, 0);
    assert.equal(unit.state, 'final');
    assert.equal(unit.pool, 'A');
    assert.equal(unit.stageName, 'Grupo A');
    assert.equal(unit.startsAtIso, '2026-09-13T12:00:00.000Z');
    assert.equal(unit.venue, 'Estadio Ash');
});

test('se descartan las disciplinas que no seguimos, las filas de fase y el provisional sin rivales', () => {
    // Esgrima: individual, no entra al feed de partidos.
    assert.equal(parseOdesurUnit({ ...PARTIDO_DE_HOCKEY, Disc: 'FEN', ResCode: 'M.SABRE-------------.8FNL.000500--' }), null);
    assert.equal(parseOdesurUnit({ ...PARTIDO_DE_HOCKEY, IsPhase: true }), null);
    // Un provisional sin los dos países no tiene identidad: queda en la agenda.
    assert.equal(parseOdesurUnit({
        ...PARTIDO_DE_HOCKEY,
        Disc: 'RU7',
        ResCode: '',
        Key: 'M.TEAM7-------------.SF--',
        Status: 'PROVISIONAL',
        Home: { Org: '', Name: '' },
        Away: { Org: '', Name: '' },
    }), null);
    // Un evento que no es de equipo dentro de una disciplina que sí seguimos.
    assert.equal(parseOdesurUnit({ ...PARTIDO_DE_HOCKEY, ResCode: 'W.INDOOR------------.GP01.000100--' }), null);
});

// Forma real del fixture sin confirmar (vóley, 2026-09-15): equipos y hora, sin llave.
const PROVISIONAL_DE_VOLEY = {
    Orgs: ['ARG', 'PAR'],
    IsPhase: false,
    ResCode: '',
    Disc: 'VVO',
    Key: 'W.TEAM6-------------.----',
    Medal: '0',
    Status: 'PROVISIONAL',
    DateTimeRaw: '2026-09-15T18:00:00-03:00',
    VenueDesc: 'Estadio Cubierto',
    PhaseDescA: 'Group Stage',
    UnitDescA: '',
    Home: { Org: 'ARG', Name: 'Argentina', Result: '' },
    Away: { Org: 'PAR', Name: 'Paraguay', Result: '' },
};

test('el fixture sin confirmar entra al feed con equipos y hora', () => {
    const unit = parseOdesurUnit(PROVISIONAL_DE_VOLEY);
    assert.ok(unit);
    assert.equal(unit.provisional, true);
    assert.equal(unit.resCode, '');
    assert.equal(unit.code, 'VVO');
    assert.equal(unit.gender, 'w');
    assert.equal(unit.homeName, 'Argentina');
    assert.equal(unit.state, 'scheduled');
    assert.equal(unit.startsAtIso, '2026-09-15T21:00:00.000Z');
    assert.equal(odesurMatchIdOf(unit), 'odesur-match-vvo-w-p202609151800-ARG-PAR');
});

test('el id provisional sigue abriendo la ficha cuando el partido se confirma', () => {
    const provisional = parseOdesurUnit(PROVISIONAL_DE_VOLEY);
    assert.ok(provisional);
    const parsed = parseOdesurMatchId(odesurMatchIdOf(provisional));
    assert.ok(parsed);
    assert.equal(parsed.resCode, null);
    assert.deepEqual(parsed.provisional, { stamp: '202609151800', homeCode: 'ARG', awayCode: 'PAR' });
    assert.equal(parsed.competition.discipline.code, 'VVO');

    // Horas después la mesa lo confirma: tiene llave y otro id, pero la misma
    // hora y los mismos países. El id viejo lo encuentra igual.
    const confirmed = parseOdesurUnit({
        ...PROVISIONAL_DE_VOLEY,
        ResCode: 'W.TEAM6-------------.GP01.000300--',
        Key: 'W.TEAM6-------------.GP01.000300--',
        Status: 'START_LIST',
        PhaseDescA: 'Group A',
    });
    assert.ok(confirmed);
    assert.equal(confirmed.provisional, false);
    assert.equal(findOdesurUnit([PARTIDO_UNIT(), confirmed], parsed), confirmed);
    // Y el id confirmado se resuelve por su llave.
    const confirmedId = parseOdesurMatchId(odesurMatchIdOf(confirmed));
    assert.ok(confirmedId);
    assert.equal(findOdesurUnit([confirmed], confirmedId), confirmed);
    // Otros rivales a la misma hora no son el mismo partido.
    assert.equal(findOdesurUnit([parseOdesurUnit({ ...PROVISIONAL_DE_VOLEY, Away: { Org: 'CHI' } })!], parsed), null);
});

function PARTIDO_UNIT() {
    const unit = parseOdesurUnit(PARTIDO_DE_HOCKEY);
    assert.ok(unit);
    return unit;
}

test('el nombre del país sale en castellano aunque la API lo mande en inglés', () => {
    const unit = parseOdesurUnit({
        ...PARTIDO_DE_HOCKEY,
        Home: { Org: 'BRA', Name: 'Brazil', Result: '' },
        Away: { Org: 'PER', Name: 'Peru', Result: '' },
        Status: 'START_LIST',
    });
    assert.equal(unit?.homeName, 'Brasil');
    assert.equal(unit?.awayName, 'Perú');
    assert.equal(unit?.state, 'scheduled');
});

test('parseOdesurDaily se queda solo con los partidos de equipo', () => {
    const units = parseOdesurDaily([
        PARTIDO_DE_HOCKEY,
        { ...PARTIDO_DE_HOCKEY, Disc: 'SWM', ResCode: 'W.100FREE-----------.FNL-.000100--' },
        null,
    ]);
    assert.equal(units.length, 1);
    assert.equal(parseOdesurDaily({}).length, 0);
});

test('los estados de Bornan se traducen al modelo de la app', () => {
    assert.equal(classifyOdesurStatus('OFFICIAL', true), 'final');
    assert.equal(classifyOdesurStatus('UNOFFICIAL', true), 'final');
    assert.equal(classifyOdesurStatus('RUNNING', true), 'live');
    assert.equal(classifyOdesurStatus('PROVISIONAL', false), 'scheduled');
    assert.equal(classifyOdesurStatus('START_LIST', false), 'scheduled');
    assert.equal(classifyOdesurStatus('CANCELLED', false), 'cancelled');
    assert.equal(classifyOdesurStatus('ALGO_NUEVO', true), 'live');
    assert.equal(classifyOdesurStatus('ALGO_NUEVO', false), 'scheduled');
});

test('el reloj habla el idioma de cada deporte', () => {
    assert.equal(odesurLiveLabel('RUNNING', 3, 'HOC'), '3C');
    assert.equal(odesurLiveLabel('RUNNING', 2, 'VVO'), 'Set 2');
    assert.equal(odesurLiveLabel('RUNNING', 1, 'RU7'), '1T');
    assert.equal(odesurLiveLabel('INTERMEDIATE', 2, 'HOC'), 'Entretiempo');
    assert.equal(odesurLiveLabel('RUNNING', null, 'FBL'), 'En juego');
});

test('las etapas se traducen, con la zona y las llaves', () => {
    assert.deepEqual(odesurStageName('Group B', 'Match 3'), { pool: 'B', stageName: 'Grupo B' });
    assert.equal(odesurStageName('Semifinals', '').stageName, 'Semifinal');
    assert.equal(odesurStageName('Final', 'Bronze Medal Match').stageName, 'Tercer puesto');
    assert.equal(odesurStageName('Gold Medal Match', '').stageName, 'Final');
    assert.equal(odesurStageName('Classification 5th-6th', '').stageName, '5° puesto');
    assert.equal(odesurStageName('Classification 5th-8th', '').stageName, 'Puestos 5-8');
    // El beach escribe el ordinal con "°".
    assert.equal(odesurStageName('Classification 9°-12°', '').stageName, 'Puestos 9-12');
});

test('los cuartos del hockey se leen por posición, no por el hito que rotula Bornan', () => {
    assert.equal(odesurPeriodName('First Quarter', 'HOC'), '1C');
    assert.equal(odesurPeriodName('Halftime', 'HOC'), '2C');
    assert.equal(odesurPeriodName('Full Time', 'HOC'), '4C');
    assert.equal(odesurPeriodName('1st Half', 'RU7'), 'Primer tiempo');
    assert.equal(odesurPeriodName('Set 3', 'VVO'), 'Set 3');
});

test('la tabla de cada zona es la oficial, con el Rk de la mesa', () => {
    const groups = parseOdesurGroups({
        EvKey: 'W.TEAM11------------',
        Groups: [
            {
                Key: 'W.TEAM11------------.GP01',
                DescA: 'Group A',
                Matches: [],
                Competitors: [
                    // Llegan desordenados a propósito: manda el Rk.
                    { Org: 'ARG', Name: 'Argentina', Rk: '3', Played: '0', Won: '0', Lost: '0', Tied: '0', Points: '0', For: '0', Against: '0' },
                    { Org: 'CHI', Name: 'Chile', Rk: '1', Played: '1', Won: '1', Lost: '0', Tied: '0', Points: '3', For: '16', Against: '0', Diff: '16' },
                    { Org: 'URU', Name: 'Uruguay', Rk: '2', Played: '1', Won: '1', Lost: '0', Tied: '0', Points: '3', For: '4', Against: '1' },
                ],
            },
            // Una zona vacía no aparece.
            { Key: 'W.TEAM11------------.GP02', DescA: 'Group B', Matches: [], Competitors: [] },
        ],
    }, 'w');

    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, 'Grupo A');
    assert.deepEqual(groups[0].rows.map((row) => row.code), ['CHI', 'URU', 'ARG']);
    assert.equal(groups[0].rows[0].points, 3);
    assert.equal(groups[0].rows[0].diff, 16);
    // Sin Diff publicado, se deduce.
    assert.equal(groups[0].rows[1].diff, 3);
});

test('la planilla trae planteles con dorsal y puesto, y los parciales de cada período', () => {
    const detail = parseOdesurResultDetail({
        Info: { Status: 'OFFICIAL' },
        Results: {
            Result: '16-0',
            CurrentPeriod: 4,
            Periods: [
                { Order: 1, ResHome: '3', ResAway: '0', TotHome: '3', TotAway: '0', Desc: 'First Quarter' },
                { Order: 2, ResHome: '3', ResAway: '0', TotHome: '6', TotAway: '0', Desc: 'Halftime' },
            ],
        },
        Competitors: [
            { Org: 'CHI', Members: [{ Name: 'PÉREZ Ana', Bib: '1', PosDesc: 'Goalkeeper' }, { Name: 'GÓMEZ Luz', Bib: '7', PosDesc: '' }] },
            { Org: 'PAR', Members: [{ Name: 'RUIZ Sol', Bib: '1', PosDesc: 'Goalkeeper' }] },
        ],
    }, 'HOC');

    assert.ok(detail);
    assert.equal(detail.homeScore, 16);
    assert.equal(detail.awayScore, 0);
    assert.equal(detail.state, 'final');
    // El parcial, no el acumulado: el segundo cuarto terminó 3-0, no 6-0.
    assert.deepEqual(detail.periods.map((period) => [period.name, period.home, period.away]), [['1C', 3, 0], ['2C', 3, 0]]);
    assert.equal(detail.homeRoster.length, 2);
    // El nombre se da vuelta al orden en que se lee: nombre y apellido.
    assert.deepEqual(detail.homeRoster[0], { name: 'Ana Pérez', bib: '1', position: 'Goalkeeper' });
    assert.equal(detail.awayRoster[0].name, 'Sol Ruiz');
});

test('la cronología traduce la jugada y guarda el marcador de ese momento', () => {
    const actions = parseOdesurActions([
        {
            Period: '1',
            Order: 21,
            Action: 'SHOT_PC',
            Result: 'GOAL',
            ScoreH: '1',
            ScoreA: '0',
            TimeStamp: '8:22',
            Team: 'H',
            // El autor viaja en `Competitors`, como en la API real.
            Competitors: [{ Reg: '1', Bib: '7', Org: 'CHI', Name: 'GÓMEZ Luz' }],
            Extensions: [
                { Code: 'ActionLDesc', Value: 'Penalty Corner' },
                { Code: 'ActionMinute', Value: '7' },
                { Code: 'ResultSDesc', Value: 'Goal' },
            ],
        },
    ]);
    assert.equal(actions.length, 1);
    // Un gol de córner corto es un gol: el tipo sale del resultado, no de la jugada.
    assert.equal(actions[0].type, 'goal');
    assert.equal(actions[0].label, 'Córner corto');
    assert.equal(actions[0].result, 'Gol');
    assert.equal(actions[0].minute, 7);
    assert.equal(actions[0].side, 'home');
    assert.equal(actions[0].scoreHome, 1);
    assert.equal(actions[0].playerName, 'Luz Gómez');
    // El gol de jugada llega en plural y se traduce igual.
    assert.equal(parseOdesurActions([{ Action: 'SHOT_FG', Result: 'GOAL', Extensions: [{ Code: 'ActionLDesc', Value: 'Field Goals' }] }])[0].label, 'Gol de jugada');
    assert.equal(actions[0].playerBib, '7');
});

const medal = (org: string, gold: number, silver: number, bronze: number) => ({
    Org: org,
    Count: {
        ME_GOLD: { total: gold },
        ME_SILVER: { total: silver },
        ME_BRONZE: { total: bronze },
    },
});

test('el medallero ordena por oros, después platas, después bronces', () => {
    const rows = parseOdesurMedals([
        medal('ARG', 0, 0, 1),
        medal('COL', 1, 0, 0),
        medal('BRA', 2, 2, 2),
        // Una delegación sin medallas no ocupa lugar en la tabla.
        medal('ARU', 0, 0, 0),
    ]);
    assert.deepEqual(rows.map((row) => row.code), ['BRA', 'COL', 'ARG']);
    assert.equal(rows[0].name, 'Brasil');
    assert.equal(rows[0].total, 6);
});

test('un oro pesa más que cualquier cantidad de platas y bronces', () => {
    const rows = parseOdesurMedals([medal('ARG', 0, 9, 9), medal('COL', 1, 0, 0)]);
    assert.deepEqual(rows.map((row) => row.code), ['COL', 'ARG']);
});

test('dos delegaciones con los mismos metales comparten puesto y la siguiente salta', () => {
    const ranked = rankMedals(parseOdesurMedals([
        medal('BRA', 3, 0, 0),
        medal('ARG', 1, 1, 0),
        medal('CHI', 1, 1, 0),
        medal('PER', 0, 0, 1),
    ]));
    assert.deepEqual(ranked.map((row) => [row.code, row.position]), [
        ['BRA', 1],
        ['ARG', 2],
        ['CHI', 2],
        ['PER', 4],
    ]);
});

test('el id del partido va y vuelve al ResCode de la API', () => {
    const unit = parseOdesurUnit(PARTIDO_DE_HOCKEY);
    assert.ok(unit);
    const id = odesurMatchIdOf(unit);
    assert.equal(id, 'odesur-match-hoc-w-GP01-000100');

    const parsed = parseOdesurMatchId(id);
    assert.ok(parsed);
    assert.equal(parsed.resCode, PARTIDO_DE_HOCKEY.ResCode);
    assert.equal(parsed.competition.discipline.code, 'HOC');

    // Una fase con guion viaja como "_" y vuelve.
    assert.equal(parseOdesurMatchId('odesur-match-ru7-m-FNL_-000100')?.resCode, 'M.TEAM7-------------.FNL-.000100--');

    assert.equal(parseOdesurMatchId('fisu-match-m-PO03-000100'), null);
    assert.equal(parseOdesurMatchId('odesur-match-xxx-m-GP01-000100'), null);
});

test('el id del torneo identifica disciplina y rama', () => {
    const competition = parseOdesurTournamentId('odesur-2026-ru7-w');
    assert.ok(competition);
    assert.equal(competition.discipline.code, 'RU7');
    assert.equal(competition.eventKey, 'W.TEAM7-------------');
    assert.equal(competition.tournamentId, 'odesur-2026-ru7-w');
    assert.equal(parseOdesurTournamentId('odesur-2026-ten-m'), null);
    assert.equal(parseOdesurTournamentId('fisu-ru7-2026-m'), null);
});

test('cada deporte de G22 recibe las dos ramas de su disciplina', () => {
    assert.deepEqual(odesurCompetitionsForSport('field-hockey').map((c) => c.tournamentId), [
        'odesur-2026-hoc-m',
        'odesur-2026-hoc-w',
    ]);
    assert.equal(odesurCompetitionsForSport('rugby')[0].discipline.code, 'RU7');
    assert.equal(odesurCompetitionsForSport('basketball').length, 0);
    // El tenis tiene vertical propia y no entra al feed genérico.
    assert.equal(odesurCompetitionsForSport('tennis').length, 0);
});

test('el catálogo de disciplinas es coherente consigo mismo', () => {
    for (const [key, discipline] of Object.entries(ODESUR_DISCIPLINES)) {
        assert.equal(discipline.code, key);
        const competition = odesurCompetition(discipline.code, 'm');
        assert.equal(parseOdesurTournamentId(competition.tournamentId)?.discipline.code, discipline.code);
    }
});

test('cada jugada cae en el vocabulario de la cronología', () => {
    assert.equal(odesurEventType('SHOT_PC', 'Penalty Corner', 'GOAL'), 'goal');
    assert.equal(odesurEventType('SHOT_FG', 'Field Goals', 'GOAL'), 'goal');
    // Un córner corto que no entró no es un evento de la cronología.
    assert.equal(odesurEventType('SHOT_PC', 'Penalty Corner', 'SAVED'), null);
    assert.equal(odesurEventType('GKS', 'Goalkeeper Substitution', ''), null);
    assert.equal(odesurEventType('CARD', 'Green Card', ''), 'green_card');
    assert.equal(odesurEventType('CARD', 'Yellow Card', ''), 'yellow_card');
    assert.equal(odesurEventType('TRY', 'Try', ''), 'try');
    assert.equal(odesurEventType('PTRY', 'Penalty Try', ''), 'try');
    assert.equal(odesurEventType('CONV', 'Conversion', 'GOAL'), 'conversion');
    assert.equal(odesurEventType('CONV', 'Conversion', 'MISSED'), null);
    assert.equal(odesurEventType('PEN', 'Penalty Goal', 'GOAL'), 'penalty_goal');
});

test('el nombre del atleta se lee nombre y apellido, con los apellidos compuestos enteros', () => {
    assert.equal(odesurPersonName('ZAPATA Daniela'), 'Daniela Zapata');
    assert.equal(odesurPersonName('DE LA CRUZ María José'), 'María José De La Cruz');
    assert.equal(odesurPersonName('VILLAGRÁN Fernanda'), 'Fernanda Villagrán');
    // Lo que no tiene la forma de la API queda como vino.
    assert.equal(odesurPersonName('Brasil'), 'Brasil');
    assert.equal(odesurPersonName('Ana Pérez'), 'Ana Pérez');
});

test('la prueba lleva el género en castellano adelante', () => {
    assert.equal(odesurEventName("Women's 1m Springboard"), 'Femenino · 1m Springboard');
    // En equipo, el deporte ya lo dice la tarjeta: queda la rama sola.
    assert.equal(odesurEventName("Men's Team"), 'Masculino');
    assert.equal(odesurEventName('Mixed Petanque'), 'Mixto · Petanque');
    assert.equal(odesurEventName('Open 10km'), 'Open 10km');
});

test('los 60 deportes y las 15 delegaciones tienen nombre y bandera', () => {
    assert.equal(odesurDisciplineName('DIV'), 'Clavados');
    assert.equal(odesurDisciplineName('ru7'), 'Rugby Seven');
    assert.equal(odesurDisciplineName('XYZ', 'Otro'), 'Otro');
    assert.equal(odesurOrgIso2('PAR'), 'py');
    assert.equal(odesurOrgIso2('CUW'), 'cw');
    assert.equal(odesurOrgIso2('ZZZ'), null);
});

test('los medallistas salen con el metal, la prueba y el atleta en orden', () => {
    const rows = parseOdesurMedallists([
        { Medal: 'ME_BRONZE', Org: 'BRA', OrgDesc: 'Brazil', Type: 'A', Name: 'WANDERLEY Luana', Disc: 'DIV', EventDesc: "Women's 1m Springboard", DateRaw: '2026-09-13T13:40:00-03:00' },
        { Medal: 'ME_GOLD', Org: 'COL', OrgDesc: 'Colombia', Type: 'A', Name: 'ZAPATA Daniela', Disc: 'DIV', EventDesc: "Women's 1m Springboard", DateRaw: '2026-09-13T13:40:00-03:00' },
        { Medal: 'ME_GOLD', Org: 'CHI', OrgDesc: 'Chile', Type: 'T', Name: 'Chile', Disc: 'HOC', EventDesc: "Women's Team", DateRaw: '2026-09-22T18:00:00-06:00' },
        { Medal: 'NADA', Org: 'ARG' },
    ]);
    assert.equal(rows.length, 3);
    const diving = rows.filter((row) => row.discipline === 'DIV');
    assert.deepEqual(diving.map((row) => [row.metal, row.name, row.orgName]), [
        ['gold', 'Daniela Zapata', 'Colombia'],
        ['bronze', 'Luana Wanderley', 'Brasil'],
    ]);
    assert.equal(diving[0].disciplineName, 'Clavados');
    // En equipo, la medalla es de la delegación.
    const hockey = rows.find((row) => row.discipline === 'HOC');
    assert.equal(hockey?.isTeam, true);
    assert.equal(hockey?.name, 'Chile');
    // Y la hora pasa por la misma corrección del huso.
    assert.equal(hockey?.awardedAtIso, '2026-09-22T21:00:00.000Z');
});

test('medals/params dice qué deportes ya repartieron medallas', () => {
    assert.deepEqual(parseOdesurMedalDisciplines({
        dates: [],
        orgs: [],
        disciplines: [
            { Disc: 'OWS', Desc: 'Open Water Swimming', Count: 6 },
            { Disc: 'DIV', Desc: 'Diving', Count: 3 },
            { Disc: 'ATH', Desc: 'Athletics', Count: 0 },
        ],
    }), ['DIV', 'OWS']);
    assert.deepEqual(parseOdesurMedalDisciplines([]), []);
});

test('la agenda del día trae todos los deportes y apunta a la ficha de los partidos', () => {
    const agenda = parseOdesurAgenda([
        { ...PARTIDO_DE_HOCKEY, Home: {}, Away: {}, EventDesc: "Women's Team" },
        {
            Disc: 'SWM',
            DiscDesc: 'Swimming',
            Key: 'W.100FREE-----------.FNL-.000100--',
            ResCode: 'W.100FREE-----------.FNL-.000100--',
            Status: 'SCHEDULED',
            DateTimeRaw: '2026-09-13T08:00:00-03:00',
            EventDesc: "Women's 100m Freestyle",
            PhaseDescA: 'Final',
            UnitDescA: '',
            VenueDesc: 'Centro Acuático',
            Medal: '1',
        },
        { Disc: 'FEN', IsPhase: true },
    ]);
    assert.equal(agenda.length, 2);
    // Ordenada por hora: la natación de las 08:00 va antes que el hockey de las 09:00.
    assert.equal(agenda[0].disciplineName, 'Natación');
    assert.equal(agenda[0].medal, true);
    assert.equal(agenda[0].matchId, null);
    assert.equal(agenda[0].eventName, 'Femenino · 100m Freestyle');
    assert.equal(agenda[1].matchId, 'odesur-match-hoc-w-GP01-000100');
});

test('la copia de los Juegos en otro proveedor se reconoce por el nombre de la liga', () => {
    assert.equal(isOdesurCopyLeague('South American Games'), true);
    assert.equal(isOdesurCopyLeague('South American Games Women'), true);
    assert.equal(isOdesurCopyLeague('Juegos Suramericanos'), true);
    assert.equal(isOdesurCopyLeague('Juegos Sudamericanos 2026'), true);
    assert.equal(isOdesurCopyLeague('ODESUR'), true);
    // Un campeonato sudamericano de otra cosa no es la copia de los Juegos.
    assert.equal(isOdesurCopyLeague('Sudamericano de Clubes'), false);
    assert.equal(isOdesurCopyLeague('Copa Libertadores'), false);
    assert.equal(isOdesurCopyLeague(null), false);
});
