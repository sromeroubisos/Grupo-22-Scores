import type { AttributeKey, Attributes, Position } from '../types/player.ts';
import type { Effect, EventOption } from '../types/event.ts';
import { getPosition } from '../data/positions.ts';

/**
 * LOS CINCO EJES CON LOS QUE EL JUEGO HABLA.
 *
 * El motor piensa en ocho atributos, cinco variables dinámicas, banderas y
 * multiplicadores. El jugador no: el jugador piensa en si va a jugar mejor, si
 * va a jugar más, si se va a romper, si lo van a suspender y si lo van a
 * conocer. Este módulo es el único traductor entre las dos cosas.
 *
 *   ⭐ Valoración      — puntos de OVR (atributos por el peso del puesto)
 *   🕒 Tiempo de juego — fracción de fechas que llega a disputar
 *   🩹 Lesión          — lesión concreta o riesgo
 *   🚫 Sanción         — tarjeta y partidos de suspensión
 *   🌟 Reputación      — fama
 *
 * Y tres ejes secundarios que existen para que la tarjeta no MIENTA: ánimo,
 * físico y selección. Sin ellos, media docena de decisiones que mueven moral o
 * fatiga se mostrarían como "sin cambios", que es peor que no mostrar nada.
 *
 * TODO SALE DEL EFECTO, nada se declara dos veces. Es lo que permite que las
 * setenta y una decisiones que ya existían hablen el idioma nuevo sin reescribir
 * una sola: la valoración de `{ power: 3, stamina: 2 }` no es una etiqueta que
 * alguien tipeó, es el OVR que ese efecto mueve de verdad en ese puesto.
 *
 * Es PRESENTACIÓN y por lo tanto no entra en `CareerState`: se recalcula en cada
 * render, igual que el escudo de una oferta.
 */

export type ImpactAxis =
    | 'valoracion'
    | 'minutos'
    | 'lesion'
    | 'sancion'
    | 'reputacion'
    | 'animo'
    | 'fisico'
    | 'seleccion'
    | 'planilla'
    | 'titulo'
    | 'puesto'
    | 'club'
    | 'retiro';

export type ImpactTone = 'good' | 'bad' | 'neutral';

/**
 * QUÉ DICE EL VALOR DE LA FICHA, antes de ser una frase.
 *
 * `value` es el texto en español, que es el idioma canónico del juego. Esto es lo
 * MISMO dicho en datos, y existe por una razón concreta: la capa de idioma
 * (`i18n/`) tiene que poder escribir "Yellow · 2 matches" sin parsear
 * "Amarilla · 2 partidos". Traducir strings con expresiones regulares funciona
 * hasta que alguien agrega un caso, y entonces falla en silencio mostrando el
 * español en la pantalla en inglés.
 *
 * No entra en `CareerState` —es presentación, como todo este módulo— así que
 * agregarlo no invalida ninguna partida guardada ni mueve el `stateHash`.
 */
export type ChipValue =
    /** Un número con signo: la ⭐ y la planilla. */
    | { kind: 'signed'; amount: number; decimals: 0 | 1 }
    /** Escalones ↑ / ↑↑ / ↑↑↑ sin rótulo propio: minutos, reputación, ánimo. */
    | { kind: 'arrows'; steps: number; up: boolean }
    /** Escalones CON rótulo: "Riesgo ↑↑", "Tests ↑", "Chance ↑", "Carga ↑↑". */
    | { kind: 'labelled-arrows'; of: 'risk' | 'tests' | 'title-chance' | 'load'; steps: number; up: boolean }
    | { kind: 'injury'; severity: 'leve' | 'moderada' | 'grave' }
    | { kind: 'sanction'; card: 'amarilla' | 'roja' | null; matches: number }
    | { kind: 'selection-risk'; seasons: number }
    | { kind: 'stat'; stat: 'tries' | 'tackles'; amount: number }
    | { kind: 'position'; position: Position }
    | { kind: 'club-change' }
    | { kind: 'retire' };

export interface ImpactChip {
    axis: ImpactAxis;
    icon: string;
    label: string;
    /** Valor ya resuelto a texto EN ESPAÑOL: '+2', '↑↑', 'Amarilla · 2 partidos'. */
    value: string;
    /** El mismo valor en datos, para que otro idioma pueda escribirlo. */
    detail: ChipValue;
    /**
     * Número que GIRA en la animación de revelado. null cuando el eje no se
     * cuenta con números (una tarjeta amarilla no es un número).
     */
    amount: number | null;
    /** Decimales con los que se muestra `amount`. */
    decimals: 0 | 1;
    tone: ImpactTone;
}

interface AxisMeta {
    icon: string;
    label: string;
    /** Cuánto pesa el eje para decidir si el desenlace fue bueno o malo. */
    weight: number;
}

/** Orden de lectura. Los cinco ejes primero, en el orden en que importan. */
export const AXIS_META: Readonly<Record<ImpactAxis, AxisMeta>> = {
    valoracion: { icon: '⭐', label: 'Valoración', weight: 3 },
    minutos: { icon: '🕒', label: 'Tiempo de juego', weight: 2 },
    lesion: { icon: '🩹', label: 'Lesión', weight: 3 },
    sancion: { icon: '🚫', label: 'Sanción', weight: 3 },
    reputacion: { icon: '🌟', label: 'Reputación', weight: 1 },
    seleccion: { icon: '🎽', label: 'Selección', weight: 2 },
    animo: { icon: '❤️', label: 'Ánimo', weight: 1 },
    fisico: { icon: '🔋', label: 'Físico', weight: 1 },
    planilla: { icon: '📋', label: 'Planilla', weight: 1 },
    titulo: { icon: '🏆', label: 'Título', weight: 1 },
    puesto: { icon: '🔁', label: 'Puesto', weight: 0 },
    club: { icon: '🛡️', label: 'Club', weight: 0 },
    retiro: { icon: '🏁', label: 'Carrera', weight: 0 },
};

const AXIS_ORDER: readonly ImpactAxis[] = [
    'valoracion', 'minutos', 'lesion', 'sancion', 'reputacion',
    'seleccion', 'planilla', 'titulo', 'animo', 'fisico', 'puesto', 'club', 'retiro',
];

const ATTR_KEYS: readonly AttributeKey[] = [
    'power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina',
];

/** Debajo de esto un movimiento no se muestra: es ruido, no información. */
const EPSILON = 0.05;

// ── ⭐ Valoración ─────────────────────────────────────────────────────────────

/**
 * Puntos de OVR que mueve el efecto EN ESE PUESTO.
 *
 * Es la misma cuenta que `ovrExact`, aplicada a los deltas: el OVR es una suma
 * ponderada, así que el delta del OVR es la suma ponderada de los deltas. No hay
 * aproximación acá — lo que devuelve esta función es exactamente lo que el
 * jugador va a ver moverse en la cabecera.
 */
export function ovrDeltaOf(effect: Effect, position: Position, headroom = Infinity): number {
    const weights = getPosition(position).weights;
    let sum = 0;
    for (const key of ATTR_KEYS) {
        const delta = effect[key];
        if (delta !== undefined) sum += delta * weights[key];
    }
    return sum / 100 + appliedValoracion(effect, headroom);
}

/**
 * ⭐ EN PUNTOS ENTEROS, de 1 a 4.
 *
 * Un "+0,2" no es una decisión: es ruido con forma de premio. Si el efecto mueve
 * algo, mueve por lo menos UN punto de valoración; y nunca más de cuatro, porque a
 * partir de ahí una sola tarjeta compite con el desarrollo de una temporada entera.
 *
 * El motor APLICA este número, no sólo lo muestra (`apply-decision` corrige los
 * atributos para que el OVR se mueva exactamente lo prometido). Es la misma
 * disciplina de siempre: la tarjeta no puede prometer una cosa y el motor hacer
 * otra — sólo que ahora la promesa es un entero.
 *
 * Mantiene el SIGNO y la DIRECCIÓN del efecto declarado: un evento escrito con
 * `{ power: 3, stamina: 2 }` sigue siendo un evento de físico, y lo único que
 * cambia es cuánto pesa en total.
 */
export const STAR_MIN = 1;
export const STAR_MAX = 4;

/**
 * TRAMOS, no redondeo. Y es la diferencia entre que la decision signifique algo o no.
 *
 * Redondeando el OVR crudo, las tres opciones del foco de pretemporada daban +1 las
 * tres: gimnasio mueve 0,94 en un pilar y 0,50 en un wing, tecnica 0,96 en un
 * apertura y 0,48 en un pilar — y todo eso redondea a 1. La ⭐ terminaba escondiendo
 * exactamente lo que la hace interesante, que es que cada puesto crece con otra cosa.
 *
 * Con tramos, el MISMO evento reparte distinto segun el puesto: el pilar saca +3 del
 * gimnasio y +1 de la tecnica, el apertura al reves. El +4 queda para el efecto que
 * cae de lleno en lo que el puesto usa (hacerse cargo de los palos en un apertura,
 * la formacion fija en un pilar).
 *
 * Los cortes estan MEDIDOS contra los dos invariantes de progresion: mas arriba la
 * ⭐ inyecta tanto OVR que el jugador toca su techo a los veinticuatro y pasa media
 * carrera quieto (`progression-ceiling.test.ts` lo acota), y mas abajo se vuelve a
 * aplanar en +1 para todo el mundo.
 */
const STAR_BANDS: readonly number[] = [0.42, 0.88, 1.34];

export function starPoints(rawDelta: number, riskBonus = 0): number {
    const magnitude = Math.abs(rawDelta);
    if (magnitude < 1e-9) return 0;
    let stars = STAR_MAX;
    for (let i = 0; i < STAR_BANDS.length; i++) {
        if (magnitude < STAR_BANDS[i]) { stars = i + STAR_MIN; break; }
    }
    // EL RIESGO PAGA. La prima va sólo hacia arriba: el desenlace bueno de una
    // apuesta vale más que el resultado seguro, y el malo ya se castiga solo.
    if (rawDelta > 0) return Math.min(STAR_MAX, stars + riskBonus);
    return -stars;
}

/**
 * La ⭐ que le corresponde a un efecto en ese puesto, ya entera y ya acotada por el
 * techo del jugador. Es LA función: la usan la tarjeta, el revelado y el motor.
 */
export function starDeltaOf(effect: Effect, position: Position, headroom = Infinity, riskBonus = 0): number {
    const star = starPoints(ovrDeltaOf(effect, position), riskBonus);
    if (star <= 0) return star;
    return Math.min(star, Math.max(0, Math.round(headroom)));
}

/**
 * LA PRIMA DE RIESGO: cuánto más vale un desenlace por haber sido una apuesta.
 *
 * "Ponerse el equipo al hombro" con 60/40 y "jugar para el equipo" a lo seguro daban
 * las dos +1, y así la ruleta no tiene sentido: el jugador aprende que arriesgar no
 * paga y elige siempre lo seguro. Ahora el desenlace bueno de una apuesta suma uno o
 * dos puntos más que el mismo efecto garantizado.
 *
 * Sale de la PROBABILIDAD DE QUE SALGA PEOR, no de un campo que haya que escribir en
 * cada evento: si a este desenlace le compiten desenlaces peores por el 25% o más, la
 * apuesta era real y se paga; del 50% para arriba se paga doble. Un evento nuevo
 * hereda la regla sin declarar nada, y un evento con dos desenlaces igual de buenos
 * no cobra prima — porque ahí no había riesgo.
 */
const RISK_SINGLE = 25;
const RISK_DOUBLE = 50;

export function riskBonusOf(option: EventOption, outcomeIndex: number, position: Position): number {
    if (option.outcomes.length < 2) return 0;
    const outcome = option.outcomes[outcomeIndex];
    if (outcome === undefined) return 0;

    const shares = sharesOf(option.outcomes.map((o) => o.weight));
    const mio = toneScore(effectChips(outcome.effect, position));
    let peores = 0;
    option.outcomes.forEach((other, i) => {
        if (i === outcomeIndex) return;
        if (toneScore(effectChips(other.effect, position)) < mio) peores += shares[i];
    });

    if (peores >= RISK_DOUBLE) return 2;
    if (peores >= RISK_SINGLE) return 1;
    return 0;
}

/**
 * ⭐ que REALMENTE se aplica, con el techo del jugador de por medio.
 *
 * El potencial es un techo que se alcanza y que no se pasa por arriba — hay un
 * invariante medido que lo vigila (`progression-ceiling.test.ts`: menos del 5% de
 * las carreras puede superarlo por más de dos puntos). Una decisión que regale
 * OVR por encima del techo lo rompería, y encima lo rompería en la punta de la
 * carrera, que es donde más se nota.
 *
 * Así que se acota acá, en una sola función, y la usan los dos lados: el motor
 * para aplicar y el revelado para contar lo que pasó. `headroom` es lo que le
 * falta al jugador para su techo; sin dato, no hay tope.
 *
 * El techo NO se filtra por esto: la ficha muestra "+0", que es la verdad
 * ("entrenaste y ya no te queda margen"), y nunca el número escondido.
 */
export function appliedValoracion(effect: Effect, headroom = Infinity): number {
    const declared = effect.valoracion ?? 0;
    if (declared <= 0) return declared;
    return Math.min(declared, Math.max(0, headroom));
}

/**
 * Reparte ⭐ entre los atributos, proporcionalmente al peso de cada uno en el
 * OVR del puesto.
 *
 * `delta_i = k · w_i` con `k = 100 · puntos / Σ w_i²`, que es la única forma de
 * repartir proporcional al peso y aterrizar EXACTO en los puntos prometidos:
 * `Σ delta_i · w_i / 100 = k · Σ w_i² / 100 = puntos`.
 *
 * No hay redondeo y por lo tanto no hay reparto de sobrantes: los atributos se
 * guardan como flotantes justamente para que el envejecimiento no destruya
 * técnica de golpe, y acá se aprovecha lo mismo.
 */
export function spreadValoracion(weights: Attributes, points: number): Partial<Record<AttributeKey, number>> {
    let squares = 0;
    for (const key of ATTR_KEYS) squares += weights[key] * weights[key];
    if (squares === 0) return {};

    const k = (100 * points) / squares;
    const spread: Partial<Record<AttributeKey, number>> = {};
    for (const key of ATTR_KEYS) {
        if (weights[key] > 0) spread[key] = k * weights[key];
    }
    return spread;
}

// ── Texto de los ejes ────────────────────────────────────────────────────────

/** Un signo menos de verdad (U+2212), no un guión: alinea con los dígitos. */
function signed(value: number, decimals: 0 | 1): string {
    const abs = Math.abs(value).toFixed(decimals).replace('.', ',');
    return `${value > 0 ? '+' : '−'}${abs}`;
}

/** Escalones: 1, 2 o 3. Es la escala que pidió el diseño (↑ / ↑↑). */
function arrowSteps(value: number, unit: number): number {
    return Math.min(3, Math.max(1, Math.ceil(Math.abs(value) / unit)));
}

function chip(
    axis: ImpactAxis,
    value: string,
    detail: ChipValue,
    tone: ImpactTone,
    amount: number | null = null,
    decimals: 0 | 1 = 0,
): ImpactChip {
    const meta = AXIS_META[axis];
    return { axis, icon: meta.icon, label: meta.label, value, detail, amount, decimals, tone };
}

/** Ficha de escalones, con y sin rótulo. Evita repetir el par texto/descriptor. */
function arrowChip(
    axis: ImpactAxis,
    value: number,
    unit: number,
    tone: ImpactTone,
    of: Extract<ChipValue, { kind: 'labelled-arrows' }>['of'] | null = null,
    prefix = '',
): ImpactChip {
    const steps = arrowSteps(value, unit);
    const up = value > 0;
    const drawn = (up ? '↑' : '↓').repeat(steps);
    return chip(
        axis,
        prefix === '' ? drawn : `${prefix} ${drawn}`,
        of === null ? { kind: 'arrows', steps, up } : { kind: 'labelled-arrows', of, steps, up },
        tone,
    );
}

const CARD_LABEL: Readonly<Record<'amarilla' | 'roja', string>> = {
    amarilla: 'Amarilla',
    roja: 'Roja',
};

function matchesLabel(matches: number): string {
    return `${matches} ${matches === 1 ? 'partido' : 'partidos'}`;
}

/**
 * Las fichas de un efecto, en orden de lectura.
 *
 * Un efecto vacío devuelve una lista vacía: quien la muestre decide si eso es
 * "sin cambios" o directamente nada.
 */
export function effectChips(effect: Effect, position: Position, headroom = Infinity, riskBonus = 0): ImpactChip[] {
    const chips: ImpactChip[] = [];

    // ⭐ El único eje con número, y va en PUNTOS ENTEROS (1 a 4).
    const ovr = starDeltaOf(effect, position, headroom, riskBonus);
    if (ovr !== 0) {
        chips.push(chip('valoracion', signed(ovr, 0), { kind: 'signed', amount: ovr, decimals: 0 }, ovr > 0 ? 'good' : 'bad', ovr, 0));
    }

    // 🕒 Los escalones declarados MÁS la forma, que es el otro camino por el que
    // una decisión mueve minutos: la forma entra en el OVR efectivo y el OVR
    // efectivo es lo que se compara contra el rating del club para repartir
    // fechas. Un escalón vale como cinco puntos de forma.
    const minutos = (effect.playingTime ?? 0) + (effect.form ?? 0) / 5;
    if (Math.abs(minutos) >= 0.2) {
        chips.push(arrowChip('minutos', minutos, 1.2, minutos > 0 ? 'good' : 'bad'));
    }

    // 🩹 La lesión concreta gana sobre el riesgo: cuando te rompés, que el riesgo
    // además suba es una nota al pie y no una segunda noticia.
    if (effect.forceInjury) {
        const { severity } = effect.forceInjury;
        chips.push(chip('lesion', capitalize(severity), { kind: 'injury', severity }, 'bad'));
    } else if (effect.injuryRisk !== undefined && effect.injuryRisk !== 0) {
        chips.push(arrowChip('lesion', effect.injuryRisk, 5, effect.injuryRisk > 0 ? 'bad' : 'good', 'risk', 'Riesgo'));
    }

    // 🚫 Tarjeta y partidos, que no son lo mismo (ver `Sanction`).
    if (effect.sanction) {
        const { card, matches = 0 } = effect.sanction;
        const parts: string[] = [];
        if (card) parts.push(CARD_LABEL[card]);
        if (matches > 0) parts.push(matchesLabel(matches));
        chips.push(chip(
            'sancion',
            parts.length > 0 ? parts.join(' · ') : 'Citación',
            { kind: 'sanction', card: card ?? null, matches },
            'bad',
        ));
    }

    // 🌟 Reputación.
    if (effect.fame !== undefined && effect.fame !== 0) {
        chips.push(arrowChip('reputacion', effect.fame, 4, effect.fame > 0 ? 'good' : 'bad'));
    }

    // 🎽 Selección: cuántos tests juega el que ya está adentro, y el castigo que
    // lo puede dejar afuera.
    if (effect.testShare !== undefined && effect.testShare !== 1) {
        const delta = effect.testShare - 1;
        chips.push(arrowChip('seleccion', delta, 0.15, delta > 0 ? 'good' : 'bad', 'tests', 'Tests'));
    }
    if (effect.selectionPenalty) {
        const { seasons } = effect.selectionPenalty;
        chips.push(chip(
            'seleccion',
            `Camiseta en riesgo · ${seasons === 1 ? '1 temporada' : `${seasons} temporadas`}`,
            { kind: 'selection-risk', seasons },
            'bad',
        ));
    }

    // 📋 Planilla: lo que en otro juego sería plata.
    if (effect.statBoost) {
        const { tries = 0, tackles = 0 } = effect.statBoost;
        if (tries !== 0) {
            chips.push(chip('planilla', `${signed(tries, 0)} ${tries === 1 ? 'try' : 'tries'}`, { kind: 'stat', stat: 'tries', amount: tries }, tries > 0 ? 'good' : 'bad'));
        }
        if (tackles !== 0) {
            chips.push(chip('planilla', `${signed(tackles, 0)} tackles`, { kind: 'stat', stat: 'tackles', amount: tackles }, tackles > 0 ? 'good' : 'bad'));
        }
    }

    if (effect.titleBoost) {
        chips.push(arrowChip('titulo', effect.titleBoost, 0.15, effect.titleBoost > 0 ? 'good' : 'bad', 'title-chance', 'Chance'));
    }

    if (effect.morale !== undefined && effect.morale !== 0) {
        chips.push(arrowChip('animo', effect.morale, 4, effect.morale > 0 ? 'good' : 'bad'));
    }

    // 🔋 El físico se lee al revés: fatiga que SUBE es carga, y la carga no es
    // una buena noticia.
    if (effect.fatigue !== undefined && effect.fatigue !== 0) {
        chips.push(arrowChip('fisico', effect.fatigue, 5, effect.fatigue > 0 ? 'bad' : 'good', 'load', 'Carga'));
    }

    if (effect.changePosition) {
        const target = effect.changePosition;
        chips.push(chip('puesto', getPosition(target).labelEs, { kind: 'position', position: target }, 'neutral'));
    }
    if (effect.moveToOffer) {
        chips.push(chip('club', 'Cambio de club', { kind: 'club-change' }, 'neutral'));
    }
    if (effect.retire) {
        chips.push(chip('retiro', 'Cerrás la carrera', { kind: 'retire' }, 'neutral'));
    }

    return chips.sort((a, b) => AXIS_ORDER.indexOf(a.axis) - AXIS_ORDER.indexOf(b.axis));
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * ¿El desenlace fue bueno o malo PARA EL JUGADOR? Es lo que decide si el
 * revelado se ilumina en verde o en rojo.
 *
 * Se pesa por eje y no se cuentan fichas: romperse la rodilla y ganar un punto
 * de ánimo no es un empate.
 */
export function toneScore(chips: readonly ImpactChip[]): number {
    let score = 0;
    for (const c of chips) {
        const weight = AXIS_META[c.axis].weight;
        if (c.tone === 'good') score += weight;
        else if (c.tone === 'bad') score -= weight;
    }
    return score;
}

export function toneOf(chips: readonly ImpactChip[]): ImpactTone {
    const score = toneScore(chips);
    return score > 0 ? 'good' : score < 0 ? 'bad' : 'neutral';
}

// ── Posibilidades de una opción ──────────────────────────────────────────────

// ── Lo que se MUESTRA: dos ejes ──────────────────────────────────────────────

/**
 * LA PANTALLA HABLA DE DOS EJES, aunque el motor sepa de trece.
 *
 * Con siete fichas por desenlace la tarjeta dejaba de decidirse y pasaba a
 * leerse: "⭐ +0,6 · 🌟 ↑↑ · ❤️ ↑↑" es un tablero, y el jugador tiene que poder
 * elegir de un vistazo. Los dos que quedan son los que cambian la carrera —cuánto
 * valés y cuánto jugás—; el resto son medios para llegar a esos dos.
 *
 * Nada se esconde: lo que costaba fichas propias entra donde CORRESPONDE. Una
 * lesión, una suspensión y una amarilla son, todas, tiempo de juego que se pierde
 * —es literalmente lo que son— así que se cuentan en 🕒. Y el ánimo, el físico y
 * la reputación siguen viviendo en el estado y en el relato del desenlace, que es
 * donde se leen mejor que en un chip.
 *
 * El COLOR del revelado sí se calcula con el modelo completo (`toneOf` sobre
 * `effectChips`): una suspensión tiene que iluminarse en rojo aunque su ficha no
 * esté a la vista.
 */
export const VISIBLE_AXES: readonly ImpactAxis[] = ['valoracion', 'minutos'];

/** Cuánto tiempo de juego cuesta una lesión, según su gravedad, como piso. */
const INJURY_FLOOR: Readonly<Record<'leve' | 'moderada' | 'grave', number>> = {
    leve: 0.6,
    moderada: 1.4,
    grave: 2.6,
};

/**
 * 🕒 TODO lo que mueve cuánto vas a jugar, en escalones.
 *
 *   · los escalones declarados por la decisión;
 *   · la forma, que entra en el OVR efectivo y con él en el reparto de fechas;
 *   · la lesión, por las fechas que se lleva (con piso por gravedad: hay lesiones
 *     que no se saltan un partido y igual te dejan jugando a media máquina);
 *   · la sanción, por los partidos de suspensión — y una amarilla también cuenta,
 *     porque diez minutos afuera son diez minutos que no jugás.
 */
function minutesScore(effect: Effect): number {
    let score = (effect.playingTime ?? 0) + (effect.form ?? 0) / 5;

    if (effect.forceInjury) {
        const floor = INJURY_FLOOR[effect.forceInjury.severity];
        score -= Math.max(floor, effect.forceInjury.seasonsOut * 6);
    }

    if (effect.sanction) {
        const matches = effect.sanction.matches ?? 0;
        score -= matches > 0 ? 0.6 + matches * 0.6 : 0.5;
    }

    return score;
}

/**
 * Las fichas que van a la pantalla: valoración y tiempo de juego, nada más.
 *
 * Devuelve una lista vacía cuando el desenlace no mueve ninguno de los dos —y eso
 * es un dato, no un agujero: hay opciones que existen para no arriesgar nada—.
 */
export function visibleChips(effect: Effect, position: Position, headroom = Infinity, riskBonus = 0): ImpactChip[] {
    const chips: ImpactChip[] = [];

    // ⭐ El único eje con número, y va en PUNTOS ENTEROS (1 a 4).
    const ovr = starDeltaOf(effect, position, headroom, riskBonus);
    if (ovr !== 0) {
        chips.push(chip('valoracion', signed(ovr, 0), { kind: 'signed', amount: ovr, decimals: 0 }, ovr > 0 ? 'good' : 'bad', ovr, 0));
    }

    const minutos = minutesScore(effect);
    if (Math.abs(minutos) >= 0.2) {
        chips.push(arrowChip('minutos', minutos, 1.2, minutos > 0 ? 'good' : 'bad'));
    }

    return chips;
}

export interface OutcomePreview {
    /** Probabilidad en porcentaje entero. Los de una opción suman 100. */
    chance: number;
    /** Las fichas VISIBLES (valoración y tiempo de juego). */
    chips: ImpactChip[];
    /** Tono del desenlace completo, incluidos los ejes que no se muestran. */
    tone: ImpactTone;
}

/**
 * LOS PORCENTAJES DEPENDEN DE TU VALORACION.
 *
 * Mientras mas alto tu OVR, mas chances de que la apuesta salga bien. Sin esto, una
 * ruleta 60/40 era 60/40 para un jugador de 50 y para uno de 85, y eso hace dos
 * cosas mal: le miente al bueno —que en la cancha resuelve mejor que el promedio— y
 * le regala al que todavia no llego.
 *
 * La inclinacion es SIMETRICA y acotada: el mejor desenlace de una opcion pasa de su
 * peso base a x1,4 en la punta de la escala y a x0,6 en el piso, y el peor al revés.
 * Una apuesta 60/40 se lee 78/22 con 85 de media y 39/61 con 50. El del medio la ve
 * como esta escrita, que es lo que el dato del evento significa: la chance del
 * jugador PROMEDIO.
 *
 * Se aplica a los dos lados —a los porcentajes que se muestran y al sorteo que
 * decide— desde la misma funcion, asi que no pueden desincronizarse.
 */
const SKILL_TILT = 0.8;
const SKILL_LOW = 50;
const SKILL_HIGH = 85;

/** Dónde cae el jugador en la escala de nivel, de 0 a 1. */
export function skillFactor(ovr: number): number {
    return Math.max(0, Math.min(1, (ovr - SKILL_LOW) / (SKILL_HIGH - SKILL_LOW)));
}

/**
 * Pesos EFECTIVOS de los desenlaces de una opción, ya inclinados por el nivel.
 *
 * Con `ovr` sin dato no inclina nada: devuelve los pesos como los escribió el
 * evento. Es lo que permite que un test o una herramienta lea la probabilidad base.
 */
export function outcomeWeights(option: EventOption, position: Position, ovr?: number): number[] {
    const base = option.outcomes.map((o) => o.weight);
    if (option.outcomes.length < 2 || ovr === undefined) return base;

    const scores = option.outcomes.map((o) => toneScore(effectChips(o.effect, position)));
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    // Dos desenlaces igual de buenos no son una apuesta: no hay a qué inclinar.
    if (best === worst) return base;

    const tilt = SKILL_TILT * (skillFactor(ovr) - 0.5);
    return base.map((w, i) => {
        const rank = (scores[i] - worst) / (best - worst); // 0 el peor, 1 el mejor
        return Math.max(0.01, w * (1 + tilt * (rank * 2 - 1)));
    });
}

/**
 * Porcentajes enteros que SUMAN 100, por resto mayor.
 *
 * Redondear cada peso por su cuenta deja "70% / 30%" en 67 y 33, o peor, en dos
 * números que suman 99 y hacen dudar de todo lo demás que muestra la tarjeta.
 */
function sharesOf(weights: readonly number[]): number[] {
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) return weights.map(() => 0);

    const raw = weights.map((w) => (w / total) * 100);
    const shares = raw.map((v) => Math.floor(v));
    let rest = 100 - shares.reduce((sum, v) => sum + v, 0);

    // Orden estable: primero el resto más grande y, ante empate, el que viene
    // antes. Sin el desempate por índice el reparto dependería del sort del
    // motor de JS, que es exactamente la clase de no-determinismo encubierto que
    // el CLAUDE.md §1 prohíbe.
    const byRest = raw
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);

    for (const { i } of byRest) {
        if (rest <= 0) break;
        shares[i] += 1;
        rest -= 1;
    }
    return shares;
}

/**
 * Las posibilidades de una opción, listas para mostrar ANTES de elegir.
 *
 * Acá vivía la regla contraria: "nunca números ni probabilidades". Se cambió a
 * propósito — una decisión a ciegas entre dos frases no es una decisión, es una
 * moneda con texto. Mostrar 70/30 no le saca tensión al juego: se la da, porque
 * el jugador puede decidir cuánto riesgo quiere correr.
 */
export function optionPreview(option: EventOption, position: Position, headroom = Infinity, ovr?: number): OutcomePreview[] {
    const shares = sharesOf(outcomeWeights(option, position, ovr));
    return option.outcomes.map((outcome, i) => {
        // La prima de riesgo va en la ficha: el jugador tiene que VER que la apuesta
        // paga más antes de elegirla, o la regla no cambia ninguna decisión.
        const risk = riskBonusOf(option, i, position);
        return {
            chance: shares[i],
            // Se muestran dos ejes; el tono se calcula con los trece.
            chips: visibleChips(outcome.effect, position, headroom, risk),
            tone: toneOf(effectChips(outcome.effect, position, headroom)),
        };
    });
}
