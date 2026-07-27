import test from 'node:test';
import assert from 'node:assert/strict';
import type { AttributeKey } from '../types/player.ts';
import type { PositionGroup } from '../types/player.ts';
import { attributeDelta } from './aging.ts';
import { createRng } from './random.ts';

// Promedia el delta sobre muchas muestras para cancelar el ruido ±0.4.
function avgDelta(key: AttributeKey, age: number, group: PositionGroup): number {
    const rng = createRng(4242);
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += attributeDelta(key, age, group, rng);
    return sum / n;
}

test('los backs pierden velocidad más fuerte que los forwards pasados los 30', () => {
    const backSpeed = avgDelta('speed', 32, 'back');
    const forwardSpeed = avgDelta('speed', 32, 'forward');
    assert.ok(backSpeed < forwardSpeed, `back ${backSpeed} debería declinar más que forward ${forwardSpeed}`);
    assert.ok(backSpeed < 0 && forwardSpeed < 0, 'ambos deberían estar declinando a los 32');
});

test('la visión sigue creciendo hasta grande (delta positivo a los 30)', () => {
    assert.ok(avgDelta('vision', 30, 'back') > 0, 'la visión debería crecer a los 30');
    assert.ok(avgDelta('mental', 30, 'forward') > 0, 'lo mental debería crecer a los 30');
});

test('el físico crece de joven y declina de veterano', () => {
    assert.ok(avgDelta('power', 21, 'forward') > 0, 'la potencia debería crecer a los 21');
    assert.ok(avgDelta('power', 35, 'forward') < 0, 'la potencia debería declinar a los 35');
});
