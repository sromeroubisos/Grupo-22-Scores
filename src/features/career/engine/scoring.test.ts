import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attributes } from '../types/player.ts';
import { ALL_POSITIONS, weightsSum } from '../data/positions.ts';
import { computeOvr, computeEffectiveOvr } from './scoring.ts';
import { createPlayer } from './create-player.ts';
import { createRng } from './random.ts';

test('los pesos de OVR de cada posición suman 100', () => {
    for (const pos of ALL_POSITIONS) {
        assert.equal(weightsSum(pos), 100, `${pos} no suma 100`);
    }
});

test('un mismo set de atributos da OVR distinto según la posición', () => {
    const speedy: Attributes = { power: 30, speed: 92, technique: 60, tackle: 40, kick: 40, vision: 55, mental: 50, stamina: 55 };
    // Perfil veloz: el wing (peso VEL 30) debe puntuar más que el pilar (peso VEL 5).
    assert.ok(computeOvr(speedy, 'wing') > computeOvr(speedy, 'prop'), 'wing debería superar al pilar con perfil veloz');

    const heavy: Attributes = { power: 92, speed: 32, technique: 55, tackle: 70, kick: 20, vision: 45, mental: 50, stamina: 85 };
    // Perfil de choque: el pilar (peso POT 30 + RES 25) debe superar al wing.
    assert.ok(computeOvr(heavy, 'prop') > computeOvr(heavy, 'wing'), 'pilar debería superar al wing con perfil de choque');
});

test('OVR efectivo = OVR + forma*0.04 + moral*0.03 - fatiga*0.05 (sin lesiones)', () => {
    const rng = createRng(999);
    const player = createPlayer({ nickname: 'Test', position: 'centre', origin: 'academia-club' }, rng);
    player.injuries = [];
    player.dynamics = { morale: 70, form: 60, fatigue: 40, fame: 20, injuryRisk: 10 };

    const ovr = computeOvr(player.attributes, player.position);
    const expected = Math.max(1, Math.round((ovr + 60 * 0.04 + 70 * 0.03 - 40 * 0.05) * 10) / 10);
    assert.equal(computeEffectiveOvr(player), expected);
});
