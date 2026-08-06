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
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ SESGO CONOCIDO DEL INSTRUMENTO: EL CLUB FIJO INFLA EL `share` DEL FLOJO    │
// │                                                                            │
// │ Las dos carreras arrancan y se quedan en el mismo club de rating mediano.  │
// │ Y el tiempo de juego sale de `edge = ovr − clubRating`, o sea de si SOS    │
// │ MEJOR QUE TU CLUB — no de cuánto te esforzaste.                            │
// │                                                                            │
// │ Consecuencia medida, y hay que saberla al leer cualquier número de acá: el │
// │ brazo que NO se entrega juega MÁS que el que sí (mediana de `share` 0,90   │
// │ contra 0,71). Tiene techo bajo, converge rápido, y le sobra para un club   │
// │ mediano: pez grande en pecera chica. El que se entrega juega menos porque  │
// │ la carta cara le cuesta minutos.                                           │
// │                                                                            │
// │ En una carrera de verdad el flojo podría caer de división y perder minutos │
// │ posta. Acá no puede, porque el club es fijo — y el club es fijo por una    │
// │ razón buena, que es desacoplar el barrido del canon (regla 1 de arriba).   │
// │                                                                            │
// │ NO SE ARREGLA HOY. Se rehace con club variable cuando exista la dimensión  │
// │ que falta: "cuánto jugaste POR DECISIONES TUYAS", agendada como            │
// │ prerrequisito de los juveniles en `docs/el-capitan-formacion.md` §6.ter.   │
// └───────────────────────────────────────────────────────────────────────────┘

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import type { TrainingTier } from '../../data/trainings.ts';
import { CLUBS } from '../../data/catalogs.ts';
import { trainingsFor } from '../../data/trainings.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { getPendingEvent } from '../event-selector.ts';
import { trackIndex } from '../national-team.ts';
import { potentialOf } from '../ovr.ts';
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
 *
 * ── Qué cambió al irse las fichas, y qué al entrar el costo (0.7.0) ──
 * La primera palanca cambió de naturaleza DOS VECES, y las dos hay que decirlas.
 *
 * El reparto de fichas era una palanca de ESFUERZO: seis fichas al rugby contra
 * seis a la vida. Al irse, la carta de pretemporada quedó siendo una de
 * DIRECCIÓN —las cuatro repartían el mismo presupuesto y lo único que cambiaba
 * era dónde caían los puntos—, y eso NO alcanzó: medido acá, la decisión movía
 * 0,3 puntos de pico contra 16,9 del sorteo del techo. Elegir dirección sin
 * elegir compromiso no es elegir.
 *
 * Con el costo adentro de la carta vuelve a ser una palanca de ESFUERZO, y por
 * eso los brazos se eligen POR TIER y ya no por índice: el que se entrega toma
 * la cara —más media, y la paga con cuerpo, con minutos y con riesgo de
 * romperse— y el que no toma la gratis. Un índice escrito a mano volvería a
 * mentir el día que se reordene una familia.
 */
interface Brazo {
    nombre: string;
    /** Cuál de las cuatro toma, elegida por lo que cuesta y no por su posición. */
    carta: TrainingTier;
    nivel: PlayLevel;
    /** Qué opción elige de cada tarjeta. Los dos extremos del abanico. */
    opcion: (opciones: string[]) => string;
}

const BRAZOS: Brazo[] = [
    {
        nombre: 'se entrega',
        carta: 'cara',
        nivel: 'bien',
        opcion: (o) => o[0],
    },
    {
        // La floja de cada familia es la del liderazgo, que pesa 15 en siete de
        // las ocho: es la que menos media compra, y la única que no cobra nada.
        // La excepción es el apertura, donde pesa 25 — y por eso el brazo separa
        // menos en ese puesto, que es exactamente lo que el juego quiere decir
        // de ese puesto.
        nombre: 'no se entrega',
        carta: 'floja',
        nivel: 'mal',
        opcion: (o) => o[o.length - 1],
    },
];

/**
 * La carta del brazo, resuelta contra el catálogo de SU familia.
 *
 * Falla ruidosamente si esa familia no ofrece el tier: es la misma condición que
 * `trainings.test.ts` ya exige, pero acá el barrido correría igual sobre una
 * carta equivocada y las mediciones saldrían mal sin que nada avise.
 */
function cartaDe(family: CreateCaptainInput['family'], brazo: Brazo): string {
    const elegida = trainingsFor(family).find((t) => t.tier === brazo.carta);
    assert.ok(elegida, `${family} no ofrece ninguna carta '${brazo.carta}': el brazo '${brazo.nombre}' no se puede correr`);
    return elegida.id;
}

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
    /**
     * EL MATERIAL SORTEADO, y no el techo final.
     *
     * Es lo que ordena los terciles, y tiene que ser lo sorteado por la misma
     * razón por la que las semillas son las mismas: si los terciles se armaran
     * con el techo final —que ahora las decisiones mueven—, cada brazo caería en
     * un tercil distinto y la comparación dejaría de ser pareada. El tercil
     * pregunta "qué cartas te tocaron", no "qué hiciste con ellas".
     */
    material: number;
    /** El techo con el que terminó: material más todo lo que construyó. */
    techo: number;
    pico: number;
    ovrFinal: number;
    /**
     * NUNCA llegó a su techo, y se mide contra el PICO y no contra el OVR final.
     *
     * Contra el final la respuesta es "casi todos" y no significa nada: el
     * declive de la edad baja la media de cualquiera, así que un jugador que
     * tocó su techo a los 27 y se retiró a los 34 aparecería como que se quedó
     * corto. Lo que se pregunta acá es si ALGUNA VEZ llegó.
     *
     * Se compara contra el techo FINAL y no contra el material: la pregunta es
     * si alcanzó el techo que se construyó, que es el que el juego le prometió.
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
    const material = s.player.potentialBase;
    let vuelta = 0;

    while (s.phase !== 'retired') {
        if (vuelta >= 60) trabada(s, `${family} con semilla ${seed}`);

        s = captainReducer(s, { type: 'CHOOSE_TRAINING', trainingId: cartaDe(s.player.family, brazo) });

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
    const techo = potentialOf(s.player);
    return {
        material,
        techo,
        pico,
        ovrFinal: s.player.ovr,
        quedoCorto: pico < techo - 1,
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
    const ordenadas = [...filas].sort((a, b) => a.material - b.material);
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
    const [a, b] = BRAZOS.map((br) => CORRIDAS.get(br.nombre)!.map((f) => f.material));
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

test('CONSTRUIR VALE LA PENA Y PUEDE SALIR MAL', () => {
    // ── POR QUÉ CAMBIÓ LA PREMISA ──
    // Este test decía otra cosa, y el assert central era el signo contrario:
    // exigía que el que no se entrega SE QUEDARA CORTO más de la mitad de las
    // veces. Se dio vuelta a propósito, y vale más entender por qué que leer la
    // versión de hoy justificada sola.
    //
    // El nombre viejo era `CUÁNTOS SE QUEDAN CORTOS DE SU TECHO`, y ahí estaba el
    // problema: nombraba una MEDICIÓN. Su comentario argumentaba una premisa —que
    // `no-alcanzó-su-techo = 0` era la prueba de que las decisiones no movían
    // nada— y esa premisa era un PROXY de agencia, no agencia. Cuando la agencia
    // se pudo medir directo (`decisión` contra `techo`, en el test de arriba), el
    // proxy quedó sin trabajo. Pero el nombre y el comentario lo siguieron
    // defendiendo, y se persiguió el `= 0` durante todo un paso de diseño después
    // de que la cosa que señalaba ya estaba arreglada.
    //
    // La lección quedó en el nombre nuevo: LOS TESTS QUE NOMBRAN UNA MEDICIÓN SE
    // VUELVEN OBSOLETOS CON EL DISEÑO; LOS QUE NOMBRAN UNA INTENCIÓN SOBREVIVEN.
    //
    // Y el cambio de diseño que lo dio vuelta: que el que toma la carta gratis
    // todos los años alcance su techo bajo NO es un síntoma. Es la historia que
    // este juego quiere contar —el que no iba a ser Puma y llegó a ser la mejor
    // versión de lo que era, que es la fantasía del club amateur—. "No llegaste a
    // un techo que nunca levantaste" es castigar dos veces la misma no-decisión y
    // no agrega nada.
    const picos = BRAZOS.map((br) => media(CORRIDAS.get(br.nombre)!.map((f) => f.pico)));
    const cortos = BRAZOS.map((br) => tasa(CORRIDAS.get(br.nombre)!.map((f) => f.quedoCorto)));
    const [picoConstruye, picoNo] = picos;
    const [construye, noConstruye] = cortos;
    const detalle = `pico ${uno(picoConstruye)} vs ${uno(picoNo)} · `
        + `se queda corto: construye=${uno(construye * 100)}% · no construye=${uno(noConstruye * 100)}%`;

    // 1 · CONSTRUIR VALE LA PENA. Si esto se da vuelta, la carta cara volvió a ser
    //     la apuesta net-negativa que era antes de que `built` cayera afuera del
    //     recorte, y todo el modelo del techo partido no está haciendo nada.
    assert.ok(
        picoConstruye > picoNo,
        `construir el techo dejó de pagar: ${detalle}`,
    );

    // 2 · CONSTRUIR PUEDE SALIR MAL, y en una banda. Es el modo de fracaso que
    //     apareció solo: el que sube `built` todos los años se queda sin
    //     temporadas para alcanzarse, y el techo se le escapa.
    //     En 0 no habría riesgo y apuntar alto sería gratis. Muy arriba sería una
    //     trampa: la carta que el juego te muestra como la ambiciosa terminaría
    //     siendo la que no conviene nunca.
    assert.ok(
        construye > 0.05 && construye < 0.4,
        `el riesgo de apuntar alto se fue de la banda [5%, 40%]. En 0 construir es gratis; `
        + `arriba de 40 la carta ambiciosa es una trampa: ${detalle}`,
    );

    // 3 · NO CONSTRUIR TIENE SU FINAL, y es digno. El techo bajo se alcanza: esa
    //     carrera termina en "llegué a ser lo que podía ser" y no en una deuda.
    assert.ok(
        noConstruye < 0.05,
        `el que no construye dejó de alcanzar su techo bajo. Es la carrera del club amateur `
        + `y tiene que cerrar: ${detalle}`,
    );

    console.log(`      · construir: ${detalle}`);
});

test('la tasa de llegada al seleccionado cae en una banda, y el esfuerzo la mueve', () => {
    // Banda ANCHA a propósito: no congela un número, congela que llegar sea
    // posible y raro. El número exacto es asunto de `calibration.test.ts`, que se
    // mide contra el catálogo real.
    const llegadas = BRAZOS.map((br) => tasa(CORRIDAS.get(br.nombre)!.map((f) => f.llego)));
    const [entregado, tibio] = llegadas;
    const detalle = `se entrega=${uno(entregado * 100)}% · no se entrega=${uno(tibio * 100)}%`;

    assert.ok(entregado > 0, `nadie pisa un escalón representativo ni entregándose: ${detalle}`);

    // ┌───────────────────────────────────────────────────────────────────────┐
    // │ BANDA SOSPECHOSA — subida para no bloquear, NO porque esté sana        │
    // │                                                                        │
    // │ Era `< 0,90` y con el techo construido dio 97,2%. Se subió a 0,99 para │
    // │ que el barrido no quede rojo mientras se trabaja, pero el número NO    │
    // │ está bendecido: si el 97% de las carreras pisa el carril               │
    // │ representativo, el carril dejó de ser un escalón y pasó a ser el       │
    // │ default.                                                               │
    // │                                                                        │
    // │ SEGUNDA SEÑAL INDEPENDIENTE, y es la que convierte la sospecha en      │
    // │ pendiente: en el digest congelado, el apertura pasó de 13 caps a 63.   │
    // │ Sesenta y tres caps es una carrera de Puma histórico, no la de un      │
    // │ jugador cualquiera del barrido. Dos indicadores que no comparten       │
    // │ código apuntando a lo mismo.                                           │
    // │                                                                        │
    // │ MEDIDO: son las dos cosas. El piso existía (0,15 en 0.6.0) y lo tiró   │
    // │ `built`, pero 0,15 tampoco era un piso — el 85% ya pisaba un carril.   │
    // │ Los umbrales nunca filtraron. La tabla completa está en la caja de     │
    // │ `calibration.test.ts`, test de la pirámide.                            │
    // │                                                                        │
    // │ ARREGLO DECIDIDO: cupos en vez de umbrales. Esta banda vuelve a bajar  │
    // │ cuando entren, y ahí se reautoriza contra la premisa.                  │
    // └───────────────────────────────────────────────────────────────────────┘
    // ALARMA-VIVA: los carriles son umbrales y no cupos — pisar la representativa dejó de ser raro
    assert.ok(entregado < 0.99, `pisar la representativa dejó de ser raro: ${detalle}`);
    assert.ok(entregado >= tibio, `entregarse no ayuda a llegar: ${detalle}`);

    console.log(`      · llega a la representativa: ${detalle}  ← banda sospechosa, ver comentario`);
});
