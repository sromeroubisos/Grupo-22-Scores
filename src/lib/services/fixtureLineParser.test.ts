import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractGroupLabel,
  extractRoundLabel,
  normalizeDateToken,
  normalizeTimeToken,
  parseFixtureText,
} from './fixtureLineParser.ts';

// ─── El caso que motivó todo esto ──────────────────────────────────────────
//
// El fixture real no repite la jornada en cada línea: la declara una vez y las
// líneas que siguen la heredan. Antes esto producía dos errores a la vez —un
// partido fantasma llamado «Fecha 1» y cuatro partidos sin jornada—, así que es
// el primer test y el que no se puede aflojar.

test('un encabezado de jornada se hereda hacia abajo y no genera un partido', () => {
  const parsed = parseFixtureText(`
Fecha 1
19/03/2026 - Jockey Club vs Tala RC - 16:30 - Cancha 1
19/03/2026 - CRAI vs Estudiantes - 18:00 - Cancha 2

Fecha 2
26/03/2026 - Tala RC vs CRAI - 16:30 - Cancha 1
`);

  assert.equal(parsed.rows.length, 3, 'los encabezados no son partidos');
  assert.deepEqual(parsed.detectedRounds, ['Fecha 1', 'Fecha 2']);

  assert.deepEqual(
    parsed.rows.map((row) => row.round),
    ['Fecha 1', 'Fecha 1', 'Fecha 2'],
  );
  assert.deepEqual(
    parsed.rows.map((row) => [row.homeTeam, row.awayTeam]),
    [['Jockey Club', 'Tala RC'], ['CRAI', 'Estudiantes'], ['Tala RC', 'CRAI']],
  );

  // La herencia se declara, para que el preview pueda mostrarla.
  assert.deepEqual(parsed.rows.map((row) => row.roundInherited), [true, true, true]);
});

test('la jornada escrita en la línea le gana a la del encabezado', () => {
  const parsed = parseFixtureText(`
Fecha 1
19/03/2026 - Jockey Club vs Tala RC - 16:30
Fecha 7 - 20/03/2026 - CRAI vs Estudiantes - 18:00
19/03/2026 - Duendes vs Old Resian - 20:00
`);

  assert.deepEqual(parsed.rows.map((row) => row.round), ['Fecha 1', 'Fecha 7', 'Fecha 1']);
  // Y no arrastra: la línea siguiente vuelve a la sección, no queda en Fecha 7.
  assert.equal(parsed.rows[2].roundInherited, true);
});

test('un encabezado con fecha fija el día de toda la sección', () => {
  const parsed = parseFixtureText(`
Fecha 3 - 09/04/2026
Jockey Club vs Tala RC - 16:30
CRAI vs Estudiantes - 18:00
`);

  assert.deepEqual(parsed.rows.map((row) => row.matchDate), ['2026-04-09', '2026-04-09']);
  assert.deepEqual(parsed.rows.map((row) => row.dateInherited), [true, true]);
  assert.deepEqual(parsed.rows.map((row) => row.round), ['Fecha 3', 'Fecha 3']);
});

test('una fecha suelta como título también se hereda', () => {
  const parsed = parseFixtureText(`
Sábado 19/03/2026
Jockey Club vs Tala RC - 16:30
Domingo 20/03/2026
CRAI vs Estudiantes - 18:00
`);

  assert.deepEqual(parsed.rows.map((row) => row.matchDate), ['2026-03-19', '2026-03-20']);
});

// ─── Cómo se escribe una jornada en la vida real ───────────────────────────

test('reconoce las formas usuales de nombrar una jornada', () => {
  const cases: Array<[string, string]> = [
    ['Fecha 1', 'Fecha 1'],
    ['FECHA 12', 'Fecha 12'],
    ['Jornada 3', 'Fecha 3'],
    ['Round 4', 'Fecha 4'],
    ['Matchday 5', 'Fecha 5'],
    ['Fecha N° 6', 'Fecha 6'],
    ['Fecha Nro 7', 'Fecha 7'],
    ['1ª Fecha', 'Fecha 1'],
    ['3° fecha', 'Fecha 3'],
    ['2da fecha', 'Fecha 2'],
    ['--- Fecha 8 ---', 'Fecha 8'],
    ['## Fecha 9', 'Fecha 9'],
    ['Fecha 10:', 'Fecha 10'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(extractRoundLabel(input), expected, `no reconoció «${input}»`);
  }
});

test('se normaliza a `Fecha N` para que matchee con la jornada existente', () => {
  // `buildRoundAliases` en fixtureImportService espera esta forma canónica.
  // Si esto cambia, una fuente que dice «Jornada 3» crea una jornada nueva en
  // vez de engancharse con la que ya está.
  assert.equal(extractRoundLabel('Jornada 3'), 'Fecha 3');
  assert.equal(extractRoundLabel('Round 3'), 'Fecha 3');
  assert.equal(extractRoundLabel('3ra fecha'), 'Fecha 3');
});

test('no inventa una jornada donde no la hay', () => {
  assert.equal(extractRoundLabel('Jockey Club vs Tala RC'), null);
  assert.equal(extractRoundLabel('Cancha 1'), null);
  assert.equal(extractRoundLabel('16:30'), null);
});

// ─── Zonas ─────────────────────────────────────────────────────────────────

test('detecta la zona y la hereda igual que la jornada', () => {
  const parsed = parseFixtureText(`
Zona A
Jockey Club vs Tala RC
CRAI vs Estudiantes
Zona B
Duendes vs Old Resian
`);

  assert.deepEqual(parsed.detectedGroups, ['Zona A', 'Zona B']);
  assert.deepEqual(parsed.rows.map((row) => row.group), ['Zona A', 'Zona A', 'Zona B']);
  assert.equal(parsed.rows.length, 3);
});

test('«Grupo de partidos» no es una zona', () => {
  assert.equal(extractGroupLabel('Grupo de partidos pendientes'), null);
});

// ─── Fecha y hora ──────────────────────────────────────────────────────────

test('la fecha se lee con el día primero, como se escribe acá', () => {
  assert.equal(normalizeDateToken('19/03/2026'), '2026-03-19');
  assert.equal(normalizeDateToken('19-03-2026'), '2026-03-19');
  assert.equal(normalizeDateToken('19.03.2026'), '2026-03-19');
  assert.equal(normalizeDateToken('19/03/26'), '2026-03-19');
  // 03 no puede ser el día si el primero es 19: día primero, siempre.
  assert.equal(normalizeDateToken('05/11/2026'), '2026-11-05');
});

test('la fecha en palabras también entra', () => {
  assert.equal(normalizeDateToken('19 de marzo de 2026'), '2026-03-19');
  assert.equal(normalizeDateToken('19 mar 2026'), '2026-03-19');
});

test('rechaza fechas imposibles en vez de inventarlas', () => {
  assert.equal(normalizeDateToken('45/03/2026'), null);
  assert.equal(normalizeDateToken('19/19/2026'), null);
});

test('la hora acepta las formas que se escriben a mano', () => {
  assert.equal(normalizeTimeToken('16:30'), '16:30');
  assert.equal(normalizeTimeToken('16.30'), '16:30');
  assert.equal(normalizeTimeToken('16hs'), '16:00');
  assert.equal(normalizeTimeToken('9:05'), '09:05');
  assert.equal(normalizeTimeToken('25:00'), null);
});

// ─── Ruido de la fuente ────────────────────────────────────────────────────

test('el encabezado de columnas de una planilla pegada no es un partido', () => {
  const parsed = parseFixtureText(`
Local | Visitante | Hora | Cancha
Jockey Club | Tala RC | 16:30 | Cancha 1
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].homeTeam, 'Jockey Club');
  assert.equal(parsed.rows[0].awayTeam, 'Tala RC');
  assert.equal(parsed.rows[0].matchTime, '16:30');
});

test('las líneas sin equipos se reportan en vez de desaparecer', () => {
  const parsed = parseFixtureText(`
Fecha 1
Jockey Club vs Tala RC - 16:30
1234567
`);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.skippedLines.length, 1);
  assert.equal(parsed.skippedLines[0].lineNumber, 4);
});

test('el número de línea apunta al texto original, no a la fila resultante', () => {
  const parsed = parseFixtureText(`
Fecha 1

Jockey Club vs Tala RC
`);

  // línea 1 vacía, 2 encabezado, 3 vacía, 4 el partido
  assert.equal(parsed.rows[0].lineNumber, 4);
});

// ─── Resultado ─────────────────────────────────────────────────────────────

test('un marcador en la línea la marca como finalizada', () => {
  const parsed = parseFixtureText('Fecha 1 - Jockey Club 25 - 13 Tala RC');

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].score, '25-13');
  assert.equal(parsed.rows[0].status, 'final');
});

test('la hora no se confunde con un marcador', () => {
  const parsed = parseFixtureText('19/03/2026 - Jockey Club vs Tala RC - 16:30 - Cancha 1');

  assert.equal(parsed.rows[0].score, null);
  assert.equal(parsed.rows[0].status, 'scheduled');
  assert.equal(parsed.rows[0].matchTime, '16:30');
});

// ─── Separadores ───────────────────────────────────────────────────────────

test('acepta vs, v y x como separador de equipos', () => {
  for (const separator of ['vs', 'vs.', 'v', 'x', 'VS']) {
    const parsed = parseFixtureText(`Jockey Club ${separator} Tala RC`);
    assert.equal(parsed.rows[0]?.homeTeam, 'Jockey Club', `falló con «${separator}»`);
    assert.equal(parsed.rows[0]?.awayTeam, 'Tala RC', `falló con «${separator}»`);
  }
});

test('acepta una planilla pegada con tabulaciones', () => {
  const parsed = parseFixtureText('Fecha 1\tJockey Club\tTala RC\t16:30');

  assert.equal(parsed.rows[0].round, 'Fecha 1');
  assert.equal(parsed.rows[0].homeTeam, 'Jockey Club');
  assert.equal(parsed.rows[0].awayTeam, 'Tala RC');
  assert.equal(parsed.rows[0].matchTime, '16:30');
});

// ─── El pegado de WhatsApp ─────────────────────────────────────────────────
//
// Es una de las dos fuentes que el asistente ofrece, y se escribe distinto que
// una planilla: la hora con punto y un «hs» detrás, la jornada con asteriscos,
// el día de la semana como título.

test('un pegado de WhatsApp entero, con todo lo que trae', () => {
  const parsed = parseFixtureText(`*3ª FECHA*
Sábado 09/04/2026
Duendes vs Old Resian 16.30 hs
Jockey Club vs CRAI 18 hs`);

  assert.deepEqual(parsed.detectedRounds, ['Fecha 3']);
  assert.equal(parsed.rows.length, 2);

  assert.deepEqual(parsed.rows.map((row) => row.round), ['Fecha 3', 'Fecha 3']);
  assert.deepEqual(parsed.rows.map((row) => row.matchDate), ['2026-04-09', '2026-04-09']);
  assert.deepEqual(parsed.rows.map((row) => row.matchTime), ['16:30', '18:00']);
  assert.deepEqual(
    parsed.rows.map((row) => [row.homeTeam, row.awayTeam]),
    [['Duendes', 'Old Resian'], ['Jockey Club', 'CRAI']],
  );
});

test('`16.30` es una hora, no el 30 del mes 16', () => {
  // `DATE_RE` matchea `16.30` igual que `19.03`. Borrarlo a ciegas se comía la
  // hora Y dejaba el «hs» huérfano pegado al nombre del club.
  const parsed = parseFixtureText('Duendes vs Old Resian 16.30 hs');

  assert.equal(parsed.rows[0].matchTime, '16:30');
  assert.equal(parsed.rows[0].matchDate, null);
  assert.equal(parsed.rows[0].awayTeam, 'Old Resian', 'el «hs» no es parte del club');
});

test('pero `19.03.2026` sigue siendo una fecha', () => {
  const parsed = parseFixtureText('Duendes vs Old Resian 19.03.2026 16:30');

  assert.equal(parsed.rows[0].matchDate, '2026-03-19');
  assert.equal(parsed.rows[0].matchTime, '16:30');
  assert.equal(parsed.rows[0].awayTeam, 'Old Resian');
});

// ─── Tolerancia al OCR ─────────────────────────────────────────────────────
//
// Medido con una imagen de fixture al 87% de confianza: el reconocimiento leyó
// «VS» como «US» en TODAS las líneas. Sin tolerancia, los dos clubes quedan
// pegados en un solo nombre y la fila llega al preview sin arreglo posible.

test('en modo OCR, un «vs» mal reconocido igual separa a los clubes', () => {
  const line = '19/03/2026 - JOCKEY CLUB US TALA RC - 16:30';

  const strict = parseFixtureText(line);
  assert.equal(strict.rows[0].awayTeam, null, 'sin tolerancia queda pegado');

  const tolerant = parseFixtureText(line, { ocrTolerant: true });
  assert.equal(tolerant.rows[0].homeTeam, 'JOCKEY CLUB');
  assert.equal(tolerant.rows[0].awayTeam, 'TALA RC');
});

test('la tolerancia NO se aplica al texto tipeado', () => {
  // «US Colomiers» es un club de verdad. Aflojar el separador en texto escrito a
  // mano lo partiría al medio, así que el modo estricto tiene que dejarlo entero.
  const parsed = parseFixtureText('Jockey Club vs US Colomiers');

  assert.equal(parsed.rows[0].homeTeam, 'Jockey Club');
  assert.equal(parsed.rows[0].awayTeam, 'US Colomiers');
});

test('una fecha que el OCR arruinó queda vacía en vez de inventada', () => {
  // El OCR leyó «19/03/2026» como «19/83/7876». El mes 83 no existe: la fila
  // llega al preview sin fecha, para que se corrija a mano. Importar una fecha
  // inventada sería mucho peor que no traer ninguna.
  const parsed = parseFixtureText('19/83/7876 - JOCKEY CLUB US TALA RC - 16:30', {
    ocrTolerant: true,
  });

  assert.equal(parsed.rows[0].matchDate, null);
  assert.equal(parsed.rows[0].homeTeam, 'JOCKEY CLUB');
});

// ─── El nombre del club se conserva entero ─────────────────────────────────

test('no se come partes del nombre del club al limpiar la línea', () => {
  const parsed = parseFixtureText(`
Fecha 2 - 26/03/2026 - Old Resian vs Universitario de Rosario - 16:30 - Cancha 1
`);

  assert.equal(parsed.rows[0].homeTeam, 'Old Resian');
  assert.equal(parsed.rows[0].awayTeam, 'Universitario de Rosario');
});
