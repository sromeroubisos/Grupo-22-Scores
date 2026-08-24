import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CATEGORY_LEVELS,
    categoryLevelLabel,
    categoryLevelRank,
    compareCategoryLevel,
    inferCategoryLevelKey,
    inferCategoryVariant,
    resolveCategoryLevel,
} from './categoryLevel.ts';

const rankOf = (name: string) => resolveCategoryLevel({ name });

test('el escalafón va de Primera a Menores de 14, en ese orden', () => {
    const keys = CATEGORY_LEVELS.map(level => level.key);
    assert.deepEqual(keys, [
        'primera', 'reserva', 'pre-reserva',
        'm22', 'm21', 'm20', 'm19', 'm18', 'm17', 'm16', 'm15', 'm14',
    ]);

    const ranks = CATEGORY_LEVELS.map(level => level.rank);
    const ordered = [...ranks].sort((a, b) => a - b);
    assert.deepEqual(ranks, ordered, 'el catálogo ya viene ordenado por rango');
    assert.equal(new Set(ranks).size, ranks.length, 'no hay dos rangos iguales');
});

test('"Intermedia" es el nombre que el club le da a Reserva', () => {
    assert.equal(inferCategoryLevelKey('Tala Rugby Club Intermedia'), 'reserva');
    assert.equal(inferCategoryLevelKey('La Tablada - Intermedia'), 'reserva');
    assert.equal(inferCategoryLevelKey('Belgrano Reserva'), 'reserva');
    // Los dos nombres tienen que dar el MISMO rango: es la misma división.
    assert.equal(
        rankOf('Tala Rugby Club Intermedia').rank,
        rankOf('Belgrano Reserva').rank,
    );
});

test('"Pre-Intermedia" no se lee como "Intermedia"', () => {
    // "pre intermedia" contiene "intermedia": si los alias se probaran en otro
    // orden, una Pre-Intermedia se ordenaría como Reserva.
    assert.equal(inferCategoryLevelKey('Jockey Pre-Intermedia'), 'pre-reserva');
    assert.equal(inferCategoryLevelKey('Jockey Preintermedia'), 'pre-reserva');
    assert.equal(inferCategoryLevelKey('Jockey Pre Reserva'), 'pre-reserva');
    assert.ok(
        rankOf('Jockey Pre-Intermedia').rank > rankOf('Jockey Intermedia').rank,
        'la Pre va después de la Intermedia',
    );
});

test('los juveniles salen de la edad, escrita como se escriba', () => {
    for (const name of ['Newman M15', 'Newman M-15', 'Newman Menores de 15', 'Newman Sub 15', 'Newman m 15']) {
        assert.equal(inferCategoryLevelKey(name), 'm15', name);
    }
    assert.equal(categoryLevelLabel('m15'), 'Menores de 15');
});

test('un juvenil de mayor edad va antes que uno menor', () => {
    const ages = [22, 21, 20, 19, 18, 17, 16, 15, 14];
    for (let i = 1; i < ages.length; i += 1) {
        assert.ok(
            categoryLevelRank(`m${ages[i - 1]}`) < categoryLevelRank(`m${ages[i]}`),
            `M${ages[i - 1]} tiene que ir antes que M${ages[i]}`,
        );
    }
});

test('un M23 que el escalafón no nombra cae entre Pre Reserva y M22', () => {
    // La URBA usa M23 y la lista del selector arranca en M22. Sin la cuenta por
    // edad quedaría sin rango, al final de la jornada.
    assert.ok(categoryLevelRank('m23') > categoryLevelRank('pre-reserva'));
    assert.ok(categoryLevelRank('m23') < categoryLevelRank('m22'));
});

test('sin categoría en el nombre, la ficha es la Primera del club', () => {
    assert.equal(inferCategoryLevelKey('Duendes'), null);
    assert.equal(rankOf('Duendes').key, 'primera');
    assert.equal(rankOf('Univ. Rosario').key, 'primera');
    assert.equal(rankOf('GEBA').key, 'primera');
});

test('la letra es la nominación y no cambia el rango', () => {
    assert.equal(inferCategoryVariant('Univ. Rosario "B"'), 'B');
    assert.equal(inferCategoryVariant('Club Newman M15 "C"'), 'C');
    assert.equal(inferCategoryVariant('Tala Rugby Club'), '');

    const primeraB = rankOf('Duendes "B"');
    assert.equal(primeraB.key, 'primera');
    assert.equal(primeraB.variant, 'B');
});

test('una abreviatura del club no es una nominación', () => {
    // El caso real que lo destapó: "Tala R.C." normaliza a "tala r c" y esa "c"
    // se leía como la letra de la ficha. La Primera del club salía "Primera C".
    assert.equal(inferCategoryVariant('Tala R.C.'), '');
    assert.equal(inferCategoryVariant('Tala R.C'), '');
    assert.equal(inferCategoryVariant('Univ. Rosario'), '');
    assert.equal(inferCategoryVariant('Lomas A.C.'), '');
    assert.equal(resolveCategoryLevel({ name: 'Tala R.C.' }).variant, '');

    // Y la misma abreviatura CON nominación sigue leyéndose.
    assert.equal(inferCategoryVariant('Tala R.C. "B"'), 'B');
});

test('la nominación se lee entrecomillada, entre paréntesis o suelta', () => {
    assert.equal(inferCategoryVariant('Duendes "A"'), 'A');
    assert.equal(inferCategoryVariant('Duendes (B)'), 'B');
    assert.equal(inferCategoryVariant('Duendes B'), 'B');
    assert.equal(inferCategoryVariant('Duendes'), '');
});

test('la Primera "B" va antes que la Reserva — el caso que pidió el usuario', () => {
    const primeraA = rankOf('Duendes "A"');
    const primeraB = rankOf('Duendes "B"');
    const reserva = rankOf('Duendes Intermedia');

    const orden = [reserva, primeraB, primeraA]
        .sort(compareCategoryLevel)
        .map(level => `${level.key}${level.variant}`);

    assert.deepEqual(orden, ['primeraA', 'primeraB', 'reserva']);
});

test('la ficha sin letra va antes que la "A" de su mismo rango', () => {
    const sinLetra = rankOf('Club Newman M15');
    const conLetraA = rankOf('Club Newman M15 "A"');
    assert.ok(compareCategoryLevel(sinLetra, conLetraA) < 0);
});

test('lo que eligió el club le gana a lo que dice el nombre', () => {
    // El caso que justifica el selector: un club que llama "Los Pumitas" a su
    // Reserva. Del nombre no sale nada y la inferencia diría Primera.
    assert.equal(rankOf('Jockey Los Pumitas').key, 'primera');

    const elegido = resolveCategoryLevel({ name: 'Jockey Los Pumitas', storedLevel: 'reserva' });
    assert.equal(elegido.key, 'reserva');
    assert.equal(elegido.explicit, true);
    assert.equal(rankOf('Jockey Los Pumitas').explicit, false);
});

test('una elección guardada que no existe en el escalafón se ignora', () => {
    // Un valor viejo o escrito a mano no puede dejar la ficha sin orden.
    const resuelto = resolveCategoryLevel({ name: 'Newman M15', storedLevel: 'cadetes' });
    assert.equal(resuelto.key, 'm15');
    assert.equal(resuelto.explicit, false);
});

test('la variante guardada también le gana al nombre', () => {
    const resuelto = resolveCategoryLevel({
        name: 'Duendes "B"',
        storedLevel: 'reserva',
        storedVariant: 'a',
    });
    assert.equal(resuelto.key, 'reserva');
    assert.equal(resuelto.variant, 'A');
});

test('ordenar una jornada entera da el escalafón completo', () => {
    const jornada = [
        'Club Newman M15 "B"',
        'Club Newman Intermedia',
        'Club Newman M19',
        'Club Newman',
        'Club Newman M15 "A"',
        'Club Newman Pre-Intermedia',
        'Club Newman "B"',
    ];

    const orden = jornada
        .map(name => ({ name, level: rankOf(name) }))
        .sort((left, right) => compareCategoryLevel(left.level, right.level))
        .map(entry => entry.name);

    assert.deepEqual(orden, [
        'Club Newman',
        'Club Newman "B"',
        'Club Newman Intermedia',
        'Club Newman Pre-Intermedia',
        'Club Newman M19',
        'Club Newman M15 "A"',
        'Club Newman M15 "B"',
    ]);
});
