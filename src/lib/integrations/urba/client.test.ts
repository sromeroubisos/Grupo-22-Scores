import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchChampionship, fetchChampionshipList, HTTP_FORMA_INESPERADA } from './client.ts';

/**
 * Lo que se prueba acá no es el parseo: es la diferencia entre "URBA no tiene
 * nada" y "URBA dejó de mandar lo que mandaba".
 *
 * Las dos llegan como cero partidos. Y el conector compara contra lo que hay en
 * la base, así que confundirlas hace que un torneo entero pase por borrado. Con
 * `huerfanos=borrar` eso es un DELETE. De ahí que la respuesta que no se entiende
 * tenga que salir por `ok: false` y no por `data` vacío.
 */

const conFetch = async (respuesta: { ok?: boolean; status?: number; body?: string }, fn: () => Promise<unknown>) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({
        ok: respuesta.ok ?? true,
        status: respuesta.status ?? 200,
        text: async () => respuesta.body ?? '',
    })) as unknown as typeof fetch;
    try { return await fn(); } finally { globalThis.fetch = original; }
};

const torneo = (over: Record<string, unknown> = {}) => JSON.stringify({
    championship: [{ id: 2025313, name: 'Menores de 15 - G1 A', teams: [], rounds: [], ...over }],
});

test('un torneo bien formado pasa', async () => {
    const r = await conFetch({ body: torneo({ teams: [{ id: 1, club_id: 9, name: 'Club' }] }) },
        () => fetchChampionship(2025313)) as Awaited<ReturnType<typeof fetchChampionship>>;
    assert.equal(r.ok, true);
    assert.equal(r.data?.id, 2025313);
});

/** Un torneo recién creado los trae vacíos, y eso es un dato legítimo. */
test('teams y rounds vacíos son un torneo válido, no un error', async () => {
    const r = await conFetch({ body: torneo() },
        () => fetchChampionship(2025313)) as Awaited<ReturnType<typeof fetchChampionship>>;
    assert.equal(r.ok, true);
    assert.deepEqual(r.data?.rounds, []);
});

test('si falta rounds, la respuesta NO se toma como un torneo sin partidos', async () => {
    const sinRounds = JSON.stringify({ championship: [{ id: 1, name: 'x', teams: [] }] });
    const r = await conFetch({ body: sinRounds },
        () => fetchChampionship(1)) as Awaited<ReturnType<typeof fetchChampionship>>;
    assert.equal(r.ok, false);
    assert.equal(r.status, HTTP_FORMA_INESPERADA);
    assert.equal(r.data, null);
});

test('si rounds deja de ser un array, tampoco', async () => {
    const r = await conFetch({ body: torneo({ rounds: { fecha1: [] } }) },
        () => fetchChampionship(1)) as Awaited<ReturnType<typeof fetchChampionship>>;
    assert.equal(r.ok, false);
    assert.equal(r.status, HTTP_FORMA_INESPERADA);
});

/** Una portada de error de un proxy llega con 200 y cuerpo HTML. */
test('un cuerpo que no es JSON se reporta como forma inesperada, no revienta', async () => {
    const r = await conFetch({ body: '<html><body>502 Bad Gateway</body></html>' },
        () => fetchChampionship(1)) as Awaited<ReturnType<typeof fetchChampionship>>;
    assert.equal(r.ok, false);
    assert.equal(r.status, HTTP_FORMA_INESPERADA);
});

test('un 5xx sigue siendo un 5xx y se distingue de la forma inesperada', async () => {
    const r = await conFetch({ ok: false, status: 500 },
        () => fetchChampionship(1)) as Awaited<ReturnType<typeof fetchChampionship>>;
    assert.equal(r.ok, false);
    assert.equal(r.status, 500);
});

/* ── la lista de torneos del año ────────────────────────────────────────── */

test('la lista pasa cuando es un array, incluso vacío', async () => {
    const r = await conFetch({ body: JSON.stringify({ championships: [] }) },
        () => fetchChampionshipList(2027)) as Awaited<ReturnType<typeof fetchChampionshipList>>;
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, []);
});

test('una lista que no es lista se reporta como forma inesperada', async () => {
    const r = await conFetch({ body: JSON.stringify({ championships: { '1': {} } }) },
        () => fetchChampionshipList(2027)) as Awaited<ReturnType<typeof fetchChampionshipList>>;
    assert.equal(r.ok, false);
    assert.equal(r.status, HTTP_FORMA_INESPERADA);
});
