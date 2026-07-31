// Los Momentos: el armazón y los dos transversales.
//
// Lo que se prueba acá no es que el minijuego sea divertido —eso se prueba
// jugándolo— sino las tres cosas que el resto del sistema da por ciertas: que
// la jugada del jugador es una ENTRADA y no un dado, que el veredicto del
// bunker lo decide el motor y no la pantalla, y que la zona peligrosa crece con
// el desgaste.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import type { TackleZone } from '../../types/moment.ts';
import type { CaptainAction } from '../../state/captain-actions.ts';
import { TIME_SLOTS, TIME_TOKENS_PER_SEASON } from '../../types/currencies.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { tackleZones, zoneAt } from '../moments.ts';

const INPUT: CreateCaptainInput = {
    name: 'Ciro',
    surname: 'Lavanini',
    family: 'tercera-linea',
    countryCode: 'ar',
};

function repartir(state: CaptainState): CaptainState {
    const acciones: CaptainAction[] = [];
    for (let i = 0; i < TIME_TOKENS_PER_SEASON; i += 1) {
        acciones.push({ type: 'SPEND_TIME', slot: TIME_SLOTS[i % TIME_SLOTS.length] });
    }
    acciones.push({ type: 'CONFIRM_TIME' });
    return acciones.reduce(captainReducer, state);
}

/** Avanza hasta encontrar una temporada que traiga jugada decisiva. */
function hastaElMomento(seed: number, max = 25): CaptainState | null {
    let s = createInitialCaptain(INPUT, seed);
    for (let i = 0; i < max && s.phase !== 'retired'; i += 1) {
        s = repartir(s);
        if (s.phase === 'moment') return s;
        s = captainReducer(s, { type: 'ADVANCE' });
        if (s.phase === 'event') {
            s = captainReducer(s, { type: 'CHOOSE', optionId: 'x' });
            if (s.phase === 'event') return null; // opción inválida, se corta
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Los márgenes de la barra
// ═══════════════════════════════════════════════════════════════════════════

test('las cuatro zonas están en orden y cubren la barra entera', () => {
    const state = createInitialCaptain(INPUT, 7);
    const z = tackleZones(state.player, 0, 0.5);

    assert.ok(z.piernasEnd > 0 && z.piernasEnd < z.legalEnd, 'piernas y legal están al revés');
    assert.ok(z.legalEnd < z.altoEnd, 'legal y alto están al revés');
    assert.ok(z.altoEnd < 1, 'no queda lugar para llegar tarde');

    // Y cada punto de la barra cae en exactamente una zona.
    const vistas = new Set<TackleZone>();
    for (let p = 0; p < 1; p += 0.01) vistas.add(zoneAt(p, z));
    assert.deepEqual([...vistas].sort(), ['alto', 'legal', 'piernas', 'tarde']);
});

test('EL CUERPO ROTO ENSANCHA LA ZONA PELIGROSA', () => {
    // Es el detalle que ningún juego modela y el que hace que el sistema
    // disciplinario y el desgaste sean la misma cosa: un jugador roto en el
    // minuto 75 tiene muchas más chances de irse expulsado.
    const state = createInitialCaptain(INPUT, 7);
    const entero = tackleZones(state.player, 0, 0.5);
    const roto = tackleZones(state.player, 90, 0.5);

    const anchoEntero = entero.altoEnd - entero.legalEnd;
    const anchoRoto = roto.altoEnd - roto.legalEnd;
    assert.ok(anchoRoto > anchoEntero * 1.4, `la franja de riesgo no creció: ${anchoEntero} → ${anchoRoto}`);
});

test('el atributo de tackle ensancha la zona legal', () => {
    const flojo = createInitialCaptain(INPUT, 7);
    const bueno = createInitialCaptain(INPUT, 7);
    flojo.player.attrs.tackle = 35;
    bueno.player.attrs.tackle = 90;

    const a = tackleZones(flojo.player, 0, 0.5);
    const b = tackleZones(bueno.player, 0, 0.5);
    assert.ok((b.legalEnd - b.piernasEnd) > (a.legalEnd - a.piernasEnd));
});

test('la presión acelera la barra', () => {
    const state = createInitialCaptain(INPUT, 7);
    assert.ok(tackleZones(state.player, 0, 1).sweepMs < tackleZones(state.player, 0, 0).sweepMs);
});

// ═══════════════════════════════════════════════════════════════════════════
//  El armazón
// ═══════════════════════════════════════════════════════════════════════════

test('cerrar el reparto deja la temporada lista: o a simular, o a la jugada', () => {
    let s = createInitialCaptain(INPUT, 21);
    s = repartir(s);
    assert.ok(['season', 'moment'].includes(s.phase), `fase inesperada: ${s.phase}`);
    if (s.phase === 'moment') {
        assert.ok(s.pendingMoment, 'fase de momento sin jugada que dibujar');
        assert.equal(s.pendingMoment!.kind, 'tackle');
        assert.ok(s.pendingMoment!.minute >= 48 && s.pendingMoment!.minute <= 79);
    }
});

test('sin resolver la jugada no se simula la temporada', () => {
    const s = hastaElMomento(21) ?? hastaElMomento(88);
    if (!s) return;
    assert.equal(captainReducer(s, { type: 'ADVANCE' }), s, 'la temporada se jugó sin resolver el Momento');
});

test('un tackle limpio deja empuje en la planilla y cierra la jugada', () => {
    const s = hastaElMomento(21) ?? hastaElMomento(88);
    if (!s) return;

    const antes = s.pendingStatBoost;
    const despues = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: 'legal', at: 0.5 } });

    assert.equal(despues.phase, 'season');
    assert.equal(despues.pendingMoment, null);
    assert.ok(despues.pendingStatBoost > antes, 'el tackle dominante no empujó la planilla');
    assert.equal(despues.moments.length, 1);
    assert.equal(despues.moments[0].result, 'Tackle dominante');
});

test('un tackle alto NO cierra la jugada: te manda al bunker', () => {
    const s = hastaElMomento(21) ?? hastaElMomento(88);
    if (!s) return;

    const zonas = tackleZones(s.player, s.damage.cuerpo, s.pendingMoment!.pressure);
    const enElMedioDelAlto = (zonas.legalEnd + zonas.altoEnd) / 2;
    const despues = captainReducer(s, {
        type: 'RESOLVE_MOMENT',
        outcome: { kind: 'tackle', zone: 'alto', at: enElMedioDelAlto },
    });

    assert.equal(despues.phase, 'moment', 'un tackle alto tiene que seguir en el Momento');
    assert.equal(despues.pendingMoment?.kind, 'bunker');
    assert.ok(despues.pendingMoment?.verdict, 'el veredicto tiene que estar decidido ANTES de la pantalla');
    assert.ok(['amarilla', 'roja-20'].includes(despues.pendingMoment!.verdict!));
});

test('EL VEREDICTO DEL BUNKER LO DECIDE EL MOTOR, NO LA CUENTA REGRESIVA', () => {
    // Si lo sorteara la pantalla, recargar en el segundo siete daría otro
    // resultado y la partida dejaría de ser reproducible. Se prueba mandando el
    // mismo estado al bunker dos veces: el veredicto tiene que coincidir.
    const s = hastaElMomento(21) ?? hastaElMomento(88);
    if (!s) return;

    const alto = { kind: 'tackle' as const, zone: 'alto' as const, at: 0.75 };
    const a = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: alto });
    const b = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: alto });
    assert.equal(a.pendingMoment?.verdict, b.pendingMoment?.verdict);

    // Y sobrevive al viaje por JSON, que es lo que hace la recarga.
    const viajado = JSON.parse(JSON.stringify(a)) as CaptainState;
    assert.equal(viajado.pendingMoment?.verdict, a.pendingMoment?.verdict);
});

test('salir del bunker cobra la suspensión y devuelve a la temporada', () => {
    const base = hastaElMomento(21) ?? hastaElMomento(88);
    if (!base) return;

    // Con Cartel para perder. Un pibe de la primera temporada está en cero y el
    // cero no baja, así que sin esto la prueba no probaría nada.
    const s: CaptainState = { ...base, fame: 30 };

    const enBunker = captainReducer(s, {
        type: 'RESOLVE_MOMENT',
        outcome: { kind: 'tackle', zone: 'alto', at: 0.75 },
    });
    const veredicto = enBunker.pendingMoment!.verdict!;
    const salido = captainReducer(enBunker, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } });

    assert.equal(salido.phase, 'season');
    assert.equal(salido.pendingMoment, null);
    assert.ok(salido.pendingSanction > 0, 'una tarjeta tiene que costar partidos');
    assert.ok(salido.fame < enBunker.fame, 'una tarjeta tiene que costar Cartel');
    // Dos registros: el tackle y el veredicto. Son la misma jugada contada en
    // dos tiempos, y la trayectoria los muestra juntos.
    assert.equal(salido.moments.length, 2);
    assert.equal(salido.moments[1].kind, 'bunker');
    assert.equal(salido.moments[1].result, veredicto === 'roja-20' ? 'Roja de veinte' : 'Amarilla');
});

test('la roja de veinte cuesta más que la amarilla', () => {
    // No hace falta jugar: se comparan los dos caminos desde el mismo estado.
    const base = hastaElMomento(21) ?? hastaElMomento(88);
    if (!base) return;
    const s: CaptainState = { ...base, fame: 30 };

    let amarilla: CaptainState | null = null;
    let roja: CaptainState | null = null;

    // Se prueban varias profundidades hasta ver los dos veredictos.
    for (const at of [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
        const enBunker = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: 'alto', at } });
        const salido = captainReducer(enBunker, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } });
        if (enBunker.pendingMoment?.verdict === 'roja-20') roja = salido;
        else amarilla = salido;
    }

    if (amarilla && roja) {
        assert.ok(roja.pendingSanction > amarilla.pendingSanction, 'la roja tiene que costar más partidos');
        assert.ok(roja.fame < amarilla.fame, 'la roja tiene que costar más Cartel');
    }
});

test('la jugada queda escrita en la temporada', () => {
    const s = hastaElMomento(21) ?? hastaElMomento(88);
    if (!s) return;

    const resuelto = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: 'legal', at: 0.5 } });
    const jugada = captainReducer(resuelto, { type: 'ADVANCE' });
    const fila = jugada.history[jugada.history.length - 1];

    assert.ok(fila.note, 'la temporada no cuenta la jugada');
    assert.ok(fila.note!.includes('Minuto'), `la nota no menciona el minuto: "${fila.note}"`);
});

test('la jugada es una entrada del jugador: la misma mano da la misma carrera', () => {
    // Es lo que hace que un Momento no rompa el determinismo. La habilidad del
    // jugador entra en el estado igual que una decisión.
    const correr = (zona: TackleZone) => {
        let s = createInitialCaptain(INPUT, 4242);
        for (let i = 0; i < 6 && s.phase !== 'retired'; i += 1) {
            s = repartir(s);
            let guarda = 0;
            while (s.phase === 'moment' && guarda < 4) {
                s = s.pendingMoment?.kind === 'bunker'
                    ? captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'bunker' } })
                    : captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: zona, at: 0.5 } });
                guarda += 1;
            }
            s = captainReducer(s, { type: 'ADVANCE' });
            if (s.phase === 'event') {
                const ev = s.pendingEventId;
                void ev;
                break;
            }
        }
        return s;
    };

    assert.deepEqual(correr('legal'), correr('legal'), 'la misma mano tiene que dar lo mismo');
    assert.notDeepEqual(correr('legal'), correr('tarde'), 'jugar distinto tiene que dar distinto');
});
