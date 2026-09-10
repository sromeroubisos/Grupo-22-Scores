import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveDriveSituation,
  formatDownAndDistance,
  hasYardsInDetail,
  suggestedDriveEventType,
} from './americanFootballDrive.ts';
import { createAmericanFootballRuleset } from './americanFootballRules.ts';
import { formatOutcomeTag } from './matchEventCatalog.ts';
import { formatYardsDetail } from './matchEventStats.ts';

/**
 * El drive derivado de los eventos. Lo que se prueba es que la tira diga la
 * verdad del deporte: quien tiene la pelota, en que down y cuanto falta, y
 * que lo que no se sabe (yardas sin cargar, posicion en cancha) no se
 * invente.
 */

const NFL = createAmericanFootballRuleset('nfl');
const FLAG = createAmericanFootballRuleset('ifaf-flag-5v5');

const ev = (type: string, team: 'home' | 'away' | null, detail = '', order?: number) => ({ type, team, detail, order });
const yds = (n: number) => formatYardsDetail(n);

test('antes del kickoff nadie tiene la pelota', () => {
  const situation = deriveDriveSituation([ev('match_start', null)], NFL);
  assert.equal(situation.phase, 'open');
  assert.equal(situation.possession, null);
  assert.equal(formatDownAndDistance(situation, NFL), 'Sin posesión');
});

test('el kickoff se carga al que patea y recibe el otro, en 1° y 10', () => {
  const situation = deriveDriveSituation([ev('kickoff', 'home', formatOutcomeTag('return'))], NFL);
  assert.equal(situation.possession, 'away');
  assert.equal(situation.down, 1);
  assert.equal(situation.toGo, 10);
  assert.equal(formatDownAndDistance(situation, NFL), '1° y 10');
});

test('cada jugada consume un down y descuenta yardas', () => {
  const situation = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(3)),
    ev('pass_incomplete', 'away', yds(0)),
  ], NFL);
  assert.equal(situation.possession, 'away');
  assert.equal(situation.down, 3);
  assert.equal(situation.toGo, 7);
  assert.equal(formatDownAndDistance(situation, NFL), '3° y 7');
});

test('el primer down reinicia la serie', () => {
  const situation = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(4)),
    ev('pass_complete', 'away', yds(12)),
    ev('first_down', 'away', formatOutcomeTag('passing')),
  ], NFL);
  assert.equal(situation.down, 1);
  assert.equal(situation.toGo, 10);
  assert.equal(situation.firstDownPending, false);
});

test('cuando las yardas ya alcanzan y nadie cargo el primer down, lo sugiere', () => {
  const situation = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('pass_complete', 'away', yds(15)),
  ], NFL);
  assert.equal(situation.firstDownPending, true);
  assert.equal(suggestedDriveEventType(situation), 'first_down');
  assert.equal(formatDownAndDistance(situation, NFL), '2° · primer down conseguido');
});

test('el sack se carga a la defensa: lo sufre la ofensiva, con yardas negativas', () => {
  const situation = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(2)),
    ev('sack', 'home', yds(-8)),
  ], NFL);
  assert.equal(situation.possession, 'away');
  assert.equal(situation.down, 3);
  assert.equal(situation.toGo, 16);
});

test('jugado el cuarto down sin primer down, sugiere la perdida en downs', () => {
  const plays = [
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(1)),
    ev('rush', 'away', yds(1)),
    ev('pass_incomplete', 'away', yds(0)),
    ev('rush', 'away', yds(2)),
  ];
  const situation = deriveDriveSituation(plays, NFL);
  assert.equal(situation.downsExhausted, true);
  assert.equal(suggestedDriveEventType(situation), 'turnover_on_downs');
  assert.equal(formatDownAndDistance(situation, NFL), 'Downs agotados');

  const after = deriveDriveSituation([...plays, ev('turnover_on_downs', 'away')], NFL);
  assert.equal(after.possession, 'home');
  assert.equal(after.down, 1);
});

test('punt, intercepcion y fumble perdido entregan la pelota; el fumble recuperado no', () => {
  const punt = deriveDriveSituation([ev('kickoff', 'home'), ev('punt', 'away')], NFL);
  assert.equal(punt.possession, 'home');

  const pick = deriveDriveSituation([ev('kickoff', 'home'), ev('interception', 'home')], NFL);
  assert.equal(pick.possession, 'home');

  const lost = deriveDriveSituation([ev('kickoff', 'home'), ev('fumble', 'away', formatOutcomeTag('lost'))], NFL);
  assert.equal(lost.possession, 'home');

  const kept = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(5)),
    ev('fumble', 'away', formatOutcomeTag('recovered')),
  ], NFL);
  assert.equal(kept.possession, 'away');
  assert.equal(kept.down, 2);
});

test('el touchdown abre la conversion y la conversion le da la pelota al rival', () => {
  const td = deriveDriveSituation([ev('kickoff', 'home'), ev('touchdown', 'away', formatOutcomeTag('passing'))], NFL);
  assert.equal(td.phase, 'conversion');
  assert.equal(td.possession, 'away');
  assert.equal(formatDownAndDistance(td, NFL), 'Conversión');
  assert.equal(suggestedDriveEventType(td), null);

  const after = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('touchdown', 'away', formatOutcomeTag('passing')),
    ev('extra_point', 'away', formatOutcomeTag('good')),
  ], NFL);
  assert.equal(after.phase, 'series');
  assert.equal(after.possession, 'home');
});

test('tras el safety saca el que lo sufrio: la pelota va al que anoto', () => {
  const situation = deriveDriveSituation([ev('kickoff', 'home'), ev('safety', 'home')], NFL);
  assert.equal(situation.possession, 'home');
  assert.equal(situation.down, 1);
});

test('en el entretiempo la pelota queda en el aire hasta el kickoff', () => {
  const situation = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(3)),
    ev('match_half', null),
  ], NFL);
  assert.equal(situation.phase, 'open');
  assert.equal(situation.possession, null);
});

test('una jugada sin yardas cargadas deja de contar la distancia, pero sigue contando el down', () => {
  const situation = deriveDriveSituation([
    ev('kickoff', 'home'),
    ev('rush', 'away', yds(3)),
    ev('pass_complete', 'away', 'Pase largo sin yardas'),
  ], NFL);
  assert.equal(situation.down, 3);
  assert.equal(situation.yardsKnown, false);
  assert.equal(situation.toGo, null);
  assert.equal(formatDownAndDistance(situation, NFL), '3° down');
  assert.equal(suggestedDriveEventType(situation), null);
});

test('una jugada de un club sin posesion arranca su serie en vez de dejar la tira mintiendo', () => {
  const situation = deriveDriveSituation([ev('rush', 'home', yds(6))], NFL);
  assert.equal(situation.possession, 'home');
  assert.equal(situation.down, 2);
  assert.equal(situation.toGo, 4);
});

test('el flag lleva el down y no la distancia: el primer down es cruzar la mitad', () => {
  const situation = deriveDriveSituation([
    ev('rush', 'home', yds(4)),
    ev('pass_complete', 'home', yds(9)),
  ], FLAG);
  assert.equal(situation.down, 3);
  assert.equal(situation.toGo, null);
  assert.equal(situation.firstDownPending, false);
  assert.equal(formatDownAndDistance(situation, FLAG), '3° down');

  const loss = deriveDriveSituation([
    ev('rush', 'home', yds(4)),
    ev('flag_pull_for_loss', 'away', yds(-3)),
  ], FLAG);
  assert.equal(loss.possession, 'home');
  assert.equal(loss.down, 3);
});

test('los eventos se recorren en el orden en que se cargaron, no en el del arreglo', () => {
  const situation = deriveDriveSituation([
    ev('rush', 'away', yds(2), 3),
    ev('kickoff', 'home', '', 1),
    ev('rush', 'away', yds(5), 2),
  ], NFL);
  assert.equal(situation.down, 3);
  assert.equal(situation.toGo, 3);
});

test('las yardas se detectan en la forma canonica y en la tipeada a mano', () => {
  assert.equal(hasYardsInDetail(yds(7)), true);
  assert.equal(hasYardsInDetail('24 yd'), true);
  assert.equal(hasYardsInDetail('Pase al medio'), false);
  assert.equal(hasYardsInDetail(''), false);
});
