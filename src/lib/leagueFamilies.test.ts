import test from 'node:test';
import assert from 'node:assert/strict';

import { agruparEnFamilias, completarConFilasLocales, type TorneoDeLista } from './leagueFamilies.ts';

const t = (id: string, name: string, extra: Partial<TorneoDeLista> = {}): TorneoDeLista => ({
  id, name, seasonId: '2026', categories: ['top 14'], subcategory: null,
  ageGroup: 'mayores', gender: 'masculino', ...extra,
});

test('Top 14: la Superior es la cabeza y la reserva cuelga de ella', () => {
  const lista = [
    t('pre-b', 'URBA: Top 14 - Preintermedia B', { subcategory: 'Preintermedia B' }),
    t('sup', 'Top 14 de la URBA', { subcategory: 'Superior' }),
    t('int', 'URBA: Top 14 - Intermedia', { subcategory: 'Intermedia' }),
  ];
  const r = agruparEnFamilias(lista);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'sup');
  assert.equal(r[0].name, 'Top 14 de la URBA');
  assert.deepEqual(r[0].familyMembers?.map((m) => m.label), ['Superior', 'Intermedia', 'Preintermedia B']);
});

test('la reserva sin su Superior (pestaña de juveniles) se llama Reserva · división', () => {
  const lista = [
    t('i', 'URBA: Primera A - Intermedia', { categories: ['primera a'], subcategory: 'Intermedia' }),
    t('pa', 'URBA: Primera A - Preintermedia A', { categories: ['primera a'], subcategory: 'Preintermedia A' }),
    t('pb', 'URBA: Primera A - Preintermedia B', { categories: ['primera a'], subcategory: 'Preintermedia B' }),
  ];
  const r = agruparEnFamilias(lista);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'Reserva · Primera A');
  assert.equal(r[0].id, 'i');
  assert.equal(r[0].familyMembers?.length, 3);
});

test('juveniles: las zonas de un mismo corte son una sola entrada', () => {
  const m16 = (id: string, sub: string) => t(id, `URBA: Juveniles - M16 - ${sub}`, {
    categories: ['otro'], ageGroup: 'M16', subcategory: sub,
  });
  const r = agruparEnFamilias([m16('a', 'G1 Zona A'), m16('b', 'G1 Zona B'), m16('c', 'G2 Zona A')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'Juveniles M16');
  assert.equal(r[0].familyMembers?.length, 3);
});

test('la categoría que distingue se muestra, y "otro" no', () => {
  const lista = [
    t('f1', 'x', { categories: ['formativo'], ageGroup: 'M17', subcategory: 'G1 Formativa A' }),
    t('f2', 'y', { categories: ['formativo'], ageGroup: 'M17', subcategory: 'G1 Formativa B' }),
    t('o1', 'z', { categories: ['otro'], ageGroup: 'M17', subcategory: 'G1 Zona A' }),
    t('o2', 'w', { categories: ['otro'], ageGroup: 'M17', subcategory: 'G1 Zona B' }),
  ];
  assert.deepEqual(agruparEnFamilias(lista).map((x) => x.name).sort(), ['Juveniles M17', 'Juveniles M17 · Formativo']);
});

test('temporadas distintas NO se mezclan', () => {
  const lista = [
    t('a', 'A', { subcategory: 'Superior', seasonId: '2026' }),
    t('b', 'B', { subcategory: 'Intermedia', seasonId: '2025' }),
  ];
  assert.equal(agruparEnFamilias(lista).length, 2);
});

test('sin subcategory, o único de su división: pasa sin tocar', () => {
  const lista = [
    t('x', 'Nacional de Clubes', { categories: ['nacional'] }),
    t('y', 'Solo', { subcategory: 'Superior', categories: ['primera b'] }),
  ];
  const r = agruparEnFamilias(lista);
  assert.deepEqual(r, lista);
  assert.ok(r.every((e) => !('familyMembers' in e)));
});

test('la familia ocupa el lugar de su cabeza y el resto de la lista no se mueve', () => {
  const lista = [
    t('z0', 'Antes', { categories: ['nacional'] }),
    t('i', 'URBA: Top 14 - Intermedia', { subcategory: 'Intermedia' }),
    t('s', 'Top 14', { subcategory: 'Superior' }),
    t('z1', 'Despues', { categories: ['nacional'] }),
  ];
  assert.deepEqual(agruparEnFamilias(lista).map((e) => e.id), ['z0', 's', 'z1']);
});

test('la rueda desambigua sólo cuando dos miembros comparten grado', () => {
  const m15 = (id: string, rueda: string, sub: string) =>
    t(id, `URBA: Juveniles - ${rueda} rueda - M15 - Grupo I - ${sub}`, { categories: ['otro'], ageGroup: 'M15', subcategory: sub });
  const [fam] = agruparEnFamilias([
    m15('r1', 'Primera', 'G1 Zona A'),
    m15('r2', 'Segunda', 'G1 Zona A'),
    m15('r3', 'Primera', 'G1 Zona B'),
  ]);
  assert.equal(fam.familyMembers?.length, 3);
  assert.equal(fam.familyMembers?.filter((m) => m.detalle).length, 2);
});

test('el torneo que llegó por la API pública se completa con la fila de la base, y se agrupa', () => {
  const publico = (id: string, name: string) => ({ id, name, seasonId: '2026', categories: [] as unknown[] });
  const local = (id: string, name: string, sub: string) =>
    t(id, name, { categories: ['top 14'], subcategory: sub });
  const completados = completarConFilasLocales(
    [publico('s', 'Top 14 de la URBA'), publico('i', 'URBA: Top 14 - Intermedia')],
    [local('s', 'Top 14 de la URBA', 'Superior'), local('i', 'URBA: Top 14 - Intermedia', 'Intermedia')],
  );
  const r = agruparEnFamilias(completados);
  assert.equal(r.length, 1);
  assert.equal(r[0].familyMembers?.length, 2);
});

test('completar no pisa lo que el torneo ya traía ni toca lo que no está en la base', () => {
  const propio = { ...t('a', 'A', { subcategory: 'Superior', ageGroup: 'mayores' }) };
  const suelto = { id: 'z', name: 'Z', categories: [] as unknown[] };
  const r = completarConFilasLocales([propio, suelto], [t('a', 'A', { subcategory: 'Otra', ageGroup: 'M16' })]);
  assert.equal(r[0].subcategory, 'Superior');
  assert.equal(r[0].ageGroup, 'mayores');
  assert.equal(r[1], suelto);
});
