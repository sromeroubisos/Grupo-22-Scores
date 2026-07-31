import type { PlayerRole } from '../types/player.ts';

// EL LUGAR EN EL PLANTEL, derivado de UNA resta: `valor deportivo − rating del club`.
//
// DOS EJES, DOS RESTAS, Y NO SE MEZCLAN. Ésta es la regla de este archivo:
//
//   · el MERCADO pregunta "¿qué club me llama?" y se contesta con `marketValue`
//     contra `club.prestige`. Ahí la fama, la proyección y el glamour del club
//     pesan, porque un club ficha por lo que promete y por lo que vende.
//   · el PUESTO pregunta "¿juego este domingo?" y se contesta con el valor
//     DEPORTIVO contra `club.rating`. Ahí no pesa nada de eso: el entrenador pone
//     al que hoy juega mejor.
//
// POR QUÉ NO `marketValue`, que es lo que este archivo usó primero y estuvo mal:
//
//     marketValue = effectiveOvr + upside*youth + fame*0.1 + starterBonus − …
//
//   · `fame * 0.1` suma hasta +10. La fama es lo que te consigue el llamado, no
//     lo que te pone en el equipo.
//   · `upside * youth` suma hasta +7 de PROMESA. La promesa te consigue el
//     contrato; no te pone delante de alguien que hoy juega mejor.
//   · `starterBonus` (+2 titular / −2 marginal) depende de `player.role`, así que
//     desde que el rol sale de esta resta CIERRA UN BUCLE: ser titular te ayuda a
//     seguir siendo titular, por construcción. Y como `marketValue` también decide
//     el escalón de mercado, el bucle se escapaba del rol al mercado — aparecían
//     saltos de tres escalones sin vía.
//
// Medido sobre 27.011 temporadas, con LOS MISMOS cortes y cambiando sólo el
// comparando, el reparto pasa de 66/9/7/7/11 a 47/10/12/12/19: diecinueve puntos
// de "indiscutido" se van al medio.
//
// El valor deportivo es `computeEffectiveOvr`, que ya trae la forma, la moral, la
// fatiga y el descuento por lesión — así que el lesionado sí pierde el puesto.
//
// EL RESULTADO SÍ SE GUARDA (`SeasonResult.squadRole`), y la regla completa está
// escrita al lado de ese campo: derivá cuando las entradas de la derivación son
// estables, guardá cuando van a derivar. El rating del club va a derivar, así que
// re-derivar la etiqueta de una temporada vieja mostraría "titular" donde se jugó
// de suplente.

/**
 * Las cinco bandas. Es una escala de LUGAR EN EL PLANTEL, más fina que
 * `PlayerRole` —que tiene tres valores y vive en el estado— porque el share de
 * partidos necesita distinguir al indiscutido del titular y al suplente del
 * marginal, y el resto del motor no.
 */
export type SquadRole = 'undisputed' | 'starter' | 'rotation' | 'bench' | 'marginal';

export const SQUAD_ROLE_LABELS: Readonly<Record<SquadRole, string>> = {
    undisputed: 'Titular indiscutido',
    starter: 'Titular',
    rotation: 'Rotación',
    bench: 'Suplente',
    marginal: 'Marginal',
};

/**
 * Las bandas, en orden descendente. El corte es `>=` sobre la diferencia, así que
 * cubre los números con decimales: la tabla de diseño dice "+1 a +3" y "−2 a 0",
 * que leído como enteros deja huecos en el medio. El valor efectivo es flotante,
 * así que los huecos se cierran acá y no en cada llamador.
 *
 * LOS CORTES ESTÁN VERIFICADOS CONTRA LA BANDA QUE IMPORTA. Medido, la resta no
 * vive en la misma ventana en todos los niveles:
 *
 *   banda ≤2   p50 +15   →  88% indiscutido
 *   banda 3-4  p50  +9   →  70%
 *   banda 5-6  p50  −0   →  34%
 *   banda ≥7   p50  −3   →  15% / 12% / 18% / 22% / 33%
 *
 * En la élite —donde se pelea el puesto de verdad— estos cortes dan un reparto
 * real y el recorrido es de quince puntos. Que en banda ≤2 casi todos sean
 * indiscutidos NO es un corte mal puesto: es cierto. Ese jugador es el mejor de su
 * club por lejos, y su liga entera le queda chica.
 *
 * `share` es la fracción de las fechas del equipo que llega a disputar. No son
 * partidos garantizados: después pesan la lesión y la disponibilidad.
 */
interface Band {
    role: SquadRole;
    /** Mínimo de `valor deportivo − rating` para entrar en esta banda. */
    from: number;
    share: readonly [number, number];
}

const BANDS: readonly Band[] = [
    { role: 'undisputed', from: 4, share: [0.80, 0.90] },
    { role: 'starter', from: 1, share: [0.65, 0.80] },
    { role: 'rotation', from: -2, share: [0.40, 0.60] },
    { role: 'bench', from: -5, share: [0.20, 0.35] },
    { role: 'marginal', from: -Infinity, share: [0.05, 0.15] },
];

function bandFor(sportingValue: number, clubRating: number): Band {
    const diff = sportingValue - clubRating;
    // Recorrido en orden, de arriba para abajo. La última tiene `-Infinity`, así
    // que el `find` siempre encuentra: no hay caso sin banda.
    return BANDS.find((b) => diff >= b.from)!;
}

/** Lugar en el plantel para ese jugador en ese club. */
export function roleAt(sportingValue: number, clubRating: number): SquadRole {
    return bandFor(sportingValue, clubRating).role;
}

/**
 * EL JUVENIL DE ACADEMIA NO COMPITE CONTRA EL PLANTEL SENIOR, y por eso tiene su
 * propia banda.
 *
 * La resta `valor − rating del club` es la cuenta correcta para un senior: mide
 * cuánto te falta para el equipo en el que querés jugar. Aplicada a un pibe de 18
 * en la academia de un club de rating 85 da −33, o sea `marginal`, o sea 5-15% de
 * las fechas: uno o dos partidos en toda la temporada. Medido, la mediana de
 * apariciones de academia daba 1.
 *
 * Y es falso. El juvenil de la academia de Toulouse juega el campeonato de
 * Espoirs entero — no se sienta a mirar el Top 14. Lo que pasaba es que se le
 * estaba midiendo la fracción del calendario EQUIVOCADO: el del plantel de
 * arriba, contra el que efectivamente no compite.
 *
 * Así que juega la mayor parte de su propia temporada, y cuanto mejor el club más
 * seria es esa competencia interna (menos margen, pero nunca marginal). La banda
 * es ancha porque adentro de una academia también hay titulares y suplentes.
 *
 * PERO NO SE MIDE CONTRA SU CALENDARIO, SE MIDE CONTRA EL SENIOR, y de ahí sale el
 * techo. `matches` cuenta APARICIONES SENIOR: los partidos de Espoirs del juvenil
 * de Toulouse no entran. Así que la fracción que va acá no es "cuánto juega el
 * pibe" —que es mucho— sino "qué parte del calendario de arriba le toca", que es
 * poco. Con [0,45-0,75] la cola se iba: 41% de las temporadas de academia pasaba
 * los diez partidos senior, cuando la figura real es el que suma tres o cuatro.
 *
 * El tope de arriba lo pone `breakout` en `statistics.ts`, que es el pibe que se
 * gana los minutos de verdad una temporada. Ése tiene que existir y ser raro; no
 * puede ser la mediana.
 */
const DEVELOPMENT_SHARE: readonly [number, number] = [0.35, 0.55];

/**
 * Fracción de las fechas que le corresponde, [min, max].
 *
 * `track` decide CONTRA QUÉ calendario se mide. Sin él —que es como lo llamaban
 * los tests viejos— se asume senior, que es el comportamiento anterior.
 */
export function matchShareFor(
    sportingValue: number,
    clubRating: number,
    track: 'senior' | 'development' = 'senior',
): readonly [number, number] {
    if (track === 'development') return DEVELOPMENT_SHARE;
    return bandFor(sportingValue, clubRating).share;
}

/**
 * COARSENING a los tres valores que vive en el estado.
 *
 * `PlayerRole` está en `Player`, en `SeasonResult` y en las ofertas de club, y lo
 * leen el entorno, los eventos, la renovación y el mercado. Widenearlo a cinco
 * valores sería migrar un enum persistido en quince lugares para que cuatro de
 * ellos distingan cosas que no les importan.
 *
 * Así que hay UNA fuente —la resta— y dos granularidades derivadas de ella. El
 * indiscutido y el titular son `starter` para el entorno; el suplente y el
 * marginal son `fringe`. Nadie más traduce nada.
 */
export function playerRoleOf(role: SquadRole): PlayerRole {
    if (role === 'undisputed' || role === 'starter') return 'starter';
    if (role === 'rotation') return 'rotation';
    return 'fringe';
}

/** Atajo: de la resta directo al rol del estado. */
export function playerRoleAt(sportingValue: number, clubRating: number): PlayerRole {
    return playerRoleOf(roleAt(sportingValue, clubRating));
}
