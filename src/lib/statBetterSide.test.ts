import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladoGanador, menosEsMejor } from './statBetterSide';

/**
 * La chapa marca al MEJOR, no al mas grande. Con catorce metricas por deporte y
 * seis deportes, equivocarse condecora al equipo mas indisciplinado, y eso no se
 * nota mirando la pantalla: hay que preguntarselo metrica por metrica.
 */

test('la chapa premia al que tiene MAS cuando mas es mejor', () => {
    assert.equal(ladoGanador(4, 1, 'tries', 'Tries'), 'home');
    assert.equal(ladoGanador(9, 18, 'shotsOnGoal', 'Tiros al arco'), 'away');
    assert.equal(ladoGanador(9, 4, 'saves', 'Atajadas'), 'home');
});

test('la chapa premia al que tiene MENOS cuando menos es mejor', () => {
    assert.equal(ladoGanador(1, 3, 'yellowCards', 'Amarillas'), 'home');
    assert.equal(ladoGanador(12, 4, 'turnoversLost', 'Perdidas'), 'away');
    assert.equal(ladoGanador(5, 1, 'twoMinSuspensions', 'Exclusiones de 2 min'), 'away');
    assert.equal(ladoGanador(3, 1, 'turnovers', 'Turnovers'), 'away');
});

test('un tiro atajado o bloqueado se le carga al que TIRO, no al que atajo', () => {
    // `bumpTeamMetric(stats.shotsSaved, team)`: en la fila del equipo significa
    // "cuantos le taparon". La atajada del arquero es otra metrica.
    assert.equal(ladoGanador(7, 2, 'shotsSaved', 'Atajados'), 'away');
    assert.equal(ladoGanador(5, 1, 'shotsBlocked', 'Bloqueados'), 'away');
    assert.equal(ladoGanador(3, 1, 'sevenMetersSaved', 'Atajados'), 'away');
    assert.equal(ladoGanador(2, 0, 'penaltyStrokesSaved', 'Atajados'), 'away');
    assert.equal(ladoGanador(2, 0, 'fieldGoalsBlocked', 'Field goals bloqueados'), 'away');
    assert.equal(menosEsMejor('saves', 'Atajadas'), false);
});

test('sin ganador cuando empatan o falta el dato', () => {
    assert.equal(ladoGanador(2, 2, 'tries', 'Tries'), null);
    assert.equal(ladoGanador(0, 0, 'points', 'Puntos'), null);
    assert.equal(ladoGanador(null, 3, 'tries', 'Tries'), null);
    assert.equal(ladoGanador(3, null, 'tries', 'Tries'), null);
});

test('la planilla del proveedor llega SIN clave: decide la etiqueta', () => {
    assert.equal(ladoGanador(1, 3, undefined, 'Tarjetas amarillas'), 'home');
    assert.equal(ladoGanador(14, 9, undefined, 'Faltas'), 'away');
    assert.equal(ladoGanador(18, 7, undefined, 'Pérdidas de balón'), 'away');
    assert.equal(ladoGanador(4, 1, undefined, 'Fuera de juego'), 'away');
    assert.equal(ladoGanador(7, 2, undefined, 'Tiros fuera'), 'away');
    // Y las que no son un defecto siguen premiando al que tiene mas.
    assert.equal(ladoGanador(72, 28, undefined, 'Posesión de balón'), 'home');
    assert.equal(ladoGanador(731, 236, undefined, 'Pases acertados'), 'home');
    assert.equal(ladoGanador(9, 1, undefined, 'Tiros a puerta'), 'home');
});

test('la etiqueta se compara sin acentos ni mayusculas', () => {
    assert.equal(menosEsMejor(undefined, 'PÉRDIDAS DE BALÓN'), true);
    assert.equal(menosEsMejor(undefined, 'perdidas de balon'), true);
});
