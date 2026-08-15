// EL RETIRO — que la carrera se termine por lo que dice que se termina.
//
// Son tests de FORMA, no de muestra: `retirementChance` es pura y se puede
// barrer entera sin un rng, que es la única manera de auditar una curva en vez
// de un punto de ella.
//
// Las tres cosas que vigilan, y que son las tres que se rompieron:
//
//   1. que el tope blando de la tabla vuelva a describir al jugador típico —el
//      adelanto por cuerpo tiene que ser el castigo del que se rompió, no el
//      caso normal;
//   2. que estar en tu mejor momento sostenga la carrera, y que dejar de estarlo
//      la suelte;
//   3. que nada de lo anterior pueda pasar el tope duro del puesto.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgeCurve } from '../../data/positions.ts';
import type { CaptainPlayer } from '../../types/player.ts';
import type { RetirementInput } from '../retirement.ts';
import {
    BODY_ANTICIPATION_FLOOR,
    BODY_ANTICIPATION_MAX,
    BODY_ANTICIPATION_STEP,
    FAREWELL_FLAG,
    RETIREMENT_HOLD_MAX,
    bodyAnticipation,
    farewellClosed,
    resolveRetirement,
    retirementChance,
    retirementHold,
} from '../retirement.ts';
import { createRng } from '../random.ts';

/**
 * Lo único que la despedida mira del jugador: la marca. Se arma así —y no con
 * un jugador entero— porque `farewellClosed` no lee nada más, y fabricar una
 * carrera completa para probarlo escondería justamente eso.
 */
function jugadorQueVolvio(season: number | null): CaptainPlayer {
    const flags: Record<string, number> = season === null ? {} : { [FAREWELL_FLAG]: season };
    return { flags } as CaptainPlayer;
}

/** La curva del apertura, que es el puesto del reporte que abrió todo esto. */
const APERTURA: AgeCurve = { debut: 19, peak: [25, 29], decline: 30, soft: 36, hard: 38 };

/**
 * El jugador de referencia: entero, titular, en su pico y sin caps.
 *
 * Sin caps A PROPÓSITO. Es el peor caso del sostén entre los que juegan bien, y
 * así ningún test de abajo se apoya sin querer en el eje internacional.
 */
function base(over: Partial<RetirementInput> = {}): RetirementInput {
    return {
        curve: APERTURA,
        age: 36,
        body: 0,
        share: 0.85,
        ovr: 88,
        bestOvr: 88,
        caps: 0,
        farewellClosed: false,
        ...over,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · EL CUERPO ADELANTA, PERO SOLO SI TE ROMPISTE
// ═══════════════════════════════════════════════════════════════════════════

test('EL DESGASTE NORMAL NO TE SACA UN AÑO: la tabla de edades vuelve a ser cierta', () => {
    // La regla vieja era `floor(cuerpo / 30)`, así que un titular pisaba el
    // primer año perdido a los 23 y el tope blando de `positions.ts` describía
    // una carrera que no tenía nadie. El piso es lo que arregla eso.
    assert.equal(bodyAnticipation(0), 0);
    assert.equal(bodyAnticipation(BODY_ANTICIPATION_FLOOR), 0, 'el piso todavía no cobra');
    assert.equal(bodyAnticipation(BODY_ANTICIPATION_FLOOR + BODY_ANTICIPATION_STEP), 1);

    // Y el que se rompió entero paga los tres años que la regla siempre prometió.
    assert.equal(bodyAnticipation(100), BODY_ANTICIPATION_MAX);
});

test('el adelanto es MONÓTONO y nunca pasa su tope', () => {
    // Barrido entero de la escala: una tabla con un escalón mal escrito devuelve
    // un salto para atrás en algún punto, y con tres casos sueltos no se ve.
    let anterior = 0;
    for (let body = 0; body <= 100; body += 1) {
        const anios = bodyAnticipation(body);
        assert.ok(anios >= anterior, `el adelanto bajó de ${anterior} a ${anios} en ${body}`);
        assert.ok(anios <= BODY_ANTICIPATION_MAX, `${body} de desgaste adelanta ${anios} años`);
        anterior = anios;
    }
});

test('un cuerpo roto adelanta el final, y el mismo jugador entero llega', () => {
    // El caso del reclamo, en dos renglones: 34 años, apertura, todavía en su
    // pico. Entero no se le puede terminar la carrera; hecho pedazos sí.
    assert.equal(retirementChance(base({ age: 34, body: 0 })), 0, 'entero, a los 34 no hay tirada');
    assert.ok(retirementChance(base({ age: 34, body: 100 })) > 0, 'hecho pedazos, a los 34 sí');
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LO QUE TE SOSTIENE
// ═══════════════════════════════════════════════════════════════════════════

test('LOS PESOS DEL SOSTÉN SUMAN UNO, o `RETIREMENT_HOLD_MAX` no es el máximo que dice ser', () => {
    // El nombre y la cosa diciendo cosas distintas es la falla más cara de este
    // proyecto (CLAUDE de captain §1.5-1.9), y acá la forma que tomaría es que
    // el techo declarado no sea alcanzable —o que se pase—. Se mide pidiendo el
    // sostén del jugador perfecto en los tres ejes a la vez.
    const perfecto = retirementHold(base({ ovr: 90, bestOvr: 90, share: 1, caps: 60 }));
    assert.ok(
        Math.abs(perfecto - RETIREMENT_HOLD_MAX) < 1e-9,
        `el mejor posible sostiene ${perfecto} y el techo declarado es ${RETIREMENT_HOLD_MAX}`,
    );

    // Y el piso: el que no tiene ninguno de los tres no recibe nada.
    assert.equal(retirementHold(base({ ovr: 70, bestOvr: 90, share: 0, caps: 0 })), 0);
});

test('EL QUE SIGUE SIENDO EL MEJOR DURA MÁS QUE EL QUE SE CAYÓ', () => {
    const enPico = retirementChance(base({ age: 37, ovr: 88, bestOvr: 88 }));
    const caido = retirementChance(base({ age: 37, ovr: 78, bestOvr: 88 }));
    assert.ok(enPico < caido, `en su pico ${enPico} tendría que tirar menos que caído ${caido}`);

    // Y el que se cayó no recibe NADA por ese eje: diez puntos por debajo del
    // pico pasan de largo la ventana entera.
    const soloNivel = (ovr: number) => retirementHold(base({ ovr, bestOvr: 88, share: 0, caps: 0 }));
    assert.equal(soloNivel(78), 0);
    assert.ok(soloNivel(88) > 0);
});

test('el internacional dura más que el que nunca fue convocado', () => {
    // Es el dato del que sale la sección entera: 76% de los internacionales
    // sigue a los diez años contra el 38% de los que no lo son.
    const conCaps = retirementChance(base({ age: 37, caps: 40 }));
    const sinCaps = retirementChance(base({ age: 37, caps: 0 }));
    assert.ok(conCaps < sinCaps, `con caps ${conCaps} tendría que tirar menos que sin caps ${sinCaps}`);
});

test('el que ya no juega no se sostiene, por bueno que sea', () => {
    // La contracara de la titularidad, y la que evita que esto sea inmunidad
    // para el que tuvo una buena media alguna vez: el club dejó de ponerte y la
    // carrera se termina igual.
    const titular = retirementChance(base({ age: 37, share: 0.9 }));
    const banco = retirementChance(base({ age: 37, share: 0.1 }));
    assert.ok(banco > titular, `el suplente ${banco} tendría que tirar más que el titular ${titular}`);
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LO QUE EL SOSTÉN NO PUEDE HACER
// ═══════════════════════════════════════════════════════════════════════════

test('EL TOPE DURO NO SE NEGOCIA: ni el mejor del mundo lo pasa', () => {
    const dios = base({ age: APERTURA.hard, ovr: 99, bestOvr: 99, share: 1, caps: 90, body: 0 });
    assert.equal(retirementChance(dios), 1);

    const rng = createRng(12345);
    assert.equal(resolveRetirement(dios, rng), 'tope-del-puesto');
});

test('antes del tope blando no se tira NUNCA, se juegue como se juegue', () => {
    // Barrido de las dos puntas del sostén sobre todas las edades por debajo del
    // blando: si alguna devolviera algo distinto de cero, el tope blando dejaría
    // de ser el principio de la zona y pasaría a ser una sugerencia.
    for (let age = APERTURA.decline; age < APERTURA.soft; age += 1) {
        assert.equal(retirementChance(base({ age, body: 0, share: 0.9, caps: 50 })), 0);
        assert.equal(retirementChance(base({ age, body: 0, share: 0, caps: 0 })), 0);
    }
});

test('LA TIRADA SE CONSUME IGUAL, sea el jugador de élite o no', () => {
    // Es la disciplina que sostiene el digest congelado: el sostén cambia el
    // NÚMERO contra el que se compara, nunca CUÁNTAS tiradas se hacen. Si
    // dependiera del nivel, dos partidas con la misma semilla dejarían de ser
    // comparables — y eso no falla con un error, deriva en silencio.
    const elite = createRng(777);
    const flojo = createRng(777);
    resolveRetirement(base({ age: 37, ovr: 92, bestOvr: 92, share: 1, caps: 60 }), elite);
    resolveRetirement(base({ age: 37, ovr: 70, bestOvr: 92, share: 0, caps: 0 }), flojo);
    assert.equal(elite.state, flojo.state, 'el sostén movió el stream del rng');
});

test('la probabilidad nunca se sale de [0, 1] en ninguna esquina', () => {
    // Barrido cruzado: edades por encima del blando × la escala entera del
    // cuerpo × las dos puntas del sostén. `soft − 3` con `hard` cerca puede
    // dejar la ventana en un año, que es donde un divisor sin `max` explota.
    for (let age = 30; age <= APERTURA.hard; age += 1) {
        for (let body = 0; body <= 100; body += 10) {
            for (const fuerte of [true, false]) {
                const p = retirementChance(base({
                    age,
                    body,
                    share: fuerte ? 1 : 0,
                    ovr: fuerte ? 88 : 70,
                    caps: fuerte ? 60 : 0,
                }));
                assert.ok(p >= 0 && p <= 1, `p=${p} con edad ${age}, cuerpo ${body}`);
            }
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · EL PUESTO SIGUE MANDANDO
// ═══════════════════════════════════════════════════════════════════════════

test('el sostén no borra la diferencia entre un pilar y un wing', () => {
    // La tabla de `positions.ts` es lo que hace que elegir puesto signifique
    // algo, y este cambio no podía licuarla: el mismo jugador perfecto, a la
    // misma edad, tiene que estar en zona de retiro en el puesto corto y ni
    // cerca en el largo.
    const wing: AgeCurve = { debut: 18, peak: [24, 28], decline: 29, soft: 33, hard: 36 };
    const pilar: AgeCurve = { debut: 20, peak: [27, 31], decline: 32, soft: 37, hard: 40 };
    const perfecto = { ovr: 90, bestOvr: 90, share: 1, caps: 60, body: 0 };

    assert.ok(retirementChance(base({ ...perfecto, curve: wing, age: 35 })) > 0);
    assert.equal(retirementChance(base({ ...perfecto, curve: pilar, age: 35 })), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LA VUELTA A CASA TERMINA LA CARRERA
// ═══════════════════════════════════════════════════════════════════════════
//
// La tarjeta promete «terminar donde empezaste» y hasta la 0.38.0 no terminaba
// nada: se volvía, seguían llegando ofertas y la carrera se estiraba hasta el
// tope duro del puesto. Lo que se vigila acá son las DOS mitades del cierre —que
// llegue, y que no llegue antes de tiempo—, que es donde estaba el error.

test('LA DESPEDIDA SE JUEGA ANTES DE COLGAR LOS BOTINES', () => {
    // La marca se pone en la temporada en que volvés, y la tarjeta se decide
    // DESPUÉS de jugada esa temporada: si el cierre disparara con la marca a
    // secas, el jugador se retiraría sin haber pisado la cancha de su club.
    const volvio = jugadorQueVolvio(12);

    assert.equal(farewellClosed(volvio, 12), false, 'se retiraría el mismo año en que volvió');
    assert.equal(farewellClosed(volvio, 13), false, 'se retiraría sin jugar la despedida');
    assert.equal(farewellClosed(volvio, 14), true, 'la despedida se jugó y la carrera no se cierra');
});

test('el que no volvió no tiene despedida que cerrar', () => {
    // El caso de reset: sin marca, ninguna temporada la cierra. Es lo que hace
    // que la regla sea de la decisión y no de la edad.
    const cualquiera = jugadorQueVolvio(null);
    for (let season = 0; season <= 24; season += 1) {
        assert.equal(farewellClosed(cualquiera, season), false, `cerró en la temporada ${season}`);
    }
});

test('la despedida cierra la carrera sin mirar la edad ni tirar el dado', () => {
    // Un apertura de 30 está a seis años del tope blando: sin la despedida no
    // hay retiro que valga, y con ella la carrera se termina igual. Lo segundo
    // es la disciplina de siempre: el cierre no puede consumir azar, o dos
    // partidas con la misma semilla dejarían de ser comparables.
    const antes = createRng(9001);
    const despues = createRng(9001);

    assert.equal(resolveRetirement(base({ age: 30, farewellClosed: true }), antes), 'decision');
    assert.equal(resolveRetirement(base({ age: 30 }), despues), null);
    assert.equal(antes.state, despues.state, 'el cierre de la despedida movió el stream del rng');
});

// La otra mitad del cierre —que el mercado deje de ponerte la mesa— se mide en
// `market.test.ts`, que es donde viven los helpers que fabrican ofertas.
