import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PESOS_POR_PUESTO,
    RATING_BASE,
    RATING_COMPONENTS,
    RUBROS,
    RUBROS_IMPRESCINDIBLES,
    hayPlanillaParaPuntuar,
    minutesFromLineup,
    rateRugbyPlayer,
} from './rugbyPlayerRating.ts';

/**
 * Un partido de volumen exactamente promedio, en ochenta minutos.
 *
 * Sale de `RUBROS` y no de numeros escritos a mano: las referencias se
 * recalibran con datos reales, y un promedio transcripto se desincroniza en la
 * primera recalibracion sin que ningun test lo note.
 */
const PROMEDIO: Record<string, number> = Object.fromEntries(
    Object.entries(RUBROS)
        .filter(([, rubro]) => rubro.tipo === 'volumen')
        .map(([metricId, rubro]) => [metricId, rubro.referencia])
);

const titular = { role: 'starter' as const, onMinute: null, offMinute: null };

test('la tabla de pesos reparte cien puntos en cada puesto', () => {
    for (const [puesto, pesos] of Object.entries(PESOS_POR_PUESTO)) {
        const suma = RATING_COMPONENTS.reduce((total, eje) => total + pesos[eje], 0);
        assert.equal(suma, 100, `el puesto ${puesto} suma ${suma}`);
    }
});

/**
 * El 6 es el punto de partida y tiene que significar algo: el partido correcto,
 * sin nada para destacar ni para reprochar. Si el promedio diera 6,4 o 5,7, la
 * base seria un numero decorativo.
 */
test('el partido exactamente promedio vale la base', () => {
    const r = rateRugbyPlayer({ stats: PROMEDIO, minutes: 80, number: 4 });
    assert.equal(r?.value, RATING_BASE);
});

test('un suplente que no entro no lleva puntaje, y eso no es un 6', () => {
    assert.equal(rateRugbyPlayer({ stats: PROMEDIO, minutes: 0, number: 20 }), null);
    assert.equal(rateRugbyPlayer({ stats: PROMEDIO, minutes: null, number: 20 }), null);
});

/**
 * El mismo trabajo defensivo no vale lo mismo en todos lados: el 7 vive del
 * tackle (37%) y el 10 no (10%). Si el puntaje no distinguiera esto, seria una
 * planilla promediada y no una lectura de rugby.
 */
test('los mismos tackles rinden mas en un flanker que en un apertura', () => {
    const stats = { ...PROMEDIO, tackles: 18 };
    const siete = rateRugbyPlayer({ stats, minutes: 80, number: 7 })!;
    const diez = rateRugbyPlayer({ stats, minutes: 80, number: 10 })!;
    assert.ok(siete.value > diez.value, `${siete.value} deberia superar a ${diez.value}`);
    assert.ok(siete.components.defensa > diez.components.defensa);
});

/**
 * La trampa que rompio la primera version: extrapolar a ochenta minutos hacia
 * que dos avances en diez minutos valieran dieciseis, y un cameo terminaba
 * primero de la tabla.
 */
test('un cameo no puede ganar ni perder el partido', () => {
    const enorme = { carries: 4, carriesMetres: 40, tackles: 5, passes: 4, tries: 1, cleanBreaks: 1 };
    const cameo = rateRugbyPlayer({ stats: enorme, minutes: 8, number: 11 })!;
    const entero = rateRugbyPlayer({ stats: enorme, minutes: 80, number: 11 })!;
    assert.ok(cameo.value < entero.value, 'ocho minutos no pueden pesar como ochenta');
    assert.ok(Math.abs(cameo.value - RATING_BASE) < Math.abs(entero.value - RATING_BASE));
});

/** Un rubro enorme no puede comprar el partido solo: hay tope por rubro y por eje. */
test('setenta y seis pases no compran un diez', () => {
    const r = rateRugbyPlayer({ stats: { ...PROMEDIO, passes: 76 }, minutes: 80, number: 9 })!;
    assert.ok(r.value < 10, `dio ${r.value}`);
    assert.ok(r.components.juego <= 1.8 + 1e-9, `el eje juego se paso: ${r.components.juego}`);
});

test('la roja hunde el puntaje y la amarilla pesa menos', () => {
    const base = rateRugbyPlayer({ stats: PROMEDIO, minutes: 80, number: 5 })!;
    const amarilla = rateRugbyPlayer({ stats: { ...PROMEDIO, yellowCards: 1 }, minutes: 80, number: 5 })!;
    const roja = rateRugbyPlayer({ stats: { ...PROMEDIO, redCards: 1 }, minutes: 80, number: 5 })!;
    assert.ok(amarilla.value < base.value);
    assert.ok(roja.value < amarilla.value, `roja ${roja.value} deberia hundir mas que amarilla ${amarilla.value}`);
});

/**
 * Los rubros de bonus NO castigan por ausencia: la enorme mayoria de un plantel
 * termina el partido sin un try, y eso es lo normal, no una falla.
 */
test('no marcar un try no resta', () => {
    const sinTry = rateRugbyPlayer({ stats: PROMEDIO, minutes: 80, number: 1 })!;
    const conTry = rateRugbyPlayer({ stats: { ...PROMEDIO, tries: 1 }, minutes: 80, number: 1 })!;
    assert.equal(sinTry.value, RATING_BASE);
    assert.ok(conTry.value > sinTry.value);
});

/** Los de volumen SI: no hacer un tackle en ochenta minutos es informacion. */
test('el volumen en cero resta aunque el rubro no venga', () => {
    const r = rateRugbyPlayer({ stats: {}, minutes: 80, number: 7 })!;
    assert.ok(r.value < RATING_BASE, `dio ${r.value}`);
});

test('el puntaje no se sale de la escala ni con un partido absurdo', () => {
    const monstruo: Record<string, number> = {};
    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        // Ni castigos ni sanciones: el monstruo hace TODO lo bueno y nada malo.
        if (rubro.tipo === 'volumen' || rubro.tipo === 'bonus') monstruo[metricId] = rubro.referencia * 50;
    }
    const arriba = rateRugbyPlayer({ stats: monstruo, minutes: 80, number: 8 })!;
    assert.ok(arriba.value <= 10 && arriba.value > RATING_BASE, `dio ${arriba.value}`);

    const desastre = { redCards: 3, yellowCards: 3, penaltiesConceded: 20, missedTackles: 20, turnoversConceded: 20 };
    const abajo = rateRugbyPlayer({ stats: desastre, minutes: 80, number: 8 })!;
    assert.ok(abajo.value >= 1 && abajo.value < RATING_BASE, `dio ${abajo.value}`);
});

test('mismas estadisticas dan siempre el mismo puntaje', () => {
    const stats = { ...PROMEDIO, tries: 1, missedTackles: 2 };
    const a = rateRugbyPlayer({ stats, minutes: 63, number: 12 })!;
    const b = rateRugbyPlayer({ stats, minutes: 63, number: 12 })!;
    assert.deepEqual(a, b);
});

test('los minutos salen de la alineacion, no de una suposicion', () => {
    assert.equal(minutesFromLineup(titular), 80, 'el titular que no salio jugo los ochenta');
    assert.equal(minutesFromLineup({ ...titular, offMinute: 52 }), 52);
    assert.equal(minutesFromLineup({ role: 'substitute', onMinute: 60, offMinute: null }), 20);
    assert.equal(minutesFromLineup({ role: 'substitute', onMinute: 50, offMinute: 70 }), 20);
    assert.equal(minutesFromLineup({ role: 'substitute', onMinute: null, offMinute: null }), 0, 'no entro');
});

/** Un numero de banco cae en su grupo, no en el vacio. */
test('el banco hereda el puesto de su numero', () => {
    assert.equal(rateRugbyPlayer({ stats: PROMEDIO, minutes: 20, number: 17 })?.position, 1);
    assert.equal(rateRugbyPlayer({ stats: PROMEDIO, minutes: 20, number: 22 })?.position, 10);
    assert.equal(rateRugbyPlayer({ stats: PROMEDIO, minutes: 20, number: 99 })?.position, null);
});

/**
 * LA GARANTIA DE QUE EL PUNTAJE SIGUE A LAS ESTADISTICAS.
 *
 * Los tres tests de abajo son el contrato: si alguien recalibra una referencia
 * o suma un rubro y rompe alguno, el puntaje dejo de decir lo que muestra la
 * planilla, por mas lindo que se vea el numero.
 */
const PUESTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

test('sumar algo bueno nunca baja el puntaje', () => {
    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        if (rubro.tipo === 'castigo' || rubro.tipo === 'falta') continue;
        for (const numero of PUESTOS) {
            const antes = rateRugbyPlayer({ stats: PROMEDIO, minutes: 70, number: numero })!;
            const despues = rateRugbyPlayer({
                stats: { ...PROMEDIO, [metricId]: (PROMEDIO[metricId] ?? 0) + rubro.referencia },
                minutes: 70,
                number: numero,
            })!;
            assert.ok(
                despues.value >= antes.value,
                `${metricId} en el ${numero}: bajo de ${antes.value} a ${despues.value}`
            );
        }
    }
});

test('sumar algo malo nunca sube el puntaje', () => {
    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        if (rubro.tipo !== 'castigo' && rubro.tipo !== 'falta') continue;
        for (const numero of PUESTOS) {
            const antes = rateRugbyPlayer({ stats: PROMEDIO, minutes: 70, number: numero })!;
            const despues = rateRugbyPlayer({
                stats: { ...PROMEDIO, [metricId]: rubro.referencia * 2 },
                minutes: 70,
                number: numero,
            })!;
            assert.ok(
                despues.value <= antes.value,
                `${metricId} en el ${numero}: subio de ${antes.value} a ${despues.value}`
            );
        }
    }
});

/**
 * DOMINANCIA: el que hizo mas de todo lo bueno y menos de todo lo malo, con los
 * mismos minutos y el mismo puesto, no puede puntuar menos. Es la version
 * fuerte de las dos anteriores y la que atrapa un peso mal puesto entre ejes.
 */
test('una linea mejor en todo puntua mas', () => {
    const flojo: Record<string, number> = {};
    const bueno: Record<string, number> = {};
    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        const malo = rubro.tipo === 'castigo' || rubro.tipo === 'falta';
        flojo[metricId] = malo ? rubro.referencia * 2 : rubro.referencia * 0.5;
        bueno[metricId] = malo ? 0 : rubro.referencia * 1.5;
    }
    for (const numero of PUESTOS) {
        const a = rateRugbyPlayer({ stats: flojo, minutes: 75, number: numero })!;
        const b = rateRugbyPlayer({ stats: bueno, minutes: 75, number: numero })!;
        assert.ok(b.value > a.value, `en el ${numero}: ${b.value} no supera a ${a.value}`);
    }
});

/**
 * Ningun puesto puede amplificar tanto un eje que un rubro suelto decida el
 * partido. Lo pedia una auditoria: `juego` pesa 45 en el 9 contra un promedio
 * de 13,7, y con ese 3,3x un apertura con diez pases salia primero del partido
 * por delante de un flanker con veinticinco tackles sin errar.
 */
test('ningun eje se amplifica mas alla del tope', () => {
    for (const numero of PUESTOS) {
        const soloUnRubro = rateRugbyPlayer({ stats: { passes: 200 }, minutes: 80, number: numero })!;
        assert.ok(
            soloUnRubro.value < 9,
            `el ${numero} llega a ${soloUnRubro.value} solo con pases`
        );
    }
});

/**
 * NO SE PUNTUA CON MEDIA PLANILLA.
 *
 * Cuando `filter-players-stats` no contesta, lo que queda es el podio de seis
 * rubros con los tres mejores de cada uno. Con eso los otros cuarenta y tres
 * jugadores figuran sin un avance ni un tackle —que no es lo que paso, es lo
 * que no se publico— y el partido sale con doce puntajes, todos hundidos.
 */
test('la planilla completa habilita el puntaje; el podio no', () => {
    assert.ok(hayPlanillaParaPuntuar(Object.keys(RUBROS)), 'la planilla entera tiene que alcanzar');

    const podio = ['carries', 'cleanBreaks', 'tackles', 'turnoversConceded', 'turnoversWon', 'dominantTackles'];
    assert.equal(hayPlanillaParaPuntuar(podio), false, 'al podio le faltan metros y pases');

    assert.equal(hayPlanillaParaPuntuar([]), false, 'sin nada no se puntua');
});

/** Falta uno solo de los de volumen y el sesgo es parejo para todo el plantel. */
test('cualquier rubro de volumen ausente frena el puntaje', () => {
    for (const faltante of RUBROS_IMPRESCINDIBLES) {
        const presentes = Object.keys(RUBROS).filter((metricId) => metricId !== faltante);
        assert.equal(
            hayPlanillaParaPuntuar(presentes),
            false,
            `sin ${faltante} no se deberia poder puntuar`
        );
    }
});
