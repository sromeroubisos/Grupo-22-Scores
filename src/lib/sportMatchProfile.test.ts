import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getOffensiveBonusPreset,
  getSecondaryScoreKeys,
  getSecondaryScoreMetric,
  getSportMatchProfile,
} from './sportMatchProfile.ts';

/**
 * La mitad de este archivo existe para probar que RUGBY NO SE MOVIO.
 *
 * El panel de gestion tenia las constantes de rugby escritas a mano —planilla
 * de 23, 15 titulares, campo de tries, bonus por 4+ tries— y las aplicaba a
 * todos los deportes. Al parametrizarlas, lo que hay que garantizar es que el
 * deporte que ya estaba bien siga dando exactamente los mismos numeros.
 */

test('rugby sigue igual: 23 jugadores, 15 titulares y tries', () => {
  const profile = getSportMatchProfile('rugby');
  assert.equal(profile.lineupSize, 23);
  assert.equal(profile.startersCount, 15);
  assert.deepEqual(profile.secondaryScoreMetric, { key: 'tries', label: 'Tries', eventType: 'try' });
});

test('rugby sigue guardando la cifra secundaria en score.homeTries', () => {
  const metric = getSecondaryScoreMetric('rugby');
  assert.ok(metric);
  assert.deepEqual(getSecondaryScoreKeys(metric), { home: 'homeTries', away: 'awayTries' });
});

test('rugby sigue midiendo el bonus ofensivo por 4+ tries', () => {
  const preset = getOffensiveBonusPreset('rugby');
  assert.equal(preset.type, 'tries');
  assert.equal(preset.threshold, 4);
  assert.equal(preset.rule, '4+ tries');
});

test('un partido sin deporte resuelto se sigue tratando como rugby', () => {
  // Es el default declarado de la plataforma y lo que hacia el match center con
  // su `matchSportId ?? 'rugby'`. Cambiarlo moveria partidos de rugby.
  assert.deepEqual(getSportMatchProfile(null), getSportMatchProfile('rugby'));
  assert.deepEqual(getSportMatchProfile(undefined), getSportMatchProfile('rugby'));
});

test('las variantes de rugby comparten el perfil', () => {
  for (const variant of ['rugby-union', 'rugby-league', 'rugby7s']) {
    assert.deepEqual(getSportMatchProfile(variant), getSportMatchProfile('rugby'), variant);
  }
});

test('hockey abre 16 con 11 titulares y NO pide una cifra secundaria', () => {
  const profile = getSportMatchProfile('field-hockey');
  assert.equal(profile.lineupSize, 16);
  assert.equal(profile.startersCount, 11);
  // El marcador ya ES el conteo de goles: un campo aparte seria un segundo
  // numero para lo mismo, capaz de contradecir al marcador.
  assert.equal(profile.secondaryScoreMetric, null);
});

test('el bonus ofensivo de hockey se mide en goles, no en tries', () => {
  const preset = getOffensiveBonusPreset('field-hockey');
  // 'tries' resolvia a contar eventos de tipo try, que en hockey nunca existen:
  // el bonus quedaba prendido y jamas sumaba un punto.
  assert.notEqual(preset.type, 'tries');
  assert.equal(preset.type, 'score');
  assert.equal(preset.label, 'goles');
  assert.match(preset.hint, /goles/);
});

test('ningun deporte con perfil propio hereda la planilla de rugby', () => {
  for (const sport of ['field-hockey', 'football', 'basketball']) {
    const profile = getSportMatchProfile(sport);
    assert.notEqual(profile.lineupSize, 23, `${sport} abrio una planilla de rugby`);
    assert.notEqual(profile.startersCount, 15, `${sport} arranco con 15 titulares`);
  }
});

test("'hockey' y 'field-hockey' son el mismo deporte", () => {
  assert.deepEqual(getSportMatchProfile('hockey'), getSportMatchProfile('field-hockey'));
});
