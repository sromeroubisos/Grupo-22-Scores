import test from 'node:test';
import assert from 'node:assert/strict';
import { clockTransitionFor, decideEvent, planBatch, serverHints, toMatchBody, toMatchCenterEvent } from './batchPlan.ts';
import type { MutationEnvelope } from './protocol.ts';

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';

function mutation(partial: Partial<MutationEnvelope>): MutationEnvelope {
  return {
    mutationId: crypto.randomUUID(),
    entity: 'match_events',
    op: 'insert',
    recordId: crypto.randomUUID(),
    payload: {},
    base: {},
    createdAt: '2026-09-25T18:00:00.000Z',
    ...partial,
  };
}

test('50 eventos y el marcador de un mismo partido salen en un solo grupo (un PATCH, un recálculo)', () => {
  const events = Array.from({ length: 50 }, () => mutation({ payload: { match_id: M1 } }));
  const score = mutation({ entity: 'matches', op: 'update', recordId: M1, payload: { score: { home: 20, away: 15 } } });
  const plan = planBatch([...events, score], (m) => String(m.payload.match_id ?? ''));
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0]!.events.length, 50);
  assert.equal(plan.groups[0]!.matchUpdate, score);
  assert.deepEqual(plan.singles, []);
});

test('partidos distintos van en grupos distintos; lo que no es de un partido va suelto y en orden', () => {
  const club = mutation({ entity: 'clubs', op: 'insert' });
  const newMatch = mutation({ entity: 'matches', op: 'insert' });
  const a = mutation({ payload: { match_id: M1 } });
  const b = mutation({ payload: { match_id: M2 } });
  const orphan = mutation({ payload: {} });
  const plan = planBatch([club, a, newMatch, b, orphan], (m) => (m.payload.match_id as string) || null);
  assert.deepEqual(plan.groups.map((g) => g.matchId), [M1, M2]);
  assert.deepEqual(plan.singles, [club, newMatch, orphan]);
});

test('eventos: un reintento de alta es duplicado, borrar algo que no está es éxito', () => {
  const insert = mutation({ payload: { match_id: M1, event_type: 'try', minute: 3 } });
  assert.equal(decideEvent(insert, { id: insert.recordId }, null).kind, 'duplicate');
  assert.equal(decideEvent(mutation({ op: 'delete' }), null, null).kind, 'gone');
  const action = decideEvent(insert, null, { home_club_id: 'a', away_club_id: 'b' });
  assert.equal(action.kind, 'upsert');
});

test('el evento del Match Center toma el equipo del club y conserva período y orden', () => {
  const event = toMatchCenterEvent(
    { id: 'e1', event_type: 'try', minute: '12', club_id: 'b', player_id: null, details: { period: '1T', order: 4, playerName: 'Ana' } },
    { home_club_id: 'a', away_club_id: 'b' },
  );
  assert.equal(event.team, 'away');
  assert.equal(event.minute, 12);
  assert.equal(event.period, '1T');
  assert.equal(event.order, 4);
  assert.equal(event.playerName, 'Ana');
});

test('campos del partido → cuerpo del PATCH (con alineaciones; el reloj va aparte)', () => {
  assert.deepEqual(toMatchBody({ score: { home: 1, away: 0 }, date_time: 'x', lineups: { home: [] }, clock: {}, id: 'ignored' }), {
    score: { home: 1, away: 0 },
    dateTime: 'x',
    lineups: { home: [] },
  });
  const transition = clockTransitionFor(null, Date.parse('2026-09-25T18:00:00Z'));
  assert.equal(transition.mode, 'set');
});

test('el servidor achica la tanda y pide esperar cuando se pone lento', () => {
  assert.deepEqual(serverHints(1_000), { maxBatch: 50 });
  assert.deepEqual(serverHints(9_000), { maxBatch: 20 });
  assert.deepEqual(serverHints(25_000), { maxBatch: 10, retryAfterMs: 5_000 });
});
