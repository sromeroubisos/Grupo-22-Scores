// ¿Es el mismo jugador? Y sobre todo: cuándo NO hay que preguntar.
//
// La regla es sobre el NOMBRE COMPLETO. Preguntar de más es tan malo como
// preguntar de menos: en un plantel de rugby los hermanos son moneda corriente, y
// un cuadro que se abre por cada apellido repetido no lo lee nadie — se aprieta
// "no" trece veces seguidas y la catorceava, que era la buena, también.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    comparePlayerNames,
    findPlayerMatches,
    normalizePlayerName,
    splitPlayerName,
} from './playerNameMatch.ts';

test('el mismo nombre y apellido se pregunta', () => {
    assert.equal(comparePlayerNames('Juan Pérez', 'Juan Pérez'), 'exact');
    // La tilde no hace a dos personas. Es el bug que ya dejó fichas duplicadas.
    assert.equal(comparePlayerNames('Julián Montoya', 'Julian Montoya'), 'exact');
    assert.equal(comparePlayerNames('  JUAN   PEREZ ', 'juan perez'), 'exact');
});

test('la escritura parecida se pregunta', () => {
    assert.equal(comparePlayerNames('Gonzalo Bertranou', 'Gonzalo Bertranu'), 'similar');
    assert.equal(comparePlayerNames('Thomas Gallo', 'Tomas Gallo'), 'similar');
    assert.equal(comparePlayerNames('Santiago Carreras', 'Santiago Carrera'), 'similar');
});

test('el segundo nombre que a veces está y a veces no', () => {
    // El caso más común de una planilla, y el que ninguna medida de parecido junta:
    // están a ocho letras de distancia.
    assert.equal(comparePlayerNames('Juan Ignacio Pérez', 'Juan Pérez'), 'similar');
    assert.equal(comparePlayerNames('Juan Pérez', 'Juan Ignacio Pérez'), 'similar');
});

test('MISMO APELLIDO PERO DISTINTO NOMBRE NO SE PREGUNTA', () => {
    assert.equal(comparePlayerNames('Juan Pérez', 'Pedro Pérez'), null);
    assert.equal(comparePlayerNames('Marcos Kremer', 'Guido Kremer'), null);
    // Dos hermanos en el mismo plantel: el caso que hace inservible al cuadro si se
    // pregunta por apellido.
    assert.equal(comparePlayerNames('Matías Orlando', 'Facundo Orlando'), null);
});

test('apellidos distintos no son la misma persona', () => {
    assert.equal(comparePlayerNames('Juan Pérez', 'Juan Gómez'), null);
    assert.equal(comparePlayerNames('Santiago Carreras', 'Santiago Chocobares'), null);
});

test('un nombre vacío no matchea con nada', () => {
    assert.equal(comparePlayerNames('', 'Juan Pérez'), null);
    assert.equal(comparePlayerNames('Juan Pérez', ''), null);
    assert.equal(comparePlayerNames(null, undefined), null);
});

test('partir el nombre deja el apellido al final', () => {
    assert.deepEqual(splitPlayerName(normalizePlayerName('Juan Ignacio Pérez')), {
        first: ['juan', 'ignacio'],
        last: 'perez',
    });
    // Un solo token es apellido, no nombre: es como se carga a un jugador conocido
    // por el apellido solo.
    assert.deepEqual(splitPlayerName(normalizePlayerName('Montoya')), { first: [], last: 'montoya' });
});

test('las candidatas vienen ordenadas, y la exacta primero', () => {
    const candidatos = [
        { id: 'a', fullName: 'Gonzalo Bertranu' },
        { id: 'b', fullName: 'Gonzalo Bertranou' },
        { id: 'c', fullName: 'Pedro Bertranou' },
    ];

    const encontrados = findPlayerMatches('Gonzalo Bertranou', candidatos);
    assert.deepEqual(encontrados.map((m) => m.person.id), ['b', 'a']);
    assert.equal(encontrados[0].kind, 'exact');
    assert.equal(encontrados[1].kind, 'similar');
});

test('sin candidatas parecidas no se pregunta nada', () => {
    const encontrados = findPlayerMatches('Juan Pérez', [
        { id: 'a', fullName: 'Pedro Pérez' },
        { id: 'b', fullName: 'Marcos Kremer' },
    ]);
    assert.deepEqual(encontrados, []);
});
