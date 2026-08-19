import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATCH_STATUS_PERMITIDOS,
  basePorPartido,
  bonusDeUrba,
  mapEstadoYResultado,
  planTournamentMatches,
  playdateToUtcIso,
} from './planMatches.ts';

const partido = (over: Partial<Parameters<typeof mapEstadoYResultado>[0]> = {}) => ({
  id: 1, playdate: '2026-03-14T00:00:00',
  local_team_id: 10, visit_team_id: 20,
  local_team_score: 0, visit_team_score: 0,
  fulfilled: false, suspended: false, ...over,
});

/* ── estado y resultado ─────────────────────────────────────────────────── */

test('fulfilled:true -> final con el resultado real', () => {
  const r = mapEstadoYResultado(partido({ fulfilled: true, local_team_score: 27, visit_team_score: 25 }));
  assert.deepEqual(r, { status: 'final', score: { home: 27, away: 25 } });
});

/**
 * El caso que ensucia las tablas: URBA manda los scores en CERO, no en null,
 * cuando el partido no se jugó. Escribirlos sería un 0-0 falso por cada fecha
 * futura — y hoy son 49 torneos enteros sin jugar.
 */
test('fulfilled:false con scores en 0 -> scheduled y score NULL, NO un 0-0', () => {
  const r = mapEstadoYResultado(partido({ fulfilled: false, local_team_score: 0, visit_team_score: 0 }));
  assert.equal(r.status, 'scheduled');
  assert.equal(r.score, null, 'un partido no jugado no puede llevar resultado');
});

/**
 * `fulfilled` quiere decir CERRADO, no jugado, y un cerrado sin marcador es un
 * partido sin resultado publicado. La tabla de URBA no lo cuenta, y acá se
 * espeja: contarlo como empate le daba 2 puntos por lado a dos clubes que en
 * `/api/positions` tienen 0.
 */
test('un 0-0 sin marcador no es un empate: no cuenta, igual que en la tabla de URBA', () => {
  const r = mapEstadoYResultado(partido({ fulfilled: true, local_team_score: 0, visit_team_score: 0 }));
  assert.equal(r.status, 'suspended');
  assert.equal(r.score, null);
});

/** Y en cuanto URBA carga el marcador, la pasada siguiente lo pasa a final. */
test('cargado el marcador, el mismo partido pasa a final solo', () => {
  const r = mapEstadoYResultado(partido({ fulfilled: true, local_team_score: 24, visit_team_score: 17 }));
  assert.deepEqual(r, { status: 'final', score: { home: 24, away: 17 } });
});

/** Un marcador que no es número no puede entrar en la columna: se espera. */
test('un marcador que no es número no se escribe como NaN', () => {
  const r = mapEstadoYResultado(partido({ fulfilled: true, local_team_score: 'x' as any, visit_team_score: 3 }));
  assert.equal(r.status, 'suspended');
  assert.equal(r.score, null);
});

/** Un 3-0 sí es un resultado: el cero de un solo lado no dispara nada. */
test('el cero de un solo lado es un resultado normal', () => {
  const r = mapEstadoYResultado(partido({ fulfilled: true, local_team_score: 3, visit_team_score: 0 }));
  assert.deepEqual(r, { status: 'final', score: { home: 3, away: 0 } });
});

test('suspended:true -> suspended y sin resultado', () => {
  const r = mapEstadoYResultado(partido({ suspended: true, local_team_score: 0, visit_team_score: 0 }));
  assert.deepEqual(r, { status: 'suspended', score: null });
});

/**
 * El caso que hacía que la tabla no cerrara contra la de URBA.
 *
 * URBA manda las dos banderas prendidas en un partido suspendido: `fulfilled`
 * quiere decir "cerrado", no "jugado". Con `fulfilled` primero, el partido
 * entraba como final con 0-0 —o sea, como un EMPATE— y repartía 2 puntos por
 * lado que la tabla de URBA no reparte.
 *
 * La forma exacta del payload está copiada de `urba:2023147236`, uno de los 58
 * de 2026 que vienen así.
 */
test('suspended gana sobre fulfilled: un suspendido no es un empate', () => {
  const r = mapEstadoYResultado(partido({
    fulfilled: true, suspended: true, local_team_score: 0, visit_team_score: 0,
  }));
  assert.equal(r.status, 'suspended', 'las dos banderas prendidas son un suspendido, no un final');
  assert.equal(r.score, null, 'un 0-0 de un suspendido no es un resultado');
});

/**
 * Y la contracara: el suspendido no reparte puntos base. Con `status: 'final'` y
 * 0-0, `basePorPartido` devolvía el empate —2 y 2— y ésos eran los puntos de más.
 */
test('un suspendido no reparte puntos base ni bonus', () => {
  const m = partido({ fulfilled: true, suspended: true, local_team_score: 0, visit_team_score: 0 });
  const { status, score } = mapEstadoYResultado(m);
  assert.deepEqual(basePorPartido(score, status), { home: 0, away: 0 });
  assert.equal(bonusDeUrba(m, status), null);
});

test('todo estado emitido está en el CHECK de matches.status', () => {
  const casos = [partido({ fulfilled: true }), partido({ suspended: true }), partido()];
  for (const c of casos) {
    assert.ok(
      (MATCH_STATUS_PERMITIDOS as readonly string[]).includes(mapEstadoYResultado(c).status),
      'un estado fuera del CHECK es un 23514 en la escritura',
    );
  }
  assert.ok(!(MATCH_STATUS_PERMITIDOS as readonly string[]).includes('cancelled'));
});

/* ── bonus ──────────────────────────────────────────────────────────────── */

/**
 * El bonus ofensivo es "4+ tries" y URBA no publica tries: o sale de este campo
 * o no sale. Sin él las tres tablas de verificación daban 0/14, 0/14 y 1/12 en
 * puntos contra /api/positions — CUBA perdía 11 puntos, La Plata 9.
 */
test('los cuatro bonus se suman por lado', () => {
  const b = bonusDeUrba(partido({
    local_team_offensive_bonus: 1, local_team_defensive_bonus: 0,
    visit_team_offensive_bonus: 0, visit_team_defensive_bonus: 1,
  }), 'final');
  assert.deepEqual(b, { home: 1, away: 1 });
});

test('un partido con ofensivo y defensivo del mismo lado suma 2', () => {
  const b = bonusDeUrba(partido({ local_team_offensive_bonus: 1, local_team_defensive_bonus: 1 }), 'final');
  assert.equal(b?.home, 2);
});

/**
 * Mismo veneno que los scores: `fulfilled: false` trae los cuatro campos en CERO,
 * no en null. Escribir un 0 en un partido futuro no es inocuo — deja la fila
 * marcada como puntaje cargado a mano, y el motor deja de derivar el base.
 */
test('un partido no jugado no lleva bonus, ni siquiera cero', () => {
  assert.equal(bonusDeUrba(partido({ local_team_offensive_bonus: 0 }), 'scheduled'), null);
  assert.equal(bonusDeUrba(partido(), 'suspended'), null);
});

test('un jugado sin bonus lleva cero, que NO es lo mismo que null', () => {
  assert.deepEqual(bonusDeUrba(partido({ fulfilled: true }), 'final'), { home: 0, away: 0 });
});

test('campos ausentes o basura no rompen: valen cero', () => {
  assert.deepEqual(bonusDeUrba(partido({ local_team_offensive_bonus: null, visit_team_offensive_bonus: undefined }), 'final'),
    { home: 0, away: 0 });
});

/* ── fechas ─────────────────────────────────────────────────────────────── */

/**
 * `playdate` es hora local de Buenos Aires (UTC-3) y siempre llega a medianoche.
 * Medianoche en Buenos Aires son las 03:00 UTC del MISMO día. Si se interpretara
 * como UTC, al mostrarlo en hora local caería el día anterior a las 21:00 — el
 * corrimiento que ya se cometió una vez.
 */
test('playdate se interpreta como Buenos Aires, no como UTC', () => {
  assert.equal(playdateToUtcIso('2026-03-14T00:00:00'), '2026-03-14T03:00:00.000Z');
});

test('el día calendario no se corre', () => {
  for (const d of ['2026-01-05', '2026-06-20', '2026-08-09', '2026-12-31']) {
    const iso = playdateToUtcIso(`${d}T00:00:00`);
    assert.ok(iso, `no convirtió ${d}`);
    assert.equal(iso.slice(0, 10), d, `${d} se corrió de día al convertir`);
  }
});

test('sin playdate no hay fecha: date_time es NOT NULL', () => {
  assert.equal(playdateToUtcIso(null), null);
  assert.equal(playdateToUtcIso(''), null);
  assert.equal(playdateToUtcIso(undefined), null);
});

/* ── horario por defecto cuando URBA no informa hora ────────────────────── */

/**
 * 15:30 de Buenos Aires son las 18:30Z del MISMO día. La trampa acá es la
 * inversa de la del playdate: si se escribiera 15:30 como UTC, el fixture lo
 * mostraría a las 12:30 hora local.
 */
test('Superior sin hora arranca 15:30 de Buenos Aires, o sea 18:30Z', () => {
  assert.equal(playdateToUtcIso('2026-08-15T00:00:00', 'Superior'), '2026-08-15T18:30:00.000Z');
});

test('con horario por defecto el día tampoco se corre', () => {
  for (const d of ['2026-01-05', '2026-06-20', '2026-08-09', '2026-12-31']) {
    const iso = playdateToUtcIso(`${d}T00:00:00`, 'Superior');
    assert.ok(iso, `no convirtió ${d}`);
    assert.equal(iso.slice(0, 10), d, `${d} se corrió de día`);
  }
});

/**
 * Lo que NO tiene horario definido se queda como viene. Inventarle uno a los
 * juveniles sería peor que la medianoche: un horario falso no se distingue de
 * uno real, y después nadie sabe cuál se puede corregir.
 */
test('las subcategorías sin horario definido quedan en la medianoche de URBA', () => {
  for (const sub of ['juvenil', 'Intermedia', 'Preintermedia B', 'M22', null, undefined, '']) {
    assert.equal(
      playdateToUtcIso('2026-08-15T00:00:00', sub),
      '2026-08-15T03:00:00.000Z',
      `${JSON.stringify(sub)} no debería recibir horario por defecto`,
    );
  }
});

/** El defecto se aplica sólo cuando falta el dato, no cuando URBA lo informa. */
test('si URBA informa una hora real, el defecto no la pisa', () => {
  assert.equal(playdateToUtcIso('2026-08-15T11:00:00', 'Superior'), '2026-08-15T14:00:00.000Z');
});

/**
 * El motivo por el que la regla vive en el conector y no en la base.
 *
 * Con el horario escrito sólo en la fila, la pasada siguiente del cron calcula
 * la medianoche de URBA, la ve distinta de lo guardado y la reescribe: la
 * corrección dura hasta la próxima corrida. Este test es el que prueba que las
 * dos puntas calculan lo mismo y el partido queda `sinCambios`.
 */
test('una segunda pasada del cron NO reescribe el horario por defecto', () => {
  const p = planTournamentMatches({
    championship: campeonato() as any,
    tournamentId: 'tid',
    categoria: 'M17',
    subcategory: 'Superior',
    resolverClub: resolver,
    existentes: new Map(),
  });
  assert.equal(p.crear.length, 1);
  assert.equal(p.crear[0].date_time, '2026-03-14T18:30:00.000Z');

  // Ahora esa misma fila ya está en la base y el cron vuelve a pasar.
  const segunda = planTournamentMatches({
    championship: campeonato() as any,
    tournamentId: 'tid',
    categoria: 'M17',
    subcategory: 'Superior',
    resolverClub: resolver,
    existentes: new Map([['urba:1', {
      date_time: p.crear[0].date_time,
      venue: null,
      status: p.crear[0].status,
      score: p.crear[0].score,
      round_label: p.crear[0].round_label,
    }]]),
  });
  assert.equal(segunda.sinCambios, 1, 'el horario por defecto se recalcula igual: no hay nada que escribir');
  assert.equal(segunda.actualizar.length, 0);
});

/* ── el plan completo ───────────────────────────────────────────────────── */

const campeonato = (over: any = {}) => ({
  teams: [
    { id: 10, club_id: 1, name: 'SIC A' },
    { id: 20, club_id: 6, name: 'Hindu A' },
    { id: 30, club_id: 99, name: 'Club Sin Mapear' },
    { id: 40, club_id: null, name: 'Bye' },
  ],
  rounds: [{ name: 'Fecha 1', matches: [partido()] }],
  ...over,
});

const resolver = (triple: string) => ({ '1|M17|A': 'san-isidro-club-m17-a', '6|M17|A': 'hindu-club-m17-a' } as Record<string, string>)[triple] ?? null;

const plan = (over: any = {}) => planTournamentMatches({
  championship: campeonato(over) as any,
  tournamentId: 'tid',
  categoria: 'M17',
  resolverClub: resolver,
  existentes: new Map(),
});

test('el camino feliz produce una fila con el triple resuelto', () => {
  const p = plan();
  assert.equal(p.crear.length, 1);
  assert.equal(p.crear[0].home_club_id, 'san-isidro-club-m17-a');
  assert.equal(p.crear[0].away_club_id, 'hindu-club-m17-a');
  assert.equal(p.crear[0].external_id, 'urba:1');
  assert.equal(p.crear[0].round_label, 'Fecha 1');
  assert.equal(p.crear[0].venue, null);
});

test('si UN equipo no resuelve, el partido NO se escribe y queda reportado', () => {
  const p = plan({ rounds: [{ name: 'Fecha 1', matches: [partido({ visit_team_id: 30 })] }] });
  assert.equal(p.crear.length, 0);
  assert.equal(p.omitidos.length, 1);
  assert.equal(p.omitidos[0].motivo, 'equipo_no_resuelto');
  assert.match(p.omitidos[0].detalle, /99\|M17\|/, 'el reporte tiene que decir qué triple falló');
});

test('Bye no es un club: se filtra y no cuenta como partido de URBA', () => {
  const p = plan({ rounds: [{ name: 'Fecha 1', matches: [partido({ visit_team_id: 40 })] }] });
  assert.equal(p.crear.length, 0);
  assert.equal(p.totalUrba, 0);
  assert.equal(p.omitidos[0].motivo, 'bye');
});

test('sin fecha no se escribe', () => {
  const p = plan({ rounds: [{ name: 'F1', matches: [partido({ playdate: null })] }] });
  assert.equal(p.crear.length, 0);
  assert.equal(p.omitidos[0].motivo, 'sin_fecha');
});

test('la categoría sale del TORNEO, no del equipo', () => {
  // Mismo payload, otra categoría -> otro triple -> ya no resuelve.
  const p = planTournamentMatches({
    championship: campeonato() as any, tournamentId: 'tid',
    categoria: 'M19', resolverClub: resolver, existentes: new Map(),
  });
  assert.equal(p.crear.length, 0);
  assert.equal(p.omitidos[0].motivo, 'equipo_no_resuelto');
});

test('lo que ya está igual no se actualiza', () => {
  const existentes = new Map([['urba:1', {
    date_time: '2026-03-14T03:00:00.000Z', venue: null,
    status: 'scheduled', score: null, round_label: 'Fecha 1',
  }]]);
  const p = planTournamentMatches({
    championship: campeonato() as any, tournamentId: 'tid',
    categoria: 'M17', resolverClub: resolver, existentes,
  });
  assert.equal(p.sinCambios, 1);
  assert.equal(p.actualizar.length, 0);
  assert.equal(p.crear.length, 0);
});

test('un resultado que aparece después sí se actualiza, y dice qué cambió', () => {
  const existentes = new Map([['urba:1', {
    date_time: '2026-03-14T03:00:00.000Z', venue: null,
    status: 'scheduled', score: null, round_label: 'Fecha 1',
  }]]);
  const p = planTournamentMatches({
    championship: campeonato({ rounds: [{ name: 'Fecha 1', matches: [partido({ fulfilled: true, local_team_score: 27, visit_team_score: 25 })] }] }) as any,
    tournamentId: 'tid', categoria: 'M17', resolverClub: resolver, existentes,
  });
  assert.equal(p.actualizar.length, 1);
  assert.deepEqual(p.actualizar[0].cambios.sort(), ['score', 'status']);
});

/**
 * El caso que importa al resincronizar: URBA corrige el bonus de un partido que ya
 * está cargado, y todo lo demás queda igual. Sin comparar esas columnas el partido
 * saldría "sin cambios" y se quedaría con el bonus viejo para siempre.
 */
test('un bonus corregido se detecta aunque el resultado no se mueva', () => {
  const yaEnBase = {
    date_time: '2026-03-14T03:00:00.000Z', venue: null, status: 'final',
    score: { home: 27, away: 25 }, round_label: 'Fecha 1',
    home_base_points: 4, away_base_points: 0,
    home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: false,
  };
  const conBonus = partido({ fulfilled: true, local_team_score: 27, visit_team_score: 25, local_team_offensive_bonus: 1 });
  const p = planTournamentMatches({
    championship: campeonato({ rounds: [{ name: 'Fecha 1', matches: [conBonus] }] }) as any,
    tournamentId: 'tid', categoria: 'M17', resolverClub: resolver,
    existentes: new Map([['urba:1', yaEnBase]]),
  });
  assert.deepEqual(p.actualizar[0].cambios, ['home_bonus_points']);
});

/**
 * El bug que encontró la primera pasada en seco del cron: 1.992 "actualizaciones"
 * sobre 44 torneos, todas de `score` y ninguna finalizando. Postgres normaliza las
 * claves del jsonb en orden alfabético (`{"away":25,"home":27}`) y el conector arma
 * `{home, away}`: comparadas como texto, todas las cadenas difieren y todos los
 * partidos jugados parecen haber cambiado.
 */
test('el resultado se compara por valor, no por el orden de las claves', () => {
  const p = planTournamentMatches({
    championship: campeonato({ rounds: [{ name: 'Fecha 1', matches: [partido({ fulfilled: true, local_team_score: 27, visit_team_score: 25 })] }] }) as any,
    tournamentId: 'tid', categoria: 'M17', resolverClub: resolver,
    existentes: new Map([['urba:1', {
      date_time: '2026-03-14T03:00:00.000Z', venue: null, status: 'final',
      // tal cual lo devuelve Postgres: claves al revés
      score: { away: 25, home: 27 }, round_label: 'Fecha 1',
      home_base_points: 4, away_base_points: 0,
      home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: false,
    }]]),
  });
  assert.equal(p.sinCambios, 1, 'el mismo resultado con otro orden de claves no es un cambio');
  assert.equal(p.actualizar.length, 0);
});

test('un resultado realmente distinto sí se detecta', () => {
  const p = planTournamentMatches({
    championship: campeonato({ rounds: [{ name: 'Fecha 1', matches: [partido({ fulfilled: true, local_team_score: 27, visit_team_score: 25 })] }] }) as any,
    tournamentId: 'tid', categoria: 'M17', resolverClub: resolver,
    existentes: new Map([['urba:1', {
      date_time: '2026-03-14T03:00:00.000Z', venue: null, status: 'final',
      score: { away: 26, home: 27 }, round_label: 'Fecha 1',
      home_base_points: 4, away_base_points: 0,
      home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: false,
    }]]),
  });
  assert.deepEqual(p.actualizar[0].cambios, ['score']);
});

test('un partido sin jugar sigue sin resultado, y eso no es un cambio', () => {
  const p = planTournamentMatches({
    championship: campeonato() as any,
    tournamentId: 'tid', categoria: 'M17', resolverClub: resolver,
    existentes: new Map([['urba:1', {
      date_time: '2026-03-14T03:00:00.000Z', venue: null, status: 'scheduled',
      score: null, round_label: 'Fecha 1',
      home_base_points: 0, away_base_points: 0,
      home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: true,
    }]]),
  });
  assert.equal(p.sinCambios, 1);
});

/** No haberlas seleccionado no es haberlas cambiado. */
test('si el llamador no trae las columnas de puntos, no se inventan cambios', () => {
  const p = planTournamentMatches({
    championship: campeonato({ rounds: [{ name: 'Fecha 1', matches: [partido({ fulfilled: true, local_team_score: 27, visit_team_score: 25, local_team_offensive_bonus: 1 })] }] }) as any,
    tournamentId: 'tid', categoria: 'M17', resolverClub: resolver,
    existentes: new Map([['urba:1', {
      date_time: '2026-03-14T03:00:00.000Z', venue: null, status: 'final',
      score: { home: 27, away: 25 }, round_label: 'Fecha 1',
    }]]),
  });
  assert.equal(p.sinCambios, 1);
  assert.equal(p.actualizar.length, 0);
});

/* ── el bonus en la fila ────────────────────────────────────────────────── */

/**
 * `StandingsEngine.buildTableRows` sólo mira `home_bonus_points` cuando
 * `points_autocalculated === false`. Con `true` lo ignora y trata de deducir el
 * bonus de los eventos del partido, que en un partido importado no existen: la
 * bandera es tan necesaria como el número.
 */
test('un partido jugado viaja con el bonus y con la bandera que lo hace contar', () => {
  const p = plan({ rounds: [{ name: 'F1', matches: [partido({
    fulfilled: true, local_team_score: 30, visit_team_score: 26,
    local_team_offensive_bonus: 1, visit_team_defensive_bonus: 1,
  })] }] });
  const f = p.crear[0];
  assert.equal(f.points_autocalculated, false, 'con true el motor ignora el bonus');
  assert.equal(f.home_bonus_points, 1);
  assert.equal(f.away_bonus_points, 1);
});

/**
 * El base va materializado, no NULL: `matches.home_base_points` es NOT NULL (un
 * NULL es un 23502, comprobado contra la base) y por el camino de puntaje manual
 * el motor lee el base de la fila, no lo deriva del reglamento.
 */
test('el puntaje base viaja en la fila, 4/2/0', () => {
  const gana = plan({ rounds: [{ name: 'F1', matches: [partido({ fulfilled: true, local_team_score: 30, visit_team_score: 26 })] }] });
  assert.equal(gana.crear[0].home_base_points, 4);
  assert.equal(gana.crear[0].away_base_points, 0);

  const empata = plan({ rounds: [{ name: 'F1', matches: [partido({ fulfilled: true, local_team_score: 20, visit_team_score: 20 })] }] });
  assert.equal(empata.crear[0].home_base_points, 2);
  assert.equal(empata.crear[0].away_base_points, 2);
});

test('ninguna fila puede llevar el base en NULL: la columna es NOT NULL', () => {
  const p = plan({ rounds: [{ name: 'F1', matches: [
    partido({ id: 1, fulfilled: true, local_team_score: 9, visit_team_score: 3 }),
    partido({ id: 2 }),
    partido({ id: 3, suspended: true }),
  ] }] });
  assert.equal(p.crear.length, 3);
  for (const f of p.crear) {
    assert.equal(typeof f.home_base_points, 'number', `${f.external_id} llevaría NULL y sería un 23502`);
    assert.equal(typeof f.away_base_points, 'number');
  }
});

/**
 * `home_bonus_points` también es NOT NULL, así que la fila lleva 0 donde
 * `bonusDeUrba` devuelve null. El 0 es inofensivo porque viaja con
 * `points_autocalculated: true`, y por ese camino el motor no mira el bonus.
 */
test('un partido futuro no reparte puntos ni se marca como manual', () => {
  const f = plan().crear[0];
  assert.equal(f.points_autocalculated, true);
  assert.equal(f.home_base_points, 0);
  assert.equal(f.away_base_points, 0);
  assert.equal(f.home_bonus_points, 0);
  assert.equal(f.away_bonus_points, 0);
});

test('ninguna fila lleva bonus en NULL: esa columna también es NOT NULL', () => {
  const p = plan({ rounds: [{ name: 'F1', matches: [
    partido({ id: 1, fulfilled: true, local_team_offensive_bonus: 1 }),
    partido({ id: 2 }),
    partido({ id: 3, suspended: true }),
  ] }] });
  for (const f of p.crear) {
    assert.equal(typeof f.home_bonus_points, 'number', `${f.external_id} llevaría NULL y sería un 23502`);
    assert.equal(typeof f.away_bonus_points, 'number');
  }
});

/* ── participantes ──────────────────────────────────────────────────────── */

/**
 * Sin participantes el torneo no tiene tabla, por muchos partidos que se carguen:
 * el motor arma el mapa desde `tournament_participants` y descarta el partido si
 * alguno de los dos clubes falta. Medido: 119 partidos terminados en Intermedia,
 * clubes correctos, tabla vacía.
 */
test('cada club del torneo entra una vez, sin los Bye ni los que no resuelven', () => {
  const p = plan();
  assert.deepEqual(p.participantesCrear.map((x) => x.club_id).sort(),
    ['hindu-club-m17-a', 'san-isidro-club-m17-a']);
  assert.equal(p.participantesCrear.length, 2, 'ni el Bye ni el club sin mapear son participantes');
  assert.equal(p.participantesCrear[0].tournament_id, 'tid');
  assert.equal(p.participantesCrear[0].type, 'club');
});

/**
 * `tournament_participants` NO tiene UNIQUE: hay pares repetidos preexistentes de
 * torneos ajenos a URBA, así que crearlo falla. La protección contra el duplicado
 * es nuestra, acá y con NOT EXISTS en el INSERT — no un ON CONFLICT sin índice.
 */
test('el que ya está no se vuelve a proponer', () => {
  const p = planTournamentMatches({
    championship: campeonato() as any, tournamentId: 'tid', categoria: 'M17',
    resolverClub: resolver, existentes: new Map(),
    participantesYaEnBase: new Set(['san-isidro-club-m17-a']),
  });
  assert.deepEqual(p.participantesCrear.map((x) => x.club_id), ['hindu-club-m17-a']);
  assert.equal(p.participantesExistentes, 1);
});

/** Un equipo sin partidos es una fila en cero de la tabla, no una ausencia. */
test('un equipo que no jugó ningún partido igual es participante', () => {
  const p = plan({ rounds: [] });
  assert.equal(p.crear.length, 0);
  assert.equal(p.participantesCrear.length, 2);
});

test('el nombre sale del resolvedor cuando se lo pasa, y de URBA cuando no', () => {
  const conNombre = planTournamentMatches({
    championship: campeonato() as any, tournamentId: 'tid', categoria: 'M17',
    resolverClub: resolver, existentes: new Map(),
    nombreDeClub: (id) => (id === 'san-isidro-club-m17-a' ? 'SIC M17 "A"' : null),
  });
  const porId = new Map(conNombre.participantesCrear.map((x) => [x.club_id, x.name]));
  assert.equal(porId.get('san-isidro-club-m17-a'), 'SIC M17 "A"');
  assert.equal(porId.get('hindu-club-m17-a'), 'Hindu A', 'sin nombre en G22 se usa el de URBA');
});
