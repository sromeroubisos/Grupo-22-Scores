import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEventPeriodForType,
  getMatchPeriodLabel,
  getNextActivePeriodAfterEvent,
  getPeriodSequence,
  normalizeMatchPeriod,
} from './matchPeriods.ts';
import { getPeriodOffsetSeconds } from './matchClock.ts';

/**
 * El hockey pasa a cuatro cuartos. El riesgo de este cambio no es el hockey:
 * es que `matchPeriods` lo comparten TODOS los deportes, asi que la mitad de
 * los casos de aca existen para probar que rugby y futbol siguen exactamente
 * como estaban.
 */

const HOCKEY = 'field-hockey';

test('el hockey recorre los cuatro cuartos y cierra en FT', () => {
  assert.deepEqual(getPeriodSequence(HOCKEY), ['Q1', 'Q2', 'Q3', 'Q4']);

  assert.equal(getNextActivePeriodAfterEvent('match_start', 'PRE', HOCKEY), 'Q1');
  assert.equal(getNextActivePeriodAfterEvent('end_period', 'Q1', HOCKEY), 'Q2');
  assert.equal(getNextActivePeriodAfterEvent('end_period', 'Q2', HOCKEY), 'Q3');
  assert.equal(getNextActivePeriodAfterEvent('end_period', 'Q3', HOCKEY), 'Q4');
  assert.equal(getNextActivePeriodAfterEvent('end_period', 'Q4', HOCKEY), 'FT');
});

test('el entretiempo del hockey cae entre Q2 y Q3, no a la mitad de la lista de tiempos', () => {
  assert.equal(getNextActivePeriodAfterEvent('match_half', 'Q2', HOCKEY), 'Q3');
  // Y volver del entretiempo abre Q3, no Q1.
  assert.equal(getNextActivePeriodAfterEvent('start_period', 'HT', HOCKEY), 'Q3');
});

test('rugby y futbol no se movieron: siguen siendo dos tiempos', () => {
  for (const sport of ['rugby', 'football', undefined]) {
    assert.deepEqual(getPeriodSequence(sport), ['1T', '2T'], `secuencia de ${sport}`);
    assert.equal(getNextActivePeriodAfterEvent('match_start', 'PRE', sport), '1T');
    assert.equal(getNextActivePeriodAfterEvent('end_period', '1T', sport), '2T');
    assert.equal(getNextActivePeriodAfterEvent('end_period', '2T', sport), 'FT');
    assert.equal(getNextActivePeriodAfterEvent('end_period', 'HT', sport), '2T');
    assert.equal(getNextActivePeriodAfterEvent('end_period', 'ET', sport), 'FT');
    assert.equal(getNextActivePeriodAfterEvent('match_half', '1T', sport), '2T');
    assert.equal(getNextActivePeriodAfterEvent('start_period', 'PRE', sport), '1T');
    assert.equal(getNextActivePeriodAfterEvent('start_period', 'HT', sport), '2T');
    assert.equal(getEventPeriodForType('match_start', 'PRE', sport), '1T');
    assert.equal(getEventPeriodForType('match_end', 'PRE', sport), '2T');
  }
});

test('un partido de hockey guardado en mitades no se queda trabado', () => {
  // Los 105 partidos que ya existen tienen '1T' / '2T' en `matches.clock`.
  // Cerrar ese periodo tiene que llevarlos a la segunda mitad y al final, no
  // devolver el mismo periodo para siempre.
  assert.equal(getNextActivePeriodAfterEvent('end_period', '1T', HOCKEY), 'Q3');
  assert.equal(getNextActivePeriodAfterEvent('end_period', '2T', HOCKEY), 'FT');
});

test('el reloj viejo de hockey no retrocede media hora al abrirlo', () => {
  // El offset de '2T' sigue en la tabla aunque el periodo ya no se ofrezca: sin
  // el, un partido guardado en el segundo tiempo volvia a 00:00.
  assert.equal(getPeriodOffsetSeconds(HOCKEY, '2T'), 1800);
  assert.equal(getPeriodOffsetSeconds(HOCKEY, '1T'), 0);
});

test('cada cuarto de hockey arranca 15 minutos despues del anterior', () => {
  assert.equal(getPeriodOffsetSeconds(HOCKEY, 'Q1'), 0);
  assert.equal(getPeriodOffsetSeconds(HOCKEY, 'Q2'), 900);
  assert.equal(getPeriodOffsetSeconds(HOCKEY, 'Q3'), 1800);
  assert.equal(getPeriodOffsetSeconds(HOCKEY, 'Q4'), 2700);
  assert.equal(getPeriodOffsetSeconds(HOCKEY, 'FT'), 3600);
});

test('los cuartos se leen escritos de varias formas', () => {
  assert.equal(normalizeMatchPeriod('q1'), 'Q1');
  assert.equal(normalizeMatchPeriod('Primer cuarto'), 'Q1');
  assert.equal(normalizeMatchPeriod('3C'), 'Q3');
  assert.equal(getMatchPeriodLabel('Q4'), 'Cuarto cuarto');
});

test("'hockey' y 'field-hockey' son el mismo deporte para los periodos", () => {
  assert.deepEqual(getPeriodSequence('hockey'), getPeriodSequence('field-hockey'));
});
