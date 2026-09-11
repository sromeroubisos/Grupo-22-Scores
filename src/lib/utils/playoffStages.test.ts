import test from 'node:test';
import assert from 'node:assert/strict';

import { readPlayoffBracketMode } from './playoffStages.ts';

/**
 * El modo decide si las rutas de fase arman slots manuales o se los dejan al
 * constructor. Una fase vieja no tiene la clave: tiene que leerse como manual,
 * salvo que el constructor ya le haya generado un cuadro.
 */
test('sin clave, una fase es manual', () => {
    assert.equal(readPlayoffBracketMode(undefined), 'manual');
    assert.equal(readPlayoffBracketMode({}), 'manual');
    assert.equal(readPlayoffBracketMode({ teamsCount: 8, playoffStages: [{ name: 'Final' }] }), 'manual');
});

test('la clave explicita manda', () => {
    assert.equal(readPlayoffBracketMode({ bracketMode: 'auto' }), 'auto');
    assert.equal(readPlayoffBracketMode({ bracketMode: 'manual', bracketBuilder: { templateId: 'oro_plata' } }), 'manual');
    assert.equal(readPlayoffBracketMode({ bracketMode: 'otra cosa' }), 'manual');
});

test('un cuadro generado por el constructor cuenta como automatico', () => {
    assert.equal(readPlayoffBracketMode({ bracketBuilder: { templateId: 'single_elimination', teamCount: 8 } }), 'auto');
    assert.equal(readPlayoffBracketMode({ bracketBuilder: {} }), 'manual');
});
