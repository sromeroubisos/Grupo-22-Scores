// LA BANDA — la corrida por la orilla.
//
// Lo que se prueba acá no es que el minijuego sea divertido: es que la regla que
// lo ordena —LA CAL CORTA LA JUGADA, NO BORRA LOS METROS— se cumpla en todos los
// caminos, incluido el que corta a la mitad. Si eso se rompe, el wing que quebró
// tres y se fue por la raya termina en cero, y eso no es haber jugado mal: es
// haber jugado incompleto, que es otra nota.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { BandaSetup } from '../moment-defs/index.ts';
import type { MomentSetupCtx } from '../../types/moment-def.ts';
import type { BandaMove } from '../../types/moment.ts';
import { baseAttributes } from '../../data/positions.ts';
import { BANDA, bandaGrade, bandaMoveAt } from '../moment-defs/banda.ts';
import { momentSeed } from '../moments.ts';

const WING = 'wing-fullback' as const;

function ctx(over: Partial<MomentSetupCtx> = {}): MomentSetupCtx {
    return {
        kind: 'banda',
        season: 4,
        minute: 68,
        scoreDelta: -3,
        pressure: 0.6,
        family: WING,
        proficiency: 1,
        attrs: baseAttributes(WING),
        bodyDamage: 10,
        seed: momentSeed(2024, 'banda', 4, 0),
        ...over,
    };
}

/** La mano que quiebra a los `n` primeros con el verbo que corresponde a `at`. */
function mano(setup: BandaSetup, moves: Array<[BandaMove, number]>) {
    return { kind: 'banda' as const, moves: moves.map(([move, at]) => ({ move, at })) };
}

/** El medio de cada franja, que es donde se juega una mano limpia. */
function franjas(setup: BandaSetup) {
    return {
        amague: setup.amagueEnd / 2,
        ritmo: (setup.amagueEnd + setup.atropellarStart) / 2,
        atropellar: (setup.atropellarStart + 1) / 2,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · EL SETUP
// ═══════════════════════════════════════════════════════════════════════════

test('mismo contexto, mismo reparto de defensores y cancha', () => {
    const a = BANDA.setup(ctx());
    const b = BANDA.setup(ctx());
    assert.deepEqual(b, a, 'dos setups con el mismo ctx dieron distinto');
});

test('LA CORRIDA PERFECTA ES POSIBLE SIEMPRE', () => {
    // El invariante que hace jugable el reparto: con un metro por defensor
    // —atropellarlos a todos— la cancha tiene que alcanzar. Si alguna vez no
    // alcanzara, habría manos repartidas donde el try no existe y el jugador no
    // tendría forma de saberlo.
    for (let seed = 1; seed <= 400; seed += 1) {
        const setup = BANDA.setup(ctx({ seed: momentSeed(seed, 'banda', 1, 0) }));
        assert.ok(
            setup.space >= setup.defenders,
            `semilla ${seed}: ${setup.defenders} defensores y ${setup.space} metros — el try es imposible`,
        );
    }
});

test('LA GAMBETA ENSANCHA EL AMAGUE, Y EL OFICIO NUNCA', () => {
    const flojo = baseAttributes(WING);
    const crack = { ...baseAttributes(WING), gambeta: 92 };

    const conFlojo = BANDA.setup(ctx({ attrs: flojo }));
    const conCrack = BANDA.setup(ctx({ attrs: crack }));
    assert.ok(conCrack.amagueEnd > conFlojo.amagueEnd, 'la gambeta no ensanchó la ventana del amague');

    // Y el que la juega prestada la juega peor, nunca mejor.
    const prestada = BANDA.setup(ctx({ attrs: crack, proficiency: 0.75 }));
    assert.ok(prestada.amagueEnd < conCrack.amagueEnd, 'el oficio prestado ensanchó el amague');
});

test('LA VELOCIDAD DA MÁS TIEMPO ENTRE DEFENSORES', () => {
    const lento = BANDA.setup(ctx({ attrs: { ...baseAttributes(WING), velocidad: 45 } }));
    const rapido = BANDA.setup(ctx({ attrs: { ...baseAttributes(WING), velocidad: 92 } }));
    assert.ok(rapido.closeMs > lento.closeMs, 'la velocidad no dio más tiempo');
});

test('EL CAÑÓN DE CRISTAL: arriba de 85 el riesgo muscular sube, y se cobra igual', () => {
    // La calibración del spec: +18 puntos de riesgo pasando 85 de velocidad.
    let tironesLento = 0;
    let tironesRapido = 0;

    for (let seed = 1; seed <= 600; seed += 1) {
        const s = momentSeed(seed, 'banda', 1, 0);
        if (BANDA.setup(ctx({ seed: s, attrs: { ...baseAttributes(WING), velocidad: 60 } })).muscleInjury) tironesLento += 1;
        if (BANDA.setup(ctx({ seed: s, attrs: { ...baseAttributes(WING), velocidad: 95 } })).muscleInjury) tironesRapido += 1;
    }

    assert.ok(tironesRapido > tironesLento * 2, `el rápido no se rompe más (${tironesRapido} contra ${tironesLento})`);

    // Y se paga se anote o no: el mismo tirón con el try hecho.
    const roto: BandaSetup = { ...BANDA.setup(ctx()), muscleInjury: true, defenders: 3, space: 12 };
    const f = franjas(roto);
    const conTry = BANDA.resolve(roto, mano(roto, [['amague', f.amague], ['amague', f.amague], ['amague', f.amague]]));
    assert.equal(conTry.result, 'Try en la bandera');
    assert.ok((conTry.deltas.bodyDamage ?? 0) > 5, 'el tirón no se cobró con el try hecho');
    assert.equal(conTry.deltas.playingTime, -1, 'el tirón no costó tiempo de juego');
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA DISTANCIA ES LA ELECCIÓN
// ═══════════════════════════════════════════════════════════════════════════

test('cada verbo sirve en su franja y en ninguna otra', () => {
    const setup = BANDA.setup(ctx());
    const f = franjas(setup);

    assert.equal(bandaMoveAt(f.amague, setup), 'amague');
    assert.equal(bandaMoveAt(f.ritmo, setup), 'ritmo');
    assert.equal(bandaMoveAt(f.atropellar, setup), 'atropellar');
    // No llegar a hacer nada no es un verbo.
    assert.equal(bandaMoveAt(1.4, setup), null);
    assert.equal(bandaMoveAt(-0.2, setup), null);
});

test('TIRARLE EL HOMBRO DE LEJOS NO ES ATROPELLAR', () => {
    // Es la regla que hace que el minijuego sea de aguantar y no de apretar: el
    // verbo tiene que coincidir con la distancia a la que lo jugaste.
    const setup = BANDA.setup(ctx());
    const f = franjas(setup);
    const r = BANDA.resolve(setup, mano(setup, [['atropellar', f.amague]]));
    assert.equal(r.result, 'Lo frenó el primero');
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LA CAL CORTA LA JUGADA, NO BORRA LOS METROS
// ═══════════════════════════════════════════════════════════════════════════

test('LOS METROS NO SE BORRAN AL PISAR LA CAL', () => {
    // El corazón del Momento. Cinco defensores, poca cancha y una mano que
    // amaga todo: quiebra a los primeros y se queda sin lateral. Los metros que
    // ganó tienen que estar cobrados.
    const setup: BandaSetup = { ...BANDA.setup(ctx()), defenders: 5, space: 7 };
    const f = franjas(setup);
    const r = BANDA.resolve(setup, mano(setup, [
        ['amague', f.amague], ['amague', f.amague], ['amague', f.amague],
        ['amague', f.amague], ['amague', f.amague],
    ]));

    assert.equal(r.result, 'Se fue por el lateral');
    assert.ok((r.deltas.fame ?? 0) > 0, 'pisó la cal y perdió todo lo que había ganado');
    assert.ok((r.deltas.belonging ?? 0) > 0, 'los metros no contaron para el vestuario');
});

test('romper más paga más, aunque las dos terminen en la cal', () => {
    const setup: BandaSetup = { ...BANDA.setup(ctx()), defenders: 5, space: 5 };
    const f = franjas(setup);

    // Una quiebra a uno y se va; la otra quiebra a dos.
    const unaSola = BANDA.resolve(setup, mano(setup, [['amague', f.amague], ['amague', f.amague]]));
    const dos = BANDA.resolve(setup, mano(setup, [['ritmo', f.ritmo], ['ritmo', f.ritmo], ['ritmo', f.ritmo]]));

    assert.ok((dos.deltas.fame ?? 0) > (unaSola.deltas.fame ?? 0), 'quebrar más no pagó más');
});

test('EL TACKLE TARDÍO PUNTÚA MEJOR QUE LA CAL TARDÍA', () => {
    // Que te tackleen es que la defensa te ganó; irte al lateral es que te
    // ganaste solo. Con los mismos quiebres, la nota no puede ser la misma.
    assert.equal(bandaGrade(3, 'tackle'), 'bien');
    assert.equal(bandaGrade(3, 'cal'), 'mal');
    assert.equal(bandaGrade(5, 'try'), 'try');
    // Sin un solo quiebre no hay metros que contar, se haya terminado como se
    // haya terminado.
    assert.equal(bandaGrade(0, 'tackle'), 'desastre');
    assert.equal(bandaGrade(0, 'cal'), 'desastre');
});

test('UNA MANO CORTA NO ROMPE NADA: la corrida termina donde termina', () => {
    // Es el caso de la pantalla que se cierra a la mitad, y el que hace que
    // `resolve` tenga que truncar en vez de confiar en el largo de la lista.
    const setup: BandaSetup = { ...BANDA.setup(ctx()), defenders: 5, space: 12 };
    const f = franjas(setup);
    const r = BANDA.resolve(setup, mano(setup, [['ritmo', f.ritmo], ['ritmo', f.ritmo]]));

    assert.equal(r.result, 'Corrida que rompió la línea');
    assert.ok((r.deltas.fame ?? 0) > 0, 'los dos quiebres no se cobraron');
});

test('una mano vacía es que te bajó el primero', () => {
    const setup = BANDA.setup(ctx());
    const r = BANDA.resolve(setup, { kind: 'banda', moves: [] });
    assert.equal(r.result, 'Lo frenó el primero');
    assert.ok((r.deltas.fame ?? 0) < 0, 'que te bajen sin hacer nada no puede salir gratis');
});

test('los movimientos de más se ignoran: no se inventan defensores', () => {
    // Mismo trato que el `pushes` de El Ancla: una pantalla que manda siete no
    // puede fabricar rivales que la jugada no tenía.
    const setup: BandaSetup = { ...BANDA.setup(ctx()), defenders: 3, space: 12 };
    const f = franjas(setup);
    const justos = BANDA.resolve(setup, mano(setup, [['amague', f.amague], ['amague', f.amague], ['amague', f.amague]]));
    const demas = BANDA.resolve(setup, mano(setup, [
        ['amague', f.amague], ['amague', f.amague], ['amague', f.amague],
        ['amague', f.amague], ['amague', f.amague],
    ]));
    assert.deepEqual(demas, justos, 'los movimientos de más cambiaron la jugada');
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LA CANCHA COMO RECURSO
// ═══════════════════════════════════════════════════════════════════════════

test('ATROPELLAR CUESTA CUERPO Y NO CUESTA CANCHA', () => {
    const setup: BandaSetup = { ...BANDA.setup(ctx()), defenders: 3, space: 9, muscleInjury: false };
    const f = franjas(setup);

    const amagando = BANDA.resolve(setup, mano(setup, [['amague', f.amague], ['amague', f.amague], ['amague', f.amague]]));
    const atropellando = BANDA.resolve(setup, mano(setup, [
        ['atropellar', f.atropellar], ['atropellar', f.atropellar], ['atropellar', f.atropellar],
    ]));

    // Las dos son try —la cancha alcanzaba— pero una se paga con el cuerpo.
    assert.equal(amagando.result, 'Try en la bandera');
    assert.equal(atropellando.result, 'Try en la bandera');
    assert.ok(
        (atropellando.deltas.bodyDamage ?? 0) > (amagando.deltas.bodyDamage ?? 0),
        'pasarles por arriba salió tan barato como amagar',
    );
});

test('amagarlos a todos no entra cuando son muchos', () => {
    // Es lo que obliga a decidir: la forma cómoda no alcanza para una corrida
    // larga, y hay que bancarse a alguno encima.
    const setup: BandaSetup = { ...BANDA.setup(ctx()), defenders: 5, space: 12 };
    const f = franjas(setup);
    const r = BANDA.resolve(setup, mano(setup, Array(5).fill(['amague', f.amague]) as Array<[BandaMove, number]>));
    assert.equal(r.result, 'Se fue por el lateral');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · EL NIVEL
// ═══════════════════════════════════════════════════════════════════════════

test('jugada BIEN, la corrida termina en try — y es una cuenta, no una mano perfecta', () => {
    // El simulado de nivel `bien` administra el lateral: gasta lo más caro que
    // puede dejando un metro por cada uno que falta. Si eso se rompe, el try
    // deja de salir en los repartos con poca cancha.
    for (let seed = 1; seed <= 120; seed += 1) {
        const setup = BANDA.setup(ctx({ seed: momentSeed(seed, 'banda', 2, 0) }));
        const r = BANDA.resolve(setup, BANDA.playAt(setup, 'bien', (seed % 10) / 10));
        assert.equal(
            r.result,
            'Try en la bandera',
            `semilla ${seed}: ${setup.defenders} defensores, ${setup.space} metros — jugada bien y sin try`,
        );
    }
});

test('jugada MAL, te frena el primero', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
        const setup = BANDA.setup(ctx({ seed: momentSeed(seed, 'banda', 3, 0) }));
        assert.equal(BANDA.resolve(setup, BANDA.playAt(setup, 'mal', 0.5)).result, 'Lo frenó el primero');
    }
});
