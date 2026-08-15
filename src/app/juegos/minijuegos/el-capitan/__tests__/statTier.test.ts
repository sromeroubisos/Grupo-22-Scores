// EL ESCALAFÓN NO PUEDE TENER HUECOS.
//
// Es un módulo de PRESENTACIÓN, así que acá no hay calibración ni bandas — la
// disciplina del §1 del CLAUDE de captain es para el motor. Lo que se prueba es
// lo único que puede romperse en silencio: los BORDES. Un `>` donde va un `>=`
// mueve el corte un punto y nadie lo ve hasta que un 90 se pinta de oro.
//
// Y se prueba la propiedad que hace que la tabla sea una tabla: que TODO valor
// caiga en exactamente un escalón. El orden de `STAT_TIERS` es la lógica —se
// devuelve el primero que el valor alcanza—, así que una lista mal ordenada no
// es un detalle de estilo: manda todo a `base` sin romper nada.

import test from 'node:test';
import assert from 'node:assert/strict';

import { STAT_TIERS, statTier, statTierClass } from '../statTier.ts';

test('los cortes caen donde dice la tabla, y del lado de adentro', () => {
    // El par de cada frontera: el último del escalón de abajo y el primero del
    // de arriba. Es la única forma de que un `>=` mal puesto no pase.
    const bordes: [number, string][] = [
        [59, 'base'],
        [60, 'bronce'],
        [74, 'bronce'],
        [75, 'plata'],
        [79, 'plata'],
        [80, 'oro'],
        [89, 'oro'],
        [90, 'elite'],
    ];

    for (const [valor, esperado] of bordes) {
        assert.equal(statTier(valor).id, esperado, `${valor} tenía que ser ${esperado}`);
    }
});

test('el hueco del pedido (70 a 74) lo cubre el bronce', () => {
    // El pedido decía «60 a 70 bronce» y «75 a 80 plata». Los cinco puntos del
    // medio se resolvieron para abajo: el escalón de abajo nunca infla. Está
    // escrito acá para que el día que se cambie sea una decisión y no un
    // descuido.
    for (let v = 70; v <= 74; v++) {
        assert.equal(statTier(v).id, 'bronce', `${v} tenía que seguir en bronce`);
    }
});

test('todo valor de la escala tiene un escalón y uno solo', () => {
    for (let v = 0; v <= 99; v++) {
        const escalon = statTier(v);
        const candidatos = STAT_TIERS.filter((t) => v >= t.min);

        // Siempre hay alguno...
        assert.ok(candidatos.length > 0, `${v} se quedó sin escalón`);
        // ...y el que gana es el más alto que el valor alcanza, no el primero
        // que la lista tenga a mano.
        const masAlto = candidatos.reduce((a, b) => (b.min > a.min ? b : a));
        assert.equal(escalon.id, masAlto.id, `${v} cayó en el escalón equivocado`);
    }
});

test('un número roto se pinta como flojo y no revienta la pantalla', () => {
    // `NaN >= 0` es falso: ninguna comparación acierta y tiene que quedar la
    // red. Un atributo que llegue mal no puede dejar la ficha sin clase.
    assert.equal(statTier(Number.NaN).id, 'base');
    assert.equal(statTier(-12).id, 'base');
    assert.equal(statTierClass(Number.NaN), 'tierBase');
});

test('cada escalón tiene su clase, y no se repiten', () => {
    const clases = STAT_TIERS.map((t) => t.className);
    assert.equal(new Set(clases).size, clases.length, 'dos escalones comparten clase');
    assert.ok(clases.every((c) => c.startsWith('tier')), 'una clase no lleva el prefijo');
    assert.equal(statTierClass(84), 'tierOro');
});
