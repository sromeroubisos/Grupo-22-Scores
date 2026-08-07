import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TABLE_TYPE, TABLE_TYPES, isTableType, normalizeTableType } from './tableType.ts';

test('las tres perspectivas son general, home y away', () => {
    assert.deepEqual([...TABLE_TYPES], ['general', 'home', 'away']);
    assert.equal(DEFAULT_TABLE_TYPE, 'general');
});

test('acepta las tres y rechaza cualquier otra cosa', () => {
    assert.equal(isTableType('general'), true);
    assert.equal(isTableType('home'), true);
    assert.equal(isTableType('away'), true);
    assert.equal(isTableType('local'), false);
    assert.equal(isTableType('visitante'), false);
    assert.equal(isTableType(''), false);
    assert.equal(isTableType(null), false);
});

test('la ausencia del campo cae al default; un valor cualquiera no', () => {
    assert.equal(normalizeTableType(undefined), 'general');
    assert.equal(normalizeTableType(null), 'general');
    assert.equal(normalizeTableType(''), 'general');
    assert.equal(normalizeTableType('   '), 'general');

    // Distinguir esto del default es todo el punto del módulo: un fallback
    // silencioso recalcularía la tabla equivocada.
    assert.equal(normalizeTableType('local'), null);
    assert.equal(normalizeTableType('GENERAL; DROP TABLE'), null);
    assert.equal(normalizeTableType(7), null);
    assert.equal(normalizeTableType({ tableType: 'home' }), null);
});

test('tolera mayúsculas y espacios al costado', () => {
    assert.equal(normalizeTableType(' Home '), 'home');
    assert.equal(normalizeTableType('AWAY'), 'away');
});
