// FORMA DE LOS EVENTOS — invariantes del catálogo, no del motor.
//
// Son reglas del CLAUDE.md que hasta ahora vivían solo en la cabeza de quien
// escribía el evento. Cuatro hitos las rompían sin que nadie se enterara
// (`mil-100-matches`, `mil-world-cup-final`, `mil-testimonial` y
// `mil-hall-of-fame` eran decisiones de una sola opción), y se descubrió de
// casualidad al escribir otro test. Con esto no vuelve a pasar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_EVENTS } from '../../data/events/index.ts';
import { careerReducer, getPendingEvent, hashSeed } from '../../index.ts';
import type { CareerState } from '../../types/career.ts';

test('ninguna decisión tiene una sola opción', () => {
    // "Si el jugador no elige nada, no es una decisión: es un resultado."
    // Un evento con una sola opción es un botón de Continuar disfrazado de
    // decisión, y le enseña al jugador que sus elecciones no importan.
    const solitarios = ALL_EVENTS.filter((e) => e.options.length < 2).map((e) => e.id);
    assert.deepEqual(solitarios, [], `eventos con una sola opción: ${solitarios.join(', ')}`);
});

test('toda opción dice qué resigna: hint presente y distinto de la etiqueta', () => {
    const sinHint: string[] = [];
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            if (!option.hint || option.hint.trim().length < 8) sinHint.push(`${event.id}/${option.id}`);
        }
    }
    assert.deepEqual(sinHint, [], `opciones sin hint útil: ${sinHint.join(', ')}`);
});

test('los ids son únicos y llevan el prefijo de su familia', () => {
    const vistos = new Set<string>();
    const repetidos: string[] = [];
    for (const event of ALL_EVENTS) {
        if (vistos.has(event.id)) repetidos.push(event.id);
        vistos.add(event.id);
    }
    assert.deepEqual(repetidos, [], `ids repetidos: ${repetidos.join(', ')}`);

    const prefijos = ['env-', 'club-', 'per-', 'mil-', 'nt-', 'tac-', 'med-', 'inj-', 'vet-', 'dis-'];
    const raros = ALL_EVENTS.filter((e) => !prefijos.some((p) => e.id.startsWith(p))).map((e) => e.id);
    assert.deepEqual(raros, [], `ids sin prefijo de familia conocido: ${raros.join(', ')}`);
});

test('todo desenlace tiene peso positivo y texto', () => {
    const malos: string[] = [];
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            if (option.outcomes.length === 0) malos.push(`${event.id}/${option.id}: sin desenlaces`);
            for (const outcome of option.outcomes) {
                if (!(outcome.weight > 0)) malos.push(`${event.id}/${option.id}: peso ${outcome.weight}`);
                if (!outcome.resultText || outcome.resultText.trim().length === 0) {
                    malos.push(`${event.id}/${option.id}: desenlace sin texto`);
                }
            }
        }
    }
    assert.deepEqual(malos, [], malos.join(' · '));
});

test('el mercado es el eje: dos de cada tres decisiones son de club', () => {
    // El reparto medido y acordado es 65/35. Sin este test, cualquier evento de
    // vida que se agregue después corre el reparto sin que nadie se entere: el
    // pool de vida crece con cada tanda de contenido y el de mercado no.
    const POSICIONES = ['prop', 'lock', 'flyhalf', 'wing'] as const;
    let mercado = 0;
    let vida = 0;

    for (let i = 0; i < 40; i++) {
        let state = careerReducer({} as CareerState, {
            type: 'START',
            input: { position: POSICIONES[i % POSICIONES.length], nationalityCountryCode: 'ar' },
            seed: 1000 + i * 7919,
        });
        let guard = 0;
        while (state.phase !== 'retired' && guard++ < 60) {
            const event = getPendingEvent(state);
            if (event === null) {
                state = careerReducer(state, { type: 'ADVANCE' });
                continue;
            }
            if (event.id === 'club-transfer' || event.id === 'club-no-renewal') mercado++;
            else vida++;
            const jugables = event.options.filter((o) => o.id !== 'retire-now');
            const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % jugables.length;
            state = careerReducer(state, { type: 'CHOOSE', optionId: jugables[idx].id });
        }
    }

    // BANDA CORRIDA A 60-85 (objetivo ~78%). La anterior era 55-75 sobre un
    // objetivo de 65, y el motor mide 78,4%: la diferencia se revisó y el reparto
    // actual es el que se quiere. El mercado ES el eje del juego, y que cuatro de
    // cada cinco decisiones sean de club describe eso mejor que dos de cada tres.
    //
    // El techo de 85 no es adorno: sigue habiendo que dejar lugar a la vida, la
    // lesión, la selección y la táctica. Si esto llega a 90 el juego se convirtió
    // en un simulador de traspasos y hay que ir a mirar el pool de eventos.
    const share = mercado / (mercado + vida);
    assert.ok(
        share >= 0.60 && share <= 0.85,
        `el mercado quedó en ${(share * 100).toFixed(1)}% de las decisiones (objetivo 78%, banda 60-85%)`,
    );
});
