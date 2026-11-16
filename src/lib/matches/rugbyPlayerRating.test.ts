import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BONUS,
    GRUPO_POR_PUESTO,
    K_MINUTOS,
    NOTA,
    PESOS_POR_PUESTO,
    PROBABILIDADES,
    PUESTO_POR_NUMERO,
    RATING_COMPONENTS,
    RUBROS,
    RUBROS_IMPRESCINDIBLES,
    SANCIONES,
    bonusPorEventos,
    hayPlanillaParaPuntuar,
    indiceDeParada,
    minutesFromLineup,
    normalInversa,
    percentilDe,
    rateRugbyPlayer,
    rendimientoDe,
} from './rugbyPlayerRating.ts';
import { REFERENCIAS_POR_PUESTO, TOTAL_DE_EQUIPO } from './rugbyRatingReferences.generated.ts';

/**
 * El partido exactamente promedio DE UN PUESTO, en ochenta minutos.
 *
 * Las varas son PARTES del total del equipo, asi que para armar una planilla
 * hay que devolverlas a conteos contra un equipo promedio —y despues pasarle al
 * motor ese mismo equipo como contexto, para que la division lo cancele.
 * Sale de las referencias y no de numeros escritos a mano: las varas se
 * recalibran con cada cosecha.
 */
const promedioDe = (puesto: number): Record<string, number> =>
    Object.fromEntries(
        [...Object.keys(RUBROS), 'missedTackles', 'tries', 'tryAssists'].map((metricId) => [
            metricId,
            (REFERENCIAS_POR_PUESTO[puesto]?.[metricId]?.media ?? 0) * (TOTAL_DE_EQUIPO[metricId] ?? 0),
        ])
    );

const EQUIPO = TOTAL_DE_EQUIPO;
const PUESTOS = Object.keys(PESOS_POR_PUESTO).map(Number);
const titular = { role: 'starter' as const, onMinute: null, offMinute: null };

test('la tabla de pesos reparte cien puntos en cada puesto', () => {
    for (const [puesto, pesos] of Object.entries(PESOS_POR_PUESTO)) {
        const suma = RATING_COMPONENTS.reduce((total, eje) => total + pesos[eje], 0);
        assert.equal(suma, 100, `el puesto ${puesto} suma ${suma}`);
    }
});

test('los quince puestos tienen grupo y peso', () => {
    for (const puesto of PUESTOS) assert.ok(GRUPO_POR_PUESTO[puesto], `el puesto ${puesto} no tiene grupo`);
    assert.equal(PUESTOS.length, 15);
    assert.equal(GRUPO_POR_PUESTO[1], GRUPO_POR_PUESTO[3]);
    assert.notEqual(GRUPO_POR_PUESTO[2], GRUPO_POR_PUESTO[1]);
    assert.equal(new Set(Object.values(GRUPO_POR_PUESTO)).size, 8);
});

/** Tries, asistencias y errados no pasan por la tabla de rubros: tienen su camino. */
test('tries, asistencias y errados no son rubros de parte', () => {
    for (const metricId of ['tries', 'tryAssists', 'missedTackles']) {
        assert.ok(!(metricId in RUBROS), `${metricId} no deberia estar en RUBROS`);
    }
});

test('hay referencia para cada rubro en cada puesto', () => {
    for (const puesto of PUESTOS) {
        for (const metricId of Object.keys(RUBROS)) {
            const ref = REFERENCIAS_POR_PUESTO[puesto]?.[metricId];
            assert.ok(ref, `falta la vara de ${metricId} en el puesto ${puesto}`);
            assert.ok(ref.desvio > 0, `${metricId} en el puesto ${puesto} tiene desvio ${ref.desvio}`);
        }
    }
});

test('la normal inversa es la de la campana estandar', () => {
    assert.ok(Math.abs(normalInversa(0.5)) < 1e-9);
    assert.ok(Math.abs(normalInversa(0.8413447) - 1) < 1e-3);
    assert.ok(Math.abs(normalInversa(0.975) - 1.95996) < 1e-3);
    assert.ok(Math.abs(normalInversa(0.1) + normalInversa(0.9)) < 1e-9, 'tiene que ser simetrica');
    // Los puntos de la tabla del modelo: percentil 10 -> 4,9; 90 -> 7,5; 99 -> 8,5.
    assert.equal(Math.round((NOTA.media + normalInversa(0.1)) * 10) / 10, 4.9);
    assert.equal(Math.round((NOTA.media + normalInversa(0.9)) * 10) / 10, 7.5);
    assert.equal(Math.round((NOTA.media + normalInversa(0.99)) * 10) / 10, 8.5);
});

test('el percentil sube con el rendimiento y vive entre 0 y 1', () => {
    for (const grupo of [...new Set(Object.values(GRUPO_POR_PUESTO)), 'todos']) {
        let anterior = -1;
        for (let x = -4; x <= 4; x += 0.25) {
            const p = percentilDe(grupo, x);
            assert.ok(p >= PROBABILIDADES[0] && p <= PROBABILIDADES[PROBABILIDADES.length - 1]);
            assert.ok(p >= anterior, `${grupo} baja en ${x}: ${anterior} -> ${p}`);
            anterior = p;
        }
    }
});

/**
 * Lo que arreglaba el rediseño: el pilar promedio y el apertura promedio caen
 * juntos. El partido promedio de CADA puesto tiene que quedar cerca de 6,2; un
 * poco arriba es normal, porque en un conteo la media esta arriba de la mediana.
 */
test('el jugador promedio de su puesto queda cerca de 6,2 en los quince', () => {
    for (const puesto of PUESTOS) {
        const r = rateRugbyPlayer({ stats: promedioDe(puesto), minutes: 80, number: puesto, team: EQUIPO })!;
        assert.ok(Math.abs(r.value - NOTA.media) < 1.2, `el puesto ${puesto} promedio dio ${r.value}`);
    }
});

test('menos de cinco minutos no llevan nota; con cinco ya hay', () => {
    assert.equal(rateRugbyPlayer({ stats: promedioDe(6), minutes: 0, number: 20 }), null);
    assert.equal(rateRugbyPlayer({ stats: promedioDe(6), minutes: null, number: 20 }), null);
    assert.equal(rateRugbyPlayer({ stats: promedioDe(6), minutes: 4.9, number: 20 }), null);
    assert.ok(rateRugbyPlayer({ stats: promedioDe(6), minutes: 5, number: 20 }));
});

/**
 * La contraccion: a mismo ritmo, quien jugo menos queda mas cerca de la media.
 * Se compara el rendimiento ajustado, que es lo que la contraccion toca.
 */
test('a mismo ritmo, el que jugo menos queda mas cerca de cero', () => {
    const ritmo = { carries: 14, carriesMetres: 90, tackles: 12, passes: 8, cleanBreaks: 2, defendersBeaten: 6 };
    const escalado = (minutos: number) =>
        Object.fromEntries(Object.entries(ritmo).map(([k, v]) => [k, (v * minutos) / 80]));

    const entero = rendimientoDe({ stats: ritmo, minutes: 80, number: 11 });
    const corto = rendimientoDe({ stats: escalado(20), minutes: 20, number: 11 });
    assert.ok(entero.ajustado > 0, 'el partido entero tiene que destacar');
    assert.ok(
        Math.abs(corto.ajustado) < Math.abs(entero.ajustado),
        `veinte minutos dieron ${corto.ajustado} contra ${entero.ajustado}`
    );
    // La contraccion es exactamente m / (m + K).
    assert.ok(Math.abs(entero.ajustado - entero.rendimiento * (80 / (80 + K_MINUTOS))) < 1e-12);
    assert.ok(Math.abs(corto.ajustado - corto.rendimiento * (20 / (20 + K_MINUTOS))) < 1e-12);
});

test('el bonus de los eventos raros es plano, distinto para forwards, y topeado', () => {
    assert.equal(bonusPorEventos({ tries: 1 }, 1), BONUS.tryForward);
    assert.equal(bonusPorEventos({ tries: 1 }, 8), BONUS.tryForward);
    assert.equal(bonusPorEventos({ tries: 1 }, 11), BONUS.tryBack);
    assert.equal(bonusPorEventos({ tries: 1 }, null), BONUS.tryBack);
    assert.equal(bonusPorEventos({ tryAssists: 2 }, 10), 2 * BONUS.asistencia);
    assert.equal(bonusPorEventos({ tries: 5, tryAssists: 3 }, 11), BONUS.tope);
    assert.equal(bonusPorEventos({}, 11), 0);
});

test('los tries suman al final: no tocan el rendimiento', () => {
    const base = { ...promedioDe(11), tryAssists: 0 };
    const sin = rateRugbyPlayer({ stats: { ...base, tries: 0 }, minutes: 80, number: 11, team: EQUIPO })!;
    const hattrick = rateRugbyPlayer({ stats: { ...base, tries: 3 }, minutes: 80, number: 11, team: EQUIPO })!;
    assert.equal(sin.signal, hattrick.signal);
    assert.equal(hattrick.bonus, Math.min(BONUS.tope, 3 * BONUS.tryBack));
    assert.ok(hattrick.value > sin.value);
});

/**
 * LA EFECTIVIDAD, no el conteo: 17 tackles con 5 errados rinden menos que 12
 * sin ninguno. Con menos de cinco intentos no hay dato.
 */
test('el tackle se lee por efectividad y pide cinco intentos', () => {
    const rinde = (tackles: number, errados: number) =>
        rendimientoDe({ stats: { ...promedioDe(7), tackles, missedTackles: errados }, minutes: 80, number: 7, team: EQUIPO }).components.defensa;
    assert.ok(rinde(12, 0) > rinde(17, 5), 'doce sin errar tiene que superar a diecisiete con cinco errados');

    // Con tres tackles y uno errado son cuatro intentos: los errados no mueven nada.
    assert.equal(rinde(3, 1), rinde(3, 0));
    // Con cinco intentos si.
    assert.ok(rinde(5, 0) > rinde(3, 2));
});

test('la tarjeta cuesta lo mismo en los quince puestos y no pasa por la curva', () => {
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
        assert.equal([...costos][0], SANCIONES[metricId]);
    }
    assert.ok(SANCIONES.redCards > SANCIONES.yellowCards);
});

/**
 * EL CASO QUE ABRIO ESTA REVISION: el pilar que no hace nada no puede quedar
 * en el promedio. Un partido casi en blanco de un pilar de ochenta minutos baja
 * claramente de la campana.
 */
test('el pilar que no hace nada queda debajo del promedio', () => {
    const pasivo = rateRugbyPlayer({
        stats: { tackles: 2, carries: 1, carriesMetres: 2, passes: 1 },
        minutes: 80,
        number: 1,
        team: EQUIPO,
    })!;
    const normal = rateRugbyPlayer({ stats: promedioDe(1), minutes: 80, number: 1, team: EQUIPO })!;
    assert.ok(pasivo.value < normal.value - 0.5, `pasivo ${pasivo.value} contra normal ${normal.value}`);
    assert.ok(pasivo.value < NOTA.media - 0.5, `el pasivo dio ${pasivo.value}`);
});

/**
 * La dilucion: antes, los rubros que un pilar casi no toca (quiebres,
 * defensores superados, offloads, lines) tenian la misma voz que en un 8 y
 * ahogaban a los acarreos. Con la presencia, un pilar con muchos acarreos mueve
 * el eje impacto casi tanto como un 8.
 */
test('los rubros que un puesto casi no toca no diluyen su eje', () => {
    const conAcarreos = (puesto: number) => rendimientoDe({
        stats: { ...promedioDe(puesto), carries: promedioDe(puesto).carries * 1.5 },
        minutes: 80,
        number: puesto,
        team: EQUIPO,
    }).components.impacto;
    const pilar = conAcarreos(1);
    const octavo = conAcarreos(8);
    assert.ok(pilar > 0.5 * octavo, `pilar ${pilar} contra octavo ${octavo}`);
});

test('el rendimiento sigue pesandose por puesto', () => {
    const salto = (puesto: number) => {
        const promedio = promedioDe(puesto);
        return rendimientoDe({
            stats: { ...promedio, tackles: promedio.tackles * 1.6 },
            minutes: 80,
            number: puesto,
            team: EQUIPO,
        }).rendimiento;
    };
    assert.ok(salto(7) > salto(10), 'el mismo salto de tackles rinde mas en un 7 que en un 10');
});

test('el puntaje no se sale de la escala ni con un partido absurdo', () => {
    const monstruo: Record<string, number> = { tries: 6, tryAssists: 4 };
    for (const [metricId, rubro] of Object.entries(RUBROS)) monstruo[metricId] = rubro.direccion === 'resta' ? 0 : 500;
    const arriba = rateRugbyPlayer({ stats: monstruo, minutes: 80, number: 8, team: EQUIPO })!;
    assert.ok(arriba.value <= 10 && arriba.value > NOTA.media, `dio ${arriba.value}`);

    const desastre = { redCards: 3, yellowCards: 3, penaltiesConceded: 20, missedTackles: 20, turnoversConceded: 20 };
    const abajo = rateRugbyPlayer({ stats: desastre, minutes: 80, number: 8, team: EQUIPO })!;
    assert.ok(abajo.value >= 1 && abajo.value < NOTA.media, `dio ${abajo.value}`);
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

/** Planilla real de Manuel Zuliani (rp-292613): tercera linea con la 21. */
test('la 21 sin pases no se juzga como medio scrum', () => {
    const zuliani = { tackles: 19, carries: 5, carriesMetres: 2, passes: 1, penaltiesConceded: 2 };
    const comoForward = rateRugbyPlayer({ stats: zuliani, minutes: 77, number: 21, team: EQUIPO })!;
    assert.equal(comoForward.position, null);

    const comoMedio = rateRugbyPlayer({ stats: { ...zuliani, passes: 40 }, minutes: 77, number: 21, team: EQUIPO })!;
    assert.equal(comoMedio.position, 9);

    // Seis minutos sin pasar no alcanzan para decir que no es un 9.
    const cameo = rateRugbyPlayer({ stats: {}, minutes: 6, number: 21, team: EQUIPO })!;
    assert.equal(cameo.position, 9);
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
    for (const metricId of ['tries', 'tryAssists']) {
        const promedio = promedioDe(13);
        const antes = rateRugbyPlayer({ stats: promedio, minutes: 80, number: 13, team: EQUIPO })!.value;
        const despues = rateRugbyPlayer({ stats: { ...promedio, [metricId]: 1 }, minutes: 80, number: 13, team: EQUIPO })!.value;
        assert.ok(despues >= antes, `${metricId} bajo el puntaje`);
    }
});

test('sumar algo malo nunca sube el puntaje', () => {
    const malos = [
        ...Object.keys(SANCIONES),
        'missedTackles',
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
 * REGRESION DEL CASO QUE ABRIO LA AUDITORIA PREVIA. Planillas reales de
 * rp-949624 (Argentina-Australia).
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

/**
 * PELOTA PARADA. El proveedor no la mide por jugador pero si por equipo: un
 * pilar de un equipo que domino el scrum tiene que quedar arriba del de uno que
 * lo sufrio, con la misma planilla individual.
 */
const SCRUM_BUENO = { scrums: 12, scrumsGanados: 1, lines: 12, linesGanados: 0.95 };
const SCRUM_MALO = { scrums: 12, scrumsGanados: 0.6, lines: 12, linesGanados: 0.7 };

test('el pilar de un equipo que domino el scrum queda arriba del que lo sufrio', () => {
    const stats = promedioDe(1);
    const bueno = rendimientoDe({ stats, minutes: 80, number: 1, team: EQUIPO, parada: SCRUM_BUENO });
    const malo = rendimientoDe({ stats, minutes: 80, number: 1, team: EQUIPO, parada: SCRUM_MALO });
    assert.ok(bueno.ajustado > malo.ajustado, `${bueno.ajustado} contra ${malo.ajustado}`);
    const notaBuena = rateRugbyPlayer({ stats, minutes: 80, number: 1, team: EQUIPO, parada: SCRUM_BUENO })!.value;
    const notaMala = rateRugbyPlayer({ stats, minutes: 80, number: 1, team: EQUIPO, parada: SCRUM_MALO })!.value;
    assert.ok(notaBuena - notaMala >= 0.5, `el scrum tiene que mover la nota: ${notaMala} -> ${notaBuena}`);
});

test('la pelota parada solo mueve a quienes cargan con ella', () => {
    for (const puesto of [9, 10, 11, 12, 13, 14, 15]) {
        const stats = promedioDe(puesto);
        const sin = rendimientoDe({ stats, minutes: 80, number: puesto, team: EQUIPO });
        const con = rendimientoDe({ stats, minutes: 80, number: puesto, team: EQUIPO, parada: SCRUM_MALO });
        assert.equal(con.ajustado, sin.ajustado, `el puesto ${puesto} no deberia depender del scrum`);
        assert.equal(con.parada, null);
    }
});

test('el line pesa mas en el hooker que en la tercera linea, y el scrum en el pilar', () => {
    const soloLine = { scrums: null, scrumsGanados: null, lines: 14, linesGanados: 0.55 };
    const efecto = (puesto: number, parada: typeof SCRUM_MALO | typeof soloLine) =>
        rendimientoDe({ stats: promedioDe(puesto), minutes: 80, number: puesto, team: EQUIPO, parada }).parada!;
    assert.ok(Math.abs(efecto(2, soloLine)) > 0.3, 'el hooker lanza');
    // El eje es el mismo z para quien carga con el line completo, pero pesa 20 puntos en el hooker y 6 en la tercera.
    const peso = (puesto: number) => {
        const sin = rendimientoDe({ stats: promedioDe(puesto), minutes: 80, number: puesto, team: EQUIPO });
        const con = rendimientoDe({ stats: promedioDe(puesto), minutes: 80, number: puesto, team: EQUIPO, parada: soloLine });
        return Math.abs(con.rendimiento - sin.rendimiento);
    };
    assert.ok(peso(2) > peso(7), `hooker ${peso(2)} contra tercera ${peso(7)}`);
});

test('un porcentaje sobre pocos eventos se contrae; sin dato no hay eje', () => {
    const pocos = indiceDeParada({ scrums: 3, scrumsGanados: 1, lines: null, linesGanados: null });
    const muchos = indiceDeParada({ scrums: 12, scrumsGanados: 1, lines: null, linesGanados: null });
    assert.ok(pocos.scrum! > 0 && muchos.scrum! > pocos.scrum!, 'tres scrums al 100% no dicen lo que doce');
    assert.equal(pocos.line, null);
    assert.equal(indiceDeParada(null).scrum, null);
    // Un partido sin dato de parada puntua igual que antes, sin penalizar al pilar.
    const stats = promedioDe(1);
    const sin = rendimientoDe({ stats, minutes: 80, number: 1, team: EQUIPO });
    const vacio = rendimientoDe({
        stats, minutes: 80, number: 1, team: EQUIPO,
        parada: { scrums: null, scrumsGanados: null, lines: null, linesGanados: null },
    });
    assert.equal(vacio.ajustado, sin.ajustado);
});

test('la planilla completa habilita el puntaje; el podio no', () => {
    assert.ok(hayPlanillaParaPuntuar(Object.keys(RUBROS)));
    assert.ok(!hayPlanillaParaPuntuar(['tries', 'cleanBreaks', 'defendersBeaten']));
});

test('cualquier rubro imprescindible ausente frena el puntaje', () => {
    for (const metricId of RUBROS_IMPRESCINDIBLES) {
        const resto = Object.keys(RUBROS).filter((id) => id !== metricId);
        assert.ok(!hayPlanillaParaPuntuar(resto), `sin ${metricId} tendria que frenar`);
    }
});
