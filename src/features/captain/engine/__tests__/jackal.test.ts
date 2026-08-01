// EL JACKAL.
//
// El minijuego no se prueba con un test —si es divertido se sabe jugándolo—
// pero sí las cuatro cosas que tienen que ser ciertas para que sea el puesto y
// no una barra genérica: que la misma mano dé lo mismo, que el `robo` sirva de
// verdad, que el oficio nunca regale margen, y que un desastre no pague.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentSetupCtx } from '../../types/moment-def.ts';
import { baseAttributes } from '../../data/positions.ts';
import { momentSeed } from '../moments.ts';
import { JACKAL, JACKAL_ROUNDS, jackalBeat, jackalGrade, jackalWindows } from '../moment-defs/jackal.ts';

/** Los atributos de un tercera línea, con `robo` y `aguante` a pedido. */
function attrs(robo: number, aguante: number): CaptainAttributes {
    return { ...baseAttributes('tercera-linea'), robo, aguante };
}

function ctx(over: Partial<MomentSetupCtx> = {}): MomentSetupCtx {
    return {
        kind: 'jackal',
        season: 6,
        minute: 67,
        scoreDelta: -3,
        pressure: 0.72,
        family: 'tercera-linea',
        proficiency: 1,
        attrs: attrs(60, 60),
        bodyDamage: 20,
        seed: momentSeed(20260801, 'jackal', 6, 0),
        ...over,
    };
}

const mano = (reactions: (number | null)[]) => ({ kind: 'jackal' as const, reactions });

// ═══════════════════════════════════════════════════════════════════════════
//  Determinismo
// ═══════════════════════════════════════════════════════════════════════════

test('mismo setup y misma mano dan exactamente lo mismo', () => {
    const setup = JACKAL.setup(ctx());
    const a = JACKAL.resolve(setup, mano([180, 240, 400]));
    const b = JACKAL.resolve(setup, mano([180, 240, 400]));
    assert.deepEqual(b, a);
});

test('el sorteo del setup sale de la semilla y de nada más', () => {
    // Delays y golpe en la cabeza salen del rng derivado. Dos setups con la misma
    // semilla tienen que ser idénticos, y con semilla distinta, distintos.
    const igual = JACKAL.setup(ctx());
    assert.deepEqual(JACKAL.setup(ctx()), igual);

    const otra = JACKAL.setup(ctx({ seed: momentSeed(20260801, 'jackal', 7, 0) }));
    assert.notDeepEqual(otra.delays, igual.delays, 'dos semillas distintas dieron los mismos delays');
});

test('los delays están en el rango y son tres', () => {
    const setup = JACKAL.setup(ctx());
    assert.equal(setup.delays.length, JACKAL_ROUNDS);
    assert.equal(setup.windows.length, JACKAL_ROUNDS);
    for (const d of setup.delays) {
        assert.ok(d >= 800 && d <= 2600, `delay fuera de rango: ${d}`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  Las ventanas
// ═══════════════════════════════════════════════════════════════════════════

test('EL ROBO ENSANCHA LA VENTANA, RONDA POR RONDA', () => {
    // Es lo que hace que el minijuego sea del puesto y no una barra cualquiera:
    // el atributo que define al 7 tiene que sentirse con el dedo.
    const flojo = jackalWindows(attrs(60, 60), 1);
    const bueno = jackalWindows(attrs(90, 60), 1);

    for (let i = 0; i < JACKAL_ROUNDS; i += 1) {
        assert.ok(
            bueno[i] > flojo[i],
            `ronda ${i + 1}: robo 90 no ensanchó la ventana (${flojo[i]} → ${bueno[i]})`,
        );
    }
});

test('EL OFICIO NUNCA ENSANCHA', () => {
    // El que juega una jugada prestada la juega peor. Es un invariante del
    // contrato, no del jackal: si algún Momento pudiera invertir el signo, el
    // `proficiency` dejaría de significar lo que dice.
    const propio = jackalWindows(attrs(70, 60), 1);
    for (const oficio of [0.9, 0.75, 0.5, 0.1, 0]) {
        const prestado = jackalWindows(attrs(70, 60), oficio);
        for (let i = 0; i < JACKAL_ROUNDS; i += 1) {
            assert.ok(
                prestado[i] <= propio[i],
                `oficio ${oficio}, ronda ${i + 1}: la ventana se ensanchó (${propio[i]} → ${prestado[i]})`,
            );
        }
    }

    // Y un oficio por encima de 1 tampoco regala nada: se acota antes de contar.
    assert.deepEqual(jackalWindows(attrs(70, 60), 3), propio);
});

test('la ventana se achica ronda a ronda, y el aguante parte el achique al medio', () => {
    const normal = jackalWindows(attrs(60, 60), 1);
    assert.ok(normal[0] > normal[1] && normal[1] > normal[2], 'las tres rondas no se van poniendo difíciles');

    const entero = jackalWindows(attrs(60, 90), 1);
    assert.equal(entero[0], normal[0], 'el aguante no debería mover la primera');
    assert.ok(entero[2] > normal[2], 'el aguante no ayudó en la tercera, que es donde se nota');
});

// ═══════════════════════════════════════════════════════════════════════════
//  Las tres salidas de una ronda
// ═══════════════════════════════════════════════════════════════════════════

test('tocar antes del destello es offside, no es haber fallado', () => {
    assert.equal(jackalBeat(-1, 300), 'offside');
    assert.equal(jackalBeat(-250, 300), 'offside');
});

test('adentro de la ventana es turnover; pasada la ventana te limpiaron', () => {
    assert.equal(jackalBeat(0, 300), 'turnover');
    assert.equal(jackalBeat(300, 300), 'turnover');
    assert.equal(jackalBeat(301, 300), 'limpiado');
    assert.equal(jackalBeat(null, 300), 'limpiado');
});

// ═══════════════════════════════════════════════════════════════════════════
//  Los deltas
// ═══════════════════════════════════════════════════════════════════════════

test('UN DESASTRE NUNCA PAGA CARTEL NI PERTENENCIA', () => {
    // La nota `desastre` es, por construcción, la jugada sin un solo turnover.
    // Se recorren TODAS las combinaciones posibles de tres rondas para que la
    // garantía no dependa de haber elegido bien los casos de prueba.
    const setup = JACKAL.setup(ctx());
    const opciones: (number | null)[] = [-100, 10, 100_000, null];
    let vistos = 0;

    for (const a of opciones) {
        for (const b of opciones) {
            for (const c of opciones) {
                const result = JACKAL.resolve(setup, mano([a, b, c]));
                if (result.result !== 'Penal en el breakdown') continue;
                vistos += 1;
                assert.ok((result.deltas.fame ?? 0) < 0, `un desastre pagó Cartel: ${JSON.stringify(result.deltas)}`);
                assert.ok((result.deltas.belonging ?? 0) <= 0, `un desastre pagó Pertenencia: ${JSON.stringify(result.deltas)}`);
                assert.ok((result.deltas.sanction ?? 0) > 0, 'un penal tiene que costar partidos');
            }
        }
    }

    assert.ok(vistos > 0, 'el barrido no produjo un solo desastre: el test no probó nada');
});

test('la nota sale de robar y de regalar, y nada más', () => {
    // Exhaustivo sobre las combinaciones válidas de tres rondas.
    for (let t = 0; t <= JACKAL_ROUNDS; t += 1) {
        for (let o = 0; o + t <= JACKAL_ROUNDS; o += 1) {
            const grade = jackalGrade(t, o);
            if (t === 0 && o > 0) assert.equal(grade, 'desastre');
            if (t === 0 && o === 0) assert.equal(grade, 'sin-premio');
            if (t > 0 && o > 0) assert.equal(grade, 'mixto');
            if (t === 1 && o === 0) assert.equal(grade, 'robo');
            if (t >= 2 && o === 0) assert.equal(grade, 'figura');
        }
    }
});

test('robar paga Cartel y Pertenencia, y regalar cuesta partidos', () => {
    const setup = JACKAL.setup(ctx());
    // Tres adentro de sus ventanas: la actuación de figura.
    const figura = JACKAL.resolve(setup, mano(setup.windows.map((w) => w - 10)));
    assert.equal(figura.result, 'Jackal decisivo');
    assert.equal(figura.deltas.fame, 6);
    assert.equal(figura.deltas.belonging, 4.5);
    assert.equal(figura.deltas.sanction, undefined);

    // Dos de tres ya es figura: es la calibración declarada del puesto.
    const dosDeTres = JACKAL.resolve(setup, mano([setup.windows[0] - 10, setup.windows[1] - 10, 100_000]));
    assert.equal(dosDeTres.result, 'Jackal decisivo');
});

test('el cuerpo se paga SIEMPRE, salga como salga', () => {
    // El breakdown es donde el rugby se lastima. Meter la cabeza donde entran
    // tres pares de rodillas tiene un precio, y no depende de si te salió bien.
    const setup = JACKAL.setup(ctx());
    for (const reactions of [[10, 10, 10], [-50, -50, -50], [null, null, null]]) {
        const result = JACKAL.resolve(setup, reactions === null ? mano([]) : mano(reactions));
        assert.ok((result.deltas.bodyDamage ?? 0) > 0, `no se cobró el cuerpo: ${JSON.stringify(reactions)}`);
    }
});

test('el golpe en la cabeza se decide en el setup, no al resolver', () => {
    // Si se sorteara al resolver, recargar la página antes de tocar cambiaría si
    // cobraste un HIA. Se busca una semilla con golpe y se verifica que el
    // resultado lo respete, juegue como juegue.
    let conGolpe = null;
    for (let season = 1; season <= 60 && !conGolpe; season += 1) {
        const setup = JACKAL.setup(ctx({ seed: momentSeed(31337, 'jackal', season, 0) }));
        if (setup.headKnock) conGolpe = setup;
    }
    assert.ok(conGolpe, 'ninguna semilla dio golpe en la cabeza en 60 intentos');

    for (const reactions of [[10, 10, 10], [null, null, null]]) {
        assert.equal(JACKAL.resolve(conGolpe!, mano(reactions)).deltas.headDamage, 1);
    }
});

test('la crónica nombra el minuto, que es lo que hace que la jugada importe', () => {
    const setup = JACKAL.setup(ctx({ minute: 71 }));
    const result = JACKAL.resolve(setup, mano([10, 10, 10]));
    assert.ok(result.text.includes('Minuto 71'), `la crónica no dice el minuto: "${result.text}"`);
});

test('el jackal no encadena: un penal ya se cobró con la suspensión', () => {
    const setup = JACKAL.setup(ctx());
    for (const reactions of [[-10, -10, -10], [10, 10, 10], [null, null, null]]) {
        assert.equal(JACKAL.resolve(setup, mano(reactions)).chain, undefined);
    }
});
