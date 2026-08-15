// LA BANDA — la corrida por la orilla, para el wing y el fullback.
//
// Te la pasan con veinte metros por delante y la raya de cal a tu izquierda.
// Tres, cuatro o cinco tipos vienen a cerrarte, uno atrás del otro, y la cancha
// se va achicando sola: cada uno que quebrás te empuja un poco más afuera.
//
// ── El verbo es ELEGIR CUÁNDO, y es el sexto distinto ──
// Frenar (tackle), esperar (jackal), insistir (ancla), acordarse (código),
// apuntar (palos), y ahora AGUANTAR. La diferencia con El Ancla —que es el otro
// de apostar— es qué te juega en contra: allá hay un punto de quiebre oculto y
// el riesgo es de él; acá no hay nada oculto y el riesgo es TUYO, porque el
// recurso que se gasta es la cancha que te queda.
//
// El defensor viene y vos elegís a qué distancia lo resolvés:
//
//   amague     LEJOS       lo resolvés antes de que llegue. Seguro y CARO: para
//                          amagar te abrís, y abrirse es comerse la cancha.
//   ritmo      A MEDIA     el cambio de paso. El término medio en todo.
//   atropellar SOLO ENCIMA le pasás por arriba, derecho. No te cuesta un metro
//                          de cancha, te cuesta el cuerpo, y hay que aguantarlo
//                          hasta que lo tenés en la cara.
//
// El verbo no lo elegís aparte de la distancia: la distancia ES la elección.
// Tirar el hombro cuando está a diez metros no es atropellar, es correr solo; y
// amagar cuando ya te tiene agarrado no es amagar, es adornar. Por eso `resolve`
// pide las dos cosas juntas —qué hiciste y a qué distancia— y las cruza.
//
// ── LA CAL CORTA LA JUGADA, NO BORRA LOS METROS ──
// Es la regla que ordena todo el Momento y viene del reglamento, no del diseño:
// pisar la línea termina la jugada ahí, pero los cuarenta metros que corriste no
// se deshacen —el line-out se forma donde saliste—. El try se pierde, los metros
// no.
//
// De ahí salen las cuatro notas sin que haya que inventarlas:
//
//   try       rompiste a todos y te quedó cancha.
//   bien      te tacklearon después de romper. Metros sí, try no.
//   mal       te fuiste por la raya. Metros sí, try no, y la saliste vos.
//   desastre  te frenó el primero. No hay metros que contar.
//
// Que el tackle tardío puntúe mejor que la cal tardía es a propósito: que te
// tackleen es que la defensa te ganó, irte al lateral es que te ganaste solo.
//
// ── Por qué `resolve` trunca ──
// Es el primer Momento cuya mano es una SECUENCIA que puede cortarse a la mitad,
// y el contrato lo aguanta sin cambios: la mano trae lo que el jugador llegó a
// hacer, `resolve` la camina hasta el primer fallo y devuelve el parcial. Nada
// de esto necesita rng al resolver ni mirar el contexto — el orden de los
// defensores, la cancha que había y el tirón muscular ya venían sorteados en el
// Setup y viajaron al guardado.
//
// ── Calibración ──
// El wing de élite rompe 0,7 quiebres por partido y gana 72 metros (`glory` del
// puesto). Un Momento no es una corrida cualquiera: es la del try. Por eso son
// tres a cinco defensores y no uno, y por eso la cancha alcanza siempre justo
// —el mínimo teórico de espacio es un metro por defensor— pero solo si te
// bancás tenerlos encima.

import type { CaptainAttributes } from '../../types/player.ts';
import type { BandaMove, MomentOutcome } from '../../types/moment.ts';
import type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
    PlayLevel,
} from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

type BandaInput = Extract<MomentOutcome, { kind: 'banda' }>;

// ═══════════════════════════════════════════════════════════════════════════
//  Las constantes
// ═══════════════════════════════════════════════════════════════════════════

/** Cuántos vienen a cerrarte. */
const DEFENDERS_MIN = 3;
const DEFENDERS_MAX = 5;

/**
 * Los metros de cancha que te quedan hasta la cal.
 *
 * El piso NO puede bajar de `DEFENDERS_MAX`: con un metro por defensor
 * —atropellar a todos— la corrida perfecta tiene que ser posible siempre. Si el
 * espacio pudiera quedar por debajo, habría repartos donde el try no existe y el
 * jugador no tendría forma de saberlo.
 */
const SPACE_MIN = 6;
const SPACE_MAX = 12;

/** Lo que te cuesta cada forma de quebrarlo, en metros de cancha. */
const SPACE_COST = { amague: 3, ritmo: 2, atropellar: 1 } as const;

/**
 * Los metros que cuesta un verbo. Exportada porque la PANTALLA los dibuja.
 *
 * Si la pantalla se los supiera de memoria, el día que se calibre el costo del
 * amague la barra de cancha seguiría mostrando el número viejo y el jugador
 * decidiría con una cuenta que ya no es la del motor. Es el mismo criterio por
 * el que `palosLanding` está exportada: la pantalla dibuja lo que el motor
 * decide, nunca su propia copia.
 */
export function bandaSpaceCost(move: BandaMove): number {
    return SPACE_COST[move];
}

/** Hasta dónde llega el amague, con `gambeta` en el pivote. */
const GAMBETA_PIVOT = 55;
const AMAGUE_BASE = 0.22;
const AMAGUE_PER_GAMBETA = 0.004;
const AMAGUE_MIN = 0.12;
const AMAGUE_MAX = 0.40;

/**
 * Dónde empieza "encima". Es la franja más tardía y la más chica, y esa es toda
 * la apuesta: la forma más barata en cancha es la que hay que aguantar más.
 */
const ATROPELLAR_START = 0.82;

/** Cuánto tarda cada defensor en llegarte. La velocidad te da más tiempo. */
const CLOSE_BASE_MS = 1500;
const CLOSE_PER_VELOCIDAD = 9;
const CLOSE_PRESSURE_MS = 400;
const CLOSE_MIN_MS = 700;
const CLOSE_MAX_MS = 2400;

/** Lo que paga el try, y lo que pagan los metros aunque no haya try. */
const FAME_TRY = 3;
const BELONGING_TRY = 2;
const FAME_PER_BREAK = 0.6;
const BELONGING_PER_BREAK = 0.4;

/** Lo que cuesta que te frene el primero. */
const FAME_DISASTER = 2;

/** Correr es barato; pasarle por arriba a alguien, no. */
const BODY_BASE = 0.8;
const BODY_PER_ATROPELLAR = 1.5;

/**
 * EL CAÑÓN DE CRISTAL.
 *
 * Arriba de 85 de velocidad el isquiotibial se rompe solo: el músculo tira más
 * de lo que el tendón aguanta. Se sortea en el Setup y SE COBRA SE ANOTE O NO
 * —el tirón no espera a ver si llegaste—, que es exactamente lo que hace que la
 * velocidad no sea gratis.
 */
const GLASS_CANNON_SPEED = 85;
const MUSCLE_RISK_BASE = 0.05;
const MUSCLE_RISK_FAST = 0.18;
const BODY_MUSCLE_INJURY = 7;

// ═══════════════════════════════════════════════════════════════════════════
//  El Setup
// ═══════════════════════════════════════════════════════════════════════════

export interface BandaSetup extends MomentSetup {
    kind: 'banda';
    /** Cuántos te esperan, de 3 a 5. */
    defenders: number;
    /** Los metros hasta la cal cuando arrancás. */
    space: number;
    /** Hasta dónde sirve el amague, de 0 a 1. La gambeta lo ensancha. */
    amagueEnd: number;
    /** Desde dónde ya lo tenés encima. Después de 1 no hay nada: te tacklearon. */
    atropellarStart: number;
    /** Cuánto tarda cada defensor en llegar. Es dato de PANTALLA, como el sweep del tackle. */
    closeMs: number;
    /** El tirón muscular, ya sorteado. Se cobra se anote o no. */
    muscleInjury: boolean;
    minute: number;
}

/**
 * Hasta dónde te sirve el amague.
 *
 * Exportada para poder mirarla de a dos —gambeta 40 contra gambeta 90— sin
 * fabricar un contexto entero.
 */
export function bandaAmagueEnd(attrs: Readonly<CaptainAttributes>, proficiency: number): number {
    const bruta = AMAGUE_BASE + (attrs.gambeta - GAMBETA_PIVOT) * AMAGUE_PER_GAMBETA;
    // El oficio NUNCA ensancha: se acota a 1 antes de multiplicar, igual que en
    // el resto de los Momentos.
    return Math.round(Math.min(AMAGUE_MAX, Math.max(AMAGUE_MIN, bruta * Math.min(1, proficiency))) * 1000) / 1000;
}

/** Cuánto tarda en llegarte el que viene. Más velocidad, más tiempo para pensarlo. */
export function bandaCloseMs(
    attrs: Readonly<CaptainAttributes>,
    pressure: number,
    proficiency: number,
): number {
    const bruta = CLOSE_BASE_MS
        + (attrs.velocidad - GAMBETA_PIVOT) * CLOSE_PER_VELOCIDAD
        - pressure * CLOSE_PRESSURE_MS;
    return Math.round(Math.min(CLOSE_MAX_MS, Math.max(CLOSE_MIN_MS, bruta * Math.min(1, proficiency))));
}

/** Con qué probabilidad se te rompe algo por correr. El cañón de cristal. */
export function bandaMuscleRisk(attrs: Readonly<CaptainAttributes>): number {
    return attrs.velocidad > GLASS_CANNON_SPEED ? MUSCLE_RISK_BASE + MUSCLE_RISK_FAST : MUSCLE_RISK_BASE;
}

// ═══════════════════════════════════════════════════════════════════════════
//  De lo que hiciste a lo que significa
// ═══════════════════════════════════════════════════════════════════════════

// `BandaMove` —los tres verbos— vive en `types/moment.ts` con el resto del
// vocabulario de la mano. Acá se re-exporta para que quien importe el Momento no
// tenga que ir a buscarlo a dos lugares.
export type { BandaMove };

/** Cómo terminó la corrida. */
export type BandaEnding = 'try' | 'tackle' | 'cal';

export type BandaGrade = 'try' | 'bien' | 'mal' | 'desastre';

/**
 * Qué había que hacer a esa distancia.
 *
 * Es la traducción entera del minijuego y por eso vive sola: `at` es cuán cerca
 * lo dejaste llegar, de 0 (recién arranca) a 1 (te tiene agarrado). No hay
 * "casi": o lo resolviste en la franja que correspondía o no lo resolviste.
 */
export function bandaMoveAt(at: number, setup: BandaSetup): BandaMove | null {
    if (at < 0 || at > 1) return null; // no llegaste a hacer nada
    if (at < setup.amagueEnd) return 'amague';
    return at < setup.atropellarStart ? 'ritmo' : 'atropellar';
}

/**
 * La nota.
 *
 * `broken === 0` es el desastre y se chequea ANTES que el final, a propósito: te
 * haya tackleado el primero o te hayas ido por la raya sin quebrar a nadie, la
 * jugada no dejó un metro. Lo que distingue las otras dos no es cuánto
 * conseguiste sino QUIÉN te frenó — el tackle es mérito de ellos, la cal es
 * error tuyo.
 */
export function bandaGrade(broken: number, ending: BandaEnding): BandaGrade {
    if (ending === 'try') return 'try';
    if (broken === 0) return 'desastre';
    return ending === 'tackle' ? 'bien' : 'mal';
}

const RESULT_LABEL: Record<BandaGrade, string> = {
    try: 'Try en la bandera',
    bien: 'Corrida que rompió la línea',
    mal: 'Se fue por el lateral',
    desastre: 'Lo frenó el primero',
};

function cronica(grade: BandaGrade, minute: number, broken: number, metres: number): string {
    const m = `Minuto ${minute}`;
    const quebrados = `${broken} ${broken === 1 ? 'tipo' : 'tipos'}`;

    switch (grade) {
        case 'try':
            return `${m}: los pasaste a ${quebrados} por la orilla y apoyaste en la bandera con la cal pegada al botín.`;
        case 'bien':
            return `${m}: rompiste a ${quebrados} y te bajó el último con la mano en la camiseta. ${metres} metros que el equipo se llevó puestos.`;
        case 'mal':
            return `${m}: rompiste a ${quebrados} y te quedaste sin cancha. Pisaste la cal y el line-out se formó ahí, ${metres} metros más adelante.`;
        default:
            return `${m}: el primero te leyó la intención y te bajó sin que llegaras a moverte.`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  La definición
// ═══════════════════════════════════════════════════════════════════════════

export const BANDA: MomentDef<BandaSetup, BandaInput> = {
    kind: 'banda',
    // El 11, el 14 y el 15. El que corre por afuera.
    families: ['wing-fullback'],
    weight: 10,
    labelEs: 'La banda',

    setup(ctx: MomentSetupCtx): BandaSetup {
        const rng = createRng(ctx.seed);

        // Orden fijo: defensores, cancha, tirón. Cambiarlo cambia todas las
        // corridas de todas las partidas.
        const defenders = rng.int(DEFENDERS_MIN, DEFENDERS_MAX);
        const space = rng.int(SPACE_MIN, SPACE_MAX);
        const muscleInjury = rng.chance(bandaMuscleRisk(ctx.attrs));

        return {
            kind: 'banda',
            seed: ctx.seed,
            defenders,
            space,
            amagueEnd: bandaAmagueEnd(ctx.attrs, ctx.proficiency),
            atropellarStart: ATROPELLAR_START,
            closeMs: bandaCloseMs(ctx.attrs, ctx.pressure, ctx.proficiency),
            muscleInjury,
            minute: ctx.minute,
        };
    },

    resolve(setup: BandaSetup, input: BandaInput): MomentResult {
        let broken = 0;
        let remaining = setup.space;
        let atropellados = 0;
        let ending: BandaEnding = 'try';

        // LA SECUENCIA SE CAMINA HASTA EL PRIMER FALLO Y SE CORTA AHÍ.
        for (let i = 0; i < setup.defenders; i += 1) {
            const jugada = input.moves[i];

            // Sin mano para este defensor, la corrida no llegó hasta acá: te
            // bajaron. Es el caso de una pantalla que se cierra a la mitad y
            // también el de una mano corta.
            if (!jugada) { ending = 'tackle'; break; }

            // A esa distancia había que hacer otra cosa: te tiene.
            if (bandaMoveAt(jugada.at, setup) !== jugada.move) { ending = 'tackle'; break; }

            // Lo quebraste. Los metros ya son tuyos: lo que venga después no los
            // borra.
            broken += 1;
            if (jugada.move === 'atropellar') atropellados += 1;
            remaining -= SPACE_COST[jugada.move];

            // Y te empujó afuera. La jugada termina, el metro ganado queda.
            if (remaining < 0) { ending = 'cal'; break; }
        }

        const grade = bandaGrade(broken, ending);
        // Los metros son de crónica, no un carril: la planilla del puesto ya los
        // cuenta sola.
        const metres = broken * 8 + (grade === 'try' ? 10 : 0);

        const deltas: MomentDeltas = {
            bodyDamage: BODY_BASE + atropellados * BODY_PER_ATROPELLAR,
        };

        if (broken > 0) {
            deltas.fame = broken * FAME_PER_BREAK;
            deltas.belonging = broken * BELONGING_PER_BREAK;
        }
        if (grade === 'try') {
            deltas.fame = (deltas.fame ?? 0) + FAME_TRY;
            deltas.belonging = (deltas.belonging ?? 0) + BELONGING_TRY;
        }
        if (grade === 'desastre') deltas.fame = -FAME_DISASTER;

        // El cañón de cristal se cobra igual: el tirón no espera a ver si
        // llegaste a la bandera.
        if (setup.muscleInjury) {
            deltas.bodyDamage = (deltas.bodyDamage ?? 0) + BODY_MUSCLE_INJURY;
            deltas.playingTime = (deltas.playingTime ?? 0) - 1;
        }

        const texto = setup.muscleInjury
            ? `${cronica(grade, setup.minute, broken, metres)} Te agarraste el isquiotibial antes de levantarte.`
            : cronica(grade, setup.minute, broken, metres);

        return { deltas, result: RESULT_LABEL[grade], text: texto };
    },

    /**
     * Aguantar bien es aguantar LO JUSTO, y lo justo lo dice la cancha.
     *
     * El simulado de nivel `bien` no atropella a todos ni amaga a todos: mira lo
     * que le queda de lateral y gasta lo más caro que puede permitirse dejando un
     * metro para cada defensor que falta. Por eso el try le sale siempre —el
     * mínimo teórico entra siempre en el espacio mínimo— y por eso el nivel dice
     * algo: la corrida perfecta no es una mano perfecta, es una cuenta.
     *
     * `regular` amaga todo, que es lo que hace el que no quiere que lo toquen:
     * cómodo, y se queda sin cancha antes de llegar. `mal` le tira el hombro al
     * primero cuando todavía está a diez metros.
     */
    playAt(setup: BandaSetup, level: PlayLevel, variation: number): BandaInput {
        const moves: BandaInput['moves'] = [];

        // El medio de cada franja: la mano no se juega en el borde, que sería
        // medir el redondeo en vez del nivel.
        const medioAmague = setup.amagueEnd / 2;
        const medioRitmo = (setup.amagueEnd + setup.atropellarStart) / 2;
        const medioAtropellar = (setup.atropellarStart + 1) / 2;

        if (level === 'mal') {
            // El hombro tirado de lejos, y ahí se termina.
            return { kind: 'banda', moves: [{ move: 'atropellar', at: medioAmague }] };
        }

        if (level === 'regular') {
            for (let i = 0; i < setup.defenders; i += 1) moves.push({ move: 'amague', at: medioAmague });
            return { kind: 'banda', moves };
        }

        let remaining = setup.space;
        for (let i = 0; i < setup.defenders; i += 1) {
            // Lo que puedo gastar acá dejando un metro por cada uno que falta.
            const puedo = remaining - (setup.defenders - i - 1);
            if (puedo >= SPACE_COST.amague) moves.push({ move: 'amague', at: medioAmague });
            else if (puedo >= SPACE_COST.ritmo) moves.push({ move: 'ritmo', at: medioRitmo });
            else moves.push({ move: 'atropellar', at: medioAtropellar });
            remaining -= SPACE_COST[moves[i].move];
        }

        // La variación mueve la mano adentro de su franja, sin cambiarla: dos
        // corridas del mismo nivel no son idénticas byte a byte, pero valen lo
        // mismo.
        const corrimiento = (variation - 0.5) * 0.04;
        return {
            kind: 'banda',
            moves: moves.map((m) => ({ move: m.move, at: Math.max(0, Math.min(1, m.at + corrimiento)) })),
        };
    },
};
