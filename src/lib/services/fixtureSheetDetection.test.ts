import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SYNTHETIC_HEADERS,
  cellToDate,
  cellToTime,
  detectHeaderRow,
  detectSheet,
  detectWorkbook,
  splitMatchup,
} from './fixtureSheetDetection.ts';

// 46100 = 19/03/2026 en la serie de Excel; 0.6875 = 16:30.
const MARCH_19 = 46100;

// ─── Celdas ────────────────────────────────────────────────────────────────

test('la fecha de Excel se lee por su serie, no por el texto regional', () => {
  assert.equal(cellToDate(MARCH_19), '2026-03-19');
  assert.equal(cellToDate(MARCH_19 + 0.6875), '2026-03-19');
  assert.equal(cellToDate('19/03/2026'), '2026-03-19');
  assert.equal(cellToDate('Sáb 19/03/2026'), '2026-03-19');
  assert.equal(cellToDate('2026-03-19'), '2026-03-19');
  // Un número de jornada no es una fecha.
  assert.equal(cellToDate(3), null);
});

test('una medianoche con segundos de menos sigue siendo ese día y sin hora', () => {
  // Así la escribe SheetJS con la zona de Buenos Aires: 19/9 00:00 → 46283.99944.
  const almostMidnight = 46283.999444444446;
  assert.equal(cellToDate(almostMidnight), '2026-09-19');
  assert.equal(cellToTime(almostMidnight, { allowDateTime: true }), null);
});

test('la hora sale de fracción, texto, am/pm o de una fecha con hora', () => {
  assert.equal(cellToTime(0.6875), '16:30');
  assert.equal(cellToTime('16:30'), '16:30');
  assert.equal(cellToTime('16.30'), '16:30');
  assert.equal(cellToTime('16 hs'), '16:00');
  assert.equal(cellToTime('4:30 PM'), '16:30');
  assert.equal(cellToTime('19/03'), null);
  assert.equal(cellToTime(MARCH_19 + 0.6875), null);
  assert.equal(cellToTime(MARCH_19 + 0.6875, { allowDateTime: true }), '16:30');
  assert.equal(cellToTime(MARCH_19, { allowDateTime: true }), null);
  assert.equal(cellToTime('19/03/2026 15:00', { allowDateTime: true }), '15:00');
  assert.equal(cellToTime('19.03.2026', { allowDateTime: true }), null);
});

test('el cruce en una celda se parte, el resultado no', () => {
  assert.deepEqual(splitMatchup('Tala vs Jockey Club'), { home: 'Tala', away: 'Jockey Club' });
  assert.deepEqual(splitMatchup('CRAI - Estudiantes'), { home: 'CRAI', away: 'Estudiantes' });
  assert.equal(splitMatchup('24 - 17'), null);
  assert.equal(splitMatchup('Tala'), null);
});

// ─── Encabezados ───────────────────────────────────────────────────────────

test('la fila de encabezados puede no ser la primera', () => {
  const grid = [
    ['Torneo Regional del Centro 2026'],
    [],
    ['Fixture oficial'],
    ['Fecha', 'Local', 'Visitante', 'Hora', 'Cancha'],
    [MARCH_19, 'Tala', 'Jockey', 0.6875, 'Tala'],
  ];
  assert.equal(detectHeaderRow(grid), 3);
});

test('«Fecha» con días es la fecha; «Fecha» con números es la jornada', () => {
  const withDays = detectSheet([
    ['Fecha', 'Local', 'Visitante'],
    [MARCH_19, 'Tala', 'Jockey'],
    [MARCH_19 + 7, 'CRAI', 'Estudiantes'],
  ]);
  assert.equal(withDays.mapping.match_date, 'Fecha');
  assert.equal(withDays.mapping.round, undefined);

  const withRounds = detectSheet([
    ['Fecha', 'Día', 'Local', 'Visitante'],
    [1, MARCH_19, 'Tala', 'Jockey'],
    [2, MARCH_19 + 7, 'CRAI', 'Estudiantes'],
  ]);
  assert.equal(withRounds.mapping.round, 'Fecha');
  assert.equal(withRounds.mapping.match_date, 'Día');
});

test('fase, partido, local, visitante, fecha y hora con títulos reales', () => {
  const sheet = detectSheet([
    ['Instancia', 'N° Partido', 'Equipo Local', 'Equipo Visitante', 'Día', 'Horario'],
    ['Fase de grupos', 1, 'Tala', 'Jockey', MARCH_19, 0.6875],
    ['Fase de grupos', 2, 'CRAI', 'Estudiantes', MARCH_19, 0.625],
  ]);
  assert.equal(sheet.mapping.phase, 'Instancia');
  assert.equal(sheet.mapping.match_number, 'N° Partido');
  assert.equal(sheet.mapping.home_team, 'Equipo Local');
  assert.equal(sheet.mapping.away_team, 'Equipo Visitante');
  assert.equal(sheet.mapping.match_date, 'Día');
  assert.equal(sheet.mapping.match_time, 'Horario');
});

test('«Hora local» es la hora, no el club local', () => {
  const sheet = detectSheet([
    ['Local', 'Visitante', 'Hora local'],
    ['Tala', 'Jockey', '16:30'],
  ]);
  assert.equal(sheet.mapping.home_team, 'Local');
  assert.equal(sheet.mapping.match_time, 'Hora local');
});

test('sin títulos útiles, la fecha y la hora se reconocen por contenido', () => {
  const sheet = detectSheet([
    ['Local', 'Visitante', 'Col A', 'Col B'],
    ['Tala', 'Jockey', MARCH_19, '16:30'],
    ['CRAI', 'Estudiantes', MARCH_19, '15:00'],
  ]);
  assert.equal(sheet.mapping.match_date, 'Col A');
  assert.equal(sheet.mapping.match_time, 'Col B');
});

// ─── Partido en una celda y filas de sección ───────────────────────────────

test('«Partido: A vs B» se parte en local y visitante', () => {
  const sheet = detectSheet([
    ['Fecha', 'Partido', 'Hora'],
    [MARCH_19, 'Tala vs Jockey', '16:30'],
    [MARCH_19, 'CRAI vs Estudiantes', '15:00'],
  ]);
  assert.equal(sheet.matchupHeader, 'Partido');
  assert.equal(sheet.mapping.match_number, undefined);
  assert.equal(sheet.mapping.home_team, SYNTHETIC_HEADERS.home);
  assert.equal(sheet.mapping.away_team, SYNTHETIC_HEADERS.away);
  assert.equal(sheet.rows[1][SYNTHETIC_HEADERS.home], 'CRAI');
  assert.equal(sheet.rows[1][SYNTHETIC_HEADERS.away], 'Estudiantes');
});

test('«FECHA 3» en una fila sola vale para los partidos de abajo', () => {
  const sheet = detectSheet([
    ['Día', 'Local', 'Visitante', 'Hora'],
    ['FECHA 1'],
    [MARCH_19, 'Tala', 'Jockey', '16:30'],
    [MARCH_19, 'CRAI', 'Estudiantes', ''],
    [],
    ['FECHA 2'],
    ['Día', 'Local', 'Visitante', 'Hora'],
    [MARCH_19 + 7, 'Jockey', 'CRAI', '15:30'],
  ]);
  assert.equal(sheet.rows.length, 3, 'el encabezado repetido no es un partido');
  assert.equal(sheet.sectionRows, 2);
  assert.equal(sheet.mapping.round, SYNTHETIC_HEADERS.round);
  assert.deepEqual(sheet.rows.map((row) => row[SYNTHETIC_HEADERS.round]), ['Fecha 1', 'Fecha 1', 'Fecha 2']);
});

test('una fila de fase («Semifinales») se hereda como fase', () => {
  const sheet = detectSheet([
    ['Local', 'Visitante', 'Fecha'],
    ['Semifinales'],
    ['Tala', 'Jockey', MARCH_19],
  ]);
  assert.equal(sheet.mapping.phase, SYNTHETIC_HEADERS.phase);
  assert.equal(sheet.rows[0][SYNTHETIC_HEADERS.phase], 'Semifinales');
});

// ─── Libro con varias hojas ────────────────────────────────────────────────

test('una hoja por fecha: entran todas y la jornada sale del nombre', () => {
  const template = (home: string, away: string) => [
    ['Día', 'Local', 'Visitante'],
    [MARCH_19, home, away],
  ];
  const workbook = detectWorkbook([
    { name: 'Fecha 1', grid: template('Tala', 'Jockey') },
    { name: 'Fecha 2', grid: template('CRAI', 'Tala') },
    { name: 'Posiciones', grid: [['Pos', 'Equipo', 'Pts'], [1, 'Tala', 10]] },
  ]);
  assert.ok(workbook);
  assert.deepEqual(workbook.usedSheets, ['Fecha 1', 'Fecha 2']);
  assert.deepEqual(workbook.skippedSheets, ['Posiciones']);
  assert.equal(workbook.detected.rows.length, 2);
  assert.deepEqual(
    workbook.detected.rows.map((row) => row[SYNTHETIC_HEADERS.sheetRound]),
    ['Fecha 1', 'Fecha 2'],
  );
});
