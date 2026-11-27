import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSourceLabel,
  planGroupLabelAdvancement,
  rankGroup,
  type LabelGroup,
  type LabelMatch,
} from './advanceFromGroupLabels.ts';

/**
 * Formato del Seven de la Pava: tres zonas de tres; el 1.º de cada zona juega la
 * Copa de Oro (triangular) y el 1.º y el 2.º de la copa, la final.
 */
const G: LabelGroup[] = [
  { id: 'gA', name: 'Zona A', phase_id: 'zonas' },
  { id: 'gB', name: 'Zona B', phase_id: 'zonas' },
  { id: 'gC', name: 'Zona C', phase_id: 'zonas' },
  { id: 'gOro', name: 'Copa de Oro', phase_id: 'copas' },
];

const jugado = (id: string, g: string, h: string, a: string, hs: number, as: number): LabelMatch => ({
  id, phase_id: 'zonas', group_id: g, status: 'final', home_club_id: h, away_club_id: a,
  score: { home: hs, away: as }, home_source_label: null, away_source_label: null, is_visible: true,
});
const cruce = (id: string, phase: string, g: string | null, hl: string, al: string): LabelMatch => ({
  id, phase_id: phase, group_id: g, status: 'scheduled', home_club_id: null, away_club_id: null,
  score: null, home_source_label: hl, away_source_label: al, is_visible: false,
});

function torneo(): LabelMatch[] {
  return [
    jugado('1', 'gA', 'A1', 'A2', 20, 5), jugado('4', 'gA', 'A2', 'A3', 10, 7), jugado('7', 'gA', 'A1', 'A3', 14, 0),
    jugado('2', 'gB', 'B1', 'B2', 0, 12), jugado('5', 'gB', 'B2', 'B3', 7, 7), jugado('8', 'gB', 'B1', 'B3', 5, 19),
    jugado('3', 'gC', 'C1', 'C2', 7, 5), jugado('6', 'gC', 'C2', 'C3', 21, 0), jugado('9', 'gC', 'C1', 'C3', 3, 10),
    cruce('13', 'copas', 'gOro', '1º Zona A', '1º Zona B'),
    cruce('17', 'copas', 'gOro', '1º Zona B', '1º Zona C'),
    cruce('21', 'copas', 'gOro', '1º Zona A', '1º Zona C'),
    cruce('25', 'finales', null, '1º Copa de Oro', '2º Copa de Oro'),
  ];
}

const aplicar = (ms: LabelMatch[], updates: ReturnType<typeof planGroupLabelAdvancement>['updates']) => {
  for (const u of updates) Object.assign(ms.find((m) => m.id === u.id)!, u);
};

test('lee el rótulo de origen', () => {
  assert.deepEqual(parseSourceLabel('2º Zona B'), { puesto: 2, grupo: 'Zona B' });
  assert.deepEqual(parseSourceLabel('1° Copa de Oro'), { puesto: 1, grupo: 'Copa de Oro' });
  assert.equal(parseSourceLabel('Ganador partido 10'), null);
  assert.equal(parseSourceLabel(null), null);
});

test('la tabla desempata por el partido entre los igualados y después por diferencia', () => {
  // B2 y B3 empatan en 3 puntos y empataron entre ellos: decide la diferencia
  assert.deepEqual(rankGroup([
    { h: 'B1', a: 'B2', hs: 0, as: 12 }, { h: 'B2', a: 'B3', hs: 7, as: 7 }, { h: 'B1', a: 'B3', hs: 5, as: 19 },
  ]), ['B3', 'B2', 'B1']);
  // triple empate 2-2-2: diferencia
  assert.deepEqual(rankGroup([
    { h: 'X', a: 'Y', hs: 30, as: 0 }, { h: 'Y', a: 'Z', hs: 7, as: 5 }, { h: 'Z', a: 'X', hs: 12, as: 10 },
  ]), ['X', 'Z', 'Y']);
});

test('con una zona sin terminar, el cupo que depende de ella queda vacío y el partido oculto', () => {
  const ms = torneo();
  ms.find((m) => m.id === '9')!.status = 'scheduled';
  const { updates } = planGroupLabelAdvancement(G, ms);
  const p17 = updates.find((u) => u.id === '17');
  assert.equal(updates.find((u) => u.id === '13')?.home_club_id, 'A1');
  assert.equal(p17?.home_club_id, 'B3');
  assert.equal(p17?.away_club_id, null);
  assert.equal(p17?.is_visible, false);
});

test('zonas terminadas → copa armada; copa terminada → final', () => {
  const ms = torneo();
  aplicar(ms, planGroupLabelAdvancement(G, ms).updates);
  const oro = ['13', '17', '21'].map((id) => ms.find((m) => m.id === id)!);
  assert.deepEqual(oro.map((m) => [m.home_club_id, m.away_club_id, m.is_visible]), [
    ['A1', 'B3', true], ['B3', 'C2', true], ['A1', 'C2', true],
  ]);
  assert.equal(ms.find((m) => m.id === '25')!.home_club_id, null);

  // se juega la Copa de Oro: A1 gana todo, C2 le gana a B3
  Object.assign(oro[0], { status: 'final', score: { home: 21, away: 7 } });
  Object.assign(oro[1], { status: 'final', score: { home: 5, away: 17 } });
  Object.assign(oro[2], { status: 'final', score: { home: 12, away: 10 } });
  aplicar(ms, planGroupLabelAdvancement(G, ms).updates);
  const final = ms.find((m) => m.id === '25')!;
  assert.deepEqual([final.home_club_id, final.away_club_id, final.is_visible], ['A1', 'C2', true]);
  // correr de nuevo no cambia nada
  assert.equal(planGroupLabelAdvancement(G, ms).updates.length, 0);
});

test('corregir un resultado rehace el cruce si todavía no se jugó', () => {
  const ms = torneo();
  aplicar(ms, planGroupLabelAdvancement(G, ms).updates);
  // en la Zona A, A2 le gana a A1 por mucho: pasa a ser primero
  Object.assign(ms.find((m) => m.id === '1')!, { score: { home: 0, away: 40 } });
  aplicar(ms, planGroupLabelAdvancement(G, ms).updates);
  assert.equal(ms.find((m) => m.id === '13')!.home_club_id, 'A2');
  // un cruce ya jugado no se toca
  Object.assign(ms.find((m) => m.id === '13')!, { status: 'final', score: { home: 7, away: 0 } });
  Object.assign(ms.find((m) => m.id === '1')!, { score: { home: 40, away: 0 } });
  assert.equal(planGroupLabelAdvancement(G, ms).updates.some((u) => u.id === '13'), false);
});

test('los rótulos que no apuntan a un grupo de la temporada no se tocan', () => {
  const ms = [jugado('1', 'gA', 'A1', 'A2', 5, 0), cruce('x', 'otra', null, 'Ganador P10', '1º Zona Z')];
  assert.equal(planGroupLabelAdvancement(G, ms).updates.length, 0);
});
