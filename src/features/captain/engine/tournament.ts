// EL CAPITÁN — el motor del TORNEO REPRESENTATIVO.
//
// Arma la fase de grupos, decide quién pasa, sortea los cruces ronda a ronda y
// resuelve la definición a los palos. Todo determinista y sin tocar el rng de la
// carrera: la suerte del torneo sale de `hash(semilla:torneo:temporada:ronda)`,
// igual que la de un Momento.
//
// ── EL MARCADOR ES DE RUGBY, Y ESO NO ES DECORACIÓN ────────────────────────
// Un marcador de rugby no es un número: es una suma de tries, conversiones y
// penales, y por eso 17-13 se lee bien y 4-2 se lee mal. Se arma desde las
// jugadas (§3) en vez de sortear un entero, y sale gratis: con los tries ya
// contados, el bonus ofensivo del grupo es un `>=` en vez de una segunda
// invención.
//
// ── LO QUE EL JUGADOR DECIDE ───────────────────────────────────────────────
// Una sola cosa, y está en la arenga: EN QUÉ RONDA QUEMARLA. Todo lo demás ya
// está escrito cuando la pantalla se dibuja. Que la única decisión sea esa es el
// diseño y no una carencia — el torneo existe para contar la tarde en que no
// depende de vos, y una tarde así con cinco palancas no es una tarde así.
//
// ── LA REGLA DEL SORTEO ADELANTADO ─────────────────────────────────────────
// Los partidos de una ronda se sortean AL ENTRAR A LA RONDA y quedan escritos en
// el guardado antes de que el jugador vea nada. Destapar solo cambia `revealed`.
// Si el marcador se sorteara al hacer clic, un F5 en el medio del torneo
// devolvería otro resultado — y el torneo dura nueve pantallas, así que la
// ventana para recargar es nueve veces la de un Momento.

import type { MinigameGrade } from '../types/minigame.ts';
import type {
    CasillasGrid,
    MatchGrid,
    KickOff,
    MatchResult,
    PendingTournament,
    RoundId,
    TournamentDef,
    TournamentId,
    TournamentMatch,
} from '../types/tournament.ts';
import {
    ARENGA_PUSH,
    CASILLAS_TOTAL,
    CASILLAS_TRIES,
    CASILLAS_VISION,
    DRAW_POINTS,
    GRID_MIN_WINS,
    GRID_TOTAL,
    LOSS_BONUS_MARGIN,
    ROUND_LABEL,
    ROUND_SHORT,
    TRY_BONUS_TRIES,
    WIN_POINTS,
} from '../types/tournament.ts';
import { PROVINCIAS, PROVINCIA_FALLBACK, provinciaOf } from '../data/tournaments.ts';
import { UNIONS_WITH_FIXTURE, regionOfCountry, unionName, worldRanking } from '../data/catalogs.ts';
import { createRng, hashSeed } from './random.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LA FUERZA DE LOS DE ENFRENTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * De puesto en el ranking mundial a fuerza de 0 a 100.
 *
 * La misma forma que `international-results.ts` le da al peso de una unión, pero
 * en la unidad que este motor necesita: allá se sortea un campeón entre veinte
 * uniones y hace falta una PONDERACIÓN; acá se juega un partido contra una y
 * hace falta una FUERZA. Convertir una en la otra sería la derivada congelada de
 * CLAUDE.md §1.9, así que cada una se calcula de lo mismo —el ranking— y ninguna
 * de la otra.
 *
 * Una unión sin ranking no vale cero: existe, compite y pierde casi siempre.
 */
const UNRANKED_STRENGTH = 34;

export function unionStrength(code: string): number {
    const rank = worldRanking(code);
    if (rank === null) return UNRANKED_STRENGTH;
    // El 1 vale 96, el 20 vale 58, el 40 vale 38. Lineal y sin sorpresas: lo que
    // hace falta es un orden creíble, no una curva.
    return Math.max(UNRANKED_STRENGTH, Math.round(96 - (rank - 1) * 1.45));
}

/**
 * CUÁNTO PESA TU SELECCIÓN, con vos adentro.
 *
 * Tu media empuja, pero poco: sos uno de quince y el torneo es del plantel. El
 * tope es +6 con una media de élite, que es lo que separa "el equipo con el 10
 * bueno" de "el equipo sin él" — y no lo que separa a un campeón de un
 * eliminado, porque un jugador solo no gana un Mundial.
 */
const PLAYER_PUSH_MAX = 6;
const PLAYER_PUSH_PIVOT = 62;

export function playerPush(ovr: number): number {
    return Math.max(-PLAYER_PUSH_MAX, Math.min(PLAYER_PUSH_MAX, (ovr - PLAYER_PUSH_PIVOT) * 0.22));
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LOS RIVALES
// ═══════════════════════════════════════════════════════════════════════════

/** Un rival ya resuelto: cómo se llama, qué código lleva y cuánto pesa. */
export interface RivalDef {
    code: string;
    labelEs: string;
    strength: number;
}

/**
 * TODAS LAS UNIONES CON FIXTURE, ORDENADAS POR RANKING. La lista de la que sale
 * cualquier franja de división.
 *
 * ── POR QUÉ ES UNA FUNCIÓN EXPORTADA Y NO TRES LÍNEAS ADENTRO DE `rivalsFor` ─
 * Porque la pregunta «¿quiénes están en la primera división?» ahora se hace en
 * DOS lugares: el sorteo de rivales y la tabla que la pantalla dibuja
 * (`divisionTablesOf`). Escrita dos veces, alcanzaría con que una de las dos
 * ordenara distinto para que el jugador viera un campo y jugara contra otro —y
 * el desempate es justamente la parte fácil de escribir distinto—.
 *
 * EL DESEMPATE ES POR CÓDIGO y no por orden del catálogo: dos uniones sin
 * ranking empatan en `Infinity`, y si el desempate fuera la posición en
 * `UNIONS_WITH_FIXTURE`, agregar una unión al final movería el campo de todos
 * los Mundiales ya jugados. Es la regla de siempre —ordenar estable antes de
 * elegir— y no depende de `Object.keys` ni del orden de inserción de nadie
 * (CLAUDE.md raíz §1).
 */
export function unionsByRanking(): string[] {
    return [...UNIONS_WITH_FIXTURE].sort((a, b) => {
        const ra = worldRanking(a) ?? Number.POSITIVE_INFINITY;
        const rb = worldRanking(b) ?? Number.POSITIVE_INFINITY;
        return ra !== rb ? ra - rb : a.localeCompare(b);
    });
}

/**
 * Contra quiénes se juega, en ORDEN ESTABLE y sin vos.
 *
 * El orden se fija antes de sortear y no sale de `Object.keys` ni del orden de
 * inserción de nadie: es la fuente de no-determinismo encubierta que CLAUDE.md
 * §1 prohíbe, y en un torneo se notaría como "el fixture cambió solo".
 */
export function rivalsFor(def: TournamentDef, unionCode: string, region: string | null): RivalDef[] {
    // ── EL CONTINENTAL: LAS UNIONES DE TU REGIÓN, POR RANKING ───────────────
    //
    // El recorte lo hace la REGIÓN y no la franja del ranking, que es la
    // diferencia con un Mundial: al Sudamericano M18 no van las seis mejores del
    // mundo, van las de Sudamérica. Las regiones las declara el torneo —un
    // continental puede juntar dos del mapa, ver `TournamentGate.regions`— y de
    // ahí sale el campo entero.
    //
    // Se ordena por ranking y se corta en `fieldSize`, con el mismo desempate por
    // código que el resto del archivo: sin él, dos uniones sin ranking quedarían
    // en el orden en que las devolvió el catálogo.
    if (def.rivalPool === 'region') {
        const regiones = new Set(def.gate.regions ?? []);
        return unionsByRanking()
            .filter((code) => code !== unionCode && regiones.has(regionOfCountry(code) ?? ''))
            .slice(0, Math.max(1, def.fieldSize - 1))
            .map((code) => ({ code, labelEs: unionName(code), strength: unionStrength(code) }));
    }

    if (def.rivalPool === 'provincias') {
        // El Campeonato Argentino: las otras siete provincias.
        const mia = provinciaOf(region) ?? PROVINCIA_FALLBACK;
        return PROVINCIAS.filter((p) => p.region !== mia.region).map((p) => ({
            code: `ar-${p.region}`,
            labelEs: p.labelEs,
            strength: p.strength,
        }));
    }

    // LOS MUNDIALES: EL CAMPO CLASIFICADO, no el catálogo entero.
    //
    // Se toma la FRANJA del ranking que el torneo declara —`fieldFromRank` y
    // `fieldSize`— y ese recorte ES la puerta que documenta `TournamentDef`. Sin
    // él, el sorteo veía ciento treinta y una uniones —cinco fuertes y ciento
    // veinte flojas— y el volumen le ganaba al peso de cercanía: Argentina jugaba
    // el Mundial M20 contra Senegal, Nepal e Islas Cook.
    //
    // El desempate es por CÓDIGO y no por orden del catálogo: dos uniones sin
    // ranking empatan en `Infinity`, y si el desempate fuera la posición en
    // `UNIONS_WITH_FIXTURE`, agregar una unión al final movería el campo de todos
    // los Mundiales ya jugados. Es la regla de siempre —ordenar estable antes de
    // elegir— aplicada al recorte y no al sorteo.
    const ordenadas = unionsByRanking().filter((code) => code !== unionCode);

    // ── LA FRANJA PRIMERO, Y DESPUÉS SE COMPLETA ────────────────────────────
    // Las dos cosas hacen falta, y la segunda es la que sostiene el ascenso: si
    // tu unión subió desde el puesto 25, está jugando la primera división sin
    // pertenecer a su franja por ranking, y el campo tiene que llenarse igual con
    // dieciséis. Tomar solo la franja dejaría un torneo de quince cuando el que
    // sube viene de afuera, y de diecisiete cuando no.
    //
    // Y sale gratis la coherencia del mundo: cuando subís, ocupás un lugar de
    // arriba y el último de la franja se queda afuera —o sea, descendió— sin que
    // haya que contarle a nadie quién fue.
    // Y se completa HACIA ABAJO antes que hacia arriba: si a la segunda división
    // le faltara un equipo, lo llena la 33ª del mundo y no Nueva Zelanda. Hoy la
    // franja siempre alcanza —hay ciento treinta y una uniones con fixture— así
    // que esto es el cinturón sobre los tiradores, pero es el orden correcto y
    // costaba tres líneas.
    const desde = def.fieldFromRank;
    const hasta = desde + def.fieldSize - 1;
    const enFranja: string[] = [];
    const debajo: string[] = [];
    const arriba: string[] = [];
    for (const code of ordenadas) {
        const rank = worldRanking(code) ?? Number.POSITIVE_INFINITY;
        if (rank >= desde && rank <= hasta) enFranja.push(code);
        else if (rank > hasta) debajo.push(code);
        else arriba.push(code);
    }

    return [...enFranja, ...debajo, ...arriba]
        .slice(0, Math.max(1, def.fieldSize - 1))
        .map((code) => ({ code, labelEs: unionName(code), strength: unionStrength(code) }));
}

/** Cuánto pesa tu propio lado, para comparar contra el rival. */
export function ownStrength(
    def: TournamentDef,
    unionCode: string,
    region: string | null,
    ovr: number,
): number {
    const base = def.rivalPool === 'provincias'
        ? (provinciaOf(region) ?? PROVINCIA_FALLBACK).strength
        : unionStrength(unionCode);
    return base + playerPush(ovr);
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL MARCADOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * De una diferencia de fuerza a los puntos de un lado.
 *
 * Se arma desde las JUGADAS y no se sortea un entero, por lo que dice la
 * cabecera: un marcador de rugby es tries + conversiones + penales, y armado así
 * sale creíble solo. El promedio del rugby de selecciones ronda los 24-26 puntos
 * por lado, y de ahí se mueve con la diferencia.
 *
 * Devuelve también los tries, que el grupo necesita para el bonus ofensivo. Que
 * salgan de la misma cuenta que los puntos es lo que hace imposible el marcador
 * que miente —30 puntos con un try— sin que nadie tenga que revisarlo.
 */
export interface Scoreline {
    puntos: number;
    tries: number;
}

const CONVERSION_RATE = 0.72;

export function scoreline(rng: ReturnType<typeof createRng>, edge: number): Scoreline {
    // De la diferencia de fuerza a cuántas veces llegás. Un equipo muy superior
    // llega cinco veces; uno muy inferior, una.
    const esperados = Math.max(0.4, 2.6 + edge * 0.055);
    const tries = Math.max(0, Math.round(rng.normal(esperados, 1.15)));

    let puntos = 0;
    for (let i = 0; i < tries; i += 1) {
        puntos += 5;
        if (rng.chance(CONVERSION_RATE)) puntos += 2;
    }

    // Los penales: el rugby que no termina en try igual suma. Entre cero y
    // cuatro, y el que domina patea menos porque va a buscar el try.
    const penales = Math.max(0, Math.round(rng.normal(2.1 - edge * 0.012, 1.1)));
    puntos += penales * 3;

    return { puntos, tries };
}

/**
 * LA DEFINICIÓN A LOS PALOS.
 *
 * En rugby un cruce empatado va a suplementario y después a una competencia de
 * pateadores. No se llama "penales" —esa es la palabra del otro deporte— y el
 * nombre importa por lo mismo que `club` en vez de equipo.
 *
 * Cinco por lado. Si siguen iguales, muerte súbita hasta que uno falle: el
 * bucle tiene tope porque un empate infinito colgaría el hilo, y al tope se
 * resuelve por la fuerza, que es el desempate menos arbitrario que hay.
 */
const KICKS = 5;
const SUDDEN_DEATH_MAX = 5;

export function kickOff(
    rng: ReturnType<typeof createRng>,
    edge: number,
): { palos: KickOff; ganaste: boolean } {
    // La chance de meterla: pareja, con una ventaja chica para el mejor equipo.
    // Un pateador de selección mete cerca del 75% bajo esta presión.
    const mia = Math.max(0.5, Math.min(0.9, 0.75 + edge * 0.004));
    const suya = Math.max(0.5, Math.min(0.9, 0.75 - edge * 0.004));

    const tuyas: boolean[] = [];
    const rivales: boolean[] = [];
    for (let i = 0; i < KICKS; i += 1) {
        tuyas.push(rng.chance(mia));
        rivales.push(rng.chance(suya));
    }

    let a = tuyas.filter(Boolean).length;
    let b = rivales.filter(Boolean).length;

    for (let i = 0; i < SUDDEN_DEATH_MAX && a === b; i += 1) {
        const t = rng.chance(mia);
        const r = rng.chance(suya);
        tuyas.push(t);
        rivales.push(r);
        if (t) a += 1;
        if (r) b += 1;
    }

    return {
        palos: { tuyas, rivales, revealed: 0 },
        // Si ni la muerte súbita alcanzó, gana el que llegó mejor. No es un
        // empate más: es el corte que impide el bucle infinito.
        ganaste: a === b ? edge >= 0 : a > b,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 bis · LA GRILLA DE TREINTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DE LA DIFERENCIA DE FUERZA A LA PROBABILIDAD DE GANAR.
 *
 * Una logística, que es la forma correcta para esto y no una recta: la recta se
 * sale de [0,1] en los extremos y hay que recortarla, y el recorte convierte
 * todos los cruces muy desparejos en el mismo cruce. La logística los distingue
 * hasta el final sin salirse nunca.
 *
 * `GRID_SCALE` es la única elección libre y dice cuánto pesa un punto de fuerza:
 * con 12, una ventaja de 12 puntos —más o menos la que hay entre el 3 y el 12 del
 * ranking— te lleva de 50% a 73%. Con un número más chico el ranking decidiría
 * todo y el torneo no tendría sorpresas; con uno más grande, ser mejor no
 * serviría de nada.
 *
 * PARÁMETRO LIBRE (CLAUDE.md §1.9).
 */
const GRID_SCALE = 12;

export function winProbability(edge: number): number {
    return 1 / (1 + Math.exp(-edge / GRID_SCALE));
}

/**
 * Cuántas de las treinta esconden victoria.
 *
 * Acotado por los dos lados: nunca menos de dos ni más de veintiocho. Una grilla
 * de un solo color le diría al jugador el resultado antes de tocar, y encima
 * mentiría sobre el deporte.
 */
export function winsInGrid(edge: number): number {
    const crudo = Math.round(GRID_TOTAL * winProbability(edge));
    return Math.max(GRID_MIN_WINS, Math.min(GRID_TOTAL - GRID_MIN_WINS, crudo));
}

/**
 * Arma la grilla: treinta celdas repartidas y barajadas.
 *
 * El barajado es Fisher-Yates, igual que en las casillas y por lo mismo: sortear
 * posiciones "hasta que no se repitan" consume una cantidad variable de tiradas
 * según lo que salga, y eso hace que dos versiones del motor con la misma semilla
 * difieran sin que nadie haya cambiado una regla.
 */
export function buildMatchGrid(
    rng: ReturnType<typeof createRng>,
    edge: number,
    siGana: MatchGrid['siGana'],
    siPierde: MatchGrid['siPierde'],
): MatchGrid {
    const gana = winsInGrid(edge);
    const celdas = Array.from({ length: GRID_TOTAL }, (_, i) => i < gana);

    for (let i = celdas.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        [celdas[i], celdas[j]] = [celdas[j], celdas[i]];
    }

    return { celdas, elegida: null, tachadas: [], siGana, siPierde };
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 ter · LAS CASILLAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CUÁNTAS PELOTAS TENÉS EN LA FINAL.
 *
 * Es la única puerta por donde entra el rival, y tiene que ser esta: si el azar
 * fuera lo único, el número uno del mundo y el que entró raspando ganarían la
 * final con la misma frecuencia, y el torneo dejaría de significar nada en su
 * último partido.
 *
 * Cinco, seis o siete, que es justo donde la tabla de probabilidad tiene toda
 * su pendiente — de 11,9% a 41,7% sin Visión, de 17,9% a 62,5% con ella.
 */
export function tirosDe(edge: number): number {
    if (edge <= -10) return 5;
    if (edge >= 10) return 7;
    return 6;
}

/**
 * LA CASILLA QUE TE TACHA LA VISIÓN, o `null`.
 *
 * SIEMPRE ES UNA VACÍA, y es todo el punto: no te dice dónde están los tries, te
 * saca una posibilidad mala del tablero. Comprar información no es comprar la
 * respuesta.
 *
 * Se sortea con la misma semilla que la grilla y viaja adentro del partido, así
 * que la tachada que viste antes del F5 es la misma después.
 */
export function tachadaDe(
    rng: ReturnType<typeof createRng>,
    celdas: readonly boolean[],
    vision: number,
): number | null {
    if (vision < CASILLAS_VISION) return null;
    const vacias = celdas.map((tiene, i) => (tiene ? -1 : i)).filter((i) => i >= 0);
    return vacias.length > 0 ? rng.pick(vacias) : null;
}

/**
 * Arma la grilla: nueve casillas, tres con try adentro.
 *
 * El barajado es Fisher-Yates sobre un array de posiciones y no "sortear tres
 * índices y esperar que no se repitan": el segundo consume una cantidad variable
 * de tiradas según lo que salga, y eso es exactamente la clase de cosa que hace
 * que dos versiones del motor con la misma semilla difieran sin que nadie haya
 * cambiado una regla.
 */
export function buildCasillas(
    rng: ReturnType<typeof createRng>,
    edge: number,
    vision: number,
    siGana: CasillasGrid['siGana'],
    siPierde: CasillasGrid['siPierde'],
): CasillasGrid {
    const posiciones = Array.from({ length: CASILLAS_TOTAL }, (_, i) => i);
    for (let i = posiciones.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        [posiciones[i], posiciones[j]] = [posiciones[j], posiciones[i]];
    }

    const celdas = new Array<boolean>(CASILLAS_TOTAL).fill(false);
    for (let i = 0; i < CASILLAS_TRIES; i += 1) celdas[posiciones[i]] = true;

    return {
        celdas,
        // El minuto sale de `hashSeed` y no del rng a propósito: es decorado y no
        // tiene por qué costar una tirada. Con el rng, agregar un número de
        // presentación correría el stream de todas las finales.
        minuto: 68 + (hashSeed(`hueco:${siGana.puntos}:${siPierde.puntos}:${celdas.length}`) % 10),
        abiertas: [],
        tachada: tachadaDe(rng, celdas, vision),
        tiros: tirosDe(edge),
        siGana,
        siPierde,
    };
}

/**
 * ORIENTA UN MARCADOR para que diga lo que tiene que decir.
 *
 * Los dos marcadores de la final se sortean con `scoreline`, que arma un partido
 * PLAUSIBLE pero no uno con ganador elegido: sortear "el marcador de ganar" con
 * el `edge` a favor da una victoria casi siempre, y ese "casi" es un bug. Si
 * encontrás los tres tries tenés que ganar la final, sí o sí — no el 85% de las
 * veces.
 *
 * La corrección es dar vuelta los lados y no inflar un número: un marcador de
 * rugby con los lados cambiados sigue siendo un marcador de rugby creíble, y
 * sumarle puntos al ganador hasta que gane produce cosas como 31-30 que se
 * repiten. El empate se rompe con un penal, que es como se rompen los empates.
 */
function orientar(m: CasillasGrid['siGana'], gana: boolean): CasillasGrid['siGana'] {
    const dadoVuelta = {
        puntos: m.puntosRival,
        puntosRival: m.puntos,
        tries: m.triesRival,
        triesRival: m.tries,
    };

    if (m.puntos === m.puntosRival) {
        // Un empate no sirve para ninguno de los dos lados: en una final no
        // existe. Tres puntos y se acabó.
        return gana
            ? { ...m, puntos: m.puntos + 3 }
            : { ...m, puntosRival: m.puntosRival + 3 };
    }

    const gananLosMios = m.puntos > m.puntosRival;
    return gananLosMios === gana ? m : dadoVuelta;
}

/** ¿Cuántos tries encontró hasta ahora? */
export function casillasEncontrados(grid: CasillasGrid): number {
    return grid.abiertas.filter((i) => grid.celdas[i]).length;
}

/** ¿Cuántas pelotas le quedan? */
export function casillasRestantes(grid: CasillasGrid): number {
    return grid.tiros - grid.abiertas.length;
}

/**
 * ¿Se terminó? Y si se terminó, ¿ganó?
 *
 * `null` mientras siga jugando. Se corta apenas encuentra los tres —no hace
 * falta gastar las pelotas que sobran— y también apenas se queda sin.
 */
export function casillasResultado(grid: CasillasGrid): boolean | null {
    if (casillasEncontrados(grid) >= CASILLAS_TRIES) return true;
    if (casillasRestantes(grid) <= 0) return false;
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4 · TU PARTIDO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La nota TUYA, que no es la del equipo.
 *
 * Podés jugar el partido de tu vida y perder, y podés pasar desapercibido en una
 * goleada. Que sean dos cosas distintas es lo que hace que el torneo deje algo
 * aunque salgan eliminados en grupos — y es lo que después se convierte en
 * Cartel y en la línea de la crónica.
 *
 * Usa la misma escala de cuatro que los minijuegos a propósito: "clavarla" tiene
 * que significar lo mismo en todo el juego.
 */
export function tuGrade(
    rng: ReturnType<typeof createRng>,
    ovr: number,
    nivel: number,
): MinigameGrade {
    // Tu media contra el nivel del torneo. Al que le queda grande le sale menos.
    const margen = (ovr - nivel) * 0.03 + rng.float(-0.5, 0.5);
    if (margen > 0.42) return 'clavado';
    if (margen > 0.05) return 'logrado';
    if (margen > -0.38) return 'tibio';
    return 'errado';
}

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LA TABLA DEL GRUPO
// ═══════════════════════════════════════════════════════════════════════════

export function matchResult(m: TournamentMatch): MatchResult {
    if (m.palos) {
        // Un cruce definido a los palos se cuenta como GANADO o PERDIDO y no
        // como empate: en la tabla del grupo no hay palos, así que esto solo
        // pasa en eliminatorias, donde alguien pasa y alguien se va.
        const a = m.palos.tuyas.filter(Boolean).length;
        const b = m.palos.rivales.filter(Boolean).length;
        return a >= b ? 'ganado' : 'perdido';
    }
    if (m.puntos > m.puntosRival) return 'ganado';
    if (m.puntos === m.puntosRival) return 'empatado';
    return 'perdido';
}

/**
 * Los puntos de tabla de un partido, con los dos bonus del rugby.
 *
 * Los bonus entran porque hacen legible una derrota —perder por cinco y perder
 * por cuarenta no dejan lo mismo— y porque son de las cosas más propias del
 * deporte. Un grupo sin bonus es un grupo de fútbol con marcadores de rugby.
 */
export function tablePoints(m: TournamentMatch): number {
    const res = matchResult(m);
    let pts = res === 'ganado' ? WIN_POINTS : res === 'empatado' ? DRAW_POINTS : 0;
    if (m.tries >= TRY_BONUS_TRIES) pts += 1;
    if (res === 'perdido' && m.puntosRival - m.puntos <= LOSS_BONUS_MARGIN) pts += 1;
    return pts;
}

/**
 * Los puntos acumulados en la fase de grupos, CONTANDO SOLO LO DESTAPADO.
 *
 * ⚠️ El `revealed` no es cosmético acá: sin él, esto filtra el resultado antes
 * de que el jugador destape. Los tres partidos del grupo están sorteados desde
 * que el torneo se abrió —tienen que estarlo, si no un F5 devolvería otro
 * torneo— así que sumarlos todos mostraba «5 puntos» con las tres celdas boca
 * abajo. Se veía en la pantalla y arruinaba exactamente lo que el torneo existe
 * para producir.
 *
 * Para el motor da lo mismo: cuando se pregunta si clasificó, los tres ya están
 * destapados. La diferencia es toda del lado del que mira.
 */
export function groupPoints(t: PendingTournament): number {
    return t.matches
        .filter((m) => m.round === 'grupos' && m.revealed)
        .reduce((acc, m) => acc + tablePoints(m), 0);
}

/**
 * LAS VICTORIAS DEL GRUPO, y no sus puntos. De acá sale el cuadro.
 *
 * Cuenta solo lo destapado, por el mismo motivo que `groupPoints`: la pantalla
 * lee esto con el grupo a medio jugar, y sumar los tres adelantaría el cuadro
 * antes de que el jugador destape la última celda.
 *
 * ⚠️ UN EMPATE NO ES MEDIA VICTORIA: no cuenta. El formato del M20 reparte los
 * cuadros por partidos ganados —tres, dos, uno o ninguno— y meter el empate en
 * el medio inventaría un quinto cuadro que el torneo no tiene. Es raro y es
 * duro: 1-2-0 y 1-0-2 caen en el mismo lado. La alternativa era ordenar por
 * puntos de tabla, que en un grupo de cuatro donde solo se juegan tres partidos
 * vuelve a decidirse por victorias el 95% de las veces y agrega una cuenta que
 * el jugador no puede seguir de cabeza.
 */
export function groupWins(t: PendingTournament): number {
    return t.matches.filter(
        (m) => m.round === 'grupos' && m.revealed && matchResult(m) === 'ganado',
    ).length;
}

/**
 * ¿Pasó el corte del grupo?
 *
 * En un torneo con cuadros NO HAY CORTE y esto siempre da `true`: los dieciséis
 * siguen jugando y lo que el grupo decide es por qué puesto. Se contesta desde
 * `qualifyPoints === null` y no desde `hasPlacement` a propósito — el que
 * pregunta acá quiere saber si sigue jugando, y la respuesta la da el corte.
 */
export function qualified(t: PendingTournament, def: TournamentDef): boolean {
    if (def.qualifyPoints === null) return true;
    return groupPoints(t) >= def.qualifyPoints;
}

// ═══════════════════════════════════════════════════════════════════════════
//  5 bis · LOS CUADROS — por qué puesto se juega
// ═══════════════════════════════════════════════════════════════════════════
//
// EL M20 NO ELIMINA: REPARTE. Dieciséis equipos, cuatro grupos de cuatro, y
// después cuatro cuadros de cuatro según cuántos partidos ganaste:
//
//   3 victorias → cuadro del título (1.º a 4.º)     2 → 5.º a 8.º
//   1 victoria  → 9.º a 12.º                        0 → 13.º a 16.º
//
// Cada cuadro es una semifinal y un partido de definición: el que gana la semi
// juega por el puesto de arriba de su cuadro y el que la pierde por el de abajo.
// Todos juegan cinco partidos y todos terminan con un puesto exacto.
//
// ── NINGUNO DE ESOS NÚMEROS ESTÁ ESCRITO ───────────────────────────────────
// Los tres salen del catálogo y se calculan acá, que es la regla del §1.9 del
// CLAUDE.md aplicada a un formato:
//
//   tamaño del cuadro  = 2 ^ (rondas de eliminación)   → semi + final = 4
//   cantidad de cuadros = partidos de grupo + 1         → 3 + 1 = 4
//   primer puesto del cuadro = 1 + (derrotas) × tamaño
//
// Y de yapa quedan atados: 4 cuadros × 4 equipos = 16, que es el `fieldSize`
// declarado. Un catálogo incoherente —dieciséis equipos con tres rondas de
// eliminación— no produce un cuadro raro: lo caza `tournament.test.ts`.

/** Cuántos equipos entran en un cuadro. Una semi y una final son cuatro. */
export function bracketSize(def: TournamentDef): number {
    return 2 ** def.knockout.length;
}

/** La última ronda del torneo, que es la que reparte el título. */
export function lastRound(def: TournamentDef): RoundId | null {
    return def.knockout[def.knockout.length - 1] ?? null;
}

/**
 * LA RONDA CUYO PERDEDOR NO SE VA A CASA: juega por el tercer puesto.
 *
 * Es la anteúltima del cuadro y se PREGUNTA en vez de escribirse `'semi'`: el
 * día que el Mundial agregue un dieciseisavos, el partido por el bronce lo sigue
 * jugando el que pierde la penúltima, sin que nadie venga a corregir una
 * constante (§1.5 — un índice dice dónde estaba la cosa, no qué es).
 *
 * `null` cuando el torneo no lo declara, o cuando no hay una ronda antes de la
 * última que perder.
 */
export function bronzeFrom(def: TournamentDef): RoundId | null {
    if (!def.bronze) return null;
    return def.knockout[def.knockout.length - 2] ?? null;
}

/** ¿Ganaste el partido de esa ronda? `false` si todavía no se jugó. */
function wonRound(t: PendingTournament, round: RoundId | null): boolean {
    if (round === null) return false;
    const partido = t.matches.find((m) => m.round === round && m.revealed);
    return partido !== undefined && matchResult(partido) === 'ganado';
}

/**
 * ¿SEGUÍS EN EL TORNEO DESPUÉS DE ESTE PARTIDO?
 *
 * Las tres formas de terminar un torneo contestadas en un solo lugar, que es
 * exactamente lo que este archivo hacía mal: la pregunta vivía como una
 * expresión suelta adentro del reducer —`t.round === 'grupos' || hasPlacement ||
 * gano`— así que agregar el partido por el tercer puesto obligaba a que la
 * PANTALLA supiera de bronces. Acá, el reducer pregunta y el catálogo contesta.
 *
 * En `grupos` siempre devuelve `true` y el corte lo hace `roundAfter` con
 * `qualified`: son dos preguntas distintas —«¿sobreviviste al partido?» y
 * «¿alcanzaron los puntos?»— y mezclarlas fue lo que ya se pagó una vez con el
 * cuadro del quinto puesto que se cerraba solo.
 */
export function survives(t: PendingTournament, def: TournamentDef, gano: boolean): boolean {
    if (t.round === 'grupos') return true;
    if (hasPlacement(def)) return true;
    if (gano) return true;
    // El que pierde la semifinal de un torneo con bronce sigue: le queda una
    // tarde más, y es la que separa el tercer puesto del cuarto.
    return t.round === bronzeFrom(def);
}

/**
 * ¿Este torneo hace jugar al que no ganó el grupo?
 *
 * ⚠️ ESTO ERA `def.id === 'mundial-m20'` con un comentario al lado que juraba
 * que preguntaba por el dato. Es el §1.5 del CLAUDE.md del feature exacto —el
 * nombre y el cuerpo diciendo cosas distintas— y sobrevivió a la revisión por lo
 * mismo que los otros cinco: leer con atención confirma el nombre.
 */
export function hasPlacement(def: TournamentDef): boolean {
    return def.placement;
}

/** Un cuadro: a quiénes junta y por qué puestos juegan. */
export interface Bracket {
    /** Victorias de grupo que te mandan acá. */
    wins: number;
    /** El puesto más alto que se puede terminar en este cuadro: 1, 5, 9 o 13. */
    topPlace: number;
    /** Cuántos equipos lo juegan. */
    size: number;
    /** ¿Es el del título? */
    title: boolean;
}

/**
 * TODOS LOS CUADROS DEL TORNEO, del título para abajo.
 *
 * Vacío en los torneos que eliminan. La pantalla lo usa para mostrar la escalera
 * durante el grupo: sin ver qué se juega con cada resultado, el tercer partido
 * del grupo es un trámite.
 */
export function bracketsOf(def: TournamentDef): Bracket[] {
    if (!hasPlacement(def)) return [];
    const size = bracketSize(def);
    return Array.from({ length: def.groupMatches + 1 }, (_, derrotas) => ({
        wins: def.groupMatches - derrotas,
        topPlace: 1 + derrotas * size,
        size,
        title: derrotas === 0,
    }));
}

/** El cuadro que te tocó, o `null` si el torneo elimina. */
export function bracketOf(t: PendingTournament, def: TournamentDef): Bracket | null {
    const cuadros = bracketsOf(def);
    if (cuadros.length === 0) return null;
    const ganados = Math.min(groupWins(t), def.groupMatches);
    // Por identidad y no por posición (§1.5): el día que los cuadros se declaren
    // en otro orden, esto sigue devolviendo el que corresponde.
    return cuadros.find((b) => b.wins === ganados) ?? null;
}

/**
 * QUÉ SE JUEGA EN ESTA RONDA: los dos —o cuatro— puestos que decide.
 *
 * `null` en un torneo que elimina, donde la pregunta no tiene sentido: ahí lo
 * que se juega es seguir o irse.
 *
 * El recorrido es el del cuadro partiéndose al medio ronda a ronda. La semi
 * decide los cuatro puestos; ganarla te deja en la mitad de arriba y perderla en
 * la de abajo; la final decide los dos que quedaron. Se lee de los partidos ya
 * jugados y no de un campo guardado, así que no puede desincronizarse.
 */
export function stakeOf(
    t: PendingTournament,
    def: TournamentDef,
    round: RoundId,
): { from: number; to: number } | null {
    const cuadro = bracketOf(t, def);
    if (!cuadro) return null;

    let from = cuadro.topPlace;
    let span = cuadro.size;

    for (const r of def.knockout) {
        span /= 2;
        if (r === round) return { from, to: from + span * 2 - 1 };

        // La ronda anterior todavía no se jugó: no hay forma de saber en qué
        // mitad del cuadro caés, y contestar cualquier cosa sería peor que no
        // contestar.
        const jugado = t.matches.find((m) => m.round === r && m.revealed);
        if (!jugado) return null;
        if (matchResult(jugado) !== 'ganado') from += span;
    }

    return null;
}

/**
 * ¿ESTE PARTIDO SE JUEGA POR EL TÍTULO?
 *
 * En un torneo que elimina, todo cruce se juega por el título: por eso devuelve
 * `true` sin mirar nada. En uno con cuadros, solo los del cuadro de arriba, y
 * solo mientras sigas del lado que pelea el primer puesto — perder la semifinal
 * del título te manda a jugar por el tercero, que ya no es por el título.
 */
export function forTheTitle(t: PendingTournament, def: TournamentDef, round: RoundId): boolean {
    if (round === 'grupos') return false;
    // EL BRONCE PRIMERO. Sin esto, la última ronda de un torneo que elimina se
    // daba por buena siempre y el que perdía la semifinal levantaba el Mundial
    // ganando el partido por el tercer puesto. Es la misma guarda que ya
    // protegía al M20 con sus cuadros, escrita para la otra forma.
    if (def.bronze && round === lastRound(def)) return wonRound(t, bronzeFrom(def));
    if (!hasPlacement(def)) return true;
    return stakeOf(t, def, round)?.from === 1;
}

/**
 * ¿ES EL PARTIDO QUE REPARTE LA COPA?
 *
 * La última ronda Y por el título. Las dos condiciones hacen falta: en el M20 el
 * que perdió la semifinal del título juega igual una última ronda —por el tercer
 * puesto— y ganarla no es levantar nada.
 */
export function isTitleDecider(t: PendingTournament, def: TournamentDef, round: RoundId): boolean {
    return round === lastRound(def) && forTheTitle(t, def, round);
}

/**
 * EL PUESTO EXACTO en el que terminó, o `null`.
 *
 * `null` mientras la última ronda no esté jugada, y también en los torneos que
 * eliminan: ahí no existe "salir noveno", existe "quedar afuera en cuartos".
 */
export function finalPlace(t: PendingTournament, def: TournamentDef): number | null {
    const ultima = lastRound(def);
    if (ultima === null) return null;

    // ── EL TORNEO CON BRONCE REPARTE CUATRO PUESTOS ─────────────────────────
    // Y hay que decirlos: sin esto la pantalla contestaba «Quedaron afuera» al
    // que acababa de ganar el partido por el tercer puesto del mundo, que es el
    // mismo bug que el M20 ya había pagado con el cuadro del quinto.
    //
    // No hay una tabla de puestos: los cuatro salen de las dos preguntas que el
    // historial ya contesta —¿la última ronda era por la copa? ¿la ganaste?—.
    if (def.bronze) {
        const partido = t.matches.find((m) => m.round === ultima && m.revealed);
        if (!partido) return null;
        const gano = matchResult(partido) === 'ganado';
        return forTheTitle(t, def, ultima) ? (gano ? 1 : 2) : (gano ? 3 : 4);
    }

    if (!hasPlacement(def)) return null;

    const partido = t.matches.find((m) => m.round === ultima && m.revealed);
    if (!partido) return null;

    const stake = stakeOf(t, def, ultima);
    if (!stake) return null;

    return matchResult(partido) === 'ganado' ? stake.from : stake.to;
}

/** El ordinal, como lo escribe la crónica deportiva: `13.º`. */
export function ordinal(n: number): string {
    return `${n}.º`;
}

/**
 * ¿ESTA EDICIÓN CAMBIÓ DE DIVISIÓN A TU UNIÓN?
 *
 * `null` si no se movió, o si el torneo no tiene divisiones, o si todavía no
 * terminó. Los dos primeros suben y los dos últimos bajan, y CUÁLES son los dos
 * últimos sale de `fieldSize` en vez de escribirse: en un torneo de dieciséis son
 * el 15.º y el 16.º, y el día que el campo cambie de tamaño esto no se entera.
 *
 * Se calcula desde el puesto y no se guarda en ningún lado. La división de tu
 * unión es la suma de todos estos movimientos, y vive en
 * `tournament-gate.ts:divisionOf`.
 */
export function tierMoveOf(
    t: PendingTournament,
    def: TournamentDef,
): { kind: 'up' | 'down'; to: TournamentId } | null {
    if (!def.tier) return null;
    const puesto = finalPlace(t, def);
    if (puesto === null) return null;

    const { up, down } = def.tier;
    if (up && puesto <= up.places) return { kind: 'up', to: up.to };
    if (down && puesto > def.fieldSize - down.places) return { kind: 'down', to: down.to };
    return null;
}

/**
 * CÓMO SE LEE UNA RONDA, sabiendo por qué puesto se juega.
 *
 * En un torneo que elimina es `ROUND_LABEL` y nada más. En uno con cuadros, una
 * «Semifinal» a secas es exactamente lo que este cambio vino a arreglar: el que
 * perdió los tres del grupo veía SEMI y FINAL en la llave y terminaba el torneo
 * sin saber que había jugado por el decimotercer puesto.
 */
export function roundTitle(t: PendingTournament, def: TournamentDef, round: RoundId): string {
    // El bronce va antes que todo: `stakeOf` es `null` en un torneo que elimina,
    // así que sin esto la tarde por el tercer puesto se anunciaba «La final».
    if (def.bronze && round === lastRound(def) && !forTheTitle(t, def, round)) {
        return 'Por el tercer puesto';
    }
    const stake = stakeOf(t, def, round);
    if (!stake) return ROUND_LABEL[round];

    if (round === lastRound(def)) {
        return stake.from === 1 ? 'La final' : `Por el ${ordinal(stake.from)} puesto`;
    }
    return stake.from === 1
        ? 'Semifinal por el título'
        : `Semifinal por el ${ordinal(stake.from)} puesto`;
}

/** El mismo dato para la celda, donde entran doce caracteres y no treinta. */
export function roundTag(t: PendingTournament, def: TournamentDef, round: RoundId): string {
    if (def.bronze && round === lastRound(def) && !forTheTitle(t, def, round)) return '3.º puesto';
    const stake = stakeOf(t, def, round);
    if (!stake) return ROUND_SHORT[round];

    if (round === lastRound(def)) {
        return stake.from === 1 ? 'Final' : `${ordinal(stake.from)} puesto`;
    }
    return `Semi ${stake.from}-${stake.to}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  6 · ARMAR LOS PARTIDOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La semilla de una ronda. Derivada, nunca tomada del stream de la carrera.
 *
 * El `idx` entra en la semilla y no se toma del orden del array: dos partidos de
 * la misma ronda no pueden compartir tirada, y el día que una ronda tenga dos
 * partidos esto ya está resuelto.
 */
function roundSeed(t: PendingTournament, round: RoundId, idx: number): number {
    return hashSeed(`tour:${t.id}:${t.season}:${t.seed}:${round}:${idx}`);
}

export interface BuildCtx {
    def: TournamentDef;
    rivals: readonly RivalDef[];
    /** Tu fuerza, con vos adentro. */
    mine: number;
    ovr: number;
    /** Tu Visión. Es lo único que puede tacharte una casilla en la final. */
    vision: number;
}

/**
 * Arma UN partido, entero y con el marcador ya adentro.
 *
 * `arenga` entra acá y no después a propósito: el comodín tiene que empujar
 * ANTES de que el marcador se sortee, porque un vestuario empuja antes del
 * partido. Aplicarlo sobre un resultado ya sorteado sería otra cosa —una
 * corrección— y se sentiría como una.
 */
export function buildMatch(
    t: PendingTournament,
    ctx: BuildCtx,
    round: RoundId,
    idx: number,
    arenga: boolean,
): TournamentMatch {
    const rng = createRng(roundSeed(t, round, idx));

    // NADIE SE REPITE EN EL MISMO TORNEO. Sin esto el grupo del Mundial salía
    // «Tonga, Fiyi, Tonga», que no es un grupo: es un sorteo con reemplazo. Se
    // mira el torneo entero y no solo la ronda —volver a cruzar en semifinales
    // al que ya te tocó en el grupo pasa en el rugby de verdad, pero con el campo
    // recortado a doce pasaría demasiado seguido como para leerse bien.
    const yaJugados = new Set(t.matches.map((m) => m.rivalCode));

    // El rival sale ponderado por cercanía de fuerza. En eliminatorias sube el
    // piso, que es lo que hace que la final no se juegue contra Namibia.
    const piso = round === 'grupos' ? 0 : round === 'final' ? 78 : round === 'semi' ? 70 : 58;
    const libres = ctx.rivals.filter((r) => !yaJugados.has(r.code));
    const elegibles = libres.filter((r) => r.strength >= piso);

    // Los dos repliegues, en orden y declarados: primero se afloja el piso de la
    // ronda, y recién si el campo entero se agotó se permite repetir. Con doce
    // equipos y siete partidos el segundo no se alcanza nunca, pero un torneo
    // futuro con un campo chico y muchas rondas sí podría — y entonces preferimos
    // un rival repetido a una llave que no se puede armar.
    const pool = elegibles.length > 0 ? elegibles : libres.length > 0 ? libres : ctx.rivals;
    const rival = rng.weighted(pool, (r) => Math.max(1, 100 - Math.abs(r.strength - ctx.mine)));

    const empuje = arenga ? ARENGA_PUSH : 0;
    const edge = ctx.mine + empuje - rival.strength;

    const mio = scoreline(rng, edge);
    const suyo = scoreline(rng, -edge);

    const match: TournamentMatch = {
        round,
        rivalCode: rival.code,
        rivalName: rival.labelEs,
        puntos: mio.puntos,
        puntosRival: suyo.puntos,
        tries: mio.tries,
        triesRival: suyo.tries,
        palos: null,
        casillas: null,
        grid: null,
        revealed: false,
        arenga,
        tuya: tuGrade(rng, ctx.ovr, ctx.def.baseStrength),
    };

    // ── LA FINAL QUE SE JUEGA ───────────────────────────────────────────────
    // Se sortean los DOS marcadores —el de ganarla y el de perderla— y las
    // casillas eligen cuál pasó. Es lo que permite que el jugador decida de
    // verdad sin romper la regla 1 del contrato: todo sorteado al abrirse, y un
    // F5 en el medio de la final devuelve la misma final.
    //
    // El marcador de perder se arma con el `edge` dado vuelta, así que una final
    // perdida contra el número uno se parece a una final perdida contra el
    // número uno.
    // ⚠️ Y SOLO EN EL PARTIDO POR EL TÍTULO. En el M20 se juegan CUATRO finales
    // el mismo día —la del título, la del quinto, la del noveno y la del
    // decimotercero— y El Hueco es de una sola. Sin esta condición, el tablero
    // salía con «la final del mundo se define en las últimas pelotas» para
    // decidir si terminabas quinto o séptimo, que es la clase de texto que le
    // enseña al jugador a no leer los textos.
    //
    // Y tampoco va en el partido por el tercer puesto, que es la última ronda del
    // cuadro de arriba: el que perdió la semifinal del título ya no juega por el
    // título, y ese partido —el más triste del rugby— no es el que se recuerda.
    if (ctx.def.casillasRounds.includes(round) && forTheTitle(t, ctx.def, round)) {
        const perdiendoMio = scoreline(rng, -Math.abs(edge) - 4);
        const perdiendoSuyo = scoreline(rng, Math.abs(edge) + 4);

        match.casillas = buildCasillas(
            rng,
            edge,
            ctx.vision,
            orientar({ puntos: mio.puntos, puntosRival: suyo.puntos, tries: mio.tries, triesRival: suyo.tries }, true),
            orientar({
                puntos: perdiendoMio.puntos,
                puntosRival: perdiendoSuyo.puntos,
                tries: perdiendoMio.tries,
                triesRival: perdiendoSuyo.tries,
            }, false),
        );

        // El marcador de la final no existe hasta que se juega. Se deja el de
        // ganar como marcador provisorio —hay que poner algo— pero nadie lo ve:
        // la celda no se destapa, se juega.
        return match;
    }

    // ── LA GRILLA DE TREINTA ────────────────────────────────────────────────
    // Todos los partidos de los dos Mundiales menos la final, que ya se fue
    // arriba con su tablero de nueve. Un partido lleva una cosa o la otra.
    //
    // Los dos marcadores se orientan igual que en la final: si tocás una celda
    // de victoria tenés que ganar, sí o sí. `scoreline` arma un partido plausible
    // pero no uno con ganador elegido, y ese "casi" es lo que `orientar` corta.
    if (ctx.def.matchGrid) {
        const otroMio = scoreline(rng, -edge);
        const otroSuyo = scoreline(rng, edge);

        match.grid = buildMatchGrid(
            rng,
            edge,
            orientar({ puntos: mio.puntos, puntosRival: suyo.puntos, tries: mio.tries, triesRival: suyo.tries }, true),
            orientar({
                puntos: otroMio.puntos,
                puntosRival: otroSuyo.puntos,
                tries: otroMio.tries,
                triesRival: otroSuyo.tries,
            }, false),
        );
        return match;
    }

    // Empate en eliminatoria: a los palos. En el grupo el empate es un empate y
    // reparte dos puntos, como en cualquier torneo de rugby.
    if (round !== 'grupos' && match.puntos === match.puntosRival) {
        match.palos = kickOff(rng, edge).palos;
    }

    return match;
}

// ═══════════════════════════════════════════════════════════════════════════
//  7 · AVANZAR
// ═══════════════════════════════════════════════════════════════════════════

/** ¿Cuántos partidos tiene esta ronda? Grupos tres, el resto uno. */
function matchesInRound(def: TournamentDef, round: RoundId): number {
    return round === 'grupos' ? def.groupMatches : 1;
}

/** Los partidos ya armados de una ronda. */
export function matchesOf(t: PendingTournament, round: RoundId): TournamentMatch[] {
    return t.matches.filter((m) => m.round === round);
}

/** El próximo partido sin destapar, o `null` si la ronda está completa. */
export function nextMatch(t: PendingTournament): TournamentMatch | null {
    return t.matches.find((m) => !m.revealed) ?? null;
}

/**
 * QUÉ RONDA VIENE DESPUÉS DE ESTA.
 *
 * `null` es "se terminó el torneo". Y el M20 es el que justifica que esto sea
 * una función y no un `indexOf` sobre `knockout`: ahí el que gana los tres y el
 * que los pierde juegan LA MISMA RONDA —una semifinal— y lo único que cambia es
 * por qué puesto. Un `indexOf` no puede expresar eso; esta función sí.
 */
export function roundAfter(
    t: PendingTournament,
    def: TournamentDef,
    paso: boolean,
): RoundId | null {
    if (t.round === 'grupos') {
        // El que no pasa se va a casa, salvo donde el torneo dice que no.
        if (!paso && !hasPlacement(def)) return null;
        return def.knockout[0] ?? null;
    }
    const i = def.knockout.indexOf(t.round);
    if (i < 0) return null;
    return def.knockout[i + 1] ?? null;
}

/**
 * Abre la ronda que viene, con sus partidos ya armados.
 *
 * Muta `t`, que es lo que hace el reducer con todo lo suyo: `captainReducer`
 * clona el estado entero al entrar y sella el rng al salir, así que mutar acá
 * adentro es el patrón de la casa y no un descuido.
 */
export function openRound(t: PendingTournament, ctx: BuildCtx, round: RoundId): void {
    t.round = round;
    const n = matchesInRound(ctx.def, round);
    const yaHay = matchesOf(t, round).length;
    for (let i = yaHay; i < n; i += 1) {
        t.matches.push(buildMatch(t, ctx, round, i, false));
    }
}

/**
 * Cierra el torneo y deja escrito hasta dónde llegó.
 *
 * `finalRound` es la ronda donde se terminó y no la última que jugó: son la
 * misma salvo en el caso del que gana la final, que es justamente el que
 * importa. Se escribe una vez y de ahí la lee la crónica.
 *
 * Ganar la final del cuadro del quinto puesto no es ser campeón, y ganar el
 * partido por el tercero tampoco. Que el motor lo distinga es lo que impide que
 * la vitrina reciba un Mundial que nadie levantó, y por eso la pregunta es
 * `isTitleDecider` y no «¿terminó en la ronda `final`?» — en el M20 todos
 * terminan ahí.
 */
export function closeTournament(t: PendingTournament, def: TournamentDef, gano: boolean): void {
    const porLaCopa = isTitleDecider(t, def, t.round);

    t.outcome = porLaCopa ? (gano ? 'campeon' : 'finalista') : 'eliminado';
    t.finalRound = t.round;
}
