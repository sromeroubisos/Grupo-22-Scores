import test from 'node:test';
import assert from 'node:assert/strict';

import { marqueeName, teamAcronym, teamLabels } from './teamAcronym.ts';

test('la sigla corta que ya trae el club se respeta', () => {
  assert.equal(teamAcronym('Club Atlético San Isidro', 'CASI'), 'CASI');
  assert.equal(teamAcronym('San Isidro Club', 'sic'), 'SIC');
});

test('sin sigla, sale del nombre: 3 letras de la primera palabra que identifica al club', () => {
  assert.equal(teamAcronym('Marabunta R.C.', 'Marabunta R.C.'), 'MAR');
  assert.equal(teamAcronym('Neuquén R.C.'), 'NEU');
  assert.equal(teamAcronym('Tacurú Social Club'), 'TAC');
  assert.equal(teamAcronym('Club La Tablada M15 "B"'), 'TAB');
  assert.equal(teamAcronym('Jockey Club Córdoba Preintermedia "A"'), 'JOC');
  assert.equal(teamAcronym('Córdoba Athletic Club Intermedia'), 'COR');
  assert.equal(teamAcronym('Los Teros R.C.'), 'TER');
  assert.equal(teamAcronym('Pay Ubre'), 'PAY');
  assert.equal(teamAcronym('Urú Curé Rugby Club M17 "A"'), 'URU');
});

test('el usuario elige siglas, nombre completo o automático', () => {
  assert.deepEqual(teamLabels('auto', null, 'Marabunta R.C.'), { short: 'MAR', wide: 'MARABUNTA R.C.' });
  assert.deepEqual(teamLabels('auto', 'MRB', 'Marabunta R.C.'), { short: 'MRB', wide: 'MRB' });
  assert.deepEqual(teamLabels('siglas', null, 'Marabunta R.C.'), { short: 'MAR', wide: 'MAR' });
  assert.deepEqual(teamLabels('completo', 'MRB', 'Marabunta R.C.'), { short: 'MARABUNTA R.C.', wide: 'MARABUNTA R.C.' });
});

test('nombres raros no rompen', () => {
  assert.equal(teamAcronym(''), '');
  assert.equal(teamAcronym(null, null), '');
  assert.equal(teamAcronym('C.A.S.I.'), 'CAS');
});

test('los estilos anchos no muestran un nombre que el CSS va a cortar', () => {
  // La categoría y el "7s" sobran en un marcador.
  assert.equal(marqueeName('Belgrano Athletic 7s', 'Belgrano Ath.'), 'BELGRANO ATHLETIC');
  assert.equal(marqueeName('Club Newman M19 "A"', 'Newman M19 "A"'), 'CLUB NEWMAN');
  // Si igual no entra, el nombre corto del club, también sin la categoría.
  assert.equal(marqueeName('Los Tordos Rugby Club M19 "A"', 'Los Tordos M19 "A"'), 'LOS TORDOS');
  // En modo automático los anchos usan esa versión.
  assert.equal(teamLabels('auto', null, 'San Isidro Club 7s', 'SIC').wide, 'SAN ISIDRO CLUB');
});
