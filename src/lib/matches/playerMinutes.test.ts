import test from 'node:test';
import assert from 'node:assert/strict';

import { computeMatchMinutes } from './playerMinutes.ts';

const lineups = {
    home: [
        { id: 'a', name: 'Titular completo', role: 'starter' },
        { id: 'b', name: 'Titular que sale', role: 'starter' },
        { id: 'c', name: 'Suplente que entra', role: 'substitute' },
        { id: 'd', name: 'Suplente sin entrar', role: 'substitute' },
        { id: 'e', name: 'Titular expulsado', role: 'starter' },
    ],
    away: [{ id: 'z', name: 'Rival', role: 'starter' }],
};

const events = [
    { type: 'substitution', minute: 45, team: 'home', playerId: 'b', secondaryPlayerId: 'c' },
    { type: 'red_card', minute: 60, team: 'home', playerId: 'e' },
];

test('calcula minutos de titulares, suplentes y expulsados', () => {
    const byId = new Map(computeMatchMinutes(lineups, events).map((p) => [p.playerId, p.minutes]));
    assert.equal(byId.get('a'), 80);
    assert.equal(byId.get('b'), 45);
    assert.equal(byId.get('c'), 35);
    assert.equal(byId.has('d'), false);
    assert.equal(byId.get('e'), 60);
    assert.equal(byId.get('z'), 80);
});

test('sin ningun cambio cargado no se inventan minutos', () => {
    assert.deepEqual(computeMatchMinutes(lineups, [{ type: 'try', minute: 10, team: 'home', playerId: 'a' }]), []);
});
