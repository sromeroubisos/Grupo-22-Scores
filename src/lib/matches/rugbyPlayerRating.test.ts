import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PESOS_POR_PUESTO,
    PUESTO_POR_NUMERO,
    RATING_BASE,
    RATING_COMPONENTS,
    RUBROS,
    RUBROS_IMPRESCINDIBLES,
    SANCIONES,
    hayPlanillaParaPuntuar,
    minutesFromLineup,
    rateRugbyPlayer,
} from './rugbyPlayerRating.ts';
import { REFERENCIAS_POR_PUESTO, SESGO_POR_PUESTO, TOTAL_DE_EQUIPO } from './rugbyRatingReferences.generated.ts';

/**
 * El partido exactamente promedio DE UN PUESTO, en ochenta minutos.
 *
 * Las varas son PARTES del total del equipo, asi que para armar una planilla
 * hay que devolverlas a conteos contra un equipo promedio —y despues pasarle al
 * motor ese mismo equipo como contexto, para que la division lo cancele.
 *
 * Sale de las referencias y no de numeros escritos a mano: las varas se
 * recalibran con cada cosecha, y un promedio transcripto se desincroniza en la
 * primera recalibracion sin que ningun test lo note.
 */
const promedioDe = (puesto: number): Record<string, number> =>
    Object.fromEntries(
        Object.keys(RUBROS).map((metricId) => [
            metricId,
            (REFERENCIAS_POR_PUESTO[puesto]?.[metricId]?.media ?? 0) * (TOTAL_DE_EQUIPO[metricId] ?? 0),
        ])
    );

/** Un desvio del puesto, tambien devuelto a conteos del equipo promedio. */
const desvioDe = (puesto: number, metricId: string) =>
    (REFERENCIAS_POR_PUESTO[puesto]?.[metricId]?.desvio ?? 0) * (TOTAL_DE_EQUIPO[metricId] ?? 0);

/** El plantel promedio, que es el denominador que anula la normalizacion. */
const EQUIPO = TOTAL_DE_EQUIPO;

const PUESTOS = Object.keys(PESOS_POR_PUESTO).map(Number);
const titular = { role: 'starter' as const, onMinute: null, offMinute: null };

test('la tabla de pesos reparte cien puntos en cada puesto', () => {
    for (const [puesto, pesos] of Object.entries(PESOS_POR_PUESTO)) {
        const suma = RATING_COMPONENTS.reduce((total, eje) => total + pesos[eje], 0);
        assert.equal(suma, 100, `el puesto ${puesto} suma ${suma}`);
    }
});

/**
 * EL INVARIANTE DEL MOTOR, y la razon entera del rediseño.
 *
 * Con una vara unica para los quince, medido sobre 60.339 puntajes, el pilar
 * derecho promediaba 5,32 y el apertura 7,81. Dos puntos y pico que no
 * describian a nadie —describian el puesto—.
 *
 * Lo que se verifica aca es que el jugador exactamente promedio de su puesto
 * salga NEUTRO: rendimiento cero en los cinco ejes, y una señal que es solo el
 * recentrado. Cualquier sesgo de puesto que sobreviva en las varas aparece como
 * un eje distinto de cero.
 *
 * OJO CON LO QUE ESTE TEST NO PUEDE VER. La nota final del partido promedio NO
 * es la misma en los quince —da 6,1 en un pilar y 6,7 en un medio scrum— y eso
 * no es un sesgo: el motor recentra por la MEDIANA, y en un conteo la media
 * esta arriba de la mediana, mas en unos puestos que en otros. Que los quince
 * caigan juntos DE VERDAD es una propiedad de la distribucion, no de un jugador
 * sintetico, y se mide sobre la cosecha con
 * `node scripts/rugby-ratings/validar.mjs`. Ahi el spread entre puestos da 0,19.
 *
 * Se recorren los quince y no dos de muestra: el sintoma es una diferencia
 * ENTRE puestos, y con dos se elige justo el par que empata.
 */
test('el jugador promedio de su puesto sale neutro', () => {
    for (const puesto of PUESTOS) {
        const r = rateRugbyPlayer({ stats: promedioDe(puesto), minutes: 80, number: puesto, team: EQUIPO })!;
        // Con ochenta minutos la confianza es 1, asi que la señal es el
        // recentrado y nada mas. Si alguien lo aplica dos veces, o se olvida de
        // usar el del puesto, esto salta.
        assert.ok(
            Math.abs(r.signal + SESGO_POR_PUESTO[puesto]) < 1e-9,
            `el puesto ${puesto} dio señal ${r.signal} y su sesgo es ${SESGO_POR_PUESTO[puesto]}`
        );
        assert.ok(Math.abs(r.value - RATING_BASE) < 1, `el partido promedio del puesto ${puesto} dio ${r.value}`);
    }
});

/**
 * Y el corolario: ningun eje arranca torcido. Si `defensa` diera -0,4 en el
 * pilar y +0,3 en el wing, el promedio podria seguir dando 6 por compensacion
 * entre ejes y el sesgo seguiria ahi, escondido.
 */
test('ningun eje arranca torcido en ningun puesto', () => {
    for (const puesto of PUESTOS) {
        const r = rateRugbyPlayer({ stats: promedioDe(puesto), minutes: 80, number: puesto, team: EQUIPO })!;
        for (const eje of RATING_COMPONENTS) {
            assert.ok(
                Math.abs(r.components[eje]) < 1e-9,
                `el puesto ${puesto} arranca con ${eje} en ${r.components[eje]}`
            );
        }
    }
});

/** Las varas tienen que cubrir todo lo que el motor pregunta. */
test('hay referencia para cada rubro en cada puesto', () => {
    for (const puesto of PUESTOS) {
        for (const metricId of Object.keys(RUBROS)) {
            const ref = REFERENCIAS_POR_PUESTO[puesto]?.[metricId];
            assert.ok(ref, `falta la vara de ${metricId} en el puesto ${puesto}`);
            assert.ok(ref.desvio > 0, `${metricId} en el puesto ${puesto} tiene desvio ${ref.desvio}`);
        }
    }
});

test('un suplente que no entro no lleva puntaje, y eso no es un 6', () => {
    assert.equal(rateRugbyPlayer({ stats: promedioDe(6), minutes: 0, number: 20 }), null);
    assert.equal(rateRugbyPlayer({ stats: promedioDe(6), minutes: null, number: 20 }), null);
});

/**
 * El mismo trabajo defensivo no vale lo mismo en todos lados: el 7 vive del
 * tackle (37%) y el 10 no (10%). Si el puntaje no distinguiera esto, seria una
 * planilla promediada y no una lectura de rugby.
 *
 * Se comparan RENDIMIENTOS iguales, no planillas iguales: veinte tackles son un
 * partido normal para un 7 y uno historico para un 10, asi que la unica forma
 * de aislar el peso del puesto es darle a cada uno el mismo apartamiento de SU
 * promedio.
 */
test('el mismo salto defensivo rinde mas en un flanker que en un apertura', () => {
    const conTackles = (puesto: number) => ({
        ...promedioDe(puesto),
        tackles: promedioDe(puesto).tackles + 1.5 * desvioDe(puesto, 'tackles'),
    });
    const siete = rateRugbyPlayer({ stats: conTackles(7), minutes: 80, number: 7, team: EQUIPO })!;
    const diez = rateRugbyPlayer({ stats: conTackles(10), minutes: 80, number: 10, team: EQUIPO })!;
    assert.ok(siete.value > diez.value, `${siete.value} deberia superar a ${diez.value}`);
});

/**
 * La trampa que rompio la primera version: extrapolar a ochenta minutos hacia
 * que dos avances en diez minutos valieran dieciseis, y un cameo terminaba
 * primero de la tabla.
 *
 * Se compara a MISMO RITMO, no a mismos conteos. Con los mismos conteos el
 * cameo tiene que dar mas —cuatro avances en ocho minutos es mejor partido que
 * cuatro en ochenta, y decir lo contrario seria falso—. Lo que el encogimiento
 * promete es otra cosa: que el que jugo veinte minutos rindiendo igual quede
 * mas cerca del 6, porque veinte minutos no alcanzan para afirmar tanto.
 */
test('a mismo ritmo, el que jugo menos queda mas cerca de la base', () => {
    const ritmo = { carries: 14, carriesMetres: 90, tackles: 12, passes: 8, tries: 1, cleanBreaks: 2, defendersBeaten: 6 };
    const escalado = (minutos: number) =>
        Object.fromEntries(Object.entries(ritmo).map(([k, v]) => [k, (v * minutos) / 80]));

    const entero = rateRugbyPlayer({ stats: ritmo, minutes: 80, number: 11 })!;
    const corto = rateRugbyPlayer({ stats: escalado(20), minutes: 20, number: 11 })!;

    assert.ok(entero.value > RATING_BASE, `el partido entero tiene que destacar: dio ${entero.value}`);
    assert.ok(
        Math.abs(corto.value - RATING_BASE) < Math.abs(entero.value - RATING_BASE),
        `veinte minutos al mismo ritmo dieron ${corto.value} contra ${entero.value}`
    );
});

/** Un rubro enorme no puede comprar el partido solo: hay tope por rubro. */
test('setenta y seis pases no compran un diez', () => {
    const r = rateRugbyPlayer({ stats: { ...promedioDe(9), passes: 76 }, minutes: 80, number: 9, team: EQUIPO })!;
    assert.ok(r.value < 10, `dio ${r.value}`);
    assert.ok(r.components.juego <= 3 + 1e-9, `el eje juego se paso: ${r.components.juego}`);
});

test('la roja hunde el puntaje y la amarilla pesa menos', () => {
    const base = rateRugbyPlayer({ stats: promedioDe(5), minutes: 80, number: 5, team: EQUIPO })!;
    const amarilla = rateRugbyPlayer({ stats: { ...promedioDe(5), yellowCards: 1 }, minutes: 80, number: 5, team: EQUIPO })!;
    const roja = rateRugbyPlayer({ stats: { ...promedioDe(5), redCards: 1 }, minutes: 80, number: 5, team: EQUIPO })!;
    assert.ok(amarilla.value < base.value);
    assert.ok(roja.value < amarilla.value, `roja ${roja.value} deberia hundir mas que amarilla ${amarilla.value}`);
});

/**
 * LA SANCION NO SE PESA POR PUESTO Y NO PASA POR LA CURVA, y es la unica
 * excepcion a la regla de que todo se lee segun la camiseta.
 *
 * El resto del modelo se pesa porque mide RENDIMIENTO, y a cada puesto se le
 * pide otra cosa. Una tarjeta no mide rendimiento: mide una infraccion, y no
 * hay puesto al que se le permita infringir mas.
 *
 * Se recorren los quince: el sintoma es una diferencia entre puestos, y con dos
 * se elige justo el par que empata. Cada uno se mide desde SU partido promedio,
 * que es donde la curva tiene la misma pendiente para todos.
 */
test('la tarjeta cuesta lo mismo en los quince puestos', () => {
    for (const metricId of Object.keys(SANCIONES)) {
        const costos = new Set(
            PUESTOS.map((puesto) => {
                const promedio = promedioDe(puesto);
                const sin = rateRugbyPlayer({ stats: promedio, minutes: 80, number: puesto, team: EQUIPO })!.value;
                const con = rateRugbyPlayer({ stats: { ...promedio, [metricId]: 1 }, minutes: 80, number: puesto, team: EQUIPO })!.value;
                return Math.round((sin - con) * 10) / 10;
            })
        );
        assert.equal(costos.size, 1, `${metricId} cuesta distinto segun el puesto: ${[...costos].join(', ')}`);
        // El costo es el de la tabla, sin nada en el medio. Se lee de SANCIONES
        // y no se transcribe: el numero se recalibra, el invariante no.
        assert.equal([...costos][0], SANCIONES[metricId]);
    }
});

/**
 * Lo que las varas por puesto NO borraron. El rendimiento se sigue leyendo por
 * camiseta, que es lo que hace que el puntaje hable de rugby. Si alguien
 * "universaliza" de mas, esto salta.
 */
test('el rendimiento si se sigue pesando por puesto', () => {
    const saltoDefensivo = (puesto: number) => rateRugbyPlayer({
        stats: { ...promedioDe(puesto), tackles: promedioDe(puesto).tackles + 2 * desvioDe(puesto, 'tackles') },
        minutes: 80,
        number: puesto,
        team: EQUIPO,
    })!.value;
    assert.ok(saltoDefensivo(7) > saltoDefensivo(10));
});

/**
 * LO QUE CAMBIO DE LA v1 Y HAY QUE MIRAR DE FRENTE.
 *
 * La v1 no castigaba no marcar: el try solo sumaba. Sonaba justo —la enorme
 * mayoria de un plantel termina el partido sin marcar— pero convertia la pelota
 * en una renta, y por eso el 8 promediaba 7,45 contra 6,04 de una segunda linea
 * con pesos casi iguales.
 *
 * Ahora el try se centra como todo lo demas, y la promesa se cumple de otra
 * forma: el wing que no marco no queda en falta, queda en el promedio de los
 * wings, que es 6. Lo que si aparece —y es rugby— es que no marcar le cuesta
 * mas a un wing que a un pilar, porque de uno se espera y del otro no.
 */
test('no marcar cuesta segun lo que se espere del puesto', () => {
    const costoDeNoMarcar = (puesto: number) => {
        const promedio = promedioDe(puesto);
        const enPromedio = rateRugbyPlayer({ stats: promedio, minutes: 80, number: puesto, team: EQUIPO })!.value;
        const sinTry = rateRugbyPlayer({ stats: { ...promedio, tries: 0 }, minutes: 80, number: puesto, team: EQUIPO })!.value;
        return enPromedio - sinTry;
    };
    assert.ok(costoDeNoMarcar(11) > costoDeNoMarcar(1), 'al wing tiene que costarle mas que al pilar');
    assert.ok(costoDeNoMarcar(1) < 0.2, `al pilar casi no puede costarle: costo ${costoDeNoMarcar(1)}`);
});

/** No hacer NADA en ochenta minutos es informacion, y hunde. */
test('la planilla vacia hunde el puntaje', () => {
    const r = rateRugbyPlayer({ stats: {}, minutes: 80, number: 7, team: EQUIPO })!;
    assert.ok(r.value < RATING_BASE - 1, `dio ${r.value}`);
});

test('el puntaje no se sale de la escala ni con un partido absurdo', () => {
    const monstruo: Record<string, number> = {};
    // El monstruo hace TODO lo bueno y nada malo.
    for (const [metricId, rubro] of Object.entries(RUBROS)) monstruo[metricId] = rubro.direccion === 'resta' ? 0 : 500;
    const arriba = rateRugbyPlayer({ stats: monstruo, minutes: 80, number: 8, team: EQUIPO })!;
    assert.ok(arriba.value <= 10 && arriba.value > RATING_BASE, `dio ${arriba.value}`);

    const desastre = { redCards: 3, yellowCards: 3, penaltiesConceded: 20, missedTackles: 20, turnoversConceded: 20 };
    const abajo = rateRugbyPlayer({ stats: desastre, minutes: 80, number: 8, team: EQUIPO })!;
    assert.ok(abajo.value >= 1 && abajo.value < RATING_BASE, `dio ${abajo.value}`);
});

test('mismas estadisticas dan siempre el mismo puntaje', () => {
    const stats = { ...promedioDe(12), tries: 2, tackles: 14 };
    const a = rateRugbyPlayer({ stats, minutes: 71, number: 12, team: EQUIPO })!;
    const b = rateRugbyPlayer({ stats, minutes: 71, number: 12, team: EQUIPO })!;
    assert.deepEqual(a, b);
});

test('los minutos salen de la alineacion, no de una suposicion', () => {
    assert.equal(minutesFromLineup(titular), 80);
    assert.equal(minutesFromLineup({ role: 'starter', onMinute: null, offMinute: 58 }), 58);
    assert.equal(minutesFromLineup({ role: 'substitute', onMinute: 58, offMinute: null }), 22);
    assert.equal(minutesFromLineup({ role: 'substitute', onMinute: null, offMinute: null }), 0);
});

test('el banco hereda el puesto de su numero', () => {
    const stats = promedioDe(2);
    const hooker = rateRugbyPlayer({ stats, minutes: 80, number: 2, team: EQUIPO })!;
    const suplente = rateRugbyPlayer({ stats, minutes: 80, number: 16, team: EQUIPO })!;
    assert.equal(suplente.position, PUESTO_POR_NUMERO[16]);
    assert.equal(suplente.value, hooker.value);
});

test('sumar algo bueno nunca baja el puntaje', () => {
    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        if (rubro.direccion !== 'suma') continue;
        const promedio = promedioDe(13);
        const antes = rateRugbyPlayer({ stats: promedio, minutes: 80, number: 13, team: EQUIPO })!.value;
        const despues = rateRugbyPlayer({
            stats: { ...promedio, [metricId]: (promedio[metricId] ?? 0) + 1 },
            minutes: 80,
            number: 13,
            team: EQUIPO,
        })!.value;
        assert.ok(despues >= antes, `${metricId} bajo el puntaje: ${antes} -> ${despues}`);
    }
});

test('sumar algo malo nunca sube el puntaje', () => {
    const malos = [
        ...Object.keys(SANCIONES),
        ...Object.entries(RUBROS).filter(([, r]) => r.direccion === 'resta').map(([id]) => id),
    ];
    for (const metricId of malos) {
        const promedio = promedioDe(13);
        const antes = rateRugbyPlayer({ stats: promedio, minutes: 80, number: 13, team: EQUIPO })!.value;
        const despues = rateRugbyPlayer({
            stats: { ...promedio, [metricId]: (promedio[metricId] ?? 0) + 1 },
            minutes: 80,
            number: 13,
            team: EQUIPO,
        })!.value;
        assert.ok(despues <= antes, `${metricId} subio el puntaje: ${antes} -> ${despues}`);
    }
});

/**
 * REGRESION DEL CASO QUE ABRIO LA AUDITORIA.
 *
 * Argentina-Australia: Ben Donaldson salia primero del partido con 3 avances, 8
 * tackles y 10 pases en 55 minutos, por encima de Fraser McReight, que hizo 25
 * tackles sin errar uno, 9 avances, 43 metros y un try en los ochenta.
 *
 * Las planillas son las de verdad, cosechadas de rp-949624, no numeros
 * reconstruidos: un test de regresion con datos inventados no protege del caso
 * que lo motivo.
 */
test('el flanker del partido queda arriba del apertura correcto', () => {
    const mcreight = rateRugbyPlayer({
        stats: { carries: 9, carriesMetres: 43, defendersBeaten: 1, dominantTackles: 2, offloads: 1, passes: 6, tackles: 25, tries: 1 },
        minutes: 80,
        number: 7,
    })!;
    const donaldson = rateRugbyPlayer({
        stats: { carries: 3, carriesMetres: 40, cleanBreaks: 1, defendersBeaten: 3, kicks: 3, missedTackles: 1, offloads: 1, passes: 10, tackles: 8, tryAssists: 1 },
        minutes: 55,
        number: 10,
    })!;
    assert.ok(
        mcreight.value > donaldson.value,
        `McReight ${mcreight.value} tiene que superar a Donaldson ${donaldson.value}`
    );
});

test('la planilla completa habilita el puntaje; el podio no', () => {
    assert.ok(hayPlanillaParaPuntuar(Object.keys(RUBROS)));
    // Lo que devuelve el podio del live-poll cuando la planilla no contesta.
    assert.ok(!hayPlanillaParaPuntuar(['tries', 'cleanBreaks', 'defendersBeaten']));
});

test('cualquier rubro imprescindible ausente frena el puntaje', () => {
    for (const metricId of RUBROS_IMPRESCINDIBLES) {
        const resto = Object.keys(RUBROS).filter((id) => id !== metricId);
        assert.ok(!hayPlanillaParaPuntuar(resto), `sin ${metricId} tendria que frenar`);
    }
});
