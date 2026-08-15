// EL CAPITÁN — LA TABLA DE PAGOS DE LOS SESENTA Y CINCO.
//
// Toda la magnitud del catálogo está acá. Los sesenta y cinco minijuegos
// declaran TRES cosas —cuánto pesa la jugada, qué te puede pasar si sale mal, y
// dónde se cobra el premio— y esta tabla las convierte en `MomentDeltas`.
//
// ── Por qué existe este archivo ──
// Está pedido por escrito desde antes de que hiciera falta. `moment-defs/index.ts`
// lo dejó dicho cuando los Momentos eran cinco:
//
//   «La MECÁNICA no depende de la curva de crecimiento. La MAGNITUD sí. Los
//    deltas van todos juntos en UNA TABLA, en un solo lugar, y se ajustan de un
//    movimiento cuando la curva esté quieta. Tuneados uno por uno ahora, se
//    tunean de nuevo nueve veces.»
//
// Con sesenta y cinco no se tunean nueve veces: se tunean sesenta y cinco. Esta
// tabla es la diferencia entre recalibrar el juego en un archivo o en sesenta y
// cinco, y por eso ningún spec del catálogo escribe un número de premio.
//
// ── De dónde salen los números ──
// De los cinco Momentos escritos a mano, que son el único dato calibrado que
// hay. Los Palos —la patada que decide, la jugada más cara del juego— paga 3,5
// de Cartel y 2,5 de Pertenencia, y cuesta 2,5 al errarla. Ese es el escalón
// `grande`, y los otros dos bajan desde ahí. El Tackle paga `statBoost: 2`, y ese
// es el escalón `media` de la planilla.
//
// O sea: la tabla NO inventa una economía nueva. Ancla los sesenta y cinco a lo
// que el juego ya pagaba, que es la única forma de que entren sin recalibrar el
// resto.

import type { MomentDeltas } from '../../types/moment-def.ts';
import type { MinigameGloria, MinigameGrade, MinigameRisk, MinigameStake } from '../../types/minigame.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · EL PREMIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cartel por nota y por peso de la jugada.
 *
 * PARÁMETRO LIBRE (CLAUDE.md §1.9): el escalón `grande/clavado` está anclado a
 * Los Palos y los otros ocho se eligieron para que la escala sea legible —cada
 * escalón vale grosso modo la mitad del de arriba—. Se discuten.
 *
 * El `tibio` paga casi nada Y NO CASTIGA, a propósito: es la jugada que salió a
 * medias, que en rugby es la mayoría de las jugadas. Si castigara, el jugador
 * aprendería a no intentar, y un juego donde la jugada promedio te hace daño
 * enseña a jugar mal.
 */
const FAME: Record<MinigameStake, Record<MinigameGrade, number>> = {
    grande: { clavado: 3.5, logrado: 2.2, tibio: 0.3, errado: -2.5 },
    media: { clavado: 2.2, logrado: 1.4, tibio: 0.2, errado: -1.5 },
    chica: { clavado: 1.3, logrado: 0.8, tibio: 0.1, errado: -0.8 },
};

/**
 * Pertenencia por nota y por peso.
 *
 * Paga menos que el Cartel y castiga MUCHO menos, y la asimetría es de diseño:
 * el Cartel es lo que dicen de vos afuera y se mueve con cada tarde; la
 * Pertenencia es lo que el club siente, y un club no te quiere menos por una
 * patada errada. Se pierde por irse, no por fallar.
 */
const BELONGING: Record<MinigameStake, Record<MinigameGrade, number>> = {
    grande: { clavado: 2.5, logrado: 1.5, tibio: 0, errado: -1 },
    media: { clavado: 1.5, logrado: 1, tibio: 0, errado: -0.6 },
    chica: { clavado: 0.9, logrado: 0.6, tibio: 0, errado: -0.3 },
};

/**
 * Empuje a la planilla, y SOLO para los que cobran en gloria ajena.
 *
 * Es la regla del `statBoost` de `moment-defs/index.ts`, aplicada por la tabla
 * en vez de por la buena voluntad del que escribe el minijuego sesenta y cinco:
 * si el premio de la jugada YA ES la métrica que la planilla del puesto cuenta
 * —un line-out ganado por el segunda, un try del wing— sumarle `statBoost`
 * cobraría dos veces la misma jugada y la calibración del puesto mentiría sin
 * que nada falle.
 *
 * Nunca es negativo: una jugada mala no borra la planilla de la temporada, y un
 * `statBoost` negativo se restaría de partidos que el jugador sí jugó bien.
 */
const STAT_BOOST: Record<MinigameStake, Record<MinigameGrade, number>> = {
    grande: { clavado: 3, logrado: 2, tibio: 0, errado: 0 },
    media: { clavado: 2, logrado: 1, tibio: 0, errado: 0 },
    chica: { clavado: 1, logrado: 1, tibio: 0, errado: 0 },
};

// ── EL CARRIL QUE NO ESTÁ, Y POR QUÉ ───────────────────────────────────────
//
//   NINGÚN MINIJUEGO DEL CATÁLOGO PAGA `playingTime`.
//
// Estuvo escrito y se sacó MEDIDO, no por prolijidad. La primera versión se lo
// daba a `grande/clavado` con el argumento de que reservarlo para la nota máxima
// impedía que el compuesto se disparara. Estaba mal por dos motivos, y el
// segundo es el que importa:
//
//   1. Un simulado que juega bien CLAVA casi siempre —es lo que significa jugar
//      bien—, así que "solo con la nota máxima" no era un filtro sino el caso
//      normal. Medido: 0,2 escalones por temporada, todas las temporadas.
//   2. Es el único premio que SE COMPONE. Más minutos es mejor planilla, mejor
//      planilla es más OVR, más OVR es más minutos. Con eso adentro, la tasa de
//      pibes que llegan a M20 o más se fue de la banda [10%, 35%] a 84%: el
//      juego dejó de tener una pirámide.
//
// Y hay un motivo de diseño además del medido: el reparto de tiempo se DERIVA de
// `ovr − clubRating` (`playingTimeOf`). Un minijuego que lo empuje directo es
// una segunda fuente de verdad sobre cuánto jugás. Si algún día una jugada tiene
// que abrirte la puerta del equipo, que lo haga por donde el motor ya mira.

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LO QUE CUESTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El riesgo, por carril y por nota. SE COBRA AUNQUE LA JUGADA SALGA BIEN.
 *
 * ── La corrección más cara de todo el catálogo ──
 * La primera versión cobraba cuerpo solo de `tibio` para abajo, con la idea
 * razonable de que clavar una jugada no te rompe. Medida contra los cinco
 * Momentos escritos a mano, el desgaste de un jugador que juega bien caía de
 * 1,36 por temporada a 0,11. O sea: prácticamente cero. Un jugador que jugaba
 * bien llegaba entero a los treinta y cinco, y con el cuerpo entero se juegan
 * más minutos, se envejece más tarde y se llega más seguido al seleccionado.
 * Fue la causa principal de que la pirámide se aplanara, y no se veía en ninguna
 * tabla de premios porque no es un premio: es un castigo que faltaba.
 *
 * Lo que estaba mal no era el balance sino el rugby: UN CHOQUE CUESTA EL CUERPO
 * LO HAGAS BIEN O MAL. El que clava un tackle también se levanta golpeado; el
 * que sostiene un maul los ochenta minutos termina sin piernas. Los cinco
 * Momentos viejos ya lo decían —La Banda cobra 3,5 de cuerpo al nivel `bien`— y
 * la tabla lo había perdido al separar premio y castigo en dos ejes que no se
 * hablaban.
 *
 * Por eso `ninguno` sigue cobrando cero: es el eje que hace significativo al
 * resto. Los Palos no cuestan cuerpo, y que un Momento no lastime es lo que hace
 * que los que lastiman quieran decir algo.
 *
 * ── `cabeza` no es un `cuerpo` más caro ──
 * `headDamage` sube y NO BAJA NUNCA, y una unidad son doce puntos de cien
 * (`HEAD_PER_HIA`). O sea: dos golpes mal jugados en una carrera y el jugador
 * arrastra un cuarto del contador hasta el retiro. Por eso el carril lo llevan
 * únicamente los minijuegos que en el rugby real terminan en un HIA —el choque
 * contra el 8 lanzado, el cruce en el canal del 12— y por eso el HIA en sí
 * aparece solo en `errado`. Un protocolo de conmoción no se banaliza
 * (CLAUDE.md §5).
 */
const RISK: Record<MinigameRisk, Record<MinigameGrade, MomentDeltas>> = {
    ninguno: { clavado: {}, logrado: {}, tibio: {}, errado: {} },
    cuerpo: {
        clavado: { bodyDamage: 2.5 },
        logrado: { bodyDamage: 2.5 },
        tibio: { bodyDamage: 4 },
        errado: { bodyDamage: 6 },
    },
    cabeza: {
        clavado: { bodyDamage: 3.5 },
        logrado: { bodyDamage: 3.5 },
        tibio: { bodyDamage: 5 },
        errado: { bodyDamage: 6, headDamage: 1 },
    },
    sancion: {
        clavado: { bodyDamage: 1.5 },
        logrado: { bodyDamage: 1.5 },
        tibio: { bodyDamage: 2.5 },
        // Un partido, que es la amarilla. La roja vive en el bunker y se llega
        // por el tackle: un minijuego del catálogo no reparte rojas.
        errado: { bodyDamage: 3, sanction: 1, fame: -1 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LA CONVERSIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * De (peso, riesgo, dónde se cobra, nota) a lo que le pasa a la temporada.
 *
 * Es la ÚNICA función que arma un `MomentDeltas` para los sesenta y cinco. Que
 * esté sola es lo que hace que un minijuego no pueda prometer una cosa y hacer
 * otra —la misma razón por la que `applyMomentDeltas` es el único traductor a
 * estado— y lo que hace que recalibrar el juego sea mover nueve números de acá
 * arriba.
 *
 * Los campos en cero NO se escriben: `applyMomentDeltas` los saltea igual con su
 * `if (deltas.x)`, pero un objeto lleno de ceros ensucia el guardado y hace
 * ilegible cualquier diff de un test que compare deltas.
 */
export function payFor(
    stake: MinigameStake,
    risk: MinigameRisk,
    gloria: MinigameGloria,
    grade: MinigameGrade,
): MomentDeltas {
    const deltas: MomentDeltas = {};

    const fame = FAME[stake][grade];
    const belonging = BELONGING[stake][grade];
    const statBoost = gloria === 'ajena' ? STAT_BOOST[stake][grade] : 0;

    if (fame) deltas.fame = fame;
    if (belonging) deltas.belonging = belonging;
    if (statBoost) deltas.statBoost = statBoost;

    // El riesgo se SUMA sobre el premio, no lo reemplaza. Un `errado` con
    // sanción cobra el Cartel negativo de la tabla Y el punto extra del carril:
    // errar una jugada de riesgo es peor que errar una que no lo tiene, que es
    // lo que el carril existe para decir.
    const castigo = RISK[risk][grade];
    if (castigo.bodyDamage) deltas.bodyDamage = (deltas.bodyDamage ?? 0) + castigo.bodyDamage;
    if (castigo.headDamage) deltas.headDamage = (deltas.headDamage ?? 0) + castigo.headDamage;
    if (castigo.sanction) deltas.sanction = (deltas.sanction ?? 0) + castigo.sanction;
    if (castigo.fame) deltas.fame = Math.round(((deltas.fame ?? 0) + castigo.fame) * 10) / 10;

    return deltas;
}
