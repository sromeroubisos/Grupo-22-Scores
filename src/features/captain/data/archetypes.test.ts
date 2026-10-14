// EL ARQUETIPO CAMBIA LA FORMA, NO EL NIVEL.
//
// Lo que este archivo afirma es lo que `archetypes.ts` promete: tres por
// puesto, un traspaso entre dos atributos de la media del puesto, y una media
// de arranque que casi no se mueve —si se moviera, todo el que juega desde la
// pantalla estaría calibrado para otro jugador que el de `calibration.test.ts`—.
// Y que no consume azar: la misma semilla sortea lo mismo con o sin arquetipo.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_FAMILIES, baseAttributes, getFamily } from './positions.ts';
import { ARCHETYPES, applyArchetype, archetypeDelta, archetypeOfFlags, archetypesFor } from './archetypes.ts';
import { ovrFromAttributes } from '../engine/ovr.ts';
import { createInitialCaptain } from '../state/captain-reducer.ts';

test('tres arquetipos por puesto, con ids únicos', () => {
    for (const family of ALL_FAMILIES) assert.equal(archetypesFor(family).length, 3, family);
    assert.equal(new Set(ARCHETYPES.map((a) => a.id)).size, ARCHETYPES.length);
});

test('el traspaso es entre dos atributos de la media del puesto', () => {
    for (const a of ARCHETYPES) {
        const attrs = getFamily(a.family).attributes;
        assert.ok(attrs.includes(a.plus), `${a.id}: ${a.plus} no cuenta para la media`);
        assert.ok(attrs.includes(a.minus), `${a.id}: ${a.minus} no cuenta para la media`);
        assert.notEqual(a.plus, a.minus);
        assert.ok(!a.text.includes('!') && !a.label.includes('!'), 'sin signos de exclamación');
    }
});

test('EL ARQUETIPO CAMBIA LA FORMA, NO EL NIVEL: la media de arranque se mueve a lo sumo un punto', () => {
    for (const a of ARCHETYPES) {
        const base = baseAttributes(a.family);
        const antes = ovrFromAttributes(a.family, base);
        const despues = ovrFromAttributes(a.family, applyArchetype(base, a));
        assert.ok(Math.abs(despues - antes) <= 1, `${a.id}: media ${antes} → ${despues} (${JSON.stringify(archetypeDelta(a))})`);
    }
});

test('no consume azar, y queda anotado', () => {
    const input = { name: 'X', surname: 'Y', family: 'apertura' as const, countryCode: 'ar' };
    const sin = createInitialCaptain(input, 4242);
    const con = createInitialCaptain({ ...input, archetype: 'ap-pateador' }, 4242);
    assert.equal(con.rngState, sin.rngState);
    assert.equal(con.player.attrs.pegada, Math.min(99, sin.player.attrs.pegada + 6));
    assert.equal(archetypeOfFlags(con.player.flags)?.id, 'ap-pateador');
    assert.equal(archetypeOfFlags(sin.player.flags), null);

    // Uno de otro puesto se ignora: no hay pateador entre los pilares.
    const ajeno = createInitialCaptain({ ...input, family: 'primera-linea', archetype: 'ap-pateador' }, 4242);
    assert.equal(archetypeOfFlags(ajeno.player.flags), null);
});
