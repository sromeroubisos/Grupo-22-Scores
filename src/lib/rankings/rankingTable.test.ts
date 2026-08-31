import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRankingExportRows,
  getRankingMovementHighlight,
  RANKING_MOVEMENT_COLORS,
} from './rankingTable.ts';

const union = (position: number, previous: number | null, name = `Union ${position}`) => ({
  current_position: position,
  source_previous_position: previous,
  current_rating: 90 - position,
  previous_rating: 90 - (previous ?? position),
  source_name: name,
  source_region: 'Europa',
  clubs: { name, short_name: name.slice(0, 3).toUpperCase(), logo_url: '/flags/ar.svg' },
});

/* ── el calculo del subrayado ───────────────────────────────────────────── */

test('el primero va en oro, se haya movido o no', () => {
  assert.deepEqual(getRankingMovementHighlight(1, 1), {
    tone: 'oro', strength: 1, color: RANKING_MOVEMENT_COLORS.oro,
  });
  assert.equal(getRankingMovementHighlight(1, 7)?.tone, 'oro');
});

test('subir es verde y bajar es rojo', () => {
  assert.equal(getRankingMovementHighlight(4, 6)?.tone, 'sube');
  assert.equal(getRankingMovementHighlight(6, 4)?.tone, 'baja');
});

test('quedarse en el puesto no se subraya', () => {
  assert.equal(getRankingMovementHighlight(5, 5), null);
});

test('sin puesto anterior no hay movimiento que mostrar', () => {
  assert.equal(getRankingMovementHighlight(5, null), null);
});

test('la intensidad crece con el salto y se planta en cinco', () => {
  assert.equal(getRankingMovementHighlight(5, 6)?.strength, 0.2);
  assert.equal(getRankingMovementHighlight(5, 10)?.strength, 1);
  // Una union que aparece de la nada no puede apagar a todas las demas.
  assert.equal(getRankingMovementHighlight(5, 90)?.strength, 1);
});

/* ── lo que llega al afiche ─────────────────────────────────────────────── */

test('sin la opcion prendida el afiche no lleva ningun color de movimiento', () => {
  const rows = buildRankingExportRows([union(1, 2), union(2, 1), union(3, 3)]);
  assert.ok(rows.every((row) => row.movementColor === undefined));
});

test('con la opcion prendida el afiche recibe el mismo color que la tabla', () => {
  const [primero, segundo, quieto] = buildRankingExportRows(
    [union(1, 2), union(2, 1), union(3, 3)],
    [],
    { movementHighlight: true },
  );

  assert.equal(primero.movementColor, RANKING_MOVEMENT_COLORS.oro);
  assert.equal(segundo.movementColor, RANKING_MOVEMENT_COLORS.baja);
  assert.equal(quieto.movementColor, undefined);
});

test('la zona le gana al movimiento: dos colores sobre la misma fila se contradicen', () => {
  const etiquetas = [{ position: 2, label: 'Clasifica', tone: 'success' as const, color: '#22c55e' }];
  const [, segundo] = buildRankingExportRows(
    [union(1, 2), union(2, 1)],
    etiquetas,
    { movementHighlight: true },
  );

  assert.equal(segundo.zoneColor, '#22c55e');
  assert.equal(segundo.movementColor, undefined);
});
