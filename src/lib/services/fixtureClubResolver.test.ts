import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClubIndex, findClubMentions, resolveMatchupFromLine } from './fixtureClubResolver.ts';

// Los diez del Top 10 2026 con sus nombres de la base; las líneas son las del
// PDF de la Unión Cordobesa (TOP-10-A-2026.pdf), tal como sale su texto.
const INDEX = buildClubIndex([
  { id: 'la-tablada', name: 'Club La Tablada', variants: ['La Tablada'] },
  { id: 'jockey-cba', name: 'Jockey Club Córdoba', variants: ['Jockey CC'] },
  { id: 'san-martin', name: 'San Martín de Villa María', variants: ['San Martín R.C.'] },
  { id: 'carlos-paz', name: 'Carlos Paz Rugby Club', variants: ['Carlos Paz R.C.'] },
  { id: 'universitario', name: 'Club Universitario de Córdoba', variants: ['Univ. de Córdoba'] },
  { id: 'athletic', name: 'Córdoba Athletic Club', variants: [] },
  { id: 'palermo', name: 'Club Palermo Bajo', variants: ['Palermo Bajo'] },
  { id: 'jockey-vm', name: 'Jockey Club de Villa María', variants: ['Jockey de Villa María'] },
  { id: 'tala', name: 'Tala Rugby Club', variants: ['Tala R.C.'] },
  { id: 'uru-cure', name: 'Urú Curé Rugby Club', variants: ['Urú Curé'] },
]);

const pair = (line: string) => {
  const matchup = resolveMatchupFromLine(line, INDEX);
  return matchup ? [matchup.home.clubId, matchup.away.clubId] : null;
};

test('local y visitante pegados, con los números de los cruces alrededor', () => {
  assert.deepEqual(pair('10 9 10 Jockey Club Cba Tala R.C. 9'), ['jockey-cba', 'tala']);
  assert.deepEqual(pair('7 1 7 Uru Cure RC San Martin Villa Maria 1'), ['uru-cure', 'san-martin']);
  assert.deepEqual(pair('8 Jockey Villa María San Martin Villa Maria 1'), ['jockey-vm', 'san-martin']);
});

test('con la lista del sorteo en la misma línea, manda el último par pegado', () => {
  assert.deepEqual(pair('9 Tala R.C. 5 3 5 Universitario Carlos Paz R.C. 3'), ['universitario', 'carlos-paz']);
  assert.deepEqual(pair('5 Universitario 4 5 4 Palermo Bajo Universitario 5'), ['palermo', 'universitario']);
});

test('lo que no es un partido no da par', () => {
  assert.equal(pair('Fecha TDI 28/03/2026'), null);
  assert.equal(pair('San Martin Villa Maria'), null);
  assert.equal(pair('CF1 3ro General 6to General'), null);
});

test('un nombre suelto vale sólo si apunta a un club', () => {
  assert.equal(findClubMentions('Universitario', INDEX)[0]?.clubId, 'universitario');
  // «Jockey» solo son dos clubes: no se adivina.
  assert.deepEqual(findClubMentions('Jockey', INDEX), []);
});

test('también con «vs» y tabs, como sale de una planilla', () => {
  assert.deepEqual(pair('Tala R.C. vs Jockey Club Cba'), ['tala', 'jockey-cba']);
  assert.deepEqual(pair('4\t10\t4\tPalermo Bajo\tJockey Club Cba\t10'), ['palermo', 'jockey-cba']);
});
