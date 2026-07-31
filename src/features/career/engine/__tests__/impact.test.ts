// LOS CINCO EJES — que lo que la tarjeta promete sea lo que el motor hace.
//
// Este archivo protege UNA cosa y es la más importante del rediseño: la ⭐ que se
// muestra no es una etiqueta que alguien tipeó al escribir el evento, es el OVR
// que ese efecto mueve de verdad en ese puesto. Si algún día se cambia la tabla de
// pesos de un puesto, las setenta y una decisiones que ya existen cambian su ⭐
// solas y estos tests siguen pasando. Si en cambio se rompe la traducción, fallan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_EVENTS } from '../../data/events/index.ts';
import { ALL_POSITIONS, getPosition } from '../../data/positions.ts';
import {
    appliedValoracion, effectChips, optionPreview, ovrDeltaOf, spreadValoracion, toneOf, visibleChips,
} from '../impact.ts';
import { computeOvr, ovrExact } from '../scoring.ts';
import type { Attributes, Position } from '../../types/player.ts';
import type { Effect } from '../../types/event.ts';

/** Atributos en el medio de la escala: lejos de los topes de `clampAttr`. */
function midAttributes(): Attributes {
    return { power: 55, speed: 55, technique: 55, tackle: 55, kick: 55, vision: 55, mental: 55, stamina: 55 };
}

const ATTR_KEYS = ['power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina'] as const;

// ── 1. La valoración es el OVR de verdad ─────────────────────────────────────

test('⭐ es exactamente el OVR que el efecto mueve en ese puesto', () => {
    const efectos: Effect[] = [
        { power: 3, stamina: 2 },
        { technique: 3, vision: 2 },
        { kick: 5, mental: 2 },
        { tackle: -2, form: -3 },
        { mental: 4, vision: 2, fame: 8, morale: 6 },
    ];

    for (const position of ALL_POSITIONS) {
        for (const effect of efectos) {
            const antes = midAttributes();
            const despues = { ...antes };
            for (const key of ATTR_KEYS) {
                const delta = effect[key];
                if (delta !== undefined) despues[key] += delta;
            }
            const real = ovrExact(despues, position) - ovrExact(antes, position);
            assert.ok(
                Math.abs(real - ovrDeltaOf(effect, position)) < 1e-9,
                `${position}: ⭐ dice ${ovrDeltaOf(effect, position)} y el OVR se mueve ${real}`,
            );
        }
    }
});

test('la misma decisión vale distinto según el puesto, y eso es el punto', () => {
    // Cinco de patada es hacerse cargo de los palos: para el apertura es una
    // noticia y para el pilar no cambia nada. Si la ⭐ fuera una etiqueta escrita
    // a mano, los dos verían el mismo número.
    const patada: Effect = { kick: 5 };
    const apertura = ovrDeltaOf(patada, 'flyhalf');
    const pilar = ovrDeltaOf(patada, 'prop');
    assert.ok(apertura > pilar * 2, `apertura ${apertura} vs pilar ${pilar}: la patada tendría que pesar mucho más en el 10`);
});

// ── 2. El reparto de ⭐ aterriza exacto ──────────────────────────────────────

test('spreadValoracion aterriza EXACTO en los puntos prometidos', () => {
    for (const position of ALL_POSITIONS) {
        const weights = getPosition(position).weights;
        for (const puntos of [1, 2, 3, -1, -2]) {
            const spread = spreadValoracion(weights, puntos);
            const antes = midAttributes();
            const despues = { ...antes };
            for (const key of ATTR_KEYS) {
                const delta = spread[key];
                if (delta !== undefined) despues[key] += delta;
            }
            const real = ovrExact(despues, position) - ovrExact(antes, position);
            assert.ok(
                Math.abs(real - puntos) < 1e-9,
                `${position}: se prometieron ${puntos} puntos y se movieron ${real}`,
            );
        }
    }
});

test('el reparto sigue al puesto: cae más en lo que el puesto usa', () => {
    // El apertura recibe más en patada que en tackle; el pilar, al revés. Un
    // reparto plano sería más simple y estaría mal: significaría que entrenar de
    // apertura y de pilar es la misma cosa.
    const apertura = spreadValoracion(getPosition('flyhalf').weights, 2);
    const pilar = spreadValoracion(getPosition('prop').weights, 2);
    assert.ok((apertura.kick ?? 0) > (apertura.power ?? 0), 'el apertura tendría que ganar más en patada que en potencia');
    assert.ok((pilar.power ?? 0) > (pilar.kick ?? 0), 'el pilar tendría que ganar más en potencia que en patada');
});

// ── 3. El techo se respeta ───────────────────────────────────────────────────

test('la ⭐ no pasa el techo por arriba, y el castigo no tiene techo', () => {
    // El potencial es un techo que se alcanza (`progression-ceiling.test.ts`), así
    // que una decisión no puede regalar OVR por encima. La caída sí es libre: el
    // piso no es el potencial.
    assert.equal(appliedValoracion({ valoracion: 3 }, 1), 1, 'con 1 de margen no puede sumar 3');
    assert.equal(appliedValoracion({ valoracion: 3 }, 0), 0, 'en el techo no suma nada');
    assert.equal(appliedValoracion({ valoracion: 3 }, -4), 0, 'por arriba del techo tampoco baja');
    assert.equal(appliedValoracion({ valoracion: 3 }, 10), 3, 'con margen de sobra suma lo prometido');
    assert.equal(appliedValoracion({ valoracion: -2 }, 0), -2, 'el castigo se aplica igual en el techo');
    assert.equal(appliedValoracion({}, 5), 0, 'sin ⭐ declarada no se inventa ninguna');
});

test('en el techo la ficha dice +0 y NO el número escondido', () => {
    // El potencial nunca se muestra (CLAUDE.md: oculto hasta el retiro). Que la
    // ficha diga "+0" es la verdad —entrenaste y no te queda margen— y no filtra
    // cuál era el techo.
    const chips = effectChips({ valoracion: 3 }, 'flyhalf', 0);
    const estrella = chips.find((c) => c.axis === 'valoracion');
    assert.equal(estrella, undefined, 'sin movimiento real no tendría que haber ficha de valoración');
});

// ── 4. Las probabilidades cierran ────────────────────────────────────────────

test('las posibilidades de cada opción suman 100 en todo el catálogo', () => {
    const malas: string[] = [];
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            const total = optionPreview(option, 'flyhalf').reduce((sum, p) => sum + p.chance, 0);
            if (total !== 100) malas.push(`${event.id}/${option.id}: suma ${total}`);
        }
    }
    assert.deepEqual(malas, [], malas.join(' · '));
});

test('el reparto de porcentajes es estable y no depende del orden del sort', () => {
    // Tres desenlaces de peso 1 dan 34/33/33 y no 33/33/33: el resto va al
    // primero, siempre al mismo, hoy y dentro de seis meses.
    const option = {
        id: 'x',
        label: 'x',
        outcomes: [
            { weight: 1, effect: {}, resultText: 'a' },
            { weight: 1, effect: {}, resultText: 'b' },
            { weight: 1, effect: {}, resultText: 'c' },
        ],
    };
    const chances = optionPreview(option, 'prop').map((p) => p.chance);
    assert.deepEqual(chances, [34, 33, 33]);
    assert.deepEqual(optionPreview(option, 'prop').map((p) => p.chance), chances, 'dos llamadas dieron distinto');
});

test('los pesos declarados se leen como el diseño los escribió', () => {
    // 70/30 tiene que mostrarse 70/30, no 67/33.
    const option = {
        id: 'x',
        label: 'x',
        outcomes: [
            { weight: 70, effect: { fame: 4 }, resultText: 'a' },
            { weight: 30, effect: { morale: -4 }, resultText: 'b' },
        ],
    };
    assert.deepEqual(optionPreview(option, 'wing').map((p) => p.chance), [70, 30]);
});

// ── 5. Verde y rojo ──────────────────────────────────────────────────────────

test('el tono distingue la buena noticia de la mala', () => {
    const casos: { effect: Effect; espera: 'good' | 'bad' | 'neutral'; que: string }[] = [
        { effect: { technique: 3, morale: 4, fame: 3 }, espera: 'good', que: 'crecer y ser querido' },
        { effect: { forceInjury: { name: 'x', severity: 'grave', seasonsOut: 0.5 }, morale: -4 }, espera: 'bad', que: 'romperse' },
        { effect: { sanction: { card: 'roja', matches: 2 }, morale: -7 }, espera: 'bad', que: 'la roja' },
        { effect: { playingTime: 2, mental: 1 }, espera: 'good', que: 'ganar minutos' },
        { effect: { playingTime: -2, morale: -3 }, espera: 'bad', que: 'perder minutos' },
        { effect: {}, espera: 'neutral', que: 'no pasa nada' },
        { effect: { moveToOffer: undefined, retire: true }, espera: 'neutral', que: 'el retiro no es bueno ni malo' },
    ];
    for (const { effect, espera, que } of casos) {
        assert.equal(toneOf(effectChips(effect, 'centre')), espera, `${que}: se esperaba ${espera}`);
    }
});

test('una lesión grave con un punto de ánimo NO es un empate', () => {
    // El tono se pesa por eje. Contar fichas daría neutral, que es exactamente la
    // clase de mentira que el color no puede decir.
    const chips = effectChips(
        { forceInjury: { name: 'x', severity: 'grave', seasonsOut: 0.5 }, morale: 2, fame: 2 },
        'lock',
    );
    assert.equal(toneOf(chips), 'bad');
});

test('la fatiga se lee al revés: carga que sube es mala noticia', () => {
    const sube = effectChips({ fatigue: 10 }, 'prop').find((c) => c.axis === 'fisico');
    const baja = effectChips({ fatigue: -10 }, 'prop').find((c) => c.axis === 'fisico');
    assert.equal(sube?.tone, 'bad');
    assert.equal(baja?.tone, 'good');
});

test('el riesgo de lesión también: bajarlo es bueno', () => {
    assert.equal(effectChips({ injuryRisk: -12 }, 'hooker').find((c) => c.axis === 'lesion')?.tone, 'good');
    assert.equal(effectChips({ injuryRisk: 8 }, 'hooker').find((c) => c.axis === 'lesion')?.tone, 'bad');
});

test('cuando te rompés, el riesgo no se cuenta dos veces', () => {
    const chips = effectChips(
        { forceInjury: { name: 'x', severity: 'moderada', seasonsOut: 0.3 }, injuryRisk: 6 },
        'backrow',
    );
    assert.equal(chips.filter((c) => c.axis === 'lesion').length, 1, 'la lesión y el riesgo son una sola noticia');
});

// ── 6. El catálogo habla el idioma nuevo ─────────────────────────────────────

test('toda decisión mueve algo en al menos una de sus opciones', () => {
    const vacios: string[] = [];
    for (const event of ALL_EVENTS) {
        const mueve = event.options.some((o) => o.outcomes.some((x) => effectChips(x.effect, 'flyhalf').length > 0));
        if (!mueve) vacios.push(event.id);
    }
    assert.deepEqual(vacios, [], `decisiones que no mueven nada: ${vacios.join(', ')}`);
});

test('los cinco ejes existen en el catálogo, no sólo en el tipo', () => {
    const vistos = new Set<string>();
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            for (const outcome of option.outcomes) {
                // Se recorre con dos puestos porque hay eventos gateados por
                // puesto: la patada del apertura no aparece en un pilar.
                for (const position of ['flyhalf', 'prop'] as Position[]) {
                    for (const chip of effectChips(outcome.effect, position)) vistos.add(chip.axis);
                }
            }
        }
    }
    for (const eje of ['valoracion', 'minutos', 'lesion', 'sancion', 'reputacion']) {
        assert.ok(vistos.has(eje), `ningún evento usa el eje ${eje}`);
    }
});

test('la ⭐ de una decisión es modesta: el grueso lo pone la temporada', () => {
    // Una decisión que regale seis puntos de OVR compite con el desarrollo de un
    // año entero y convierte la carrera en una lotería de tarjetas.
    const grandes: string[] = [];
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            for (const outcome of option.outcomes) {
                for (const position of ALL_POSITIONS) {
                    const ovr = ovrDeltaOf(outcome.effect, position);
                    if (Math.abs(ovr) > 3.2) grandes.push(`${event.id}/${option.id} en ${position}: ${ovr.toFixed(1)}`);
                }
            }
        }
    }
    assert.deepEqual(grandes, [], grandes.join(' · '));
});

// ── 7. La pantalla habla de DOS ejes ─────────────────────────────────────────

test('lo que se muestra son sólo valoración y tiempo de juego', () => {
    const otros = new Set<string>();
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            for (const outcome of option.outcomes) {
                for (const position of ALL_POSITIONS) {
                    for (const chip of visibleChips(outcome.effect, position)) {
                        if (chip.axis !== 'valoracion' && chip.axis !== 'minutos') otros.add(`${event.id}: ${chip.axis}`);
                    }
                }
            }
        }
    }
    assert.deepEqual([...otros], [], `se colaron ejes que no se muestran: ${[...otros].join(', ')}`);
});

test('la lesión NO se esconde: se cuenta como tiempo de juego perdido', () => {
    // Es el riesgo de mostrar dos ejes en vez de siete. Una lesión es, muy
    // literalmente, fechas que no vas a jugar: si no entrara en 🕒, "30% de
    // desgarro" se leería como "30% de que no pase nada".
    for (const severity of ['leve', 'moderada', 'grave'] as const) {
        const chips = visibleChips({ forceInjury: { name: 'x', severity, seasonsOut: 0.3 } }, 'centre');
        const minutos = chips.find((c) => c.axis === 'minutos');
        assert.ok(minutos, `una lesión ${severity} tendría que costar tiempo de juego`);
        assert.equal(minutos.tone, 'bad');
    }
    // Y una más grave cuesta más que una leve.
    const leve = visibleChips({ forceInjury: { name: 'x', severity: 'leve', seasonsOut: 0.1 } }, 'centre')[0].value;
    const grave = visibleChips({ forceInjury: { name: 'x', severity: 'grave', seasonsOut: 0.6 } }, 'centre')[0].value;
    assert.ok(grave.length > leve.length, `grave (${grave}) tendría que pesar más que leve (${leve})`);
});

test('la sanción tampoco: la amarilla son diez minutos y la roja, fechas', () => {
    const amarilla = visibleChips({ sanction: { card: 'amarilla' } }, 'prop');
    assert.equal(amarilla.length, 1, 'una amarilla tiene que decir algo');
    assert.equal(amarilla[0].axis, 'minutos');

    const roja = visibleChips({ sanction: { card: 'roja', matches: 2 } }, 'prop');
    assert.ok(roja[0].value.length > amarilla[0].value.length, 'dos fechas pesan más que diez minutos');
});

test('un desenlace de pura reputación no muestra fichas, y sigue siendo buena noticia', () => {
    // El relato lo cuenta ("te ganás a la tribuna"). Lo que no puede pasar es que
    // el color diga que fue malo.
    const effect = { fame: 6, morale: 3 };
    assert.deepEqual(visibleChips(effect, 'wing'), []);
    assert.equal(toneOf(effectChips(effect, 'wing')), 'good');
});

test('el color sale del modelo completo, no de las dos fichas visibles', () => {
    // Una suspensión sin ⭐ ni pérdida de forma declarada igual tiene que
    // iluminarse en rojo.
    const effect = { sanction: { matches: 1, reason: 'x' }, fame: 3 };
    assert.equal(toneOf(effectChips(effect, 'hooker')), 'bad');
});

// ── 8. Presentación pura ─────────────────────────────────────────────────────

test('leer el impacto no toca nada: los atributos quedan como estaban', () => {
    // `effectChips` corre en cada render. Si mutara algo, la carrera dependería de
    // cuántas veces se dibujó la pantalla.
    const antes = midAttributes();
    const copia = { ...antes };
    const effect: Effect = { valoracion: 2, power: 3, sanction: { card: 'roja', matches: 2 } };
    effectChips(effect, 'lock');
    optionPreview({ id: 'x', label: 'x', outcomes: [{ weight: 1, effect, resultText: 'x' }] }, 'lock');
    assert.deepEqual(antes, copia);
    assert.deepEqual(effect, { valoracion: 2, power: 3, sanction: { card: 'roja', matches: 2 } }, 'el efecto se modificó al leerlo');
    assert.equal(computeOvr(antes, 'lock'), computeOvr(copia, 'lock'));
});
