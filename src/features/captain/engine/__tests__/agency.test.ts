// ¿CUÁNTO PESA LO QUE DECIDÍS?
//
// Este archivo mide una sola cosa y es la que va a cambiar cuando entre la
// Formación (`docs/el-capitan-formacion.md`): qué parte del destino de una
// carrera lo decide EL SORTEO DEL TECHO y qué parte lo decide EL JUGADOR.
//
// ── Por qué no es el digest, y por qué no es calibración ──
// Son tres especies distintas y mezclarlas las arruina:
//
//   DIGEST      afirma VALORES LITERALES contra el catálogo real y versionado.
//               Se mueve cuando cambia el motor O cuando cambia el canon, y por
//               eso lleva la versión del catálogo afirmada adelante.
//   CALIBRACIÓN afirma la forma de la PIRÁMIDE: que llegar a la mayor sea raro,
//               que ningún puesto quede afuera.
//   ESTE        afirma la forma de la AGENCIA: cuánto manda el dado contra
//               cuánto mandás vos. No afirma un número absoluto de nada.
//
// ── Cómo se desacopla del canon (la decisión "C") ──
// Dos reglas, y las dos importan:
//
//   1. TODAS LAS CARRERAS ARRANCAN EN EL MISMO CLUB, elegido POR REGLA y no por
//      nombre: el argentino de rating mediano, con desempate por id. Si el canon
//      agrega o saca clubes, la regla sigue devolviendo uno y el barrido sigue
//      corriendo. Un id escrito a mano se rompería el día que ese club cambie de
//      nombre.
//   2. TODO LO QUE SE AFIRMA ES RELATIVO —un brazo contra otro, un tercil contra
//      otro, dentro de la misma corrida—. Una edición del canon mueve los dos
//      lados de la comparación a la vez, así que la forma aguanta. Afirmar
//      "9,2%" clavado sería volver a atar esto al catálogo por la ventana.
//
// Lo que NO se desacopla: el mercado. `generateOffers` lee el catálogo real, así
// que una carrera que se muda arrastra algo de canon. Por eso las bandas de este
// archivo son anchas y las comparaciones, pareadas.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import type { TimeSlot } from '../../types/currencies.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { CLUBS } from '../../data/catalogs.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { getPendingEvent } from '../event-selector.ts';
import { trackIndex } from '../national-team.ts';
import { getMomentDef, isContractKind } from '../moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../moments.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  El club de referencia, elegido POR REGLA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El argentino de rating mediano.
 *
 * Se ordena por id antes de nada —`CLUBS` es un array, pero el orden de un
 * catálogo generado no es una promesa— y recién ahí se toma el del medio por
 * rating. Determinista y sin nombres escritos a mano.
 */
function clubDeReferencia(): string {
    const argentinos = CLUBS
        .filter((club) => club.countryCode === 'ar')
        .sort((a, b) => (a.rating - b.rating) || a.id.localeCompare(b.id));
    assert.ok(argentinos.length > 0, 'el catálogo no tiene clubes argentinos: el barrido no puede arrancar');
    return argentinos[Math.floor(argentinos.length / 2)].id;
}

const CLUB = clubDeReferencia();

// ═══════════════════════════════════════════════════════════════════════════
//  Los dos brazos
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Las dos formas más lejanas de jugar que el juego ofrece HOY.
 *
 * No son "la mejor" y "la peor" —eso no se puede saber sin resolver el juego—
 * sino las dos más distintas: el que le da todo al rugby y el que no. La
 * diferencia entre las dos es, por lo tanto, un PISO de lo que las decisiones
 * pueden mover, nunca un techo. Que ese piso sea chiquito contra el sorteo del
 * potencial es exactamente lo que este archivo existe para vigilar.
 */
interface Brazo {
    nombre: string;
    fichas: TimeSlot[];
    nivel: PlayLevel;
    /** Qué opción elige de cada tarjeta. Los dos extremos del abanico. */
    opcion: (opciones: string[]) => string;
}

const BRAZOS: Brazo[] = [
    {
        nombre: 'se entrega',
        fichas: ['entrenar', 'entrenar', 'gimnasio', 'gimnasio', 'club', 'club'],
        nivel: 'bien',
        opcion: (o) => o[0],
    },
    {
        nombre: 'no se entrega',
        fichas: ['trabajar', 'trabajar', 'familia', 'familia', 'trabajar', 'familia'],
        nivel: 'mal',
        opcion: (o) => o[o.length - 1],
    },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Correr una carrera
// ═══════════════════════════════════════════════════════════════════════════

function manoDe(state: CaptainState, nivel: PlayLevel): MomentOutcome {
    const pendiente = state.pendingMoment!;
    if (isContractKind(pendiente.kind)) {
        return getMomentDef(pendiente.kind)!.playAt(pendiente.setup!, nivel, 0.5);
    }
    switch (pendiente.kind) {
        case 'bunker':
            return { kind: 'bunker' };
        case 'tackle': {
            const zones = tackleZones(state.player, state.damage.cuerpo, pendiente.pressure);
            const { at, zone } = tacklePlayAt(zones, nivel, 0.5);
            return { kind: 'tackle', zone, at };
        }
        default:
            return manoImposible(pendiente.kind);
    }
}

function manoImposible(kind: never): never {
    throw new Error(`El Momento pre-contrato '${String(kind)}' no tiene mano en el barrido de agencia.`);
}

function trabada(state: CaptainState, donde: string): never {
    throw new Error(
        `${donde}: la carrera quedó trabada en la fase '${state.phase}' `
        + `(temporada ${state.season}, jugada pendiente: ${state.pendingMoment?.kind ?? 'ninguna'}).`,
    );
}

interface Corrida {
    potential: number;
    pico: number;
    ovrFinal: number;
    /**
     * NUNCA llegó a su techo, y se mide contra el PICO y no contra el OVR final.
     *
     * Contra el final la respuesta es "casi todos" y no significa nada: el
     * declive de la edad baja la media de cualquiera, así que un jugador que
     * tocó su techo a los 27 y se retiró a los 34 aparecería como que se quedó
     * corto. Lo que se pregunta acá es si ALGUNA VEZ llegó.
     */
    quedoCorto: boolean;
    /** Pisó algún escalón representativo, del que sea. */
    llego: boolean;
}

function correr(seed: number, family: CreateCaptainInput['family'], brazo: Brazo): Corrida {
    const input: CreateCaptainInput = {
        name: 'X',
        surname: 'Y',
        family,
        countryCode: 'ar',
        clubId: CLUB,
    };

    let s = createInitialCaptain(input, seed);
    const potential = s.player.potential;
    let vuelta = 0;

    while (s.phase !== 'retired') {
        if (vuelta >= 60) trabada(s, `${family} con semilla ${seed}`);

        for (const slot of brazo.fichas) s = captainReducer(s, { type: 'SPEND_TIME', slot });
        s = captainReducer(s, { type: 'CONFIRM_TIME' });

        let guarda = 0;
        while (s.phase === 'moment') {
            if (guarda >= 4) trabada(s, `${family} con semilla ${seed}`);
            s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: manoDe(s, brazo.nivel) });
            guarda += 1;
        }

        s = captainReducer(s, { type: 'ADVANCE' });
        if (s.phase === 'event') {
            const evento = getPendingEvent(s)!;
            s = captainReducer(s, { type: 'CHOOSE', optionId: brazo.opcion(evento.options.map((o) => o.id)) });
        }
        vuelta += 1;
    }

    const pico = Math.max(s.player.ovr, ...s.history.map((h) => h.ovr));
    return {
        potential,
        pico,
        ovrFinal: s.player.ovr,
        quedoCorto: pico < s.player.potential - 1,
        llego: trackIndex(s.national.bestTrack) > trackIndex('club'),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  El barrido
// ═══════════════════════════════════════════════════════════════════════════

const SEMILLAS = 60;
const FAMILIAS: CreateCaptainInput['family'][] = ['primera-linea', 'apertura', 'wing-fullback'];

/** Las mismas semillas para los dos brazos: la comparación es PAREADA. */
const CORRIDAS = new Map<string, Corrida[]>();
for (const brazo of BRAZOS) {
    const filas: Corrida[] = [];
    for (const family of FAMILIAS) {
        for (let i = 0; i < SEMILLAS; i += 1) filas.push(correr(1000 + i * 13, family, brazo));
    }
    CORRIDAS.set(brazo.nombre, filas);
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const tasa = (xs: boolean[]) => xs.filter(Boolean).length / Math.max(1, xs.length);
const uno = (n: number) => Math.round(n * 10) / 10;

/**
 * Los terciles del techo, calculados SOBRE LAS MISMAS CARRERAS que se comparan.
 *
 * No se usa un umbral fijo de potencial: un umbral escrito a mano vuelve a atar
 * el barrido al canon —si el catálogo cambia y los jugadores salen dos puntos
 * más flojos, el tercil "alto" se vacía y el test falla sin que el diseño se
 * haya movido—. Los terciles se recalculan en cada corrida.
 */
function porTercil(filas: Corrida[]): { bajo: Corrida[]; alto: Corrida[] } {
    const ordenadas = [...filas].sort((a, b) => a.potential - b.potential);
    const corte = Math.floor(ordenadas.length / 3);
    return { bajo: ordenadas.slice(0, corte), alto: ordenadas.slice(-corte) };
}

test('EL BARRIDO CORRE: hay carreras de los dos brazos y terminan todas', () => {
    // Sin esto, cualquier assert de abajo puede pasar sobre una lista vacía.
    for (const brazo of BRAZOS) {
        const filas = CORRIDAS.get(brazo.nombre)!;
        assert.equal(filas.length, SEMILLAS * FAMILIAS.length, `${brazo.nombre}: faltan carreras`);
        assert.ok(filas.every((f) => f.pico > 0), `${brazo.nombre}: hay carreras sin pico`);
    }
    // Y que los dos brazos hayan recibido el MISMO reparto de potenciales, que es
    // lo que hace pareada la comparación.
    const [a, b] = BRAZOS.map((br) => CORRIDAS.get(br.nombre)!.map((f) => f.potential));
    assert.deepEqual(b, a, 'los dos brazos no vieron los mismos potenciales: la comparación no es pareada');
});

test('LA COMPUERTA DEL TECHO ES HOY LA DOMINANTE — y este número tiene que bajar', () => {
    // LA MEDICIÓN QUE JUSTIFICA LA FORMACIÓN, y el termómetro del paso (a) del
    // doc. Se comparan dos rangos sobre la MISMA muestra:
    //
    //   rango del techo    = pico medio del tercil alto − pico medio del bajo,
    //                        dentro de un mismo brazo (o sea: mismas decisiones).
    //   rango de decisión  = pico medio de un brazo − pico medio del otro,
    //                        dentro de un mismo tercil (o sea: mismo techo).
    //
    // El segundo es un PISO de lo que las decisiones pueden mover: son las dos
    // formas más lejanas de jugar que el juego ofrece hoy, no la mejor y la peor.
    //
    // Cuando el techo pase de punto a banda y la Formación empuje adentro, esta
    // razón tiene que BAJAR. Si sube, la Formación no está haciendo lo que dice.
    const rangosTecho: number[] = [];
    const rangosDecision: number[] = [];

    for (const brazo of BRAZOS) {
        const { bajo, alto } = porTercil(CORRIDAS.get(brazo.nombre)!);
        rangosTecho.push(media(alto.map((f) => f.pico)) - media(bajo.map((f) => f.pico)));
    }

    // Para la decisión hay que comparar el MISMO tercil entre brazos, si no se
    // estaría midiendo el techo otra vez.
    for (const cual of ['bajo', 'alto'] as const) {
        const [a, b] = BRAZOS.map((br) => porTercil(CORRIDAS.get(br.nombre)!)[cual]);
        rangosDecision.push(Math.abs(media(a.map((f) => f.pico)) - media(b.map((f) => f.pico))));
    }

    const techo = media(rangosTecho);
    const decision = media(rangosDecision);
    const razon = decision > 0 ? techo / decision : Infinity;
    const detalle = `techo=${uno(techo)} puntos de pico · decisión=${uno(decision)} · razón=${uno(razon)}`;

    // Medido hoy: techo ≈ 13,5 puntos de pico contra decisión ≈ 6,7, o sea una
    // razón de 2. El piso está en 1,4 y no en 2 a propósito: una banda que roza
    // el valor medido titila con cualquier ajuste de calibración y deja de ser
    // un termómetro para pasar a ser una molestia.
    assert.ok(techo > 0, `el techo no explica nada del pico, y eso no puede ser: ${detalle}`);
    assert.ok(
        razon > 1.4,
        'la compuerta del techo dejó de ser la dominante. Si es porque entró la Formación, '
        + `actualizá esta banda y celebrá; si no, algo del crecimiento se rompió: ${detalle}`,
    );
    assert.ok(
        razon < 40,
        'la decisión dejó de mover el pico casi por completo: el juego se volvió una pantalla '
        + `de carga entre el sorteo y el retiro: ${detalle}`,
    );

    console.log(`      · agencia: ${detalle}`);
});

test('EL QUE SE ENTREGA LLEGA MÁS ALTO — las decisiones tienen que mover ALGO', () => {
    // La otra mitad de la vigilancia: que el techo domine no puede significar que
    // las decisiones no hagan nada. Es dirección, no magnitud, así que el canon
    // puede moverse abajo sin romper esto.
    const [entregado, tibio] = BRAZOS.map((br) => media(CORRIDAS.get(br.nombre)!.map((f) => f.pico)));
    assert.ok(
        entregado > tibio,
        `el que le da todo al rugby no termina mejor que el que no: ${uno(entregado)} contra ${uno(tibio)}`,
    );
});

test('CUÁNTOS SE QUEDAN CORTOS DE SU TECHO — y la corrección al diagnóstico del doc', () => {
    // ── LO QUE ESTA MEDICIÓN CORRIGE ──
    // `docs/el-capitan-formacion.md` arranca de un barrido viejo que dio
    // `no-alcanzó-su-techo = 0` y lo lee como "las decisiones no mueven nada: el
    // que tiene el techo llega siempre". Medido acá, con los dos brazos:
    //
    //   el que se entrega     se queda corto el ~1% de las veces
    //   el que no se entrega  se queda corto el ~96%
    //
    // O sea que el `0` original describía UN SOLO brazo —el que juega bien— y de
    // ahí salía una conclusión más grande de la que los datos aguantaban. Las
    // decisiones sí deciden algo grande: si llegás o no a tu techo.
    //
    // Lo que NINGUNA decisión puede hacer hoy es MOVER EL TECHO. El problema de
    // agencia existe, pero está un escalón más arriba de donde el doc lo puso, y
    // es exactamente lo que ataca el paso (a) —el techo como banda—. Cuando eso
    // entre, el brazo que se entrega tiene que empezar a quedarse corto de vez en
    // cuando: con banda, entregarse deja de garantizar el máximo.
    const cortos = BRAZOS.map((br) => tasa(CORRIDAS.get(br.nombre)!.map((f) => f.quedoCorto)));
    const [entregado, tibio] = cortos;
    const detalle = `se entrega=${uno(entregado * 100)}% · no se entrega=${uno(tibio * 100)}%`;

    // Hoy: entregarse es garantía de llegar al techo. ESTA es la banda que el
    // paso (a) tiene que romper hacia arriba.
    assert.ok(
        entregado < 0.15,
        `entregarse dejó de garantizar el techo. Si entró la banda del paso (a), es la medición `
        + `que buscábamos y hay que actualizar esto: ${detalle}`,
    );
    // Y no entregarse casi nunca llega. Si esto bajara mucho, el esfuerzo dejó de
    // significar algo y el juego se volvió una pantalla de carga.
    assert.ok(
        tibio > 0.5,
        `no entregarse pasó a llegar al techo demasiado seguido: el esfuerzo dejó de pesar: ${detalle}`,
    );
    assert.ok(tibio >= entregado, `el que no se entrega llega tanto como el que sí: ${detalle}`);

    console.log(`      · se quedan cortos: ${detalle}`);
});

test('la tasa de llegada al seleccionado cae en una banda, y el esfuerzo la mueve', () => {
    // Banda ANCHA a propósito: no congela un número, congela que llegar sea
    // posible y raro. El número exacto es asunto de `calibration.test.ts`, que se
    // mide contra el catálogo real.
    const llegadas = BRAZOS.map((br) => tasa(CORRIDAS.get(br.nombre)!.map((f) => f.llego)));
    const [entregado, tibio] = llegadas;
    const detalle = `se entrega=${uno(entregado * 100)}% · no se entrega=${uno(tibio * 100)}%`;

    assert.ok(entregado > 0, `nadie pisa un escalón representativo ni entregándose: ${detalle}`);
    assert.ok(entregado < 0.9, `pisar la representativa dejó de ser raro: ${detalle}`);
    assert.ok(entregado >= tibio, `entregarse no ayuda a llegar: ${detalle}`);

    console.log(`      · llega a la representativa: ${detalle}`);
});
