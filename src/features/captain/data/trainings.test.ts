// La forma del catálogo de entrenamientos.
//
// No mide balance —de eso se ocupan `calibration` y `agency`— sino las
// invariantes que hacen que la carta no pueda mentir. Las dos que más importan:
//
//   1. `aging.ts` reparte lo dirigido sobre `family.attributes`, así que un
//      atributo declarado fuera de la familia se perdería SIN RUIDO. El jugador
//      elegiría "Pelota alta" y no subiría nada.
//   2. LO CARO TIENE QUE COSTAR. Una carta que reparte más puntos que otra y no
//      pide nada a cambio no es una opción: es la respuesta correcta, y las
//      otras tres pasan a ser decoración. Es la invariante que reemplaza al
//      viejo "todas reparten el mismo presupuesto", que era la forma anterior de
//      evitar lo mismo — y que salía cara por el otro lado: sin diferencia de
//      tamaño no había nada que pagar, y sin nada que pagar la decisión no
//      movía el pico.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_FAMILIES, POSITION_FAMILIES } from './positions.ts';
import { TRAINING_POINTS, TRAININGS, getTraining, isFree, trainingPoints, trainingsFor } from './trainings.ts';

test('las ocho familias tienen su catálogo, y son cuatro cada una', () => {
    for (const family of ALL_FAMILIES) {
        const opciones = trainingsFor(family);
        assert.equal(opciones.length, 4, `${family}: la carta se dibuja con cuatro opciones`);
    }
});

test('cada entrenamiento sube uno o dos atributos, y los dos de la familia', () => {
    for (const family of ALL_FAMILIES) {
        const cuentan = new Set<string>(POSITION_FAMILIES[family].attributes);
        for (const t of trainingsFor(family)) {
            assert.ok(
                t.gain.length === 1 || t.gain.length === 2,
                `${t.id}: sube ${t.gain.length} atributos y tienen que ser uno o dos`,
            );
            for (const { attr, points } of t.gain) {
                assert.ok(
                    cuentan.has(attr),
                    `${t.id}: sube '${attr}', que no le cuenta a la media de ${family}. `
                    + 'Sería una opción trampa y además `aging.ts` la perdería sin avisar.',
                );
                assert.ok(points > 0, `${t.id}: reparte ${points} puntos en '${attr}'`);
            }
            const attrs = t.gain.map((g) => g.attr);
            assert.equal(new Set(attrs).size, attrs.length, `${t.id}: repite un atributo`);
        }
    }
});

test('los ids son únicos en todo el catálogo', () => {
    const vistos = new Set<string>();
    for (const family of ALL_FAMILIES) {
        for (const t of trainingsFor(family)) {
            assert.ok(!vistos.has(t.id), `id repetido: ${t.id}`);
            vistos.add(t.id);
        }
    }
    assert.equal(vistos.size, ALL_FAMILIES.length * 4);
});

test('el tier y los puntos dicen lo mismo: la etiqueta no puede mentir', () => {
    // `trainingPoints` suma el `gain` y la pantalla dibuja el tier. Si los dos se
    // separaran, el jugador leería "cara" y recibiría lo de una floja.
    for (const family of ALL_FAMILIES) {
        for (const t of trainingsFor(family)) {
            assert.equal(
                trainingPoints(t),
                TRAINING_POINTS[t.tier],
                `${t.id}: dice ser '${t.tier}' pero reparte ${trainingPoints(t)} puntos`,
            );
        }
    }
});

test('NINGUNA OPCIÓN ES DOMINANTE: lo que reparte más, cuesta más', () => {
    // El corazón del archivo. Se verifica MONOTONÍA, no una tabla: ordenadas por
    // puntos, el costo no puede bajar. Una carta que dé más y cueste menos que
    // otra de la misma mano hace que las otras tres dejen de existir.
    for (const family of ALL_FAMILIES) {
        const ordenadas = [...trainingsFor(family)].sort((a, b) => trainingPoints(a) - trainingPoints(b));
        for (let i = 1; i < ordenadas.length; i += 1) {
            const menor = ordenadas[i - 1];
            const mayor = ordenadas[i];
            if (trainingPoints(mayor) === trainingPoints(menor)) continue;
            assert.ok(
                !isFree(mayor) || isFree(menor),
                `${family}: '${mayor.id}' reparte más que '${menor.id}' y es gratis. Es un botón, no una opción.`,
            );
            const pesoMayor = costOf(mayor);
            const pesoMenor = costOf(menor);
            assert.ok(
                pesoMayor > pesoMenor,
                `${family}: '${mayor.id}' reparte ${trainingPoints(mayor)} y cuesta ${pesoMayor}, `
                + `contra ${trainingPoints(menor)} y ${pesoMenor} de '${menor.id}'. Lo caro tiene que costar.`,
            );
        }
    }
});

test('en cada mano hay al menos una de cada tipo: la decisión existe siempre', () => {
    // Si una familia ofreciera cuatro caras, el jugador no elige cuánto pagar:
    // paga. Y si ofreciera cuatro gratis, tampoco elige. La decisión vive en que
    // las tres estén sobre la mesa el mismo año.
    for (const family of ALL_FAMILIES) {
        const tiers = new Set(trainingsFor(family).map((t) => t.tier));
        for (const tier of ['floja', 'media', 'cara'] as const) {
            assert.ok(tiers.has(tier), `${family}: no ofrece ninguna '${tier}'`);
        }
    }
});

test('gratis es gratis, y solo las flojas lo son', () => {
    for (const family of ALL_FAMILIES) {
        for (const t of trainingsFor(family)) {
            if (t.tier === 'floja') {
                assert.ok(isFree(t), `${t.id}: dice ser floja y cobra algo`);
            } else {
                assert.ok(!isFree(t), `${t.id}: dice ser '${t.tier}' y no cobra nada`);
                assert.ok(t.cost !== null, `${t.id}: sin costo declarado`);
                assert.ok(t.cost.body >= 0 && t.cost.minutes >= 0, `${t.id}: un costo negativo es un premio`);
                assert.ok(
                    t.cost.injuryRisk >= 0 && t.cost.injuryRisk <= 0.25,
                    `${t.id}: riesgo de ${t.cost.injuryRisk}. Arriba de 0,25 la carta deja de ser jugable.`,
                );
            }
        }
    }
});

test('cada opción dice qué resigna, no solo qué gana', () => {
    // CLAUDE.md §4: el `hint` tiene que dejar elegir entendiendo el costo. No se
    // puede verificar la prosa, pero sí que exista y no sea un placeholder.
    for (const family of ALL_FAMILIES) {
        for (const t of trainingsFor(family)) {
            assert.ok(t.labelEs.length > 0, `${t.id}: sin etiqueta`);
            assert.ok(t.hint.length >= 20, `${t.id}: el hint es demasiado corto para decir un costo`);
            assert.ok(!t.labelEs.includes('!'), `${t.id}: sin signos de exclamación (CLAUDE.md §4)`);
            assert.ok(!t.hint.includes('!'), `${t.id}: sin signos de exclamación (CLAUDE.md §4)`);
        }
    }
});

test('un id de otra familia no resuelve: no es una elección válida', () => {
    // Es la puerta que hace que el reducer pueda ignorar la acción sin inventar
    // una validación propia.
    const ajeno = TRAININGS['wing-fullback'][0].id;
    assert.equal(getTraining('primera-linea', ajeno), null);
    assert.equal(getTraining('primera-linea', 'no-existe'), null);
    assert.ok(getTraining('wing-fullback', ajeno));
});

/**
 * El costo en una sola cifra, SOLO para ordenar dentro de una mano.
 *
 * No es una tasa de cambio entre cuerpo, minutos y riesgo —esa conversión no
 * existe y pretender que sí sería peor que no tenerla—: es un escalar monótono
 * que sirve para preguntar "¿esta cuesta más que aquella?" y para nada más. Por
 * eso vive en el test y no en el catálogo.
 */
function costOf(t: { cost: { body: number; minutes: number; injuryRisk: number } | null }): number {
    if (t.cost === null) return 0;
    return t.cost.body + t.cost.minutes * 2 + t.cost.injuryRisk * 10;
}
