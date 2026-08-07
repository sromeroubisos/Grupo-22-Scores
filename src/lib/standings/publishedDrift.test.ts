import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePublishedVsLive, describeDrift } from './publishedDrift.ts';

const guardada = (club_id: string, position: number, points: number) => ({ club_id, position, points });
const viva = (teamId: string, position: number, total_points: number, name = teamId.toUpperCase()) => ({
    teamId,
    position,
    total_points,
    team: { name },
});

test('sin filas guardadas y con tabla en vivo, la tabla está sin publicar', () => {
    const out = comparePublishedVsLive([], [viva('a', 1, 12)]);
    assert.equal(out.state, 'sin_publicar');
    assert.deepEqual(out.diffs, []);
});

test('sin nada de ningún lado no hay nada que avisar', () => {
    assert.equal(comparePublishedVsLive([], []).state, 'al_dia');
    assert.equal(comparePublishedVsLive(null, null).state, 'al_dia');
});

test('lo mismo de los dos lados es al día', () => {
    const out = comparePublishedVsLive(
        [guardada('a', 1, 12), guardada('b', 2, 8)],
        [viva('a', 1, 12), viva('b', 2, 8)],
    );
    assert.equal(out.state, 'al_dia');
    assert.equal(out.diffs.length, 0);
});

test('el orden de las filas no cuenta como diferencia', () => {
    const out = comparePublishedVsLive(
        [guardada('b', 2, 8), guardada('a', 1, 12)],
        [viva('a', 1, 12), viva('b', 2, 8)],
    );
    assert.equal(out.state, 'al_dia');
});

test('un resultado cargado sin recalcular deja la tabla desfasada y nombra al club', () => {
    const out = comparePublishedVsLive(
        [guardada('a', 1, 12), guardada('b', 2, 8)],
        [viva('a', 1, 12), viva('b', 2, 12, 'Belgrano')],
    );

    assert.equal(out.state, 'desfasada');
    assert.equal(out.diffs.length, 1);
    assert.equal(out.diffs[0].teamId, 'b');
    assert.equal(out.diffs[0].teamName, 'Belgrano');
    assert.equal(out.diffs[0].kind, 'puntos');
    assert.deepEqual(out.diffs[0].published, { position: 2, points: 8 });
    assert.deepEqual(out.diffs[0].live, { position: 2, points: 12 });
});

test('un cambio de posición sin cambio de puntos también es desfasaje', () => {
    const out = comparePublishedVsLive(
        [guardada('a', 1, 10), guardada('b', 2, 10)],
        [viva('a', 2, 10), viva('b', 1, 10)],
    );

    assert.equal(out.state, 'desfasada');
    assert.equal(out.diffs.length, 2);
    assert.deepEqual(out.diffs.map((d) => d.kind), ['posicion', 'posicion']);
});

test('los puntos le ganan a la posición: un club se reporta una sola vez', () => {
    const out = comparePublishedVsLive([guardada('a', 3, 4)], [viva('a', 1, 12)]);
    assert.equal(out.diffs.length, 1);
    assert.equal(out.diffs[0].kind, 'puntos');
});

test('un club nuevo en vivo sale como ausente de lo publicado', () => {
    const out = comparePublishedVsLive([guardada('a', 1, 12)], [viva('a', 1, 12), viva('c', 2, 4, 'CASI')]);
    assert.equal(out.state, 'desfasada');
    assert.deepEqual(out.diffs.map((d) => [d.teamId, d.kind]), [['c', 'ausente']]);
});

test('un club que ya no está en la fase sale como sobrante de lo publicado', () => {
    const out = comparePublishedVsLive([guardada('a', 1, 12), guardada('z', 2, 0)], [viva('a', 1, 12)]);
    assert.equal(out.state, 'desfasada');
    assert.deepEqual(out.diffs.map((d) => [d.teamId, d.kind]), [['z', 'sobrante']]);
});

test('los puntos comparan por valor, no por tipo: "12" guardado es 12', () => {
    const out = comparePublishedVsLive([{ club_id: 'a', position: 1, points: '12' }], [viva('a', 1, 12)]);
    assert.equal(out.state, 'al_dia', 'la base devuelve NUMERIC como string y eso no es un desfasaje');
});

test('el texto del indicador nombra hasta tres y cuenta el resto', () => {
    const out = comparePublishedVsLive(
        [guardada('a', 1, 1), guardada('b', 2, 1), guardada('c', 3, 1), guardada('d', 4, 1)],
        [viva('a', 1, 9, 'Alfa'), viva('b', 2, 9, 'Beta'), viva('c', 3, 9, 'Gama'), viva('d', 4, 9, 'Delta')],
    );

    assert.equal(describeDrift(out.diffs), 'Alfa, Beta, Gama y 1 más');
    assert.equal(describeDrift([]), '');
});
