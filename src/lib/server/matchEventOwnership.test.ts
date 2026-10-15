import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    FOREIGN_EVENT_MESSAGE,
    assertEventIdsBelongToMatch,
    findForeignEventIds,
} from './matchEventOwnership.ts';

/**
 * Regresion del IDOR de eventos: el upsert de `match_events` es por `id` global
 * y el id lo manda el cliente, asi que un editor del partido A podia reescribir
 * y mudar a A un evento del partido B mandando su UUID.
 */

const PARTIDO_A = 'partido-a';
const PARTIDO_B = 'partido-b';
const EVENTO_DE_A = '11111111-1111-4111-8111-111111111111';
const EVENTO_DE_B = '22222222-2222-4222-8222-222222222222';
const EVENTO_NUEVO = '33333333-3333-4333-8333-333333333333';

/** Cliente falso: guarda la consulta y devuelve las filas que existen de esos ids. */
function clienteCon(filas: Array<{ id: string; match_id: string }>, error: unknown = null) {
    const consultas: string[][] = [];
    const client = {
        from(tabla: string) {
            assert.equal(tabla, 'match_events');
            return {
                select() {
                    return {
                        in(_col: string, ids: string[]) {
                            consultas.push(ids);
                            return Promise.resolve({
                                data: error ? null : filas.filter((f) => ids.includes(f.id)),
                                error,
                            });
                        },
                    };
                },
            };
        },
    };
    return { client, consultas };
}

const FILAS = [
    { id: EVENTO_DE_A, match_id: PARTIDO_A },
    { id: EVENTO_DE_B, match_id: PARTIDO_B },
];

test('findForeignEventIds marca solo los ids colgados de otro partido', () => {
    assert.deepEqual(findForeignEventIds(FILAS, PARTIDO_A), [EVENTO_DE_B]);
    assert.deepEqual(findForeignEventIds(FILAS, PARTIDO_B), [EVENTO_DE_A]);
    assert.deepEqual(findForeignEventIds([], PARTIDO_A), []);
});

test('rechaza un id que pertenece a otro partido', async () => {
    const { client } = clienteCon(FILAS);
    await assert.rejects(
        assertEventIdsBelongToMatch(client, PARTIDO_A, [EVENTO_DE_A, EVENTO_DE_B]),
        { message: FOREIGN_EVENT_MESSAGE },
    );
});

test('deja pasar eventos propios y eventos nuevos', async () => {
    const { client } = clienteCon(FILAS);
    await assertEventIdsBelongToMatch(client, PARTIDO_A, [EVENTO_DE_A, EVENTO_NUEVO]);
});

test('sin ids no consulta la base', async () => {
    const { client, consultas } = clienteCon(FILAS);
    await assertEventIdsBelongToMatch(client, PARTIDO_A, []);
    await assertEventIdsBelongToMatch(client, PARTIDO_A, ['', null, undefined]);
    assert.equal(consultas.length, 0);
});

test('deduplica los ids antes de consultar', async () => {
    const { client, consultas } = clienteCon(FILAS);
    await assertEventIdsBelongToMatch(client, PARTIDO_A, [EVENTO_DE_A, EVENTO_DE_A, ` ${EVENTO_DE_A} `]);
    assert.deepEqual(consultas, [[EVENTO_DE_A]]);
});

test('si la consulta falla, no escribe a ciegas', async () => {
    const { client } = clienteCon(FILAS, { message: 'boom' });
    await assert.rejects(
        assertEventIdsBelongToMatch(client, PARTIDO_A, [EVENTO_NUEVO]),
        { message: 'No se pudieron validar los eventos del partido.' },
    );
});

test('todo upsert de match_events en matchCenterService pasa antes por el guard', () => {
    const fuente = fs.readFileSync(
        path.join(process.cwd(), 'src/lib/services/matchCenterService.ts'),
        'utf8',
    );
    const lineas = fuente.split('\n');
    const upserts = lineas
        .map((linea, i) => ({ linea, i }))
        .filter(({ linea }) => /\.upsert\(eventRows,\s*\{\s*onConflict:\s*'id'\s*\}\)/.test(linea));

    assert.ok(upserts.length >= 2, 'se esperaban los dos upserts de eventos');
    for (const { i } of upserts) {
        const previas = lineas.slice(Math.max(0, i - 4), i).join('\n');
        assert.match(
            previas,
            /assertEventIdsBelongToMatch\(client, matchId,/,
            `el upsert de la linea ${i + 1} no valida que los ids sean del partido`,
        );
    }
});
