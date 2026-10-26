import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_TABLE_COLUMNS,
  getBaseTableColumnDefaults,
  hasDraws,
  getPhaseBonusDefaults,
  getPhaseDefaults,
  getPhasePointsDefaults,
  getStatColumnOptions,
  getTiebreakerDefaults,
} from './phaseDefaults.ts';

/**
 * El caso que motivó el módulo: `normalizeSportBucket` manda rugby-league al
 * bucket `rugby` porque comparten los eventos de partido. Si el puntaje se
 * resolviera por bucket, league cobraría 4 por ganar en vez de 2 — y la tabla
 * de un torneo de league saldría mal sin que nadie toque nada.
 */
test('rugby league no hereda el puntaje de union aunque comparta bucket', () => {
  assert.deepEqual(getPhasePointsDefaults('rugby-union'), { win: 4, draw: 2, loss: 0, allowBonusPoints: true });
  assert.deepEqual(getPhasePointsDefaults('rugby-league'), { win: 2, draw: 1, loss: 0, allowBonusPoints: false });
});

test('un deporte desconocido cae en el genérico en vez de romper', () => {
  assert.deepEqual(getPhasePointsDefaults('kabaddi'), { win: 1, draw: 0, loss: 0, allowBonusPoints: false });
  assert.deepEqual(getPhasePointsDefaults(null), { win: 1, draw: 0, loss: 0, allowBonusPoints: false });
  assert.deepEqual(getPhasePointsDefaults(undefined), { win: 1, draw: 0, loss: 0, allowBonusPoints: false });
});

test('el id llega con mayúsculas o espacios y se resuelve igual', () => {
  assert.equal(getPhasePointsDefaults('  Football ').win, 3);
});

test('sólo el rugby union trae bonus', () => {
  const rugby = getPhaseBonusDefaults('rugby');
  assert.equal(rugby?.offensive?.mode, 'count');
  assert.equal(rugby?.offensive?.threshold, 4);
  assert.equal(rugby?.defensive?.margin, 7);

  assert.equal(getPhaseBonusDefaults('rugby-league'), null);
  assert.equal(getPhaseBonusDefaults('football'), null);
});

test('el bonus se entrega copiado: tocarlo no contamina la próxima fase', () => {
  const first = getPhaseBonusDefaults('rugby')!;
  first.offensive!.threshold = 99;
  assert.equal(getPhaseBonusDefaults('rugby')!.offensive!.threshold, 4);
});

test('sin empates no hay columna de empates', () => {
  // Básquet: un partido siempre tiene ganador, una columna E en cero es ruido.
  assert.equal(getBaseTableColumnDefaults('basketball').drawn, false);
  assert.equal(getBaseTableColumnDefaults('basketball').percentage, true);

  assert.equal(getBaseTableColumnDefaults('football').drawn, true);
  assert.equal(getBaseTableColumnDefaults('rugby').drawn, true);
});

test('el porcentaje se prende donde la tabla se lee por porcentaje', () => {
  // Básquet y vóley se ordenan por PCT; en rugby y fútbol la columna estorba.
  assert.equal(getBaseTableColumnDefaults('basketball').percentage, true);
  assert.equal(getBaseTableColumnDefaults('volleyball').percentage, true);
  assert.equal(getBaseTableColumnDefaults('rugby').percentage, false);
  assert.equal(getBaseTableColumnDefaults('football').percentage, false);
});

test('hasDraws dice si el formulario tiene que pedir puntos por empate', () => {
  assert.equal(hasDraws('football'), true);
  assert.equal(hasDraws('rugby'), true);
  assert.equal(hasDraws('handball'), true);
  assert.equal(hasDraws('basketball'), false);
  assert.equal(hasDraws('volleyball'), false);
});

test('las columnas de prórroga y clasificación quedan apagadas: son opt-in', () => {
  const cols = getBaseTableColumnDefaults('football');
  assert.equal(cols.classification, false);
  assert.equal(cols.extraPlayed, false);
  assert.equal(cols.extraWon, false);
});

test('las columnas base siempre son las mismas claves, prendidas o apagadas', () => {
  for (const sport of ['rugby', 'football', 'basketball', 'handball', 'kabaddi']) {
    const cols = getBaseTableColumnDefaults(sport);
    assert.deepEqual(Object.keys(cols), [...BASE_TABLE_COLUMNS], `claves de ${sport}`);
  }
});

/**
 * En rugby el enfrentamiento directo va antes que la diferencia de puntos
 * (URBA, Seis Naciones). En el fútbol argentino es al revés. Si los dos
 * ordenaran igual, una tabla empatada saldría mal y nadie se entera.
 */
test('el orden de desempate no es el mismo en rugby que en fútbol', () => {
  const rugby = getTiebreakerDefaults('rugby').map(t => t.metric);
  const futbol = getTiebreakerDefaults('football').map(t => t.metric);

  assert.ok(rugby.indexOf('headToHead') < rugby.indexOf('pointsDiff'));
  assert.ok(futbol.indexOf('pointsDiff') < futbol.indexOf('headToHead'));
});

test('los desempates salen en la forma que guarda settings.tiebreakers', () => {
  const items = getTiebreakerDefaults('rugby');
  items.forEach((item, i) => {
    assert.equal(item.priority, i + 1, 'la prioridad sigue al orden');
    assert.equal(item.enabled, true);
    assert.ok(item.order === 'asc' || item.order === 'desc');
  });
  assert.equal(items[0].metric, 'points');
});

test('el desempate usa el id canónico, no el legacy snake_case', () => {
  const metrics = getTiebreakerDefaults('rugby').map(t => t.metric);
  assert.ok(metrics.includes('headToHead'));
  assert.ok(!metrics.includes('head_to_head'));
});

test('rugby-union hereda los desempates de rugby por bucket', () => {
  assert.deepEqual(
    getTiebreakerDefaults('rugby-union').map(t => t.metric),
    getTiebreakerDefaults('rugby').map(t => t.metric),
  );
});

/**
 * Las columnas de estadística salen del catálogo de eventos, no de una lista
 * escrita a mano acá. Antes `COLUMN_TIEBREAKER_CONFIG` ofrecía tries, penales
 * y tackles en CUALQUIER deporte: un torneo de handball mostraba columnas de
 * rugby que nadie podía llenar.
 */
test('las estadísticas de rugby usan los ids que espera el selector', () => {
  // `tries`, no `try`: derivar la clave del tipo de evento daría un id que la
  // tabla no sabe pintar, y la columna se guardaría marcada sin dibujar nada.
  const keys = getStatColumnOptions({ sportId: 'rugby' }).map(c => c.key);
  assert.ok(keys.includes('tries'));
  assert.ok(keys.includes('dropGoals'));
  assert.ok(!keys.includes('try'));
  assert.ok(!keys.includes('dropGoal'));
});

test('rugby-union hereda las estadísticas de rugby por bucket', () => {
  assert.deepEqual(
    getStatColumnOptions({ sportId: 'rugby-union' }).map(c => c.key),
    getStatColumnOptions({ sportId: 'rugby' }).map(c => c.key),
  );
});

test('un deporte sin columnas en la tabla no ofrece ninguna', () => {
  // El catálogo de eventos sabe de handball, pero la tabla de posiciones
  // todavía no tiene columna para sus métricas: ofrecerlas dejaría una
  // casilla que se marca y no dibuja nada.
  assert.deepEqual(getStatColumnOptions({ sportId: 'handball' }), []);
  assert.deepEqual(getStatColumnOptions({ sportId: 'kabaddi' }), []);
});

test('cada columna de estadística aparece una sola vez', () => {
  const keys = getStatColumnOptions({ sportId: 'rugby' }).map(c => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('un torneo que no registra el evento no ofrece esa columna', () => {
  const keys = getStatColumnOptions({
    sportId: 'rugby',
    tournamentRuleset: {
      matchEvents: [
        { type: 'try', label: 'Try', category: 'score', points: 5, team: 'required', player: 'optional' },
      ],
    },
  }).map(c => c.key);

  assert.ok(keys.includes('tries'), 'el try declarado se ofrece');
  assert.ok(!keys.includes('dropGoals'), 'sin evento de drop, no hay columna de drop');
  // "Carrera" no sale de un evento, así que no se filtra por el catálogo.
  assert.ok(keys.includes('runs'));
});

test('getPhaseDefaults devuelve las cinco piezas juntas', () => {
  const d = getPhaseDefaults({ sportId: 'rugby' });
  assert.equal(d.points.win, 4);
  assert.ok(d.bonus);
  assert.equal(d.columns.drawn, true);
  assert.ok(d.statColumns.length > 0);
  assert.equal(d.tiebreakers[0].metric, 'points');
});
