import test from 'node:test';
import assert from 'node:assert/strict';

import {
    FISU_COMPETITIONS,
    FISU_TTL_HOT_SECONDS,
    FISU_TTL_IDLE_SECONDS,
    classifyFisuStatus,
    fisuLiveLabel,
    fisuMatchIdOf,
    fisuRefreshTtlSeconds,
    fisuStageName,
    fisuTeamId,
    parseFisuDaily,
    parseFisuGroups,
    parseFisuMatchId,
    parseFisuResultDetail,
    parseFisuTournamentId,
    parseFisuUnit,
    splitResCode,
    toFisuMatchId,
} from './fisuRugbySevensParser.ts';

// Recortes con la forma real de la API (2026-09-04), con planteles inventados y acortados.
const UNIDAD_DE_GRUPO = {
    Orgs: ['ARG', 'ZIM'],
    IsPhase: false,
    ResCode: 'M.TEAM7-------------.PO03.000100--',
    Disc: 'RU7',
    Key: 'M.TEAM7-------------.PO03.000100--',
    Type: 'T',
    Status: 'START_LIST',
    StatusDesc: 'Start List',
    DateTimeRaw: '2026-09-04T10:00:00+02:00',
    LocDesc: 'Danie Craven Stadium',
    Event: 'M.TEAM7-------------',
    EventDesc: 'Men',
    Phase: 'M.TEAM7-------------.PO03',
    PhaseDescA: 'Pool C',
    UnitDescA: 'Match 1',
    IsLive: false,
    Home: {
        Org: 'ARG', Name: 'Argentina', Result: '', Winner: false,
        Members: [{ Org: 'ARG', Name: 'APELLIDO Nombre' }, { Org: 'ARG', Name: 'PÉREZ Toribio' }],
    },
    Away: {
        Org: 'ZIM', Name: 'Zimbabwe', Result: '', Winner: false,
        Members: [{ Org: 'ZIM', Name: 'MOYO Tendai' }],
    },
};

const CRUCE_SIN_EQUIPOS = {
    Orgs: [],
    IsPhase: false,
    ResCode: 'W.TEAM7-------------.FNL-.000200--',
    Disc: 'RU7',
    Status: 'SCHEDULED',
    DateTimeRaw: '2026-09-06T15:28:00+02:00',
    LocDesc: 'Danie Craven Stadium',
    Event: 'W.TEAM7-------------',
    Phase: 'W.TEAM7-------------.FNL-',
    PhaseDescA: 'Finals',
    UnitDescA: 'Bronze Medal Match',
    Home: { Org: '', Name: '', Result: '', Extensions: [{ Code: 'ComesFromRank', Value: '' }] },
    Away: { Org: '', Name: '', Result: '', Extensions: [] },
};

const GRUPO = {
    EvKey: 'M.TEAM7-------------',
    EvDesc: 'Men',
    Groups: [{
        Key: 'M.TEAM7-------------.PO01',
        Type: 'POOL',
        Desc: 'Men Pool A',
        DescA: 'Pool A',
        Competitors: [
            {
                Name: 'Norway', Org: 'NOR', OrgDesc: 'Norway', Pos: '3',
                Points: '0', Played: '0', Won: '0', Lost: '0', Tied: '0',
                PtsFor: '0', PtsAgainst: '0', PtsDiff: '0',
                Extensions: [{ Code: 'TriesFor', Value: '' }],
            },
            {
                Name: 'South Africa', Org: 'RSA', OrgDesc: 'South Africa', Pos: '1',
                Points: '4', Played: '1', Won: '1', Lost: '0', Tied: '0',
                PtsFor: '38', PtsAgainst: '7', PtsDiff: '31',
                Extensions: [{ Code: 'TriesFor', Value: '6' }, { Code: 'TriesAgainst', Value: '1' }],
            },
        ],
        Matches: [],
    }],
};

const PLANILLA = {
    Info: { Status: 'RUNNING', Key: 'M.TEAM7-------------.PO03.000100--' },
    Results: {
        CurrentPeriod: 2,
        Periods: [
            { Order: 1, Desc: '1st Half', DescS: 'P1', ResHome: '12', ResAway: '7' },
            { Order: 2, Desc: '2nd Half', DescS: 'P2', ResHome: '7', ResAway: '' },
        ],
    },
    Competitors: [
        { Org: 'ARG', Name: 'Argentina', Result: '', Members: [{ Name: 'APELLIDO Nombre' }] },
        { Org: 'ZIM', Name: 'Zimbabwe', Result: '', Members: [{ Name: 'MOYO Tendai' }] },
    ],
    Legends: {},
};

test('una unidad de grupo se lee entera: fecha en UTC, códigos, nombres en castellano y plantel', () => {
    const unit = parseFisuUnit(UNIDAD_DE_GRUPO);
    assert.ok(unit);
    assert.equal(unit.key, 'm');
    assert.equal(unit.phaseCode, 'PO03');
    assert.equal(unit.unitCode, '000100');
    // 10:00 en Stellenbosch (UTC+2) son las 08:00 UTC.
    assert.equal(unit.startsAtIso, '2026-09-04T08:00:00.000Z');
    assert.equal(unit.homeCode, 'ARG');
    assert.equal(unit.awayCode, 'ZIM');
    assert.equal(unit.homeName, 'Argentina');
    assert.equal(unit.awayName, 'Zimbabue');
    assert.equal(unit.pool, 'C');
    assert.equal(unit.stageName, 'Grupo C');
    assert.equal(unit.state, 'scheduled');
    assert.equal(unit.homeScore, null);
    assert.deepEqual(unit.homeRoster, ['APELLIDO Nombre', 'PÉREZ Toribio']);
    assert.equal(unit.venue, 'Danie Craven Stadium');
});

test('un cruce sin equipos dice "Por definir" y la unidad de bronce se llama Tercer puesto', () => {
    const unit = parseFisuUnit(CRUCE_SIN_EQUIPOS);
    assert.ok(unit);
    assert.equal(unit.key, 'w');
    assert.equal(unit.homeCode, null);
    assert.equal(unit.homeName, 'Por definir');
    assert.equal(unit.awayName, 'Por definir');
    assert.equal(unit.stageName, 'Tercer puesto');
    assert.equal(unit.pool, null);
});

test('el cronograma diario descarta lo que no es un partido de seven', () => {
    const units = parseFisuDaily([
        UNIDAD_DE_GRUPO,
        { ...UNIDAD_DE_GRUPO, Disc: 'HBL', ResCode: 'M.TEAM7-------------.PO03.000200--' },
        { ...UNIDAD_DE_GRUPO, IsPhase: true },
        { ...UNIDAD_DE_GRUPO, ResCode: 'cualquier cosa' },
        null,
    ]);
    assert.equal(units.length, 1);
});

test('el ResCode se separa en evento, fase y unidad, y cualquier otra forma se rechaza', () => {
    assert.deepEqual(splitResCode('W.TEAM7-------------.SF-9.000100--'), {
        eventKey: 'W.TEAM7-------------',
        phaseCode: 'SF-9',
        unitCode: '000100',
    });
    assert.equal(splitResCode('M.TEAM7-------------.PO03'), null);
    assert.equal(splitResCode(''), null);
});

test('las etapas hablan castellano', () => {
    assert.equal(fisuStageName('Pool A', 'Match 1').stageName, 'Grupo A');
    assert.equal(fisuStageName('Quarterfinals', 'Match 2').stageName, 'Cuartos de final');
    assert.equal(fisuStageName('Semifinals', 'Match 1').stageName, 'Semifinal');
    assert.equal(fisuStageName('Finals', 'Gold Medal Match').stageName, 'Final');
    assert.equal(fisuStageName('Finals', 'Bronze Medal Match').stageName, 'Tercer puesto');
    assert.equal(fisuStageName('Placing 5th-8th', 'Match 1').stageName, 'Puestos 5-8');
    assert.equal(fisuStageName('Placing 5th-6th', '').stageName, '5° puesto');
    assert.equal(fisuStageName('Placing 8th-9th', '').stageName, '8° puesto');
});

test('los estados de Bornan caen en los cinco de la app', () => {
    assert.equal(classifyFisuStatus('START_LIST', false), 'scheduled');
    assert.equal(classifyFisuStatus('SCHEDULED', false), 'scheduled');
    assert.equal(classifyFisuStatus('GETTING_READY', false), 'scheduled');
    assert.equal(classifyFisuStatus('RUNNING', true), 'live');
    assert.equal(classifyFisuStatus('INTERMEDIATE', true), 'live');
    assert.equal(classifyFisuStatus('FINISHED', true), 'final');
    assert.equal(classifyFisuStatus('UNOFFICIAL', true), 'final');
    assert.equal(classifyFisuStatus('OFFICIAL', true), 'final');
    assert.equal(classifyFisuStatus('POSTPONED', false), 'postponed');
    assert.equal(classifyFisuStatus('CANCELLED', false), 'cancelled');
    // Desconocido: con marcador se está jugando, sin marcador falta jugar.
    assert.equal(classifyFisuStatus('ALGO_NUEVO', true), 'live');
    assert.equal(classifyFisuStatus('ALGO_NUEVO', false), 'scheduled');
});

test('el reloj de un partido en juego se lee en castellano', () => {
    assert.equal(fisuLiveLabel('RUNNING', 1), '1T');
    assert.equal(fisuLiveLabel('RUNNING', 2), '2T');
    assert.equal(fisuLiveLabel('INTERMEDIATE', 1), 'Entretiempo');
    assert.equal(fisuLiveLabel('RUNNING', null), 'En juego');
});

test('la tabla de un grupo sale ordenada por posición con puntos, partidos y tries', () => {
    const pools = parseFisuGroups(GRUPO);
    assert.equal(pools.length, 1);
    assert.equal(pools[0].key, 'm');
    assert.equal(pools[0].phaseCode, 'PO01');
    assert.equal(pools[0].name, 'Grupo A');
    assert.deepEqual(pools[0].rows.map((row) => row.code), ['RSA', 'NOR']);
    const rsa = pools[0].rows[0];
    assert.equal(rsa.name, 'Sudáfrica');
    assert.equal(rsa.points, 4);
    assert.equal(rsa.played, 1);
    assert.equal(rsa.pointsFor, 38);
    assert.equal(rsa.pointsAgainst, 7);
    assert.equal(rsa.diff, 31);
    assert.equal(rsa.triesFor, 6);
    assert.equal(rsa.triesAgainst, 1);
    // Sin tries publicados: null, no cero.
    assert.equal(pools[0].rows[1].triesFor, null);
});

test('la planilla reconstruye el marcador desde los parciales cuando el total todavía no está', () => {
    const detail = parseFisuResultDetail(PLANILLA);
    assert.ok(detail);
    assert.equal(detail.state, 'live');
    assert.equal(detail.currentPeriod, 2);
    assert.equal(detail.homeScore, 19);
    assert.equal(detail.awayScore, 7);
    assert.equal(detail.periods.length, 2);
    assert.equal(detail.periods[0].name, 'Primer tiempo');
    assert.equal(detail.periods[1].name, 'Segundo tiempo');
    assert.equal(detail.periods[1].away, null);
    assert.deepEqual(detail.homeRoster, ['APELLIDO Nombre']);
});

test('antes del pitazo los parciales en cero NO son un 0-0', () => {
    const antes = {
        ...PLANILLA,
        Info: { ...PLANILLA.Info, Status: 'START_LIST' },
        Results: {
            CurrentPeriod: 0,
            Periods: [
                { Order: 1, Desc: '1st Half', ResHome: '0', ResAway: '0' },
                { Order: 2, Desc: '2nd Half', ResHome: '0', ResAway: '0' },
            ],
        },
    };
    const detail = parseFisuResultDetail(antes);
    assert.ok(detail);
    assert.equal(detail.state, 'scheduled');
    assert.equal(detail.homeScore, null);
    assert.equal(detail.awayScore, null);
    assert.deepEqual(detail.periods.map((period) => [period.home, period.away]), [[null, null], [null, null]]);
});

test('los ids de partido van y vuelven, con la fase escrita sin guiones', () => {
    const unit = parseFisuUnit(UNIDAD_DE_GRUPO)!;
    assert.equal(fisuMatchIdOf(unit), 'fisu-match-m-PO03-000100');
    assert.deepEqual(parseFisuMatchId('fisu-match-m-PO03-000100'), {
        key: 'm',
        resCode: 'M.TEAM7-------------.PO03.000100--',
    });

    assert.equal(toFisuMatchId('w', 'FNL-', '000200'), 'fisu-match-w-FNL_-000200');
    assert.deepEqual(parseFisuMatchId('fisu-match-w-FNL_-000200'), {
        key: 'w',
        resCode: 'W.TEAM7-------------.FNL-.000200--',
    });
    assert.deepEqual(parseFisuMatchId('fisu-match-m-SF_9-000100'), {
        key: 'm',
        resCode: 'M.TEAM7-------------.SF-9.000100--',
    });

    assert.equal(parseFisuMatchId('fih-match-m-22334'), null);
    assert.equal(parseFisuMatchId('fisu-match-x-PO03-000100'), null);
    assert.equal(parseFisuMatchId(null), null);
});

test('los ids de torneo y de selección', () => {
    assert.equal(parseFisuTournamentId('fisu-ru7-2026-m'), 'm');
    assert.equal(parseFisuTournamentId('FISU-RU7-2026-W'), 'w');
    assert.equal(parseFisuTournamentId('fisu-ru7-2026-x'), null);
    assert.equal(parseFisuTournamentId('fih-wc-1866'), null);
    assert.equal(FISU_COMPETITIONS.m.tournamentId, 'fisu-ru7-2026-m');

    assert.equal(fisuTeamId('ARG', 'Argentina'), 'fisu-team-ARG');
    assert.equal(fisuTeamId(null, 'Por definir'), 'fisu-team-por-definir');
});

test('el refresco se acelera con un partido en juego o por empezar, y se relaja el resto del tiempo', () => {
    const base = parseFisuUnit(UNIDAD_DE_GRUPO)!;
    const startsAt = Date.parse(base.startsAtIso!);

    assert.equal(fisuRefreshTtlSeconds([base], startsAt - 60 * 60 * 1000), FISU_TTL_IDLE_SECONDS);
    assert.equal(fisuRefreshTtlSeconds([base], startsAt - 10 * 60 * 1000), FISU_TTL_HOT_SECONDS);
    assert.equal(fisuRefreshTtlSeconds([base], startsAt + 30 * 60 * 1000), FISU_TTL_HOT_SECONDS);
    assert.equal(fisuRefreshTtlSeconds([base], startsAt + 3 * 60 * 60 * 1000), FISU_TTL_IDLE_SECONDS);

    const live = { ...base, state: 'live' as const };
    assert.equal(fisuRefreshTtlSeconds([live], startsAt - 24 * 60 * 60 * 1000), FISU_TTL_HOT_SECONDS);

    const final = { ...base, state: 'final' as const };
    assert.equal(fisuRefreshTtlSeconds([final], startsAt), FISU_TTL_IDLE_SECONDS);
});
