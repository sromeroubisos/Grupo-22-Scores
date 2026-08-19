// EL CAPITÁN — LOS HITOS.
//
// Los títulos y los premios dicen QUÉ TAN ALTO llegó una carrera. Los hitos
// dicen QUÉ FORMA TUVO: cuándo debutaste, cuándo firmaste, cuándo te fuiste del
// país, cuándo volviste. Son las dos preguntas que una trayectoria tiene que
// poder contestar, y hasta 0.10.0 solo se contestaba la primera.
//
// ── Se DETECTAN, no se declaran ────────────────────────────────────────────
// Ninguna decisión "otorga" un hito. Todos salen de mirar el estado al cerrar la
// temporada y preguntarse si esto ya había pasado antes. Es lo que hace que no
// se puedan desincronizar: no hay una segunda fuente de verdad que alguien se
// pueda olvidar de actualizar (CLAUDE de captain §1.9).
//
// ── Se emiten UNA SOLA VEZ ─────────────────────────────────────────────────
// El primer contrato profesional es primero una sola vez. La guarda es la lista
// misma —si el id ya está, no se vuelve a emitir— y no un booleano aparte por
// hito, que sería un campo persistido por cada uno.
//
// ── Por qué el Salón de la Fama es un hito y no un evento ──────────────────
// Porque no hay nada que elegir. Una tarjeta de una sola opción no es una
// decisión: es un resultado disfrazado, y el CLAUDE de Carrera lo prohíbe con
// todas las letras. Entrar al Salón es algo que te pasa, y así se cuenta.

import type { CaptainState, SquadTrack } from '../types/captain.ts';
import type { Milestone, MilestoneId } from '../types/achievements.ts';
import { FIRST_TEAM_AGE } from '../types/player.ts';

// Los TIPOS viven en `types/achievements.ts` porque el estado los guarda. Acá
// viven las REGLAS. Se re-exportan para que quien necesite las dos cosas tenga
// un solo import.
export type { Milestone, MilestoneId };

/**
 * BANDA DEPORTIVA A PARTIR DE LA CUAL UNA COMPETICIÓN ES DE ÉLITE.
 *
 * Seis, que es donde viven el Top 14, la Premiership, la URC y el Super Rugby.
 * No es una opinión: es el corte que ya usa el XV ideal del año en `awards.ts`,
 * y sale del mismo lado — la banda del catálogo de niveles.
 */
const ELITE_BAND = 6;

/**
 * Caps y liderazgo que pide la cinta de capitán de la selección.
 *
 * ── EL 75 NO ERA ESTRICTO: ERA IMPOSIBLE, Y POR CONSTRUCCIÓN ───────────────
 * Se midió sobre doscientas carreras: de los dieciocho que llegaron a diez caps
 * o más, el liderazgo más alto fue 71. Ni uno solo pasaba de 75, así que la cinta
 * era un escalón declarado que no existía — el mismo modo de fallo que el test
 * `ESTRUCTURA: ninguna vía de la escalera queda vacía` persigue en la escalera
 * representativa.
 *
 * Y la causa no es que los jugadores sean flojos de cabeza: es el REPARTO. El
 * `liderazgo` es el atributo de MENOR peso en las ocho familias, y el
 * crecimiento general se reparte proporcional al peso — así que es, por
 * construcción, el que menos sube de los cuatro. Pedirle 75 es pedirle a la
 * media del jugador bastante más de lo que parece.
 *
 * El 65 sale de esa medición, y hay que decir lo que eso significa: es un número
 * calibrado contra el motor de hoy y no contra una afirmación sobre el rugby,
 * que es justo lo que el §1.3 del CLAUDE de captain desaconseja. Se acepta a
 * sabiendas porque la alternativa buena todavía no se puede escribir: el capitán
 * de verdad no se elige por un umbral sino por ser EL QUE MÁS MANDA DE LOS QUE
 * ESTÁN, y para eso hace falta un modelo de plantel que este motor no tiene.
 * Cuando exista, esta constante se va y no se recalibra.
 */
const CAPTAIN_MIN_CAPS = 20;
const CAPTAIN_MIN_LEADERSHIP = 65;

/**
 * El Salón de la Fama. Las tres condiciones y por qué son estas:
 *
 *   · 32 años — no se entra en actividad temprana. Es un reconocimiento a una
 *     carrera, y una carrera necesita haber pasado. Se midió: a los 33 el 47% de
 *     las carreras sigue viva, así que la puerta no es la edad.
 *   · LA MEJOR MEDIA DE LA CARRERA en 72, no la de hoy — y esta es la parte que
 *     hay que leer con atención, porque escrita al revés el Salón NO SE ABRÍA
 *     NUNCA. Medido sobre sesenta carreras: 0%.
 *
 *     Las dos condiciones se peleaban entre sí. La edad recién habilita el hito
 *     pasado el declive, y el declive es exactamente lo que le come la media al
 *     jugador: a los 33 el que picó en 78 anda por 70, así que el que calificaba
 *     por nivel ya no calificaba cuando la edad se lo permitía. El corte no
 *     estaba alto: estaba mirando el momento equivocado.
 *
 *     Un reconocimiento a una carrera tiene que leer la CARRERA. Lo que se
 *     honra es haber sido de los buenos de tu generación, y eso pasó cuando
 *     pasó — no es algo que se pierda cumpliendo años.
 *   · veinte caps O tres títulos — LAS DOS PUERTAS, y ahí está la gracia: el
 *     internacional entra por caps y el tipo de club que ganó todo en su liga
 *     entra por vitrina. Con una sola puerta, el Salón habría sido otro premio
 *     más para el que ya tenía todo.
 */
const HALL_MIN_AGE = 32;
const HALL_MIN_PEAK_OVR = 72;
const HALL_MIN_CAPS = 20;
const HALL_MIN_TITLES = 3;

export interface MilestoneContext {
    /** Partidos que jugó esta temporada. */
    matchesPlayed: number;
    /** Banda deportiva de la competición que disputó. */
    band: number;
    /** País del club de esta temporada. */
    clubCountry: string | null;
    /** Escalón representativo alcanzado. */
    track: SquadTrack;
}

function has(state: CaptainState, id: MilestoneId): boolean {
    return state.milestones.some((m) => m.id === id);
}

/**
 * Los hitos nuevos de esta temporada, EN ORDEN DECLARADO.
 *
 * El orden es el de la carrera —primero se debuta, después se firma, después se
 * llega— y no el de importancia: así la trayectoria se lee como una línea de
 * tiempo aunque dos caigan el mismo año.
 *
 * Puro: no consume azar. Un hito que dependiera de una tirada no sería un hito,
 * sería un premio.
 */
export function detectMilestones(state: CaptainState, ctx: MilestoneContext): Milestone[] {
    const { player } = state;
    const nuevos: Milestone[] = [];
    const emitir = (id: MilestoneId, text: string): void => {
        if (has(state, id)) return;
        nuevos.push({ id, season: state.season, age: player.age, text });
    };

    // EL DEBUT ES EN PRIMERA, Y PRIMERA EMPIEZA A LOS 18 (`FIRST_TEAM_AGE`).
    // Sin la edad, el hito lo disparaba el primer partido de la carrera —que es
    // de juveniles— y la trayectoria decía «debutaste en primera» arriba de una
    // temporada de M16. El hito se emite una sola vez, así que ese renglón
    // quemaba para siempre el momento que venía a contar.
    if (ctx.matchesPlayed > 0 && player.age >= FIRST_TEAM_AGE) {
        emitir('debut-senior', 'Debutaste en primera.');
    }

    if (ctx.track !== 'club') {
        emitir('primera-convocatoria', 'Te llamaron por primera vez de tu unión.');
    }

    if (state.national.caps > 0) {
        emitir('debut-mayor', 'Te pusiste la camiseta de la mayor.');
    }

    if (state.stage === 'professional') {
        emitir('primer-contrato', 'Firmaste tu primer contrato profesional.');
    }

    if (state.titles.some((t) => t.kind === 'club')) {
        emitir('primer-titulo', 'Levantaste tu primera copa.');
    }

    if (ctx.band >= ELITE_BAND) {
        emitir('competicion-de-elite', 'Jugaste tu primera competición de élite.');
    }

    if (ctx.clubCountry && ctx.clubCountry !== player.countryCode) {
        emitir('transferencia-internacional', 'Cruzaste la frontera para jugar afuera.');
    }

    // La vuelta a casa solo existe si antes te fuiste. Sin esa guarda, el pibe
    // que nunca se movió de su club "volvería" en su primera temporada, que es
    // exactamente la clase de hito que hace que la trayectoria deje de creerse.
    if (
        player.clubId !== null
        && player.clubId === state.homeClubId
        && has(state, 'transferencia-internacional')
    ) {
        emitir('vuelta-a-casa', 'Volviste al club donde te hiciste.');
    }

    if (
        ctx.track === 'nacional'
        && state.national.caps >= CAPTAIN_MIN_CAPS
        && player.attrs.liderazgo >= CAPTAIN_MIN_LEADERSHIP
    ) {
        emitir('capitan-de-la-seleccion', 'Te dieron la cinta de capitán de la selección.');
    }

    // El pico de la carrera, DERIVADO del historial y no guardado: una segunda
    // fuente de verdad acá alcanzaría un solo camino que se olvide de
    // actualizarla para que el Salón se abra por un número que ya no existe.
    const pico = Math.max(player.ovr, ...state.history.map((h) => h.ovr));
    if (
        player.age >= HALL_MIN_AGE
        && pico >= HALL_MIN_PEAK_OVR
        && (state.national.caps >= HALL_MIN_CAPS || state.titles.length >= HALL_MIN_TITLES)
    ) {
        emitir('salon-de-la-fama', 'Te anotaron para el Salón de la Fama.');
    }

    return nuevos;
}
