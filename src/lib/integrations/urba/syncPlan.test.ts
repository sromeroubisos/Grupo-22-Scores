import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPOS_INTOCABLES,
  CAMPOS_SINCRONIZABLES,
  PARTES_DEL_BARRIDO,
  construirPatch,
  parteDelBarrido,
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
 * Reemplaza al cursor persistido: el arranque sale del reloj y la lista viaja
 * entera, que el corte lo pone el presupuesto de tiempo del llamador.
 */
test('no se pierde ni se repite ningún torneo: la lista viaja entera', () => {
  const items = [1, 2, 3];
  assert.deepEqual(rotarPorReloj(items, 12, 0), items);
  const rotada = rotarPorReloj(items, 12, 40 * 60 * 1000);
  assert.equal(rotada.length, items.length);
  assert.deepEqual([...rotada].sort(), items);
});

test('el arranque avanza un paso por ventana de 20 minutos', () => {
  const items = Array.from({ length: 55 }, (_, i) => i);
  const veinteMin = 20 * 60 * 1000;
  assert.equal(rotarPorReloj(items, 12, 0)[0], 0);
  assert.equal(rotarPorReloj(items, 12, veinteMin)[0], 12);
  assert.equal(rotarPorReloj(items, 12, 2 * veinteMin)[0], 24);
});

/**
 * El caso que estaba roto. Con 55 candidatos y un paso de 50, el arranque sólo
 * alternaba entre 0 y 50; leyendo once por corrida, del 12 al 49 no los miraba
 * nadie. Con el paso parecido a lo que una corrida alcanza a hacer, la ventana
 * de la jornada los cubre a todos.
 */
test('una ventana de jornada cubre los 55 torneos leyendo de a once', () => {
  const items = Array.from({ length: 55 }, (_, i) => i);
  const veinteMin = 20 * 60 * 1000;
  const vistos = new Set<number>();
  // Las nueve corridas de la ventana de la tarde (21:00–23:59, cada 20 min).
  for (let corrida = 0; corrida < 9; corrida++) {
    for (const t of rotarPorReloj(items, 12, corrida * veinteMin).slice(0, 11)) vistos.add(t);
  }
  assert.equal(vistos.size, 55, `quedaron sin leer: ${items.filter((i) => !vistos.has(i))}`);
});

test('la rotación es estable dentro de la misma ventana de 20 minutos', () => {
  const items = Array.from({ length: 85 }, (_, i) => i);
  assert.deepEqual(rotarPorReloj(items, 12, 5 * 60 * 1000), rotarPorReloj(items, 12, 19 * 60 * 1000));
});

test('una lista vacía o un paso inválido no rompen la corrida', () => {
  assert.deepEqual(rotarPorReloj([], 12, 1_700_000_000_000), []);
  assert.deepEqual(rotarPorReloj([1, 2, 3], 0, 1_700_000_000_000), [1, 2, 3]);
});

/* ── las partes del barrido ─────────────────────────────────────────────── */

/**
 * El caso que estaba roto, escrito con el `schedule` real del barrido.
 *
 * `0 9 * * *` son 24 h exactas entre corridas. Con la hora como unidad, y siendo
 * 24 múltiplo de 3, el resto no se movía nunca: diez días seguidos en la parte 0
 * y dos tercios de los torneos sin barrer. El test recorre los mismos diez días.
 */
test('el barrido diario recorre TODAS las partes, no siempre la misma', () => {
  const vistas = new Set<number>();
  for (let dia = 8; dia <= 17; dia++) {
    const iso = `2026-08-${String(dia).padStart(2, '0')}T09:00:00.000Z`;
    vistas.add(parteDelBarrido(Date.parse(iso)));
  }
  assert.equal(vistas.size, PARTES_DEL_BARRIDO, `el barrido sólo visitó ${[...vistas]}`);
});

test('la parte avanza de a uno por día y cierra el ciclo', () => {
  const dia = Date.parse('2026-08-09T09:00:00.000Z');
  const partes = Array.from({ length: PARTES_DEL_BARRIDO + 1 }, (_, i) =>
    parteDelBarrido(dia + i * 86_400_000));
  for (let i = 1; i < PARTES_DEL_BARRIDO; i++) {
    assert.equal(partes[i], (partes[0] + i) % PARTES_DEL_BARRIDO);
  }
  assert.equal(partes[PARTES_DEL_BARRIDO], partes[0], 'el ciclo tiene que cerrar');
});

/**
 * Lo que hace que el catálogo entero se barra TODOS los días en vez de en tres.
 * Son las tres entradas declaradas en `vercel.json`, con sus horas de verdad.
 */
test('las tres entradas del barrido cubren las tres partes el mismo día', () => {
  for (const dia of ['2026-08-09', '2026-08-10', '2026-08-11', '2027-01-01']) {
    const vistas = new Set([9, 10, 11].map((h) =>
      parteDelBarrido(Date.parse(`${dia}T${String(h).padStart(2, '0')}:00:00.000Z`))));
    assert.equal(vistas.size, PARTES_DEL_BARRIDO, `el ${dia} quedaron partes sin barrer: ${[...vistas]}`);
  }
});

/** Dos disparos dentro de la misma hora son la misma parte: no se repite trabajo. */
test('la parte no cambia dentro de la misma hora UTC', () => {
  const base = Date.parse('2026-08-09T09:00:00.000Z');
  assert.equal(parteDelBarrido(base), parteDelBarrido(base + 59 * 60_000));
});

/** El módulo de JS devuelve negativos: una fecha anterior a 1970 rompía el filtro. */
test('nunca devuelve una parte negativa', () => {
  for (const ms of [-1, -86_400_000, -5 * 86_400_000]) {
    const parte = parteDelBarrido(ms);
    assert.ok(parte >= 0 && parte < PARTES_DEL_BARRIDO, `parte fuera de rango: ${parte}`);
  }
});
