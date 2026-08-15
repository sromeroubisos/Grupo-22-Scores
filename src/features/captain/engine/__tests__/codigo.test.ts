// EL CÓDIGO.
//
// Lo que hay que probar acá es que la seña se compare EN ORDEN —una seña con los
// mismos gestos en otro orden es otra seña, y el segunda línea salta al lugar
// equivocado igual— y que el atributo que cuenta dependa de quién la juega: el
// hooker pone el lanzamiento y el saltador pone el salto.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentSetupCtx } from '../../types/moment-def.ts';
import { baseAttributes } from '../../data/positions.ts';
import { momentSeed } from '../moments.ts';
import {
    CODIGO,
    CODIGO_LENGTH,
    CODIGO_SYMBOLS,
    codigoAciertos,
    codigoDestreza,
    codigoGrade,
    codigoShowMs,
} from '../moment-defs/codigo.ts';

function attrs(over: Partial<CaptainAttributes> = {}): CaptainAttributes {
    return { ...baseAttributes('hooker'), ...over };
}

function ctx(over: Partial<MomentSetupCtx> = {}): MomentSetupCtx {
    return {
        kind: 'codigo',
        season: 7,
        minute: 66,
        scoreDelta: 2,
        pressure: 0.6,
        family: 'hooker',
        proficiency: 1,
        attrs: attrs(),
        bodyDamage: 14,
        seed: momentSeed(20260801, 'codigo', 7, 0),
        ...over,
    };
}

const mano = (call: number[]) => ({ kind: 'codigo' as const, call });

// ═══════════════════════════════════════════════════════════════════════════
//  Determinismo
// ═══════════════════════════════════════════════════════════════════════════

test('mismo setup y misma seña dan exactamente lo mismo', () => {
    const setup = CODIGO.setup(ctx());
    assert.deepEqual(CODIGO.resolve(setup, mano([0, 1, 2, 3])), CODIGO.resolve(setup, mano([0, 1, 2, 3])));
});

test('NUNCA DOS GESTOS IGUALES SEGUIDOS', () => {
    // El modo de fallo clásico de un juego de memoria: dos símbolos idénticos
    // consecutivos se leen como un solo destello largo, el jugador repite uno y
    // pierde por algo que la pantalla nunca le mostró. Se barren muchas semillas
    // porque el caso aparece una de cada cuatro veces por posición.
    for (let season = 1; season <= 300; season += 1) {
        const setup = CODIGO.setup(ctx({ seed: momentSeed(8080, 'codigo', season, 0) }));
        for (let i = 1; i < setup.call.length; i += 1) {
            assert.notEqual(
                setup.call[i],
                setup.call[i - 1],
                `temporada ${season}: la seña ${setup.call.join(',')} canta lo mismo dos veces seguidas`,
            );
        }
    }
});

test('el consumo de azar no depende de qué seña salió', () => {
    // La seña se arma sumando saltos, NO reintentando: si reintentara, la
    // cantidad de tiradas dependería de los valores y el golpe de cabeza —que se
    // sortea después— cambiaría según qué seña tocó. Se verifica que dos
    // contextos que solo difieren en algo que NO toca el sorteo den el mismo
    // `headKnock`.
    const seed = momentSeed(999, 'codigo', 3, 0);
    const a = CODIGO.setup(ctx({ seed, pressure: 0 }));
    const b = CODIGO.setup(ctx({ seed, pressure: 1 }));
    assert.deepEqual(b.call, a.call, 'la presión movió la seña');
    assert.equal(b.headKnock, a.headKnock, 'la presión movió el golpe');
    assert.ok(b.showMs < a.showMs, 'la presión tiene que acortar el tiempo');
});

test('LA SEÑA SE SORTEA EN EL SETUP Y VIAJA AL GUARDADO', () => {
    // Si la sorteara la pantalla, recargar antes de repetirla daría otra seña.
    const setup = CODIGO.setup(ctx());
    assert.equal(setup.call.length, CODIGO_LENGTH);
    for (const gesto of setup.call) {
        assert.ok(gesto >= 0 && gesto < CODIGO_SYMBOLS, `gesto fuera de rango: ${gesto}`);
    }
    assert.deepEqual(CODIGO.setup(ctx()), setup);
    assert.deepEqual(JSON.parse(JSON.stringify(setup)), setup);

    const otra = CODIGO.setup(ctx({ seed: momentSeed(20260801, 'codigo', 8, 0) }));
    assert.notDeepEqual(otra.call, setup.call, 'dos semillas distintas dieron la misma seña');
});

// ═══════════════════════════════════════════════════════════════════════════
//  Los márgenes
// ═══════════════════════════════════════════════════════════════════════════

test('CADA UNO PONE LO SUYO EN EL LINE-OUT', () => {
    const a = attrs({ lanzamiento: 90, salto: 20, liderazgo: 40 });
    assert.equal(codigoDestreza(a, 'hooker'), 90, 'el hooker tiene que poner el lanzamiento');
    assert.equal(codigoDestreza(a, 'segunda-linea'), 20, 'el saltador tiene que poner el salto');
    // Cualquier otro cae acá por el cruce: lo único que le queda es haber
    // escuchado la charla.
    assert.equal(codigoDestreza(a, 'wing-fullback'), 40);
});

test('LA DESTREZA DA MÁS TIEMPO PARA MEMORIZARLA', () => {
    assert.ok(codigoShowMs(80, 0.5, 1) > codigoShowMs(40, 0.5, 1));
});

test('la presión acorta el tiempo', () => {
    assert.ok(codigoShowMs(60, 1, 1) < codigoShowMs(60, 0, 1));
});

test('EL OFICIO NUNCA DA MÁS TIEMPO', () => {
    const propio = codigoShowMs(60, 0.5, 1);
    for (const oficio of [0.9, 0.75, 0.5, 0]) {
        assert.ok(codigoShowMs(60, 0.5, oficio) <= propio, `oficio ${oficio} dio más tiempo`);
    }
    assert.equal(codigoShowMs(60, 0.5, 3), propio, 'un oficio mayor que 1 regaló tiempo');
});

// ═══════════════════════════════════════════════════════════════════════════
//  La seña
// ═══════════════════════════════════════════════════════════════════════════

test('LOS ACIERTOS SE CUENTAN EN ORDEN, NO COMO BOLSA DE GESTOS', () => {
    // Una seña con los mismos gestos en otro orden es OTRA seña. Si se contara
    // como conjunto, cantar la seña al revés saldría igual de bien que cantarla
    // bien, y eso no es un line-out.
    assert.equal(codigoAciertos([0, 1, 2, 3], [0, 1, 2, 3]), 4);
    assert.equal(codigoAciertos([0, 1, 2, 3], [3, 2, 1, 0]), 0);
    assert.equal(codigoAciertos([0, 1, 2, 3], [0, 1, 3, 2]), 2);
    assert.equal(codigoAciertos([0, 1, 2, 3], [0, 1]), 2);
    assert.equal(codigoAciertos([0, 1, 2, 3], []), 0);
});

test('la nota sale de cuántos entraron en orden', () => {
    assert.equal(codigoGrade(4, 4), 'limpio');
    assert.equal(codigoGrade(3, 4), 'sucio');
    assert.equal(codigoGrade(2, 4), 'sucio');
    assert.equal(codigoGrade(1, 4), 'perdido');
    assert.equal(codigoGrade(0, 4), 'perdido');
});

test('cantarla entera bien gana el line-out limpio', () => {
    const setup = CODIGO.setup(ctx());
    const result = CODIGO.resolve(setup, mano([...setup.call]));
    assert.equal(result.result, 'Line-out limpio');
    assert.ok((result.deltas.fame ?? 0) > 0);
    assert.ok((result.deltas.belonging ?? 0) > 0);
});

test('PERDER EL LINE-OUT NUNCA PAGA, Y NUNCA ES PENAL', () => {
    // Un line-out errado no es una infracción: es una pelota perdida. Que no
    // lleve sanción es lo que lo distingue del jackal y del ancla.
    const setup = CODIGO.setup(ctx());
    const alReves = [...setup.call].reverse();
    // Si la seña es capicúa, se corrompe a mano para asegurar el fallo.
    const errada = alReves[0] === setup.call[0] ? [(setup.call[0] + 1) % CODIGO_SYMBOLS, ...alReves.slice(1)] : alReves;

    const result = CODIGO.resolve(setup, mano(errada));
    assert.equal(result.result, 'Line-out perdido');
    assert.ok((result.deltas.fame ?? 0) < 0, 'perderlo tiene que costar Cartel');
    assert.ok((result.deltas.belonging ?? 0) <= 0, 'perderlo no puede pagar Pertenencia');
    assert.equal(result.deltas.sanction, undefined, 'un line-out errado no es penal');
});

test('el salto se paga con el cuerpo, salga como salga', () => {
    const setup = CODIGO.setup(ctx());
    for (const call of [[...setup.call], [9, 9, 9, 9], []]) {
        assert.ok((CODIGO.resolve(setup, mano(call)).deltas.bodyDamage ?? 0) > 0);
    }
});

test('una seña vacía o de más no rompe nada', () => {
    const setup = CODIGO.setup(ctx());
    assert.equal(CODIGO.resolve(setup, mano([])).result, 'Line-out perdido');
    assert.ok(CODIGO.resolve(setup, mano([...setup.call, 1, 1, 1])).result.length > 0);
});

test('la crónica nombra el minuto', () => {
    const setup = CODIGO.setup(ctx({ minute: 58 }));
    assert.ok(CODIGO.resolve(setup, mano([...setup.call])).text.includes('Minuto 58'));
});

test('el código no encadena', () => {
    const setup = CODIGO.setup(ctx());
    assert.equal(CODIGO.resolve(setup, mano([...setup.call])).chain, undefined);
    assert.equal(CODIGO.resolve(setup, mano([])).chain, undefined);
});
