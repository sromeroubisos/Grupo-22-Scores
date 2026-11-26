import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeRugbyModalityRules,
  getRugbyModalityRules,
  readRugbyModality,
  rugbyModalityPeriodRules,
} from './rugbyModality.ts';
import { getClockDisplaySeconds, getPeriodOffsetSeconds } from '../matchClock.ts';

test('seven: 7 en cancha, 5 en el banco, tiempos de 7 y amarilla de 2', () => {
  const rules = getRugbyModalityRules('sevens');
  assert.equal(rules.starters, 7);
  assert.equal(rules.bench, 5);
  assert.equal(rules.lineupSize, 12);
  assert.equal(rules.periodDurationMinutes, 7);
  assert.equal(rules.sinBinMinutes, 2);
  assert.equal(describeRugbyModalityRules('sevens'), '7 en cancha + 5 suplentes · 2×7′ · amarilla 2′');
});

test('sin modalidad se lee como rugby de 15', () => {
  const rules = getRugbyModalityRules(readRugbyModality({}));
  assert.equal(rules.starters, 15);
  assert.equal(rules.lineupSize, 23);
  assert.equal(rules.sinBinMinutes, 10);
  assert.equal(rugbyModalityPeriodRules('fifteens'), null);
});

test('el reloj del seven arranca el 2T en 7:00 y cuenta para arriba', () => {
  const ref = { sportId: 'rugby', periodRules: rugbyModalityPeriodRules('sevens') };
  assert.equal(getPeriodOffsetSeconds(ref, '2T'), 7 * 60);
  assert.equal(getPeriodOffsetSeconds(ref, 'ET'), 14 * 60);
  assert.deepEqual(getClockDisplaySeconds(ref, '1T', 312), { seconds: 312, countdown: false });
  // El de 15 sigue en 40'.
  assert.equal(getPeriodOffsetSeconds('rugby', '2T'), 40 * 60);
});
