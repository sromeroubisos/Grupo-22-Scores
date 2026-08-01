// EL ANCLA — el scrum, para la primera línea.
//
// Cinco metros, scrum a favor, y el pilar de enfrente ya sabe que va a perder.
// Cada vez que la primera línea vuelve a entrar podés insistir un poco más: el
// referee mira, el otro cede, y el penal se acerca. O te pasás, se derrumba, y
// el que queda señalado sos vos.
//
// ── El verbo es INSISTIR ──
// Y no es un detalle de sabor: es el único de los cinco Momentos que no se juega
// con el reloj. El tackle es frenar, el jackal es esperar, Los Palos es apuntar;
// este es apostar. Un juego de puestos donde los quince minijuegos midan reflejos
// no es un juego de puestos, es el mismo minijuego con quince fondos distintos.
//
// La forma es push-your-luck: el scrum tiene un punto de quiebre YA SORTEADO en
// el Setup, el jugador no lo ve, y decide cuántas veces vuelve a entrar. Sale
// caro pasarse y sale barato quedarse corto — igual que en la cancha, donde el
// pilar que suelta enseguida no pierde nada pero tampoco gana el partido.
//
// ── Por qué el punto de quiebre se sortea en el Setup ──
// Porque es lo que el jugador NO controla. Si se sorteara al resolver, insistir
// tres veces daría distinto según cuándo se resolvió, y recargar la página antes
// de decidir cambiaría el resultado. Acá viaja en el guardado y la apuesta es la
// misma antes y después del F5.
//
// ── Calibración ──
// El scrum a cinco metros termina en penal para el atacante con mucha más
// frecuencia que en try. Un pilar sólido saca dos penales de scrum por partido
// (el `perMatch` del puesto es 1,1) y el derrumbe repetido es amarilla. Por eso
// dos insistidas limpias ya es una gran tarde, tres es dominar el partido, y la
// cuarta no existe: el referee ya te avisó.

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
} from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

type AnclaInput = Extract<MomentOutcome, { kind: 'ancla' }>;

// ═══════════════════════════════════════════════════════════════════════════
//  Las constantes
// ═══════════════════════════════════════════════════════════════════════════

/** Cuántas veces podés volver a entrar. La cuarta no existe: ya te avisaron. */
export const ANCLA_MAX_PUSHES = 3;

/** Probabilidad base de aguantar UNA insistida, con empuje 50 y el cuerpo entero. */
const BASE_HOLD = 0.62;

/** Cada punto de `empuje` sobre 50 aguanta un poco más. */
const EMPUJE_PIVOT = 50;
const HOLD_PER_EMPUJE = 0.006;

/** El cuerpo roto se derrumba antes. El scrum es lo primero que se va. */
const HOLD_PER_BODY = 0.0035;

/** Y la presión del partido aprieta: a más presión, menos margen. */
const HOLD_PER_PRESSURE = 0.12;

const HOLD_MIN = 0.22;
const HOLD_MAX = 0.88;

/** Lo que paga cada insistida que aguantó. */
const FAME_PER_HOLD = 1.5;
const BELONGING_PER_HOLD = 1;

/** Lo que cuesta el derrumbe. */
const FAME_PER_COLLAPSE = 2.5;
const SANCTION_PER_COLLAPSE = 1;

/** El scrum es contacto pesado, se salga como se salga. */
const BODY_PER_ANCLA = 1.5;
const HEAD_KNOCK_CHANCE = 0.04;

// ═══════════════════════════════════════════════════════════════════════════
//  El Setup
// ═══════════════════════════════════════════════════════════════════════════

export interface AnclaSetup extends MomentSetup {
    kind: 'ancla';
    /**
     * En qué insistida se cae el scrum, de 1 a `maxPushes + 1`.
     *
     * `maxPushes + 1` significa que aguanta todo. El jugador NO lo ve: si lo
     * viera no habría apuesta, habría una cuenta.
     */
    breakAt: number;
    maxPushes: number;
    /** Si el golpe del scrum pega en la cabeza. Sorteado acá, no al resolver. */
    headKnock: boolean;
    /** El minuto, copiado: `resolve` no ve el contexto y la crónica lo nombra. */
    minute: number;
}

/**
 * Con qué probabilidad aguanta CADA insistida.
 *
 * Exportada aparte para poder mirarla de a dos —empuje 40 contra empuje 80— sin
 * fabricar un contexto entero.
 */
export function anclaHoldChance(
    attrs: Readonly<CaptainAttributes>,
    bodyDamage: number,
    pressure: number,
    proficiency: number,
): number {
    const bruta = BASE_HOLD
        + (attrs.empuje - EMPUJE_PIVOT) * HOLD_PER_EMPUJE
        - bodyDamage * HOLD_PER_BODY
        - pressure * HOLD_PER_PRESSURE;
    // El oficio NUNCA mejora: se acota a 1 acá, igual que en el resto.
    return Math.min(HOLD_MAX, Math.max(HOLD_MIN, bruta * Math.min(1, proficiency)));
}

// ═══════════════════════════════════════════════════════════════════════════
//  De lo que hiciste a lo que significa
// ═══════════════════════════════════════════════════════════════════════════

export type AnclaGrade = 'dominante' | 'firme' | 'prudente' | 'derrumbe';

/**
 * La nota de la jugada.
 *
 * A diferencia del jackal, acá el premio y el castigo CONVIVEN: se puede haber
 * sacado dos penales y después tirarlo abajo, y la nota dice `derrumbe` con las
 * dos ganadas cobradas igual. No es una inconsistencia con la regla del jackal,
 * es que son dos apuestas distintas: si derrumbarse borrara lo ganado, la
 * decisión correcta sería soltar siempre en la primera y no habría apuesta que
 * hacer.
 */
export function anclaGrade(held: number, collapsed: boolean): AnclaGrade {
    if (collapsed) return 'derrumbe';
    if (held === 0) return 'prudente';
    return held >= 2 ? 'dominante' : 'firme';
}

const RESULT_LABEL: Record<AnclaGrade, string> = {
    dominante: 'Scrum dominante',
    firme: 'Penal de scrum',
    prudente: 'Scrum sin historia',
    derrumbe: 'Scrum derrumbado',
};

function cronica(grade: AnclaGrade, minute: number, held: number): string {
    const m = `Minuto ${minute}`;
    const penales = `${held} ${held === 1 ? 'penal' : 'penales'}`;

    switch (grade) {
        case 'dominante':
            return `${m}: los hiciste retroceder una y otra vez, y el referee marcó ${penales} de scrum. El pilar de ellos terminó pidiendo el cambio.`;
        case 'firme':
            return `${m}: aguantaste la primera entrada y sacaste el penal. Después soltaste, que también es saber.`;
        case 'prudente':
            return `${m}: entraron, empujaste lo justo y salió limpia. Nadie va a hablar de ese scrum.`;
        default:
            return held > 0
                ? `${m}: sacaste ${penales} y fuiste por uno más. Se vino abajo y el referee te señaló a vos.`
                : `${m}: se vino abajo en la primera y el referee te señaló a vos.`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  La definición
// ═══════════════════════════════════════════════════════════════════════════

export const ANCLA: MomentDef<AnclaSetup, AnclaInput> = {
    kind: 'ancla',
    // El 1 y el 3. El hooker está en el scrum pero no ancla: talona.
    families: ['primera-linea'],
    weight: 10,
    labelEs: 'El ancla',

    setup(ctx: MomentSetupCtx): AnclaSetup {
        const rng = createRng(ctx.seed);
        const hold = anclaHoldChance(ctx.attrs, ctx.bodyDamage, ctx.pressure, ctx.proficiency);

        // Se sortea SIEMPRE el mismo número de veces —una por insistida posible—
        // aunque el scrum se caiga en la primera. Si el bucle cortara al primer
        // fallo, el stream dependería de dónde se cayó y dos Setups con la misma
        // semilla podrían diferir en el `headKnock`.
        let breakAt = 1;
        let sigueEnPie = true;
        for (let i = 0; i < ANCLA_MAX_PUSHES; i += 1) {
            const aguanta = rng.chance(hold);
            if (sigueEnPie && aguanta) breakAt += 1;
            else sigueEnPie = false;
        }

        const headKnock = rng.chance(HEAD_KNOCK_CHANCE);

        return {
            kind: 'ancla',
            seed: ctx.seed,
            breakAt,
            maxPushes: ANCLA_MAX_PUSHES,
            headKnock,
            minute: ctx.minute,
        };
    },

    resolve(setup: AnclaSetup, input: AnclaInput): MomentResult {
        // Se acota a la mano posible: una pantalla que mande siete no puede
        // inventar insistidas que el scrum no ofreció, ni un número negativo.
        const pushes = Math.max(0, Math.min(setup.maxPushes, Math.floor(input.pushes)));

        const held = Math.min(pushes, setup.breakAt - 1);
        const collapsed = pushes >= setup.breakAt;

        const grade = anclaGrade(held, collapsed);
        const deltas: MomentDeltas = { bodyDamage: BODY_PER_ANCLA };

        // Lo ganado NO se borra con el derrumbe: si se borrara, la decisión
        // correcta sería soltar siempre en la primera y no habría apuesta.
        if (held > 0) {
            deltas.fame = held * FAME_PER_HOLD;
            deltas.belonging = held * BELONGING_PER_HOLD;
        }
        if (collapsed) {
            deltas.fame = (deltas.fame ?? 0) - FAME_PER_COLLAPSE;
            deltas.sanction = SANCTION_PER_COLLAPSE;
        }
        if (setup.headKnock) deltas.headDamage = 1;

        return {
            deltas,
            result: RESULT_LABEL[grade],
            text: cronica(grade, setup.minute, held),
        };
    },
};
