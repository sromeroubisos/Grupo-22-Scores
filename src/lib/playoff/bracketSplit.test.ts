import test from 'node:test';
import assert from 'node:assert/strict';

import { splitPlayoffDraw, splitRoundNamePrefix, tagBracketRound } from './bracketSplit.ts';

/**
 * Una fase de playoff con varias copas adentro (Oro/Plata/Bronce) se dibujaba
 * como una sola llave. Lo que se prueba: cada ronda cae en su copa, el nombre
 * de la ronda queda limpio para que el cuadro reconozca su Final, y una fase de
 * un solo cuadro sale igual que antes.
 */

test('el prefijo del nombre define la copa cuando lo que sigue es una instancia', () => {
    assert.deepEqual(tagBracketRound('Oro · Semifinales'), { bracketKey: 'oro', bracketLabel: 'Oro', stageName: 'Semifinales' });
    assert.deepEqual(tagBracketRound('Bronce - Final'), { bracketKey: 'bronce', bracketLabel: 'Bronce', stageName: 'Final' });
    assert.deepEqual(tagBracketRound('Copa de Plata - Cuartos de final').bracketLabel, 'Copa de Plata');
    assert.equal(tagBracketRound('Estímulo · 3.º y 4.º puesto').stageName, '3.º y 4.º puesto');
});

test('un nombre sin copa no se parte', () => {
    for (const name of ['Final', 'Semifinales', 'Final - Ida', 'Zona A - Fecha 1', 'Cuartos de final', 'Por el 5.º puesto']) {
        assert.equal(tagBracketRound(name).bracketKey, '', name);
        assert.equal(tagBracketRound(name).stageName, name, name);
    }
    assert.equal(splitRoundNamePrefix('Semifinal - Vuelta'), null);
});

test('el grupo del constructor manda sobre el nombre y se saca de la ronda', () => {
    assert.deepEqual(tagBracketRound('Semifinal · Copa', 'Copa'), { bracketKey: 'copa', bracketLabel: 'Copa', stageName: 'Semifinal' });
    assert.equal(tagBracketRound('3.º y 4.º puesto · Copa', 'Copa').stageName, '3.º y 4.º puesto');
    assert.equal(tagBracketRound('Oro · Final', 'Copa de Oro').bracketKey, 'copa de oro');
});

const team = { id: 1, name: 'X' };
const round = (id: string, name: string, key: string, withTeams = true) => ({
    round_id: id,
    name,
    bracket_key: key,
    bracket_label: key ? key[0].toUpperCase() + key.slice(1) : null,
    matches: [withTeams ? { home_team: team, away_team: team } : { home_team: undefined, away_team: undefined }],
});

test('la fase final del Uruguayo sale en tres cuadros, Oro primero', () => {
    // Orden real de order_index en 2025: Bronce semis va primero.
    const draw = [
        round('1', 'Semifinales', 'bronce'),
        round('2', 'Semifinales', 'oro'),
        round('3', 'Semifinales', 'plata'),
        round('4', 'Final', 'bronce'),
        round('5', 'Final', 'oro'),
        round('6', 'Final', 'plata'),
    ];
    const brackets = splitPlayoffDraw(draw);
    assert.deepEqual(brackets.map((b) => b.key), ['oro', 'plata', 'bronce']);
    assert.deepEqual(brackets[0].rounds.map((r) => r.round_id), ['2', '5']);
    assert.deepEqual(brackets[2].rounds.map((r) => r.round_id), ['1', '4']);
});

test('el esqueleto vacío del constructor no se dibuja al lado de copas con equipos', () => {
    const draw = [
        round('c1', 'Semifinal', 'copa', false),
        round('c2', 'Final', 'copa', false),
        round('o1', 'Semifinales', 'oro'),
        round('o2', 'Final', 'oro'),
    ];
    assert.deepEqual(splitPlayoffDraw(draw).map((b) => b.key), ['oro']);
});

test('un cuadro sin equipos todavía se muestra si es el único', () => {
    const draw = [round('a', 'Semifinal', '', false), round('b', 'Final', '', false)];
    const brackets = splitPlayoffDraw(draw);
    assert.equal(brackets.length, 1);
    assert.equal(brackets[0].rounds.length, 2);
});

test('un draw sin etiquetas (proveedor externo) queda como un solo cuadro en su orden', () => {
    const draw = [
        { round_id: 'q', name: 'Cuartos', matches: [] },
        { round_id: 's', name: 'Semis', matches: [] },
        { round_id: 'f', name: 'Final', matches: [] },
    ];
    const brackets = splitPlayoffDraw(draw);
    assert.equal(brackets.length, 1);
    assert.equal(brackets[0].label, null);
    assert.deepEqual(brackets[0].rounds.map((r) => r.round_id), ['q', 's', 'f']);
});
