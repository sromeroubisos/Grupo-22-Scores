// La planilla: puntos, desglose del pie y métrica por puesto.
//
// Lo que se protege acá es que el desglose no se desincronice del agregado. Si
// `conversionsMade + penaltiesMade` deja de dar `kicksMade`, los puntos quedan
// mal y no hay forma de notarlo mirando la pantalla: los números siguen
// pareciendo razonables.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, computePoints, POINTS_PER, kickAccuracy, secondaryStatOf, hashSeed, type Chooser } from '../../index.ts';
import { ALL_POSITIONS, getPosition } from '../../data/positions.ts';
import type { Position } from '../../types/player.ts';
import type { SeasonStats } from '../../types/season.ts';

const rotatingChooser: Chooser = (event, state) =>
    event.options[hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length].id;

const SEMILLAS = [20260726, 424242, 7919, 31337, 8080];

/** Corre una carrera por puesto y semilla y devuelve todas sus temporadas. */
function todasLasTemporadas(position: Position, seed: number) {
    return runCareer({ position, nationalityCountryCode: 'ar' }, seed, rotatingChooser).seasons;
}

test('invariante del pie: kicksMade === conversiones + penales, y nunca supera los intentos', () => {
    let conPatadas = 0;

    for (const position of ALL_POSITIONS) {
        for (const seed of SEMILLAS) {
            for (const season of todasLasTemporadas(position, seed)) {
                const s = season.stats;
                const donde = `${position} semilla ${seed} temporada ${season.seasonIndex}`;

                assert.equal(
                    s.conversionsMade + s.penaltiesMade,
                    s.kicksMade,
                    `${donde}: el desglose no suma el agregado (${s.conversionsMade} + ${s.penaltiesMade} ≠ ${s.kicksMade})`,
                );
                assert.ok(s.kicksMade <= s.kicksAtGoal, `${donde}: convirtió más de lo que intentó`);
                assert.ok(s.conversionsMade >= 0 && s.penaltiesMade >= 0, `${donde}: desglose negativo`);
                if (s.kicksAtGoal > 0) conPatadas++;
            }
        }
    }

    assert.ok(conPatadas > 0, 'ninguna temporada tuvo patadas a los palos: el test no probó nada');
});

test('los drops quedan FUERA de kicksAtGoal', () => {
    // Un drop se patea en juego, no desde un tiro fijo: si entrara en el
    // agregado, el porcentaje al palo del apertura quedaría mal.
    for (const seed of SEMILLAS) {
        for (const season of todasLasTemporadas('flyhalf', seed)) {
            const s = season.stats;
            assert.equal(
                s.conversionsMade + s.penaltiesMade,
                s.kicksMade,
                `semilla ${seed}: los drops se colaron en el agregado del pie`,
            );
        }
    }
});

test('points sale de la fórmula y está GUARDADO, no derivado al renderizar', () => {
    for (const position of ALL_POSITIONS) {
        for (const seed of SEMILLAS) {
            for (const season of todasLasTemporadas(position, seed)) {
                assert.equal(
                    season.stats.points,
                    computePoints(season.stats),
                    `${position} semilla ${seed}: points no coincide con la fórmula`,
                );
            }
        }
    }
    assert.deepEqual(POINTS_PER, { try: 5, conversion: 2, penalty: 3, dropGoal: 3 });
});

test('el que no patea no suma puntos de pie: sus puntos son solo tries', () => {
    for (const position of ALL_POSITIONS) {
        if (getPosition(position).stats.goalKicker) continue;
        for (const seed of SEMILLAS) {
            for (const season of todasLasTemporadas(position, seed)) {
                const s = season.stats;
                assert.equal(s.kicksAtGoal, 0, `${position}: patea a los palos sin ser pateador`);
                assert.equal(s.conversionsMade, 0);
                assert.equal(s.penaltiesMade, 0);
                assert.equal(s.dropGoals, 0);
                assert.equal(s.points, s.tries * POINTS_PER.try, `${position}: puntos que no salen de tries`);
            }
        }
    }
});

test('los scrums son del pack: los backs terminan en cero', () => {
    const backs: Position[] = ['scrumhalf', 'flyhalf', 'centre', 'wing', 'fullback'];
    for (const position of backs) {
        for (const seed of SEMILLAS) {
            for (const season of todasLasTemporadas(position, seed)) {
                assert.equal(season.stats.scrumsWon, 0, `${position}: un back no gana scrums`);
            }
        }
    }
    // Y el pilar sí los gana: si diera 0 la métrica de su puesto sería decorativa.
    const scrumsDelPilar = todasLasTemporadas('prop', 20260726).reduce((sum, s) => sum + s.stats.scrumsWon, 0);
    assert.ok(scrumsDelPilar > 0, 'el pilar no ganó un solo scrum en toda la carrera');
});

test('el porcentaje al palo sin intentos es un guion, no 0% ni NaN', () => {
    const sinPatadas = { kicksAtGoal: 0, kicksMade: 0 };
    assert.equal(kickAccuracy(sinPatadas), null);

    const stats = { ...vacio(), kicksAtGoal: 0, kicksMade: 0 };
    const pilar = secondaryStatOf('prop', stats);
    assert.equal(pilar.label, 'Scrums');

    const apertura = secondaryStatOf('flyhalf', stats);
    assert.equal(apertura.display, '—', 'sin intentos el apertura muestra un guion');
    assert.ok(!Number.isNaN(Number(apertura.display.replace('%', ''))) || apertura.display === '—');

    const conPatadas = secondaryStatOf('flyhalf', { ...vacio(), kicksAtGoal: 40, kicksMade: 28 });
    assert.equal(conPatadas.display, '70%');
});

test('cada puesto tiene su propia cuarta ranura', () => {
    const esperado: Record<Position, string> = {
        prop: 'Scrums',
        hooker: 'Lineouts',
        lock: 'Lineouts',
        backrow: 'Turnovers',
        scrumhalf: 'Asistencias',
        flyhalf: 'Al palo',
        centre: 'Quiebres',
        wing: 'Metros',
        fullback: 'Metros',
    };
    for (const position of ALL_POSITIONS) {
        assert.equal(secondaryStatOf(position, vacio()).label, esperado[position], `${position}: ranura equivocada`);
    }
});

test('un pilar y un apertura producen planillas claramente distintas', () => {
    const totalizar = (position: Position) =>
        todasLasTemporadas(position, 20260726).reduce(
            (acc, s) => ({
                puntos: acc.puntos + s.stats.points,
                tries: acc.tries + s.stats.tries,
                tackles: acc.tackles + s.stats.tackles,
                scrums: acc.scrums + s.stats.scrumsWon,
                intentos: acc.intentos + s.stats.kicksAtGoal,
            }),
            { puntos: 0, tries: 0, tackles: 0, scrums: 0, intentos: 0 },
        );

    const pilar = totalizar('prop');
    const apertura = totalizar('flyhalf');

    assert.equal(pilar.intentos, 0, 'el pilar no patea a los palos');
    assert.ok(pilar.scrums > 0, 'el pilar gana scrums');
    assert.ok(apertura.intentos > 0, 'el apertura patea a los palos');
    assert.equal(apertura.scrums, 0, 'el apertura no gana scrums');
    assert.ok(apertura.puntos > pilar.puntos, 'el apertura tiene que anotar bastante más que el pilar');
    assert.ok(pilar.tackles > apertura.tackles, 'el pilar tiene que tacklear bastante más que el apertura');
});

function vacio(): SeasonStats {
    return {
        tries: 0, tackles: 0, metres: 0, assists: 0, lineBreaks: 0, turnovers: 0,
        kicksAtGoal: 0, kicksMade: 0, lineoutsWon: 0, metresKicked: 0, scrumsWon: 0,
        conversionsMade: 0, penaltiesMade: 0, dropGoals: 0, points: 0,
    };
}
