/**
 * El token que ata la confirmacion al plan.
 *
 * Lo que se prueba es lo que separa "confirmar" de "crear cualquier cosa": un
 * plan retocado a mano no puede pasar, y el segundo paso tiene que crear
 * exactamente lo que mostro el primero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXTURE_DRAFT_TTL_MS,
  issueFixtureDraftToken,
  verifyFixtureDraftToken,
  type FixtureDraftPlan,
} from './fixtureDraftToken';

// El modulo lee la clave recien al firmar, no al importarse: alcanza con
// ponerla antes del primer caso.
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'clave-de-prueba-no-es-la-real';

type Plan = FixtureDraftPlan;

const KEY_ID = '00000000-0000-4000-8000-000000000001';
const OTRA_KEY = '00000000-0000-4000-8000-000000000002';

const PLAN: Plan = {
  tournamentId: '11111111-1111-4111-8111-111111111111',
  phaseId: '22222222-2222-4222-8222-222222222222',
  roundLabel: 'Fecha 5',
  homeClubId: '33333333-3333-4333-8333-333333333333',
  awayClubId: '44444444-4444-4444-8444-444444444444',
  dateTime: '2026-09-05T15:30:00',
  venue: 'Cancha 1',
};

test('el plan vuelve entero del token, sin perder ni cambiar un campo', () => {
  const token = issueFixtureDraftToken(PLAN, KEY_ID);
  const verified = verifyFixtureDraftToken(token, KEY_ID);

  assert.equal(verified.ok, true);
  assert.deepEqual(verified.ok ? verified.plan : null, PLAN);
});

test('un plan retocado a mano no pasa: la firma deja de cerrar', () => {
  const token = issueFixtureDraftToken(PLAN, KEY_ID);
  const [body, signature] = token.split('.');

  // Alguien cambia el torneo de destino y vuelve a armar el token.
  const envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  envelope.plan.tournamentId = '99999999-9999-4999-8999-999999999999';
  const forjado = `${Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url')}.${signature}`;

  const verified = verifyFixtureDraftToken(forjado, KEY_ID);
  assert.equal(verified.ok, false);
  assert.equal(verified.ok === false ? verified.reason : null, 'bad_signature');
});

test('una firma de otro contenido tampoco sirve', () => {
  const mio = issueFixtureDraftToken(PLAN, KEY_ID);
  const ajeno = issueFixtureDraftToken({ ...PLAN, venue: 'Otra cancha' }, KEY_ID);

  const mezclado = `${mio.split('.')[0]}.${ajeno.split('.')[1]}`;
  const verified = verifyFixtureDraftToken(mezclado, KEY_ID);

  assert.equal(verified.ok, false);
  assert.equal(verified.ok === false ? verified.reason : null, 'bad_signature');
});

test('el plan vence, y despues del vencimiento no se puede confirmar', () => {
  const emitido = 1_000_000;
  const token = issueFixtureDraftToken(PLAN, KEY_ID, emitido);

  const justoAntes = verifyFixtureDraftToken(token, KEY_ID, emitido + FIXTURE_DRAFT_TTL_MS - 1);
  assert.equal(justoAntes.ok, true);

  const justoDespues = verifyFixtureDraftToken(token, KEY_ID, emitido + FIXTURE_DRAFT_TTL_MS);
  assert.equal(justoDespues.ok, false);
  assert.equal(justoDespues.ok === false ? justoDespues.reason : null, 'expired');
});

test('el plan que pidio una key no lo confirma otra', () => {
  const token = issueFixtureDraftToken(PLAN, KEY_ID);
  const verified = verifyFixtureDraftToken(token, OTRA_KEY);

  assert.equal(verified.ok, false);
  assert.equal(verified.ok === false ? verified.reason : null, 'other_key');
});

test('el pedido que entro por un secret de entorno confirma con el mismo camino', () => {
  const token = issueFixtureDraftToken(PLAN, null);

  assert.equal(verifyFixtureDraftToken(token, null).ok, true);
  // Pero una key con fila no puede confirmar el plan del entorno.
  assert.equal(verifyFixtureDraftToken(token, KEY_ID).ok, false);
});

test('un token con cualquier forma rara se rechaza sin explotar', () => {
  for (const basura of ['', '.', 'sinpunto', 'a.b.c', 'aaa.bbb']) {
    const verified = verifyFixtureDraftToken(basura, KEY_ID);
    assert.equal(verified.ok, false, `deberia rechazar: ${JSON.stringify(basura)}`);
  }
});
