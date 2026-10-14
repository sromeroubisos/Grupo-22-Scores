// La forma de los eventos. Es el test que hace que agregar contenido sea seguro:
// si una tarjeta nueva rompe una convención, falla acá y no en producción.

import assert from 'node:assert/strict';
import test from 'node:test';
import { optionPreview } from '../../engine/event-selector.ts';
import { FAMILY_PREFIX } from '../../types/event.ts';
import { ALL_EVENTS } from './index.ts';

test('hay contenido para arrancar', () => {
    assert.ok(ALL_EVENTS.length >= 40, `solo ${ALL_EVENTS.length} eventos: la spec pide al menos 40`);
});

test('los ids son únicos', () => {
    const seen = new Set<string>();
    for (const ev of ALL_EVENTS) {
        assert.ok(!seen.has(ev.id), `id repetido: ${ev.id}`);
        seen.add(ev.id);
    }
});

test('cada id lleva el prefijo de su familia', () => {
    for (const ev of ALL_EVENTS) {
        const prefix = FAMILY_PREFIX[ev.family];
        assert.ok(prefix, `familia sin prefijo declarado: ${ev.family}`);
        assert.ok(ev.id.startsWith(prefix), `${ev.id} debería empezar con "${prefix}"`);
    }
});

test('los ids son kebab-case', () => {
    for (const ev of ALL_EVENTS) {
        assert.match(ev.id, /^[a-z]+-[a-z0-9-]+$/, `${ev.id} no es kebab-case`);
        for (const op of ev.options) {
            assert.match(op.id, /^[a-z0-9-]+$/, `${ev.id}/${op.id} no es kebab-case`);
        }
    }
});

test('NUNCA una decisión de una sola opción', () => {
    // Si el jugador no elige nada, no es una decisión: es un resultado, y va como
    // tarjeta de resultado con un "Continuar" distinto de los botones de decisión.
    for (const ev of ALL_EVENTS) {
        assert.ok(
            ev.options.length >= 2,
            `${ev.id} tiene una sola opción: eso es un resultado, no una decisión`,
        );
    }
});

test('los ids de opción son únicos dentro de su evento', () => {
    for (const ev of ALL_EVENTS) {
        const ids = ev.options.map((o) => o.id);
        assert.equal(new Set(ids).size, ids.length, `${ev.id} tiene ids de opción repetidos`);
    }
});

test('toda opción tiene al menos un desenlace y todos pesan', () => {
    for (const ev of ALL_EVENTS) {
        for (const op of ev.options) {
            assert.ok(op.outcomes.length >= 1, `${ev.id}/${op.id} sin desenlaces`);
            for (const out of op.outcomes) {
                assert.ok(out.weight > 0, `${ev.id}/${op.id} tiene un desenlace con peso ${out.weight}`);
                assert.ok(
                    out.resultText.trim().length > 0,
                    `${ev.id}/${op.id} tiene un desenlace sin narración`,
                );
            }
        }
    }
});

test('las probabilidades que se muestran suman 100', () => {
    for (const ev of ALL_EVENTS) {
        for (const op of ev.options) {
            const preview = optionPreview(ev.id, op.id);
            assert.equal(preview.length, op.outcomes.length, `${ev.id}/${op.id}: faltan porcentajes`);
            const total = preview.reduce((s, x) => s + x, 0);
            assert.equal(total, 100, `${ev.id}/${op.id} suma ${total}, no 100`);
        }
    }
});

test('toda opción dice su costo en el hint', () => {
    // El jugador tiene que poder elegir entendiendo qué resigna.
    for (const ev of ALL_EVENTS) {
        for (const op of ev.options) {
            assert.ok(op.hint.trim().length > 0, `${ev.id}/${op.id} no tiene hint`);
            assert.ok(op.label.trim().length > 0, `${ev.id}/${op.id} no tiene label`);
        }
    }
});

test('sin signos de exclamación: el tono es de crónica, no de videojuego', () => {
    for (const ev of ALL_EVENTS) {
        const pieces = [
            ev.title,
            ev.text,
            ...ev.options.flatMap((o) => [o.label, o.hint, ...o.outcomes.map((x) => x.resultText)]),
        ];
        for (const piece of pieces) {
            assert.ok(
                !piece.includes('!') && !piece.includes('¡'),
                `${ev.id}: "${piece}" lleva signos de exclamación`,
            );
        }
    }
});

test('se dice "club", no "equipo": el vocabulario es de rugby', () => {
    for (const ev of ALL_EVENTS) {
        const pieces = [ev.title, ev.text, ...ev.options.map((o) => o.hint)];
        for (const piece of pieces) {
            assert.ok(!/\btu equipo\b/i.test(piece), `${ev.id}: "${piece}" dice "tu equipo" — en rugby es "tu club"`);
        }
    }
});

test('el cooldown solo tiene sentido si el evento se repite', () => {
    for (const ev of ALL_EVENTS) {
        if (!ev.repeatable) {
            assert.equal(ev.cooldown, undefined, `${ev.id} no es repetible pero declara cooldown`);
        }
    }
});

test('todo evento pesa algo', () => {
    for (const ev of ALL_EVENTS) {
        assert.ok(ev.weight > 0, `${ev.id} tiene peso ${ev.weight}: nunca saldría`);
    }
});
