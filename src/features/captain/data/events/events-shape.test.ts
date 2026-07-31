// Invariantes del catálogo de eventos.
//
// No prueban que el contenido sea bueno —eso se prueba jugando— sino que
// cumpla las reglas que el motor y la pantalla dan por ciertas sin volver a
// chequear. Un evento que las rompe no falla: miente.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_EVENTS } from './index.ts';

/** Si agregás una familia, sumá el prefijo acá y en `index.ts`. */
const PREFIJOS = ['club-', 'per-', 'nt-', 'inj-', 'dis-', 'vet-', 'mer-'];

test('los ids son únicos y llevan prefijo de familia', () => {
    const vistos = new Set<string>();
    for (const event of ALL_EVENTS) {
        assert.ok(!vistos.has(event.id), `id repetido: ${event.id}`);
        vistos.add(event.id);
        assert.ok(
            PREFIJOS.some((p) => event.id.startsWith(p)),
            `${event.id} no lleva prefijo de familia (${PREFIJOS.join(' ')})`,
        );
    }
});

test('NUNCA una decisión de una sola opción', () => {
    // Si el jugador no elige nada, no es una decisión: es un resultado, y va
    // como tarjeta de resultado con un "Continuar" distinto de los botones de
    // decisión (CLAUDE.md §3).
    for (const event of ALL_EVENTS) {
        assert.ok(event.options.length >= 2, `${event.id} tiene una sola opción: eso no es una decisión`);
    }
});

test('cada opción dice qué resigna', () => {
    for (const event of ALL_EVENTS) {
        const ids = new Set<string>();
        for (const option of event.options) {
            assert.ok(!ids.has(option.id), `${event.id}: opción repetida ${option.id}`);
            ids.add(option.id);
            assert.ok(option.label.length > 0, `${event.id}/${option.id} sin etiqueta`);
            assert.ok(
                option.hint.length >= 12,
                `${event.id}/${option.id}: el hint tiene que decir el costo, no solo el beneficio`,
            );
        }
    }
});

test('los pesos de cada opción suman 100', () => {
    // Las probabilidades se muestran, así que se escriben como se van a leer:
    // 70 y 30, no 7 y 3. Si no suman 100, el porcentaje de la pantalla miente.
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            assert.ok(option.outcomes.length >= 1, `${event.id}/${option.id} sin desenlaces`);
            const total = option.outcomes.reduce((acc, o) => acc + o.weight, 0);
            assert.equal(total, 100, `${event.id}/${option.id}: los pesos suman ${total} y tienen que sumar 100`);
            for (const outcome of option.outcomes) {
                assert.ok(outcome.weight > 0, `${event.id}/${option.id}: hay un desenlace con peso cero`);
                assert.ok(outcome.resultText.length > 12, `${event.id}/${option.id}: desenlace sin texto`);
            }
        }
    }
});

test('el cooldown solo existe si el evento se repite', () => {
    for (const event of ALL_EVENTS) {
        if (!event.repeatable) {
            assert.equal(event.cooldown, undefined, `${event.id} no se repite: el cooldown no significa nada`);
        }
        assert.ok(event.weight > 0, `${event.id} con peso cero no sale nunca`);
    }
});

test('la voz del proyecto: sin signos de exclamación', () => {
    // Español rioplatense, frases cortas, tono de crónica deportiva. El signo
    // de exclamación es de videojuego y acá no va (CLAUDE.md §4).
    for (const event of ALL_EVENTS) {
        const textos = [
            event.title,
            event.text,
            ...event.options.flatMap((o) => [o.label, o.hint, ...o.outcomes.map((x) => x.resultText)]),
        ];
        for (const texto of textos) {
            assert.ok(!texto.includes('!'), `${event.id}: "${texto.slice(0, 40)}…" tiene un signo de exclamación`);
            assert.ok(!texto.includes('¡'), `${event.id}: "${texto.slice(0, 40)}…" tiene un signo de exclamación`);
        }
    }
});

test('vocabulario de rugby, no de fútbol', () => {
    // "tu equipo" es de fútbol: acá es "tu club" (CLAUDE.md §4).
    const prohibidas = [/\btu equipo\b/i, /\bgol(es)?\b/i, /\barquero\b/i, /\bcancha de fútbol\b/i];
    for (const event of ALL_EVENTS) {
        const textos = [event.title, event.text, ...event.options.flatMap((o) => [o.label, o.hint, ...o.outcomes.map((x) => x.resultText)])];
        for (const texto of textos) {
            for (const patron of prohibidas) {
                assert.ok(!patron.test(texto), `${event.id}: "${texto.slice(0, 50)}…" usa vocabulario de fútbol`);
            }
        }
    }
});

test('hay contenido para las dos escaleras y para el cuerpo', () => {
    const porCategoria = new Map<string, number>();
    for (const event of ALL_EVENTS) {
        porCategoria.set(event.category, (porCategoria.get(event.category) ?? 0) + 1);
    }
    for (const categoria of ['club', 'personal', 'seleccion', 'cuerpo', 'disciplina', 'veterano']) {
        assert.ok((porCategoria.get(categoria) ?? 0) > 0, `no hay un solo evento de categoría '${categoria}'`);
    }
});
