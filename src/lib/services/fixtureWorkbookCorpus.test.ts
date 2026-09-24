/**
 * Corpus de planillas: el MISMO fixture escrito de todas las maneras en que lo
 * arma una unión, un club o un organizador, y en todos los formatos de archivo
 * que se suben. Cada caso pasa por el camino real del importador —lector,
 * detección, lectura fila por fila y resolución de clubes— y se compara partido
 * por partido: local, visitante, fecha, hora, jornada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { readWorkbook, type WorkbookKind } from './fixtureWorkbookReader.ts';
import { cellToDate, cellToTime, extractWorkbookFixture, type SheetCell } from './fixtureSheetDetection.ts';
import { buildClubIndex, findClubMentions, resolveRowsByClubs } from './fixtureClubResolver.ts';

const INDEX = buildClubIndex([
  { id: 'tala', name: 'Tala Rugby Club', variants: ['Tala R.C.'] },
  { id: 'jockey', name: 'Jockey Club Córdoba', variants: ['Jockey CC'] },
  { id: 'uru', name: 'Urú Curé Rugby Club', variants: ['Urú Curé'] },
  { id: 'tablada', name: 'Club La Tablada', variants: ['La Tablada'] },
]);

type Match = { round: string | null; date: string | null; home: string; away: string; time: string | null; group?: string | null };

// El fixture de referencia: 2 fechas, 2 partidos cada una.
const EXPECTED: Match[] = [
  { round: 'Fecha 1', date: '2026-03-14', home: 'tala', away: 'jockey', time: '15:30' },
  { round: 'Fecha 1', date: '2026-03-14', home: 'uru', away: 'tablada', time: '16:00' },
  { round: 'Fecha 2', date: '2026-03-21', home: 'jockey', away: 'uru', time: '15:30' },
  { round: 'Fecha 2', date: '2026-03-21', home: 'tablada', away: 'tala', time: '16:00' },
];

const clubId = (name: unknown) => {
  const text = typeof name === 'string' ? name : '';
  return findClubMentions(text, INDEX)[0]?.clubId ?? `?${text}`;
};

const d = (day: number, month = 3) => new Date(2026, month - 1, day);
const t = (hour: number, minute: number) => (hour * 60 + minute) / 1440;

/** Lo que el importador ve de un archivo: la lista de partidos normalizada. */
function importMatches(bytes: Uint8Array, kind: WorkbookKind): Match[] {
  const read = readWorkbook(bytes, kind);
  assert.equal(read.error, null, `no se pudo leer: ${read.error}`);
  const fixture = extractWorkbookFixture(read.sheets);

  if (fixture.mode === 'lines') {
    const rows = fixture.parsed.rows.map((row) => ({
      _line: row.raw,
      home_team: row.homeTeam,
      away_team: row.awayTeam,
      match_date: row.matchDate,
      match_time: row.matchTime,
      round: row.round,
      group: row.group,
    }));
    return resolveRowsByClubs(rows, INDEX).rows.map((row) => ({
      round: (row.round as string) ?? null,
      date: (row.match_date as string) ?? null,
      home: clubId(row.home_team),
      away: clubId(row.away_team),
      time: (row.match_time as string) ?? null,
      group: (row.group as string) ?? null,
    }));
  }

  const { mapping } = fixture;
  const pick = (row: Record<string, SheetCell>, field: keyof typeof mapping) => (mapping[field] ? row[mapping[field] as string] : null);
  return fixture.rows.map((row) => {
    const round = pick(row, 'round');
    return {
      round: round === null || round === undefined || round === '' ? null : /^\d+$/.test(String(round)) ? `Fecha ${round}` : String(round),
      date: cellToDate(pick(row, 'match_date')),
      home: clubId(pick(row, 'home_team')),
      away: clubId(pick(row, 'away_team')),
      time: cellToTime(pick(row, 'match_time')) ?? cellToTime(pick(row, 'match_date'), { allowDateTime: true }),
      group: (pick(row, 'group') as string) ?? null,
    };
  });
}

const book = (sheets: Array<[string, SheetCell[][]]>, tweak?: (wb: XLSX.WorkBook) => void) => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), name);
  tweak?.(wb);
  return wb;
};
const write = (wb: XLSX.WorkBook, bookType: XLSX.BookType) =>
  new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);

/** Compara sólo los campos que el caso dice tener. */
function assertFixture(actual: Match[], fields: Array<keyof Match> = ['round', 'date', 'home', 'away', 'time'], expected = EXPECTED) {
  const pickFields = (match: Match) => Object.fromEntries(fields.map((field) => [field, match[field] ?? null]));
  // Se ordena por lo que se compara: el orden de lectura no es parte del contrato.
  const sort = (list: Match[]) => list.map(pickFields).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(sort(actual), sort(expected));
}

// ─── Tabla clásica en todos los formatos de archivo ───────────────────────

const TABLE: SheetCell[][] = [
  ['Fecha N°', 'Día', 'Hora', 'Local', 'Visitante'],
  [1, d(14), t(15, 30), 'Tala R.C.', 'Jockey Club Cba'],
  [1, d(14), t(16, 0), 'Uru Cure RC', 'La Tablada'],
  [2, d(21), t(15, 30), 'Jockey Club Cba', 'Uru Cure RC'],
  [2, d(21), t(16, 0), 'La Tablada', 'Tala R.C.'],
];

for (const bookType of ['xlsx', 'xlsm', 'xlsb', 'biff8', 'ods', 'fods'] as XLSX.BookType[]) {
  test(`tabla clásica en .${bookType === 'biff8' ? 'xls' : bookType}`, () => {
    assertFixture(importMatches(write(book([['Fixture', TABLE]]), bookType), 'spreadsheet'));
  });
}

// ─── Delimitados: coma, punto y coma con Windows-1252, tab ────────────────

const CSV_ROWS = [
  ['Fecha', 'Día', 'Hora', 'Local', 'Visitante'],
  ['1', '14/03/2026', '15:30', 'Tala R.C.', 'Jockey Club Córdoba'],
  ['1', '14/03/2026', '16:00', 'Urú Curé', 'La Tablada'],
  ['2', '21/03/2026', '15:30', 'Jockey Club Córdoba', 'Urú Curé'],
  ['2', '21/03/2026', '16:00', 'La Tablada', 'Tala R.C.'],
];

test('CSV con coma, UTF-8', () => {
  const text = CSV_ROWS.map((row) => row.join(',')).join('\n');
  assertFixture(importMatches(new TextEncoder().encode(text), 'delimited'));
});

test('CSV con punto y coma en Windows-1252 (Excel en castellano)', () => {
  const text = CSV_ROWS.map((row) => row.join(';')).join('\r\n');
  // Latin-1 a mano: «ú», «é» y «ó» son un byte cada una, como las guarda Excel.
  const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
  const read = readWorkbook(bytes, 'delimited');
  assert.equal(read.encoding, 'windows-1252');
  assert.equal(read.delimiter, ';');
  assertFixture(importMatches(bytes, 'delimited'));
});

test('TSV (copiado de una web o de Google Sheets)', () => {
  const text = CSV_ROWS.map((row) => row.join('\t')).join('\n');
  assertFixture(importMatches(new TextEncoder().encode(text), 'delimited'));
});

// ─── Formas de la planilla ────────────────────────────────────────────────

test('título arriba, fecha y jornada combinadas por bloque', () => {
  const aoa: SheetCell[][] = [
    ['TORNEO REGIONAL 2026'],
    [],
    ['Jornada', 'Fecha', 'Hora', 'Local', 'Visitante'],
    [1, d(14), t(15, 30), 'Tala R.C.', 'Jockey Club Cba'],
    [null, null, t(16, 0), 'Uru Cure RC', 'La Tablada'],
    [2, d(21), t(15, 30), 'Jockey Club Cba', 'Uru Cure RC'],
    [null, null, t(16, 0), 'La Tablada', 'Tala R.C.'],
  ];
  const wb = book([['Fixture', aoa]], (workbook) => {
    workbook.Sheets.Fixture['!merges'] = [
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } }, { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } }, { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },
    ];
  });
  assertFixture(importMatches(write(wb, 'xlsx'), 'spreadsheet'));
});

test('«igual que arriba» sin combinar: la fecha sólo en el primer partido del día', () => {
  const aoa: SheetCell[][] = [
    ['Jornada', 'Fecha', 'Hora', 'Local', 'Visitante'],
    [1, d(14), t(15, 30), 'Tala R.C.', 'Jockey Club Cba'],
    ['', '', t(16, 0), 'Uru Cure RC', 'La Tablada'],
    [2, d(21), t(15, 30), 'Jockey Club Cba', 'Uru Cure RC'],
    ['', '', t(16, 0), 'La Tablada', 'Tala R.C.'],
  ];
  assertFixture(importMatches(write(book([['F', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('en inglés, con fechas mes/día como texto y hora AM/PM', () => {
  const aoa: SheetCell[][] = [
    ['Round', 'Date', 'Kick-off', 'Home', 'Away'],
    ['1', '3/14/2026', '3:30 PM', 'Tala R.C.', 'Jockey Club Cba'],
    ['1', '3/14/2026', '4:00 PM', 'Uru Cure RC', 'La Tablada'],
    ['2', '3/21/2026', '3:30 PM', 'Jockey Club Cba', 'Uru Cure RC'],
    ['2', '3/21/2026', '4:00 PM', 'La Tablada', 'Tala R.C.'],
  ];
  assertFixture(importMatches(write(book([['Fixtures', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('en portugués: Rodada, Data, Horário, Mandante, Visitante', () => {
  const aoa: SheetCell[][] = [
    ['Rodada', 'Data', 'Horário', 'Mandante', 'Visitante'],
    ...TABLE.slice(1),
  ];
  assertFixture(importMatches(write(book([['Tabela', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('«Equipo | Equipo»: la primera columna es el local', () => {
  const aoa: SheetCell[][] = [
    ['Fecha N°', 'Día', 'Hora', 'Equipo', 'Equipo'],
    ...TABLE.slice(1),
  ];
  assertFixture(importMatches(write(book([['F', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('el partido en una celda, con fecha y hora juntas', () => {
  const aoa: SheetCell[][] = [
    ['Jornada', 'Fecha y hora', 'Partido'],
    [1, 'Sáb 14/03/2026 15:30', 'Tala R.C. vs Jockey Club Cba'],
    [1, 'Sáb 14/03/2026 16:00', 'Uru Cure RC vs La Tablada'],
    [2, 'Sáb 21/03/2026 15:30', 'Jockey Club Cba vs Uru Cure RC'],
    [2, 'Sáb 21/03/2026 16:00', 'La Tablada vs Tala R.C.'],
  ];
  assertFixture(importMatches(write(book([['F', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('rótulos de sección: «FECHA 1 – 14/03» en una fila y los partidos abajo', () => {
  const aoa: SheetCell[][] = [
    ['Hora', 'Local', 'Visitante'],
    ['FECHA 1', d(14)],
    [t(15, 30), 'Tala R.C.', 'Jockey Club Cba'],
    [t(16, 0), 'Uru Cure RC', 'La Tablada'],
    ['FECHA 2', d(21)],
    [t(15, 30), 'Jockey Club Cba', 'Uru Cure RC'],
    [t(16, 0), 'La Tablada', 'Tala R.C.'],
  ];
  assertFixture(importMatches(write(book([['F', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('una hoja por fecha, con una hoja de posiciones y una oculta', () => {
  const sheet = (rows: SheetCell[][]) => [['Día', 'Hora', 'Local', 'Visitante'], ...rows];
  const wb = book([
    ['Fecha 1', sheet([[d(14), t(15, 30), 'Tala R.C.', 'Jockey Club Cba'], [d(14), t(16, 0), 'Uru Cure RC', 'La Tablada']])],
    ['Fecha 2', sheet([[d(21), t(15, 30), 'Jockey Club Cba', 'Uru Cure RC'], [d(21), t(16, 0), 'La Tablada', 'Tala R.C.']])],
    ['Posiciones', [['Pos', 'Club', 'Pts'], [1, 'Tala R.C.', 10]]],
    ['Borrador', sheet([[d(28), t(9, 0), 'Tala R.C.', 'Uru Cure RC']])],
  ], (workbook) => {
    workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] } as XLSX.WBProps;
  });
  const bytes = write(wb, 'xlsx');
  assert.deepEqual(readWorkbook(bytes, 'spreadsheet').hiddenSheets, ['Borrador']);
  assertFixture(importMatches(bytes, 'spreadsheet'));
});

test('una hoja por zona: la zona sale del nombre de la hoja', () => {
  const sheet = (rows: SheetCell[][]) => [['Fecha N°', 'Día', 'Hora', 'Local', 'Visitante'], ...rows];
  const wb = book([
    ['Zona A', sheet([TABLE[1], TABLE[3]])],
    ['Zona B', sheet([TABLE[2], TABLE[4]])],
  ]);
  const matches = importMatches(write(wb, 'xlsx'), 'spreadsheet');
  assertFixture(matches);
  assert.deepEqual(
    matches.map((match) => `${match.home}:${match.group}`).sort(),
    ['jockey:Zona A', 'tablada:Zona B', 'tala:Zona A', 'uru:Zona B'],
  );
});

test('dos tablas lado a lado (Zona A | Zona B) con su rótulo arriba', () => {
  const header = ['Fecha N°', 'Día', 'Hora', 'Local', 'Visitante'];
  const aoa: SheetCell[][] = [
    ['ZONA A', null, null, null, null, null, 'ZONA B'],
    [...header, null, ...header],
    [...TABLE[1], null, ...TABLE[2]],
    [...TABLE[3], null, ...TABLE[4]],
  ];
  const matches = importMatches(write(book([['Zonas', aoa]]), 'xlsx'), 'spreadsheet');
  assertFixture(matches);
  assert.deepEqual(matches.filter((match) => match.group === 'Zona B').map((match) => match.home).sort(), ['tablada', 'uru']);
});

test('bloques por fecha lado a lado, sin encabezados de columna', () => {
  const aoa: SheetCell[][] = [
    ['FECHA 1', d(14), null, null, null, 'FECHA 2', d(21)],
    ['Tala R.C.', 'Jockey Club Cba', t(15, 30), null, null, 'Jockey Club Cba', 'Uru Cure RC', t(15, 30)],
    ['Uru Cure RC', 'La Tablada', t(16, 0), null, null, 'La Tablada', 'Tala R.C.', t(16, 0)],
  ];
  assertFixture(importMatches(write(book([['F', aoa]]), 'xlsx'), 'spreadsheet'));
});

test('bloques de la Unión Cordobesa: sorteo al costado y números de cruce', () => {
  const aoa: SheetCell[][] = [
    [null, 'SORTEO', null, 'Cruces', null, null, 'FECHA 1', d(14)],
    [1, 'Tala R.C.', null, 1, 2, 1, 'Tala R.C.', 'Jockey Club Cba', 2],
    [2, 'Jockey Club Cba', null, 3, 4, 3, 'Uru Cure RC', 'La Tablada', 4],
    [3, 'Uru Cure RC'],
    [4, 'La Tablada', null, 'Cruces', null, null, 'FECHA 2', d(21)],
    [null, null, null, 2, 3, 2, 'Jockey Club Cba', 'Uru Cure RC', 3],
    [null, null, null, 4, 1, 4, 'La Tablada', 'Tala R.C.', 1],
    [null, null, null, null, null, null, 'Fecha Libre', d(28)],
  ];
  // Esta planilla no trae horas.
  assertFixture(importMatches(write(book([['Primera', aoa]]), 'xlsx'), 'spreadsheet'), ['round', 'date', 'home', 'away']);
});

test('tabla de doble entrada: fila local, columna visitante, fecha y hora en el cruce', () => {
  const aoa: SheetCell[][] = [
    [null, 'Tala R.C.', 'Jockey Club Cba', 'Uru Cure RC', 'La Tablada'],
    ['Tala R.C.', 'X', new Date(2026, 2, 14, 15, 30), null, null],
    ['Jockey Club Cba', null, 'X', new Date(2026, 2, 21, 15, 30), null],
    ['Uru Cure RC', null, null, 'X', new Date(2026, 2, 14, 16, 0)],
    ['La Tablada', new Date(2026, 2, 21, 16, 0), null, null, 'X'],
  ];
  assertFixture(importMatches(write(book([['Cruces', aoa]]), 'xlsx'), 'spreadsheet'), ['date', 'home', 'away', 'time']);
});

test('tabla de doble entrada con el número de fecha en el cruce', () => {
  const aoa: SheetCell[][] = [
    ['', 'Tala', 'Jockey Club Cba', 'Uru Cure', 'La Tablada'],
    ['Tala', '-', 1, '', ''],
    ['Jockey Club Cba', '', '-', 2, ''],
    ['Uru Cure', '', '', '-', 1],
    ['La Tablada', 2, '', '', '-'],
  ];
  assertFixture(importMatches(write(book([['Cruces', aoa]]), 'xlsx'), 'spreadsheet'), ['round', 'home', 'away']);
});

test('un archivo que no es planilla no revienta: devuelve un motivo legible', () => {
  const read = readWorkbook(Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0, 1, 2, 3]), 'spreadsheet');
  assert.ok(read.error === null || typeof read.error === 'string');
});
