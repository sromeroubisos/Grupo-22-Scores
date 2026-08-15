// EL CAPITÁN — el armazón de los Momentos.
//
// Cuatro responsabilidades y nada más: decidir SI hay Momento esta temporada y
// cuál, armarle los márgenes, traducir lo que el jugador hizo a efectos sobre la
// temporada, y decidir si la jugada encadena otra.
//
// Los Momentos por puesto entran por `engine/moment-defs/` sin tocar nada de
// acá: agregan su clave en `moment-kinds.ts` y su `MomentDef`. El reducer, la
// temporada y el guardado no se enteran.
//
// ── Dos streams, y el porqué ──
// El rng de la carrera decide SI hay jugada y en qué minuto. Todo lo demás
// —cuál de los Momentos elegibles toca, y los márgenes con los que se juega—
// sale de semillas DERIVADAS: `hash(semilla:temporada:momentPick)` para la
// elección y `hash(semilla:kind:temporada:idx)` para el minijuego.
//
// No es elegancia. Si la elección saliera del stream principal, agregar un
// Momento nuevo consumiría una tirada más por temporada y correría el rng de
// TODAS las carreras: el digest congelado se movería entero, en los tres casos,
// y el diff diría "se movió todo, confiá". Con la semilla derivada el digest se
// mueve SOLO donde un Momento cambió de verdad el resultado, y eso se puede
// revisar a mano.
//
// Por eso `rollMoment` sigue consumiendo exactamente `chance` + `int` + `int` del
// stream principal, igual que antes de que existieran los Momentos por puesto.
// Si algún día hace falta una tirada más acá, sabés lo que cuesta.

import type { CaptainPlayer } from '../types/player.ts';
import type { CaptainState } from '../types/captain.ts';
import type {
    BunkerVerdict,
    MomentKind,
    MomentOutcome,
    MomentRecord,
    PendingMoment,
    TackleZone,
} from '../types/moment.ts';
import type { MomentDeltas, MomentResult, MomentSetupCtx, PlayLevel } from '../types/moment-def.ts';
import type { Rng } from './random.ts';
import type { MinigameSlot } from '../types/minigame.ts';
import { FAME_MAX, FAME_MIN } from '../types/currencies.ts';
import { MOMENT_LABEL } from '../types/moment-kinds.ts';
import { isLegacySlot } from '../types/minigame.ts';
import { ALL_MINIGAMES, getMinigame } from '../data/minigames/index.ts';
import { familyOfNumber } from '../data/positions.ts';
import { createRng, hashSeed } from './random.ts';
import type { AnyMomentDef } from './moment-defs/index.ts';
import { ACADEMIA_AGE, ACADEMIA_KIND, ACADEMIA_UNION, getMomentDef, isContractKind } from './moment-defs/index.ts';
import { applyBelonging } from './belonging.ts';
import { addBodyDamage, addHeadDamage } from './damage.ts';
import { belongingSituation } from './contracts.ts';
import { playingTimeOf } from './statistics.ts';
import { clubRatingOf } from './clubs.ts';

/** Probabilidad de que una temporada traiga un Momento. */
const MOMENT_PROB = 0.62;

/** Debajo de este tiempo de juego no te toca ninguna jugada decisiva. */
const MIN_SHARE = 0.3;

/**
 * El peso del tackle en el sorteo.
 *
 * Vive acá y no en una `MomentDef` porque el tackle es pre-contrato. Cuando se
 * migre, se muda con él.
 */
const TACKLE_WEIGHT = 10;

/**
 * Cuánto oficio tiene el que juega un Momento que NO es de su puesto.
 *
 * ── LOS MINIJUEGOS SON ESPECIALIDAD, NO EXCLUSIVIDAD ──
 * Los cuatro de un dorsal no son un cerco: son lo que ese número hace mejor. Un
 * 10 que pateó toda su vida puede terminar jugando el box kick del 9, un pilar
 * puede desarrollar buenas manos, un wing puede volverse un defensor. Encerrar a
 * un jugador en cuatro jugadas para siempre sería más pobre que el rugby real,
 * donde en juego abierto cualquiera puede tener que ser portador, apoyo,
 * pasador, pateador, tackleador o ganador de pelota.
 *
 * Los dos escalones dicen exactamente eso:
 *
 *   · MISMA FAMILIA, OTRO DORSAL — el pilar izquierdo jugando la columna del
 *     derecho, el 12 leyendo el intervalo del 13. Comparten entrenamiento,
 *     posición en la cancha y atributos: la juegan casi igual de bien.
 *   · OTRA FAMILIA — el centro parado sobre la pelota en el breakdown, el wing
 *     que tiene que patear porque el 10 salió. La juegan, y la juegan peor.
 *
 * Nunca ensancha el margen: `marginOf` acota el oficio a 1 antes de multiplicar,
 * así que el que la juega prestada la juega peor y nunca mejor.
 *
 * ── Por qué el tackle NO lleva proficiency ──
 * La intuición de que un wing y un flanker no tacklean igual es correcta, y aun
 * así `proficiency` es el concepto equivocado para expresarla. El tackle es el
 * TRABAJO DE LOS QUINCE: nadie lo juega prestado. Si el oficio viviera ahí
 * pasaría a significar "qué tan bueno es tu puesto tackleando", y entonces el
 * 0,6 de un wing tackleando y el 0,6 de un wing pateando en Los Palos serían el
 * mismo número queriendo decir dos cosas distintas — y ya no se podrían
 * distinguir ni calibrar por separado.
 *
 * Por eso los cinco universales quedan siempre en 1: no hay un dorsal dueño del
 * que estén prestados.
 */
const OUTSIDER_PROFICIENCY = 0.75;
const SAME_FAMILY_PROFICIENCY = 0.9;

// ═══════════════════════════════════════════════════════════════════════════
//  El catálogo, indexado
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El kind de MOTOR de una casilla del catálogo.
 *
 * Seis de las sesenta y cinco están ocupadas por Momentos escritos a mano, y su
 * kind de motor es el viejo (`codigo`, `palos`, …) y no el id de la casilla
 * (`d2-codigo`, `d10-patada`). La casilla existe para que el roster esté
 * completo y auditable; el motor sigue hablando de `codigo`.
 */
function kindOfSlot(slot: MinigameSlot): MomentKind {
    return isLegacySlot(slot) ? slot.legacyOf : slot.kind;
}

/**
 * Todos los kinds sorteables, en ORDEN DECLARADO del catálogo.
 *
 * `bunker` no está y no puede estar: no se sortea, se llega a él desde el tackle
 * alto. Que no aparezca sale solo de que el catálogo no tiene casilla para él,
 * sin ningún filtro que haya que acordarse de mantener.
 */
const SELECTABLE: readonly MomentKind[] = ALL_MINIGAMES.map(kindOfSlot);

/**
 * Índice kind → dorsal dueño. `null` es universal.
 *
 * Se arma UNA vez recorriendo el catálogo en orden declarado. Un kind que no
 * esté acá —hoy solo el bunker— se trata como universal: no hay dorsal del que
 * pueda estar prestado.
 */
const SHIRT_OF_KIND: Map<MomentKind, number | null> = new Map();
for (const slot of ALL_MINIGAMES) SHIRT_OF_KIND.set(kindOfSlot(slot), slot.shirt);

/**
 * EL CRUCE: cada tanto te toca una jugada que no es tuya.
 *
 * El rugby real está lleno: el 10 sale lesionado y patea el fullback, el centro
 * llega primero al ruck, el ala termina levantando en el line-out porque el
 * segunda está en el piso. Es raro, y por eso el número es chico — pero que
 * exista es lo que hace que `proficiency` signifique algo y que un puesto no
 * viva en un tubo de dos minijuegos para siempre.
 *
 * Sale del stream DERIVADO, igual que la elección del kind, así que no corre el
 * rng de la carrera.
 */
const CROSS_CHANCE = 0.08;

// ═══════════════════════════════════════════════════════════════════════════
//  Las semillas derivadas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La semilla del minijuego.
 *
 * `idx` es cuántas jugadas van en esta temporada. Hoy nunca hay dos del mismo
 * kind —regla 4 del diseño— pero un encadenado ya son dos jugadas, y el día que
 * dos del mismo tipo caigan en el mismo año no queremos que compartan márgenes.
 */
export function momentSeed(seed: number, kind: MomentKind, season: number, idx: number): number {
    return hashSeed(`${seed}:${kind}:${season}:${idx}`);
}

/** El dorsal dueño de un kind. `null` es universal. */
export function shirtOfKind(kind: MomentKind): number | null {
    return SHIRT_OF_KIND.get(kind) ?? null;
}

/** ¿Este kind es de tu dorsal o de nadie? */
function esPropio(kind: MomentKind, shirt: number): boolean {
    const dueno = shirtOfKind(kind);
    return dueno === null || dueno === shirt;
}

function weightOf(kind: MomentKind): number {
    const def = getMomentDef(kind);
    if (def) return def.weight;
    // Sin def es pre-contrato. El bunker no se sortea, así que el único que
    // llega acá es el tackle y su peso vive arriba.
    return TACKLE_WEIGHT;
}

/**
 * Cuál de los Momentos elegibles toca.
 *
 * Sale de una semilla DERIVADA, no del stream de la carrera (ver la cabecera).
 * Se recorre `SELECTABLE`, que está en el orden declarado del catálogo: nunca
 * `Object.keys` sobre el registry ni sobre un `Map`.
 *
 * ── El eje es el DORSAL, no la familia ──
 * Antes era la familia porque los Momentos eran cinco y ninguna familia tenía
 * dos. Con cuatro por dorsal, filtrar por familia le daría al pilar izquierdo
 * las ocho jugadas de la primera línea como propias —las suyas y las del
 * derecho— y el 1 y el 3 volverían a ser el mismo jugador, que es justamente lo
 * que el catálogo por dorsal vino a arreglar.
 */
export function pickMomentKind(seed: number, season: number, shirt: number): MomentKind {
    const rng = createRng(hashSeed(`${seed}:${season}:momentPick`));

    // El cruce se tira SIEMPRE, aunque después no cambie nada: si solo se tirara
    // cuando hay Momentos ajenos disponibles, el stream derivado dependería del
    // tamaño del catálogo y agregar el minijuego sesenta y seis movería los
    // sesenta y cinco anteriores.
    const cruce = rng.chance(CROSS_CHANCE);

    const propios = SELECTABLE.filter((kind) => esPropio(kind, shirt));
    const ajenos = SELECTABLE.filter((kind) => !esPropio(kind, shirt));
    const elegibles = cruce && ajenos.length > 0 ? ajenos : propios;

    // Los cinco universales le tocan a todos, así que el pool propio nunca queda
    // vacío. Si algún día dejaran de existir, esto avisa en vez de devolver
    // `undefined`.
    if (elegibles.length === 0) return 'tackle';

    return rng.weighted(elegibles, weightOf);
}

/**
 * Cuánto es tuya esta jugada. Ver `OUTSIDER_PROFICIENCY`.
 *
 * Tres escalones: la tuya o la de nadie (1), la de tu compañero de familia
 * (0,9), la de otro puesto (0,75).
 */
export function proficiencyFor(kind: MomentKind, shirt: number): number {
    const dueno = shirtOfKind(kind);
    if (dueno === null || dueno === shirt) return 1;

    return familyOfNumber(dueno) === familyOfNumber(shirt)
        ? SAME_FAMILY_PROFICIENCY
        : OUTSIDER_PROFICIENCY;
}

/**
 * Cómo se lee un Momento en la trayectoria.
 *
 * Los siete escritos a mano tienen su etiqueta en `MOMENT_LABEL`; los del
 * catálogo, el título de su casilla. Vive acá y no en `moment-kinds.ts` porque
 * aquel archivo no importa nada y no va a empezar ahora.
 */
export function momentLabel(kind: MomentKind): string {
    const legacy = (MOMENT_LABEL as Record<string, string | undefined>)[kind];
    if (legacy) return legacy;
    return getMinigame(kind)?.copy.title ?? kind;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ¿Hay Momento esta temporada?
// ═══════════════════════════════════════════════════════════════════════════

/** Cuántas jugadas van en esta temporada. Derivado: no se guarda un contador. */
function momentIndex(state: CaptainState): number {
    let n = 0;
    for (const m of state.moments) if (m.season === state.season) n += 1;
    return n;
}

/**
 * Arma el pendiente de un kind, con su Setup ya sorteado si va por el contrato.
 *
 * Es el único lugar donde se llama a `def.setup`, y el único donde se construye
 * un `MomentSetupCtx`: después de esta función el contexto no existe más, que es
 * justamente lo que el contrato garantiza.
 */
function buildPending(
    state: CaptainState,
    kind: MomentKind,
    base: { minute: number; scoreDelta: number; pressure: number },
    idx: number,
    chained: boolean,
): PendingMoment {
    const pending: PendingMoment = { kind, ...base };
    if (chained) pending.chained = true;

    const def = getMomentDef(kind);
    if (!def) return pending; // pre-contrato: tackle y bunker

    const ctx: MomentSetupCtx = {
        kind,
        season: state.season,
        minute: base.minute,
        scoreDelta: base.scoreDelta,
        pressure: base.pressure,
        family: state.player.family,
        proficiency: proficiencyFor(kind, state.player.number),
        attrs: state.player.attrs,
        bodyDamage: state.damage.cuerpo,
        seed: momentSeed(state.seed, kind, state.season, idx),
    };
    pending.setup = def.setup(ctx);
    return pending;
}

/**
 * Se decide al cerrar el reparto de tiempo, ANTES de simular.
 *
 * Usa `playingTimeOf`, que es pura: el que no juega no tiene jugada decisiva, y
 * eso no hace falta sortearlo. El único tiro es si la jugada aparece o no.
 *
 * REGLA 4 del diseño: nunca dos Momentos en la misma temporada. Por eso esto
 * devuelve uno o ninguno, y nunca una lista.
 */
/**
 * ¿LE TOCA LA ACADEMIA PROVINCIAL M16?
 *
 * Tres condiciones y ninguna es un sorteo: dieciséis años, argentino, y que no
 * la haya jugado ya. La academia no se rifa —si te citaron, te citaron— y por
 * eso esto es una compuerta y no un peso en el sorteo.
 *
 * ── Por qué se pregunta por el registro y no por la temporada ──
 * Porque «temporada 1» y «dieciséis años» son lo mismo HOY, y ese "hoy" es
 * exactamente la clase de derivada que envejece mal (CLAUDE.md §1.9). Se
 * pregunta por lo que la condición ES: que no esté ya jugada.
 */
export function academiaDue(state: CaptainState): boolean {
    if (state.player.age !== ACADEMIA_AGE) return false;
    if (state.player.countryCode !== ACADEMIA_UNION) return false;
    return !state.moments.some((m) => m.kind === ACADEMIA_KIND);
}

export function rollMoment(state: CaptainState, rng: Rng): PendingMoment | null {
    // LA ACADEMIA REEMPLAZA A LA JUGADA DE LA TEMPORADA, no se suma. Un pibe de
    // dieciséis que va a la provincial no juega además la jugada decisiva de la
    // primera del club, porque a los dieciséis no está en la primera del club.
    //
    // ⚠️ Y CONSUME LAS MISMAS TRES TIRADAS QUE UNA JUGADA NORMAL, en el mismo
    // orden, aunque no use ninguna.
    //
    // No es ceremonia: es el invariante que hace revisable el digest congelado
    // —«rollMoment consume exactamente tres tiradas»— y salir antes de tirarlas
    // devolvía un Momento gratis que corría el stream de toda carrera argentina
    // media tirada. Lo agarró `moment-contract.test.ts` en cuanto la compuerta
    // empezó a abrir de verdad; antes no, porque con el código de unión en
    // mayúscula esta rama no se pisaba nunca.
    if (academiaDue(state)) {
        rng.chance(MOMENT_PROB);
        rng.int(48, 79);
        rng.int(-6, 6);

        return buildPending(
            state,
            ACADEMIA_KIND,
            // Los tres en cero, y los tres a mano: la academia es una semana de
            // entrenamiento, así que no tiene minuto, ni marcador, ni el apriete
            // del último cuarto. Se descartan los valores recién sorteados a
            // propósito — se tiraron para no mover el stream, no para usarlos.
            { minute: 0, scoreDelta: 0, pressure: 0 },
            momentIndex(state),
            false,
        );
    }

    const { share } = playingTimeOf(
        state.player,
        clubRatingOf(state.player.clubId),
        state.damage.cuerpo,
        state.pendingPlayingTime,
    );
    if (share < MIN_SHARE) return null;
    if (!rng.chance(MOMENT_PROB)) return null;

    // El contexto. Cuanto más tarde y más ajustado, más aprieta.
    const minute = rng.int(48, 79);
    const scoreDelta = rng.int(-6, 6);
    const pressure = Math.min(1, (minute - 40) / 45 + (6 - Math.abs(scoreDelta)) / 22);

    // Y acá se corta el stream principal: el kind y los márgenes salen de
    // semillas derivadas, así que agregar Momentos no corre la carrera de nadie.
    const kind = pickMomentKind(state.seed, state.season, state.player.number);

    return buildPending(
        state,
        kind,
        { minute, scoreDelta, pressure: Math.round(pressure * 100) / 100 },
        momentIndex(state),
        false,
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  EL TACKLE — los márgenes  (PRE-CONTRATO)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los cortes de la barra, de 0 a 1 y en orden: frenar temprano es seguro,
 * frenar tarde es peligroso.
 *
 *   [0 ────── piernasEnd ────── legalEnd ────── altoEnd ────── 1]
 *      piernas         legal          alto ⚠️        tarde
 *
 * Que el orden sea ese no es estético: es la causalidad del tackle real. Llegar
 * antes te deja abajo —seguro, pero no frena el avance— y llegar tarde te sube
 * a la altura del hombro, que es donde empiezan las tarjetas.
 */
export interface TackleZones {
    piernasEnd: number;
    legalEnd: number;
    altoEnd: number;
    /** Cuánto tarda la barra en cruzar, en milisegundos. */
    sweepMs: number;
}

/**
 * El detalle que ningún juego modela y que acá es el corazón del sistema:
 * LA ZONA PELIGROSA CRECE CON EL DESGASTE. Un jugador roto en el minuto 75
 * tiene muchas más chances de irse expulsado, y eso es exactamente lo que pasa
 * en la realidad — el tackle causa la mitad de las lesiones del rugby y la
 * altura del tackle se va con las piernas.
 */
export function tackleZones(player: CaptainPlayer, bodyDamage: number, pressure: number): TackleZones {
    // El atributo de tackle ensancha la zona legal, de 26 a 38 puntos.
    const legal = 26 + Math.max(-6, Math.min(12, (player.attrs.tackle - 50) * 0.24));
    // El cuerpo castigado ensancha la zona alta, de 12 a 26.
    const alto = 12 + Math.min(14, bodyDamage * 0.14);
    // Lo que queda se reparte entre llegar temprano y llegar tarde.
    const resto = 100 - legal - alto;
    const piernas = resto * 0.52;

    const total = 100;
    return {
        piernasEnd: piernas / total,
        legalEnd: (piernas + legal) / total,
        altoEnd: (piernas + legal + alto) / total,
        sweepMs: Math.round(1450 - pressure * 520),
    };
}

/** En qué zona cae una posición de 0 a 1. */
export function zoneAt(pos: number, zones: TackleZones): TackleZone {
    if (pos < zones.piernasEnd) return 'piernas';
    if (pos < zones.legalEnd) return 'legal';
    if (pos < zones.altoEnd) return 'alto';
    return 'tarde';
}

/**
 * Dónde frena la barra un simulado de nivel `level`. El `playAt` del tackle.
 *
 * Vive acá y no en una `MomentDef` por lo mismo que `tackleZones`: el tackle es
 * PRE-CONTRATO. Cuando se migre —justo antes del último Momento por puesto, que
 * es lo que dice `moment-kinds.ts`— se muda adentro de la def con todo lo demás.
 *
 * Devuelve la posición Y la zona juntas, igual que hace la pantalla, porque son
 * un par: una zona que no se derive de ese `at` deja el bunker calculando una
 * profundidad que no corresponde a la jugada.
 *
 *   · bien    — el medio de la zona legal. Lo frena en seco.
 *   · regular — abajo, a las piernas: seguro y sin premio.
 *   · mal     — alto (y al bunker) o tarde (y try), mitad y mitad. LAS DOS, no
 *               una: la zona alta es la única puerta al bunker, y con la receta
 *               uniforme de la 0.4.0 —que caía casi siempre en `tarde`— el
 *               bunker no se jugó en ninguna de las tres carreras congeladas.
 *               Que la mitad de los `mal` vayan arriba pone el carril AL ALCANCE
 *               del digest; que una semilla concreta lo pise sigue siendo cosa
 *               de la semilla.
 */
export function tacklePlayAt(
    zones: TackleZones,
    level: PlayLevel,
    variation: number,
): { at: number; zone: TackleZone } {
    let at: number;
    if (level === 'bien') at = (zones.piernasEnd + zones.legalEnd) / 2;
    else if (level === 'regular') at = zones.piernasEnd * 0.6;
    else if (variation < 0.5) at = (zones.legalEnd + zones.altoEnd) / 2;
    else at = (zones.altoEnd + 1) / 2;

    return { at, zone: zoneAt(at, zones) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EL BUNKER  (PRE-CONTRATO)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El veredicto del oficial revisor.
 *
 * Es lo único del Momento que el jugador NO controla, así que es lo único que
 * sale del rng. Cuanto más adentro de la zona peligrosa frenaste, más chance de
 * que la amarilla suba a roja de veinte minutos.
 *
 * Desde el 6 Naciones 2026 la roja permanente quedó reservada a los actos de
 * matonaje; todo lo demás pasa por el bunker. Por eso acá no existe.
 */
export function bunkerVerdict(depth: number, rng: Rng): BunkerVerdict {
    return rng.chance(0.25 + depth * 0.45) ? 'roja-20' : 'amarilla';
}

// ═══════════════════════════════════════════════════════════════════════════
//  Los deltas: de un MomentResult a estado
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El ÚNICO lugar donde un `MomentDeltas` se convierte en estado.
 *
 * Es a los Momentos lo que `apply-decision.ts` es a las decisiones, y existe por
 * el mismo motivo: que la traducción esté en un solo lugar es lo que impide que
 * un Momento prometa una cosa y haga otra. El ORDEN es fijo y parte del
 * contrato, porque Pertenencia y Cartel tienen techos que se pisan.
 */
export function applyMomentDeltas(state: CaptainState, deltas: MomentDeltas): void {
    if (deltas.fame) {
        state.fame = Math.min(FAME_MAX, Math.max(FAME_MIN, Math.round((state.fame + deltas.fame) * 10) / 10));
    }
    if (deltas.belonging && state.player.clubId) {
        state.belonging = applyBelonging(
            state.belonging,
            deltas.belonging,
            belongingSituation(state, state.player.clubId),
        );
    }
    if (deltas.statBoost) state.pendingStatBoost += deltas.statBoost;
    if (deltas.sanction) state.pendingSanction += deltas.sanction;
    if (deltas.playingTime) state.pendingPlayingTime += deltas.playingTime;
    if (deltas.bodyDamage) state.damage = addBodyDamage(state.damage, deltas.bodyDamage);
    if (deltas.headDamage) state.damage = addHeadDamage(state.damage, deltas.headDamage);
}

/**
 * ¿La jugada encadena otra? Las dos reglas de la cadena viven acá y en ningún
 * otro lado.
 *
 *   1. A LO SUMO UNA VEZ. Lo que llegó encadenado ya no encadena.
 *   2. NUNCA A SÍ MISMO. Aunque una sola vuelta no sea un bucle infinito, un
 *      Momento que se llame a sí mismo es siempre un error de escritura: lo que
 *      se quería era otra ronda del mismo minijuego, y eso se resuelve adentro
 *      del Momento, no encadenando.
 *
 * Devolver `null` no es un fallo: es la salida normal. Que la regla sea una
 * función pura y no un `if` adentro del reducer es lo que la hace testeable sin
 * fabricar una carrera entera.
 */
export function nextChain(current: PendingMoment, result: MomentResult): MomentKind | null {
    if (!result.chain) return null;
    if (current.chained) return null;
    if (result.chain === current.kind) return null;
    return result.chain;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Resolución: de lo que hiciste a lo que le pasa a la temporada
// ═══════════════════════════════════════════════════════════════════════════

export interface MomentResolution {
    record: MomentRecord;
    /** La jugada sigue: hay otra pantalla antes de cerrar (el bunker, o una cadena). */
    continues: boolean;
}

/**
 * Aplica el resultado. Muta el estado —el reducer trabaja sobre un clon— y
 * devuelve la línea de crónica.
 *
 * Dos carriles, y la diferencia está declarada en `moment-kinds.ts`:
 *
 *   · CONTRATO — el kind tiene `MomentDef`. Se resuelve con el Setup que viajó
 *     en el guardado y la mano del jugador. Sin rng y sin leer el estado.
 *   · PRE-CONTRATO — tackle y bunker, que se escribieron antes.
 *
 * Devuelve `null` si la mano no es de esta jugada —mandar un tackle a un
 * jackal—. Es el mismo trato que le da el reducer a una opción que no existe:
 * la acción no vale, el estado no se mueve y nada explota.
 *
 * ── POR QUÉ EL GUARDIA VIVE ACÁ Y NO EN CADA DEF ──
 * El registry borra los genéricos —tiene que hacerlo, indexa por kind— y en ese
 * borde se pierde la garantía de tipos: un `MomentOutcome` de cualquier kind
 * puede llegarle a cualquier `resolve`. Hay dos formas de taparlo y no son
 * equivalentes.
 *
 * Pedirle a cada def que se defienda sola es una CONVENCIÓN, y las convenciones
 * se cumplen catorce veces y se olvidan la quince. Peor: se olvidan en el
 * Momento que se escribió apurado, que es justo el que va a recibir la mano
 * rara. El síntoma no sería un mensaje claro sino un `undefined.length` adentro
 * de un minijuego, a tres archivos de distancia de la causa.
 *
 * Acá arriba es un INVARIANTE. No hay def que pueda incumplirlo porque ninguna
 * llega a ejecutarse sin pasar por esta línea, y el que escriba el Momento
 * número quince no necesita saber que la regla existe. Esa es toda la
 * diferencia entre las dos, y es la razón de que el chequeo esté en el armazón.
 */
export function resolveMoment(
    state: CaptainState,
    moment: PendingMoment,
    outcome: MomentOutcome,
    rng: Rng,
): MomentResolution | null {
    if (outcome.kind !== moment.kind) return null;

    if (isContractKind(moment.kind)) {
        const def = getMomentDef(moment.kind);
        // Un Momento del contrato SIN Setup es un guardado corrupto, no una
        // jugada: se trata como la mano que no corresponde —la acción no vale y
        // el estado no se mueve— en vez de caer al carril de otro.
        if (!def || !moment.setup) return null;
        return resolveByContract(state, moment, def, outcome);
    }

    // Acá abajo el tipo ya dice `PreContractKind`, así que el `default` es
    // `never`: el día que entre un pre-contrato nuevo sin su caso, no compila.
    switch (moment.kind) {
        case 'tackle':
            // El `in` y no `outcome.kind === 'tackle'`: desde que existe la rama
            // genérica del catálogo —`{ kind: string; play: unknown }`— comparar
            // el discriminante ya no estrecha sola, porque un `string` también
            // matchea. La forma de la mano sí discrimina, y encima es lo que de
            // verdad se está preguntando.
            return 'zone' in outcome ? resolveTackle(state, moment, outcome.zone, outcome.at, rng) : null;
        case 'bunker':
            // El veredicto ya estaba decidido cuando el jugador entró al bunker.
            return resolveBunker(state, moment.verdict ?? 'amarilla');
        default:
            return carrilImposible(moment.kind);
    }
}

/**
 * El kind que no es de ningún carril.
 *
 * Recibe `never`, así que llamarla con algo que el tipo todavía contempla es un
 * error de compilación — que es todo el punto. Y si igual llega en runtime
 * —porque alguien agregó un kind al tipo sin def y sin sumarlo a
 * `PRE_CONTRACT_KINDS`— tira con el nombre adentro, en vez de resolverse como un
 * bunker que nadie pidió.
 */
function carrilImposible(kind: never): never {
    throw new Error(
        `El Momento '${String(kind)}' no tiene def ni carril pre-contrato: `
        + 'agregá su MomentDef o sumalo a PRE_CONTRACT_KINDS.',
    );
}

function resolveByContract(
    state: CaptainState,
    moment: PendingMoment,
    def: AnyMomentDef,
    outcome: MomentOutcome,
): MomentResolution {
    const result = def.resolve(moment.setup!, outcome);
    applyMomentDeltas(state, result.deltas);

    const chain = nextChain(moment, result);
    if (chain) {
        // La cadena es la jugada SIGUIENTE de la temporada: el registro de la
        // que se está resolviendo lo empuja el reducer recién al volver de acá,
        // así que el índice se adelanta a mano y no se lee de `moments`.
        state.pendingMoment = buildPending(
            state,
            chain,
            { minute: moment.minute, scoreDelta: moment.scoreDelta, pressure: moment.pressure },
            momentIndex(state) + 1,
            true,
        );
    }

    return {
        continues: chain !== null,
        record: { season: state.season, kind: moment.kind, result: result.result, text: result.text },
    };
}

function resolveTackle(
    state: CaptainState,
    moment: PendingMoment,
    zone: TackleZone,
    at: number,
    rng: Rng,
): MomentResolution {
    const minuto = `Minuto ${moment.minute}`;

    if (zone === 'legal') {
        state.pendingStatBoost += 2;
        state.fame = Math.min(100, state.fame + 1.5);
        return {
            continues: false,
            record: {
                season: state.season,
                kind: 'tackle',
                result: 'Tackle dominante',
                text: `${minuto}: lo frenaste en seco a dos metros de la línea y la pelota volvió para atrás.`,
            },
        };
    }

    if (zone === 'piernas') {
        return {
            continues: false,
            record: {
                season: state.season,
                kind: 'tackle',
                result: 'Tackle a las piernas',
                text: `${minuto}: lo bajaste, pero de tan abajo que descargó igual y siguieron avanzando.`,
            },
        };
    }

    if (zone === 'tarde') {
        state.fame = Math.max(0, state.fame - 2);
        return {
            continues: false,
            record: {
                season: state.season,
                kind: 'tackle',
                result: 'Te pasó por arriba',
                text: `${minuto}: llegaste tarde y te pasó por arriba. Try.`,
            },
        };
    }

    // Alto: se va al bunker. El veredicto se decide ACÁ —con el rng sembrado y
    // pesado por cuánto te pasaste— y la escena solo lo revela.
    const zones = tackleZones(state.player, state.damage.cuerpo, moment.pressure);
    const ancho = Math.max(0.001, zones.altoEnd - zones.legalEnd);
    const depth = Math.min(1, Math.max(0, (at - zones.legalEnd) / ancho));
    state.pendingMoment = { ...moment, kind: 'bunker', verdict: bunkerVerdict(depth, rng) };

    return {
        continues: true,
        record: {
            season: state.season,
            kind: 'tackle',
            result: 'Tackle alto',
            text: `${minuto}: llegaste con el hombro a la altura de la cabeza. El referee cruzó los brazos.`,
        },
    };
}

function resolveBunker(state: CaptainState, verdict: BunkerVerdict): MomentResolution {
    if (verdict === 'roja-20') {
        // Todo juego sucio con contacto en la cabeza entra como mínimo en el
        // rango medio del Reglamento 17: seis semanas de punto de entrada.
        state.pendingSanction += 4;
        state.fame = Math.max(0, state.fame - 5);
        state.player.flags['tarjetas-rojas'] = (state.player.flags['tarjetas-rojas'] ?? 0) + 1;
        return {
            continues: false,
            record: {
                season: state.season,
                kind: 'bunker',
                result: 'Roja de veinte',
                text: 'El oficial revisor la subió a roja. Te fuiste y el equipo jugó veinte minutos con catorce.',
            },
        };
    }

    state.pendingSanction += 1;
    state.fame = Math.max(0, state.fame - 1.5);
    state.player.flags['tarjetas-amarillas'] = (state.player.flags['tarjetas-amarillas'] ?? 0) + 1;
    return {
        continues: false,
        record: {
            season: state.season,
            kind: 'bunker',
            result: 'Amarilla',
            text: 'Quedó en amarilla. Diez minutos afuera mirando cómo el partido se te iba de las manos.',
        },
    };
}

export { MOMENT_LABEL };
