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

import type { CaptainPlayer, PositionFamilyId } from '../types/player.ts';
import type { CaptainState } from '../types/captain.ts';
import type {
    BunkerVerdict,
    MomentKind,
    MomentOutcome,
    MomentRecord,
    PendingMoment,
    TackleZone,
} from '../types/moment.ts';
import type { MomentDeltas, MomentResult, MomentSetupCtx } from '../types/moment-def.ts';
import type { Rng } from './random.ts';
import { FAME_MAX, FAME_MIN } from '../types/currencies.ts';
import { MOMENT_LABEL, SELECTABLE_MOMENTS } from '../types/moment-kinds.ts';
import { createRng, hashSeed } from './random.ts';
import type { AnyMomentDef } from './moment-defs/index.ts';
import { getMomentDef } from './moment-defs/index.ts';
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
 * Cuánto oficio tiene el que juega un Momento que no es de su puesto.
 *
 * HOY NO SE USA EN PARTIDA: `pickMomentKind` solo ofrece Momentos elegibles, así
 * que el que juega el jackal es siempre tercera línea y el oficio es 1. Existe
 * igual, y no es adorno: el día que un transversal pase por el contrato —el
 * tackle es el candidato— un wing y un flanker no lo pueden jugar con los mismos
 * márgenes. Los tests del jackal sí lo ejercitan, llamando al `setup` derecho.
 */
const OUTSIDER_PROFICIENCY = 0.75;

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

/** Las familias a las que les toca un kind. `null` es transversal. */
function familiesOf(kind: MomentKind): readonly PositionFamilyId[] | null {
    const def = getMomentDef(kind);
    // Sin def es pre-contrato, y los dos pre-contrato son transversales.
    return def ? def.families : null;
}

function appliesTo(kind: MomentKind, family: PositionFamilyId): boolean {
    const families = familiesOf(kind);
    return families === null || families.includes(family);
}

function weightOf(kind: MomentKind): number {
    return getMomentDef(kind)?.weight ?? TACKLE_WEIGHT;
}

/**
 * Cuál de los Momentos elegibles toca.
 *
 * Sale de una semilla DERIVADA, no del stream de la carrera (ver la cabecera).
 * Se recorre `SELECTABLE_MOMENTS`, que está en orden canónico: nunca
 * `Object.keys` sobre el registry.
 */
export function pickMomentKind(seed: number, season: number, family: PositionFamilyId): MomentKind {
    const elegibles = SELECTABLE_MOMENTS.filter((kind) => appliesTo(kind, family));
    // El tackle le toca a todos, así que el pool nunca queda vacío. Si algún día
    // dejara de ser transversal, esto avisa en vez de devolver `undefined`.
    if (elegibles.length === 0) return 'tackle';

    const rng = createRng(hashSeed(`${seed}:${season}:momentPick`));
    return rng.weighted(elegibles, weightOf);
}

/** Cuánto es tuya esta jugada. Ver `OUTSIDER_PROFICIENCY`. */
export function proficiencyFor(kind: MomentKind, family: PositionFamilyId): number {
    const families = familiesOf(kind);
    if (families === null) return 1;
    return families.includes(family) ? 1 : OUTSIDER_PROFICIENCY;
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
        proficiency: proficiencyFor(kind, state.player.family),
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
export function rollMoment(state: CaptainState, rng: Rng): PendingMoment | null {
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
    const kind = pickMomentKind(state.seed, state.season, state.player.family);

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
 * la acción no vale, el estado no se mueve y nada explota. El chequeo vive ACÁ
 * y no adentro de cada def, porque el registry borra los genéricos y la garantía
 * de tipos se pierde justo en el borde: si cada def tuviera que defenderse sola,
 * el decimoquinto Momento se va a olvidar.
 */
export function resolveMoment(
    state: CaptainState,
    moment: PendingMoment,
    outcome: MomentOutcome,
    rng: Rng,
): MomentResolution | null {
    if (outcome.kind !== moment.kind) return null;

    const def = getMomentDef(moment.kind);
    if (def && moment.setup) return resolveByContract(state, moment, def, outcome);

    if (outcome.kind === 'tackle') return resolveTackle(state, moment, outcome.zone, outcome.at, rng);
    // El veredicto ya estaba decidido cuando el jugador entró al bunker.
    return resolveBunker(state, moment.verdict ?? 'amarilla');
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
