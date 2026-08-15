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
import type { MomentOutcome, TackleZone } from '../../types/moment.ts';
import { trainingsFor } from '../../data/trainings.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { playTournament } from '../../state/captain-autoplay.ts';
import { getPendingEvent } from '../event-selector.ts';
import { tackleZones, zoneAt } from '../moments.ts';
import { ALL_MINIGAMES, getMinigame } from '../../data/minigames/index.ts';
import { isLegacySlot } from '../../types/minigame.ts';
import { ACADEMIA_KIND, getMomentDef, isContractKind } from '../moment-defs/index.ts';

const INPUT: CreateCaptainInput = {
    name: 'Ciro',
    surname: 'Lavanini',
    family: 'tercera-linea',
    countryCode: 'ar',
};

/** Elige el primer entrenamiento de la familia y con eso arranca la temporada. */
function repartir(state: CaptainState): CaptainState {
    const trainingId = trainingsFor(state.player.family)[0].id;
    return captainReducer(state, { type: 'CHOOSE_TRAINING', trainingId });
}

/**
 * Resuelve el pendiente sea el que sea, para poder seguir avanzando.
 *
 * Desde que hay Momentos por puesto, la mano tiene que ser DEL KIND pendiente:
 * mandarle un tackle a un jackal es una acción inválida y el reducer devuelve el
 * estado sin tocar, con lo cual el bucle de afuera gira sin avanzar.
 */
function resolverPendiente(state: CaptainState): CaptainState {
    const pendiente = state.pendingMoment!;

    // ── EL CONTRATO PRIMERO, Y ES EL §1.5 OTRA VEZ ──────────────────────────
    // Este helper terminaba en un `: { kind: 'tackle' }` que atrapaba todo lo
    // que no fueran los cinco nombrados. Es EXACTAMENTE la falla que el CLAUDE
    // del feature ya tiene anotada —«entró La Banda, el default le mandó una
    // mano de tackle a una corrida, y la carrera quedó trabada sin que nada
    // fallara»— y volvió a pasar en cuanto entró la academia: `resolveMoment`
    // rechaza la mano por kind, el reducer devuelve el estado sin tocar, y el
    // bucle de arriba gira hasta agotar su guarda. El síntoma no fue un error
    // sino un test que dejó de medir: «ninguna de 400 semillas jugó un tackle».
    //
    // La medicina es la del contrato: la mano la arma el Momento, que es el
    // único que sabe cómo se juega el suyo. El `default` queda solo para los dos
    // pre-contrato, que son los que de verdad no tienen def.
    if (isContractKind(pendiente.kind)) {
        const def = getMomentDef(pendiente.kind)!;
        const outcome = def.playAt(pendiente.setup!, 'regular', 0.5);
        return captainReducer(state, { type: 'RESOLVE_MOMENT', outcome });
    }

    const outcome: MomentOutcome = pendiente.kind === 'bunker'
        ? { kind: 'bunker' }
        : { kind: 'tackle', zone: 'legal', at: 0.5 };
    return captainReducer(state, { type: 'RESOLVE_MOMENT', outcome });
}

/**
 * Avanza hasta encontrar una temporada que traiga UN TACKLE.
 *
 * El jugador de prueba es tercera línea, que es justo la familia a la que
 * también le toca el jackal —y cada tanto, por el cruce, cualquier otro—: si
 * sale otro, se juega y se sigue buscando. Los tests de abajo son sobre la barra
 * del tackle, así que tienen que recibir un tackle y no "el Momento que salió".
 */
function hastaElTackle(seed: number, max = 25): CaptainState | null {
    let s = createInitialCaptain(INPUT, seed);
    for (let i = 0; i < max && s.phase !== 'retired'; i += 1) {
        s = repartir(s);

        let guarda = 0;
        while (s.phase === 'moment' && s.pendingMoment && s.pendingMoment.kind !== 'tackle' && guarda < 4) {
            s = resolverPendiente(s);
            guarda += 1;
        }
        if (s.phase === 'moment' && s.pendingMoment?.kind === 'tackle') return s;
        if (s.phase !== 'season') return null;

        s = playTournament(captainReducer(s, { type: 'ADVANCE' }));
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
        // Lo que este test cuida es el CONTEXTO compartido —el minuto y el
        // marcador—, que lo pone el armazón para CUALQUIER kind.
        //
        // ── Acá había una lista de dos nombres y era el §1.5 otra vez ────────
        // Decía `['tackle', 'jackal']`, con el comentario «a la tercera línea le
        // tocan los dos». Era cierto cuando los Momentos eran cinco y ninguna
        // familia tenía más de dos. Con sesenta y cinco en el catálogo se puso
        // en rojo con `uni-suelta`, que es una jugada perfectamente válida para
        // un tercera línea: el test no había encontrado un bicho, se había
        // quedado viejo nombrando por enumeración algo que se define por
        // pertenencia.
        //
        // Lo que hay que afirmar es que el kind SEA SORTEABLE, y eso se le
        // pregunta al catálogo en vez de repetirlo a mano.
        const kind = s.pendingMoment!.kind;
        const sorteable = getMinigame(kind) !== null || ALL_MINIGAMES.some(
            (slot) => isLegacySlot(slot) && slot.legacyOf === kind,
        );
        // O sale del catálogo, O llega por una compuerta. Las dos son formas
        // legítimas de que una jugada aparezca, y la segunda existe desde que la
        // academia provincial entró: no tiene casilla en `ALL_MINIGAMES` justamente
        // para que el sorteo no la vea nunca.
        //
        // La lista está escrita a mano y con un solo nombre a propósito: si mañana
        // hay otra jugada por compuerta, quien la escriba tiene que venir acá y
        // decidir si su Momento también puede quedar pendiente en este punto del
        // reparto. Es la fricción buena.
        const porCompuerta = kind === ACADEMIA_KIND;
        assert.ok(
            sorteable || porCompuerta,
            `kind que no está en el catálogo ni llega por compuerta: ${kind}`,
        );
        // El minuto SOLO se le pide a lo que pasa adentro de un partido. La
        // academia provincial es una semana de entrenamiento y viaja con minuto
        // cero a propósito: pedirle el rango del último cuarto sería pedirle a la
        // pretemporada que tenga marcador.
        if (!(s.pendingMoment!.setup as { sinPartido?: boolean } | undefined)?.sinPartido) {
            assert.ok(s.pendingMoment!.minute >= 48 && s.pendingMoment!.minute <= 79);
        }
    }
});

test('sin resolver la jugada no se simula la temporada', () => {
    const s = hastaElTackle(21) ?? hastaElTackle(88);
    if (!s) return;
    assert.equal(captainReducer(s, { type: 'ADVANCE' }), s, 'la temporada se jugó sin resolver el Momento');
});

test('un tackle limpio deja empuje en la planilla y cierra la jugada', () => {
    const s = hastaElTackle(21) ?? hastaElTackle(88);
    if (!s) return;

    const antes = s.pendingStatBoost;
    const despues = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: 'legal', at: 0.5 } });

    assert.equal(despues.phase, 'season');
    assert.equal(despues.pendingMoment, null);
    assert.ok(despues.pendingStatBoost > antes, 'el tackle dominante no empujó la planilla');
    // Se cuenta el DELTA y no el total: buscar un tackle puede haber jugado un
    // jackal antes, y ese también dejó su registro.
    assert.equal(despues.moments.length, s.moments.length + 1);
    assert.equal(despues.moments[despues.moments.length - 1].result, 'Tackle dominante');
});

test('un tackle alto NO cierra la jugada: te manda al bunker', () => {
    const s = hastaElTackle(21) ?? hastaElTackle(88);
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
    const s = hastaElTackle(21) ?? hastaElTackle(88);
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
    const base = hastaElTackle(21) ?? hastaElTackle(88);
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
    // Dos registros nuevos: el tackle y el veredicto. Son la misma jugada
    // contada en dos tiempos, y la trayectoria los muestra juntos.
    assert.equal(salido.moments.length, s.moments.length + 2);
    const ultimo = salido.moments[salido.moments.length - 1];
    assert.equal(ultimo.kind, 'bunker');
    assert.equal(ultimo.result, veredicto === 'roja-20' ? 'Roja de veinte' : 'Amarilla');
});

test('la roja de veinte cuesta más que la amarilla', () => {
    // No hace falta jugar: se comparan los dos caminos desde el mismo estado.
    const base = hastaElTackle(21) ?? hastaElTackle(88);
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
    const s = hastaElTackle(21) ?? hastaElTackle(88);
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
    //
    // ── ESTE TEST SE DIO VUELTA UNA VEZ Y NO AVISÓ ─────────────────────────
    // La versión anterior CORTABA en la primera tarjeta de decisión (`break` al
    // entrar en fase `event`) porque el bucle no sabía contestarla. Funcionaba
    // por accidente: con esta semilla, el primer Momento caía antes que el
    // primer evento.
    //
    // Al entrar la 0.11.0 el stream se corrió un tiro —el perfil de desarrollo
    // se sortea al crear el jugador— y el primer evento pasó a caer ANTES que
    // ningún Momento. Con eso, las dos carreras comparadas terminaban con
    // `moments: []`: idénticas, porque en ninguna de las dos se había jugado un
    // tackle. El test decía "jugar distinto da lo mismo" y lo que estaba
    // midiendo era otra cosa. Es el §1.7 del CLAUDE de captain otra vez —el
    // instrumento contesta la pregunta que tiene ESCRITA— y el corolario en
    // acción: una igualdad es una acusación contra el instrumento hasta que se
    // demuestre lo contrario.
    //
    // Dos arreglos, y el segundo es el que importa:
    //   · el bucle CONTESTA la tarjeta en vez de cortar, con la misma opción en
    //     las dos corridas, así que sigue siendo una comparación pareada;
    //   · se AFIRMA que se jugó al menos un tackle. Sin eso, este test puede
    //     volver a quedarse ciego la próxima vez que el stream se corra, y esa
    //     ceguera se lee exactamente igual que un motor roto.
    // ── Y SE QUEDÓ CIEGO OTRA VEZ, POR LO MISMO Y AL REVÉS ─────────────────
    // La semilla estaba clavada en 4242 porque con esa semilla salía un tackle.
    // Al entrar el catálogo por dorsal, el pool de sorteo pasó de seis kinds a
    // sesenta y cinco: la chance de que ESA semilla toque justo el tackle en
    // ocho temporadas se derrumbó, y la carrera de prueba dejó de jugar ninguno.
    // El `assert.ok(a.tackles > 0)` que se había agregado la vez anterior hizo
    // exactamente su trabajo: en vez de un verde mentiroso, un rojo que dice
    // «este test no está midiendo nada».
    //
    // La medicina es la misma que ya usa `hastaElTackle`: BUSCAR una semilla que
    // pise el carril en vez de escribir la que lo pisaba cuando se escribió el
    // test. Una semilla literal es un índice sobre una lista que cambia abajo
    // (§1.5), y esta es la tercera vez que la familia muerde.
    const correr = (zona: TackleZone, semilla: number) => {
        let s = createInitialCaptain(INPUT, semilla);
        let tackles = 0;
        for (let i = 0; i < 8 && s.phase !== 'retired'; i += 1) {
            s = repartir(s);
            let guarda = 0;
            while (s.phase === 'moment' && guarda < 4) {
                const kind = s.pendingMoment?.kind;
                if (kind === 'tackle') tackles += 1;
                s = kind === 'tackle'
                    ? captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: zona, at: 0.5 } })
                    // Todo lo demás se juega SIEMPRE IGUAL: lo que este test
                    // compara es qué cambia al mover LA ZONA DEL TACKLE.
                    : resolverPendiente(s);
                guarda += 1;
            }
            s = playTournament(captainReducer(s, { type: 'ADVANCE' }));
            // Bucle y no `if`: la temporada trae la tarjeta del año Y la del
            // mercado. Con un `if`, la segunda se comía una vuelta del `for` de
            // afuera y las dos ramas de este test corrían distinta cantidad de
            // temporadas — que es lo único que no puede pasar en una comparación
            // pareada.
            let decisiones = 0;
            while (s.phase === 'event' && decisiones < 4) {
                const evento = getPendingEvent(s);
                if (!evento) break;
                s = captainReducer(s, { type: 'CHOOSE', optionId: evento.options[0].id });
                decisiones += 1;
            }
        }
        return { estado: s, tackles };
    };

    let semilla = 0;
    let a: ReturnType<typeof correr> | null = null;
    for (let s = 1; s <= 400 && a === null; s += 1) {
        const intento = correr('legal', s);
        if (intento.tackles > 0) { a = intento; semilla = s; }
    }

    assert.ok(a, 'ninguna de 400 semillas jugó un tackle: este test no está midiendo nada');
    const b = correr('tarde', semilla);

    assert.deepEqual(correr('legal', semilla).estado, a!.estado, 'la misma mano tiene que dar lo mismo');
    assert.notDeepEqual(b.estado, a!.estado, 'jugar distinto tiene que dar distinto');
});
