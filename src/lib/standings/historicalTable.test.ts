import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoricalTable, withoutCarriedOver, type SeasonTableRow } from './historicalTable.ts';

const row = (clubId: string, won: number, drawn: number, lost: number, points: number, extra: Partial<SeasonTableRow> = {}): SeasonTableRow => ({
    clubId,
    played: won + drawn + lost,
    won,
    drawn,
    lost,
    scored: 0,
    conceded: 0,
    bonus: 0,
    points,
    ...extra,
});

test('suma los puntos de cada temporada como quedaron en su año', () => {
    // 1995: la victoria valía 2. 2019: vale 4. La histórica no recalcula.
    const table = buildHistoricalTable([
        { seasonKey: '1995', rows: [row('tala', 10, 0, 2, 20), row('jockey', 11, 0, 1, 22)] },
        { seasonKey: '2019', rows: [row('tala', 9, 0, 3, 40), row('jockey', 5, 0, 7, 24)] },
    ]);

    assert.deepEqual(table.map((r) => [r.clubId, r.points, r.played, r.seasons, r.position]), [
        ['tala', 60, 24, 2, 1],
        ['jockey', 46, 24, 2, 2],
    ]);
});

test('dos fases de la misma temporada cuentan una sola temporada', () => {
    const [tala] = buildHistoricalTable([
        { seasonKey: '2010', rows: [row('tala', 5, 0, 0, 20)] },
        { seasonKey: '2010', rows: [row('tala', 3, 0, 4, 12)] },
    ]);
    assert.equal(tala.seasons, 1);
    assert.equal(tala.played, 12);
    assert.equal(tala.points, 32);
});

test('un inscripto sin partidos no suma temporada', () => {
    const table = buildHistoricalTable([
        { seasonKey: '2019', rows: [row('olivos', 0, 0, 0, 0), row('tala', 1, 0, 0, 4)] },
    ]);
    assert.deepEqual(table.map((r) => r.clubId), ['tala']);
});

test('a igual puntaje desempatan victorias y después diferencia', () => {
    const table = buildHistoricalTable([
        {
            seasonKey: '2020',
            rows: [
                row('a', 4, 2, 0, 20, { scored: 100, conceded: 50 }),
                row('b', 5, 0, 1, 20, { scored: 90, conceded: 80 }),
                row('c', 4, 2, 0, 20, { scored: 120, conceded: 60 }),
            ],
        },
    ]);
    assert.deepEqual(table.map((r) => r.clubId), ['b', 'c', 'a']);
});

test('una fase que arrastra puntos aporta solo lo suyo', () => {
    const first = [row('tala', 5, 0, 2, 20)];
    const second = [row('tala', 8, 0, 3, 32)]; // trae sumada la primera
    assert.deepEqual(withoutCarriedOver(second, first)[0], row('tala', 3, 0, 1, 12));
});
