// EL CAPITÁN — qué decisión te toca esta temporada.
//
// El selector no sabe nada de ningún evento en particular: evalúa `requires`,
// pesa y sortea. Si hace falta una precondición nueva, se extiende
// `EventRequirements` y su evaluador — nunca un `if` para un evento.
//
// ── El cooldown es una ventana, no un contador ──
// `recentEventIds` está en orden MÁS RECIENTE PRIMERO, y el cooldown mira los
// primeros N. Es más barato que llevar la temporada de cada evento y se comporta
// igual: lo que importa es "hace poco salió", no el número exacto.

import type { CaptainEvent, EventRarity } from '../types/event.ts';
import type { CaptainState } from '../types/captain.ts';
import type { Rng } from './random.ts';
import { ALL_EVENTS, EVENT_BUILDERS, getEvent, MARKET_EVENT_ID, RETURN_EVENT_ID } from '../data/events/index.ts';
import { getFamily } from '../data/positions.ts';
import { MARKET_OPEN_AGE } from './clubs.ts';
import { resolveAgeCurve } from './development-profile.ts';
import { belongingOf } from './belonging.ts';
import { secondFlagOf } from './eligibility.ts';
import { hasUnion } from '../data/catalogs.ts';

/** Probabilidad de que una temporada traiga decisión. No todas traen. */
export const SEASON_EVENT_PROB = 0.88;

/** Cuántas temporadas espera el mercado después de un pase de verdad. */
export const MARKET_COOLDOWN = 2;

/** Un evento ya visto pesa menos, aunque su cooldown haya vencido. */
const SEEN_PENALTY = 0.35;

/** Cuántos ids se recuerdan. Más que el cooldown más largo del catálogo. */
export const RECENT_MEMORY = 12;

/**
 * LAS CUATRO BANDAS, en ORDEN CANÓNICO. Se itera por acá y nunca por
 * `Object.keys(RARITY_BAND)` (CLAUDE de captain §1).
 */
export const RARITIES: readonly EventRarity[] = ['normal', 'especial', 'raro', 'oro'];

/**
 * CADA CUÁNTO SALE UNA TARJETA DE CADA CLASE. PARÁMETROS LIBRES, y el único
 * lugar del proyecto donde se decide la frecuencia de las cuatro.
 *
 * ── ESTÁN CALIBRADOS SOBRE LA CARRERA Y NO SOBRE LA TEMPORADA (§1.8) ────────
 * Lo que importa no es «3 de cada 100 temporadas traen un oro» —eso no se lo
 * pregunta nadie— sino CUÁNTAS CARRERAS VEN UNO, y entre las dos cosas hay
 * `SEASON_EVENT_PROB` y quince temporadas. Calibrar el parámetro y suponer que
 * la tasa lo sigue es exactamente el error que el §1.8 documenta, así que los
 * números de abajo se DERIVARON del objetivo:
 *
 *     P(ve al menos una) = 1 − (1 − SEASON_EVENT_PROB · p)^N,  con N ≈ 15
 *
 *     oro       3/100 → 0,026 por temporada → 33% de las carreras ven una
 *     raro      9/100 → 0,079              → 71%, y ~1,2 por carrera
 *     especial 18/100 → 0,158              → ~2,4 por carrera
 *     normal   70/100 → el resto: la vida del club, que es el juego
 *
 * Son COTAS SUPERIORES y hay que leerlas así: los gates de `requires` sacan
 * eventos del pool, y una banda que se queda sin candidatos elegibles no
 * participa del sorteo. La tasa que vale es la medida, y la mide
 * `__tests__/rarity.test.ts` corriendo carreras enteras.
 */
export const RARITY_BAND: Record<EventRarity, number> = {
    normal: 70,
    especial: 18,
    raro: 9,
    oro: 3,
};

/** La banda de un evento. Sin declarar es `normal` (ver `types/event.ts`). */
export function rarityOf(event: CaptainEvent): EventRarity {
    return event.rarity ?? 'normal';
}

function seasonsPlayed(state: CaptainState): number {
    return state.history.length;
}

/** ¿Este evento puede salir ahora? Gates duros, en cascada. */
export function eligible(event: CaptainEvent, state: CaptainState): boolean {
    const { player } = state;

    if (!event.repeatable && state.recentEventIds.includes(event.id)) return false;
    if (event.repeatable && event.cooldown) {
        if (state.recentEventIds.slice(0, event.cooldown).includes(event.id)) return false;
    }

    const req = event.requires;
    if (!req) return true;

    if (req.stage && !req.stage.includes(state.stage)) return false;
    if (req.tracks && !req.tracks.includes(state.national.track)) return false;
    if (req.minAge !== undefined && player.age < req.minAge) return false;
    if (req.maxAge !== undefined && player.age > req.maxAge) return false;
    if (req.minOvr !== undefined && player.ovr < req.minOvr) return false;
    if (req.maxOvr !== undefined && player.ovr > req.maxOvr) return false;
    if (req.families && !req.families.includes(player.family)) return false;
    if (req.group && getFamily(player.family).group !== req.group) return false;
    if (req.minSeasons !== undefined && seasonsPlayed(state) < req.minSeasons) return false;
    if (req.needsClub && !player.clubId) return false;
    if (req.needsUnion && !hasUnion(player.countryCode)) return false;
    if (req.awayFromHome && (!state.homeClubId || player.clubId === state.homeClubId)) return false;

    if (req.nationalStatus && !req.nationalStatus.includes(state.national.status)) return false;
    if ((req.needsRival || req.rivalAhead !== undefined) && !state.rival) return false;
    if (req.rivalAhead !== undefined && state.rival) {
        const arriba = state.rival.ovr > player.ovr;
        if (arriba !== req.rivalAhead) return false;
    }
    if (req.secondFlagMonths !== undefined) {
        const otra = secondFlagOf(state.national.eligibility);
        // El derecho YA GANADO no abre esta puerta: con los sesenta meses
        // cumplidos la que corresponde es `nt-cambiar-de-bandera`, que es otra
        // conversación —ahí ya te pueden convocar— y las dos juntas serían el
        // mismo dilema preguntado dos veces.
        if (!otra || otra.remaining <= 0 || otra.months < req.secondFlagMonths) return false;
    }

    const pertenencia = belongingOf(state.belonging, player.clubId);
    if (req.minBelonging !== undefined && pertenencia < req.minBelonging) return false;
    if (req.maxBelonging !== undefined && pertenencia > req.maxBelonging) return false;

    return true;
}

/**
 * ¿Se ofrece el mercado esta temporada?
 *
 * ── DEJÓ DE COMPETIR CONTRA EL POOL, Y ESA ES LA MITAD DEL CAMBIO ───────────
 * Antes esto vivía adentro de `selectEvent` y devolvía la tarjeta de mercado EN
 * LUGAR de la del año: era la lectura correcta mientras el mercado se abría de
 * vez en cuando —una oferta que se pierde sola porque salió otro evento es una
 * decisión que el jugador nunca supo que tuvo—, y se volvió insostenible en
 * cuanto la ventana pasó a abrirse todos los años a partir de `MARKET_OPEN_AGE`.
 * Con prioridad y todos los años, el jugador de veinte no volvía a ver una
 * tarjeta del pool NUNCA: el catálogo entero de eventos quedaba muerto de los
 * veinte al retiro, o sea las tres cuartas partes de la carrera.
 *
 * Hoy el mercado es un PASO PROPIO que corre después de la decisión del año
 * (`openMarketOrClose`, en el reducer). Las dos tarjetas pasan, en el orden en
 * que pasan las cosas: primero lo que te pasó en la temporada, después dónde
 * jugás la que viene.
 *
 * El cooldown sobrevive para la ventana CERRADA y nada más. Con la ventana
 * abierta la mesa se pone todos los años aunque acabes de firmar, que es lo que
 * hace el mercado de verdad — y quedarse sigue siendo una de las opciones.
 */
export function marketDue(state: CaptainState): boolean {
    if (state.offers.length === 0) return false;
    if (state.player.age >= MARKET_OPEN_AGE) return true;
    const desdeElPase = state.season - (state.player.flags['ultimo-pase'] ?? -99);
    return desdeElPase >= MARKET_COOLDOWN;
}

/**
 * ¿Vuelve a llamar el club de origen?
 *
 * Solo si te fuiste, y con más ganas cuanto más viejo seas: volver a los 34 es
 * la historia que el rugby cuenta mejor.
 */
function returnDue(state: CaptainState, rng: Rng): boolean {
    if (!state.homeClubId || state.player.clubId === state.homeClubId) return false;
    // La curva DEL JUGADOR: al longevo el club de origen lo llama más tarde,
    // porque más tarde es cuando empieza a aflojar. Leer la de la familia le
    // abriría la puerta a los 29 a uno que todavía está en su mejor momento.
    const curva = resolveAgeCurve(state.player);
    if (state.player.age < curva.decline) return false;
    return rng.chance(0.4);
}

/**
 * Elige la decisión de la temporada. Devuelve el id, o `null` si esta temporada
 * no trae ninguna.
 *
 * EL MERCADO YA NO ENTRA ACÁ: corre en su propio paso, después de esta tarjeta
 * (ver `marketDue`). Lo que queda es el regreso a casa —que sí caduca y por eso
 * va primero— y el pool.
 */
export function selectEvent(state: CaptainState, rng: Rng): string | null {
    if (returnDue(state, rng)) return RETURN_EVENT_ID;

    if (!rng.chance(SEASON_EVENT_PROB)) return null;

    const pool = ALL_EVENTS.filter((e) => eligible(e, state));
    if (pool.length === 0) return null;

    // ── EL SORTEO VA EN DOS NIVELES, y no es ceremonia ──────────────────────
    // Primero la BANDA —cada cuánto pasa una cosa así— y recién después cuál de
    // las de esa banda. Es lo que hace que escribir el noveno evento de oro
    // cambie QUÉ oro te toca y nunca CADA CUÁNTO te toca uno; con un solo
    // sorteo ponderado, la frecuencia de una clase es la suma de los pesos de
    // sus miembros y crece sola con el catálogo (`types/event.ts`).
    //
    // Una banda sin candidatos elegibles NO PARTICIPA, y por eso el peso se
    // reparte entre las que sobreviven: al pibe de 17 que todavía no cumple
    // ningún `requires` de oro no se le pierde la tarjeta de la temporada, le
    // sale una normal. Es la diferencia entre una banda vacía y una temporada
    // en blanco.
    const bandas = RARITIES
        .map((rarity) => ({ rarity, pool: pool.filter((e) => rarityOf(e) === rarity) }))
        .filter((b) => b.pool.length > 0);

    const banda = rng.weighted(bandas, (b) => RARITY_BAND[b.rarity]);

    return rng.weighted(banda.pool, (e) => e.weight * (state.recentEventIds.includes(e.id) ? SEEN_PENALTY : 1)).id;
}

/**
 * La tarjeta que la pantalla tiene que dibujar.
 *
 * Se reconstruye en cada render y NO se persiste: en el estado vive el id, y
 * los textos del mercado salen de las ofertas guardadas. Así una partida
 * cargada muestra exactamente la misma tarjeta.
 */
export function getPendingEvent(state: CaptainState): CaptainEvent | null {
    if (!state.pendingEventId) return null;
    // ── LOS CONSTRUCTORES SON UN MAPA Y NO UNA CADENA DE `if` ───────────────
    // Eran tres `if` con el id adentro y funcionaba; con siete pasa a ser el
    // catálogo escrito dos veces —una en su archivo y otra acá— y alcanza con
    // olvidarse un renglón para que una tarjeta que el selector sortea se dibuje
    // con el nombre del rival en blanco. El mapa vive al lado del catálogo, que
    // es donde se agregan los eventos (§3 del CLAUDE raíz).
    //
    // Un constructor que devuelve `null` —el regreso a casa cuando ya estás en
    // casa— no es un error: es una tarjeta que hoy no se puede armar, y quien
    // llama ya sabe seguir de largo.
    const build = EVENT_BUILDERS[state.pendingEventId];
    if (build) return build(state);
    return getEvent(state.pendingEventId);
}

/** Deja el id en la memoria reciente, más nuevo primero, y recorta. */
export function rememberEvent(state: CaptainState, id: string): void {
    state.recentEventIds = [id, ...state.recentEventIds.filter((x) => x !== id)].slice(0, RECENT_MEMORY);
}
