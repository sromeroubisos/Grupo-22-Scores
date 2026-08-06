import test from 'node:test';
import assert from 'node:assert/strict';

import {
  competitionKey, divisionKey, normalizeCategory, normalizeAgeGrade, normalizeGender,
  ordenarSubcategories, ordenDeSubcategory,
} from './competitionKey.ts';

const top = (anio: number, category: string, extra = {}) => ({
  season_id: String(anio), category, subcategory: 'Superior',
  age_grade: 'mayores', gender: 'masculino', ...extra,
});

test('Top 12, Top 13 y Top 14 son la MISMA competencia', () => {
  // Es el caso que motiva el módulo: la máxima categoría cambia de nombre con
  // su tamaño, y sin esto el Top 14 de 2026 no ofrece ninguna temporada.
  const k21 = competitionKey(top(2021, 'Top 12'));
  const k22 = competitionKey(top(2022, 'Top 13'));
  const k26 = competitionKey(top(2026, 'Top 14'));
  assert.equal(k21, k22);
  assert.equal(k22, k26);
});

test('pero Primera A y Primera B NO se colapsan', () => {
  // Son divisiones distintas de verdad. Juntarlas mezclaría dos torneos reales.
  assert.notEqual(competitionKey(top(2026, 'Primera A')), competitionKey(top(2026, 'Primera B')));
  assert.notEqual(competitionKey(top(2026, 'Primera B')), competitionKey(top(2026, 'Primera C')));
});

test('el grado sigue separando: la Superior no se mezcla con la Intermedia', () => {
  const sup = competitionKey(top(2026, 'Top 14'));
  const int = competitionKey(top(2026, 'Top 14', { subcategory: 'Intermedia' }));
  assert.notEqual(sup, int);
});

test('normalizeCategory sólo toca las divisiones con el tamaño en el nombre', () => {
  assert.equal(normalizeCategory('Top 12'), 'Top');
  assert.equal(normalizeCategory('Top 13'), 'Top');
  assert.equal(normalizeCategory('Top 14'), 'Top');
  assert.equal(normalizeCategory('TOP 14'), 'Top');
  assert.equal(normalizeCategory('Top14'), 'Top');
  assert.equal(normalizeCategory('Primera A'), 'Primera A');
  assert.equal(normalizeCategory('Segunda'), 'Segunda');
  assert.equal(normalizeCategory('Femenino'), 'Femenino');
  assert.equal(normalizeCategory('otro'), 'otro');
  assert.equal(normalizeCategory(null), '');
});

test('los 8 torneos preexistentes caen en la clave de sus hermanos', () => {
  // Traen otra grafía de age_grade y gender en NULL. Sin normalizar quedan solos.
  const viejo = competitionKey({ category: 'Top 14', subcategory: 'Superior', age_grade: 'Mayores', gender: null });
  const nuevo = competitionKey({ category: 'Top 12', subcategory: 'Superior', age_grade: 'mayores', gender: 'masculino' });
  assert.equal(viejo, nuevo);

  const adults = competitionKey({ category: 'Primera A', subcategory: 'Superior', age_grade: 'Mayores (Adults)', gender: null });
  const normal = competitionKey({ category: 'Primera A', subcategory: 'Superior', age_grade: 'mayores', gender: 'masculino' });
  assert.equal(adults, normal);
});

test('normalizeAgeGrade no inventa el dato que falta', () => {
  assert.equal(normalizeAgeGrade('Mayores'), 'mayores');
  assert.equal(normalizeAgeGrade('Mayores (Adults)'), 'mayores');
  assert.equal(normalizeAgeGrade('mayores'), 'mayores');
  assert.equal(normalizeAgeGrade('M19'), 'M19');
  assert.equal(normalizeAgeGrade('m19'), 'M19');
  // 'Juveniles' no dice de qué edad: se deja como está en vez de adivinar un M.
  assert.equal(normalizeAgeGrade('Juveniles'), 'Juveniles');
});

test('gender NULL cuenta como masculino, no como una tercera categoría', () => {
  // En URBA el femenino viene siempre declarado; un NULL es una fila vieja.
  assert.equal(normalizeGender(null), 'masculino');
  assert.equal(normalizeGender(undefined), 'masculino');
  assert.equal(normalizeGender(''), 'masculino');
  assert.equal(normalizeGender('masculino'), 'masculino');
  assert.equal(normalizeGender('femenino'), 'femenino');
  assert.equal(normalizeGender('FEMENINO'), 'femenino');
});

test('el femenino no se mezcla con el masculino', () => {
  assert.notEqual(
    competitionKey({ category: 'Femenino', subcategory: null, age_grade: 'mayores', gender: 'femenino' }),
    competitionKey({ category: 'Femenino', subcategory: null, age_grade: 'mayores', gender: 'masculino' }),
  );
});

test('subcategory NULL no colisiona con la cadena vacía', () => {
  assert.notEqual(
    competitionKey({ category: 'X', subcategory: null, age_grade: 'mayores', gender: 'masculino' }),
    competitionKey({ category: 'X', subcategory: '', age_grade: 'mayores', gender: 'masculino' }),
  );
});

test('divisionKey agrupa los grados de una misma temporada', () => {
  const sup = divisionKey(top(2026, 'Top 14'));
  const int = divisionKey(top(2026, 'Top 14', { subcategory: 'Intermedia' }));
  const pre = divisionKey(top(2026, 'Top 14', { subcategory: 'Preintermedia D' }));
  assert.equal(sup, int);
  assert.equal(int, pre);
});

test('divisionKey NO junta dos temporadas', () => {
  assert.notEqual(divisionKey(top(2025, 'Top 12')), divisionKey(top(2026, 'Top 14')));
});

test('el orden de los grados es jerárquico, no alfabético', () => {
  const desordenado = ['Preintermedia B', 'M22', 'Superior', 'Intermedia', 'Preintermedia', 'Preintermedia A'];
  assert.deepEqual(ordenarSubcategories(desordenado), [
    'Superior', 'Intermedia', 'Preintermedia', 'Preintermedia A', 'Preintermedia B', 'M22',
  ]);
  // Lo importante: Intermedia antes que Preintermedia por jerarquía, no por letra.
  assert.ok(ordenDeSubcategory('Intermedia') < ordenDeSubcategory('Preintermedia'));
});

test('un grado desconocido va al final y no rompe el orden', () => {
  assert.deepEqual(
    ordenarSubcategories(['Reserva', 'Superior', 'Alevines']),
    ['Superior', 'Alevines', 'Reserva'],
  );
});
