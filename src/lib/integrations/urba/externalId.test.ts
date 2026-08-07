import test from 'node:test';
import assert from 'node:assert/strict';

import {
  URBA_CATEGORIAS,
  URBA_ID_PREFIX,
  URBA_PROVIDER,
  buildUrbaExternalId,
  categoriaDeTorneoUrba,
  buildUrbaMatchExternalId,
  buildUrbaSeriesKey,
  buildUrbaTournamentExternalId,
  extractSufijoFromTeamName,
  normalizeTournamentName,
  parseUrbaExternalId,
  parseUrbaId,
  parseUrbaSeriesKey,
} from './externalId.ts';

/**
 * El triple (club, categoría, sufijo) es lo único que identifica a un equipo de
 * URBA. Lo que se prueba acá es que la serialización sea ESTABLE: el CSV de mapeo
 * y el resolvedor de partidos de la sync arman la misma cadena o el partido no
 * encuentra su club — y ese fallo es silencioso, no tira error.
 */

test('provider', () => {
  assert.equal(URBA_PROVIDER, 'urba');
});

/**
 * Los siete equipos de GEBA (club_id 30). Es el caso que rompía el esquema viejo:
 * con UNIQUE (club_id, provider) el import se caía en la sexta fila. Las siete
 * cadenas tienen que ser distintas entre sí y apuntar todas al mismo club.
 */
test('los 7 casos de GEBA producen 7 external_id distintos', () => {
  const geba = [
    { categoria: 'mayores', sufijo: '', esperado: '30|mayores|' },
    { categoria: 'mayores', sufijo: 'C', esperado: '30|mayores|C' },
    { categoria: 'intermedia', sufijo: '', esperado: '30|intermedia|' },
    { categoria: 'preintermedia', sufijo: '', esperado: '30|preintermedia|' },
    { categoria: 'preintermedia', sufijo: 'B', esperado: '30|preintermedia|B' },
    { categoria: 'preintermedia', sufijo: 'C', esperado: '30|preintermedia|C' },
    { categoria: 'preintermedia', sufijo: 'D', esperado: '30|preintermedia|D' },
  ];

  for (const caso of geba) {
    assert.equal(
      buildUrbaExternalId({ urbaClubId: 30, categoria: caso.categoria, sufijo: caso.sufijo }),
      caso.esperado,
    );
  }

  const ids = new Set(geba.map((c) => c.esperado));
  assert.equal(ids.size, 7, 'los 7 external_id de GEBA tienen que ser distintos');
});

test('sin sufijo: queda string vacío después del último separador', () => {
  const id = buildUrbaExternalId({ urbaClubId: 5, categoria: 'M22', sufijo: '' });
  assert.equal(id, '5|M22|');
  assert.equal(parseUrbaExternalId(id)?.sufijo, '');
});

/** No inventar la "A" es una regla de negocio, no un detalle de formato. */
test('sin sufijo NO se completa con "A"', () => {
  const sinLetra = buildUrbaExternalId({ urbaClubId: 5, categoria: 'M15', sufijo: '' });
  const conA = buildUrbaExternalId({ urbaClubId: 5, categoria: 'M15', sufijo: 'A' });
  assert.notEqual(sinLetra, conA);
  assert.equal(sinLetra, '5|M15|');
});

test('null y undefined entran como ausencia de sufijo y salen como vacío', () => {
  assert.equal(buildUrbaExternalId({ urbaClubId: 5, categoria: 'M15', sufijo: null }), '5|M15|');
  assert.equal(buildUrbaExternalId({ urbaClubId: 5, categoria: 'M15' }), '5|M15|');
});

/** Newman H, TOP 14 - Preintermedia F, 2026: el sufijo más alto que existe. */
test('sufijo H (el tope real observado)', () => {
  const id = buildUrbaExternalId({ urbaClubId: 9, categoria: 'preintermedia', sufijo: 'H' });
  assert.equal(id, '9|preintermedia|H');
  assert.deepEqual(parseUrbaExternalId(id), { urbaClubId: 9, categoria: 'preintermedia', sufijo: 'H' });
});

test('una de cada categoría', () => {
  const esperados: Record<string, string> = {
    mayores: '1|mayores|A',
    intermedia: '1|intermedia|A',
    preintermedia: '1|preintermedia|A',
    femenino: '1|femenino|A',
    universitario: '1|universitario|A',
    formativo: '1|formativo|A',
    empresarial: '1|empresarial|A',
    M15: '1|M15|A',
    M16: '1|M16|A',
    M17: '1|M17|A',
    M18: '1|M18|A',
    M19: '1|M19|A',
    M20: '1|M20|A',
    M22: '1|M22|A',
  };

  assert.equal(
    URBA_CATEGORIAS.length,
    Object.keys(esperados).length,
    'si agregás una categoría, agregala también acá',
  );

  for (const categoria of URBA_CATEGORIAS) {
    assert.equal(buildUrbaExternalId({ urbaClubId: 1, categoria, sufijo: 'A' }), esperados[categoria]);
  }
});

test('round-trip build -> parse para todas las categorías y sufijos', () => {
  for (const categoria of URBA_CATEGORIAS) {
    for (const sufijo of ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const id = buildUrbaExternalId({ urbaClubId: 42, categoria, sufijo });
      assert.deepEqual(parseUrbaExternalId(id), { urbaClubId: 42, categoria, sufijo });
    }
  }
});

test('el club_id se normaliza: "30" y 30 dan lo mismo', () => {
  assert.equal(
    buildUrbaExternalId({ urbaClubId: '30', categoria: 'mayores', sufijo: '' }),
    buildUrbaExternalId({ urbaClubId: 30, categoria: 'mayores', sufijo: '' }),
  );
});

test('el sufijo se normaliza a mayúscula', () => {
  assert.equal(buildUrbaExternalId({ urbaClubId: 1, categoria: 'M17', sufijo: 'b' }), '1|M17|B');
});

test('rechaza entradas que no resolverían contra ningún club', () => {
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 0, categoria: 'mayores', sufijo: '' }), /urba_club_id/);
  assert.throws(() => buildUrbaExternalId({ urbaClubId: -1, categoria: 'mayores', sufijo: '' }), /urba_club_id/);
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 1.5, categoria: 'mayores', sufijo: '' }), /urba_club_id/);
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 'x', categoria: 'mayores', sufijo: '' }), /urba_club_id/);
  // "Mayores" con mayúscula no es la categoría canónica: si pasara, el partido
  // no encontraría su club y nadie se enteraría.
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 1, categoria: 'Mayores', sufijo: '' }), /categoría/);
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 1, categoria: 'M21', sufijo: '' }), /categoría/);
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 1, categoria: 'mayores', sufijo: 'Z' }), /sufijo/);
  assert.throws(() => buildUrbaExternalId({ urbaClubId: 1, categoria: 'mayores', sufijo: 'AB' }), /sufijo/);
});

test('parse devuelve null en vez de basura', () => {
  assert.equal(parseUrbaExternalId('30|mayores'), null);
  assert.equal(parseUrbaExternalId('30|mayores|B|extra'), null);
  assert.equal(parseUrbaExternalId('30|Mayores|'), null);
  assert.equal(parseUrbaExternalId(''), null);
  assert.equal(parseUrbaExternalId('fs-12345'), null);
  assert.equal(parseUrbaExternalId(undefined as unknown as string), null);
});

test('extractSufijoFromTeamName lee la letra del nombre publicado', () => {
  assert.equal(extractSufijoFromTeamName('SIC A'), 'A');
  assert.equal(extractSufijoFromTeamName('Hindu D'), 'D');
  assert.equal(extractSufijoFromTeamName('Newman H'), 'H');
  assert.equal(extractSufijoFromTeamName('Regatas B. Vista A'), 'A');
  // Sin letra final: es un dato, no un faltante.
  assert.equal(extractSufijoFromTeamName('La Plata'), '');
  assert.equal(extractSufijoFromTeamName('Los Matreros'), '');
  // Trampas reales del padrón: no son sufijos.
  assert.equal(extractSufijoFromTeamName('Buenos Aires C&RC'), '');
  assert.equal(extractSufijoFromTeamName('Gimnasia y Esgrima Bs. As'), '');
  assert.equal(extractSufijoFromTeamName('Blue XV'), '');
  assert.equal(extractSufijoFromTeamName('Varela Jr.'), '');
});

/* ────────────────────────────────────────────────────────────────────────────
 * TORNEOS Y PARTIDOS
 *
 * Acá el riesgo es el inverso al del triple: la cadena es trivial de armar, y
 * justamente por eso invita a escribirla a mano en el conector (`'urba:' + id`).
 * Si eso pasa, el día que la convención cambie se desincroniza en silencio. Estos
 * tests existen para que haya UN solo lugar donde el prefijo está escrito.
 * ──────────────────────────────────────────────────────────────────────────── */

test('external_id de torneo: prefijo urba: + id', () => {
  assert.equal(buildUrbaTournamentExternalId(2025176), 'urba:2025176');
  assert.equal(buildUrbaTournamentExternalId('2025176'), 'urba:2025176');
  // TOP 14 - Superior 2026, el torneo real del que salió el sondeo.
  assert.equal(buildUrbaTournamentExternalId(2025176), `${URBA_ID_PREFIX}2025176`);
});

test('external_id de partido: la MISMA convención que el torneo', () => {
  assert.equal(buildUrbaMatchExternalId(2023134558), 'urba:2023134558');
  // Un solo prefijo que aprender: si divergieran, el conector tendría que
  // recordar cuál va en cada tabla y ese es el tipo de detalle que se olvida.
  assert.equal(
    buildUrbaMatchExternalId(99).slice(0, URBA_ID_PREFIX.length),
    buildUrbaTournamentExternalId(99).slice(0, URBA_ID_PREFIX.length),
  );
});

test('el prefijo NO es decorativo: distingue proveedores en una columna compartida', () => {
  // tournaments.external_id no tiene columna `provider`. Sin prefijo, el id
  // numérico de URBA podría chocar con el de otro proveedor bajo el UNIQUE parcial.
  assert.equal(parseUrbaId('urba:2025176'), 2025176);
  assert.equal(parseUrbaId('fs-2025176'), null);
  assert.equal(parseUrbaId('espn-2025176'), null);
  assert.equal(parseUrbaId('2025176'), null);
});

test('parseUrbaId devuelve null en vez de NaN ante basura', () => {
  assert.equal(parseUrbaId('urba:'), null);
  assert.equal(parseUrbaId('urba:abc'), null);
  assert.equal(parseUrbaId('urba:-5'), null);
  assert.equal(parseUrbaId('urba:1.5'), null);
  assert.equal(parseUrbaId('urba:2025176 '), null);
  assert.equal(parseUrbaId(''), null);
  assert.equal(parseUrbaId(null as unknown as string), null);
});

test('ida y vuelta sobre los ids reales del sondeo', () => {
  for (const id of [2025176, 2025177, 2025184, 2023134558, 202517028]) {
    assert.equal(parseUrbaId(buildUrbaTournamentExternalId(id)), id);
    assert.equal(parseUrbaId(buildUrbaMatchExternalId(id)), id);
  }
});

test('un id que no resolvería tira, no devuelve una cadena rota', () => {
  assert.throws(() => buildUrbaTournamentExternalId(0));
  assert.throws(() => buildUrbaTournamentExternalId(-1));
  assert.throws(() => buildUrbaTournamentExternalId('abc'));
  assert.throws(() => buildUrbaTournamentExternalId(1.5));
  assert.throws(() => buildUrbaMatchExternalId(''));
});

/* ────────────────────────────────────────────────────────────────────────────
 * NOMBRE NORMALIZADO
 *
 * Los dos lados del cruce usan esta función. Si alguien la "mejora" sacando
 * artículos o reordenando palabras, el LEFT JOIN deja de encontrar y el
 * resultado se lee como "no existe" en vez de "no coincide". Estos tests fijan
 * que la transformación siga siendo mínima.
 * ──────────────────────────────────────────────────────────────────────────── */

test('normalizeTournamentName: las cinco reglas, una por una', () => {
  assert.equal(normalizeTournamentName('TOP 14 - Superior'), 'top 14 - superior');   // minúsculas
  assert.equal(normalizeTournamentName('Menores de 17 - Fútbol'), 'menores de 17 - futbol'); // acentos
  assert.equal(normalizeTournamentName('Bs. As.'), 'bs as');                          // puntos
  assert.equal(normalizeTournamentName('Ciudad "B"'), 'ciudad b');                    // comillas
  assert.equal(normalizeTournamentName('TOP  14   -  Superior'), 'top 14 - superior');// espacios
  assert.equal(normalizeTournamentName('  Segunda  '), 'segunda');                    // trim
});

test('normalizeTournamentName: los puntos se borran, no dejan espacio', () => {
  // Si dejaran espacio, 'R.C.' daría 'r c' y no cruzaría contra 'rc'.
  assert.equal(normalizeTournamentName('Delta R.C.'), 'delta rc');
  assert.equal(normalizeTournamentName('C.U. de Quilmes'), 'cu de quilmes');
});

test('normalizeTournamentName: NO saca palabras ni reordena', () => {
  // La normalización es mínima a propósito: el cruce lo decide una persona.
  assert.equal(normalizeTournamentName('Menores de 19 - Primera Rueda - G2 NIVEL 1 A'),
    'menores de 19 - primera rueda - g2 nivel 1 a');
  assert.equal(normalizeTournamentName('Rugby Universitario - Campeonato'),
    'rugby universitario - campeonato');
  // Los guiones y los artículos se quedan donde estaban.
  assert.ok(normalizeTournamentName('Copa Oro del Oeste').includes('del'));
});

test('normalizeTournamentName: idempotente', () => {
  const casos = ['TOP 14 - Superior', 'Ciudad "B" - Damas', 'Bs. As.', '  Hindú  Club '];
  for (const c of casos) {
    const una = normalizeTournamentName(c);
    assert.equal(normalizeTournamentName(una), una, `no es idempotente para "${c}"`);
  }
});

test('normalizeTournamentName: null, undefined y vacío dan cadena vacía', () => {
  assert.equal(normalizeTournamentName(null), '');
  assert.equal(normalizeTournamentName(undefined), '');
  assert.equal(normalizeTournamentName('   '), '');
});

/* ────────────────────────────────────────────────────────────────────────────
 * CATEGORÍA DEL TORNEO
 *
 * Es la pieza del triple que NO viene en los datos del equipo. Leerla del campo
 * equivocado (`age_grade`, que es el corte de edad) hizo que 1.946 partidos no
 * encontraran su club en la primera corrida en seco.
 * ──────────────────────────────────────────────────────────────────────────── */

test('categoría: preintermedia NO es mayores — el bug de la primera corrida', () => {
  assert.equal(categoriaDeTorneoUrba('TOP 14 - Superior'), 'mayores');
  assert.equal(categoriaDeTorneoUrba('TOP 14 - Intermedia'), 'intermedia');
  assert.equal(categoriaDeTorneoUrba('TOP 14 - Preintermedia B'), 'preintermedia');
  assert.equal(categoriaDeTorneoUrba('PRIMERA A - Preintermedia D'), 'preintermedia');
  // Las tres comparten age_grade='mayores' en el staging: por eso no sirve.
});

test('categoría: los "Menores de N" ganan sobre cualquier otra palabra', () => {
  assert.equal(categoriaDeTorneoUrba('Menores de 17 - Primera Rueda - G2 NIVEL 1 A'), 'M17');
  // Dice "Intermedia" pero es M19: si ganara la otra rama, el triple sería otro.
  assert.equal(categoriaDeTorneoUrba('Menores de 19 - Segunda Rueda - G2 Nivel 1 Intermedia'), 'M19');
  assert.equal(categoriaDeTorneoUrba('TOP 14 - Menores de 22'), 'M22');
});

test('categoría: las tres convenciones de nombre del histórico', () => {
  assert.equal(categoriaDeTorneoUrba('Menores de 16 - Primera Rueda - G1 A'), 'M16');
  assert.equal(categoriaDeTorneoUrba('Juveniles - Primera rueda - M 16 - Grupo I - Zona A'), 'M16');
  assert.equal(categoriaDeTorneoUrba('Juveniles - Segunda Rueda - M16 - Grupo l'), 'M16');
});

test('categoría: competencias propias y divisiones sin sufijo', () => {
  assert.equal(categoriaDeTorneoUrba('FEMENINO - TOP 9'), 'femenino');
  assert.equal(categoriaDeTorneoUrba('Rugby Universitario - Campeonato'), 'universitario');
  assert.equal(categoriaDeTorneoUrba('Rugby Formativo - Campeonato'), 'formativo');
  assert.equal(categoriaDeTorneoUrba('Empresarial - Zona A'), 'empresarial');
  assert.equal(categoriaDeTorneoUrba('Segunda'), 'mayores');
  assert.equal(categoriaDeTorneoUrba('TOP 12 - Play Off'), 'mayores');
});

test('categoría: tolera el prefijo "URBA: " que llevan los torneos en G22', () => {
  assert.equal(categoriaDeTorneoUrba('URBA: TOP 14 - Preintermedia B'), 'preintermedia');
  assert.equal(categoriaDeTorneoUrba('URBA: Menores de 17 - Primera Rueda - G1 A'), 'M17');
});

test('categoría: devuelve null si no la puede derivar, no adivina', () => {
  assert.equal(categoriaDeTorneoUrba('Torneo Raro Sin Pistas'), null);
  assert.equal(categoriaDeTorneoUrba(''), null);
});

test('toda categoría derivada es válida para buildUrbaExternalId', () => {
  const nombres = ['TOP 14 - Superior', 'TOP 14 - Preintermedia B', 'Menores de 17 - Primera Rueda - G1 A',
    'FEMENINO - TOP 9', 'Empresarial - Zona A', 'Rugby Formativo - Campeonato'];
  for (const n of nombres) {
    const c = categoriaDeTorneoUrba(n);
    assert.ok(c, `no derivó categoría de "${n}"`);
    assert.doesNotThrow(() => buildUrbaExternalId({ urbaClubId: 1, categoria: c, sufijo: 'A' }));
  }
});

/* ────────────────────────────────────────────────────────────────────────────
 * LA SERIE
 *
 * El vínculo entre ruedas se guarda sólo donde el par es seguro. Estos tests
 * cuidan que la clave sea ESTABLE —el conector y el inventario tienen que armar
 * la misma— y que no se pueda fabricar una serie de la nada.
 * ──────────────────────────────────────────────────────────────────────────── */

test('la serie se ancla al id más bajo, venga en el orden que venga', () => {
  assert.equal(buildUrbaSeriesKey([2025261, 2025313]), 'urba:serie:2025261');
  assert.equal(buildUrbaSeriesKey([2025313, 2025261]), 'urba:serie:2025261');
  assert.equal(buildUrbaSeriesKey(['2025313', 2025261]), 'urba:serie:2025261');
});

test('una serie de un solo miembro es válida: la segunda rueda puede llegar después', () => {
  assert.equal(buildUrbaSeriesKey([2025261]), 'urba:serie:2025261');
});

test('la clave NO se deriva del nombre, que es lo único que URBA escribe distinto', () => {
  // Las dos mitades del mismo par tienen nombres distintos en 2024-2026. Si la
  // clave saliera del nombre, cada mitad armaría una serie diferente.
  assert.equal(buildUrbaSeriesKey([2025261, 2025313]), buildUrbaSeriesKey([2025313, 2025261]));
});

test('no se puede fabricar una serie de la nada', () => {
  assert.throws(() => buildUrbaSeriesKey([]));
  assert.throws(() => buildUrbaSeriesKey([0]));
  assert.throws(() => buildUrbaSeriesKey([-1]));
  assert.throws(() => buildUrbaSeriesKey(['abc']));
});

test('ida y vuelta de la serie, y no se confunde con un external_id de torneo', () => {
  assert.equal(parseUrbaSeriesKey(buildUrbaSeriesKey([2025261, 2025313])), 2025261);
  // 'urba:2025261' es un torneo, no una serie: el prefijo las separa.
  assert.equal(parseUrbaSeriesKey(buildUrbaTournamentExternalId(2025261)), null);
  assert.equal(parseUrbaId(buildUrbaSeriesKey([2025261])), null);
  assert.equal(parseUrbaSeriesKey('fs-2025261'), null);
  assert.equal(parseUrbaSeriesKey(''), null);
  assert.equal(parseUrbaSeriesKey(null as unknown as string), null);
});
