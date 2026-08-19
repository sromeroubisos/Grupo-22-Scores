// EL BARRIDO DE LA MAYOR, INSTRUMENTADO.
//
// Esto NO calibra nada. Mide.
//
// El dato que lo motiva: con la receta del digest, solo el 4% de las carreras
// llega a la selección (2/30 en pilar, 1/30 en wing, 1/30 en apertura). Parece
// bajo. La pregunta es POR QUÉ es bajo, y hay dos respuestas posibles que piden
// arreglos opuestos:
//
//   · UN UMBRAL MAL PUESTO — la barra está tres puntos más arriba de donde
//     debería. Se corrige moviendo un número.
//   · UN PRODUCTO DE COMPUERTAS — pide media ≥ X y cartel ≥ Y y club de cierto
//     nivel y haber sobrevivido hasta cierta edad, y cada una pasa el 50%: te da
//     6% sin que ninguna esté mal sola. Se corrige haciendo las compuertas
//     SECUENCIALES en vez de simultáneas, y mover umbrales no alcanza.
//
// Este archivo produce la tabla con la que se decide cuál de las dos es. Por eso
// no tiene bandas de calibración: si las tuviera, el día que alguien mueva un
// umbral a propósito este test se pondría en rojo y taparía justo la medición
// que hace falta leer. Lo único que se afirma es la CONTABILIDAD —que toda
// carrera quede clasificada exactamente una vez— y que el barrido haya
// producido datos.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput, SquadTrack } from '../../types/captain.ts';
import { trainingsFor } from '../../data/trainings.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type { PositionFamilyId } from '../../types/player.ts';
import { getMomentDef, isContractKind } from '../moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../moments.ts';
import { SQUAD_TRACKS } from '../../types/captain.ts';
import { ALL_FAMILIES } from '../../data/positions.ts';
import { hasUnion } from '../../data/catalogs.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
 import { playTournament } from '../../state/captain-autoplay.ts';
import { getPendingEvent } from '../event-selector.ts';
import { selectionBarOf, selectionValue } from '../national-team.ts';
import { targetUnion } from '../eligibility.ts';
import { resolveClub } from '../promotion.ts';
import { sportingBandOf } from '../../data/catalogs.ts';
import { potentialOf } from '../ovr.ts';


/**
 * Sesenta carreras por familia: cuatrocientas ochenta en total.
 *
 * Se subió de treinta a sesenta para el ticket de la tercera línea: con treinta,
 * un puesto que llega el 7% de las veces puede dar 0 por casualidad y no se
 * puede distinguir "estructuralmente cerrado" de "muestra chica".
 */
const POR_FAMILIA = 60;

/** La misma carta del jugador normal que usa `calibration.test.ts`. */
const CARTA = 0;

/**
 * La escasez de cada puesto, para poder decir cuánto es «todo a favor».
 *
 * Se declara acá y no se importa del motor A PROPÓSITO: si el instrumento leyera
 * la misma constante que la cosa que mide, un cambio de escasez movería las dos
 * puntas a la vez y la tabla seguiría dando lo mismo sin que nada avise. Es el
 * mismo motivo por el que el jugador de referencia se escribe en cada barrido.
 */
const SCARCITY_POR_FAMILIA: Record<PositionFamilyId, number> = {
    'primera-linea': 2,
    hooker: 2,
    'segunda-linea': 1,
    'tercera-linea': 0,
    'medio-scrum': 1,
    apertura: 1,
    centro: 0,
    'wing-fullback': 0,
};

/**
 * El mismo jugador de referencia que `calibration.test.ts`: juega bien y no
 * regala nada.
 *
 * ── ESTE BARRIDO ESTUVO CIEGO Y NADIE SE ENTERÓ ────────────────────────────
 * Hasta la 0.22.0 esta función era un `switch` sobre los cinco Momentos escritos
 * a mano, con `default:` devolviendo un tackle. Cuando entraron los Momentos por
 * dorsal (0.17.0) y el de academia, el `default` empezó a mandarle una mano de
 * tackle a un minijuego, el reducer la rechazaba y LA CARRERA QUEDABA TRABADA EN
 * LA PRIMERA TEMPORADA. El barrido seguía en verde —lo único que afirma es la
 * contabilidad— mientras la tabla decía que el 100% de las carreras se quedaba
 * en el club a los dieciséis años.
 *
 * Es el §1.5 del CLAUDE de captain por cuarta vez, y esta vez le tocó al
 * instrumento: exactamente el mismo modo de fallo que `calibration.test.ts` ya
 * había arreglado, en el archivo de al lado, con el arreglo escrito en su
 * comentario. Por eso ahora la mano se pide por identidad (`playAt(…, 'bien')`),
 * el `default` queda en `never` y el bucle TIRA en vez de seguir.
 */
function manoDeReferencia(state: CaptainState): MomentOutcome {
    const pendiente = state.pendingMoment!;

    if (isContractKind(pendiente.kind)) {
        return getMomentDef(pendiente.kind)!.playAt(pendiente.setup!, 'bien', 0.5);
    }

    switch (pendiente.kind) {
        case 'bunker':
            return { kind: 'bunker' };
        case 'tackle': {
            const zones = tackleZones(state.player, state.damage.cuerpo, pendiente.pressure);
            const { at, zone } = tacklePlayAt(zones, 'bien', 0.5);
            return { kind: 'tackle', zone, at };
        }
        default:
            return manoImposible(pendiente.kind);
    }
}

function manoImposible(kind: never): never {
    throw new Error(`El Momento pre-contrato '${String(kind)}' no tiene mano de referencia.`);
}

/** Un bucle trabado tira con fase y temporada, en vez de cortar en silencio. */
function trabada(state: CaptainState, donde: string): never {
    throw new Error(
        `${donde}: la carrera quedó trabada en la fase '${state.phase}' `
        + `(temporada ${state.season}, jugada pendiente: ${state.pendingMoment?.kind ?? 'ninguna'}).`,
    );
}

// Acá vivía `EMPUJE_POR_FICHA_GIMNASIO`, el empujón que la ficha del PlaDAR le
// daba a la media con la que te MIRAN. Se fue con las fichas en 0.7.0, y con él
// la única palanca que el jugador tenía sobre esta escalera: hoy te miran por la
// media pelada. Vuelve cuando entren las convocatorias jugables, y entonces este
// barrido tiene que volver a distinguir el techo del techo-con-empujón.

// ── QUÉ SE MIDE DESDE LA 0.22.0, Y POR QUÉ CAMBIÓ ──────────────────────────
//
// Este barrido comparaba `player.ovr` contra `thresholdFor('nacional')`, que era
// un offset sobre la camada. La mayor ya no se decide así: se decide con el
// VALOR DE SELECCIÓN —media cruda más forma, club, escasez y proyección— contra
// una VARA por reputación de la unión (`engine/national-team.ts`).
//
// Así que las dos puntas de la medición se re-apuntaron, y eso NO es cosmético:
// el valor de selección le suma hasta 18 puntos al pibe que está lejos de su
// techo, o sea que la distancia a la barra de un jugador de 20 no se parece en
// nada a su media. Medir la media contra la vara nueva habría dado una tabla
// prolija que contesta una pregunta que ya nadie hace (§1.7 del CLAUDE de
// captain: el instrumento contesta la pregunta que tiene escrita).
//
// LA VARA DE REFERENCIA ES LA PROFESIONAL. El recargo del amateur es una
// compuerta propia y bastante más alta; meterlo acá mezclaría "no llegó por
// nivel" con "no llegó porque nunca firmó", que son dos historias distintas y la
// segunda ya la cuenta `calibration.test.ts`.

/** Por qué esta carrera no llegó a la mayor. */
type Compuerta =
    /** Llegó. */
    | 'llego'
    /** No hay federación en su país: no existe la escalera. */
    | 'sin-union'
    /** Ni con el techo sorteado al nacer habría cruzado. Estaba decidido antes de jugar. */
    | 'techo-corto'
    /** Tenía el techo, pero su valor de selección nunca llegó a la vara. */
    | 'no-alcanzo-su-techo'
    /**
     * CRUZÓ LA VARA Y NO ENTRÓ. La compuerta nueva, y la que hay que mirar
     * primero: desde la 0.22.0 la puerta tiene una tirada (`ENTRY_BASE` más
     * pendiente por margen), así que cruzar dejó de alcanzar. Si esta fila es
     * gorda, el que sobra no es el umbral sino el dado.
     */
    | 'no-pasó-la-puerta';

interface Carrera {
    family: PositionFamilyId;
    compuerta: Compuerta;
    /**
     * LA UNIÓN QUE ESTA CARRERA TERMINÓ REPRESENTANDO, que no es siempre la del
     * documento: la tarjeta de la otra bandera te nacionaliza, y desde la 0.33.0
     * eso mueve el estado de verdad.
     */
    union: string;
    /**
     * La vara que le pide la mayor a un profesional DE SU UNIÓN — de la suya, no
     * de la argentina.
     *
     * Era `selectionBarOf('ar')` para todas, y estuvo bien exactamente mientras
     * nadie pudo cambiar de bandera. Al conectarse la tarjeta, el italiano
     * nacionalizado quedaba medido contra la vara argentina y `nadie llega a la
     * mayor sin haber cruzado la vara` se puso en rojo acusando al motor de dejar
     * entrar gente por debajo — cuando el que estaba comparando contra la vara
     * equivocada era este archivo.
     */
    umbral: number;
    /** El techo sorteado al nacer. */
    techo: number;
    /** El VALOR DE SELECCIÓN más alto que tuvo nunca. No es su media. */
    pico: number;
    mejorTrack: SquadTrack;
    temporadas: number;
}

/**
 * Juega una carrera y la clasifica.
 *
 * El pico se mide JUSTO ANTES de simular, que es el instante en que
 * `simulate-season` decide el escalón: la media de la trayectoria es la de
 * DESPUÉS de envejecer, y usarla correría la medición una temporada.
 */
function jugar(seed: number, family: PositionFamilyId): Carrera {
    const input: CreateCaptainInput = { name: 'X', surname: 'Y', family, countryCode: 'ar' };
    let s = createInitialCaptain(input, seed);

    const techo = potentialOf(s.player);
    let pico = 0;
    let vuelta = 0;

    while (s.phase !== 'retired' && vuelta < 60) {
        s = captainReducer(s, { type: 'CHOOSE_TRAINING', trainingId: trainingsFor(s.player.family)[CARTA].id });

        let guarda = 0;
        while (s.phase === 'moment') {
            if (guarda >= 4) trabada(s, `${family} con semilla ${seed}`);
            s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: manoDeReferencia(s) });
            guarda += 1;
        }

        // Acá está parado el jugador cuando el seleccionador lo mira, y con TODO
        // lo que el seleccionador mira: la media, la forma del año pasado, dónde
        // juega, la escasez de su puesto y lo que le falta para su techo. Es el
        // mismo instante que elige `simulate-season` para resolver la
        // convocatoria, así que la foto es la que el motor usa de verdad.
        const ultima = s.history[s.history.length - 1];
        const club = s.player.clubId ? resolveClub(s.divisions, s.player.clubId) : null;
        pico = Math.max(pico, selectionValue(s.player, {
            lastRating: ultima?.rating ?? null,
            clubBand: club ? sportingBandOf(club) : null,
            amateur: s.stage === 'amateur',
            potential: potentialOf(s.player),
        }).total);

        s = playTournament(captainReducer(s, { type: 'ADVANCE' }));
        // Bucle y no `if`: la temporada trae la tarjeta del año Y la del
        // mercado, que desde la 0.21.0 corre después en vez de reemplazarla.
        let decisiones = 0;
        while (s.phase === 'event' && decisiones < 4) {
            const evento = getPendingEvent(s)!;
            s = captainReducer(s, { type: 'CHOOSE', optionId: evento.options[vuelta % evento.options.length].id });
            decisiones += 1;
        }
        vuelta += 1;
    }

    const mejorTrack = s.national.bestTrack;

    // LA VARA SE RESUELVE AL FINAL y no al principio, porque la unión puede haber
    // cambiado en el medio. `targetUnion` es la misma función que lee la
    // convocatoria, así que el instrumento y el motor preguntan lo mismo.
    const union = targetUnion(s.national.eligibility) ?? s.player.countryCode;
    const umbral = selectionBarOf(union, false);

    // El ORDEN de estas ramas importa y se paga caro si se equivoca: el techo es
    // una MEDIA y la vara está en escala de VALOR, que lleva los bonos adentro.
    // Comparándolos derecho, «techo < vara» es cierto para casi todo el mundo y
    // se traga las otras dos compuertas — que es lo que pasó la primera vez que
    // se escribió esto. Así que primero se pregunta por lo que se midió de
    // verdad (el pico) y recién después por lo que estaba escrito al nacer.
    //
    // `TODO_A_FAVOR` es lo máximo que los modificadores pueden sumarle a alguien
    // parado en su techo: forma perfecta (+3), club de élite (+2) y la escasez de
    // su puesto. La proyección no entra porque en el techo vale cero — es
    // proporcional a lo que falta.
    const TODO_A_FAVOR = 3 + 2 + SCARCITY_POR_FAMILIA[family];
    const compuerta: Compuerta = !hasUnion(s.player.countryCode) ? 'sin-union'
        : mejorTrack === 'nacional' ? 'llego'
            : pico >= umbral ? 'no-pasó-la-puerta'
                : techo + TODO_A_FAVOR < umbral ? 'techo-corto'
                    : 'no-alcanzo-su-techo';

    return { family, compuerta, union, umbral, techo, pico, mejorTrack, temporadas: s.history.length };
}

const MUESTRA: Carrera[] = (() => {
    const out: Carrera[] = [];
    for (const family of ALL_FAMILIES) {
        for (let i = 0; i < POR_FAMILIA; i += 1) out.push(jugar(4100 + i * 13, family));
    }
    return out;
})();

const pct = (n: number, total: number): string => `${((n / total) * 100).toFixed(1)}%`;

// ═══════════════════════════════════════════════════════════════════════════
//  La contabilidad — lo único que se afirma
// ═══════════════════════════════════════════════════════════════════════════

test('toda carrera queda clasificada exactamente una vez', () => {
    assert.equal(MUESTRA.length, ALL_FAMILIES.length * POR_FAMILIA);

    const COMPUERTAS: Compuerta[] = ['llego', 'sin-union', 'techo-corto', 'no-alcanzo-su-techo', 'no-pasó-la-puerta'];
    const suma = COMPUERTAS.reduce((acc, c) => acc + MUESTRA.filter((r) => r.compuerta === c).length, 0);
    assert.equal(suma, MUESTRA.length, 'hay carreras sin clasificar o clasificadas dos veces');

    // Y la clasificación tiene que coincidir con el estado: nadie marcado como
    // "llegó" sin haber pisado la mayor, y al revés.
    for (const r of MUESTRA) {
        assert.equal(
            r.compuerta === 'llego',
            r.mejorTrack === 'nacional',
            `${r.family}: la clasificación no coincide con el mejor escalón (${r.mejorTrack})`,
        );
    }
});

test('nadie llega a la mayor sin haber cruzado la vara', () => {
    // ── POR QUÉ CAMBIÓ LA PREMISA (§1.4) ────────────────────────────────────
    // Este test afirmaba las DOS direcciones: el que llegó cruzó, y el que no
    // llegó no cruzó. La segunda dejó de ser cierta en la 0.22.0 y no por un
    // error de calibración sino por diseño: la puerta de la mayor tiene una
    // TIRADA (`ENTRY_BASE` más pendiente por margen más Cartel), así que cruzar
    // la vara dejó de alcanzar. Afirmar la vuelta ahora sería exigir que el dado
    // no exista.
    //
    // Se queda la ida, que es la que verifica que la compuerta medida ES la
    // compuerta real: si esto falla, la tabla de abajo mide otra cosa que la que
    // dice. La vuelta pasó a ser una MEDICIÓN —la fila `no-pasó-la-puerta`—, que
    // es más útil: dice cuánta gente el dado dejó afuera.
    //
    // La tolerancia es el alivio del año previo al Mundial (`WORLD_CUP_RELIEF`),
    // que es la única vía por la que se puede entrar por debajo de la vara de
    // referencia. El descuento del que cayó no cuenta: para caerse hay que haber
    // estado, o sea haberla cruzado entera antes.
    const ALIVIO_MUNDIAL = 2;
    for (const r of MUESTRA) {
        if (r.compuerta !== 'llego') continue;
        assert.ok(
            r.pico >= r.umbral - ALIVIO_MUNDIAL,
            `${r.family}: llegó con pico ${r.pico.toFixed(1)} y vara ${r.umbral.toFixed(1)}`,
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  La medición — la tabla que hay que leer
// ═══════════════════════════════════════════════════════════════════════════

test('BARRIDO: qué compuerta frena a cada carrera', () => {
    const total = MUESTRA.length;
    const lineas: string[] = [];

    lineas.push('');
    lineas.push(`═══ ${total} carreras (${POR_FAMILIA} por familia), reparto normal ═══`);
    lineas.push('');

    // ── 1 · El embudo de la escalera ────────────────────────────────────────
    // Los escalones son barras de media crecientes sobre el MISMO número, así
    // que este embudo es directamente la distribución de picos contra cinco
    // barras. Si cada escalón cortara a la mitad, sería el producto de
    // compuertas de la hipótesis; si el corte está concentrado en uno, es un
    // umbral.
    lineas.push('EMBUDO — hasta dónde llegó cada carrera');
    for (const track of SQUAD_TRACKS) {
        const n = MUESTRA.filter((r) => r.mejorTrack === track).length;
        const acumulado = MUESTRA.filter((r) => SQUAD_TRACKS.indexOf(r.mejorTrack) >= SQUAD_TRACKS.indexOf(track)).length;
        lineas.push(`  ${track.padEnd(9)} se quedó ahí: ${String(n).padStart(3)} (${pct(n, total).padStart(6)})   llegó al menos: ${String(acumulado).padStart(3)} (${pct(acumulado, total).padStart(6)})`);
    }

    // ── 2 · La compuerta que frenó ──────────────────────────────────────────
    lineas.push('');
    lineas.push('COMPUERTA — por qué no llegó a la mayor');
    for (const c of ['llego', 'sin-union', 'techo-corto', 'no-alcanzo-su-techo', 'no-pasó-la-puerta'] as Compuerta[]) {
        const n = MUESTRA.filter((r) => r.compuerta === c).length;
        lineas.push(`  ${c.padEnd(20)} ${String(n).padStart(3)} (${pct(n, total).padStart(6)})`);
    }

    // ── 3 · La distancia a la vara, con signo ───────────────────────────────
    // Positivo = le faltó; negativo = le sobró. Antes esta tabla sólo miraba a
    // los que no llegaron, porque en el modelo viejo cruzar la barra y llegar
    // eran la misma cosa. Ahora no: la puerta tiene una tirada, así que hay que
    // ver la distribución ENTERA para poder distinguir "la vara está mal puesta"
    // de "el dado corta demasiado".
    const distancias = MUESTRA
        .filter((r) => r.compuerta !== 'sin-union')
        .map((r) => r.umbral - r.pico)
        .sort((a, b) => a - b);
    const cuantil = (q: number): number => distancias[Math.min(distancias.length - 1, Math.floor(distancias.length * q))];

    lineas.push('');
    lineas.push('DISTANCIA A LA VARA — positivo faltó, negativo sobró');
    if (distancias.length > 0) {
        lineas.push(
            `  p10 ${cuantil(0.1).toFixed(1)}   p25 ${cuantil(0.25).toFixed(1)}`
            + `   mediana ${cuantil(0.5).toFixed(1)}   p75 ${cuantil(0.75).toFixed(1)}   p90 ${cuantil(0.9).toFixed(1)}`,
        );
    }

    // ── 4 · DÓNDE TENDRÍA QUE ESTAR LA VARA ─────────────────────────────────
    //
    // Acá vivía «CUÁNTA BANDA HARÍA FALTA», que preguntaba cuánto tendría que
    // poder ganarse un jugador si el techo fuera un RANGO en vez de un punto. Esa
    // pregunta era de un diseño que ya no existe —el techo es punto más `built`—
    // y su tabla quedó contestando algo que nadie pregunta (§1.4: cuando la
    // intención cambia, el test se da vuelta y se dice por qué).
    //
    // La pregunta de ahora es la del ANCLAJE. Las tablas de la vara vienen de
    // Carrera de Rugby, medidas contra una población con techos bastante más
    // bajos: `DEBUT_BY_REPUTATION` fija el nivel absoluto y la población de El
    // Capitán lo cruza entero. Esta tabla dice a qué altura hay que poner la vara
    // para que llegar a la mayor vuelva a ser raro, y de ahí sale el ancla.
    //
    // Es una ESTIMACIÓN y no una predicción: mueve la vara sobre los picos ya
    // medidos, sin volver a correr la carrera. La tirada de la puerta, la ventana
    // de edad y el plazo del `trial` recortan un poco más, así que la tasa real
    // queda por DEBAJO de la de esta columna. El número final se verifica
    // corriendo el barrido con la constante puesta.
    lineas.push('');
    lineas.push('DÓNDE TENDRÍA QUE ESTAR LA VARA — si se corriera N puntos');
    // LA VARA ARGENTINA, pedida por su nombre. Se leía de `MUESTRA[0].umbral`, o
    // sea de la posición 0 de una lista —§1.5— y encima ahora las varas no son
    // todas iguales: alcanzaba con que la primera carrera de la muestra hubiera
    // cambiado de bandera para que esta tabla entera se corriera sin avisar.
    const vigente = selectionBarOf('ar', false);
    for (const delta of [0, 4, 8, 12, 14, 16, 18, 20, 22]) {
        const cruzarian = MUESTRA.filter((r) => r.compuerta !== 'sin-union' && r.pico >= vigente + delta).length;
        const tasa = cruzarian / total;
        const marca = tasa >= 0.15 && tasa <= 0.35 ? '  ← cerca de la banda' : '';
        lineas.push(
            `  vara ${(vigente + delta).toFixed(1).padStart(5)} (+${String(delta).padStart(2)})`
            + `   cruzarían ${String(cruzarian).padStart(3)} (${pct(cruzarian, total).padStart(6)})${marca}`,
        );
    }

    // ── 5 · Por familia ─────────────────────────────────────────────────────
    // La barra no es la misma para todos: la escasez del puesto la baja hasta
    // dos puntos. Partir por familia dice si el número es parejo o si hay
    // puestos que directamente no entran.
    lineas.push('');
    lineas.push('POR FAMILIA — barra, pico medio y llegadas');
    for (const family of ALL_FAMILIES) {
        const sub = MUESTRA.filter((r) => r.family === family);
        const llegaron = sub.filter((r) => r.compuerta === 'llego').length;
        const picoMedio = sub.reduce((a, r) => a + r.pico, 0) / sub.length;
        const techoMedio = sub.reduce((a, r) => a + r.techo, 0) / sub.length;
        lineas.push(
            `  ${family.padEnd(14)} barra ${selectionBarOf('ar', false).toFixed(1).padStart(5)}   techo medio ${techoMedio.toFixed(1).padStart(5)}`
            + `   pico medio ${picoMedio.toFixed(1).padStart(5)}   llegaron ${String(llegaron).padStart(2)}/${sub.length}`,
        );
    }

    // ── 6 · Los que se cambiaron de bandera ─────────────────────────────────
    // Va escrito y no callado. La muestra se declara argentina, así que toda
    // carrera que termine representando a otra unión está midiendo contra otra
    // vara, y el lector tiene derecho a saber cuántas son antes de leer el resto
    // de la tabla. Si esta fila se pone gorda, el barrido dejó de ser un barrido
    // argentino y hay que decidir qué hacer con eso — no descubrirlo después.
    const cambiaron = MUESTRA.filter((r) => r.union !== 'ar');
    lineas.push('');
    lineas.push(`CAMBIARON DE BANDERA: ${cambiaron.length} de ${total} (${pct(cambiaron.length, total)})`);
    const porUnion = new Map<string, number>();
    for (const r of cambiaron) porUnion.set(r.union, (porUnion.get(r.union) ?? 0) + 1);
    // Ordenado por código y no por cantidad: un empate no puede cambiar de orden
    // entre corridas.
    for (const code of [...porUnion.keys()].sort()) {
        lineas.push(`  ${code}   ${String(porUnion.get(code)).padStart(3)}   vara ${selectionBarOf(code, false).toFixed(1)}`);
    }
    lineas.push('');

    console.log(lineas.join('\n'));

    // El barrido tiene que haber producido datos. Nada más: mover un umbral no
    // puede poner en rojo el test que existe para leer qué pasa cuando lo movés.
    // El barrido tiene que haber producido datos. Nada más, y ahora menos que
    // antes: la afirmación era «hubo al menos una carrera que no llegó», que es
    // una banda de calibración disfrazada de contabilidad — el día que la mayor
    // se abriera del todo, este test se pondría en rojo y taparía justo la
    // medición que hace falta leer.
    assert.ok(distancias.length > 0, 'el barrido no produjo una sola carrera con unión');
});

// ═══════════════════════════════════════════════════════════════════════════
//  El ticket de la tercera línea
// ═══════════════════════════════════════════════════════════════════════════

test('TICKET: la barra por familia contra la distribución de techos', () => {
    // El síntoma fue tercera línea 0 de 30, con la barra más alta (78,8) y el
    // techo medio más bajo. La pregunta es si es estructural —ningún ala ni
    // octavo llega NUNCA a Los Pumas, que sería un bug, porque en el rugby real
    // la tercera línea es de los grupos más capeados— o si es la muestra.
    //
    // Las dos piezas se miden por separado y acá se ponen una al lado de la otra:
    //
    //   BARRA    = 74 + reputación×1,6 − escasez del puesto. Varía dos puntos
    //              entre familias, y los tres puestos con escasez 0 comparten la
    //              barra más alta.
    //   TECHOS   = OVR base del puesto + campana(+14, 8). El OVR base sale de los
    //              pesos de la familia, y hoy los ocho arrancan en 52 o 53.
    //
    // Si los techos son iguales entre familias y la barra no, entonces la única
    // diferencia entre puestos es la escasez — y el acoplamiento que hace falta
    // es en la otra dirección: o la barra mira la distribución, o cada familia
    // necesita su propio camino.
    const lineas: string[] = ['', 'TICKET — barra contra techos, por familia', ''];

    let peorTasa = 1;
    let peorFamilia = '';

    for (const family of ALL_FAMILIES) {
        const sub = MUESTRA.filter((r) => r.family === family);
        const llegaron = sub.filter((r) => r.compuerta === 'llego').length;
        const tasa = llegaron / sub.length;
        const techoMedio = sub.reduce((a, r) => a + r.techo, 0) / sub.length;
        const techoMax = Math.max(...sub.map((r) => r.techo));
        const faltaMediana = [...sub.map((r) => r.umbral - r.pico)].sort((a, b) => a - b)[Math.floor(sub.length / 2)];

        if (tasa < peorTasa) { peorTasa = tasa; peorFamilia = family; }

        lineas.push(
            `  ${family.padEnd(14)} barra ${sub[0].umbral.toFixed(1).padStart(5)}`
            + `   techo medio ${techoMedio.toFixed(1).padStart(5)}   techo máx ${String(techoMax).padStart(3)}`
            + `   falta (mediana) ${faltaMediana.toFixed(1).padStart(5)}   llegaron ${String(llegaron).padStart(2)}/${sub.length}`,
        );
    }

    // El dato que separa "estructural" de "muestra chica".
    //
    // Se compara contra el techo pelado, que desde 0.7.0 ES la media con la que
    // te miran: el empujón del gimnasio se fue con las fichas. Cuando entren las
    // convocatorias, acá vuelve a hacer falta sumarles lo que aporten.
    lineas.push('');
    for (const family of ALL_FAMILIES) {
        const sub = MUESTRA.filter((r) => r.family === family);
        const mejorPosible = Math.max(...sub.map((r) => r.techo));
        if (mejorPosible < sub[0].umbral) {
            lineas.push(
                `  ⚠ ${family}: ni el mejor techo sorteado (${mejorPosible.toFixed(1)}) alcanza la barra `
                + `(${sub[0].umbral.toFixed(1)}) — el puesto está CERRADO, no es raro`,
            );
        }
    }
    lineas.push(`  peor familia: ${peorFamilia} (${(peorTasa * 100).toFixed(1)}%)`);
    lineas.push('');

    console.log(lineas.join('\n'));

    // Sin banda de calibración, por el mismo motivo que el barrido: este test
    // existe para LEER el acoplamiento, no para congelarlo.
    assert.equal(MUESTRA.length, ALL_FAMILIES.length * POR_FAMILIA);
});
