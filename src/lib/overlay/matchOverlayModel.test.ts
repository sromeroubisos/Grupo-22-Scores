import test from 'node:test';
import assert from 'node:assert/strict';

import { newPlates, overlayClock, phaseOf, sinBinSeconds, teamCards, toOverlayMatch } from './matchOverlayModel.ts';

/* Un overlay al aire no se puede probar en el navegador sin un partido
   jugándose: lo que decide qué sale en pantalla es puro y se prueba acá. */

function livePayload(events: unknown[], clock: Record<string, unknown> | null = null) {
  return {
    id: 'm1',
    status: 'live',
    date_time: '2026-11-28T18:30:00+00:00',
    score: { home: 12, away: 7 },
    clock,
    round_label: 'Fecha 4',
    sport_id: 'rugby',
    homeClub: { name: 'Club Local', short_name: 'Local', primary_color: '0a0', logo: '/l.png' },
    awayClub: { name: 'Club Visitante', short_name: null, primary_color: 'rojo', logo: null },
    tournament: { name: 'Torneo', logo_url: null, ruleset: {} },
    events,
  };
}

const TRY = { id: 'e1', type: 'try', team: 'home', playerName: 'Juan Pérez', minute: 12, order: 0 };
const CONV_MISS = { id: 'e2', type: 'conversion', team: 'home', playerName: 'Juan Pérez', minute: 13, detail: '[palos:miss]', order: 1 };
const CONV_OK = { id: 'e3', type: 'conversion', team: 'home', playerName: 'Juan Pérez', minute: 13, detail: '[palos:ok]', order: 2 };
const YELLOW = { id: 'e4', type: 'yellow_card', team: 'away', playerName: '', minute: 20, order: 3 };
const SUB = { id: 'e5', type: 'substitution', team: 'away', playerName: 'A', minute: 21, order: 4 };
const TACKLE = { id: 'e6', type: 'tackle', team: 'away', playerName: 'B', minute: 22, order: 5 };

test('un partido propio se lee con nombres, colores saneados y marcador', () => {
  const match = toOverlayMatch(livePayload([]));
  assert.ok(match);
  assert.equal(match.phase, 'live');
  assert.equal(match.home.short, 'Local');
  assert.equal(match.home.color, '#00aa00');
  // Un color que no es hex no se pasa al CSS.
  assert.equal(match.away.color, null);
  assert.equal(match.away.short, 'Club Visitante');
  assert.equal(match.home.score, 12);
  assert.equal(match.round, 'Fecha 4');
});

test('en la previa no hay marcador y el reloj muestra la hora de inicio', () => {
  const match = toOverlayMatch({ ...livePayload([]), status: 'scheduled' });
  assert.ok(match);
  assert.equal(match.home.score, null);
  assert.deepEqual(overlayClock(match, Date.now()), { time: null, label: '15:30' });
});

test('el reloj derivado corre entre lecturas', () => {
  const started = Date.parse('2026-11-28T19:00:00Z');
  const match = toOverlayMatch(livePayload([], {
    period_started_at: new Date(started).toISOString(),
    accumulated_seconds: 40 * 60,
    is_running: true,
    period: '2T',
  }));
  assert.ok(match);
  const clock = overlayClock(match, started + 5 * 60_000 + 7_000);
  assert.equal(clock.time, '45:07');
  assert.equal(clock.label, '2T');
  assert.equal(clock.minutes, "46'");
  assert.equal(clock.expired, false);
});

test('el entretiempo y el final no muestran tiempo', () => {
  const ht = toOverlayMatch(livePayload([], { accumulated_seconds: 2400, is_running: false, period: 'HT' }));
  assert.ok(ht);
  assert.deepEqual(overlayClock(ht, Date.now()), { time: null, label: 'ENTRETIEMPO' });
  const ft = toOverlayMatch({ ...livePayload([]), status: 'final' });
  assert.ok(ft);
  assert.equal(overlayClock(ft, Date.now()).label, 'FINAL');
});

test('solo se anuncia lo que es nuevo, y nunca una patada errada', () => {
  const match = toOverlayMatch(livePayload([TRY, CONV_MISS, CONV_OK, YELLOW, SUB, TACKLE]));
  assert.ok(match);
  const plates = newPlates(match.events, new Set(['e1']), { substitutions: false, maxBurst: 10 });
  assert.deepEqual(plates.map((p) => p.title), ['CONVERSIÓN', 'TARJETA AMARILLA']);
  // Sin nombre cargado no se escribe "Jugador" al aire.
  assert.equal(plates[1].player, null);
});

test('los cambios salen solo si se piden', () => {
  const match = toOverlayMatch(livePayload([SUB]));
  assert.ok(match);
  assert.equal(newPlates(match.events, new Set(), { substitutions: false }).length, 0);
  assert.equal(newPlates(match.events, new Set(), { substitutions: true })[0].title, 'CAMBIO');
});

test('una ráfaga de eventos (reconexión) anuncia solo el último', () => {
  const match = toOverlayMatch(livePayload([TRY, CONV_OK, YELLOW, { ...TRY, id: 'e9', order: 9 }]));
  assert.ok(match);
  const plates = newPlates(match.events, new Set(), { substitutions: false });
  assert.equal(plates.length, 1);
  assert.equal(plates[0].key, 'e9');
});

test('la forma de un proveedor externo también se lee', () => {
  const match = toOverlayMatch({
    match: { id: 'x', status: 'live', time: "55'", home: { name: 'A', score: 3, logo: 'a.png' }, away: { name: 'B', score: 1 } },
  });
  assert.ok(match);
  assert.equal(match.home.score, 3);
  assert.equal(overlayClock(match, Date.now()).label, "55'");
});

test('estados', () => {
  assert.equal(phaseOf('final'), 'final');
  assert.equal(phaseOf('suspended'), 'other');
  assert.equal(phaseOf(''), 'scheduled');
});

test('una respuesta irreconocible no rompe', () => {
  assert.equal(toOverlayMatch(null), null);
  assert.equal(toOverlayMatch({ error: 'Match not found' }), null);
});

test('el reloj se pone en rojo al cumplirse el tiempo y en minutos dice el agregado', () => {
  const started = Date.parse('2026-11-28T19:00:00Z');
  const match = toOverlayMatch(livePayload([], {
    period_started_at: new Date(started).toISOString(),
    accumulated_seconds: 40 * 60,
    is_running: true,
    period: '2T',
  }));
  assert.ok(match);
  // 2T de rugby termina a los 80': a los 81:30 está vencido.
  const clock = overlayClock(match, started + 41 * 60_000 + 30_000);
  assert.equal(clock.expired, true);
  assert.equal(clock.minutes, "80+2'");
});

test('la amarilla de rugby corre 10 minutos de sin-bin en tiempo de juego', () => {
  const started = Date.parse('2026-11-28T19:00:00Z');
  const match = toOverlayMatch(livePayload(
    [{ id: 'y', type: 'yellow_card', team: 'away', playerName: 'X', minute: 45, order: 0 },
     { id: 'r', type: 'red_card', team: 'home', playerName: 'Z', minute: 50, order: 1 }],
    { period_started_at: new Date(started).toISOString(), accumulated_seconds: 40 * 60, is_running: true, period: '2T' },
  ));
  assert.ok(match);
  const cards = teamCards(match, started + 8 * 60_000); // minuto 48:00
  assert.equal(cards.away.yellow, 1);
  assert.deepEqual(cards.away.sinBins, [420]);
  assert.equal(cards.home.red, 1);
});

test('el overlay cuenta la amarilla del seven en 2 minutos', () => {
  const base = { sportRef: 'rugby' } as unknown as Parameters<typeof sinBinSeconds>[0];
  assert.equal(sinBinSeconds({ ...base, rugbyModality: 'sevens' }), 120);
  assert.equal(sinBinSeconds({ ...base, rugbyModality: 'fifteens' }), 600);
  assert.equal(sinBinSeconds(base), 600);
});
