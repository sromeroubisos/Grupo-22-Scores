// Invariantes del catálogo de eventos.
//
// No prueban que el contenido sea bueno —eso se prueba jugando— sino que
// cumpla las reglas que el motor y la pantalla dan por ciertas sin volver a
// chequear. Un evento que las rompe no falla: miente.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_EVENTS } from './index.ts';
import { rarityOf } from '../../engine/event-selector.ts';
import { ALL_FAMILIES } from '../positions.ts';

/** Si agregás una familia, sumá el prefijo acá y en `index.ts`. */
const PREFIJOS = ['club-', 'per-', 'nt-', 'inj-', 'dis-', 'vet-', 'mer-', 'of-'];

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

// ═══════════════════════════════════════════════════════════════════════════
//  LA RAREZA
// ═══════════════════════════════════════════════════════════════════════════

test('UNA OPORTUNIDAD DE ORO NO SE REPITE', () => {
    // Es la definición y no una calibración: si vuelve el año que viene, no era
    // una oportunidad, era el catálogo. El `raro` va por el mismo camino — las
    // dos bandas de arriba marcan puertas que se abren una vez.
    for (const event of ALL_EVENTS) {
        const rareza = rarityOf(event);
        if (rareza !== 'oro' && rareza !== 'raro') continue;
        assert.equal(
            event.repeatable,
            false,
            `${event.id} es '${rareza}' y se repite: una puerta que se abre todos los años no es una puerta`,
        );
    }
});

test('LAS OCHO FAMILIAS TIENEN SU RARO Y SU ORO', () => {
    // El motivo es el mismo por el que cada familia tiene su propia gloria
    // (`data/positions.ts`): sin esto, la tarjeta grande de la carrera le tocaría
    // siempre a los mismos puestos y el pilar jugaría un juego más chico que el
    // wing. Se mide sobre `requires.families`, que es lo que decide a quién le
    // llega — un evento sin familias declaradas le llega a todos y no cubre a
    // nadie en particular.
    for (const rareza of ['raro', 'oro'] as const) {
        for (const familia of ALL_FAMILIES) {
            const tiene = ALL_EVENTS.some(
                (e) => rarityOf(e) === rareza && e.requires?.families?.includes(familia),
            );
            assert.ok(tiene, `la familia '${familia}' no tiene ningún evento '${rareza}' propio`);
        }
    }
});

test('LA ESCALA DE CAPTAIN NO ES LA DE CARRERA DE RUGBY', () => {
    // Está medido y es la trampa más fácil de pisar al escribir una tarjeta
    // grande: un `+9 Choque` se siente enorme al escribirlo y no existe, porque
    // `applyAttrs` recorta contra el potencial y lo deja en lo que quepa. La
    // tarjeta prometería una cosa y haría otra, que es exactamente lo que el
    // motor de impacto existe para impedir.
    //
    // Lo grande de un `raro` o un `oro` se paga por los canales que SÍ
    // transportan —`playingTime`, `statBoost`, `belonging`— y no inflando un
    // número que el techo se come. Ver la cabecera de `oficio.ts`.
    //
    // El tope es de los POSITIVOS solamente: una lesión que cobra −5 de
    // velocidad tiene que poder cobrarlos, y ahí no hay ningún techo que la
    // disimule.
    const TOPE = 3;
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            for (const outcome of option.outcomes) {
                const attrs = outcome.effect.attrs;
                if (!attrs) continue;
                for (const key of Object.keys(attrs).sort()) {
                    const delta = attrs[key as keyof typeof attrs] ?? 0;
                    assert.ok(
                        delta <= TOPE,
                        `${event.id}/${option.id}: ${key} +${delta} pasa el tope de +${TOPE}. `
                        + 'El techo lo va a recortar y la tarjeta va a prometer lo que no hace.',
                    );
                }
            }
        }
    }
});

test('un evento del oficio le habla a UN puesto', () => {
    // El prefijo `of-` es una promesa sobre a quién le llega la tarjeta, y sin
    // `requires.families` la promesa es falsa: el evento del scrum le saldría al
    // wing. Es la §1.5 aplicada al catálogo — el nombre y la cosa tienen que
    // decir lo mismo.
    for (const event of ALL_EVENTS) {
        if (!event.id.startsWith('of-')) continue;
        const familias = event.requires?.families;
        assert.ok(
            familias && familias.length > 0,
            `${event.id} lleva prefijo 'of-' y no declara 'requires.families': le llegaría a cualquier puesto`,
        );
    }
});
