import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PLAYER_KEY_MAX,
    PLAYER_NAME_MAX,
    cleanPlayerName,
    isValidPlayerKey,
    pickMvp,
    type PlayerRatingSummary,
} from './matchPlayerRatings.ts';

/**
 * Regresion del "puntaje de la gente": la clave y el nombre del jugador llegan
 * del cliente y el servidor no conoce la formacion. Una cuenta inventaba
 * jugadores con cualquier nombre, y una clave inventada con votos de figura
 * dejaba el lugar de la figura vacio en la ficha.
 */

function jugador(playerKey: string, mvpVotes: number, score: number | null = 5, playerName = playerKey): PlayerRatingSummary {
    return {
        playerKey,
        playerName,
        team: 'home',
        counts: { 1: 0, 2: 1, 3: 0 },
        votes: 1,
        score,
        mvpVotes,
    };
}

test('pickMvp: gana el mas votado, desempata la nota y despues el nombre', () => {
    assert.equal(pickMvp([jugador('a', 2), jugador('b', 5)])?.playerKey, 'b');
    assert.equal(pickMvp([jugador('a', 3, 4), jugador('b', 3, 8)])?.playerKey, 'b');
    assert.equal(pickMvp([jugador('b', 3, 6, 'Zarate'), jugador('a', 3, 6, 'Alvarez')])?.playerKey, 'a');
    assert.equal(pickMvp([jugador('a', 0)]), null);
    assert.equal(pickMvp([]), null);
});

test('pickMvp: una clave fuera de la formacion no se queda con la figura', () => {
    const resumen = [jugador('inventado', 40), jugador('real-9', 3), jugador('real-10', 1)];
    const formacion = new Set(['real-9', 'real-10']);
    assert.equal(pickMvp(resumen)?.playerKey, 'inventado');
    assert.equal(pickMvp(resumen, formacion)?.playerKey, 'real-9');
    assert.equal(pickMvp([jugador('inventado', 40)], formacion), null);
});

test('cleanPlayerName: corta en el tope y saca caracteres de control', () => {
    assert.equal(cleanPlayerName('  Juan   Perez  '), 'Juan Perez');
    assert.equal(cleanPlayerName('Juan\u0000\nPerez'), 'Juan Perez');
    assert.equal(cleanPlayerName('x'.repeat(500)).length, PLAYER_NAME_MAX);
    assert.equal(cleanPlayerName(''), '');
});

test('isValidPlayerKey: rechaza vacio, largo y caracteres de control', () => {
    assert.equal(isValidPlayerKey('fs-player-123'), true);
    assert.equal(isValidPlayerKey(''), false);
    assert.equal(isValidPlayerKey('k'.repeat(PLAYER_KEY_MAX)), true);
    assert.equal(isValidPlayerKey('k'.repeat(PLAYER_KEY_MAX + 1)), false);
    assert.equal(isValidPlayerKey('a\nb'), false);
});
