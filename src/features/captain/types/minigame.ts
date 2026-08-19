// EL CAPITÁN — el contrato de un MINIJUEGO por dorsal.
//
// Los cinco Momentos escritos a mano (`engine/moment-defs/`) llegaron hasta acá
// y no dan para más: cada uno son cuatrocientas líneas de mecánica propia, y el
// catálogo que viene son SESENTA Y CINCO —cuatro por dorsal del 1 al 15, más
// cinco que le tocan a cualquiera—. Escritos uno por uno serían veinte mil
// líneas de las cuales diecinueve mil dirían lo mismo con otros nombres.
//
// Este archivo declara la salida: SIETE VERBOS y un catálogo de datos encima.
//
// ── Por qué siete y no sesenta y cinco ──
// Se leyó la lista entera antes de escribir una línea de motor, y los sesenta y
// cinco piden un verbo de estos siete:
//
//   · `ventana`   — TOCAR EN EL MOMENTO. Un cursor cruza y hay una franja buena.
//                   El talonaje del hooker, el salto del segunda, el drop del 10.
//   · `sosten`    — NO SOLTAR. Un valor se te va y lo corregís tic a tic.
//                   El empuje del pilar, el maul, el sprint final del wing.
//   · `punteria`  — APUNTAR CONTRA ALGO QUE NO SE VE. Lo que apuntás se corre
//                   solo. El lanzamiento del hooker, el box kick del 9.
//   · `punto`     — ELEGIR UN LUGAR. Una grilla, y el lugar bueno es uno.
//                   Limpiar el ruck, cerrar el canal, la pelota del cielo.
//   · `lectura`   — LEER Y DECIDIR. Opciones que valen distinto según una seña
//                   que está a la vista. La última decisión, la salida del scrum.
//   · `secuencia` — HACER LOS PASOS EN ORDEN. Cada paso con su ventana.
//                   Levantar al saltador, el robo limpio.
//   · `memoria`   — ACORDARSE. Se muestra, desaparece, lo repetís.
//                   El código de lineout, encontrar el espacio del 10.
//
// Que sean siete y no uno es lo que hace que el juego no sea la misma barra
// pintada de sesenta y cinco colores. Que sean siete y no sesenta y cinco es lo
// que hace que la calibración se pueda mover de un movimiento.
//
// ── LA REGLA QUE ESTE ARCHIVO EXISTE PARA IMPONER ──
//
//   LA MECÁNICA ES CÓDIGO Y VIVE EN `engine/mechanics/`.
//   EL MINIJUEGO ES UN DATO Y VIVE EN `data/minigames/`.
//
// Agregar un minijuego es agregar un objeto a un array. Si para agregarlo hace
// falta tocar `engine/`, entonces lo que hace falta es un verbo nuevo — y esa
// conversación (¿qué verbo del rugby no está?) es exactamente la que no
// queremos saltear escribiendo un `if` especial. Es la misma regla que el
// CLAUDE.md de Carrera de Rugby impone sobre los eventos (§3: "los eventos son
// datos, no código"), traída al lugar donde ahora duele.
//
// ── Y las tres reglas de `moment-def.ts` siguen en pie ──
// Este contrato se apoya en aquel, no lo reemplaza: `resolve` no ve contexto, el
// azar se sortea en `setup`, y `MomentDeltas` sigue cerrado. La fábrica
// (`engine/moment-defs/from-spec.ts`) es la que las cumple por los sesenta y
// cinco de una sola vez, que es la única forma de que el número sesenta y cinco
// no las incumpla.

import type { CaptainAttributeKey, PositionFamilyId } from './player.ts';
import type { MomentSetup, PlayLevel } from './moment-def.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LOS SIETE VERBOS
// ═══════════════════════════════════════════════════════════════════════════

export type MechanicId =
    | 'ventana'
    | 'sosten'
    | 'punteria'
    | 'punto'
    | 'lectura'
    | 'secuencia'
    | 'memoria';

/** Los siete, en ORDEN CANÓNICO. Se itera por acá y nunca por `Object.keys`. */
export const ALL_MECHANICS: readonly MechanicId[] = [
    'ventana',
    'sosten',
    'punteria',
    'punto',
    'lectura',
    'secuencia',
    'memoria',
];

/** Cómo se lee el verbo en pantalla, para la ficha del minijuego. */
export const MECHANIC_LABEL: Record<MechanicId, string> = {
    ventana: 'Tiempo',
    sosten: 'Aguante',
    punteria: 'Puntería',
    punto: 'Lugar',
    lectura: 'Lectura',
    secuencia: 'Secuencia',
    memoria: 'Memoria',
};

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA NOTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cómo salió la jugada, y son cuatro para los sesenta y cinco.
 *
 * ── Por qué una escala compartida ──
 * Porque la tabla de pagos es UNA. Si cada minijuego tuviera su propia escala
 * —`adentro/palo/afuera` para los palos, `limpio/sucio/nada` para el jackal—
 * la magnitud de cada uno se calibraría sola, y a los sesenta y cinco nadie
 * podría contestar "¿cuánto paga clavar una jugada?" sin abrir sesenta y cinco
 * archivos. Es la advertencia que `moment-defs/index.ts` dejó escrita antes de
 * que hicieran falta: los deltas van todos juntos, en un solo lugar.
 *
 * ── Por qué CUATRO y no tres ──
 * Tres colapsan el "salió bien" con el "salió perfecto", y el jugador nota la
 * diferencia aunque el motor no la pague: clavar la ventana en el centro y
 * rasparla por el borde no son la misma tarde. `tibio` existe por el otro lado:
 * la jugada que no sale ni se rompe, que en rugby es la mayoría.
 *
 * NO son los `PlayLevel`. Aquellos son cómo JUGÓ un simulado —una entrada—;
 * estos son cómo SALIÓ la jugada —una salida—. Que un simulado que juega `bien`
 * saque `tibio` porque el margen estaba cerrado es exactamente lo que tiene que
 * poder pasar.
 */
export type MinigameGrade = 'clavado' | 'logrado' | 'tibio' | 'errado';

/** Las cuatro, de mejor a peor. Es el orden que verifica el contrato. */
export const ALL_GRADES: readonly MinigameGrade[] = ['clavado', 'logrado', 'tibio', 'errado'];

/** ¿La jugada salió? Para la pantalla, que pinta verde o rojo. */
export function gradeIsGood(grade: MinigameGrade): boolean {
    return grade === 'clavado' || grade === 'logrado';
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LO QUE LA MECÁNICA RECIBE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lo que ve una mecánica al armar los márgenes.
 *
 * Es un `MomentSetupCtx` ya MASTICADO: la mecánica no lee atributos ni familia
 * ni oficio, porque no sabe de rugby. Sabe de barras y de ventanas. La
 * traducción del rugby al margen vive en la fábrica y en ningún otro lado, que
 * es lo que hace que "el atributo abre el margen" sea una sola cuenta para los
 * sesenta y cinco en vez de sesenta y cinco cuentas parecidas.
 */
export interface MechanicCtx {
    /**
     * CUÁNTO MARGEN TENÉS, de 0 (imposible) a 1 (regalado).
     *
     * Trae adentro el atributo del puesto, la presión del minuto y el oficio del
     * que la juega prestada. Cada mecánica lo traduce a lo suyo —ancho de la
     * franja, tics de tolerancia, cuántas señas se muestran— y esa traducción es
     * lo único que cada mecánica decide sola.
     */
    margin: number;
    /** De 0 a 1. La mecánica la usa para el RELOJ, no para el margen: el margen ya la trae. */
    pressure: number;
    /** La semilla del minijuego. Es el ÚNICO azar que una mecánica puede tocar. */
    seed: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LA MECÁNICA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un verbo del juego. Siete implementaciones y nada más.
 *
 * `P` son los parámetros que el CATÁLOGO le pasa —cuántas señas, cuántos pasos,
 * qué dice cada opción—, `S` lo que sortea y viaja al guardado, `I` la mano del
 * jugador.
 *
 * Las tres funciones son PURAS y no importan React ni leen el estado. `grade` no
 * recibe contexto por la regla 1 de `moment-def.ts`: la jugada retomada después
 * de un F5 se resuelve con los márgenes con los que apareció.
 */
export interface Mechanic<P, S, I> {
    id: MechanicId;
    /**
     * Arma los márgenes. El ÚNICO lugar donde una mecánica sortea algo, y se
     * sortea con `ctx.seed`.
     */
    setup(params: P, ctx: MechanicCtx): S;
    /** La nota. Sin contexto y sin rng. */
    grade(setup: S, input: I): MinigameGrade;
    /**
     * La mano que juega un simulado de nivel `level`. OBLIGATORIA, por lo mismo
     * que en `MomentDef`: es lo que hace que el digest congelado siga siendo
     * comparable cuando entre el minijuego sesenta y cinco.
     *
     * `variation` va de 0 a 1 y sirve para moverse ADENTRO del nivel. Es un
     * número y no un rng: un mismo `(setup, level, variation)` da siempre la
     * misma mano.
     */
    playAt(setup: S, level: PlayLevel, variation: number): I;
}

// ═══════════════════════════════════════════════════════════════════════════
//  5 · EL SETUP Y LA MANO, COMO VIAJAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El Setup de un minijuego del catálogo.
 *
 * Es un `MomentSetup` con la parte de la mecánica adentro de `play`. La
 * anidación no es adorno: `resolve` le pasa `setup.play` a `mechanic.grade` y
 * nunca el sobre entero, así que una mecánica no puede leer el minuto ni el
 * marcador aunque quiera. Lo que necesite de ahí se lo tiene que dar la fábrica
 * masticado en `margin`.
 *
 * JSON PURO: viaja al `localStorage` adentro de `PendingMoment`.
 */
export interface MinigameSetup extends MomentSetup {
    /** Los márgenes de la mecánica, ya sorteados. */
    play: unknown;
    /** Cuál de los siete verbos se juega. La pantalla lo lee para elegir cómo dibujar. */
    mechanic: MechanicId;
    /** Minuto del partido, para la crónica. */
    minute: number;
    /**
     * ESTA JUGADA NO PASA ADENTRO DE UN PARTIDO.
     *
     * Los sesenta y cinco del catálogo son jugadas de un partido, así que la
     * pantalla les arma el encabezado con el minuto y el marcador —«Minuto 63 ·
     * lectura», «Están 4 abajo.»— y para ellos está bien. La academia provincial
     * no: es una semana de entrenamiento, y con el marco de partido salía
     * «Minuto 0 · memoria. Están empatados.», que son dos mentiras en la primera
     * línea que el jugador lee.
     *
     * Ausente es el caso normal, que es lo correcto: un campo que hay que
     * acordarse de poner en sesenta y cinco lugares se olvida en el tercero. Lo
     * pone el que se sale de la norma.
     */
    sinPartido?: boolean;
    /** El encabezado de la tarjeta. Copiado del catálogo: no se persiste el spec. */
    title: string;
    /** Las dos o tres líneas que cuentan la jugada. */
    brief: string;
}

/**
 * La mano del jugador en un minijuego del catálogo.
 *
 * UNA sola variante para los sesenta y cinco, y no sesenta y cinco variantes.
 * `MomentOutcome` se discrimina por `kind`, y con un miembro por minijuego esa
 * unión pasaría a tener setenta ramas que ningún `switch` va a recorrer nunca
 * —el guardia de `resolveMoment` compara `outcome.kind !== moment.kind` y con
 * eso alcanza—. La forma de adentro la decide la mecánica, que es la única que
 * la sabe leer.
 */
export interface MinigamePlay {
    kind: MinigameKind;
    play: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
//  6 · EL SPEC — el minijuego como dato
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El identificador de un minijuego del catálogo.
 *
 * Es `string` a propósito y no una unión literal de sesenta y cinco claves. La
 * unión la deriva `data/minigames/index.ts` del catálogo con `as const`, así que
 * existe y estrecha — pero se deriva, no se mantiene a mano. Una lista de
 * sesenta y cinco claves escrita dos veces se desincroniza a la tercera semana,
 * y ya sabemos cómo termina (CLAUDE.md §1.9: una derivada congelada es una
 * mentira con fecha de vencimiento).
 */
export type MinigameKind = string;

/**
 * CUÁNTO PESA ESTA JUGADA.
 *
 * No es dificultad —eso lo pone el margen— sino cuánto mueve la aguja el
 * resultado. Un talonaje bien hecho no vale lo que una patada para ganar el
 * partido, y no porque sea más fácil.
 *
 * Tres escalones y no un número suelto por minijuego: con un número, calibrar
 * el juego es abrir sesenta y cinco archivos. Con tres escalones, es abrir
 * `data/minigames/pay.ts`.
 */
export type MinigameStake = 'chica' | 'media' | 'grande';

/**
 * QUÉ TE PUEDE PASAR SI SALE MAL.
 *
 * El rugby no cobra todos los errores igual: errar un drop cuesta el partido,
 * entrar mal a un ruck cuesta el hombro, y un tackle alto cuesta la tarjeta. El
 * carril lo declara el minijuego y la magnitud la pone la tabla.
 *
 * `cabeza` es aparte de `cuerpo` a propósito: `headDamage` sube y no baja nunca
 * (CLAUDE.md del feature), así que ponerlo en un minijuego es una decisión de
 * diseño y no un parámetro. Lo llevan los que en el rugby real terminan en un
 * HIA, y ninguno más.
 */
export type MinigameRisk = 'ninguno' | 'cuerpo' | 'cabeza' | 'sancion';

/**
 * DÓNDE SE COBRA EL PREMIO. Es la regla del `statBoost`, hecha un campo.
 *
 * `moment-defs/index.ts` la dejó escrita y este es el lugar donde deja de ser
 * una convención que hay que acordarse de leer:
 *
 *   · `propia` — el premio YA ES la métrica-gloria del puesto. Un line-out
 *     ganado por el segunda ya se cuenta en su planilla, así que un `statBoost`
 *     encima cobraría dos veces la misma jugada y la calibración del puesto
 *     mentiría sin que nada falle.
 *   · `ajena`  — el premio no lo cuenta ninguna planilla. Frenar en seco, tapar
 *     un canal, sostener un maul. Estos SÍ llevan `statBoost`.
 *
 * Con el campo declarado, la fábrica decide por los sesenta y cinco y nadie
 * puede olvidárselo en el que escribió apurado.
 */
export type MinigameGloria = 'propia' | 'ajena';

/** La copia de un minijuego. Nada de esto se persiste: cambiar un texto no sube versión. */
export interface MinigameCopy {
    /** El título de la tarjeta. Corto, sin signos de exclamación. */
    title: string;
    /** Las dos o tres líneas que cuentan la jugada. Crónica deportiva, voseo. */
    brief: string;
    /** Qué dice el botón mientras se juega. */
    cta: string;
    /**
     * Una línea por nota. Es lo que se lee en la temporada y en la trayectoria.
     *
     * OJO: `resultText` termina en el registro del Momento, así que entra en el
     * digest congelado. Cambiar una de estas cuatro líneas mueve el digest y
     * obliga a subir `CAPTAIN_ENGINE_VERSION`, igual que en Carrera de Rugby.
     */
    outcome: Record<MinigameGrade, string>;
    /** El resultado en una palabra, para la crónica. Una por nota. */
    result: Record<MinigameGrade, string>;
}

/**
 * UN MINIJUEGO, COMO DATO.
 *
 * Esto es lo que se escribe para agregar el número sesenta y seis. No hay
 * `setup`, no hay `resolve`, no hay `playAt`: los pone la fábrica.
 */
export interface MinigameSpec<P = unknown> {
    /** El id, con prefijo de dorsal: `d7-cazador`, `uni-pase`. Único en el catálogo. */
    kind: MinigameKind;
    /**
     * EL DORSAL DUEÑO, del 1 al 15. `null` es universal.
     *
     * Es el eje que el catálogo viejo no tenía: `MomentDef.families` habla de
     * las OCHO familias, y un pilar izquierdo y uno derecho son la misma. El
     * dorsal es lo que hace que el 1 y el 3 tengan jugadas distintas aunque
     * compartan planilla, atributos y curva de edad.
     */
    shirt: number | null;
    mechanic: MechanicId;
    /**
     * EL ATRIBUTO QUE ABRE EL MARGEN. Uno solo, y a la vista.
     *
     * Que sea uno y no una fórmula por minijuego es lo que hace legible el
     * catálogo: se puede leer la columna entera y contestar "¿qué le sirve al
     * 9?" sin abrir el motor. Y es lo que hace que la ficha del minijuego pueda
     * decirle al jugador qué entrenar.
     */
    attr: CaptainAttributeKey;
    stake: MinigameStake;
    risk: MinigameRisk;
    gloria: MinigameGloria;
    /** Peso relativo en el sorteo, entre los que le tocan a ese dorsal. */
    weight: number;
    copy: MinigameCopy;
    /** Los parámetros de la mecánica. Los tipa cada mecánica. */
    params: P;
}

// ═══════════════════════════════════════════════════════════════════════════
//  7 · LOS PARÁMETROS DE CADA VERBO
// ═══════════════════════════════════════════════════════════════════════════
//
// Viven acá y no en `engine/mechanics/` aunque los lea el motor, y el motivo es
// de dependencias: el catálogo es DATO y tiene que poder tiparse sin importar
// una línea de motor. Si los parámetros vivieran del lado del motor, cada
// archivo del catálogo importaría de `engine/` y la partición que este archivo
// existe para imponer —mecánica es código, minijuego es dato— se rompería en el
// primer `import`.

/** TOCAR EN EL MOMENTO. Un cursor cruza y hay una franja buena. */
export interface VentanaParams {
    /** Cómo se llama la franja buena, para la leyenda de la barra. */
    zona: string;
    /** Qué hay antes y después de la franja, de izquierda a derecha. */
    bordes: [string, string];
    /** Cuántas pasadas antes de que la jugada se resuelva sola. */
    vueltas: number;
    /** Milisegundos de una pasada, sin presión. */
    sweepMs: number;
    /** Ancho de la franja con el margen a la mitad. De 0 a 1. */
    anchoBase: number;
}

/** NO SOLTAR. Un valor se te va y lo corregís tic a tic. */
export interface SostenParams {
    /** Cuántos tics dura. Cada uno es un empujón del rival. */
    tics: number;
    /** Milisegundos por tic. */
    ticMs: number;
    /** Cuánto empuja el rival por tic, como fracción de la banda. */
    deriva: number;
    /** Los dos extremos, para la leyenda. */
    bordes: [string, string];
    /** Qué se está sosteniendo, para el cartel del medio. */
    zona: string;
}

/** APUNTAR CONTRA ALGO QUE NO SE VE. Lo que apuntás se corre solo. */
export interface PunteriaParams {
    /** Cómo se llama lo que corre la pelota: el viento, el adelanto, la carrera. */
    senal: string;
    /** Cuánto corre, como fracción de la barra. */
    desvioMax: number;
    /** Los dos extremos de la barra. */
    bordes: [string, string];
    /** El blanco, para la leyenda del medio. */
    zona: string;
    /** Milisegundos de una pasada de la mira. */
    sweepMs: number;
}

/** ELEGIR UN LUGAR. Una grilla, y el lugar bueno es uno. */
export interface PuntoParams {
    /** Los lugares, en orden espacial de izquierda a derecha. Entre tres y seis. */
    lugares: readonly string[];
    /** Qué se está mirando, para la línea de arriba de la grilla. */
    escena: string;
    /** Segundos para decidir. 0 es sin reloj. */
    segundos: number;
}

/** LEER Y DECIDIR. Las opciones valen distinto según una seña que está a la vista. */
export interface LecturaParams {
    /**
     * Las señas posibles. Se sortea una y se muestra.
     *
     * `mejor` y `segunda` son ÍNDICES de `opciones`, y son la razón de que este
     * verbo no sea un dado con botones: la opción correcta cambia con la seña,
     * así que no hay una respuesta que se aprenda de memoria en la segunda
     * partida. `segunda` puede ser `null` cuando la jugada no perdona.
     */
    senas: readonly { label: string; detalle: string; mejor: number; segunda: number | null }[];
    opciones: readonly { label: string; hint: string }[];
    /** Segundos para decidir. Cuanto menos, más se parece a la cancha. */
    segundos: number;
}

/** HACER LOS PASOS EN ORDEN. Cada paso con su ventana. */
export interface SecuenciaParams {
    /** Los pasos, en orden. Entre tres y cinco. */
    pasos: readonly string[];
    /** Milisegundos entre un paso y el siguiente. */
    pasoMs: number;
    /** La ventana de cada paso con el margen a la mitad, en milisegundos. */
    ventanaBase: number;
}

/** ACORDARSE. Se muestra, desaparece, lo repetís. */
export interface MemoriaParams {
    /** Los símbolos con los que se arma el patrón. */
    simbolos: readonly string[];
    /** Cuántos símbolos tiene el patrón. */
    largo: number;
    /** Milisegundos que se muestra cada símbolo con el margen a la mitad. */
    showBase: number;
    /** Qué se está memorizando, para la línea de arriba. */
    escena: string;
}

/**
 * EL SPEC, DISCRIMINADO POR VERBO.
 *
 * Es la forma que consume el catálogo, y el emparejamiento verbo↔parámetros lo
 * verifica el compilador: escribir `mechanic: 'ventana'` con parámetros de
 * memoria no compila. Sin esto, `params` sería `unknown` y el error aparecería
 * recién en runtime, adentro de la mecánica y a tres archivos de la causa.
 */
export type AnyMinigameSpec =
    | (MinigameSpec<VentanaParams> & { mechanic: 'ventana' })
    | (MinigameSpec<SostenParams> & { mechanic: 'sosten' })
    | (MinigameSpec<PunteriaParams> & { mechanic: 'punteria' })
    | (MinigameSpec<PuntoParams> & { mechanic: 'punto' })
    | (MinigameSpec<LecturaParams> & { mechanic: 'lectura' })
    | (MinigameSpec<SecuenciaParams> & { mechanic: 'secuencia' })
    | (MinigameSpec<MemoriaParams> & { mechanic: 'memoria' });

/**
 * UNA CASILLA DEL CATÁLOGO QUE YA ESTABA ESCRITA A MANO.
 *
 * Seis de los sesenta y cinco existen desde antes y son los mejores del juego:
 * el tackle, el código, los palos, la banda, el jackal y el ancla. Reescribirlos
 * como spec sería tirar el minijuego más probado de cada familia para ganar
 * uniformidad — y encima movería el digest congelado por PLOMERÍA, que es
 * exactamente el ruido que `moment-kinds.ts` viene evitando desde el principio.
 *
 * Así que el catálogo los declara como lo que son: una casilla ocupada. El
 * roster de sesenta y cinco queda completo y auditable —hay un test que exige
 * cuatro por dorsal— y el motor de esos seis no se toca.
 */
export interface MinigameLegacy {
    kind: MinigameKind;
    shirt: number | null;
    /** El `MomentKind` que ya existe y que ocupa esta casilla. */
    legacyOf: string;
    copy: { title: string };
}

/** Una casilla del roster: o un spec, o una que ya estaba escrita. */
export type MinigameSlot = AnyMinigameSpec | MinigameLegacy;

/**
 * ¿Esta casilla la escribe la fábrica? Estrecha el tipo, que es para lo que
 * existe: después de esta guarda el `else` es un `AnyMinigameSpec` y el
 * compilador ya sabe que tiene `mechanic` y `params`.
 */
export function isLegacySlot(slot: MinigameSlot): slot is MinigameLegacy {
    return 'legacyOf' in slot;
}

/**
 * Las familias a las que les toca un dorsal, para que la fábrica pueda llenar
 * `MomentDef.families` sin que el catálogo lo repita.
 *
 * Se DERIVA de `data/positions.ts` en la fábrica y no se escribe acá (CLAUDE.md
 * §1.9): el mapa dorsal→familia ya existe una vez, en `familyOfNumber`, y
 * copiarlo sería la derivada congelada de siempre.
 */
export type MinigameFamilies = readonly PositionFamilyId[] | null;
