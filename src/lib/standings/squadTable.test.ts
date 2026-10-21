import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSquadTable } from './squadTable.ts';

const row = (clubId: string, points: number, won = 0) => ({ clubId, played: 1, won, scored: 0, conceded: 0, points });

test('un club suma solo de las categorías donde figura', () => {
    const out = buildSquadTable([
        { categoryId: 'top10', rows: [row('a', 20), row('b', 10)] },
        { categoryId: 'preA', rows: [row('a', 5), row('c', 30)] },
        { categoryId: 'preB', rows: [row('c', 4)] },
    ]);
    const byClub = Object.fromEntries(out.map((r) => [r.clubId, r]));
    assert.equal(byClub.a.points, 25);
    assert.equal(byClub.c.points, 34);
    assert.deepEqual(Object.keys(byClub.c.categories).sort(), ['preA', 'preB']);
    assert.equal(byClub.b.categories.preA, undefined);
    assert.deepEqual(out.map((r) => r.clubId), ['c', 'a', 'b']);
    assert.equal(out.length, 3);
});

test('el peso de una categoría escala sus puntos y el desempate es estable', () => {
    const out = buildSquadTable([
        { categoryId: 'x', weight: 2, rows: [row('b', 5)] },
        { categoryId: 'y', rows: [row('a', 10)] },
    ]);
    assert.deepEqual(out.map((r) => r.clubId), ['a', 'b']);
});
