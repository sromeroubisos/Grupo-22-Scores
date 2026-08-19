// La planilla de la carrera: que los cuatro números digan lo que la pantalla
// promete, y que ninguna familia se quede sin fuente de tries.
//
// El rojo que este archivo tiene que dar es el de la DERIVA: la planilla lee la
// gloria de tres familias por el id de su métrica, así que renombrar «tries-base»
// en `data/positions.ts` la dejaría estimando por tasa una producción que el
// motor ya sortea — y esa mentira no falla en ningún lado, solo devuelve un
// número que no coincide con la tarjeta de temporada.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_FAMILIES, getFamily } from '../../data/positions.ts';
import { TACKLE_RATE, TRY_METRIC_IDS, TRY_RATE, tallyOf, type TallyRow } from '../career-tally.ts';

/** Una temporada cerrada, con lo que la planilla mira y nada más. */
function temporada(matchesPlayed: number, ovr: number, glory: number, glorySecondary = 0): TallyRow {
    return { matchesPlayed, ovr, glory, glorySecondary };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CADA PUESTO TIENE UNA SOLA FUENTE DE TRIES
// ═══════════════════════════════════════════════════════════════════════════

test('cada familia saca sus tries de la gloria O de una tasa, nunca de las dos ni de ninguna', () => {
    for (const id of ALL_FAMILIES) {
        const { primary, secondary } = getFamily(id).glory;
        const anotaTries = [primary, secondary].some((m) => m !== null && TRY_METRIC_IDS.includes(m.id));
        const tieneTasa = TRY_RATE[id] !== undefined;

        assert.notEqual(
            anotaTries,
            tieneTasa,
            `${id}: ${anotaTries ? 'anota tries como gloria Y tiene tasa' : 'no anota tries y tampoco tiene tasa'}`,
        );
    }
});

test('las ocho familias tienen tasa de tackles: no hay puesto que no tackee', () => {
    for (const id of ALL_FAMILIES) {
        assert.ok(TACKLE_RATE[id] > 0, `${id} no tiene tasa de tackles`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE EL MOTOR SORTEÓ NO SE VUELVE A ESTIMAR
// ═══════════════════════════════════════════════════════════════════════════

test('el wing suma EXACTAMENTE los tries de su historial, sin estimar nada', () => {
    const filas = [temporada(20, 74, 9), temporada(24, 81, 13.4), temporada(18, 80, 7.6)];
    const total = tallyOf('wing-fullback', filas);

    assert.equal(total.tries, Math.round(9 + 13.4 + 7.6));
    assert.equal(total.matches, 62);
});

test('el hooker lee sus tries de la gloria SECUNDARIA, que es donde los anota', () => {
    // La primaria del hooker es un porcentaje —line-out propio— y no se suma.
    const filas = [temporada(22, 72, 88, 4), temporada(22, 76, 91, 6)];
    assert.equal(tallyOf('hooker', filas).tries, 10);
});

test('el apertura lee sus PUNTOS de la gloria y no los inventa desde los tries', () => {
    const filas = [temporada(20, 78, 190), temporada(21, 82, 214)];
    assert.equal(tallyOf('apertura', filas).points, 404);
});

test('al que no patea, los puntos son sus tries por cinco', () => {
    const filas = [temporada(20, 74, 9)];
    const total = tallyOf('wing-fullback', filas);
    assert.equal(total.points, total.tries * 5);
});

// ═══════════════════════════════════════════════════════════════════════════
//  LA FORMA DE LA ESTIMACIÓN
// ═══════════════════════════════════════════════════════════════════════════

test('los tackles salen de los partidos y del puesto, no de la media', () => {
    const flanker = tallyOf('tercera-linea', [temporada(20, 60, 0)]);
    const flankerCrack = tallyOf('tercera-linea', [temporada(20, 92, 0)]);
    assert.equal(flanker.tackles, flankerCrack.tackles, 'la media no puede mover el tackle');

    const wing = tallyOf('wing-fullback', [temporada(20, 60, 0)]);
    assert.ok(flanker.tackles > wing.tackles, 'el ala tackea más que el wing, siempre');
});

test('el que no anota tries los estima por media: el mismo puesto, mejor media, más tries', () => {
    const centroComun = tallyOf('centro', [temporada(24, 68, 0)]);
    const centroCrack = tallyOf('centro', [temporada(24, 90, 0)]);
    assert.ok(centroCrack.tries > centroComun.tries);
});

test('una carrera sin temporadas cerradas da cuatro ceros y no revienta', () => {
    assert.deepEqual(tallyOf('primera-linea', []), { matches: 0, tries: 0, points: 0, tackles: 0 });
});
