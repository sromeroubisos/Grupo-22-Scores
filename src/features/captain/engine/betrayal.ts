// EL CAPITÁN — el salto al clásico.
//
// La regla, en una línea: IRTE DE TU CLUB AL CLÁSICO RIVAL BORRA LO QUE HABÍAS
// CONSTRUIDO ALLÁ, Y EL TECHO DE ESE CLUB NO VUELVE A SUBIR.
//
// Es la única pérdida total de Pertenencia del juego, y tiene que serlo. Todo lo
// demás que te aleja del club —firmar profesional, emigrar, jugar mal— descuenta
// o frena: son formas de estar lejos. Esta no es estar lejos, es estar enfrente.
// El domingo siguiente entrás a la cancha en la que te aplaudían, con la otra
// camiseta, y la tribuna que te hizo socio te silba. No queda progreso que
// preservar porque el vínculo que lo producía se dio vuelta.
//
// ── EL TECHO YA EXISTÍA Y NO LO PRENDÍA NADIE ────────────────────────────────
// `BELONGING_CAP_RIVAL_JUMP` está escrito desde el primer día, y hasta acá
// `belongingSituation` lo leía de una bandera que ninguna línea del motor
// escribía: `flags['salto-al-clasico']`, con un comentario diciendo «cuando
// exista». O sea que el techo del traidor era inalcanzable y el juego no tenía
// clásicos. Faltaban las dos mitades — el catálogo (`data/rivalries.ts`) y el
// momento en que se cobra (este archivo).
//
// Y la bandera tenía, además, el defecto que el §1.7 describe: se llamaba como
// una pregunta sobre UN club («¿te fuiste de ESTE club al rival?») y su cuerpo
// era un booleano global, así que el primer salto le habría bajado el techo a
// TODOS los clubes de la carrera, incluido el que te acababa de fichar. Se
// reemplaza por la cuenta de acá, que es por club.
//
// ── POR QUÉ NO SE GUARDA NADA ────────────────────────────────────────────────
// La tentación es agregarle un campo al ledger —`betrayed: string[]`— y es
// exactamente lo que el §2 del CLAUDE de Carrera de Rugby prohíbe: LO DERIVADO
// NO SUBE NADA. La trayectoria ya guarda el club de cada temporada, así que la
// pregunta «¿de qué clubes te fuiste al clásico?» se contesta leyendo
// `history[]`, sin un campo nuevo, sin migración y sin la posibilidad de que las
// dos fuentes se desincronicen — que es lo que pasaría el día que un pase se
// olvide de escribir la bandera.

import type { CaptainState } from '../types/captain.ts';
import { areClassicRivals } from '../data/rivalries.ts';
import { clearBelonging } from './belonging.ts';
import { getClub } from '../data/catalogs.ts';

/**
 * Los clubes que pisó esta carrera, EN ORDEN, con el de hoy al final.
 *
 * El de hoy es lo que cierra la ventana entre el pase y la temporada siguiente:
 * la tarjeta de mercado se resuelve cuando la temporada ya se jugó, así que
 * entre el salto y la fila que lo va a registrar hay un rato en el que la
 * trayectoria todavía no sabe nada. Sin este último elemento, el techo del
 * traidor tardaría una temporada en aparecer.
 *
 * Los `null` se saltean —son las temporadas sin club, antes de tener uno— y eso
 * es deliberado: dos clubes separados por una temporada sin club no son un
 * salto, pero tampoco hay ninguna razón para tratarlos como si el vínculo se
 * hubiera cortado. Saltearlos es la lectura conservadora de las dos.
 */
function clubTrail(state: CaptainState): string[] {
    const trail: string[] = [];
    for (const row of state.history) {
        if (row.clubId) trail.push(row.clubId);
    }
    if (state.player.clubId) trail.push(state.player.clubId);
    return trail;
}

/**
 * De qué clubes te fuiste al clásico. DERIVADO de la trayectoria.
 *
 * Se marca el club que DEJÁS, no al que llegás: el que te ficha te recibe bien,
 * y su hinchada no tiene por qué descontarte nada. Si más adelante volvés
 * —también cruzando el clásico— quedan marcados los dos, que es lo correcto:
 * traicionaste a los dos.
 */
export function betrayedClubs(state: CaptainState): ReadonlySet<string> {
    const trail = clubTrail(state);
    const traicionados = new Set<string>();
    for (let i = 0; i + 1 < trail.length; i += 1) {
        if (areClassicRivals(trail[i], trail[i + 1])) traicionados.add(trail[i]);
    }
    return traicionados;
}

/** ¿Dejaste este club para irte a su clásico? */
export function isBetrayedClub(state: CaptainState, clubId: string): boolean {
    return betrayedClubs(state).has(clubId);
}

/**
 * ¿Este pase es al clásico? Se pregunta ANTES de mover el club.
 *
 * Existe como función propia y no como `areClassicRivals` pelado para que el
 * llamador no tenga que acordarse de que `null` es un caso —quedarse sin club, o
 * el primer club de la carrera— y de que quedarse en el mismo club pasa por acá
 * con los dos ids iguales.
 */
export function isRivalJump(fromClubId: string | null, toClubId: string): boolean {
    return areClassicRivals(fromClubId, toClubId);
}

/**
 * Cobrar el salto: la Pertenencia del club que dejás se borra.
 *
 * Muta el estado —el reducer trabaja sobre un clon— y devuelve la línea de
 * crónica, o `null` si no hubo nada que cobrar.
 *
 * ── NO PASA POR `applyBelonging`, Y NO ES UN ATAJO ──────────────────────────
 * Esa función aplica un DELTA con el orden de operaciones entero encima: el
 * congelamiento, el descuento del exterior, el amortiguador de los últimos
 * tramos y los dos techos. Ninguna de esas cinco reglas tiene algo que decir
 * acá, porque esto no es perder puntos: es que la cuenta deja de existir.
 *
 * Escrito como `applyBelonging(-belongingOf(...))` el resultado dependería de si
 * el salto se cobra antes o después de mover `player.clubId` —el congelamiento
 * mira justamente eso— y esa clase de invariante de orden es la que se rompe
 * sola seis meses después, en silencio y a favor del jugador.
 */
export function payRivalJump(state: CaptainState, leftClubId: string): string | null {
    const antes = state.belonging.byClub[leftClubId] ?? 0;
    state.belonging = clearBelonging(state.belonging, leftClubId);

    // Sin nada construido no hay nada que contar. Pasa de verdad: el pibe que se
    // va en su primera temporada no le debe nada a nadie todavía. El techo del
    // traidor lo alcanza igual —sale de la trayectoria, no de este número— y esa
    // es la parte que le va a doler si alguna vez vuelve.
    if (antes <= 0) return null;

    return `Te fuiste al clásico. En ${getClub(leftClubId).name} te borraron: los años que llevabas ahí no cuentan más.`;
}
