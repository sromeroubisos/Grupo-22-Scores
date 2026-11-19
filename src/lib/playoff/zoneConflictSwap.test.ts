import test from 'node:test';
import assert from 'node:assert/strict';

import { applyZoneConflictSwap, parseZoneConflictSwap } from './zoneConflictSwap.ts';

/**
 * Veco Villegas: sembrados 1-3 = los primeros de zona, 4-6 = los segundos.
 * "1.º Primero vs Mejor Segundo" (1 vs 4) y "2.º Primero vs 3.º Primero" (2 vs 3).
 * Si el mejor segundo (4) es de la zona del 1.º primero (1), se intercambian los
 * cruces: pasan a jugar 2 vs 4 y 1 vs 3.
 */
const RULE = { seed: 4, as: 1, swap: [1, 2] as [number, number] };
const order = ['a1', 'b1', 'c1', 'x2', 'y2', 'z2'];

test('mismo origen de zona: se intercambian los sembrados 1 y 2', () => {
  const groupOf = new Map<string, string | null>([
    ['a1', 'A'], ['b1', 'B'], ['c1', 'C'], ['x2', 'A'], ['y2', 'B'], ['z2', 'C'],
  ]);
  assert.deepEqual(applyZoneConflictSwap(order, groupOf, RULE), ['b1', 'a1', 'c1', 'x2', 'y2', 'z2']);
});

test('zonas distintas: el orden no cambia', () => {
  const groupOf = new Map<string, string | null>([
    ['a1', 'A'], ['b1', 'B'], ['c1', 'C'], ['x2', 'B'], ['y2', 'A'], ['z2', 'C'],
  ]);
  assert.deepEqual(applyZoneConflictSwap(order, groupOf, RULE), order);
});

test('sin regla, o con sembrados que faltan, no hace nada y no muta', () => {
  const groupOf = new Map<string, string | null>();
  assert.equal(applyZoneConflictSwap(order, groupOf, null), order);
  const short = ['a1', 'b1'];
  assert.equal(applyZoneConflictSwap(short, groupOf, RULE), short);
});

test('sin zona conocida no se asume conflicto', () => {
  const groupOf = new Map<string, string | null>([['a1', null], ['x2', null]]);
  assert.deepEqual(applyZoneConflictSwap(order, groupOf, RULE), order);
});

test('parseo: acepta lo válido y descarta lo roto', () => {
  assert.deepEqual(parseZoneConflictSwap({ seed: 4, as: 1, swap: [1, 2] }), RULE);
  assert.equal(parseZoneConflictSwap({ seed: 4, as: 4, swap: [1, 2] }), null);
  assert.equal(parseZoneConflictSwap({ seed: 4, as: 1, swap: [1, 1] }), null);
  assert.equal(parseZoneConflictSwap({ seed: 4, as: 1, swap: [1] }), null);
  assert.equal(parseZoneConflictSwap({ seed: 0, as: 1, swap: [1, 2] }), null);
  assert.equal(parseZoneConflictSwap(null), null);
});
