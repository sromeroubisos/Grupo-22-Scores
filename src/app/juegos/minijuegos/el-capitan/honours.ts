// EL CAPITÁN — LO QUE ACABÁS DE GANAR, ANUNCIADO CUANDO PASA.
//
// La vitrina existía y se leía en dos lugares, los dos flojos: una línea gris al
// pie del cierre del año —«Mejor jugador del mundo.», con la misma tinta con la
// que se cuenta que te pasaste del límite de partidos— y una lista al retirarte,
// catorce temporadas después. Lo más raro que le puede pasar a una carrera
// llegaba como una nota al pie.
//
// Este módulo contesta una sola pregunta: QUÉ ENTRÓ EN LA VITRINA EN ESTE PASO.
//
// ── Y la vitrina no son solo las copas ──────────────────────────────────────
// Se anuncian cuatro cosas, y las cuatro son de la misma familia: pasan una vez
// y no se repiten. Los campeonatos —del club y de la selección—, los premios
// individuales, la primera vez que tu unión te llama y los cien caps. Las dos
// últimas no son títulos y por eso se buscan distinto: la convocatoria vive en
// `milestones`, que el motor detecta solo, y los cien caps son un CONTADOR que
// se cruza (no hay una lista de "caps redondos" a la que restarle nada).
//
// Lo que NO se anuncia es tan deliberado como lo que sí: el debut en primera, el
// primer contrato o cruzar la frontera son hitos que el motor registra igual,
// pero interrumpir la pantalla con un premio en el medio es un gesto que se
// gasta si se usa para todo.
//
// ── Se RESTAN DOS ESTADOS, y no se lee la fila del año ──────────────────────
// El camino corto sería mirar `CaptainSeasonEntry.titles` y `.awards`, que son
// justo lo que la tarjeta del año ya tiene a mano. No sirve, y no por comodidad:
//
//   · La fila es la lista del AÑO SIMULADO. El Mundial que se juega a mano no
//     está ahí — lo escribe `applyTournament` en el reducer, DESPUÉS de que la
//     fila quedó cerrada. Una pantalla colgada de la fila anuncia todas las
//     copas menos la única que el jugador ganó jugando.
//   · Restando `state.titles` y `state.awards` da igual de dónde salga el
//     trofeo: el día que otra puerta empuje uno, se anuncia solo.
//
// Es la misma disciplina de `decisionImpact.ts` —dos estados, nunca la
// intención— y por lo mismo vive en `app/` y no en el motor: es presentación, no
// se persiste, no entra en el `stateHash` y no sube ninguna versión.
//
// ── Las dos listas son de SOLO AGREGAR, y de ahí sale la resta ──────────────
// Nadie saca un título de la vitrina: `titles` y `awards` solo crecen (se
// escriben con `push` en `simulate-season.ts` y en `captain-reducer.ts`). Por eso
// lo nuevo es la COLA, y `slice` alcanza. Si algún día una de las dos se
// reescribiera entera, el `slice` devuelve vacío y el aviso no aparece: se calla,
// que es la falla correcta para una pantalla de celebración.

import type { CaptainSeasonEntry, CaptainState, MilestoneId } from '@/features/captain';
// El VALOR va por camino relativo y con extensión, y el tipo por el alias: los
// tipos se borran al compilar, pero esta tabla existe en tiempo de ejecución y
// `node --test` no resuelve `@/`. Es la misma razón por la que todo el motor se
// importa así. Cambiarlo por el alias deja el test de este módulo sin arrancar.
import { AWARD_LABELS } from '../../../../features/captain/engine/awards.ts';
import { TITLE_MIN_SHARE } from '../../../../features/captain/engine/clubs.ts';
import { FIRST_TEAM_AGE } from '../../../../features/captain/types/player.ts';

/**
 * Los dos conjuntos que el jugador distingue: lo que ganó el equipo —con el
 * club o con la selección— y lo que ganó él.
 */
export type HonourKind = 'club' | 'national' | 'award';

/**
 * LOS HITOS QUE SE ANUNCIAN, con el rótulo del aviso.
 *
 * Es una tabla y no un `if`, por lo mismo que `AWARD_LABELS`: sumar un hito a la
 * celebración tiene que ser una fila, no una rama. Y es PARCIAL a propósito —
 * hoy se anuncia uno solo—: el resto de los hitos existe en el estado y se lee
 * en otro lado, pero interrumpir la pantalla es para lo que pasa una vez en la
 * vida.
 *
 * El rótulo se escribe acá y no se toma del `text` del hito, que es una frase
 * cerrada («Te llamaron por primera vez de tu unión.»): el aviso tiene tres
 * renglones cortos y el del medio es un nombre, como «The Rugby Championship» o
 * «Mejor jugador del mundo».
 */
const HITOS_ANUNCIADOS: Partial<Record<MilestoneId, string>> = {
    'primera-convocatoria': 'Primera convocatoria',
};

/**
 * EL ESCALÓN DE CAPS QUE SE FESTEJA.
 *
 * Cien, y uno solo. No es un contador redondo cualquiera: es la marca que en el
 * rugby tiene nombre propio —el club de los cien— y a la que llega una minoría
 * de los que debutan. Poner también el 50 abarataría los dos.
 *
 * No se persiste ni se guarda un "ya lo anuncié": se detecta CRUZANDO el umbral
 * entre dos estados, que es la misma disciplina de la resta con la que se
 * detecta todo lo demás en este módulo. Un contador solo sube, así que se cruza
 * una vez.
 */
const CAPS_HITO = 100;

/**
 * La temporada que se acaba de jugar.
 *
 * NO es `state.season`: el reducer cierra el año y abre el siguiente en la misma
 * pasada (`closeAndOpenNext`), así que para cuando se comparan los dos estados
 * el contador ya está en el año que viene. Los títulos y los premios no tienen
 * este problema porque cada uno trae su propia temporada adentro; los caps son
 * un contador y hay que preguntarle a la última fila del historial.
 */
function temporadaJugada(state: CaptainState): number {
    return state.history.length > 0
        ? state.history[state.history.length - 1].season
        : state.season;
}

export interface Honour {
    /**
     * Identidad del aviso. Sale de lo que la cosa ES —tipo, temporada y la
     * competición o el premio— y nunca de su posición en la lista (§1.5 del
     * CLAUDE de captain): la cola se consume salteada y un índice se desalinea.
     *
     * No puede repetirse: una competición se gana una vez por temporada y un
     * premio se otorga una vez por temporada.
     */
    key: string;
    kind: HonourKind;
    /** El rótulo del conjunto. Es lo que agrupa: dice de qué familia es esto. */
    eyebrow: string;
    /** Lo que ganaste, con el nombre que tiene. */
    label: string;
    /** Dónde y cuándo, en una línea. */
    detail: string;
    /** El club con el que lo ganaste. `null` en la selección y en los premios. */
    clubId: string | null;
    /** Su nombre, para el escudo. Va aparte del `detail` porque el escudo lo pide. */
    clubName: string | null;
    /** Decorativo: el aviso se entiende entero sin él (va con `aria-hidden`). */
    icon: string;
}

/**
 * Lo que entró en la vitrina entre un estado y el siguiente.
 *
 * El orden es el de los conjuntos, y es el que el jugador espera: primero las
 * copas —del club y de la selección, tal como el motor las escribió—, después lo
 * que te pasó CON LA CAMISETA DE TU UNIÓN, y los premios individuales al final.
 * Es también el orden de la vitrina del retiro, así que la celebración y el
 * recuerdo no cuentan la carrera de dos maneras.
 *
 * `clubName` lo trae la pantalla, igual que en `decisionImpact`: acá se decide
 * QUÉ se anuncia, no cómo se llama un club.
 */
export function newHonours(
    antes: CaptainState,
    despues: CaptainState,
    clubName: (clubId: string) => string,
): Honour[] {
    const avisos: Honour[] = [];

    for (const titulo of despues.titles.slice(antes.titles.length)) {
        const esDelClub = titulo.kind === 'club' && titulo.clubId !== null;
        const nombre = esDelClub ? clubName(titulo.clubId as string) : null;

        avisos.push({
            key: `title:${titulo.season}:${titulo.competitionId}`,
            kind: esDelClub ? 'club' : 'national',
            // El título de selección no tiene club: lo ganó la unión, y decir
            // «Sin club» ahí sería mentir en la línea que el jugador va a releer.
            eyebrow: esDelClub ? 'Campeón' : 'Con tu selección',
            label: titulo.labelEs,
            detail: esDelClub
                ? `${nombre} · Temporada ${titulo.season}`
                : `Temporada ${titulo.season}`,
            clubId: esDelClub ? titulo.clubId : null,
            clubName: nombre,
            icon: '🏆',
        });
    }

    /**
     * LOS HITOS. Misma resta que las copas, y por la misma razón: `milestones`
     * solo crece (`push` en `simulate-season`), así que lo nuevo es la cola.
     *
     * El filtro por la tabla va acá y no en el motor: qué se detecta lo decide
     * `detectMilestones`, y qué merece frenar la pantalla lo decide la pantalla.
     */
    for (const hito of despues.milestones.slice(antes.milestones.length)) {
        const label = HITOS_ANUNCIADOS[hito.id];
        if (!label) continue;

        avisos.push({
            key: `milestone:${hito.season}:${hito.id}`,
            kind: 'national',
            eyebrow: 'Con tu selección',
            label,
            detail: `Temporada ${hito.season}`,
            clubId: null,
            clubName: null,
            icon: '👕',
        });
    }

    // EL CLUB DE LOS CIEN. Se cruza una sola vez en una carrera, y el `>=` no es
    // exageración: una gira puede sumar tres caps de golpe y saltar el 100 sin
    // pisarlo. Con `===` el aviso se perdería justo en la carrera que más lo
    // merece.
    if (antes.national.caps < CAPS_HITO && despues.national.caps >= CAPS_HITO) {
        avisos.push({
            key: `caps:${CAPS_HITO}`,
            kind: 'national',
            eyebrow: 'Con tu selección',
            label: `${CAPS_HITO} caps`,
            detail: `Temporada ${temporadaJugada(despues)}`,
            clubId: null,
            clubName: null,
            icon: '🎖️',
        });
    }

    for (const premio of despues.awards.slice(antes.awards.length)) {
        avisos.push({
            key: `award:${premio.season}:${premio.id}`,
            kind: 'award',
            eyebrow: 'Premio individual',
            // Los ids no se traducen acá: `AWARD_LABELS` es la única tabla de
            // nombres de los premios y ya la usan el cierre del año y el retiro.
            label: AWARD_LABELS[premio.id],
            detail: `Temporada ${premio.season}`,
            clubId: null,
            clubName: null,
            icon: '⭐',
        });
    }

    return avisos;
}

/**
 * LA COPA QUE NO LEVANTASTE, explicada.
 *
 * El motor tiene dos puertas por las que un club campeón no te deja título, y
 * las dos son deliberadas — la medalla es del que la jugó:
 *
 *   · jugaste en juveniles (`FIRST_TEAM_AGE`): el de 16 no se puso la camiseta
 *     de primera ni un sábado, jugó la suya;
 *   · no te pusiste la camiseta (`TITLE_MIN_SHARE`): el que no jugó ni un
 *     cuarto de la temporada no tiene medalla.
 *
 * Lo que NO era deliberado es el silencio: la tarjeta del año mostraba
 * «El club · 1º de N» y después nada — ni copa, ni aviso, ni porqué. Un jugador
 * leyó ese silencio como un guardado roto, y tenía razón en quejarse: la regla
 * existe pero nadie se la había contado. Esta función es la que la cuenta.
 *
 * Es DERIVADA de la fila del año (edad, participación, puesto) y no se
 * persiste: vive acá, al lado de la resta de la vitrina, porque contesta la
 * pregunta espejo — qué NO entró y por qué.
 */
export function copaQueNoLevantaste(
    entry: Pick<CaptainSeasonEntry, 'age' | 'share' | 'leaguePosition' | 'titles'>,
): string | null {
    // El puesto 1 de la tabla ES el campeón (salen de la misma tabla): si acá
    // hay un título, la copa ya se contó; si el club no salió primero, no hay
    // nada que explicar.
    if (entry.leaguePosition !== 1 || entry.titles.length > 0) return null;

    if (entry.age < FIRST_TEAM_AGE) {
        return 'La primera salió campeona, pero vos jugaste en juveniles. Esa copa no es tuya todavía.';
    }
    if (entry.share < TITLE_MIN_SHARE) {
        return 'El club salió campeón y vos casi no te pusiste la camiseta. La medalla es del plantel que la jugó.';
    }

    // El motor no produce este estado (primero + participación ⇒ título). Si
    // alguna vez lo produjera, callarse es la falla correcta para una pantalla
    // de celebración — la misma regla que la resta de arriba.
    return null;
}

