import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildCategoryClubName,
    categoryKey,
    findSimilarCategories,
    normalizeClubText,
} from './categoryName.ts';

test('pliega acentos: Taborín y Taborin son el mismo club', () => {
    assert.equal(normalizeClubText('Taborín'), normalizeClubText('Taborin'));
    assert.equal(normalizeClubText('Club Ñandú'), 'club nandu');
});

test('las variantes de una categoría juvenil colapsan en una sola clave', () => {
    const esperada = categoryKey('M15');
    for (const variante of ['M15', 'M-15', 'm 15', 'Menores 15', 'Menores de 15', 'Sub 15', 'sub15']) {
        assert.equal(categoryKey(variante), esperada, `falló: ${variante}`);
    }
});

test('primera y sus abreviaturas colapsan', () => {
    const esperada = categoryKey('Primera');
    for (const variante of ['Primera', '1ra', '1era', 'Primera División', 'primera division']) {
        assert.equal(categoryKey(variante), esperada, `falló: ${variante}`);
    }
});

test('damas y femenino son la misma rama', () => {
    assert.equal(categoryKey('Damas A'), categoryKey('Femenino A'));
});

test('NO junta dos categorías reales distintas', () => {
    // La regla del proyecto: las filiales no se fusionan. M16 A y M16 B son
    // planteles distintos del mismo club, y tienen que quedar separados.
    assert.notEqual(categoryKey('M16 A'), categoryKey('M16 B'));
    assert.notEqual(categoryKey('M15'), categoryKey('M16'));
    assert.notEqual(categoryKey('Primera'), categoryKey('Segunda'));
});

test('el nombre completo no repite el club si ya viene adelante', () => {
    assert.equal(buildCategoryClubName('Jockey', 'M15'), 'Jockey M15');
    assert.equal(buildCategoryClubName('Jockey', 'Jockey M15'), 'Jockey M15');
});

test('detecta la gemela con y sin el club adelante', () => {
    const existentes = [
        { id: 'jockey-m15', name: 'Jockey M15' },
        { id: 'jockey-m16-a', name: 'Jockey M16 A' },
    ];

    // Misma categoría escrita distinto: la encuentra.
    assert.deepEqual(
        findSimilarCategories(existentes, 'Jockey', 'Menores de 15').map(c => c.id),
        ['jockey-m15'],
    );

    // Una categoría que de verdad no existe: no inventa coincidencias.
    assert.deepEqual(findSimilarCategories(existentes, 'Jockey', 'M19'), []);

    // Y no confunde la A con la B.
    assert.deepEqual(findSimilarCategories(existentes, 'Jockey', 'M16 B'), []);
});

test('un nombre vacío no matchea con todo', () => {
    const existentes = [{ id: 'jockey-m15', name: 'Jockey M15' }];
    assert.deepEqual(findSimilarCategories(existentes, 'Jockey', ''), []);
    assert.deepEqual(findSimilarCategories(existentes, 'Jockey', '   '), []);
});
