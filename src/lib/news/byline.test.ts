import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bylineOf, cleanAuthorName, newsroomOf } from './byline';

test('la redacción depende del deporte', () => {
    assert.equal(newsroomOf('rugby'), 'Redacción Salida 22');
    assert.equal(newsroomOf('Rugby-Union'), 'Redacción Salida 22');
    assert.equal(newsroomOf('field-hockey'), 'Redacción Córner Corto');
    assert.equal(newsroomOf('hockey'), 'Redacción Córner Corto');
    assert.equal(newsroomOf('football'), 'Redacción G22 Scores');
    assert.equal(newsroomOf('una etiqueta propia'), 'Redacción G22 Scores');
    assert.equal(newsroomOf(null), 'Redacción G22 Scores');
});

test('con autor firma la persona; sin autor, la redacción', () => {
    assert.deepEqual(bylineOf({ author_name: '  Ana   Pérez ', sport: 'rugby' }), { name: 'Ana Pérez', isPerson: true });
    assert.deepEqual(bylineOf({ author_name: '   ', sport: 'field-hockey' }), { name: 'Redacción Córner Corto', isPerson: false });
    assert.deepEqual(bylineOf({ sport: 'rugby' }), { name: 'Redacción Salida 22', isPerson: false });
});

test('cleanAuthorName', () => {
    assert.equal(cleanAuthorName(null), '');
    assert.equal(cleanAuthorName(' a  b '), 'a b');
});
