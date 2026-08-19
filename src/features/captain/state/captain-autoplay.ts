// EL CAPITÁN — EL JUGADOR SIN PANTALLA.
//
// Un torneo se destapa a mano, celda por celda, y eso lo hace injugable para el
// digest congelado —que corre carreras enteras en Node, sin DOM y sin dedos—.
// Este archivo es a un torneo lo que `MomentDef.playAt` es a un Momento: la
// forma declarada de jugarlo sin estar sentado adelante.
//
// ── POR QUÉ VIVE EN `state/` Y NO EN `engine/` ─────────────────────────────
// Porque MANEJA EL REDUCER, y el reducer vive acá. Ponerlo en `engine/` lo
// obligaría a importar la acción y el reducer desde `state/`, o sea a invertir
// la única flecha de dependencia que el feature tiene clara: `state/` conoce
// `engine/`, nunca al revés. Un helper que necesita las dos mitades pertenece a
// la mitad de arriba.
//
// ── POR QUÉ ES CÓDIGO DE PRODUCCIÓN Y NO UN HELPER DE TEST ─────────────────
// Por lo mismo que `playAt` es obligatoria en el contrato y no opcional: con un
// helper suelto en un archivo de test, el torneo número cuatro se escribe sin
// que nadie se entere de que hace falta una política para su comodín. Acá, la
// política tiene un nombre, un lugar y un comentario que dice por qué es esa.
//
// Y hay una segunda razón, más práctica: el día que el juego ofrezca «simular la
// temporada» —que es una pregunta abierta y no una promesa—, la decisión ya está
// escrita en un solo lugar en vez de repartida en seis archivos de test.

import type { CaptainState } from '../types/captain.ts';
import type { ComodinId, PendingTournament } from '../types/tournament.ts';
import { getTournament } from '../data/tournaments.ts';
import { canUseComodin, comodinesFor } from '../engine/tournament-gate.ts';
import { captainReducer } from './captain-reducer.ts';

/**
 * Tope de gestos por torneo.
 *
 * El Mundial son siete partidos, y en los Mundiales cada partido son DOS gestos
 * —abrir la grilla y elegir la celda— más la final, que son hasta siete
 * casillas. Con el cierre, el techo real ronda los veinticinco; cuarenta es
 * holgura sin ser un tope que no corta nunca.
 */
const MAX_CELDAS = 40;

/**
 * CUÁNDO QUEMA LA ARENGA EL QUE NO TIENE DEDOS.
 *
 * La política es GUARDARLA PARA LA ÚLTIMA RONDA LEGAL —la semifinal— y es una
 * elección, no la única posible. Vale escribir por qué es esa y qué deja afuera:
 *
 *   · Es la GREEDY honesta. El comodín no vale en la final, así que la semi es
 *     la ronda de más valor donde todavía se puede usar. Un jugador humano
 *     razonable hace esto salvo que el cruce de octavos lo asuste.
 *   · Deja SIN COBERTURA la rama de quemarla temprano. Es una limitación real
 *     del digest y queda dicha acá en vez de descubrirse dentro de seis meses:
 *     el camino "la gasté en octavos" no lo recorre ninguna carrera simulada.
 *     Cuando haga falta cubrirlo, se cubre con una segunda política y un caso
 *     propio, no cambiando esta —que movería el digest entero por plomería.
 *
 * Determinista y sin rng, igual que `playAt`: un mismo estado da siempre la
 * misma respuesta.
 */
// Se llamaba `arengaPolicy` cuando la arenga era el único comodín. Con tres, el
// nombre describía UNO y la función decide por los tres — que es el §1.5 del
// CLAUDE de captain, la falla más cara del proyecto porque leer con atención
// confirma el nombre y hay que ir a buscar el cuerpo.
export function quemarPolicy(t: PendingTournament, state: CaptainState): boolean {
    if (!canUseComodin(t, state)) return false;
    // La política sigue siendo la de la arenga —la semi— para los tres, y eso es
    // deliberado: cambiarla por comodín movería el digest por PLOMERÍA y no por
    // un cambio de reglas, que es exactamente lo que el comentario de arriba
    // pide no hacer. Los otros dos tienen su propia ventana (`canUseComodin` ya
    // la aplica), así que en la práctica cada uno se quema en la primera ronda
    // en que puede — que es la greedy honesta para los tres.
    if (t.comodin === 'arenga') return t.round === 'semi';
    return true;
}

/**
 * QUÉ COMODÍN SE TRAE EL SIN PANTALLA.
 *
 * LA ARENGA CUANDO ESTÁ, y esa preferencia no es una opinión sobre cuál es
 * mejor: es lo que mantiene el digest comparable. Antes de los tres comodines la
 * arenga era el único, así que elegirla cuando está disponible deja las carreras
 * ya medidas exactamente donde estaban, y el movimiento del digest se puede
 * atribuir a lo que cambió de verdad y no a que el sin pantalla empezó a jugar
 * con otra carta (§1.10: el digest se actualiza en commit propio).
 *
 * El resto en orden de catálogo, que es estable.
 */
export function comodinPolicy(state: CaptainState, t: PendingTournament): ComodinId | null {
    const disponibles = comodinesFor(state, getTournament(t.id));
    if (disponibles.length === 0) return null;
    const arenga = disponibles.find((c) => c.id === 'arenga');
    return (arenga ?? disponibles[0]).id;
}

/**
 * Juega el torneo entero y devuelve el estado con la fase ya cerrada.
 *
 * Si el estado no está en fase de torneo, lo devuelve intacto: así el que lo
 * llama puede ponerlo en la línea de la temporada sin preguntar antes, que es
 * como lo van a usar los seis drivers de test.
 *
 * TIRA si el torneo no avanza. Es la misma disciplina que `trabada()` en el
 * digest y por el mismo motivo: un tope que corta en silencio convierte el
 * próximo bucle infinito en una carrera corta que nadie mira. Colgarse es malo;
 * mentir en silencio es peor.
 */
export function playTournament(state: CaptainState): CaptainState {
    if (state.phase !== 'tournament') return state;

    let next = state;
    for (let i = 0; i < MAX_CELDAS; i += 1) {
        if (next.phase !== 'tournament' || !next.pendingTournament) return next;

        // Primero se elige el comodín —es lo que pasa en la pantalla: la
        // pregunta llega antes del primer partido— y después se ve si se quema.
        if (next.pendingTournament.comodin === null) {
            const elegido = comodinPolicy(next, next.pendingTournament);
            if (elegido !== null) {
                next = captainReducer(next, { type: 'CHOOSE_COMODIN', comodin: elegido });
            }
        }

        if (next.pendingTournament && quemarPolicy(next.pendingTournament, next)) {
            next = captainReducer(next, { type: 'USE_COMODIN' });
        }

        // La llave cerrada espera un gesto más: el jugador de carne mira el
        // resultado y aprieta seguir. El sin pantalla no mira nada, pero tiene
        // que dar el mismo paso o el torneo no se cobra nunca.
        if (next.pendingTournament.outcome !== null) {
            next = captainReducer(next, { type: 'FINISH_TOURNAMENT' });
            continue;
        }

        // LA FINAL SE JUEGA. El sin pantalla elige la PRIMERA casilla libre y no
        // una al azar, y da igual: las nueve son indistinguibles, así que
        // cualquier orden tiene la misma probabilidad. Elegir 'la primera libre'
        // es determinista y no necesita rng — que es justo lo que este archivo
        // necesita para que el digest siga siendo comparable.
        const enJuego = next.pendingTournament.matches.find((m) => !m.revealed);
        const antes = next.pendingTournament.matches.filter((m) => m.revealed).length
            + (next.pendingTournament.playing === null ? 0 : 1);
        if (enJuego?.casillas) {
            const g = enJuego.casillas;
            const libre = g.celdas.findIndex((_, i) => !g.abiertas.includes(i) && g.tachada !== i);
            if (libre < 0) throw new Error('playTournament: la final se quedó sin casillas libres.');
            next = captainReducer(next, { type: 'PICK_CELL', index: libre });
            continue;
        }

        // LA GRILLA DE TREINTA ABIERTA: elige la primera celda LIBRE. Da igual
        // cuál —el reparto ya está hecho y la posición no cambia la
        // probabilidad— así que 'la primera' es determinista y alcanza.
        //
        // ── «LIBRE» Y NO «LA CERO» (0.36.0) ─────────────────────────────────
        // Era `index: 0` fijo y se rompió en cuanto entró la charla con el
        // árbitro: las celdas que tacha son las primeras PERDEDORAS por índice,
        // así que la cero pasa a estar tachada la mayoría de las veces. El
        // reducer la rechaza —como corresponde— y devuelve el mismo estado, el
        // driver vuelve a pedir la cero, y el torneo gira hasta que salta el
        // guardia de gestos.
        //
        // Es el mismo bug que el §1.5 describe con otras palabras: `0` no decía
        // «una celda jugable», decía «la primera de la lista», y el día que la
        // lista cambió abajo siguió compilando y devolviendo un número que
        // parecía sano. La medicina es la de siempre — pedir por lo que la cosa
        // ES.
        if (next.pendingTournament.playing !== null) {
            const g = next.pendingTournament.matches[next.pendingTournament.playing]?.grid;
            if (!g) throw new Error('playTournament: hay un partido abierto sin grilla.');
            const libre = g.celdas.findIndex((_, i) => !g.tachadas.includes(i));
            if (libre < 0) throw new Error('playTournament: la grilla se quedó sin celdas jugables.');
            next = captainReducer(next, { type: 'PICK_GRID', index: libre });
            continue;
        }

        // El sin pantalla destapa la primera libre de la ronda. Es la misma
        // política que en las casillas y por el mismo motivo: el orden no cambia
        // el resultado, así que 'la primera' es determinista y alcanza.
        const idx = next.pendingTournament.matches.findIndex(
            (m) => !m.revealed && m.round === next.pendingTournament!.round,
        );
        if (idx < 0) throw new Error('playTournament: la ronda no tiene celdas por destapar.');
        next = captainReducer(next, { type: 'REVEAL_MATCH', index: idx });

        // El guardia mira el PROGRESO y no la fase: un torneo que abre una ronda
        // nueva sigue en fase de torneo, así que comparar fases no distinguiría
        // "avanzó" de "se trabó".
        //
        // Y "progreso" no es solo destapar: en los Mundiales, tocar un partido
        // ABRE su grilla de treinta sin destaparlo, y eso también es avanzar. Sin
        // contarlo, el guardia se disparaba en el primer partido de todo Mundial
        // — la cuenta de destapadas seguía en cero y el driver lo leía como un
        // bucle.
        const despues = next.pendingTournament
            ? next.pendingTournament.matches.filter((m) => m.revealed).length
              + (next.pendingTournament.playing === null ? 0 : 1)
            : Infinity;
        if (next.phase === 'tournament' && despues <= antes) {
            throw new Error(
                `playTournament: el torneo '${next.pendingTournament?.id}' no avanzó `
                + `(ronda ${next.pendingTournament?.round}, ${antes} celdas destapadas).`,
            );
        }
    }

    throw new Error(
        `playTournament: el torneo '${state.pendingTournament?.id}' pasó de ${MAX_CELDAS} celdas `
        + `(${getTournament(state.pendingTournament!.id).labelEs}).`,
    );
}
