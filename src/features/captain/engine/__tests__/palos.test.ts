// LOS PALOS.
//
// El invariante que hay que cuidar acá es el que define el minijuego entero:
// APUNTAR AL MEDIO CON VIENTO ES ERRARLE. Si eso deja de ser cierto, Los Palos
// se convierte en la barra del tackle con otro fondo y el juego pierde un verbo.
//
// Y el otro: es el único Momento que no cuesta cuerpo. Un Momento que no lastima
// existe para que los que lastiman signifiquen algo.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentSetupCtx } from '../../types/moment-def.ts';
import { baseAttributes } from '../../data/positions.ts';
import { momentSeed } from '../moments.ts';
import { PALOS, palosGrade, palosLanding, palosPerfectAim, palosTolerance } from '../moment-defs/palos.ts';

function attrs(pegada: number): CaptainAttributes {
    return { ...baseAttributes('apertura'), pegada };
}

function ctx(over: Partial<MomentSetupCtx> = {}): MomentSetupCtx {
    return {
        kind: 'palos',
        season: 9,
        minute: 79,
        scoreDelta: -2,
        pressure: 0.85,
        family: 'apertura',
        proficiency: 1,
        attrs: attrs(62),
        bodyDamage: 10,
        seed: momentSeed(20260801, 'palos', 9, 0),
        ...over,
    };
}

const mano = (aim: number) => ({ kind: 'palos' as const, aim });

// ═══════════════════════════════════════════════════════════════════════════
//  Determinismo
// ═══════════════════════════════════════════════════════════════════════════

test('mismo setup y misma puntería dan exactamente lo mismo', () => {
    const setup = PALOS.setup(ctx());
    assert.deepEqual(PALOS.resolve(setup, mano(0.2)), PALOS.resolve(setup, mano(0.2)));
});

test('EL VIENTO SE SORTEA EN EL SETUP Y VIAJA AL GUARDADO', () => {
    const setup = PALOS.setup(ctx());
    assert.ok(setup.distance >= 28 && setup.distance <= 48, `distancia rara: ${setup.distance}`);
    assert.ok(setup.angle >= 0 && setup.angle <= 1);
    assert.ok(setup.wind >= -1 && setup.wind <= 1);
    assert.deepEqual(PALOS.setup(ctx()), setup);
    assert.deepEqual(JSON.parse(JSON.stringify(setup)), setup);
});

// ═══════════════════════════════════════════════════════════════════════════
//  El invariante que define el minijuego
// ═══════════════════════════════════════════════════════════════════════════

test('APUNTAR AL MEDIO CON VIENTO ES ERRARLE', () => {
    // Es toda la diferencia con la barra del tackle: allá se frena SOBRE el
    // blanco, acá el blanco no está donde se ve. Si esto se rompe, Los Palos deja
    // de ser un verbo propio.
    const setup = { ...PALOS.setup(ctx()), wind: 1, tolerance: 0.2 };
    const alMedio = PALOS.resolve(setup, mano(0));
    assert.notEqual(alMedio.result, 'Patada decisiva', 'con viento fuerte, apuntar al medio entró');

    const compensada = PALOS.resolve(setup, mano(palosPerfectAim(setup.wind)));
    assert.equal(compensada.result, 'Patada decisiva', 'compensar el viento exacto no entró');
});

test('la compensación es la inversa exacta del arrastre', () => {
    for (const wind of [-1, -0.5, 0, 0.35, 1]) {
        assert.ok(Math.abs(palosLanding(palosPerfectAim(wind), wind)) < 1e-9, `no se compensa con viento ${wind}`);
    }
});

test('sin viento, apuntar al medio sí entra', () => {
    // El invariante de arriba no puede ser "nunca entra apuntando al medio": si
    // no hay viento, el medio es el medio.
    const setup = { ...PALOS.setup(ctx()), wind: 0, tolerance: 0.2 };
    assert.equal(PALOS.resolve(setup, mano(0)).result, 'Patada decisiva');
});

// ═══════════════════════════════════════════════════════════════════════════
//  Los márgenes
// ═══════════════════════════════════════════════════════════════════════════

test('LA PEGADA ABRE LOS PALOS', () => {
    assert.ok(palosTolerance(attrs(85), 35, 0.4, 0.5, 1) > palosTolerance(attrs(40), 35, 0.4, 0.5, 1));
});

test('la distancia y el ángulo los cierran', () => {
    assert.ok(palosTolerance(attrs(62), 46, 0.4, 0.5, 1) < palosTolerance(attrs(62), 30, 0.4, 0.5, 1));
    assert.ok(palosTolerance(attrs(62), 35, 0.95, 0.5, 1) < palosTolerance(attrs(62), 35, 0.05, 0.5, 1));
});

test('EL OFICIO NUNCA ABRE LOS PALOS', () => {
    const propio = palosTolerance(attrs(62), 35, 0.4, 0.5, 1);
    for (const oficio of [0.9, 0.75, 0.5, 0]) {
        assert.ok(palosTolerance(attrs(62), 35, 0.4, 0.5, oficio) <= propio, `oficio ${oficio} abrió los palos`);
    }
    assert.equal(palosTolerance(attrs(62), 35, 0.4, 0.5, 3), propio, 'un oficio mayor que 1 abrió los palos');
});

// ═══════════════════════════════════════════════════════════════════════════
//  Los deltas
// ═══════════════════════════════════════════════════════════════════════════

test('ERRARLA NUNCA PAGA', () => {
    const setup = { ...PALOS.setup(ctx()), wind: 0, tolerance: 0.15 };
    for (const aim of [0.9, -0.9, 0.4, -0.35]) {
        const result = PALOS.resolve(setup, mano(aim));
        if (result.result === 'Patada decisiva') continue;
        assert.ok((result.deltas.fame ?? 0) < 0, `errarla pagó Cartel: ${JSON.stringify(result.deltas)}`);
        assert.equal(result.deltas.belonging, undefined, 'errarla pagó Pertenencia');
    }
});

test('EL ÚNICO MOMENTO QUE NO CUESTA CUERPO', () => {
    // Y está bien que se note: los otros cuatro son contacto, este se juega con
    // el estómago. Si algún día Los Palos lastima, los otros dejan de decir algo.
    const setup = PALOS.setup(ctx());
    for (const aim of [-1, -0.3, 0, 0.5, 1]) {
        const { deltas } = PALOS.resolve(setup, mano(aim));
        assert.equal(deltas.bodyDamage, undefined, 'la patada lastimó');
        assert.equal(deltas.headDamage, undefined, 'la patada pegó en la cabeza');
        assert.equal(deltas.sanction, undefined, 'errar una patada no es una infracción');
    }
});

test('el palo es un afuera que se cuenta distinto, no un tercer resultado', () => {
    assert.equal(palosGrade(0.1, 0.2), 'adentro');
    assert.equal(palosGrade(0.25, 0.2), 'palo');
    assert.equal(palosGrade(0.9, 0.2), 'afuera');

    const setup = { ...PALOS.setup(ctx()), wind: 0, tolerance: 0.2 };
    const palo = PALOS.resolve(setup, mano(0.25));
    const afuera = PALOS.resolve(setup, mano(0.9));
    assert.equal(palo.result, 'Pegó en el palo');
    assert.deepEqual(palo.deltas, afuera.deltas, 'el palo tiene que pagar lo mismo que el afuera');
});

test('una puntería fuera de la barra se acota', () => {
    const setup = PALOS.setup(ctx());
    assert.deepEqual(PALOS.resolve(setup, mano(50)), PALOS.resolve(setup, mano(1)));
    assert.deepEqual(PALOS.resolve(setup, mano(-50)), PALOS.resolve(setup, mano(-1)));
});

test('la crónica nombra el minuto y la distancia', () => {
    const setup = PALOS.setup(ctx({ minute: 78 }));
    const texto = PALOS.resolve(setup, mano(0)).text;
    assert.ok(texto.includes('Minuto 78'), `la crónica no dice el minuto: "${texto}"`);
    assert.ok(texto.includes(String(setup.distance)), `la crónica no dice la distancia: "${texto}"`);
});

test('LA PANTALLA NO USA LA COMPENSACIÓN PERFECTA', () => {
    // `palosPerfectAim` existe para los tests. Si la pantalla la usara —para
    // dibujar una guía, para "ayudar"— le estaría resolviendo el minijuego al
    // jugador y el viento dejaría de ser una decisión.
    // __tests__ → engine → captain → features → src
    const src = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
    const pantalla = join(src, 'app', 'juegos', 'minijuegos', 'el-capitan', 'PalosMoment.tsx');
    assert.ok(
        !readFileSync(pantalla, 'utf8').includes('palosPerfectAim'),
        'PalosMoment.tsx está usando palosPerfectAim: eso le resuelve la patada al jugador',
    );
});
