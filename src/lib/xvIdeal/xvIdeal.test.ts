import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    byVotes,
    candidateId,
    isCompleteBallot,
    isXvPollOpen,
    normalizeSlots,
    sanitizePicks,
    slugify,
    summarizeXvPoll,
    type XvPoll,
} from './xvIdeal';

const SLOTS = normalizeSlots([
    {
        jersey: 10,
        label: 'Apertura',
        candidates: [
            { id: '10-ticinese', name: 'José Ticinese', team: 'Buenos Aires', pj: 5, points: 36 },
            { id: '10-saravia', name: 'Francisco Saravia Toledo', team: 'Salta', pj: 5, points: 18 },
        ],
    },
    {
        jersey: 1,
        label: 'Pilar izquierdo',
        candidates: [{ id: '1-azurmendi', name: 'Facundo Azurmendi', team: 'Buenos Aires', pj: 5, points: 0 }],
    },
]);

const POLL: XvPoll = {
    id: 'p1',
    groupKey: 'g',
    tournamentId: null,
    name: 'Zona Campeonato',
    title: 'XV Ideal',
    position: 0,
    status: 'open',
    slots: SLOTS,
    closesAt: null,
    createdAt: '',
    updatedAt: '',
};

test('slugify saca tildes y signos; candidateId lleva la camiseta', () => {
    assert.equal(slugify('Juan Bautista Arévalo Costanza'), 'juan-bautista-arevalo-costanza');
    assert.equal(candidateId(4, 'Julián Migra Dec'), '4-julian-migra-dec');
});

test('normalizeSlots ordena por camiseta y descarta lo inválido', () => {
    assert.deepEqual(SLOTS.map((slot) => slot.jersey), [1, 10]);
    const raw = [
        { jersey: 16, label: 'x', candidates: [{ id: 'a', name: 'A' }] },
        { jersey: 2, label: 'Hooker', candidates: [] },
        { jersey: 3, label: 'Pilar', candidates: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }, { name: 'sin id' }] },
        { jersey: 3, label: 'repetida', candidates: [{ id: 'z', name: 'Z' }] },
    ];
    const out = normalizeSlots(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].candidates.length, 1);
    assert.equal(out[0].candidates[0].pj, null);
});

test('sanitizePicks solo deja candidatos de esa camiseta', () => {
    const picks = sanitizePicks(SLOTS, { '10': '10-ticinese', '1': '10-saravia', '99': 'x', '2': 5 });
    assert.deepEqual(picks, { '10': '10-ticinese' });
    assert.deepEqual(sanitizePicks(SLOTS, null), {});
    assert.deepEqual(sanitizePicks(SLOTS, ['10-ticinese']), {});
});

test('isCompleteBallot exige un jugador en cada camiseta de la zona', () => {
    assert.equal(isCompleteBallot(SLOTS, { '10': '10-ticinese' }), false);
    assert.equal(isCompleteBallot(SLOTS, { '10': '10-ticinese', '1': '1-azurmendi' }), true);
    assert.equal(isCompleteBallot([], {}), false);
});

test('normalizeSlots solo acepta escudos con ruta propia del sitio', () => {
    const [slot] = normalizeSlots([
        {
            jersey: 1,
            label: 'Pilar',
            candidates: [
                { id: 'a', name: 'A', logo: '/clubs/x.png' },
                { id: 'b', name: 'B', logo: 'https://ajeno.com/x.png' },
                { id: 'c', name: 'C' },
            ],
        },
    ]);
    assert.deepEqual(slot.candidates.map((c) => c.logo), ['/clubs/x.png', null, null]);
});

test('isXvPollOpen respeta el estado y la fecha de cierre', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    assert.equal(isXvPollOpen({ status: 'open', closesAt: null }, now), true);
    assert.equal(isXvPollOpen({ status: 'closed', closesAt: null }, now), false);
    assert.equal(isXvPollOpen({ status: 'open', closesAt: '2026-11-16T11:00:00Z' }, now), false);
    assert.equal(isXvPollOpen({ status: 'open', closesAt: '2026-11-17T11:00:00Z' }, now), true);
});

test('summarizeXvPoll cuenta por camiseta, ordena y devuelve la boleta propia', () => {
    const votes = [
        { userId: 'u1', picks: { '10': '10-ticinese', '1': '1-azurmendi' } },
        { userId: 'u2', picks: { '10': '10-saravia' } },
        { userId: 'u3', picks: { '10': '10-saravia', '1': 'inexistente' } },
        { userId: 'u4', picks: {} },
    ];
    const summary = summarizeXvPoll(POLL, votes, 'u2', 0);

    assert.equal(summary.voters, 3, 'u4 mandó una boleta vacía: no cuenta');
    const apertura = summary.results.find((r) => r.jersey === 10)!;
    assert.equal(apertura.total, 3);
    assert.deepEqual(apertura.candidates.map((c) => [c.id, c.votes, c.percent]), [
        ['10-ticinese', 1, 33],
        ['10-saravia', 2, 67],
    ]);
    assert.deepEqual(byVotes(apertura.candidates).map((c) => c.id), ['10-saravia', '10-ticinese']);
    assert.equal(summary.results.find((r) => r.jersey === 1)!.total, 1);
    assert.deepEqual(summary.userPicks, { '10': '10-saravia' });
    assert.equal(summarizeXvPoll(POLL, votes, null, 0).userPicks, null);
    assert.equal('slots' in summary, false);
});

test('sin votos, todo en cero y en el orden de carga (byVotes lo respeta)', () => {
    const summary = summarizeXvPoll(POLL, [], null, 0);
    const apertura = summary.results.find((r) => r.jersey === 10)!;
    assert.deepEqual(apertura.candidates.map((c) => c.id), ['10-ticinese', '10-saravia']);
    assert.ok(apertura.candidates.every((c) => c.votes === 0 && c.percent === 0));
    assert.deepEqual(byVotes(apertura.candidates).map((c) => c.id), ['10-ticinese', '10-saravia']);
});
