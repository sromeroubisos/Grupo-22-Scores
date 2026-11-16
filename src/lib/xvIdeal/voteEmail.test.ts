import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ballotRows, buildVoteEmail, maskEmail } from './voteEmail';
import { normalizeSlots } from './xvIdeal';

const SLOTS = normalizeSlots([
    { jersey: 10, label: 'Apertura', candidates: [{ id: '10-a', name: 'José <b>Ticinese</b>', team: 'Buenos Aires', logo: '/clubs/buenos-aires-m17.png' }] },
    { jersey: 1, label: 'Pilar izquierdo', candidates: [{ id: '1-a', name: 'Facundo Azurmendi', team: 'Rosario' }] },
]);

test('ballotRows ordena por camiseta, lleva el escudo y descarta lo que no está en la votación', () => {
    const rows = ballotRows(SLOTS, { '10': '10-a', '1': '1-a', '2': 'x' });
    assert.deepEqual(rows.map((row) => row.jersey), [1, 10]);
    assert.equal(rows[1].logo, '/clubs/buenos-aires-m17.png');
    assert.equal(rows[0].logo, null);
    assert.deepEqual(ballotRows(SLOTS, { '10': 'otro' }), []);
});

test('maskEmail no repite la dirección entera', () => {
    assert.equal(maskEmail('juan.perez@gmail.com'), 'j***@gmail.com');
    assert.equal(maskEmail('sin-arroba'), '');
});

test('buildVoteEmail lista los puestos, escapa el HTML y cambia el cierre según el estado', () => {
    const rows = ballotRows(SLOTS, { '10': '10-a', '1': '1-a' });
    const base = { zoneName: 'Zona Campeonato', pollTitle: 'XV Ideal', rows, url: 'https://g22scores.com/xv-ideal/x' };
    const open = buildVoteEmail({ ...base, isOpen: true, withPlates: true });
    assert.match(open.subject, /Zona Campeonato/);
    assert.match(open.text, /1 · Pilar izquierdo: Facundo Azurmendi \(Rosario\)/);
    assert.match(open.text, /Podés cambiar tu voto/);
    assert.match(open.text, /dos placas/);
    assert.ok(!open.html.includes('<b>Ticinese</b>'), 'el nombre se escapa');
    assert.match(open.html, /&lt;b&gt;Ticinese&lt;\/b&gt;/);

    const closed = buildVoteEmail({ ...base, isOpen: false, withPlates: false });
    assert.match(closed.text, /ya cerró/);
    assert.ok(!closed.text.includes('Podés cambiar'));
    assert.ok(!closed.text.includes('placas'), 'sin adjuntos no se promete la placa');
});
