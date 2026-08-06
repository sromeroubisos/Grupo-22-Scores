import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPOS_INTOCABLES,
  CAMPOS_SINCRONIZABLES,
  construirPatch,
  rotarPorReloj,
} from './syncPlan.ts';

const fila = (over: any = {}) => ({
  external_id: 'urba:1', tournament_id: 'tid',
  home_club_id: 'a', away_club_id: 'b',
  date_time: '2026-08-09T03:00:00.000Z', status: 'final',
  score: { home: 20, away: 10 }, round_label: 'Fecha 1', venue: null,
  points_autocalculated: false, home_base_points: 4, away_base_points: 0,
  home_bonus_points: 1, away_bonus_points: 0, ...over,
});

/* ── la lista blanca ────────────────────────────────────────────────────── */

test('sólo pasan los campos de la lista blanca', () => {
  const p = construirPatch({ fila: fila() as any, cambios: ['status', 'score', 'venue', 'is_visible'] }, 'scheduled');
  assert.deepEqual(Object.keys(p!.patch).sort(), ['score', 'status']);
});

/**
 * URBA no publica sede: la fila del conector lleva `venue: null`. Escribirlo
 * borraría la cancha que cargó una persona, en cada pasada del cron.
 */
test('venue no se escribe nunca, aunque el conector lo traiga', () => {
  const p = construirPatch({ fila: fila() as any, cambios: ['venue'] }, 'scheduled');
  assert.equal(p, null, 'un cambio que sólo toca venue no debe producir escritura');
});

/**
 * Sin esto, un partido cuyo único "cambio" cae fuera de la lista igual recibiría
 * un UPDATE. Y un UPDATE de status es lo que dispara el trigger de
 * notificaciones: mandaríamos un aviso por un cambio que no hicimos.
 */
test('si no queda nada permitido, no hay escritura', () => {
  assert.equal(construirPatch({ fila: fila() as any, cambios: ['is_visible', 'phase_id'] }, 'final'), null);
  assert.equal(construirPatch({ fila: fila() as any, cambios: [] }, 'final'), null);
});

test('las dos listas no se pisan, y cubren lo que el conector escribe', () => {
  const blanca = new Set<string>(CAMPOS_SINCRONIZABLES);
  for (const c of CAMPOS_INTOCABLES) {
    assert.ok(!blanca.has(c), `${c} está en las dos listas`);
  }
  const declarados = new Set<string>([...CAMPOS_SINCRONIZABLES, ...CAMPOS_INTOCABLES]);
  for (const c of Object.keys(fila())) {
    assert.ok(declarados.has(c), `${c} no está clasificado: decidí si el cron lo toca o no`);
  }
});

/* ── la transición a final ──────────────────────────────────────────────── */

/** Es la que dispara el trigger de notificaciones y la que mueve el ranking. */
test('detecta el paso a final', () => {
  assert.equal(construirPatch({ fila: fila() as any, cambios: ['status'] }, 'scheduled')!.seFinaliza, true);
});

test('un partido que YA estaba final no vuelve a finalizar', () => {
  assert.equal(construirPatch({ fila: fila() as any, cambios: ['score'] }, 'final')!.seFinaliza, false);
});

test('una corrección de resultado sobre un final no cuenta como transición', () => {
  const p = construirPatch({ fila: fila({ score: { home: 21, away: 10 } }) as any, cambios: ['score'] }, 'final');
  assert.equal(p!.seFinaliza, false);
  assert.deepEqual(p!.patch.score, { home: 21, away: 10 });
});

/* ── la rotación ────────────────────────────────────────────────────────── */

/**
 * Reemplaza al cursor persistido: dos corridas consecutivas (20 min de
 * diferencia) tienen que cubrir el total sin repetir de más.
 */
test('si entra todo, no rota', () => {
  const items = [1, 2, 3];
  assert.deepEqual(rotarPorReloj(items, 50, 0), items);
});

test('dos corridas consecutivas cubren los 85 torneos de un domingo', () => {
  const items = Array.from({ length: 85 }, (_, i) => i);
  const veinteMin = 20 * 60 * 1000;
  const a = rotarPorReloj(items, 50, 0);
  const b = rotarPorReloj(items, 50, veinteMin);
  assert.equal(a.length, 50);
  assert.equal(b.length, 50);
  assert.equal(new Set([...a, ...b]).size, 85, 'entre las dos pasadas no puede faltar ninguno');
});

test('la rotación es estable dentro de la misma ventana de 20 minutos', () => {
  const items = Array.from({ length: 85 }, (_, i) => i);
  assert.deepEqual(rotarPorReloj(items, 50, 5 * 60 * 1000), rotarPorReloj(items, 50, 19 * 60 * 1000));
});
