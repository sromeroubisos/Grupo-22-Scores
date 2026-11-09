import test from 'node:test';
import assert from 'node:assert/strict';

import { gruposPorTipo, tipoDeLista, type TorneoClasificable } from './leagueSections.ts';

const t = (id: string, name: string, extra: Partial<TorneoClasificable> = {}): TorneoClasificable => ({
  id, name, seasonId: '2026', categories: ['top 14'], subcategory: null,
  ageGroup: 'mayores', gender: 'masculino', scope: null, ...extra,
});

test('la lista de una unión se parte en Competiciones, Reserva y Juveniles', () => {
  const lista = [
    t('sup', 'Top 14 de la URBA', { subcategory: 'Superior' }),
    t('int', 'URBA: TOP 14 - Intermedia', { subcategory: 'Intermedia' }),
    t('pre', 'URBA: TOP 14 - Preintermedia B', { subcategory: 'Preintermedia B' }),
    t('m16a', 'URBA: Juveniles - M16 - G1 Zona A', { categories: ['otro'], ageGroup: 'M16', subcategory: 'G1 Zona A' }),
    t('m16b', 'URBA: Juveniles - M16 - G1 Zona B', { categories: ['otro'], ageGroup: 'M16', subcategory: 'G1 Zona B' }),
  ];
  const grupos = gruposPorTipo(lista);
  assert.deepEqual(grupos.map((g) => g.title), ['Competiciones', 'Reserva', 'Juveniles']);
  assert.deepEqual(grupos[0].tournaments.map((x) => x.id), ['sup']);
  assert.equal(grupos[1].tournaments[0].name, 'Reserva · Top 14');
  assert.equal(grupos[2].tournaments[0].name, 'Juveniles M16');
});

test('las competiciones de Rugby Europe van todas con las de mayores, también su U18 y su U20', () => {
  const lista = [
    t('sc', 'Rugby Europe Super Cup', { categories: [], ageGroup: 'Mayores' }),
    t('u18', 'Rugby Europe U18 Championship', { categories: ['U18'], ageGroup: 'U18' }),
    t('u20', 'Rugby Europe U20 Championship', { categories: ['U20'], ageGroup: 'U20' }),
    t('wc', "Rugby Europe Women's Conference", { categories: [], ageGroup: 'Mayores', gender: 'femenino' }),
  ];
  for (const x of lista) assert.equal(tipoDeLista(x), 'competiciones', x.name);
  assert.deepEqual(gruposPorTipo(lista).map((g) => g.title), ['Competiciones']);
  // lo que no es de Rugby Europe sigue su camino: un U18 de otra organización es juvenil
  assert.equal(tipoDeLista(t('x', 'Torneo U18 de la URBA', { categories: ['U18'], ageGroup: 'U18' })), 'juveniles');
  assert.equal(tipoDeLista(t('y', 'URBA: TOP 14 - Intermedia', { subcategory: 'Intermedia' })), 'reserva');
});

test('primero se parte y después se agrupa: el Top 14 no se traga a su reserva', () => {
  const grupos = gruposPorTipo([
    t('sup', 'Top 14', { subcategory: 'Superior' }),
    t('int', 'URBA: TOP 14 - Intermedia', { subcategory: 'Intermedia' }),
  ]);
  // Si se agrupara antes, serían UNA familia de dos grados y no habría sección Reserva.
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].tournaments[0].familyMembers, undefined);
});

test('los regionales van primero entre las competiciones', () => {
  const grupos = gruposPorTipo([
    t('a', 'Primera "A"', { categories: ['primera a'] }),
    t('r', 'Top 10 del Centro', { scope: 'regional' }),
    t('b', 'Primera "B"', { categories: ['primera b'] }),
  ]);
  assert.deepEqual(grupos[0].tournaments.map((x) => x.id), ['r', 'a', 'b']);
});

test('una sección vacía no aparece', () => {
  const grupos = gruposPorTipo([t('a', 'Primera "A"')]);
  assert.deepEqual(grupos.map((g) => g.key), ['competiciones']);
});

test('la reserva también se reconoce por el nombre, no sólo por el grado', () => {
  assert.equal(tipoDeLista(t('x', 'Torneo Juvenil de Tucumán M15 Reserva', { ageGroup: 'M15', categories: ['otro'] })), 'reserva');
  assert.equal(tipoDeLista(t('y', 'Súper 9 "B" - Intermedia')), 'reserva');
  assert.equal(tipoDeLista(t('z', 'Nacional de Clubes', { categories: ['nacional'] })), 'competiciones');
  assert.equal(tipoDeLista(t('w', 'Torneo Cordobés M17 "A"', { ageGroup: 'M17', categories: ['otro'] })), 'juveniles');
});
