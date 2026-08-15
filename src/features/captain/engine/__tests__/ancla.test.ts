// EL ANCLA.
//
// Es el único Momento que no se juega con el reloj, así que lo que hay que
// probar es distinto: que la apuesta sea una apuesta. Que insistir pague, que
// pasarse cueste, que lo ganado no se borre con el derrumbe —si se borrara, la
// jugada correcta sería soltar siempre en la primera y no habría decisión— y que
// el punto de quiebre esté decidido antes de que el jugador toque nada.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentSetupCtx } from '../../types/moment-def.ts';
import { baseAttributes } from '../../data/positions.ts';
import { momentSeed } from '../moments.ts';
import { ANCLA, ANCLA_MAX_PUSHES, anclaGrade, anclaHoldChance } from '../moment-defs/ancla.ts';

function attrs(empuje: number): CaptainAttributes {
    return { ...baseAttributes('primera-linea'), empuje };
}

function ctx(over: Partial<MomentSetupCtx> = {}): MomentSetupCtx {
    return {
        kind: 'ancla',
        season: 5,
        minute: 71,
        scoreDelta: -2,
        pressure: 0.68,
        family: 'primera-linea',
        proficiency: 1,
        attrs: attrs(58),
        bodyDamage: 18,
        seed: momentSeed(20260801, 'ancla', 5, 0),
        ...over,
    };
}

const mano = (pushes: number) => ({ kind: 'ancla' as const, pushes });

// ═══════════════════════════════════════════════════════════════════════════
//  Determinismo
// ═══════════════════════════════════════════════════════════════════════════

test('mismo setup y misma apuesta dan exactamente lo mismo', () => {
    const setup = ANCLA.setup(ctx());
    assert.deepEqual(ANCLA.resolve(setup, mano(2)), ANCLA.resolve(setup, mano(2)));
});

test('EL PUNTO DE QUIEBRE SE DECIDE ANTES DE QUE EL JUGADOR TOQUE NADA', () => {
    // Si se sorteara al resolver, insistir tres veces daría distinto según
    // cuándo se resolvió, y recargar antes de decidir cambiaría la apuesta.
    const setup = ANCLA.setup(ctx());
    assert.ok(setup.breakAt >= 1 && setup.breakAt <= ANCLA_MAX_PUSHES + 1);
    assert.deepEqual(ANCLA.setup(ctx()), setup);

    // Y sobrevive al viaje por JSON, que es lo que hace la recarga.
    assert.deepEqual(JSON.parse(JSON.stringify(setup)), setup);
});

test('EL SETUP CONSUME EL MISMO AZAR SE CAIGA DONDE SE CAIGA', () => {
    // El bucle que sortea el quiebre NO corta al primer fallo, y no es un
    // descuido: si cortara, la cantidad de tiradas dependería de dónde se cayó el
    // scrum y el golpe de cabeza —que se sortea DESPUÉS— saldría distinto según
    // el empuje del jugador. Un pilar fuerte y uno flojo con la misma semilla
    // tienen scrums distintos, pero el golpe tiene que ser el mismo.
    //
    // Se barren semillas hasta encontrar una donde el empuje SÍ mueva el quiebre:
    // con una sola semilla el test podría pasar sin haber probado nada, porque
    // los dos pilares pueden caerse en el mismo empuje por casualidad.
    let comparados = 0;

    for (let season = 1; season <= 120; season += 1) {
        const seed = momentSeed(31337, 'ancla', season, 0);
        const flojo = ANCLA.setup(ctx({ seed, attrs: attrs(20) }));
        const fuerte = ANCLA.setup(ctx({ seed, attrs: attrs(95) }));
        if (flojo.breakAt === fuerte.breakAt) continue;

        comparados += 1;
        assert.equal(
            flojo.headKnock,
            fuerte.headKnock,
            `semilla ${seed}: el golpe dependió de dónde se cayó el scrum (${flojo.breakAt} contra ${fuerte.breakAt})`,
        );
    }

    assert.ok(comparados > 0, 'el empuje no movió el quiebre en ninguna semilla: el test no probó nada');
});

// ═══════════════════════════════════════════════════════════════════════════
//  Los márgenes
// ═══════════════════════════════════════════════════════════════════════════

test('EL EMPUJE AGUANTA MÁS', () => {
    const flojo = anclaHoldChance(attrs(40), 0, 0.5, 1);
    const fuerte = anclaHoldChance(attrs(80), 0, 0.5, 1);
    assert.ok(fuerte > flojo, `el empuje no aguantó más: ${flojo} → ${fuerte}`);
});

test('el cuerpo roto se derrumba antes, y la presión también', () => {
    const entero = anclaHoldChance(attrs(58), 0, 0.5, 1);
    const roto = anclaHoldChance(attrs(58), 90, 0.5, 1);
    assert.ok(roto < entero, `el desgaste no adelantó el derrumbe: ${entero} → ${roto}`);

    const tranquilo = anclaHoldChance(attrs(58), 0, 0, 1);
    const apretado = anclaHoldChance(attrs(58), 0, 1, 1);
    assert.ok(apretado < tranquilo, 'la presión no apretó');
});

test('EL OFICIO NUNCA AGUANTA MÁS', () => {
    const propio = anclaHoldChance(attrs(58), 10, 0.5, 1);
    for (const oficio of [0.9, 0.75, 0.5, 0]) {
        assert.ok(anclaHoldChance(attrs(58), 10, 0.5, oficio) <= propio, `oficio ${oficio} aguantó más`);
    }
    assert.equal(anclaHoldChance(attrs(58), 10, 0.5, 3), propio, 'un oficio mayor que 1 regaló margen');
});

// ═══════════════════════════════════════════════════════════════════════════
//  La apuesta
// ═══════════════════════════════════════════════════════════════════════════

test('soltar enseguida no gana ni pierde nada, salvo el cuerpo', () => {
    const setup = ANCLA.setup(ctx());
    const result = ANCLA.resolve(setup, mano(0));
    assert.equal(result.result, 'Scrum sin historia');
    assert.equal(result.deltas.fame, undefined);
    assert.equal(result.deltas.sanction, undefined);
    assert.ok((result.deltas.bodyDamage ?? 0) > 0, 'el scrum siempre cuesta cuerpo');
});

test('INSISTIR PAGA, Y PASARSE CUESTA PARTIDOS', () => {
    // Se busca un setup con margen para las dos cosas: que aguante al menos una
    // y que se caiga antes del tope.
    let setup = null;
    for (let season = 1; season <= 80 && !setup; season += 1) {
        const s = ANCLA.setup(ctx({ seed: momentSeed(4242, 'ancla', season, 0) }));
        if (s.breakAt >= 2 && s.breakAt <= ANCLA_MAX_PUSHES) setup = s;
    }
    assert.ok(setup, 'no apareció un scrum con margen para probar las dos cosas');

    const justo = ANCLA.resolve(setup!, mano(setup!.breakAt - 1));
    assert.ok((justo.deltas.fame ?? 0) > 0, 'aguantar no pagó Cartel');
    assert.ok((justo.deltas.belonging ?? 0) > 0, 'aguantar no pagó Pertenencia');
    assert.equal(justo.deltas.sanction, undefined, 'aguantar sin caerse no puede costar partidos');

    const pasado = ANCLA.resolve(setup!, mano(setup!.breakAt));
    assert.equal(pasado.result, 'Scrum derrumbado');
    assert.ok((pasado.deltas.sanction ?? 0) > 0, 'el derrumbe no costó partidos');
    assert.ok((pasado.deltas.fame ?? 0) < (justo.deltas.fame ?? 0), 'pasarse tiene que costar Cartel');
});

test('LO GANADO NO SE BORRA CON EL DERRUMBE', () => {
    // Es lo que hace que esto sea una apuesta y no una trampa: si el derrumbe
    // borrara los penales ya sacados, soltar en la primera sería siempre
    // correcto y la decisión no existiría.
    let setup = null;
    for (let season = 1; season <= 80 && !setup; season += 1) {
        const s = ANCLA.setup(ctx({ seed: momentSeed(777, 'ancla', season, 0) }));
        if (s.breakAt === 3) setup = s;
    }
    if (!setup) return;

    const conDos = ANCLA.resolve(setup, mano(3)); // aguantó dos, se cayó en la tercera
    assert.equal(conDos.result, 'Scrum derrumbado');
    assert.ok((conDos.deltas.belonging ?? 0) > 0, 'las dos ganadas desaparecieron con el derrumbe');
});

test('una apuesta imposible no rompe nada', () => {
    const setup = ANCLA.setup(ctx());
    // Ni más allá del tope ni negativa: la pantalla no puede inventar insistidas.
    const pasado = ANCLA.resolve(setup, mano(99));
    const tope = ANCLA.resolve(setup, mano(setup.maxPushes));
    assert.deepEqual(pasado, tope);
    assert.deepEqual(ANCLA.resolve(setup, mano(-5)), ANCLA.resolve(setup, mano(0)));
});

test('la nota sale de aguantar y de caerse, y nada más', () => {
    for (let held = 0; held <= ANCLA_MAX_PUSHES; held += 1) {
        assert.equal(anclaGrade(held, true), 'derrumbe');
    }
    assert.equal(anclaGrade(0, false), 'prudente');
    assert.equal(anclaGrade(1, false), 'firme');
    assert.equal(anclaGrade(2, false), 'dominante');
    assert.equal(anclaGrade(3, false), 'dominante');
});

test('la crónica nombra el minuto', () => {
    const setup = ANCLA.setup(ctx({ minute: 74 }));
    assert.ok(ANCLA.resolve(setup, mano(1)).text.includes('Minuto 74'));
});

test('el ancla no encadena: el derrumbe ya se cobró con el penal', () => {
    const setup = ANCLA.setup(ctx());
    for (const pushes of [0, 1, 2, 3]) {
        assert.equal(ANCLA.resolve(setup, mano(pushes)).chain, undefined);
    }
});
