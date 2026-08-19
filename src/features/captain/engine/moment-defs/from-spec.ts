// EL CAPITÁN — LA FÁBRICA: de un dato del catálogo a un Momento del motor.
//
// Los cinco Momentos escritos a mano cumplen las tres reglas de
// `types/moment-def.ts` porque las cumplió a mano quien los escribió. Los
// cincuenta y nueve del catálogo las cumplen porque las cumple ESTE ARCHIVO, una
// vez, para todos.
//
// Es la diferencia entre una convención y un invariante, y es la misma lección
// que el propio `resolveMoment` dejó escrita cuando puso el guardia de kinds en
// el armazón en vez de pedírselo a cada def:
//
//   «Pedirle a cada def que se defienda sola es una CONVENCIÓN, y las
//    convenciones se cumplen catorce veces y se olvidan la quince. Peor: se
//    olvidan en el Momento que se escribió apurado, que es justo el que va a
//    recibir la mano rara.»
//
// Con sesenta y cinco no se olvidan la quince: se olvidan la tercera. Así que
// las tres reglas se cumplen acá:
//
//   1. `resolve` NO RECIBE CONTEXTO — la fábrica le pasa el Setup y la mano, y
//      no tiene de dónde sacar otra cosa: el spec que capturó en la clausura es
//      DATO CONSTANTE, no estado. Una jugada retomada después de un F5 se
//      resuelve idéntica.
//   2. `MomentDeltas` ESTÁ CERRADO — los deltas los arma `payFor` y ningún spec
//      escribe un número de premio.
//   3. EL AZAR SE SORTEA EN `setup` — la fábrica es el único que le pasa una
//      semilla a la mecánica, y se la pasa una sola vez.
//
// ── LA ÚNICA TRADUCCIÓN DEL RUGBY AL MARGEN ──
// `marginOf` es a los sesenta y cinco lo que `engine/impact.ts` es a las
// decisiones de Carrera de Rugby: el único lugar donde el rugby —un atributo, la
// presión del minuto, el cuerpo roto, el oficio prestado— se convierte en el
// número con el que juega la mecánica. Que esté sola es lo que hace que
// "el atributo abre el margen" signifique lo mismo en los sesenta y cinco.

import type { AnyMinigameSpec, MinigamePlay, MinigameSetup } from '../../types/minigame.ts';
import type { MomentDef, MomentResult, MomentSetupCtx, PlayLevel } from '../../types/moment-def.ts';
import type { PositionFamilyId } from '../../types/player.ts';
import { familyOfNumber } from '../../data/positions.ts';
import { payFor } from '../../data/minigames/pay.ts';
import { getMechanic } from '../mechanics/index.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · DEL RUGBY AL MARGEN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El atributo, mapeado a margen.
 *
 * PARÁMETRO LIBRE (CLAUDE.md §1.9). El piso en 15 y el techo en 90 no salen de
 * ninguna otra constante: salen de que `ATTRIBUTE_FLOOR` es 20 —lo que vale un
 * atributo que no es de tu familia— y de que un jugador de élite no llega a 100
 * en su vida. Con estos dos, un pibe de 18 en su puesto arranca con margen
 * medio-bajo y un internacional maduro juega casi con el margen entero.
 */
const ATTR_FLOOR = 15;
const ATTR_CEIL = 90;

/** Ni el mejor tiene la jugada regalada, ni el peor la tiene imposible. */
const MARGIN_MIN = 0.06;
const MARGIN_MAX = 0.94;

/**
 * Cuánto cierra el margen la presión del último cuarto.
 *
 * Es MENOS de lo que parece a simple vista, y a propósito: la presión ya aprieta
 * el RELOJ adentro de cada mecánica (los `sweepMs`, los segundos para decidir).
 * Si además cerrara el margen a la mitad, el minuto 79 sería injugable para
 * todos y la jugada que decide —que es la única razón por la que existe un
 * Momento— dejaría de premiar al que la sabe jugar.
 */
const PRESSURE_SQUEEZE = 0.22;

/**
 * Cuánto cierra el margen el cuerpo roto.
 *
 * `bodyDamage` va de 0 a 100. Un jugador entero no pierde nada; uno al límite
 * pierde un quinto del margen, que es lo mismo que le pasa al tackle —donde el
 * desgaste ensancha la zona peligrosa— y por el mismo motivo: la altura del
 * tackle se va con las piernas.
 */
const BODY_SQUEEZE = 0.2;

/**
 * De (atributo, presión, oficio, cuerpo) al margen con el que juega la mecánica.
 *
 * El oficio se acota a 1 ANTES de multiplicar, igual que en Los Palos: jugar una
 * jugada que es tuya no puede ensanchar el margen por encima de lo que da el
 * atributo. El contrato no le da a ningún Momento la chance de invertir ese
 * signo (`MomentSetupCtx.proficiency`), y acá tampoco.
 *
 * Exportada porque un test que quiera comparar dos jugadores en la misma jugada
 * necesita la cuenta, y reimplementarla lo dejaría desincronizado en la primera
 * calibración.
 */
export function marginOf(
    attrValue: number,
    pressure: number,
    proficiency: number,
    bodyDamage: number,
): number {
    const bruto = (attrValue - ATTR_FLOOR) / (ATTR_CEIL - ATTR_FLOOR);
    const conPresion = bruto * (1 - pressure * PRESSURE_SQUEEZE);
    const conCuerpo = conPresion * (1 - (bodyDamage / 100) * BODY_SQUEEZE);
    const conOficio = conCuerpo * Math.min(1, proficiency);

    return Math.round(Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, conOficio)) * 1000) / 1000;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 · A QUÉ FAMILIAS LES TOCA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La familia dueña de un minijuego, DERIVADA del dorsal.
 *
 * No la escribe el catálogo (CLAUDE.md §1.9): el mapa dorsal→familia ya existe
 * una vez, en `familyOfNumber`, y una segunda copia en sesenta y cinco objetos
 * sería la derivada congelada de siempre —correcta el día que se escribe y
 * silenciosamente falsa el día que un dorsal cambie de familia—.
 *
 * `null` es transversal, y son los cinco universales.
 */
export function familiesOfShirt(shirt: number | null): readonly PositionFamilyId[] | null {
    return shirt === null ? null : [familyOfNumber(shirt)];
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LA FÁBRICA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un spec del catálogo, convertido en un Momento que el motor ya sabe correr.
 *
 * El `spec` queda capturado en la clausura y es LO ÚNICO que las tres funciones
 * ven además de sus argumentos. Es dato constante —viene de un módulo, no del
 * estado— así que capturarlo no rompe la regla 1: lo que la regla prohíbe es
 * leer el MUNDO en `resolve`, y un texto de catálogo no es el mundo.
 */
export function defFromSpec(spec: AnyMinigameSpec): MomentDef<MinigameSetup, MinigamePlay> {
    const mech = getMechanic(spec.mechanic);

    return {
        kind: spec.kind,
        families: familiesOfShirt(spec.shirt),
        weight: spec.weight,
        labelEs: spec.copy.title,

        setup(ctx: MomentSetupCtx): MinigameSetup {
            const margin = marginOf(ctx.attrs[spec.attr], ctx.pressure, ctx.proficiency, ctx.bodyDamage);

            return {
                kind: spec.kind,
                seed: ctx.seed,
                mechanic: spec.mechanic,
                // La mecánica recibe el margen MASTICADO y nada más: no ve
                // atributos, ni familia, ni oficio. Es lo que hace que un verbo
                // pueda servir para once minijuegos sin saber de rugby.
                play: mech.setup(spec.params as never, {
                    margin,
                    pressure: ctx.pressure,
                    seed: ctx.seed,
                }),
                minute: ctx.minute,
                title: spec.copy.title,
                brief: spec.copy.brief,
            };
        },

        resolve(setup: MinigameSetup, input: MinigamePlay): MomentResult {
            const grade = mech.grade(setup.play, input.play as never);

            return {
                deltas: payFor(spec.stake, spec.risk, spec.gloria, grade),
                result: spec.copy.result[grade],
                // El minuto adelante, igual que en los cinco escritos a mano: es
                // lo que convierte una línea de resultado en una línea de
                // crónica. Y entra en el digest, así que cambiar el formato
                // mueve la tabla congelada.
                text: `Minuto ${setup.minute}: ${spec.copy.outcome[grade]}`,
            };
        },

        playAt(setup: MinigameSetup, level: PlayLevel, variation: number): MinigamePlay {
            return {
                kind: spec.kind,
                play: mech.playAt(setup.play, level, variation),
            };
        },
    };
}
