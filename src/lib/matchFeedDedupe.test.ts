// Plegar el partido que viene por dos fuentes, SIN plegar la ida y la vuelta.
//
// El caso real: Argentina-Australia del 29/8/2026 aparecía dos veces en la portada,
// una por rugbyarchive y otra por el proveedor vivo, con tres horas de diferencia.
//
// Y el caso que NO hay que romper: rugbyarchive carga ida y vuelta con la MISMA
// fecha cuando el original no la precisa (Bayonne-Biarritz 1975 está dos veces, 6-3
// y 17-6, y son dos partidos). Un plegado por "mismo día + mismo par" a secas se
// come uno de los dos. Por eso la regla exige UNA FILA DE CADA FUENTE.

import test from 'node:test';
import assert from 'node:assert/strict';

import { dedupeCrossSourceMatches, hasStaleRowsNeedingRepair, buildFeedMatchIdentity } from './matchFeedDedupe.ts';

const partido = (id: string, dateTime: string, home: string, away: string) => ({
    id, dateTime, homeTeam: { name: home }, awayTeam: { name: away },
});

test('el mismo partido en las dos fuentes queda una vez, y gana el proveedor vivo', () => {
    const feed = [
        partido('ra-761228', '2026-08-29T12:00:00+00:00', 'Argentina', 'Australia'),
        partido('trgyZr5s', '2026-08-29T19:00:00+00:00', 'Argentina', 'Australia'),
    ];

    const plegado = dedupeCrossSourceMatches(feed);
    assert.equal(plegado.length, 1);
    // La del vivo trae la hora real (19:00) y el id navegable.
    assert.equal(plegado[0].id, 'trgyZr5s');
});

test('gana el vivo aunque el del archivo venga primero o segundo', () => {
    const vivo = partido('trgyZr5s', '2026-08-29T19:00:00+00:00', 'Argentina', 'Australia');
    const archivo = partido('ra-761228', '2026-08-29T12:00:00+00:00', 'Argentina', 'Australia');

    assert.equal(dedupeCrossSourceMatches([archivo, vivo])[0].id, 'trgyZr5s');
    assert.equal(dedupeCrossSourceMatches([vivo, archivo])[0].id, 'trgyZr5s');
});

test('cada fuente decide quién es local, y sigue siendo el mismo partido', () => {
    const plegado = dedupeCrossSourceMatches([
        partido('ra-761228', '2026-08-29T12:00:00+00:00', 'Australia', 'Argentina'),
        partido('trgyZr5s', '2026-08-29T19:00:00+00:00', 'Argentina', 'Australia'),
    ]);
    assert.equal(plegado.length, 1);
    assert.equal(plegado[0].id, 'trgyZr5s');
});

test('LA IDA Y LA VUELTA DEL ARCHIVO SOBREVIVEN LAS DOS', () => {
    // Dos filas de rugbyarchive, mismo día, mismo par: la fuente no precisó la
    // fecha. Son dos partidos reales y no se tocan.
    const plegado = dedupeCrossSourceMatches([
        partido('ra-100001', '1975-03-16T12:00:00+00:00', 'Bayonne', 'Biarritz'),
        partido('ra-100002', '1975-03-16T12:00:00+00:00', 'Bayonne', 'Biarritz'),
    ]);
    assert.equal(plegado.length, 2);
});

test('dos filas del proveedor vivo tampoco se pliegan', () => {
    const plegado = dedupeCrossSourceMatches([
        partido('aaaaaaaa', '2026-08-29T12:00:00+00:00', 'Wigan', 'Leeds'),
        partido('bbbbbbbb', '2026-08-29T19:00:00+00:00', 'Wigan', 'Leeds'),
    ]);
    assert.equal(plegado.length, 2);
});

test('partidos distintos no se tocan', () => {
    const feed = [
        partido('ra-761228', '2026-08-29T12:00:00+00:00', 'Argentina', 'Australia'),
        partido('trgyZr5s', '2026-08-30T19:00:00+00:00', 'Argentina', 'Australia'), // otro día
        partido('Aa25v5sK', '2026-08-29T14:05:00+00:00', 'South Africa', 'New Zealand'),
    ];
    assert.equal(dedupeCrossSourceMatches(feed).length, 3);
});

test('una fila sin fecha o sin nombres pasa de largo, no se descarta', () => {
    assert.equal(buildFeedMatchIdentity({ id: 'x', dateTime: 'no-es-fecha' }), null);
    assert.equal(buildFeedMatchIdentity({ id: 'x', dateTime: '2026-08-29T12:00:00Z' }), null);

    const feed = [
        { id: 'sinfecha', dateTime: 'nada', homeTeam: { name: 'A' }, awayTeam: { name: 'B' } },
        partido('ra-1', '2026-08-29T12:00:00+00:00', 'Argentina', 'Australia'),
    ];
    assert.equal(dedupeCrossSourceMatches(feed).length, 2);
});

test('el NPC de FlashScore convive con el feed hasta que RugbyPass trae el suyo', () => {
    const flashscore = {
        id: 'trgyZr5s',
        dateTime: '2026-09-06T02:05:00.000Z',
        homeTeam: { name: 'North Harbour' },
        awayTeam: { name: 'Northland' },
        tournamentId: 'jZAJkgK7',
        tournament: { id: 'jZAJkgK7', name: 'New Zealand: Bunnings NPC', country: 'Internacional' },
    };

    // Sin filas de RugbyPass, la de FlashScore TIENE que sobrevivir.
    assert.deepEqual(dedupeCrossSourceMatches([flashscore]).map((m) => m.id), ['trgyZr5s']);

    // Con la de RugbyPass presente, se queda solo esa.
    const rugbypass = {
        id: 'rp-950809',
        dateTime: '2026-09-06T02:05:00.000Z',
        homeTeam: { name: 'North Harbour' },
        awayTeam: { name: 'Northland' },
        tournamentId: 'rp-comp-208',
        tournament: { id: 'rp-comp-208', name: 'Hilux NPC', country: 'Nueva Zelanda' },
    };
    assert.deepEqual(
        dedupeCrossSourceMatches([flashscore, rugbypass]).map((m) => m.id),
        ['rp-950809']
    );
});

const AHORA = new Date('2026-09-05T22:00:00Z').getTime();

test('una fila vencida sin resultado pide reparar el dia', () => {
    const rows = [{
        id: 'fs-1', status: 'scheduled', date_time: '2026-09-05T12:00:00Z',
        home_team: { name: 'Argentina' }, away_team: { name: 'Australia' },
        tournament_name: 'Puma Trophy', country_name: 'International',
    }];
    assert.equal(hasStaleRowsNeedingRepair(rows, AHORA), true);
});

test('pero NO si otra fuente ya trae ese mismo partido cerrado', () => {
    // El caso real del 2026-09-05: una sola fila vieja de FlashScore tiraba
    // abajo los 12 partidos de RugbyPass del dia, teniendo RugbyPass el
    // resultado (28-28) en la misma caché.
    const rows = [
        {
            id: 'fs-1', status: 'scheduled', date_time: '2026-09-05T12:00:00Z',
            home_team: { name: 'Argentina' }, away_team: { name: 'Australia' },
            tournament_name: 'Puma Trophy', country_name: 'International',
        },
        {
            id: 'rp-951234', status: 'final', date_time: '2026-09-05T21:00:00Z',
            home_team: { name: 'Argentina' }, away_team: { name: 'Australia' },
            tournament_id: 'rp-comp-3', tournament_name: 'Internationals', country_name: 'Internacional',
        },
    ];
    assert.equal(hasStaleRowsNeedingRepair(rows, AHORA), false);
});

test('tampoco si su torneo ya lo reemplaza RugbyPass', () => {
    const rows = [
        {
            id: 'fs-npc', status: 'scheduled', date_time: '2026-09-05T02:00:00Z',
            home_team: { name: 'Bay of Plenty' }, away_team: { name: 'Manawatu' },
            tournament_name: 'New Zealand: Bunnings NPC', country_name: 'International',
        },
        {
            id: 'rp-950001', status: 'final', date_time: '2026-09-05T02:05:00Z',
            home_team: { name: 'Bay of Plenty' }, away_team: { name: 'Manawatu' },
            tournament_id: 'rp-comp-208', tournament_name: 'Hilux NPC', country_name: 'Nueva Zelanda',
        },
    ];
    assert.equal(hasStaleRowsNeedingRepair(rows, AHORA), false);
});

test('un partido de hace un rato todavia no esta vencido', () => {
    const rows = [{
        id: 'fs-2', status: 'live', date_time: '2026-09-05T21:00:00Z',
        home_team: { name: 'A' }, away_team: { name: 'B' },
    }];
    assert.equal(hasStaleRowsNeedingRepair(rows, AHORA), false);
});

test('CUATRO fuentes el mismo dia: sobrevive una sola del partido de XV', () => {
    // El caso real del 2026-09-05. El Seven universitario Argentina-Australia es
    // OTRO partido, pero comparte identidad (mismo dia, mismos rivales) y con el
    // pliegue viejo dejaba colarse la fila de FlashScore del test match.
    const equipos = { homeTeam: { name: 'Argentina' }, awayTeam: { name: 'Australia' } };
    const filas = [
        { id: 'fisu-match-m-PO03-000300', dateTime: '2026-09-05T07:30:00.000Z', ...equipos },
        { id: 'ra-761229', dateTime: '2026-09-05T12:00:00+00:00', ...equipos },
        { id: '8xgaTvZI', dateTime: '2026-09-05T21:00:00+00:00', ...equipos },
        { id: 'rp-949624', dateTime: '2026-09-05T21:00:00+00:00', ...equipos },
    ];
    assert.deepEqual(dedupeCrossSourceMatches(filas).map((m) => m.id), ['rp-949624']);
    // Y en cualquier orden de llegada.
    assert.deepEqual(
        dedupeCrossSourceMatches([filas[3], filas[0], filas[2], filas[1]]).map((m) => m.id),
        ['rp-949624']
    );
});

test('sin RugbyPass, dos filas del mismo rango siguen sobreviviendo', () => {
    // La regla que protege la ida y vuelta del archivo con la misma fecha.
    const equipos = { homeTeam: { name: 'A' }, awayTeam: { name: 'B' } };
    const filas = [
        { id: 'ra-1', dateTime: '2026-09-05T12:00:00Z', ...equipos },
        { id: 'ra-2', dateTime: '2026-09-05T12:00:00Z', ...equipos },
    ];
    assert.deepEqual(dedupeCrossSourceMatches(filas).map((m) => m.id), ['ra-1', 'ra-2']);
});
