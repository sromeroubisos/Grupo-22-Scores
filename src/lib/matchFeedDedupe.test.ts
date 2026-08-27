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

import { dedupeCrossSourceMatches, buildFeedMatchIdentity } from './matchFeedDedupe.ts';

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
