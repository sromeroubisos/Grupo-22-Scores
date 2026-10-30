import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { FOREIGN_ROSTER_MESSAGE, assertDivisionBelongsToClub } from './rosterScope.ts';

/**
 * Regresion del plantel ajeno: /api/club-admin/roster autorizaba sobre `clubId`
 * pero operaba sobre el club embebido en `divisionId`, con service role. Un
 * editor del club A mandaba `club-roster-<B>` y leia, pisaba o desvinculaba
 * jugadores de B.
 */

const CLUB_A = 'club-a';
const CLUB_B = 'club-b';
const RAIZ = 'club-raiz';

type Vinculo = { roster_owner_club_id: string; division_club_id: string };

/** Cliente falso de club_family_divisions: aplica los .eq() y cuenta consultas. */
function clienteCon(vinculos: Vinculo[], error: unknown = null) {
    let consultas = 0;
    const client = {
        from(tabla: string) {
            assert.equal(tabla, 'club_family_divisions');
            consultas += 1;
            const filtros: Array<[keyof Vinculo, string]> = [];
            const query = {
                select: () => query,
                eq(col: keyof Vinculo, valor: string) {
                    filtros.push([col, valor]);
                    return query;
                },
                limit: () => query,
                maybeSingle: () => Promise.resolve({
                    data: error ? null : vinculos.find((v) => filtros.every(([c, val]) => v[c] === val)) ?? null,
                    error,
                }),
            };
            return query;
        },
    };
    return { client, consultas: () => consultas };
}

const rechaza = (promesa: Promise<void>) => assert.rejects(promesa, { message: FOREIGN_ROSTER_MESSAGE });

test('una division comun o la ausencia de division pasan sin consultar', async () => {
    const { client, consultas } = clienteCon([]);
    await assertDivisionBelongsToClub(client, CLUB_A, undefined);
    await assertDivisionBelongsToClub(client, CLUB_A, null);
    await assertDivisionBelongsToClub(client, CLUB_A, '');
    await assertDivisionBelongsToClub(client, CLUB_A, '0b7c2c9e-3f4a-4d8e-9a6b-1c2d3e4f5a6b');
    assert.equal(consultas(), 0);
});

test('el plantel base del propio club pasa sin consultar', async () => {
    const { client, consultas } = clienteCon([]);
    await assertDivisionBelongsToClub(client, CLUB_A, `club-roster-${CLUB_A}`);
    await assertDivisionBelongsToClub(client, CLUB_A, `family-division|${CLUB_A}|M19`);
    assert.equal(consultas(), 0);
});

test('rechaza el plantel base de otro club', async () => {
    const { client } = clienteCon([]);
    await rechaza(assertDivisionBelongsToClub(client, CLUB_A, `club-roster-${CLUB_B}`));
});

test('rechaza una division de familia de otro club', async () => {
    const { client } = clienteCon([]);
    await rechaza(assertDivisionBelongsToClub(client, CLUB_A, `family-division|${CLUB_B}|Primera`));
});

test('deja pasar el plantel compartido que club_family_divisions le asigna al club', async () => {
    const { client } = clienteCon([{ roster_owner_club_id: RAIZ, division_club_id: CLUB_A }]);
    await assertDivisionBelongsToClub(client, CLUB_A, `family-division|${RAIZ}|M17`);
    await assertDivisionBelongsToClub(client, CLUB_A, `club-roster-${RAIZ}`);
});

test('un vinculo de otro club con la misma raiz no habilita al club', async () => {
    const { client } = clienteCon([{ roster_owner_club_id: RAIZ, division_club_id: CLUB_B }]);
    await rechaza(assertDivisionBelongsToClub(client, CLUB_A, `family-division|${RAIZ}|M17`));
});

test('si la consulta falla, no opera a ciegas', async () => {
    const { client } = clienteCon([{ roster_owner_club_id: RAIZ, division_club_id: CLUB_A }], { message: 'boom' });
    await rechaza(assertDivisionBelongsToClub(client, CLUB_A, `club-roster-${RAIZ}`));
});

test('los cuatro verbos de /api/club-admin/roster validan el plantel antes de tocar personService', () => {
    const fuente = fs.readFileSync(
        path.join(process.cwd(), 'src/app/api/club-admin/roster/route.ts'),
        'utf8',
    );
    const llamadas = ['fetchPeopleByDivision(', 'addPersonToClub(clubId', 'updatePersonInClub(clubId', 'deletePersonFromClub(clubId'];
    for (const verbo of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const inicio = fuente.indexOf(`export async function ${verbo}(`);
        assert.ok(inicio >= 0, `falta el handler ${verbo}`);
        const fin = fuente.indexOf('export async function', inicio + 1);
        const cuerpo = fuente.slice(inicio, fin === -1 ? undefined : fin);
        const guard = cuerpo.indexOf('ensureDivisionInScope(admin, clubId,');
        assert.ok(guard >= 0, `${verbo} no valida el plantel`);
        const primera = Math.min(...llamadas.map((l) => cuerpo.indexOf(l)).filter((i) => i >= 0));
        assert.ok(guard < primera, `${verbo} llama a personService antes de validar el plantel`);
    }
});
