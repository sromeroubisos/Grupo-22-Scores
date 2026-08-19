// EL CAPITÁN — QUIÉN JUEGA QUÉ, Y QUÉ LE DEJA.
//
// La compuerta y el saldo, juntos y aparte del motor del torneo: `tournament.ts`
// sabe armar una llave y no sabe nada de carreras; este archivo es el único que
// mira el estado. La partición es la misma que separa la mecánica del minijuego,
// y sirve para lo mismo — el motor del torneo se puede probar sin construir un
// `CaptainState`.
//
// ── LA REGLA DEL UNO POR AÑO ───────────────────────────────────────────────
// Como mucho un torneo por temporada, y el orden del catálogo decide cuál. No es
// una limitación técnica: un año con el Mundial M20 en junio y el Argentino
// Juvenil en septiembre son dos torneos de la misma persona en la misma
// temporada, y el juego no tiene forma de contar eso sin que la temporada deje
// de ser la unidad. Cuando dos compiten, gana el de más arriba en `TOURNAMENTS`,
// que está ordenado por edad.

import type { CaptainState } from '../types/captain.ts';
import type {
    PendingTournament,
    TournamentDef,
    TournamentId,
    TournamentReward,
} from '../types/tournament.ts';
import type { ComodinDef } from '../types/tournament.ts';
import {
    ARBITRO_BELONGING,
    ARENGA_LIDERAZGO,
    COMODINES,
    PLAN_VISION,
    ROUND_LABEL,
} from '../types/tournament.ts';
import { belongingOf } from './belonging.ts';
import { TOURNAMENTS, getTournament } from '../data/tournaments.ts';
import { arRegionOf, isWorldCupYear, regionOfCountry, worldRanking } from '../data/catalogs.ts';
import { competitionOf } from './promotion.ts';
import {
    finalPlace,
    groupPoints,
    matchResult,
    openRound,
    ordinal,
    ownStrength,
    rivalsFor,
    tierMoveOf,
    unionsByRanking,
} from './tournament.ts';
import type { BuildCtx } from './tournament.ts';
import { hashSeed } from './random.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LA COMPUERTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TU REGIÓN, para el Campeonato Argentino.
 *
 * Sale del club: el canon argentino ya sabe en qué región juega cada división,
 * así que la provincia que representás se DERIVA de dónde jugás en vez de
 * preguntártela. Es la respuesta correcta —a los diecisiete te convoca la unión
 * de tu club, no la de tu documento— y encima ahorra una pantalla.
 *
 * `null` cuando el club no resuelve a una competición argentina, que es el caso
 * del argentino que se fue afuera de pibe. El fallback lo pone el catálogo.
 */
export function regionOf(state: CaptainState): string | null {
    const competition = competitionOf(state.divisions, state.player.clubId);
    if (competition === null) return null;
    return arRegionOf(competition);
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 bis · LA DIVISIÓN — de qué lado del ascenso está tu unión
// ═══════════════════════════════════════════════════════════════════════════
//
// El Mundial juvenil son dos torneos y solo uno te toca. Cuál, lo decide tu
// unión: arranca por ranking mundial y se mueve con lo que hiciste en las
// ediciones anteriores —dos primeros suben, dos últimos bajan—.
//
// NADA DE ESTO SE GUARDA. Se recalcula leyendo `state.tournaments`, que ya tiene
// las ediciones jugadas enteras. El argumento está en `types/tournament.ts §2
// bis` y el resumen es: un campo `division` persistido sería una segunda fuente
// de verdad, y bastaría un solo camino que se olvide de actualizarla para que la
// vitrina reciba una copa de la primera división ganada en la segunda.

/**
 * LA CADENA DE DIVISIONES a la que pertenece un torneo, de arriba hacia abajo.
 *
 * Se camina por los enlaces declarados y no por una lista escrita: el día que
 * entre una tercera división, entra en el catálogo y esto la encuentra sola.
 *
 * El tope tiene guarda de vueltas: un catálogo con `up` y `down` apuntándose
 * entre sí mal escrito colgaría el hilo, y un torneo que no aparece en pantalla
 * es más fácil de encontrar que una pestaña congelada.
 */
export function tierChainOf(def: TournamentDef): TournamentDef[] {
    if (!def.tier) return [def];

    let cima = def;
    for (let i = 0; i < TOURNAMENTS.length && cima.tier?.up; i += 1) {
        cima = getTournament(cima.tier.up.to);
    }

    const cadena = [cima];
    for (let i = 0; i < TOURNAMENTS.length; i += 1) {
        const abajo = cadena[cadena.length - 1].tier?.down;
        if (!abajo) break;
        cadena.push(getTournament(abajo.to));
    }
    return cadena;
}

/**
 * DÓNDE ARRANCA UNA UNIÓN QUE NUNCA JUGÓ: en la división de su franja.
 *
 * La franja de cada división ya está declarada para armar el campo
 * (`fieldFromRank` + `fieldSize`), así que la pertenencia inicial NO se declara
 * de nuevo: se pregunta. Escribir «la A son las dieciséis mejores» en dos lados
 * es la derivada congelada del §1.9, con el agravante de que el día que la
 * primera división pase a tener veinte equipos, la lista vieja seguiría mandando
 * a la 18ª del mundo a la B.
 *
 * La que no entra en ninguna franja —la 90ª del mundo— juega la última división.
 * Es la respuesta correcta: abajo de la B no hay un torneo C, hay no jugar un
 * Mundial, y dejar sin torneo juvenil a media tabla del mundo sería peor.
 */
export function entryDivisionOf(unionCode: string, def: TournamentDef): TournamentId {
    const cadena = tierChainOf(def);
    const rank = worldRanking(unionCode);

    if (rank !== null) {
        const suya = cadena.find(
            (d) => rank >= d.fieldFromRank && rank <= d.fieldFromRank + d.fieldSize - 1,
        );
        if (suya) return suya.id;
    }
    return cadena[cadena.length - 1].id;
}

/**
 * EN QUÉ DIVISIÓN ESTÁ TU UNIÓN HOY.
 *
 * El punto de partida es el ranking y encima se aplican, EN ORDEN, los
 * movimientos de cada edición ya jugada. `state.tournaments` está en orden de
 * juego porque el reducer las empuja al cerrar, que es la única forma en que
 * entran.
 *
 * Solo cuentan las ediciones de ESTA cadena: el Argentino Juvenil y el Mundial
 * mayor no tienen divisiones y no mueven nada. Sin ese filtro, el día que entre
 * una segunda cadena —un Trophy de mayores, por ejemplo— un ascenso de allá
 * movería tu división de acá.
 */
export class TournamentHistoryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TournamentHistoryError';
    }
}

export function divisionOf(state: CaptainState, def: TournamentDef): TournamentId {
    if (!def.tier) return def.id;

    const cadena = new Set(tierChainOf(def).map((d) => d.id));
    let actual = entryDivisionOf(state.player.countryCode, def);

    for (const jugado of state.tournaments) {
        if (!cadena.has(jugado.id)) continue;

        // ── LA GUARDA, Y POR QUÉ HACE FALTA JUSTAMENTE ACÁ ──────────────────
        // Derivar la división en vez de guardarla es lo correcto y es lo
        // contrario de la constante congelada del §1.9. Pero una derivada sólo
        // vale lo que valen sus insumos, y el insumo de ésta es una LISTA
        // COMPLETA de ediciones jugadas: si una migración de schema la trunca, o
        // si alguna vez se decide recortar `tournaments` para achicar el
        // guardado, el recálculo no falla — devuelve otra división, en silencio,
        // y el jugador aparece en la B sin haber descendido nunca.
        //
        // Lo que lo delata es una invariante barata: SÓLO SE PUEDE HABER JUGADO
        // LA DIVISIÓN EN LA QUE SE ESTABA. `gateOpen` no abre ninguna otra
        // (compara `divisionOf` contra el id), así que cualquier historial
        // completo la cumple por construcción y cualquier hueco la rompe — el
        // ascenso que falta deja a la edición siguiente colgando de una división
        // que el recorrido nunca alcanzó.
        //
        // TIRA en vez de asumir el tier A, que es lo que pidió el diseño: una
        // partida que no se puede reconstruir tiene que decirlo. Y no explota en
        // la cara del jugador porque el único que llama sin red es
        // `validateCaptainState`, que corre AL CARGAR y resuelve `'outdated'`
        // (CLAUDE.md raíz §2). De ahí en adelante el estado ya está verificado.
        if (jugado.id !== actual) {
            throw new TournamentHistoryError(
                `El historial de ${def.labelEs} no cierra: figura una edición de "${jugado.id}" `
                + `en la temporada ${jugado.season} cuando la carrera venía jugando "${actual}". `
                + 'Faltan ediciones en el guardado y la división no se puede reconstruir.',
            );
        }

        const movimiento = tierMoveOf(jugado, getTournament(jugado.id));
        if (movimiento) actual = movimiento.to;
    }

    return actual;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 ter · LA TABLA DE LAS 32 — el sistema que era invisible
// ═══════════════════════════════════════════════════════════════════════════
//
// El ascenso y el descenso del Mundial juvenil se recalculan desde las ediciones
// jugadas, con la unión moviéndose entre divisiones a lo largo de la carrera. Es
// el sistema más elegante del feature y era COMPLETAMENTE invisible: el jugador
// terminaba 15.º a los 18 y al año siguiente jugaba otro torneo sin que nada le
// dijera que había descendido.
//
// Esto lo pone en pantalla, y no agrega un solo dato al estado: las divisiones,
// el campo de cada una y los movimientos ya estaban todos declarados o
// derivados. Lo único que faltaba era preguntarlos juntos.

export interface DivisionRow {
    unionCode: string;
    /** Puesto en el ranking mundial, o `null` si no figura. */
    rank: number | null;
    /** ¿Es la tuya? */
    mine: boolean;
}

export interface DivisionTable {
    id: TournamentId;
    name: string;
    rows: DivisionRow[];
}

/**
 * EL CUADRO COMPLETO DE LA CADENA: cada división con su campo.
 *
 * El campo sale de `fieldFromRank` + `fieldSize`, que es de donde ya salía para
 * armar los rivales — no hay una segunda lista escrita a mano, y por eso el día
 * que la primera división pase a tener veinte equipos esta pantalla los muestra
 * sin que nadie venga a tocarla.
 *
 * TU UNIÓN SE MARCA CON `divisionOf` y no con su ranking: si descendiste, estás
 * en la B aunque tu ranking diga otra cosa, y ese desfasaje ES lo que la
 * pantalla existe para contar.
 */
export function divisionTablesOf(state: CaptainState, def: TournamentDef): DivisionTable[] {
    const mia = divisionOf(state, def);
    const yo = state.player.countryCode;
    // LA MISMA lista de la que sale el campo del sorteo. Ordenarla acá por su
    // cuenta sería la segunda fuente de verdad que `unionsByRanking` vino a
    // cerrar: el jugador vería un campo y jugaría contra otro.
    const ordenadas = unionsByRanking();

    return tierChainOf(def).map((division) => {
        const desde = division.fieldFromRank - 1;
        const rows: DivisionRow[] = ordenadas
            .slice(desde, desde + division.fieldSize)
            // La tuya se dibuja en SU división y no en la de su ranking: si
            // ascendió o descendió, el lugar que ocupa hoy es el que cuenta, y
            // ese desfasaje ES lo que esta pantalla existe para mostrar.
            .filter((code) => code !== yo)
            .map((code) => ({ unionCode: code, rank: worldRanking(code), mine: false }));

        if (division.id === mia) {
            rows.push({ unionCode: yo, rank: worldRanking(yo), mine: true });
        }

        return { id: division.id, name: division.labelEs, rows };
    });
}

/**
 * ¿Este torneo le toca a esta carrera, este año?
 *
 * Todo lee la compuerta declarada y nada mira el id. El día que entre un torneo
 * nuevo, entra por el catálogo o no entra.
 */
export function gateOpen(def: TournamentDef, state: CaptainState): boolean {
    const { player } = state;
    const [minAge, maxAge] = def.gate.ages;
    if (player.age < minAge || player.age > maxAge) return false;

    if (def.gate.unionCode !== null && player.countryCode !== def.gate.unionCode) return false;

    // LA REGIÓN, para los continentales. Sale de `regionOfCountry` —el mismo mapa
    // que usa el mercado— y no de una lista de países escrita en el catálogo: dos
    // listas del mismo hecho se separan en el primer país que se agregue (§1.9).
    if (def.gate.regions !== null) {
        const mia = regionOfCountry(player.countryCode);
        if (mia === null || !def.gate.regions.includes(mia)) return false;
    }

    if (def.gate.minOvr !== null && player.ovr < def.gate.minOvr) return false;

    if (def.gate.minTrack !== null) {
        // Hoy el único escalón que se pide es la mayor. Se compara por igualdad
        // y no por orden porque `a-xv` no es "casi nacional": es otro plantel, y
        // al Mundial no va.
        //
        // Y AL MUNDIAL VA EL PLANTEL, NO LA LISTA AMPLIA. El que está `trial`
        // tiene el escalón —lo llevaron de gira, su temporada dice `nacional`—
        // y no entra en los 33 de un Mundial: para eso está la distinción entre
        // que te miren y que seas de la casa. Se pregunta por el ESTADO y no por
        // el escalón porque son dos cosas distintas desde la 0.22.0.
        if (def.gate.minTrack === 'nacional') {
            // LAS DOS CONDICIONES, y hacen falta las dos.
            //
            //   · el ESCALÓN dice que te convocaron ESTE año. Sin esto, el que
            //     conserva el estado por inercia —temporada de gracia: sigue
            //     siendo del plantel y no fue citado— jugaba el Mundial igual, y
            //     su fila de trayectoria terminaba con caps y con el escalón en
            //     «Solo el club». Lo cazó `reducer.test.ts` con «los caps solo
            //     salen de la mayor», que es exactamente para lo que está.
            //   · el ESTADO dice que sos del plantel. Al que está `trial` lo
            //     llevan de gira y su temporada dice `nacional`, pero a los 33 de
            //     un Mundial no entra: para eso está la distinción entre que te
            //     miren y que seas de la casa.
            if (state.national.track !== 'nacional') return false;
            const enPlantel = state.national.status === 'squad' || state.national.status === 'starter';
            if (!enPlantel) return false;
        }
        // LA VENTANA DE LOS DIECISIETE: al continental M18 va el que su unión ya
        // miró, y `union` es el primer escalón de esa escalera. Se pregunta «no
        // te quedaste en el club», que es lo que el escalón significa: el que
        // llegó a la academia también está adentro.
        //
        // El provincial NO lo pide —lo juegan todos, la provincia es ancha— y esa
        // diferencia ES el escalón entre los dos torneos del mismo año.
        if (def.gate.minTrack === 'union' && state.national.track === 'club') return false;
        if (def.gate.minTrack === 'm20' && state.national.track === 'club') return false;

        // LA VENTANA DE LOS A, y también por igualdad. El que está en la mayor
        // NO juega además la Nations Cup: es otro plantel, y un convocado de Los
        // Pumas no viaja con Argentina XV. Que lo deje afuera «por arriba» es
        // correcto y no un caso borde — el Mundial mayor lo espera en su año.
        if (def.gate.minTrack === 'a-xv' && state.national.track !== 'a-xv') return false;
    }

    // El Mundial cae cada cuatro años y la edición la decide el calendario, no
    // una cuenta escrita acá.
    if (!def.gate.everySeason && !isWorldCupYear(state.season - 1)) return false;

    // Sin unión no hay selección. Un jugador de un país sin rugby organizado
    // juega su liga y nada más, que es la verdad y no un caso borde.
    if (def.gate.unionCode === null && !player.countryCode) return false;

    // LA DIVISIÓN, y es la última porque es la más cara de contestar: recorre las
    // ediciones ya jugadas. Las dos divisiones del M20 comparten edad, media y
    // calendario, así que sin esto abriría siempre la primera —la que está antes
    // en el catálogo— y la segunda sería contenido muerto con cartel de vivo, que
    // es el bug que este archivo ya pagó una vez con el `'AR'` en mayúscula.
    if (def.tier && divisionOf(state, def) !== def.id) return false;

    return true;
}

/**
 * El torneo que te toca AHORA, o `null`.
 *
 * Se recorre `TOURNAMENTS` en orden declarado —está ordenado por edad— y se
 * devuelve el primero que abre y que TODAVÍA NO SE JUGÓ ESTA TEMPORADA.
 *
 * ── SE CAYÓ LA REGLA DEL UNO POR AÑO, Y ESTO ES LO QUE LA REEMPLAZA ─────────
 * Decía que una temporada trae como mucho un torneo, y el argumento era que el
 * juego no tenía forma de contar dos sin que la temporada dejara de ser la
 * unidad. El calendario real de los diecisiete lo desmintió: se juega el
 * provincial y de ahí sale el equipo del continental M18, los dos el mismo año y
 * en ese orden. Con la regla vieja, agregar el continental habría TAPADO al
 * provincial —gana el de más arriba— y el juego habría cambiado un torneo por
 * otro en vez de sumar el escalón que faltaba.
 *
 * La regla nueva es más chica y se lee sola: CADA TORNEO SE JUEGA UNA VEZ POR
 * TEMPORADA. Cuántos caen es cosa del catálogo, no de este archivo: las
 * compuertas ya se excluyen entre ellas donde tienen que hacerlo —el convocado de
 * la mayor no juega además la ventana de los A— así que el máximo real hoy es
 * dos y no hace falta un tope que lo diga (§1.6: un mecanismo que se reduce a un
 * número es un número).
 *
 * La cuenta sale de `state.tournaments`, que ya guarda las ediciones jugadas con
 * su temporada adentro. Un contador aparte sería la segunda fuente de verdad de
 * siempre.
 */
export function tournamentDue(state: CaptainState): TournamentId | null {
    if (state.player.retired) return null;
    const jugadosEsteAnio = new Set(
        state.tournaments.filter((t) => t.season === state.season).map((t) => t.id),
    );
    for (const def of TOURNAMENTS) {
        if (jugadosEsteAnio.has(def.id)) continue;
        if (gateOpen(def, state)) return def.id;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 · ABRIR EL TORNEO
// ═══════════════════════════════════════════════════════════════════════════

/** El contexto de construcción, armado desde el estado UNA vez. */
export function buildCtxOf(state: CaptainState, def: TournamentDef): BuildCtx {
    const region = regionOf(state);
    const union = state.player.countryCode;
    return {
        def,
        rivals: rivalsFor(def, union, region),
        mine: ownStrength(def, union, region, state.player.ovr),
        ovr: state.player.ovr,
        vision: state.player.attrs.vision,
    };
}

/**
 * Abre el torneo con la fase de grupos ya sorteada.
 *
 * La semilla es derivada —`hash(semilla:tour:id:temporada)`— así que abrir un
 * torneo no corre el rng de la carrera. Es la misma decisión que la semilla de
 * un Momento y por el mismo motivo: agregar torneos no puede mover el digest de
 * las carreras que no los juegan.
 */
export function openTournament(state: CaptainState, id: TournamentId): PendingTournament {
    const def = getTournament(id);
    const t: PendingTournament = {
        id,
        season: state.season,
        seed: hashSeed(`tour:${state.seed}:${id}:${state.season}`),
        unionCode: state.player.countryCode,
        matches: [],
        round: 'grupos',
        playing: null,
        // El comodín se elige DESPUÉS de abrir y antes del primer partido: la
        // llave ya está sorteada cuando se pregunta, y tiene que ser así — elegir
        // sin ver contra quién te tocó sería una decisión a ciegas, y elegir
        // después del primer resultado sería elegir sabiendo. Abrir el torneo y
        // preguntar en la misma pantalla es el único punto donde la información
        // es exactamente la que el jugador tiene que tener.
        comodin: null,
        comodinUsed: false,
        outcome: null,
        finalRound: null,
    };
    openRound(t, buildCtxOf(state, def), 'grupos');
    return t;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · LOS COMODINES
// ═══════════════════════════════════════════════════════════════════════════
//
// La decisión es DOBLE y las dos mitades viven acá: cuál traés
// (`comodinesFor`, antes del primer partido) y cuándo lo quemás
// (`canUseComodin`, en cada ronda). Ninguna tiene respuesta obvia, que es todo
// lo que le pedimos a una decisión.

/**
 * LOS QUE PODÉS TRAER A ESTE TORNEO, en el orden canónico del catálogo.
 *
 * Vacío cuando el torneo no ofrece comodines o cuando no llegás a ningún
 * requisito, y en los dos casos la pantalla no pregunta nada: un selector de una
 * sola opción no es una elección, y uno de cero es una pantalla vacía. Es la
 * misma regla que prohíbe la decisión de una sola opción (§3 del CLAUDE raíz).
 *
 * ── LOS REQUISITOS SE PREGUNTAN, NO SE ESCRIBEN ────────────────────────────
 * «Ser capitán» es la Pertenencia con TU club leída con la misma función que la
 * dibuja en la cabecera, no un número acá. Y el escalón sale de
 * `BELONGING_TIERS`, así que el día que los cinco pisos se muevan —ya pasó una
 * vez— este comodín se mueve con ellos.
 */
export function comodinesFor(state: CaptainState, def: TournamentDef): ComodinDef[] {
    if (!def.arenga) return [];

    const pertenencia = belongingOf(state.belonging, state.player.clubId);
    return COMODINES.filter((c) => {
        if (c.id === 'arenga') return state.player.attrs.liderazgo >= ARENGA_LIDERAZGO;
        if (c.id === 'arbitro') return pertenencia >= ARBITRO_BELONGING;
        return state.player.attrs.vision >= PLAN_VISION;
    });
}

/**
 * ¿SE PUEDE QUEMAR EL COMODÍN AHORA?
 *
 * Las condiciones comunes son tres —lo trajiste, no lo gastaste, y el torneo lo
 * declara— y encima cada uno tiene SU ronda, que es lo que los hace distintos:
 *
 *   · `arenga`  — eliminatorias y NUNCA la final. La cuarta condición de siempre
 *     convierte «guardala para la final» —que no es una decisión, es una
 *     instrucción que todos siguen igual— en «¿en qué ronda la quemo?».
 *   · `arbitro` — sólo donde hay grilla que abrir. La final del Mundial se juega
 *     en casillas y no tiene grilla, así que ahí no hay nada que tachar.
 *   · `plan`    — sólo en grupos, y sólo si YA perdiste uno. Es el único que
 *     mira hacia atrás, y por eso es el único que no se puede quemar preventivo.
 *
 * Que las tres ventanas no se pisen es lo que hace que la elección del principio
 * importe: el que trajo el cambio de plan no tiene con qué empujar la semifinal.
 */
export function canUseComodin(t: PendingTournament, state: CaptainState): boolean {
    const def = getTournament(t.id);
    if (!def.arenga || t.comodin === null || t.comodinUsed) return false;
    // Se vuelve a preguntar el requisito y no se confía en que se eligió con él:
    // entre traer el comodín y quemarlo pasan partidos, y la Pertenencia puede
    // haberse movido. Un botón habilitado que el reducer rechaza es peor que un
    // botón que nunca se habilitó.
    if (!comodinesFor(state, def).some((c) => c.id === t.comodin)) return false;

    if (t.comodin === 'arenga') return t.round !== 'final' && t.round !== 'grupos';
    if (t.comodin === 'arbitro') return proximoConGrilla(t) !== null;
    return partidoParaRehacer(t) !== null;
}

/**
 * EL PRÓXIMO PARTIDO CON GRILLA SIN JUGAR, por índice, o `null`.
 *
 * Se busca el primero sin destapar de la ronda en curso: es el que el jugador
 * tiene delante, y tachar celdas de uno que todavía no se sorteó sería tachar
 * sobre un tablero que no existe.
 */
export function proximoConGrilla(t: PendingTournament): number | null {
    const i = t.matches.findIndex((m) => !m.revealed && m.grid !== null && m.grid.elegida === null);
    return i < 0 ? null : i;
}

/**
 * EL PARTIDO DE GRUPOS QUE SE PUEDE REHACER, o `null`.
 *
 * El PRIMERO que se perdió y sigue siendo de la fase de grupos. Se elige el
 * primero y no el peor a propósito: dejar que el jugador elija cuál rehacer
 * convertiría el comodín en «rehacé el que más te convenga», que con los
 * marcadores ya a la vista no es una decisión sino una corrección. Lo que se
 * decide es CUÁNDO —apenas se pierde uno, o se aguanta por si viene otro peor—
 * y esa espera es la tensión.
 */
export function partidoParaRehacer(t: PendingTournament): number | null {
    if (t.round !== 'grupos') return null;
    const i = t.matches.findIndex((m) => m.round === 'grupos' && m.revealed && matchResult(m) === 'perdido');
    return i < 0 ? null : i;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4 · EL SALDO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CUÁNTOS CAPS DEJA, y por qué todos menos uno dejan CERO.
 *
 * Un cap es un partido con la MAYOR. Los Pumitas no dan caps, el Argentino
 * Juvenil tampoco, y —esto es lo que el rugby no perdona— ARGENTINA XV TAMPOCO:
 * la Nations Cup se juega con el segundo seleccionado y ni uno de esos partidos
 * entra en la cuenta que un jugador dice cuando le preguntan cuántos caps tiene.
 * No es una tacañería del motor: es cómo se cuentan los caps. Que ni el Mundial
 * M20 ni la Nations Cup sumen uno solo es exactamente lo que hace que el primer
 * cap, cuando llegue, valga.
 */
function capsOf(def: TournamentDef, played: number): number {
    return def.gate.minTrack === 'nacional' ? played : 0;
}

/**
 * El Cartel que deja el torneo.
 *
 * Sale de DOS cosas y no de una: hasta dónde llegó el equipo y cómo jugaste vos.
 * Un eliminado en grupos que la clavó los tres partidos sale con más nombre que
 * un campeón que miró desde el banco — que es lo que pasa de verdad, y es la
 * única forma de que el torneo deje algo cuando sale mal.
 */
// ⚠️ ESTOS NÚMEROS SE MIDIERON CONTRA EL DIGEST, no se estimaron.
//
// La primera versión pagaba 26/14/4 con hasta 3 por partido, y el digest la
// desarmó: el Cartel de una carrera de pilar saltó de 17,7 a 77,7 y tres de los
// cuatro casos terminaron clavados en el techo de 100. O sea que los torneos no
// repartían fama: la regalaban, y de paso aplastaban la única moneda que
// distingue una carrera anónima de una conocida.
//
// La escala de ahora deja el Mundial ganado como el evento más grande que le
// puede pasar a una carrera —(8 + hasta 7 de juego) × 1,6 ≈ 24, más que una
// carrera amateur entera— sin que el Argentino Juvenil de los diecisiete mueva
// más que un par de puntos.
const FAME_BY_OUTCOME: Record<'campeon' | 'finalista' | 'eliminado', number> = {
    campeon: 8,
    finalista: 4,
    eliminado: 1,
};

const FAME_BY_GRADE = { clavado: 0.8, logrado: 0.4, tibio: 0.1, errado: 0 } as const;

/**
 * Lo que el torneo le deja a la carrera.
 *
 * El trofeo se otorga SOLO al campeón, y campeón es el que ganó el partido por
 * el título: ganar la final del cuadro del quinto puesto no es ganar el Mundial.
 * Quién lo distingue es `closeTournament` con `isTitleDecider`, y es lo que
 * impide que la vitrina reciba una copa que nadie levantó.
 */
export function rewardOf(t: PendingTournament): TournamentReward {
    const def = getTournament(t.id);
    const jugados = t.matches.filter((m) => m.revealed).length;
    const outcome = t.outcome ?? 'eliminado';

    const fameJuego = t.matches
        .filter((m) => m.revealed)
        .reduce((acc, m) => acc + FAME_BY_GRADE[m.tuya], 0);

    const esCampeon = outcome === 'campeon';

    // EL NIVEL DEL TORNEO, y la brecha entre juveniles y mayor es a propósito
    // grande. Medido contra el digest: el M20 se juega hasta TRES veces (18, 19
    // y 20) y el Argentino Juvenil una, así que un multiplicador juvenil
    // generoso se cobra cuatro veces por carrera. El caso del pilar lo mostró —
    // 0 caps y aun así +18 de Cartel, todo de torneos donde no lo vio nadie
    // fuera de su provincia.
    //
    // ── SE PREGUNTA, YA NO SE DEDUCE ────────────────────────────────────────
    // Era un ternario que leía `minTrack` y `minOvr` para adivinar el nivel, con
    // la variable llamándose `nivel` y el cuerpo preguntando «¿tiene piso de
    // media?». Daba lo mismo para los cuatro torneos que había y dejaba de darlo
    // con el quinto: la Nations Cup no pide media, así que la ventana de los
    // seleccionados A habría cobrado lo mismo que el Argentino Juvenil de los
    // diecisiete. El nivel lo declara el catálogo (§1.7).
    const nivel = def.fameLevel;

    return {
        caps: capsOf(def, jugados),
        fame: Math.round((FAME_BY_OUTCOME[outcome] + fameJuego) * nivel),
        // ⚠️ CHICO, Y MEDIDO. Volver campeón se nota en el club, pero la
        // Pertenencia es el vínculo con LOS TUYOS y un torneo de selección no es
        // con ellos.
        //
        // La primera versión daba 8/4/1 y `calibration.test.ts` lo cazó de una:
        // «las dos escaleras se pelean de verdad» se fue a 0,54 contra un techo
        // de 0,50 — o sea que el camino fiel empezó a ganar demasiado seguido, y
        // lo estaba ganando con Pertenencia REGALADA por torneos que no se juegan
        // en el club. Ese test cuida la tensión que ES el juego: quedarse
        // construye la cancha con tu nombre, irse construye caps. Si irse también
        // construyera la cancha, no habría decisión.
        //
        // Con 3/1/0 y el multiplicador de nivel, un campeón del mundo suma menos
        // de la mitad de lo que deja una temporada normal en el club.
        belonging: esCampeon ? 3 : outcome === 'finalista' ? 1 : 0,
        title: esCampeon ? def.trophyEs : null,
        text: cronicaOf(t, def),
    };
}

/**
 * LA LÍNEA DE LA CRÓNICA.
 *
 * Una sola frase, en la voz del juego: crónica deportiva, voseo, sin signos de
 * exclamación. Es lo que queda escrito en la temporada y lo que se relee en la
 * trayectoria, así que dice DÓNDE terminó y no cuántos puntos hizo.
 */
function cronicaOf(t: PendingTournament, def: TournamentDef): string {
    const ganados = t.matches.filter((m) => m.revealed && matchResult(m) === 'ganado').length;
    const jugados = t.matches.filter((m) => m.revealed).length;

    // EL ASCENSO Y EL DESCENSO VAN PRIMERO, y le ganan hasta a la copa: para una
    // unión de la segunda división, subir es más grande que el trofeo que se
    // llevó para subir. Y bajar es lo único que se va a recordar de esa edición.
    const movimiento = tierMoveOf(t, def);
    const cola = movimiento?.kind === 'up'
        ? ` Suben al ${getTournament(movimiento.to).labelEs}.`
        : movimiento?.kind === 'down'
            ? ` Se van al ${getTournament(movimiento.to).labelEs}.`
            : '';

    if (t.outcome === 'campeon') {
        return `Salieron campeones del ${def.labelEs}. ${ganados} de ${jugados}.${cola}`;
    }
    if (t.outcome === 'finalista') {
        return `Llegaron a la final del ${def.labelEs} y se les escapó.${cola}`;
    }

    // EL TORNEO CON CUADROS DEJA UN PUESTO, no una ronda. «Se quedaron en
    // semifinales» es verdad y no dice nada: en el M20 todos juegan una
    // semifinal. Lo que se relee en la trayectoria dentro de diez temporadas es
    // que salieron terceros del mundo, o decimoterceros.
    const puesto = finalPlace(t, def);
    if (puesto !== null) {
        return `${def.labelEs}: terminaron en el ${ordinal(puesto)} puesto. ${ganados} de ${jugados}.${cola}`;
    }

    if (t.round === 'grupos' || t.finalRound === 'grupos') {
        return `${def.labelEs}: se quedaron en el grupo con ${groupPoints(t)} puntos.`;
    }
    const ronda = ROUND_LABEL[t.finalRound ?? t.round].toLowerCase();
    return `${def.labelEs}: se quedaron en ${ronda}.`;
}
