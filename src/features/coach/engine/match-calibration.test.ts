// El primer test del juego, y no por casualidad: el marcador acá NO es
// cosmético. El punto bonus hace que la diferencia de puntos defina posiciones,
// así que un `rollMatch` mal calibrado no desafina un detalle — rompe la tabla.
//
// La referencia es rugby-manager-pro/js/calibration.js, generado desde 286
// partidos reales de 2026. Los números que verificamos son suyos:
//
//   homeWinRate  0.618      el local gana el 61,8%
//   homeAdvPts   4.38       la localía vale +4,38 puntos
//   avgTotal     50.1       entre los dos suman ~50 puntos
//   drawRate     0.016      el empate es raro: 2-4% según el tramo
//
// Las bandas son anchas a propósito. No se está verificando que el motor
// reproduzca 286 partidos: se está verificando que caiga en la MISMA
// distribución. Si un cambio lo saca de acá, la perilla es `MARGIN_SD`.

import assert from 'node:assert/strict';
import test from 'node:test';
import { HOME_ADV_PTS, NEUTRAL_MODS, rollMatch, type MatchSide } from './match.ts';
import { createRng } from './random.ts';

const N = 20000;

function evenSide(clubId: string): MatchSide {
    return { clubId, rating: 25, mods: NEUTRAL_MODS };
}

/** Corre N partidos entre iguales y devuelve la distribución. */
function sample(seed: number) {
    const rng = createRng(seed);
    let homeWins = 0;
    let draws = 0;
    let totalPts = 0;
    let marginSum = 0;

    for (let i = 0; i < N; i++) {
        const m = rollMatch(rng, evenSide('A'), evenSide('B'));
        if (m.outcome === 'win') homeWins++;
        if (m.outcome === 'draw') draws++;
        totalPts += m.homePf + m.awayPf;
        marginSum += m.homePf - m.awayPf;
    }

    return {
        homeWinRate: homeWins / N,
        drawRate: draws / N,
        avgTotal: totalPts / N,
        avgMargin: marginSum / N,
    };
}

test('entre iguales, el local gana cerca del 61,8% (calibration.js)', () => {
    const { homeWinRate } = sample(1);
    assert.ok(
        homeWinRate > 0.58 && homeWinRate < 0.67,
        `el local ganó el ${(homeWinRate * 100).toFixed(1)}%, fuera de la banda 58-67%`,
    );
});

test('el empate es raro: entre el 1,5% y el 5%', () => {
    const { drawRate } = sample(2);
    assert.ok(
        drawRate > 0.015 && drawRate < 0.05,
        `empataron el ${(drawRate * 100).toFixed(1)}%, fuera de la banda 1,5-5%`,
    );
});

test('la localía vale ~4,4 puntos de margen medio', () => {
    const { avgMargin } = sample(3);
    assert.ok(
        Math.abs(avgMargin - HOME_ADV_PTS) < 1.2,
        `margen medio ${avgMargin.toFixed(2)}, esperado ~${HOME_ADV_PTS}`,
    );
});

test('entre los dos suman ~50 puntos por partido', () => {
    const { avgTotal } = sample(4);
    assert.ok(avgTotal > 44 && avgTotal < 58, `total medio ${avgTotal.toFixed(1)}, fuera de la banda 44-58`);
});

test('en cancha neutral la ventaja desaparece', () => {
    const rng = createRng(5);
    let homeWins = 0;
    let draws = 0;
    for (let i = 0; i < N; i++) {
        const m = rollMatch(rng, evenSide('A'), evenSide('B'), { neutral: true });
        if (m.outcome === 'win') homeWins++;
        if (m.outcome === 'draw') draws++;
    }
    const rate = homeWins / N;
    assert.ok(
        Math.abs(rate - (1 - draws / N) / 2) < 0.02,
        `sin localía el reparto debería ser parejo y dio ${(rate * 100).toFixed(1)}%`,
    );
});

test('un punto de rating vale ~2 puntos de marcador', () => {
    const rng = createRng(6);
    let marginSum = 0;
    for (let i = 0; i < N; i++) {
        const m = rollMatch(
            rng,
            { clubId: 'A', rating: 30, mods: NEUTRAL_MODS },
            { clubId: 'B', rating: 20, mods: NEUTRAL_MODS },
            { neutral: true },
        );
        marginSum += m.homePf - m.awayPf;
    }
    // Diez puntos de rating × 1,965 = ~19,7 puntos de margen esperado.
    const avg = marginSum / N;
    assert.ok(avg > 17 && avg < 23, `10 de rating dieron ${avg.toFixed(1)} puntos de margen`);
});

/** Cuántas veces gana el visitante, dada la diferencia de rating. */
function dogWinRate(seed: number, homeRating: number, awayRating: number): number {
    const rng = createRng(seed);
    let dogWins = 0;
    for (let i = 0; i < N; i++) {
        const m = rollMatch(
            rng,
            { clubId: 'A', rating: homeRating, mods: NEUTRAL_MODS },
            { clubId: 'B', rating: awayRating, mods: NEUTRAL_MODS },
        );
        if (m.outcome === 'loss') dogWins++;
    }
    return dogWins / N;
}

test('en un partido parejo, el visitante gana más de un tercio (bucket 0-3 de calibration.js)', () => {
    // El bucket más chico de la calibración mide la diferencia AJUSTADA por
    // localía, así que "parejo" es el visitante un poco mejor: dogWin 0.367.
    const rate = dogWinRate(7, 25, 27);
    assert.ok(
        rate > 0.3 && rate < 0.5,
        `el visitante ganó el ${(rate * 100).toFixed(1)}%, fuera de la banda 30-50%`,
    );
});

test('contra un rival muy superior la sorpresa se vuelve rara, pero no imposible', () => {
    // Ocho puntos de rating más la localía son veinte de margen esperado: es una
    // paliza anunciada y tiene que salir así. Lo que no puede pasar es que el
    // resultado quede FIJO — el rugby de clubes argentino tiene una tarde de
    // esas cada tantas fechas y el juego se queda sin épica si la borra.
    const rate = dogWinRate(8, 33, 25);
    assert.ok(rate > 0.02, `el más chico ganó solo el ${(rate * 100).toFixed(1)}%: el torneo quedó cerrado`);
    assert.ok(rate < 0.15, `el más chico ganó el ${(rate * 100).toFixed(1)}%: el rating no está pesando`);
});

test('nadie termina con puntaje negativo', () => {
    const rng = createRng(8);
    for (let i = 0; i < 5000; i++) {
        const m = rollMatch(
            rng,
            { clubId: 'A', rating: 45, mods: NEUTRAL_MODS },
            { clubId: 'B', rating: 6, mods: NEUTRAL_MODS },
        );
        assert.ok(m.homePf >= 0 && m.awayPf >= 0, `marcador negativo: ${m.homePf}-${m.awayPf}`);
        assert.ok(m.homeTries >= 0 && m.awayTries >= 0, 'tries negativos');
    }
});

test('misma semilla, mismo partido', () => {
    const a = rollMatch(createRng(99), evenSide('A'), evenSide('B'));
    const b = rollMatch(createRng(99), evenSide('A'), evenSide('B'));
    assert.deepEqual(a, b);
});
