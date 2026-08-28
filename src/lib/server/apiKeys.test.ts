/**
 * El sistema de API keys, en lo que se puede probar sin Postgres.
 *
 * El caso que da nombre al archivo es el anteultimo: el detector de "falta la
 * migracion" miraba el TEXTO del error, y el nombre de la tabla aparece en el
 * mensaje de cualquier violacion de constraint. Por eso el panel mandaba a
 * correr una migracion que ya estaba corrida, y tapaba el error de verdad.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_KEY_SCOPES,
  extractApiKeyCandidates,
  isApiKeyScope,
  isMissingApiKeysTableError,
  verifyApiKeyRequest,
} from './apiKeys';
import { getEnvFallbackStatus } from './apiKeyFallbacks';

test('el catalogo de permisos no tiene ids repetidos', () => {
  const ids = API_KEY_SCOPES.map((scope) => scope.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('un permiso inventado no pasa el validador', () => {
  assert.equal(isApiKeyScope('results:read'), true);
  assert.equal(isApiKeyScope('results:delete'), false);
  assert.equal(isApiKeyScope(''), false);
  assert.equal(isApiKeyScope(null), false);
  assert.equal(isApiKeyScope(undefined), false);
});

test('la key se toma de los tres headers, sin el "Bearer " y sin espacios', () => {
  const headers = new Headers({
    authorization: 'Bearer  g22_secreto-de-prueba ',
    'x-api-key': ' otra-key ',
    'x-webhook-secret': 'tercera-key',
  });

  assert.deepEqual(extractApiKeyCandidates(headers), [
    'g22_secreto-de-prueba',
    'otra-key',
    'tercera-key',
  ]);
});

test('la misma key repetida en dos headers se cuenta una sola vez', () => {
  const headers = new Headers({
    authorization: 'Bearer g22_secreto-de-prueba',
    'x-api-key': 'g22_secreto-de-prueba',
  });

  assert.deepEqual(extractApiKeyCandidates(headers), ['g22_secreto-de-prueba']);
});

test('un Authorization que no es Bearer no se toma como key', () => {
  const headers = new Headers({ authorization: 'Basic dXNlcjpwYXNz' });
  assert.deepEqual(extractApiKeyCandidates(headers), []);
});

test('sin ningun header, el request se rechaza sin ir a la base', async () => {
  const verification = await verifyApiKeyRequest(new Headers(), 'results:read');
  assert.equal(verification.ok, false);
  assert.equal(verification.reason, 'missing_credentials');
});

test('"falta la migracion" se decide por codigo, nunca por el texto del error', () => {
  assert.equal(isMissingApiKeysTableError({ code: '42P01' }), true);
  assert.equal(isMissingApiKeysTableError({ code: 'PGRST205' }), true);

  // La regresion: un constraint violado nombra la tabla en el mensaje. Si eso
  // contara como "tabla ausente", el panel pide una migracion ya corrida.
  assert.equal(
    isMissingApiKeysTableError({
      code: '23514',
      message: 'new row for relation "api_keys" violates check constraint "api_keys_scopes_check"',
    }),
    false,
  );

  assert.equal(isMissingApiKeysTableError(new Error('api_keys se rompio')), false);
  assert.equal(isMissingApiKeysTableError(null), false);
});

test('el estado de los fallbacks nombra la variable pero nunca su valor', () => {
  const anterior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'g22_secreto-de-prueba';

  try {
    const status = getEnvFallbackStatus();
    const cron = status.find((entry) => entry.scope === 'cron:run');

    assert.ok(cron, 'falta la entrada de cron:run');
    assert.deepEqual(cron.names, ['CRON_SECRET']);
    assert.deepEqual(cron.configuredNames, ['CRON_SECRET']);

    // Nada de lo que sale puede contener el secreto.
    assert.equal(JSON.stringify(status).includes('g22_secreto-de-prueba'), false);
  } finally {
    if (anterior === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = anterior;
    }
  }
});

test('cada permiso del catalogo declara que variables de entorno lo cubren', () => {
  const scopesConFallback = getEnvFallbackStatus().map((entry) => entry.scope);

  for (const scope of API_KEY_SCOPES) {
    assert.ok(
      scopesConFallback.includes(scope.id),
      `el permiso ${scope.id} no figura en getEnvFallbackStatus`,
    );
  }
});
