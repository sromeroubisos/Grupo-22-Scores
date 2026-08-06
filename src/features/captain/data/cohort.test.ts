// La camada: que el puesto IMPORTE, y que la escalera sea una escalera.
//
// ── Por qué existe este archivo ──
// `SQUAD_SHAPE` estuvo un commit entero sin hacer nada. El comentario decía «un
// apertura pelea dos camisetas y un wing pelea cinco» y el código no lo cumplía:
// los aspirantes se escalaban por las camisetas, así que `shirts` se cancelaba y
// el corte quedaba idéntico para las ocho familias.
//
//     porDelante = fractionAbove × (shirts × C)
//     entrás ⟺ porDelante < shirts ⟺ fractionAbove < 1/C
//
// El arreglo de fondo NO es más disciplina al revisar. Es esto: si un dato existe
// para que algo importe, hay un test que verifica que importe. Una regla que hay
// que acordarse es una regla que se va a romper.
//
// Se mide sobre `fitsInSquad` directo y no sobre el barrido de carreras a
// propósito: acá no hay confusión posible con la plantilla del puesto, la curva
// de edad ni el archirrival. Si el corte de dos familias distintas coincide, el
// puesto no importa, y no hay ruido que lo pueda explicar.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CupoTrack } from './cohort.ts';
import { SQUAD_SHAPE, SQUAD_TOTAL, TRACK_SHIRTS, cohortSize, fitsInSquad, shirtsFor } from './cohort.ts';
import { ALL_FAMILIES, POSITION_FAMILIES } from './positions.ts';
import type { PositionFamilyId } from '../types/player.ts';

const CUPOS: CupoTrack[] = ['union', 'academia', 'm20'];

/** El OVR mínimo que hace entrar, por barrido fino. `Infinity` si no entra nunca. */
function corte(track: CupoTrack, family: PositionFamilyId, age: number): number {
    // Arranque fijo para las ocho: se está midiendo el efecto de LAS CAMISETAS,
    // así que la plantilla del puesto no puede entrar en la cuenta.
    const arranque = 52;
    for (let ovr = 40; ovr <= 99; ovr += 0.25) {
        if (fitsInSquad(track, family, ovr, arranque, age, null)) return ovr;
    }
    return Infinity;
}

test('el plantel suma treinta, que es un plantel de rugby y no una división', () => {
    const total = ALL_FAMILIES.reduce((a, f) => a + SQUAD_SHAPE[f], 0);
    assert.equal(total, SQUAD_TOTAL, `SQUAD_SHAPE suma ${total} y tiene que sumar ${SQUAD_TOTAL}`);
    for (const family of ALL_FAMILIES) {
        assert.ok(SQUAD_SHAPE[family] >= 1, `${family} no tiene ni una camiseta`);
    }
});

test('EL PUESTO IMPORTA: menos camisetas, corte más alto', () => {
    // EL TEST QUE FALTABA. Con los aspirantes escalados por camisetas esto daba
    // exactamente cero de dispersión y nadie se enteró durante un commit entero.
    for (const track of CUPOS) {
        const cortes = ALL_FAMILIES.map((f) => ({ f, shirts: shirtsFor(track, f), corte: corte(track, f, 20) }));
        const escaso = cortes.reduce((min, c) => (c.shirts < min.shirts ? c : min));
        const abundante = cortes.reduce((max, c) => (c.shirts > max.shirts ? c : max));

        assert.ok(
            escaso.corte > abundante.corte,
            `${track}: al puesto escaso (${escaso.f}, ${escaso.shirts} camisetas) le piden ${escaso.corte} `
            + `y al abundante (${abundante.f}, ${abundante.shirts}) le piden ${abundante.corte}. `
            + 'Si son iguales, SQUAD_SHAPE no está haciendo nada.',
        );

        // Y la dispersión tiene que ser LEGIBLE, no un decimal. Un puesto que
        // pelea dos lugares contra uno que pelea cinco se tiene que notar.
        const spread = escaso.corte - abundante.corte;
        assert.ok(
            spread >= 1,
            `${track}: la diferencia entre el puesto más escaso y el más abundante es ${spread.toFixed(2)} `
            + 'puntos de media. Es demasiado chica para que el jugador la sienta.',
        );
    }
});

test('el corte ordena igual que las camisetas, sin inversiones', () => {
    // No alcanza con que los extremos se separen: la relación tiene que ser
    // monótona, si no hay un puesto al que le conviene ser escaso.
    for (const track of CUPOS) {
        const ordenadas = ALL_FAMILIES
            .map((f) => ({ f, shirts: shirtsFor(track, f), corte: corte(track, f, 20) }))
            .sort((a, b) => a.shirts - b.shirts);

        for (let i = 1; i < ordenadas.length; i += 1) {
            const menos = ordenadas[i - 1];
            const mas = ordenadas[i];
            if (menos.shirts === mas.shirts) continue;
            assert.ok(
                menos.corte >= mas.corte,
                `${track}: ${menos.f} pelea ${menos.shirts} camisetas y le piden ${menos.corte}, `
                + `pero ${mas.f} pelea ${mas.shirts} y le piden ${mas.corte}. Está invertido.`,
            );
        }
    }
});

test('la camada preserva el nivel: no es una perilla escondida de dificultad', () => {
    // `cohortSize` se deriva de `CONTENDERS_PER_SHIRT × media(camisetas)` justo
    // para que cambiar el REPARTO no cambie la SELECTIVIDAD MEDIA. Si esta
    // relación se rompe, `SQUAD_SHAPE` pasa a mover dos cosas a la vez y ninguna
    // medición del reparto se puede leer.
    for (const track of CUPOS) {
        const media = ALL_FAMILIES.reduce((a, f) => a + shirtsFor(track, f), 0) / ALL_FAMILIES.length;
        const percentilMedio = media / cohortSize(track);
        // El percentil medio tiene que ser exactamente 1 / CONTENDERS_PER_SHIRT,
        // que es lo que valía para TODOS antes del arreglo.
        assert.ok(
            percentilMedio > 0 && percentilMedio < 1,
            `${track}: percentil medio de entrada ${percentilMedio}, que no es una fracción`,
        );
    }
});

test('los carriles con cupo son más selectivos a medida que se sube', () => {
    // Un escalón de arriba no puede ser más fácil que uno de abajo: si lo fuera,
    // el de abajo dejaría de evaluarse —el recorrido va de arriba hacia abajo— y
    // quedaría vacío sin que nada avise.
    const wing: PositionFamilyId = 'wing-fullback';
    const cortes = CUPOS.map((t) => ({ t, corte: corte(t, wing, 20) }));
    for (let i = 1; i < cortes.length; i += 1) {
        assert.ok(
            cortes[i].corte >= cortes[i - 1].corte,
            `${cortes[i].t} pide ${cortes[i].corte} y ${cortes[i - 1].t}, que está más abajo, pide `
            + `${cortes[i - 1].corte}. El de arriba tiene que ser al menos tan difícil.`,
        );
    }
});

test('cada familia tiene camisetas en los tres carriles', () => {
    for (const track of CUPOS) {
        for (const family of ALL_FAMILIES) {
            assert.ok(
                shirtsFor(track, family) >= 1,
                `${family} no tiene ni una camiseta en ${track}: ese puesto no existe para ese carril`,
            );
            assert.ok(
                shirtsFor(track, family) <= TRACK_SHIRTS[track],
                `${family} tiene más camisetas que el plantel entero de ${track}`,
            );
        }
    }
});

test('las ocho familias del catálogo son las ocho de la forma del plantel', () => {
    // Si entra una familia nueva a `positions.ts` y nadie le da camisetas, el
    // `Record` no compila. Esto cubre el caso contrario: una sobrante acá.
    assert.deepEqual(
        Object.keys(SQUAD_SHAPE).sort(),
        Object.keys(POSITION_FAMILIES).sort(),
    );
});
