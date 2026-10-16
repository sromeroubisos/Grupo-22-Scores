import test from 'node:test';
import assert from 'node:assert/strict';

import { agruparPorRegion, seccionesDeRegion, REGION_SIN_DATO, type UnionConRegion } from './leagueRegions.ts';

const uniones: UnionConRegion[] = [
  { id: 'urba', name: 'URBA', region_code: 'amba' },
  { id: 'cba', name: 'Unión Cordobesa de Rugby', region_code: 'centro' },
  { id: 'tuc', name: 'Unión de Rugby de Tucumán', region_code: 'noa' },
  { id: 'uar', name: 'Unión Argentina de Rugby', region_code: 'nacional' },
  { id: 'rara', name: 'Rara', region_code: 'marte' },
];
const t = (id: string, unionId: string | null) => ({ id, unionId });

test('agrupa por región en el orden fijo y por unión adentro', () => {
  const r = agruparPorRegion(
    [t('1', 'tuc'), t('2', 'urba'), t('3', 'uar'), t('4', 'cba'), t('5', 'urba')],
    uniones,
  );
  assert.deepEqual(r?.map((g) => g.code), ['nacional', 'amba', 'centro', 'noa']);
  assert.equal(r?.[1].label, 'AMBA');
  assert.deepEqual(r?.[1].unions[0].tournaments.map((x) => x.id), ['2', '5']);
  assert.equal(r?.[1].total, 2);
});

test('el orden de entrada de los torneos se respeta adentro de la unión', () => {
  const r = agruparPorRegion([t('b', 'urba'), t('a', 'urba'), t('x', 'cba')], uniones);
  assert.deepEqual(r?.find((g) => g.code === 'amba')?.unions[0].tournaments.map((x) => x.id), ['b', 'a']);
});

test('con una sola región no hay nada que agrupar: devuelve null', () => {
  assert.equal(agruparPorRegion([t('1', 'urba'), t('2', 'urba')], uniones), null);
});

test('sin lista o sin uniones devuelve null', () => {
  assert.equal(agruparPorRegion([], uniones), null);
  assert.equal(agruparPorRegion([t('1', 'urba'), t('2', 'cba')], []), null);
});

test('lo que no tiene unión con región va aparte, al final, y no se esconde', () => {
  const r = agruparPorRegion(
    [t('1', null), t('2', 'urba'), t('3', 'desconocida'), t('4', 'rara'), t('5', 'cba')],
    uniones,
  );
  const ultimo = r?.[r.length - 1];
  assert.equal(ultimo?.code, REGION_SIN_DATO);
  assert.equal(ultimo?.label, 'Otras competiciones');
  assert.deepEqual(ultimo?.unions[0].tournaments.map((x) => x.id).sort(), ['1', '3', '4']);
});

test('la unión con más competiciones va primero dentro de su región', () => {
  const dos: UnionConRegion[] = [
    { id: 'a', name: 'Aaa', region_code: 'cuyo' },
    { id: 'b', name: 'Bbb', region_code: 'cuyo' },
    { id: 'u', name: 'URBA', region_code: 'amba' },
  ];
  const r = agruparPorRegion([t('1', 'a'), t('2', 'b'), t('3', 'b'), t('4', 'u')], dos);
  assert.deepEqual(r?.find((g) => g.code === 'cuyo')?.unions.map((g) => g.unionId), ['b', 'a']);
});

test('seccionesDeRegion aplana los grupos conservando el orden y la región como eyebrow', () => {
  const grupos = agruparPorRegion([t('1', 'tuc'), t('2', 'urba'), t('3', 'urba'), t('4', 'cba')], uniones);
  const secciones = seccionesDeRegion(grupos ?? []);
  assert.deepEqual(secciones.map((s) => [s.title, s.eyebrow, s.tournaments.length]), [
    ['URBA', 'AMBA', 2],
    ['Unión Cordobesa de Rugby', 'Centro', 1],
    ['Unión de Rugby de Tucumán', 'NOA', 1],
  ]);
  assert.equal(new Set(secciones.map((s) => s.key)).size, 3);
});

test('los regionales se ven en su unión Y en un bloque de regionales de la región', () => {
  const lista = [
    { id: 'top10', unionId: 'cba', scope: 'regional' },
    { id: 'otro', unionId: 'cba', scope: null },
    { id: 'urba1', unionId: 'urba', scope: null },
  ];
  const grupos = agruparPorRegion(lista, uniones);
  const centro = grupos?.find((g) => g.code === 'centro');
  assert.equal(centro?.unions[0].regionales, true);
  assert.equal(centro?.unions[0].unionName, 'Regionales · Centro');
  assert.deepEqual(centro?.unions[0].tournaments.map((x) => x.id), ['top10']);
  // sigue estando en su unión...
  assert.deepEqual(centro?.unions[1].tournaments.map((x) => x.id), ['top10', 'otro']);
  // ...y el total de la región no cuenta dos veces
  assert.equal(centro?.total, 2);
  // una región sin regionales no trae el bloque
  assert.equal(grupos?.find((g) => g.code === 'amba')?.unions.some((u) => u.regionales), false);
});

test('seccionesDeRegion marca el bloque de regionales con su propio tipo y clave', () => {
  const grupos = agruparPorRegion([{ id: 'r', unionId: 'cba', scope: 'regional' }, { id: 'u', unionId: 'urba' }], uniones) ?? [];
  const secciones = seccionesDeRegion(grupos);
  const reg = secciones.find((s) => s.kind === 'regionales');
  assert.equal(reg?.key, 'centro:regionales');
  assert.equal(reg?.unionId, null);
  assert.equal(new Set(secciones.map((s) => s.key)).size, secciones.length);
});
