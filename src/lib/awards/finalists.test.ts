import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeName, pickFinalists, rankCandidates, subjectKeyFor, votePercentages, type NominationRow } from './finalists';

function row(partial: Partial<NominationRow> & { userId: string; subjectKey: string }): NominationRow {
    return {
        subjectName: partial.subjectKey,
        personId: null,
        clubId: null,
        clubName: null,
        status: 'pending',
        createdAt: '2026-10-01T10:00:00.000Z',
        ...partial,
    };
}

test('el apoyo cuenta usuarios distintos y ordena de mayor a menor', () => {
    const ranked = rankCandidates([
        row({ userId: 'u1', subjectKey: 'p:a' }),
        row({ userId: 'u2', subjectKey: 'p:a' }),
        row({ userId: 'u3', subjectKey: 'p:a' }),
        row({ userId: 'u1', subjectKey: 'p:b' }),
        row({ userId: 'u2', subjectKey: 'p:b' }),
        row({ userId: 'u1', subjectKey: 'p:c' }),
    ]);
    assert.deepEqual(ranked.map((c) => [c.subjectKey, c.support]), [['p:a', 3], ['p:b', 2], ['p:c', 1]]);
});

test('el mismo usuario repetido no suma dos veces', () => {
    const ranked = rankCandidates([
        row({ userId: 'u1', subjectKey: 'p:a' }),
        row({ userId: 'u1', subjectKey: 'p:a' }),
    ]);
    assert.equal(ranked[0].support, 1);
});

test('las rechazadas no cuentan', () => {
    const ranked = rankCandidates([
        row({ userId: 'u1', subjectKey: 'p:a', status: 'rejected' }),
        row({ userId: 'u2', subjectKey: 'p:b' }),
    ]);
    assert.deepEqual(ranked.map((c) => c.subjectKey), ['p:b']);
});

test('empate: gana la postulación más vieja y después el nombre', () => {
    const ranked = rankCandidates([
        row({ userId: 'u1', subjectKey: 'p:z', subjectName: 'Zeta', createdAt: '2026-10-02T00:00:00.000Z' }),
        row({ userId: 'u2', subjectKey: 'p:a', subjectName: 'Alfa', createdAt: '2026-10-03T00:00:00.000Z' }),
        row({ userId: 'u3', subjectKey: 'p:m', subjectName: 'Mu', createdAt: '2026-10-02T00:00:00.000Z' }),
    ]);
    assert.deepEqual(ranked.map((c) => c.subjectName), ['Mu', 'Zeta', 'Alfa']);
});

test('pickFinalists respeta el tope', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key, i) => row({ userId: `u${i}`, subjectKey: `p:${key}` }));
    assert.equal(pickFinalists(rows, 5).length, 5);
});

test('un candidato con id de la base prefiere ese dato al texto libre', () => {
    const [candidate] = rankCandidates([
        row({ userId: 'u1', subjectKey: 'p:a', subjectName: 'juan perez' }),
        row({ userId: 'u2', subjectKey: 'p:a', subjectName: 'Juan Pérez', personId: 'a', clubId: 'club-1', clubName: 'CASI' }),
    ]);
    assert.equal(candidate.subjectName, 'Juan Pérez');
    assert.equal(candidate.clubName, 'CASI');
});

test('subjectKeyFor: id de la base, club y nombre a mano', () => {
    assert.equal(subjectKeyFor({ personId: 'abc', name: 'X' }), 'p:abc');
    assert.equal(subjectKeyFor({ club: true, clubId: 'c1', name: 'CASI' }), 'c:c1');
    assert.equal(subjectKeyFor({ name: '  Joaquín  Pérez ', clubId: 'c1' }), 'n:joaquin perez|c1');
    assert.equal(normalizeName('ÁÉÍ  ñu'), 'aei nu');
});

test('votePercentages suma 100 y maneja cero votos', () => {
    assert.deepEqual(votePercentages([0, 0]), [0, 0]);
    const p = votePercentages([1, 1, 1]);
    assert.equal(p.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(votePercentages([3, 1]), [75, 25]);
});
