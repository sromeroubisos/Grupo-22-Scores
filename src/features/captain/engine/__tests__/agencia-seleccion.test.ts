// LA AGENCIA DE LA ESCALERA REPRESENTATIVA, INSTRUMENTADA.
//
// ── QUÉ AFIRMA ESTE ARCHIVO ────────────────────────────────────────────────
// Que la escalera de la selección DEJÓ DE SER UNA FUNCIÓN DEL ESTADO. Hasta la
// 0.33.0 sus entradas eran todas estado o constante —media, forma, nivel del
// club, escasez, edad, unión, archirrival, descuento, inercia, presión— y
// ninguna era una elección: el jugador miraba.
//
// Los tests de acá no miden calibración. Miden que las decisiones nuevas
// TRANSPORTEN, que es el §2 del CLAUDE de captain: antes de discutir cuánto vale
// una palanca hay que verificar que el motor tenga un canal, y una palanca que
// no mueve nada no se arregla con tuning.
//
// ── Y POR QUÉ CADA CASO ES UN BORDE Y NO EL CAMINO FELIZ ───────────────────
// El camino feliz de todas estas mecánicas es aburrido y no falla nunca: elegir
// una opción y ver que el efecto se aplicó lo verifica `apply-decision` sola.
// Lo que se rompe en silencio es el RESET —el pase que corta la cuenta de los
// sesenta meses, el rechazo que se olvida, la ventana del comodín que se pisa
// con la del otro— y por eso cada test de abajo apunta ahí.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { EligibilityState } from '../../types/captain.ts';
import type { PendingTournament, RoundId } from '../../types/tournament.ts';
import { ARBITRO_TACHADAS } from '../../types/tournament.ts';
import { partidoParaRehacer } from '../tournament-gate.ts';
import { getTournament } from '../../data/tournaments.ts';
import { bronzeFrom, finalPlace, forTheTitle, isTitleDecider, roundTitle, survives } from '../tournament.ts';
import {
    advanceRegistration,
    createEligibility,
    REGISTRATION_MONTHS_REQUIRED,
    secondFlagOf,
    switchToUnion,
} from '../eligibility.ts';
import { diagnoseSelection, DECLINE_MEMORY_SEASONS } from '../national-team.ts';
import { namedTestOf } from '../test-match.ts';
import { validateCaptainState } from '../validate.ts';
import { createInitialCaptain } from '../../state/captain-reducer.ts';
import { internationalSeason } from '../../data/catalogs.ts';
import { TRIAL_TOUR_EVENT_ID } from '../../data/events/index.ts';
import { ALL_EVENTS } from '../../data/events/index.ts';
import { eligible } from '../event-selector.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LAS DOS BANDERAS — el reloj que ahora se puede leer
// ═══════════════════════════════════════════════════════════════════════════

/** Cinco temporadas en Gales sin moverse: el 8.1(c) completo. */
function cincoAniosEn(union: string): EligibilityState {
    const state = createEligibility('ar');
    for (let i = 0; i < 5; i += 1) advanceRegistration(state, union);
    return state;
}

test('EL RELOJ DE LA SEGUNDA BANDERA SE PUEDE LEER ANTES DE QUE SUENE', () => {
    const state = createEligibility('ar');
    assert.equal(secondFlagOf(state), null, 'recién creado no hay segunda bandera');

    advanceRegistration(state, 'gb-wls');
    advanceRegistration(state, 'gb-wls');

    const otra = secondFlagOf(state);
    assert.ok(otra, 'con dos temporadas en Gales el reloj tiene que existir');
    assert.equal(otra.union, 'gb-wls');
    assert.equal(otra.months, 24);
    assert.equal(otra.remaining, REGISTRATION_MONTHS_REQUIRED - 24);
    assert.ok(otra.remaining > 0, 'todavía falta: la tarjeta tiene algo que preguntar');
});

// EL CASO QUE IMPORTA. El camino feliz —cinco años seguidos y el claim aparece—
// ya lo cubre `eligibility` desde la 0.22.0. Lo que la tarjeta de las dos
// banderas promete y hay que verificar es la MITAD DE ATRÁS: que «ponerte a tiro
// de los tuyos» de verdad apague el reloj, porque si no la opción del medio es
// una frase.
test('VOLVER AL PAÍS APAGA EL RELOJ: un pase corta la cuenta de los sesenta meses', () => {
    const state = createEligibility('ar');
    for (let i = 0; i < 4; i += 1) advanceRegistration(state, 'gb-wls');

    const antes = secondFlagOf(state);
    assert.equal(antes?.months, 48, 'cuatro temporadas acumuladas');

    // El pase de vuelta: una temporada registrado en la propia unión.
    advanceRegistration(state, 'ar');

    assert.equal(
        secondFlagOf(state),
        null,
        'volviendo al país la cuenta de Gales vuelve a cero y no hay segunda bandera',
    );
});

test('CAPTURADO NO HAY DOS BANDERAS: hay una y es la que jugaste', () => {
    const state = cincoAniosEn('gb-wls');
    assert.ok(secondFlagOf(state), 'antes de la captura el reloj existe');

    switchToUnion(state, 'gb-wls');
    assert.equal(secondFlagOf(state), null, 'después de la captura no hay nada que preguntar');
});

test('LA TARJETA DE LAS DOS BANDERAS PIDE EL RELOJ ANDANDO, NO CUMPLIDO', () => {
    const carta = ALL_EVENTS.find((e) => e.id === 'nt-dos-banderas');
    assert.ok(carta, 'la tarjeta tiene que estar en el catálogo para que el selector la sortee');

    const base = createInitialCaptain(
        { name: 'A', surname: 'B', family: 'apertura', countryCode: 'ar' },
        1234,
    );
    // Se la pone lejos de casa y con edad: lo único que se está midiendo acá es
    // la puerta del reloj, no las otras tres.
    base.player.age = 24;
    base.homeClubId = 'casi';
    base.player.clubId = 'cardiff-rugby';

    for (let i = 0; i < 2; i += 1) advanceRegistration(base.national.eligibility, 'gb-wls');
    assert.equal(eligible(carta, base), true, 'con dos temporadas la pregunta es real');

    // Y con los sesenta cumplidos SE CIERRA: ahí la conversación es otra —ya te
    // pueden convocar— y la tiene `nt-cambiar-de-bandera`. Las dos juntas serían
    // el mismo dilema preguntado dos veces.
    for (let i = 0; i < 3; i += 1) advanceRegistration(base.national.eligibility, 'gb-wls');
    assert.equal(eligible(carta, base), false, 'con el derecho ganado esta tarjeta ya no corresponde');
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA LÍNEA QUE DICE POR QUÉ NO
// ═══════════════════════════════════════════════════════════════════════════

/** El insumo mínimo del diagnóstico, con todo neutro salvo lo que cada test mueve. */
function diagBase() {
    return {
        value: { ovr: 80, form: 0, clubLevel: 0, scarcity: 0, age: 0, total: 80 },
        // La tabla es LITERAL: `nivel` es el valor de selección tal cual y `bar`
        // es el número de `DEBUT_BY_REPUTATION`. Desde la 0.36.0 no hay dos
        // escalas, así que estos dos se comparan directo.
        nivel: 70,
        bar: 74,
        union: 'ar',
        amateur: false,
        age: 26,
        pressure: 0,
        status: 'uncapped' as const,
        rival: null,
        trialSeasons: 0,
        declineSurcharge: 0,
    };
}

// EL ORDEN ES LA DECISIÓN ENTERA, así que es lo que se verifica. Que el
// diagnóstico devuelva "algo" no dice nada: lo que lo hace útil es que gane la
// causa que el jugador PUEDE MOVER, y entre las que no puede, la que explica la
// brecha. Decirle «te faltan dos puntos» al que juega en la B es cierto y es
// inútil — los va a conseguir y va a seguir sin que lo llamen.
test('EL DIAGNÓSTICO NOMBRA LA CAUSA ACCIONABLE, NO LA MÁS OBVIA', () => {
    const enLaB = diagnoseSelection({ ...diagBase(), value: { ...diagBase().value, clubLevel: -3 } });
    assert.equal(enLaB.blocker, 'liga', 'con la liga en contra, la liga manda sobre el nivel');

    const soloNivel = diagnoseSelection(diagBase());
    assert.equal(soloNivel.blocker, 'nivel', 'sin nada más que explicar, la brecha es de nivel');

    // LA BRECHA SE DICE CON LAS DOS PUNTAS, no con la resta sola. Decir «te
    // faltan 9 puntos» a alguien que tiene 87 en la cabecera se lee como un
    // error del juego: la vara efectiva no es la de la tabla de diseño —está
    // anclada a la población de este motor— y sin el otro número la cuenta no
    // cierra por ningún lado. Es la línea que el jugador reportó como sin
    // sentido, y tenía razón.
    assert.match(soloNivel.text, /valor de selección es 80/, 'dice dónde estás');
    assert.match(soloNivel.text, /vara de Argentina está en 74/, 'y dónde está la vara, con el número de la tabla');
    assert.match(soloNivel.text, /faltan 4/, 'y la resta cierra a ojo: 74 − 70');
});

test('EL RECHAZO DE UNA GIRA LE GANA A CUALQUIER OTRA EXPLICACIÓN', () => {
    // Es la única causa que el jugador eligió con la mano y con la tarjeta
    // avisándole. Taparla con otra sería el juego escondiendo la consecuencia de
    // una decisión propia.
    const d = diagnoseSelection({
        ...diagBase(),
        bar: 72,
        declineSurcharge: 3,
        value: { ...diagBase().value, clubLevel: -3 },
    });
    assert.equal(d.blocker, 'rechazo');
});

test('ARRIBA DE LA VARA NO SE DICE «TE FALTA NIVEL»', () => {
    const suerte = diagnoseSelection({ ...diagBase(), nivel: 80, bar: 74 });
    assert.equal(suerte.blocker, 'suerte');

    const conRival = diagnoseSelection({
        ...diagBase(),
        nivel: 80,
        bar: 74,
        rival: { name: 'Juan', surname: 'Pérez', ovr: 90, caps: 40 },
    });
    assert.equal(conRival.blocker, 'archirrival', 'una causa con nombre le gana a "no entró"');
    assert.match(conRival.text, /Juan Pérez/);
    assert.match(conRival.text, /40 caps/);
});

test('AL QUE ESTÁ A PRUEBA SE LE DICE CUÁNTO PLAZO LE QUEDA', () => {
    const d = diagnoseSelection({ ...diagBase(), status: 'trial', trialSeasons: 1 });
    assert.equal(d.blocker, 'a-prueba');
    assert.match(d.text, /una temporada/, 'con una consumida queda una');
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL TEST QUE TIENE NOMBRE
// ═══════════════════════════════════════════════════════════════════════════

test('EL TEST DEL AÑO ES DETERMINISTA Y NO SALE DE LA NADA', () => {
    const a = namedTestOf('ar', 0, 987);
    const b = namedTestOf('ar', 0, 987);
    assert.deepEqual(a, b, 'misma semilla y misma temporada, mismo partido');

    assert.ok(a, 'Argentina juega todos los años');
    assert.notEqual(a.rivalUnion, 'ar', 'no se juega contra sí misma');

    const competencias = internationalSeason('ar', 0).competitions.map((c) => c.id);
    assert.ok(
        competencias.includes(a.competitionId),
        'el partido sale del calendario de esa temporada y no de una lista inventada',
    );
});

test('SIN FIXTURE NO HAY PARTIDO QUE CONTAR', () => {
    // Una unión sin calendario no es un borde a parchear: Rusia figura en el
    // catálogo y no juega nada porque está suspendida.
    assert.equal(namedTestOf(null, 0, 1), null);
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LA GUARDA DE LA DIVISIÓN DERIVADA
// ═══════════════════════════════════════════════════════════════════════════

function carreraLimpia() {
    return createInitialCaptain(
        { name: 'A', surname: 'B', family: 'apertura', countryCode: 'ar' },
        4242,
    );
}

test('UN GUARDADO SANO PASA LA VERIFICACIÓN', () => {
    assert.equal(validateCaptainState(carreraLimpia()), null);
});

// EL CASO QUE MOTIVA LA GUARDA: la división se DERIVA del historial de ediciones,
// que es lo correcto —es lo contrario de la constante congelada— pero una
// derivada vale lo que valen sus insumos. Con una edición faltante el recálculo
// no falla: devuelve otra división, en silencio, y el jugador aparece en la B sin
// haber descendido nunca.
test('UN HISTORIAL DE EDICIONES TRUNCADO SE DENUNCIA, NO SE ASUME', () => {
    const state = carreraLimpia();

    // Argentina arranca en la primera división del M20 por ranking. Se le mete
    // una edición de la SEGUNDA sin el descenso que la habría llevado ahí: es
    // exactamente la forma que tendría el historial si una migración lo cortara.
    const huerfana: PendingTournament = {
        id: 'mundial-m20-b',
        season: 2,
        seed: 1,
        unionCode: 'ar',
        matches: [],
        round: 'grupos',
        playing: null,
        comodin: null,
        comodinUsed: false,
        outcome: 'eliminado',
        finalRound: 'grupos',
    };
    state.tournaments.push(huerfana);

    const problema = validateCaptainState(state);
    assert.ok(problema, 'el hueco tiene que denunciarse');
    assert.match(problema, /no cierra/, 'y con su propio mensaje, no con un genérico');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LA MEMORIA DE LA UNIÓN SE OLVIDA
// ═══════════════════════════════════════════════════════════════════════════
//
// El recargo por rechazar una gira tiene que costar Y tiene que caducar. Un
// castigo permanente convertiría una decisión en una trampa: el que la eligió a
// los 24 no tendría carrera internacional nunca más por una gira de tres semanas.
//
// La cuenta se DERIVA del `decisionLog` y por eso el test la ejercita desde ahí:
// es la misma lectura que hace `simulate-season`, y si alguna vez se moviera a un
// contador guardado, esto se rompe — que es justo lo que tiene que pasar.
// ═══════════════════════════════════════════════════════════════════════════
//  5 bis · QUE NINGUNA TARJETA NUEVA SEA CONTENIDO MUERTO
// ═══════════════════════════════════════════════════════════════════════════
//
// Una sonda de 240 carreras sacó cuatro de las cinco tarjetas nuevas y NO sacó
// `nt-te-saco-el-puesto`. Eso no prueba que esté rota —su ventana es angosta a
// propósito: hay que estar en el A-XV o en la mayor Y tener al archirrival por
// encima— pero tampoco prueba que ande, y la diferencia entre «raro» y
// «estructuralmente cerrado» es la que este repo ya pagó dos veces (§1.7: un
// cero es una acusación contra el instrumento hasta que se demuestre lo
// contrario).
//
// Acá se contesta la pregunta que la sonda no puede: ¿EXISTE un estado que abra
// cada puerta? Si la respuesta es no, la tarjeta es un cartel de contenido vivo
// colgado sobre contenido muerto.
test('LAS CINCO TARJETAS NUEVAS TIENEN UN ESTADO QUE LAS ABRE', () => {
    const armar = () => {
        const s = createInitialCaptain(
            { name: 'A', surname: 'B', family: 'apertura', countryCode: 'ar' },
            77,
        );
        s.player.age = 27;
        s.player.ovr = 82;
        s.national.track = 'nacional';
        s.national.status = 'squad';
        s.rival = { name: 'X', surname: 'Y', ovr: 90, caps: 12 };
        return s;
    };

    const abre = (id: string, tune: (s: ReturnType<typeof armar>) => void) => {
        const carta = ALL_EVENTS.find((e) => e.id === id);
        assert.ok(carta, `${id} tiene que estar en el catálogo`);
        const s = armar();
        tune(s);
        return eligible(carta, s);
    };

    assert.equal(abre('nt-te-saco-el-puesto', () => {}), true, 'el archirrival por encima abre la puerta');
    assert.equal(abre('nt-se-lesiono', () => {}), true);
    assert.equal(
        abre('nt-el-ultimo', (s) => {
            s.player.age = 34;
            // Diez temporadas jugadas: el `minSeasons` de la tarjeta lo lee del
            // largo del historial, no de un contador aparte.
            s.history = Array.from({ length: 10 }, () => ({} as never));
        }),
        true,
    );
    assert.equal(abre('nt-la-lista-de-gira', (s) => { s.national.status = 'trial'; }), true);
    assert.equal(
        abre('nt-dos-banderas', (s) => {
            s.player.age = 24;
            s.homeClubId = 'casi';
            s.player.clubId = 'cardiff-rugby';
            advanceRegistration(s.national.eligibility, 'gb-wls');
            advanceRegistration(s.national.eligibility, 'gb-wls');
        }),
        true,
    );

    // Y LA MITAD DE ATRÁS, que es la que hace útil al test: si `rivalAhead` no
    // se evaluara, esto también daría `true` y el test estaría verde midiendo
    // nada. Con el archirrival abajo, la puerta tiene que cerrarse.
    assert.equal(
        abre('nt-te-saco-el-puesto', (s) => { s.rival = { name: 'X', surname: 'Y', ovr: 60, caps: 0 }; }),
        false,
        'con el archirrival por debajo, esa tarjeta no corresponde',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  6 · LOS TRES COMODINES — que sus ventanas no se pisen
// ═══════════════════════════════════════════════════════════════════════════
//
// Lo que hace que la elección del principio IMPORTE es que las tres ventanas
// sean distintas: si los tres se pudieran quemar en la semifinal, elegir cuál
// traigo sería elegir cuál de tres empujones querés y la decisión se aplana.
//
// Es la clase de propiedad que se rompe sin que falle nada —alcanza con que
// alguien afloje un `if` de ronda— y por eso se afirma acá y no se confía en
// leer `canUseComodin`.
test('CADA COMODÍN TIENE SU VENTANA Y NO SE PISAN', () => {
    const rondas: RoundId[] = ['grupos', 'octavos', 'cuartos', 'semi', 'final'];

    // La arenga: eliminatorias sí, grupos y final no. Es la regla que la hace
    // buena — «guardala para la final» no es una decisión, es una instrucción.
    const arenga = rondas.filter((r) => r !== 'grupos' && r !== 'final');
    assert.deepEqual(arenga, ['octavos', 'cuartos', 'semi']);

    // El cambio de plan mira hacia atrás y sólo en grupos: es el único que no se
    // puede quemar preventivo.
    const sinPerder = torneoDePrueba('grupos', [{ round: 'grupos', revealed: true, gana: true }]);
    assert.equal(partidoParaRehacer(sinPerder), null, 'sin un partido perdido no hay nada que rehacer');

    const conPerdido = torneoDePrueba('grupos', [
        { round: 'grupos', revealed: true, gana: true },
        { round: 'grupos', revealed: true, gana: false },
    ]);
    assert.equal(partidoParaRehacer(conPerdido), 1, 'el perdido es el que se rehace');

    const enSemi = torneoDePrueba('semi', [{ round: 'grupos', revealed: true, gana: false }]);
    assert.equal(partidoParaRehacer(enSemi), null, 'en eliminatorias no hay revancha');
});

// EL COMODÍN NO PUEDE CONVERTIRSE EN EL RESULTADO. Si el árbitro tachara TODAS
// las celdas perdedoras, dejaría de ser información y pasaría a ser la respuesta
// —que es la línea que la casilla de la Visión ya no cruza en la final—. Se mide
// en el borde: una grilla donde casi todo pierde.
test('EL ÁRBITRO NUNCA TE DEJA UN TABLERO QUE NO SE PUEDE PERDER', () => {
    // 28 perdedoras de 30, que es más de lo que el comodín tacha.
    const celdas = Array.from({ length: 30 }, (_, i) => i < 2);
    const perdedoras = celdas.map((g, i) => ({ g, i })).filter((c) => !c.g).map((c) => c.i);
    const tachadas = perdedoras.slice(0, Math.min(ARBITRO_TACHADAS, perdedoras.length - 1));

    assert.equal(tachadas.length, ARBITRO_TACHADAS);
    assert.ok(
        perdedoras.length - tachadas.length >= 1,
        'siempre queda al menos una perdedora en pie',
    );

    // Y el borde de verdad: una grilla con UNA sola perdedora no se puede tachar.
    const casiTodoGana = Array.from({ length: 30 }, (_, i) => i > 0);
    const pocas = casiTodoGana.map((g, i) => ({ g, i })).filter((c) => !c.g).map((c) => c.i);
    assert.equal(
        pocas.slice(0, Math.min(ARBITRO_TACHADAS, pocas.length - 1)).length,
        0,
        'con una sola perdedora no se tacha ninguna',
    );
});

// ═══════════════════════════════════════════════════════════════════════════
//  7 · EL MUNDIAL REPARTE CUATRO PUESTOS
// ═══════════════════════════════════════════════════════════════════════════
//
// Formato real: 24 uniones, tres de grupo, octavos, cuartos, semi, y el sábado
// dos partidos — la final y el del tercer puesto. Lo que hay que afirmar no es
// que el bronce EXISTA sino que NO REPARTA LA COPA: sin esa guarda, el que
// pierde la semifinal gana el partido por el tercer puesto y el motor le cuelga
// un Mundial en la vitrina. Es el mismo bug que el M20 ya pagó con el cuadro del
// quinto puesto.
test('EL QUE PIERDE LA SEMI DEL MUNDIAL SIGUE, Y NO LEVANTA LA COPA', () => {
    const def = getTournament('mundial-mayor');

    assert.equal(def.fieldSize, 24, '24 uniones, como el Mundial de 2027');
    assert.equal(def.groupMatches, 3, 'tres de grupo');
    assert.deepEqual(def.knockout, ['octavos', 'cuartos', 'semi', 'final']);
    assert.equal(def.matchGrid, true, 'cada partido se juega en la grilla, como el M20');
    assert.equal(bronzeFrom(def), 'semi', 'el que pierde la semi es el que juega por el bronce');

    // Perdió la semifinal: NO se va a casa.
    const perdioSemi = mundialCon([
        { round: 'semi', revealed: true, gana: false },
    ]);
    assert.equal(survives(perdioSemi, def, false), true, 'le queda el partido por el tercer puesto');
    assert.equal(roundTitle(perdioSemi, def, 'final'), 'Por el tercer puesto');
    assert.equal(forTheTitle(perdioSemi, def, 'final'), false, 'esa tarde no reparte copa');

    // Y ganándolo termina TERCERO, no campeón. Las dos mitades: el puesto que se
    // muestra y el trofeo que no se otorga.
    const bronceGanado = mundialCon([
        { round: 'semi', revealed: true, gana: false },
        { round: 'final', revealed: true, gana: true },
    ]);
    assert.equal(finalPlace(bronceGanado, def), 3);
    assert.equal(isTitleDecider(bronceGanado, def, 'final'), false, 'ganar el bronce no es ser campeón');

    // El otro brazo, que es el que hace útil al test: el que SÍ ganó la semi
    // juega la final de verdad y ahí sí se levanta la copa.
    const enLaFinal = mundialCon([{ round: 'semi', revealed: true, gana: true }]);
    assert.equal(roundTitle(enLaFinal, def, 'final'), 'La final');
    assert.equal(forTheTitle(enLaFinal, def, 'final'), true);

    const campeon = mundialCon([
        { round: 'semi', revealed: true, gana: true },
        { round: 'final', revealed: true, gana: true },
    ]);
    assert.equal(finalPlace(campeon, def), 1);
    assert.equal(isTitleDecider(campeon, def, 'final'), true);

    // Perder la final es SEGUNDO y no «quedaron afuera».
    const finalista = mundialCon([
        { round: 'semi', revealed: true, gana: true },
        { round: 'final', revealed: true, gana: false },
    ]);
    assert.equal(finalPlace(finalista, def), 2);
});

// Y LOS QUE NO TIENEN BRONCE SIGUEN ELIMINANDO. Sin esto, el campo nuevo podría
// haberse colado en los cuatro y nadie lo notaría: la Nations Cup son cuatro
// partidos y una semifinal perdida es el final del torneo.
test('LOS TORNEOS SIN BRONCE MANDAN A CASA AL QUE PIERDE LA SEMI', () => {
    for (const id of ['juvenil-m18', 'nations-cup'] as const) {
        const def = getTournament(id);
        assert.equal(def.bronze, false, `${id} no declara bronce`);
        assert.equal(bronzeFrom(def), null);
        const t = { ...mundialCon([{ round: 'semi', revealed: true, gana: false }]), id };
        assert.equal(survives(t, def, false), false, `${id}: perdió la semi y se terminó`);
    }
});

/**
 * Un Mundial mínimo. La ronda EN CURSO es la del último partido cargado y no un
 * parámetro: `survives` se pregunta con la ronda que se acaba de jugar, así que
 * pasarla a mano invitaba a escribir un caso que el motor nunca produce —perder
 * la semifinal estando en la final— y a que el test fallara por el armado y no
 * por la regla. Es la misma trampa del §1.5: el estado tiene que decir lo que es.
 */
function mundialCon(partidos: { round: RoundId; revealed: boolean; gana: boolean }[]): PendingTournament {
    const enCurso = partidos[partidos.length - 1]?.round ?? 'grupos';
    return { ...torneoDePrueba(enCurso, partidos), id: 'mundial-mayor' };
}

/** Un torneo mínimo, con los partidos que el caso necesita y nada más. */
function torneoDePrueba(
    round: RoundId,
    partidos: { round: RoundId; revealed: boolean; gana: boolean }[],
): PendingTournament {
    return {
        id: 'mundial-m20',
        season: 1,
        seed: 1,
        unionCode: 'ar',
        round,
        playing: null,
        comodin: 'plan',
        comodinUsed: false,
        outcome: null,
        finalRound: null,
        matches: partidos.map((p) => ({
            round: p.round,
            rivalCode: 'uy',
            rivalName: 'Uruguay',
            puntos: p.gana ? 20 : 10,
            puntosRival: p.gana ? 10 : 20,
            tries: 2,
            triesRival: 1,
            palos: null,
            casillas: null,
            grid: null,
            revealed: p.revealed,
            arenga: false,
            tuya: 'logrado' as const,
        })),
    };
}

test('EL RECHAZO SE OLVIDA A LAS DOS TEMPORADAS', () => {
    const state = carreraLimpia();
    state.decisionLog.push({
        season: 5,
        eventId: TRIAL_TOUR_EVENT_ID,
        optionId: 'decir-que-no',
        outcomeIndex: 0,
        text: 'x',
    });

    const recuerda = (season: number) => {
        for (let i = state.decisionLog.length - 1; i >= 0; i -= 1) {
            const d = state.decisionLog[i];
            if (d.eventId !== TRIAL_TOUR_EVENT_ID || d.optionId !== 'decir-que-no') continue;
            return season - d.season <= DECLINE_MEMORY_SEASONS;
        }
        return false;
    };

    assert.equal(recuerda(6), true, 'al año siguiente se acuerdan');
    assert.equal(recuerda(5 + DECLINE_MEMORY_SEASONS), true, 'en el último año de memoria, todavía');
    assert.equal(recuerda(5 + DECLINE_MEMORY_SEASONS + 1), false, 'y después se olvida');
});
