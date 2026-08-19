// La forma del catálogo de clásicos.
//
// Un clásico mal escrito NO SE NOTA JUGANDO, y esa es la razón de que este
// archivo exista. `getClub` devuelve un club por defecto cuando no encuentra el
// id —es lo correcto en Carrera de Rugby, donde el motor nunca puede quedarse
// sin club—, así que un par con un typo no rompe nada: simplemente ese clásico
// no ocurre nunca. La regla más cara de la Pertenencia dejaría de existir en
// silencio, que es exactamente la clase de falla que el §1.7 del CLAUDE describe.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CLASSIC_RIVALRIES,
    areClassicRivals,
    classicRivalsOf,
    unknownRivalryClubs,
} from './rivalries.ts';

test('TODOS LOS CLÁSICOS SON ENTRE CLUBES QUE EXISTEN', () => {
    assert.deepEqual(
        unknownRivalryClubs(),
        [],
        'hay clásicos apuntando a ids que el catálogo no tiene: ese par no se dispara nunca y nadie se entera',
    );
});

test('ningún club es el clásico de sí mismo', () => {
    const propios = CLASSIC_RIVALRIES.filter(([a, b]) => a === b);
    assert.deepEqual(propios, [], 'un par con el mismo club dos veces convertiría quedarse en una traición');
});

test('no hay pares repetidos, ni dados vuelta', () => {
    const vistos = new Set<string>();
    const repetidos: string[] = [];
    for (const [a, b] of CLASSIC_RIVALRIES) {
        // La clave se ordena: (a, b) y (b, a) son el mismo clásico.
        const clave = [a, b].sort((x, y) => x.localeCompare(y)).join(' ↔ ');
        if (vistos.has(clave)) repetidos.push(clave);
        vistos.add(clave);
    }
    assert.deepEqual(repetidos, [], 'el mismo clásico está escrito dos veces');
});

test('LA RIVALIDAD ES SIMÉTRICA, se pregunte como se pregunte', () => {
    for (const [a, b] of CLASSIC_RIVALRIES) {
        assert.ok(areClassicRivals(a, b), `${a} → ${b} no se reconoce`);
        assert.ok(areClassicRivals(b, a), `${b} → ${a} no se reconoce: el índice quedó de un solo lado`);
    }
});

test('quedarse en el club NO es un salto al clásico', () => {
    // No es un caso de laboratorio: la opción «quedarte» de la tarjeta de
    // mercado pasa por la misma comparación con el club actual de los dos lados.
    const [a] = CLASSIC_RIVALRIES[0];
    assert.equal(areClassicRivals(a, a), false);
    assert.equal(areClassicRivals(null, a), false);
    assert.equal(areClassicRivals(a, null), false);
});

test('un club sin clásico no tiene rivales', () => {
    assert.deepEqual(classicRivalsOf('sb-club-que-no-existe'), []);
    assert.deepEqual(classicRivalsOf(null), []);
});

test('CASI y SIC son el clásico, y el catálogo lo sabe', () => {
    // El caso testigo. Si esto se cae, el catálogo se movió abajo y hay que
    // mirar los ciento y pico, no solo este par.
    assert.ok(areClassicRivals('sb-casi', 'sb-san-isidro-club'));
    assert.ok(classicRivalsOf('sb-casi').includes('sb-san-isidro-club'));
});

test('los rivales de un club salen ORDENADOS', () => {
    // Recorrer una lista sin orden estable para elegir es la fuente de
    // no-determinismo encubierta que el CLAUDE prohíbe (§1).
    for (const clubId of ['blues', 'auckland', 'sb-tucuman-rugby-club', 'el-salvador']) {
        const rivales = classicRivalsOf(clubId);
        const ordenados = [...rivales].sort((x, y) => x.localeCompare(y));
        assert.deepEqual(rivales, ordenados, `los rivales de ${clubId} no vienen ordenados`);
    }
});
