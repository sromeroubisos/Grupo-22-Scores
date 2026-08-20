import test from 'node:test';
import assert from 'node:assert/strict';

import { resolverEstado, finalizadoPorTiempo, ventanaDeFinalizacion } from './matchState.ts';

/* Los estados que importan no se pueden reproducir en el navegador: hace falta
   un partido jugándose un sábado a las 15:30. Por eso el resolvedor es una
   función pura y se prueba acá — es la única verificación honesta disponible. */

test('el vocabulario CANÓNICO del proyecto se resuelve entero', () => {
    // src/types/match.ts declara: scheduled | live | final | postponed | cancelled
    assert.equal(resolverEstado('scheduled').estado, 'programado');
    assert.equal(resolverEstado('live').estado, 'en-vivo');
    assert.equal(resolverEstado('final').estado, 'finalizado');
    assert.equal(resolverEstado('postponed').estado, 'suspendido');
    assert.equal(resolverEstado('cancelled').estado, 'suspendido');
});

test("'final' se lee como finalizado — era el agujero que tenía la página", () => {
    // El cliente buscaba 'finished' y 'ft', nunca 'final', que es JUSTO el valor
    // que guarda la app. Fuera de la lista de resultados, un partido terminado
    // por la propia app no se mostraba como terminado.
    const r = resolverEstado('final', { estaEnResultados: false });
    assert.equal(r.estado, 'finalizado');
    assert.equal(r.etiqueta, 'FT');
    assert.equal(r.muestraMarcador, true);
});

test('un partido postergado NO se dibuja como programado', () => {
    // El anti-patrón más caro: dejar un suspendido con cara de programado manda
    // a la gente a una cancha donde no se juega.
    const r = resolverEstado('postponed');
    assert.equal(r.estado, 'suspendido');
    assert.equal(r.etiqueta, 'POSTERGADO');
    assert.equal(r.muestraMarcador, false);
    assert.notEqual(r.estado, 'programado');
});

test('postergado y cancelado se distinguen entre sí', () => {
    assert.equal(resolverEstado('postponed').etiqueta, 'POSTERGADO');
    assert.equal(resolverEstado('cancelled').etiqueta, 'CANCELADO');
    assert.equal(resolverEstado('walkover').etiqueta, 'W.O.');
});

test('el entretiempo le gana a "en vivo" y detiene el reloj', () => {
    // '2nd half' y 'halftime' comparten la palabra "half": si el orden de
    // chequeo se invierte, todo descanso se lee como juego corriendo.
    const et = resolverEstado('ht');
    assert.equal(et.estado, 'entretiempo');
    assert.equal(et.etiqueta, 'ET');
    assert.equal(et.relojCorriendo, false, 'en el descanso el minuto miente');

    assert.equal(resolverEstado('half time').estado, 'entretiempo');
    assert.equal(resolverEstado('halftime').estado, 'entretiempo');
    // y el juego corriendo sigue siendo juego corriendo
    assert.equal(resolverEstado('2nd half').estado, 'en-vivo');
    assert.equal(resolverEstado('2nd half').relojCorriendo, true);
});

test('acepta el vocabulario de los proveedores externos', () => {
    for (const t of ['ft', 'FT', 'Full Time', 'finished', 'AET']) {
        assert.equal(resolverEstado(t).estado, 'finalizado', `${t} debería ser finalizado`);
    }
    for (const t of ['in_play', 'inplay', 'In Progress', '1st half', 'Q3']) {
        assert.equal(resolverEstado(t).estado, 'en-vivo', `${t} debería ser en vivo`);
    }
});

test('sin estado, la lista de origen es la pista — y sólo eso', () => {
    assert.equal(resolverEstado(null, { estaEnResultados: true }).estado, 'finalizado');
    assert.equal(resolverEstado('', { estaEnResultados: true }).estado, 'finalizado');
    assert.equal(resolverEstado(undefined, { estaEnResultados: false }).estado, 'programado');
});

test('un estado explícito le gana a la lista de origen', () => {
    // Un postergado que por lo que sea aparezca listado entre resultados sigue
    // siendo postergado: la lista es una red, no una verdad.
    const r = resolverEstado('postponed', { estaEnResultados: true });
    assert.equal(r.estado, 'suspendido');
    assert.notEqual(r.estado, 'finalizado');
});

test('el programado no muestra marcador', () => {
    const r = resolverEstado('scheduled');
    assert.equal(r.muestraMarcador, false, '0-0 antes de jugar es una mentira');
    assert.equal(r.etiqueta, '', 'no hay etiqueta que agregue nada: la hora ya lo dice');
});

test('tolera mayúsculas, espacios y valores raros sin explotar', () => {
    assert.equal(resolverEstado('  LIVE  ').estado, 'en-vivo');
    assert.equal(resolverEstado(123).estado, 'programado');
    assert.equal(resolverEstado({}).estado, 'programado');
    assert.equal(resolverEstado(null).estado, 'programado');
});

/* ── La red de tiempo ────────────────────────────────────────────────────── */

const MINUTO = 60_000;
const ARRANQUE = Date.UTC(2026, 7, 20, 7, 10, 0); // 1787209800: el kickoff real de ALypVsfU

test('el caso que originó todo: rugby terminado con los flags en cero', () => {
    // Canterbury 12 - 36 Northland, Bunnings NPC. La lista del día mandaba
    // `stage: null` y todos los flags en false CON el marcador cargado. La
    // ficha decía "Finished". Sin red, el partido quedaba «Programado».
    assert.equal(
        finalizadoPorTiempo({ sportId: 8, inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 104 * MINUTO }),
        true,
    );
});

test('la ventana es POR DEPORTE: los 100 minutos no se globalizan', () => {
    // A los 100 minutos un rugby terminó hace rato...
    const alos101 = { inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 101 * MINUTO };
    assert.equal(finalizadoPorTiempo({ sportId: 8, ...alos101 }), true);
    // ...y un tenis a cinco sets recién va por la mitad. Con la red vieja
    // globalizada, este partido se dibujaba terminado en pleno tercer set.
    assert.equal(finalizadoPorTiempo({ sportId: 2, ...alos101 }), false);
    // El fútbol tampoco entra: 90 + entretiempo + descuento pasan los 100.
    assert.equal(finalizadoPorTiempo({ sportId: 1, ...alos101 }), false);
});

test('los deportes sin duración acotada se quedan SIN red', () => {
    // Un test de cricket dura días y un torneo de golf, cuatro jornadas:
    // cualquier ventana sería inventada. Preferimos un «Programado» viejo
    // antes que un «Finalizado» mentiroso.
    const unaSemana = { inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 7 * 24 * 60 * MINUTO };
    assert.equal(ventanaDeFinalizacion(13), null, 'cricket');
    assert.equal(ventanaDeFinalizacion(23), null, 'golf');
    assert.equal(finalizadoPorTiempo({ sportId: 13, ...unaSemana }), false);
    assert.equal(finalizadoPorTiempo({ sportId: 23, ...unaSemana }), false);
});

test('un deporte desconocido cae en la ventana por defecto, no en cero', () => {
    // Que un sport_id nuevo no active la red al primer minuto: el default es
    // ancho a propósito.
    assert.equal(ventanaDeFinalizacion(999), 300);
    assert.equal(ventanaDeFinalizacion(undefined), 300);
    assert.equal(finalizadoPorTiempo({ sportId: 999, inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 120 * MINUTO }), false);
    assert.equal(finalizadoPorTiempo({ sportId: 999, inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 301 * MINUTO }), true);
});

test('sin arranque utilizable la red no se activa', () => {
    // Es la diferencia entre «no sé cuándo empezó» y «empezó hace mucho».
    const ahoraMs = ARRANQUE + 500 * MINUTO;
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: null, ahoraMs }), false);
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: undefined, ahoraMs }), false);
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: 0, ahoraMs }), false);
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: Number.NaN, ahoraMs }), false);
});

test('un partido que todavía no empezó nunca da finalizado', () => {
    // El caso de reset: la red mira hacia adelante, no hacia atrás.
    assert.equal(
        finalizadoPorTiempo({ sportId: 8, inicioMs: ARRANQUE, ahoraMs: ARRANQUE - 30 * MINUTO }),
        false,
    );
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: ARRANQUE, ahoraMs: ARRANQUE }), false);
});

test('el borde de la ventana es estricto: 100 no alcanza, 101 sí', () => {
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 100 * MINUTO }), false);
    assert.equal(finalizadoPorTiempo({ sportId: 8, inicioMs: ARRANQUE, ahoraMs: ARRANQUE + 100.5 * MINUTO }), true);
});

test('rugby league comparte ventana con rugby union', () => {
    assert.equal(ventanaDeFinalizacion(19), ventanaDeFinalizacion(8));
});
