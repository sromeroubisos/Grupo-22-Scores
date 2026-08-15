// EL CAPITÁN — LA CARRERA CONTADA POR CLUBES.
//
// El retiro listaba la vitrina como una tira de copas sueltas —«T7 · Torneo de
// la URBA · Belgrano»— y la trayectoria no estaba en ninguna pantalla. Un
// jugador no cuenta su carrera así: la cuenta por camisetas, y cada copa la
// nombra adentro de la camiseta con la que la ganó.
//
// Este módulo contesta una sola pregunta: POR QUÉ CLUBES PASASTE Y QUÉ GANASTE
// EN CADA UNO. La selección va aparte y por lo mismo: no es un club, es la otra
// escalera (CLAUDE.md §5 de Carrera de Rugby, que acá también corre).
//
// Es PRESENTACIÓN, igual que `honours.ts` y `decisionImpact.ts`: no se persiste,
// no entra en el `stateHash` y no sube ninguna versión. Por eso vive en `app/` y
// no en el motor, y por eso el nombre del club NO se resuelve acá — la pantalla
// lo pide con `clubLabel`. Acá se decide qué se cuenta, no cómo se llama nada.
//
// ── Por qué se leen las DOS listas y no una ─────────────────────────────────
// Los pasos salen de `history` —la única lista que sabe en qué club estabas cada
// temporada— y las copas de `state.titles`, que es la vitrina completa. La fila
// del año tiene su propio `titles[]`, pero es la del año SIMULADO: el Mundial
// que se juega a mano lo escribe el reducer después de cerrarla. Es la misma
// razón por la que `honours.ts` resta estados en vez de leer la fila.
//
// ── Y por qué el paso trae TODO lo del club ─────────────────────────────────
// El retiro tenía una columna al costado con los premios, la Pertenencia y las
// notas: leerla obligaba a ir y volver entre «Mejor jugador del mundo T13» y la
// camiseta que estabas usando en T13. Un premio individual, la Pertenencia que
// construiste y lo que produjiste en cancha son las tres cosas que pasaron
// ADENTRO de una camiseta, así que viajan con el paso y no en una lista aparte.

import type {
    CaptainSeasonEntry,
    CaptainState,
    SeasonAwardId,
    Title,
} from '@/features/captain';
// El VALOR va por camino relativo y con extensión, y el tipo por el alias: los
// tipos se borran al compilar, pero esta función existe en tiempo de ejecución y
// `node --test` no resuelve `@/`. Es la misma nota que lleva `honours.ts`, y por
// la misma razón: con el alias, el test de este módulo no arranca.
import { getFamily } from '../../../../features/captain/data/positions.ts';
import { representativeMatchesOf, trackLabelOf } from '../../../../features/captain/engine/national-team.ts';
import { tournamentCompetitionId } from '../../../../features/captain/types/tournament.ts';

/**
 * LA COPA DEL SELECCIONADO A, por id y no por nombre.
 *
 * El rótulo del trofeo se puede retocar sin que nadie lo note; el id es lo que la
 * copa ES. Es la misma regla con la que `groupTitles` agrupa (§1.5).
 */
const XV_TROPHY_ID = tournamentCompetitionId('nations-cup');

/** Una copa, con lo justo para dibujarla en una línea. */
export interface TrailTitle {
    season: number;
    competitionId: string;
    label: string;
}

/**
 * Un premio individual del año. Va por ID y sin texto a propósito: acá se decide
 * QUÉ se cuenta y la pantalla resuelve cómo se llama (`AWARD_LABELS`), igual que
 * con el nombre del club.
 */
export interface TrailAward {
    id: SeasonAwardId;
    season: number;
}

/** El mismo premio ganado dos veces es UNA línea con sus años. */
export interface TrailAwardGroup {
    id: SeasonAwardId;
    seasons: number[];
}

/**
 * LO QUE HICISTE CON ESA CAMISETA.
 *
 * Son los números de la ficha de temporada, sumados a lo largo del paso. La
 * media va como la MÁS ALTA que tuviste ahí y no como la última: el retiro
 * cuenta a cuánto llegaste, no en qué quedaste el día que te fuiste.
 */
export interface TrailStats {
    matches: number;
    /** La métrica-gloria del puesto. Sumada, o promediada si es un porcentaje. */
    glory: number;
    /** La secundaria, con la misma regla. `0` si la familia no declara una. */
    glorySecondary: number;
    /** La media más alta que alcanzaste en el club. */
    bestOvr: number;
    /** El puntaje medio de esas temporadas, con un decimal. */
    rating: number;
}

/**
 * UN PASO POR UN CLUB: los años seguidos que estuviste ahí.
 *
 * Volver es un paso NUEVO y no el mismo estirado. Un jugador que se fue a los
 * 24 y volvió a los 31 tuvo dos etapas distintas en el mismo club, y juntarlas
 * en una fila «T3–T14» diría que nunca se movió.
 */
export interface TrailStint {
    /**
     * Identidad de la fila. Sale de lo que la cosa ES —el club y la temporada en
     * que arrancó el paso— y nunca de su posición en la lista (§1.5): con dos
     * pasos por el mismo club, el id del club solo no alcanza para distinguirlos.
     */
    key: string;
    /** `null` cuando la carrera empezó sin club resuelto. Se dibuja igual. */
    clubId: string | null;
    from: number;
    to: number;
    /** Temporadas jugadas. `0` en el paso que existe SOLO por una copa (ver abajo). */
    seasons: number;
    matches: number;
    titles: TrailTitle[];
    /** Los premios individuales que ganaste con esa camiseta. */
    awards: TrailAward[];
    /**
     * LA PERTENENCIA MÁS ALTA QUE ALCANZASTE EN EL PASO.
     *
     * Sale de la fila del año y no de `belonging.byClub`, que guarda un solo
     * número por club: el que volvió al club de origen a los 31 tiene dos pasos
     * con dos historias distintas, y el marcador único le pondría el mismo
     * escalón a los dos.
     */
    belonging: number;
    stats: TrailStats;
}

/**
 * EL SELECCIONADO A — «Argentina XV», «Nueva Zelanda XV», y así.
 *
 * Va SEPARADO de la mayor y no adentro, y es la distinción que el rugby no
 * perdona: los partidos con el XV NO son caps. Sumarlos en el mismo renglón que
 * los caps convertiría una carrera de tres temporadas en el segundo seleccionado
 * en una de tres temporadas en Los Pumas, que es exactamente la mentira que este
 * bloque existe para no decir.
 *
 * Los partidos son DERIVADOS: `representativeMatchesOf('a-xv')` por cada
 * temporada cuyo escalón fue el A-XV. No hay contador guardado que se pueda
 * desincronizar, y por eso el bloque también funciona en una carrera vieja
 * mientras el historial esté entero (§1.9).
 */
export interface TrailXv {
    /** Cómo se llama el seleccionado A de tu unión. La pantalla no lo arma. */
    label: string;
    /** Temporadas en que el escalón de la temporada fue el A-XV. */
    seasons: number;
    /** Partidos jugados con esa camiseta a lo largo de la carrera. */
    matches: number;
    /** Lo que ganaste con ella. Hoy, la Nations Cup. */
    titles: TrailTitle[];
}

export interface CareerTrail {
    stints: TrailStint[];
    /** La otra escalera: caps y lo que ganaste con la camiseta de tu unión. */
    national: {
        caps: number;
        titles: TrailTitle[];
    };
    /** El escalón de abajo de la mayor, `null` si nunca lo pisaste. */
    xv: TrailXv | null;
}

/**
 * La misma copa ganada varias veces es UNA línea con sus años.
 *
 * Sin esto, el bicampeón de la URBA lee dos filas idénticas y una de ellas
 * parece un error de la pantalla. Con los años al lado, el logro se agranda en
 * vez de repetirse: «Torneo de la URBA · T7 T8».
 *
 * Se agrupa por `competitionId` y no por el rótulo: el id es lo que la copa ES
 * y el rótulo es cómo se llama hoy.
 */
export interface TrailTrophy {
    competitionId: string;
    label: string;
    seasons: number[];
}

export function groupTitles(titles: readonly TrailTitle[]): TrailTrophy[] {
    const trofeos: TrailTrophy[] = [];

    for (const title of titles) {
        const previo = trofeos.find((t) => t.competitionId === title.competitionId);
        if (previo) {
            previo.seasons.push(title.season);
            continue;
        }
        trofeos.push({ competitionId: title.competitionId, label: title.label, seasons: [title.season] });
    }

    return trofeos;
}

/** Lo mismo con los premios: el bicampeón del mundo lee una línea con dos años. */
export function groupAwards(awards: readonly TrailAward[]): TrailAwardGroup[] {
    const grupos: TrailAwardGroup[] = [];

    for (const award of awards) {
        const previo = grupos.find((g) => g.id === award.id);
        if (previo) {
            previo.seasons.push(award.season);
            continue;
        }
        grupos.push({ id: award.id, seasons: [award.season] });
    }

    return grupos;
}

function toTrailTitle(title: Title): TrailTitle {
    return { season: title.season, competitionId: title.competitionId, label: title.labelEs };
}

/**
 * La misma regla que `honours.ts`: un título es del club sólo si tiene club.
 * Todo lo demás lo ganó la unión, y decir «Sin club» ahí sería mentir en la
 * línea que el jugador va a releer.
 */
function esDelClub(title: Title): boolean {
    return title.kind === 'club' && title.clubId !== null;
}

/**
 * Lo que hay que llevar aparte mientras se suma un paso: los divisores.
 *
 * Van acá y no en `TrailStats` porque son andamio del cálculo, no un número que
 * la pantalla vaya a mostrar; dejarlos adentro invitaría a dibujarlos.
 */
interface Acumulador {
    stint: TrailStint;
    /** Temporadas CON PARTIDOS: las únicas que promedian bien (ver `finalizar`). */
    played: number;
    ratingSum: number;
    /** El puntaje de todas las filas, para el paso que no jugó ninguna. */
    ratingSumAll: number;
}

/** Un paso vacío, listo para que le sumen la primera temporada. */
function nuevoPaso(entry: CaptainSeasonEntry): TrailStint {
    return {
        key: `${entry.clubId ?? 'sin-club'}:${entry.season}`,
        clubId: entry.clubId,
        from: entry.season,
        to: entry.season,
        seasons: 0,
        matches: 0,
        titles: [],
        awards: [],
        belonging: 0,
        stats: { matches: 0, glory: 0, glorySecondary: 0, bestOvr: 0, rating: 0 },
    };
}

/** Los años seguidos en el mismo club, en el orden en que se jugaron. */
function stintsFromHistory(history: readonly CaptainSeasonEntry[]): Acumulador[] {
    const acumuladores: Acumulador[] = [];

    for (const entry of history) {
        const ultimo = acumuladores.length > 0 ? acumuladores[acumuladores.length - 1] : null;

        const acc = ultimo && ultimo.stint.clubId === entry.clubId
            ? ultimo
            : (() => {
                const nuevo: Acumulador = {
                    stint: nuevoPaso(entry),
                    played: 0,
                    ratingSum: 0,
                    ratingSumAll: 0,
                };
                acumuladores.push(nuevo);
                return nuevo;
            })();

        const { stint } = acc;
        stint.to = entry.season;
        stint.seasons += 1;
        stint.matches += entry.matchesPlayed;
        stint.belonging = Math.max(stint.belonging, entry.belonging);

        stint.stats.matches += entry.matchesPlayed;
        stint.stats.glory += entry.glory;
        stint.stats.glorySecondary += entry.glorySecondary;
        stint.stats.bestOvr = Math.max(stint.stats.bestOvr, entry.ovr);

        acc.ratingSumAll += entry.rating;
        if (entry.matchesPlayed > 0) {
            acc.played += 1;
            acc.ratingSum += entry.rating;
        }
    }

    return acumuladores;
}

/**
 * Cierra las cuentas del paso: lo que se promedia, se promedia.
 *
 * ── UN PORCENTAJE NO SE SUMA ───────────────────────────────────────────────
 * Es la misma regla que ya respeta `engine/statistics.ts` cuando lo genera: el
 * line-out propio del hooker es el promedio de la temporada, no un contador.
 * Sumado a lo largo de seis años daría 528 %, que además de falso es ridículo.
 *
 * El promedio se saca sobre las temporadas CON PARTIDOS: un año entero perdido
 * por lesión vale 0 en la ficha, y meterlo en el divisor hundiría un porcentaje
 * que en la cancha nunca bajó. El puntaje sigue la misma regla y cae a todas
 * las filas sólo si el paso no jugó ni un partido.
 */
function finalizar(acc: Acumulador, percentPrimary: boolean, percentSecondary: boolean): TrailStint {
    const { stint, played } = acc;

    if (percentPrimary) stint.stats.glory = played > 0 ? stint.stats.glory / played : 0;
    if (percentSecondary) stint.stats.glorySecondary = played > 0 ? stint.stats.glorySecondary / played : 0;

    const divisor = played > 0 ? played : stint.seasons;
    const suma = played > 0 ? acc.ratingSum : acc.ratingSumAll;
    stint.stats.rating = divisor > 0 ? Math.round((suma / divisor) * 10) / 10 : 0;

    return stint;
}

/**
 * A qué paso pertenece una copa.
 *
 * Lo normal es que la temporada caiga adentro de un paso. Los dos respaldos
 * cubren el borde real: una copa que el reducer escribe DESPUÉS de cerrar la
 * fila del año puede quedar una temporada corrida respecto del rango.
 *
 * `null` significa «este club no está en la trayectoria», y eso no se descarta:
 * lo levanta `trailOf` con un paso propio. Una copa perdida en una pantalla que
 * se llama «la vitrina» es el peor error posible acá.
 */
function stintForTitle(stints: readonly TrailStint[], title: Title): TrailStint | null {
    const delClub = stints.filter((s) => s.clubId === title.clubId);
    if (delClub.length === 0) return null;

    const adentro = delClub.find((s) => title.season >= s.from && title.season <= s.to);
    if (adentro) return adentro;

    // El paso más reciente que ya había empezado cuando se ganó; si la copa es
    // anterior a todos, el primero por el que pasó.
    const previos = delClub.filter((s) => s.from <= title.season);
    return previos.length > 0 ? previos[previos.length - 1] : delClub[0];
}

/**
 * La trayectoria completa: los clubes, con lo que ganaste en cada uno, y la
 * selección aparte.
 */
export function trailOf(state: CaptainState): CareerTrail {
    const glory = getFamily(state.player.family).glory;
    const stints = stintsFromHistory(state.history).map((acc) => finalizar(
        acc,
        glory.primary.unit === 'percent',
        glory.secondary?.unit === 'percent',
    ));
    const national: TrailTitle[] = [];
    const xvTitles: TrailTitle[] = [];

    // ── EL SELECCIONADO A ───────────────────────────────────────────────────
    // Las temporadas salen del historial, que guarda el ESCALÓN de cada año por
    // id desde que dejó de guardar el rótulo. Con el rótulo esto no se podía
    // escribir: había que comparar contra un texto que además cambia de país en
    // país.
    const xvSeasons = state.history.filter((h) => h.trackId === 'a-xv').length;

    /**
     * EL PREMIO ES DE LA CAMISETA CON LA QUE SE GANÓ.
     *
     * La fuente es `state.awards`, que es la lista canónica, y no el `awards[]`
     * de la fila del año: son la misma cosa hoy, pero si alguna vez dejaran de
     * serlo, el que manda es el estado y no su copia. El año se resuelve contra
     * el rango del paso —los pasos de `history` cubren todas las temporadas sin
     * huecos ni solapes— y el respaldo existe por lo mismo que en las copas: un
     * premio que no se dibuja en ningún lado es peor que uno mal ubicado.
     */
    for (const award of state.awards) {
        const adentro = stints.find((s) => award.season >= s.from && award.season <= s.to);
        const previos = stints.filter((s) => s.from <= award.season);
        const paso = adentro ?? previos[previos.length - 1] ?? stints[0];
        paso?.awards.push({ id: award.id, season: award.season });
    }

    for (const title of state.titles) {
        // La copa del seleccionado A se va a SU bloque y no al de la mayor. Es
        // la misma separación que hace `esDelClub` un renglón más abajo: una
        // copa colgada de la camiseta equivocada dice que la ganó otro.
        if (title.competitionId === XV_TROPHY_ID) {
            xvTitles.push(toTrailTitle(title));
            continue;
        }

        if (!esDelClub(title)) {
            national.push(toTrailTitle(title));
            continue;
        }

        const stint = stintForTitle(stints, title);

        if (stint) {
            stint.titles.push(toTrailTitle(title));
            continue;
        }

        // UN PASO QUE EXISTE SÓLO POR LA COPA. Pasa si la vitrina nombra un club
        // que la trayectoria no tiene —hoy no debería, pero la alternativa es
        // tragarse el título—. Se marca con `seasons: 0` para que la pantalla no
        // afirme una temporada que nadie jugó.
        stints.push({
            key: `${title.clubId}:${title.season}:copa`,
            clubId: title.clubId,
            from: title.season,
            to: title.season,
            seasons: 0,
            matches: 0,
            titles: [toTrailTitle(title)],
            awards: [],
            belonging: 0,
            stats: { matches: 0, glory: 0, glorySecondary: 0, bestOvr: 0, rating: 0 },
        });
    }

    // Orden de carrera. El `sort` de JS es estable, así que dos pasos que
    // arrancan la misma temporada conservan el orden en que se armaron.
    stints.sort((a, b) => a.from - b.from);

    for (const stint of stints) {
        stint.titles.sort((a, b) => a.season - b.season);
        stint.awards.sort((a, b) => a.season - b.season);
    }

    xvTitles.sort((a, b) => a.season - b.season);

    // El bloque existe si HUBO algo: temporadas en el escalón o una copa. Las
    // dos puertas y no una — una carrera vieja puede tener la copa sin que el
    // historial diga el escalón, y perder una copa es el peor error posible en
    // una pantalla que se llama la vitrina.
    const xv: TrailXv | null = xvSeasons > 0 || xvTitles.length > 0
        ? {
            label: trackLabelOf('a-xv', state.player.countryCode),
            seasons: xvSeasons,
            matches: xvSeasons * representativeMatchesOf('a-xv'),
            titles: xvTitles,
        }
        : null;

    return { stints, national: { caps: state.national.caps, titles: national }, xv };
}
