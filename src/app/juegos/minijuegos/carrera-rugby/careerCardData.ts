// MODELO DE LA TARJETA COMPARTIBLE.
//
// Una sola definición de QUÉ dice la tarjeta, para los dos destinos que la
// dibujan: la página que se abre al seguir el link y la og:image que se ve
// pegada en el chat antes de abrirla. Si el contenido viviera en cada renderer,
// la imagen del chat y la página terminarían diciendo cosas distintas.
//
// Es un `.ts` sin JSX a propósito: así se puede testear con `node --test`, igual
// que `clubCrest.ts`.

import type { CareerReceipt, CareerState, Locale, ShareIdentity } from '@/features/career';
import {
    ALL_COMPETITIONS, archetypeIn, archetypeLabelIn, buildCareerSummary, contractLabel,
    contractLabelIn, countryNameIn, distinctionIn, findCountry, flagPathOf, getClub, getPosition,
    INTERNATIONAL_COMPETITIONS, kickAccuracy, positionLabel, secondaryStatLabelIn,
    secondaryStatOf, stringsFor,
} from '@/features/career';
import {
    LOCAL_AWARD_LOGOS, LOCAL_CLUB_LOGOS, LOCAL_COMPETITION_LOGOS,
} from '@/features/career/data/logo-manifest.generated';
import { crestKeyOf, initialsOf, monogramColor } from './clubCrest';
import { premioIdOf } from './premios';

/**
 * NOMBRE DE TROFEO → ID DE ARCHIVO DE LOGO.
 *
 * El motor guarda la vitrina como TEXTO (`summary.honours`: "Mundial", "Top 14",
 * "The Rugby Championship"), no como id, así que para colgarle el logo hay que
 * volver del nombre al id. Se arma una vez, con los dos catálogos:
 *
 *   · las competiciones de CLUBES, por su etiqueta;
 *   · las de SELECCIONES, por el nombre del torneo y ADEMÁS por el de cada uno
 *     de sus trofeos — el Grand Slam es un trofeo del Seis Naciones y aparece en
 *     la vitrina con su propio nombre, así que sin esa segunda entrada quedaría
 *     sin logo aunque el del torneo esté cargado.
 *
 * Un nombre que no matchea devuelve `null` y la ficha se dibuja como siempre.
 */
const LOGO_POR_NOMBRE: ReadonlyMap<string, string> = (() => {
    const m = new Map<string, string>();
    for (const c of ALL_COMPETITIONS) m.set(c.label, c.id);
    for (const c of INTERNATIONAL_COMPETITIONS) {
        m.set(c.name, c.id);
        for (const trofeo of c.trophies) if (!m.has(trofeo.name)) m.set(trofeo.name, c.id);
    }
    return m;
})();

function trophyIconUrl(nombre: string, origin: string): string | null {
    const id = LOGO_POR_NOMBRE.get(nombre);
    // Se consulta el manifiesto en vez de probar la petición: pedir un PNG que
    // no está devuelve el HTML de la página de error, y en la og:image eso deja
    // la tarjeta rota entera, no sólo el ícono.
    if (id === undefined || !LOCAL_COMPETITION_LOGOS.has(id)) return null;
    return `${origin}/competiciones/${id}.png`;
}

function awardIconUrl(nombre: string, origin: string): string | null {
    const id = premioIdOf(nombre);
    if (id === null || !LOCAL_AWARD_LOGOS.has(id)) return null;
    return `${origin}/premios/${id}.png`;
}

export interface CardStat {
    label: string;
    value: string;
}

export interface CardClub {
    name: string;
    seasons: number;
    /** URL absoluta del escudo real, o null si ese club no tiene ninguno. */
    crestUrl: string | null;
    /** Respaldo SOLO para los clubes sin escudo en el catálogo. */
    initials: string;
    color: string;
}

/** Un título, con las veces que se ganó. "Top 14 ×3" en una sola ficha. */
export interface CardTrophy {
    name: string;
    count: number;
    /**
     * Logo del torneo, si existe el archivo. `null` cuando no hay: la ficha se
     * dibuja con texto solo, que es lo que hacía siempre.
     *
     * La URL es ABSOLUTA porque la og:image la resuelve un renderer que no tiene
     * el `origin` de la página — la misma razón por la que `flagUrl` ya lo era.
     */
    iconUrl: string | null;
}

/** Un premio individual de la vitrina, con su ícono si lo hay. */
export interface CardAward {
    name: string;
    iconUrl: string | null;
}

export interface CareerCardData {
    /** Titular del retiro. Lo decide el motor (`engine/archetypes.ts`). */
    headline: string;
    /** El OVR de la vitrina: el pico, no el del último día. Es EL número. */
    ovr: number;
    /** Dorsal del puesto. En rugby el número ES el puesto. */
    number: number | null;
    /**
     * URL ABSOLUTA de la bandera. Absoluta y no `/flags/ar.svg` porque la
     * og:image se arma en el servidor, donde una ruta relativa no resuelve
     * contra ningún origen.
     */
    flagUrl: string | null;
    /**
     * El escalafón alcanzado, en el lugar donde un simulador de fútbol pondría
     * el valor de mercado. En rugby no hay valor: el eje económico es el
     * vínculo, y decir "€8.2M" sería importar la moneda del otro deporte.
     */
    employment: string;
    /**
     * Los TRES números grandes de la tarjeta. Van aparte de `stats` porque no
     * son "unos datos más": son los que se leen de un vistazo en un chat.
     * Partidos, puntos y CAPS — los caps entran sí o sí, que en rugby pesan más
     * que los títulos.
     */
    headline3: CardStat[];
    /** Títulos agrupados con su contador, para la vitrina de la tarjeta. */
    trophies: CardTrophy[];
    /**
     * Premios INDIVIDUALES. Van aparte de los títulos porque no son lo mismo: un
     * título lo gana el equipo y un premio lo gana el jugador, y meterlos en la
     * misma fila hacía que "XV ideal del año" se leyera como un torneo.
     */
    awards: CardAward[];
    /** Vacío en modo recibo: la frase la escribe el motor y acá no corrió. */
    blurb: string;
    surname: string;
    position: string;
    nationality: string;
    countryCode: string | null;
    /** "Debut a los 18 · Retiro a los 37". Vacío en modo recibo. */
    span: string;
    stats: CardStat[];
    clubs: CardClub[];
    /**
     * Aviso al pie. Sólo en modo recibo: la tarjeta tiene que decir en la propia
     * imagen que está incompleta, porque la vista previa del chat se ve sin la
     * página alrededor y ahí no hay dónde poner la aclaración.
     */
    notice?: string;
}

/**
 * Cuántos clubes entran en la trayectoria de la tarjeta. Ocho es lo que la
 * historia (1080×1920) muestra en dos filas de cuatro; los formatos más chicos
 * recortan por su cuenta. Una carrera de doce clubes no se dibuja entera en
 * ninguno: a partir de cierto número los escudos son ilegibles y la trayectoria
 * deja de contar nada.
 */
const MAX_CLUBES_TARJETA = 8;

/**
 * La trayectoria, EN ORDEN CRONOLÓGICO y no por temporadas jugadas.
 *
 * `summary.byClub` viene ordenado por permanencia porque sirve para otra cosa
 * (dónde jugó más). Acá el rótulo dice TRAYECTORIA, y una trayectoria que
 * empieza por el club donde más jugó no es una trayectoria: es un ranking. Se
 * deriva de `history`, que ya guarda el club de cada temporada en orden.
 */
function clubesEnOrden(career: CareerState): { club: string; seasons: number }[] {
    const orden: string[] = [];
    const temporadas = new Map<string, number>();
    for (const entry of career.history) {
        if (!temporadas.has(entry.clubId)) orden.push(entry.clubId);
        temporadas.set(entry.clubId, (temporadas.get(entry.clubId) ?? 0) + 1);
    }
    return orden.slice(0, MAX_CLUBES_TARJETA).map((club) => ({ club, seasons: temporadas.get(club) ?? 0 }));
}

/**
 * URL ABSOLUTA del escudo, con el mismo orden de resolución que el juego pero
 * resuelto en el servidor: primero el PNG cargado a mano, después el proxy, y
 * si no hay ninguno se devuelve `null` para que la tarjeta dibuje el monograma.
 *
 * El manifiesto se consulta ANTES que el proxy y no al revés: es la única forma
 * de saber que el archivo existe sin pedirlo. Para los clubes que no están, el
 * proxy es la única chance; para los que no tienen ni clave, pedir "por las
 * dudas" devuelve el HTML de la página de error (~102 KB) y la imagen rota
 * igual, así que no se pide.
 */
function crestUrlOf(clubId: string, clubName: string, origin: string): string | null {
    if (LOCAL_CLUB_LOGOS.has(clubId)) return `${origin}/clubs/${clubId}.png`;
    const key = crestKeyOf(clubId);
    if (key === null) return null;
    return `${origin}/api/assets/team-logo?entity=team&sport=rugby&key=${encodeURIComponent(key)}&name=${encodeURIComponent(clubName)}`;
}

/**
 * `origin` tiene que ser ABSOLUTO: la og:image se arma en el servidor y ahí una
 * ruta relativa no resuelve contra nada.
 *
 * `locale` viaja EXPLÍCITO y no se detecta: esta función corre en el servidor
 * para armar la og:image, donde no hay `localStorage` ni preferencia del que
 * mira. El idioma lo decide quien comparte, y viaja en el link (`?lang=`).
 */
export function careerCardData(career: CareerState, origin: string, locale: Locale = 'es'): CareerCardData {
    const summary = buildCareerSummary(career);
    const t = stringsFor(locale);
    const position = getPosition(summary.position);
    const secondary = secondaryStatOf(summary.position, summary.totals);
    const accuracy = position.stats.goalKicker ? kickAccuracy(summary.totals) : null;

    // Cinco cifras, no diez: una tarjeta que se mira dos segundos en un chat no
    // es la pantalla de retiro. Se eligen las que cuentan una carrera de rugby —
    // los caps antes que los títulos, como manda la jerarquía del juego.
    const stats: CardStat[] = [
        { label: t.cardSeasons, value: String(summary.seasons) },
        { label: t.cardMatches, value: String(summary.totalMatches) },
        { label: t.cardCaps, value: String(summary.caps) },
        { label: t.cardTitles, value: String(summary.titles) },
        { label: t.cardPeakOvr, value: String(summary.peakOvr) },
    ];

    // La sexta ranura es la del puesto: un pilar sin tries no dice nada, pero
    // 203 scrums sí. Sólo entra si tiene algo que mostrar.
    const positional = accuracy !== null && secondary.kind !== 'kick-accuracy'
        ? { label: t.cardGoalPct, value: `${accuracy}%` }
        : { label: secondaryStatLabelIn(secondary.label, locale), value: secondary.display };
    if (!secondary.isZero || positional.label === t.cardGoalPct) stats.push(positional);

    // Los títulos, agrupados. `honours` ya viene con las repeticiones
    // colapsadas, así que el contador sale de contar cuántas veces aparece cada
    // torneo en la vitrina cruda del resumen.
    const trofeos = new Map<string, number>();
    for (const h of summary.honours) trofeos.set(h, (trofeos.get(h) ?? 0) + 1);

    const archetype = archetypeIn(summary.archetype.id, summary.archetype.label, summary.archetype.blurb, locale);

    return {
        headline: archetype.label,
        ovr: summary.peakOvr,
        number: career.player.number,
        flagUrl: career.player.eligibility.nationalityCountryCode
            ? `${origin}${flagPathOf(career.player.eligibility.nationalityCountryCode)}`
            : null,
        employment: contractLabelIn(
            career.player.employment,
            career.player.squadTrack,
            contractLabel(career.player.employment, career.player.squadTrack),
            locale,
        ),
        headline3: [
            { label: t.cardMatches, value: String(summary.totalMatches) },
            { label: t.cardPoints, value: String(summary.totals.points) },
            { label: t.cardCaps, value: String(summary.caps) },
        ],
        trophies: [...trofeos.entries()].map(([name, count]) => ({
            name, count, iconUrl: trophyIconUrl(name, origin),
        })),
        // Las distinciones salen del motor como frase y en español; se traducen
        // al dibujar, pero el ícono se busca con el texto original, que es la
        // clave de `premios.ts`.
        awards: summary.distinctions.map((name) => ({
            name: distinctionIn(name, locale),
            iconUrl: awardIconUrl(name, origin),
        })),
        blurb: archetype.blurb,
        surname: career.player.surname,
        position: positionLabel(summary.position, position.labelEs, locale),
        nationality: countryNameIn(career.player.eligibility.nationalityCountryCode, summary.nationality, locale),
        countryCode: career.player.eligibility.nationalityCountryCode ?? null,
        span: t.cardSpan(summary.debutAge, summary.retirementAge),
        clubs: clubesEnOrden(career).map((c) => {
            const club = getClub(c.club);
            return {
                name: club.labelEs,
                seasons: c.seasons,
                // Escudo REAL siempre que exista con qué dibujarlo. El monograma
                // queda sólo para los clubes que no tienen ninguno: no es una
                // alternativa estética, es la ausencia de un asset.
                crestUrl: crestUrlOf(c.club, club.labelEs, origin),
                initials: initialsOf(club.labelEs),
                color: monogramColor(c.club),
            };
        }),
        stats,
    };
}

/**
 * Tarjeta en MODO RECIBO: lo que el token guardó al compartirse, cuando el motor
 * ya no puede reconstruir la carrera.
 *
 * Muestra menos y no disimula que muestra menos. La alternativa —reconstruir la
 * carrera con el motor nuevo— daría una carrera distinta de la que se jugó y la
 * haría pasar por la del que compartió el link. Eso sí sería mentir.
 */
export function receiptCardData(identity: ShareIdentity, receipt: CareerReceipt, locale: Locale = 'es'): CareerCardData {
    const t = stringsFor(locale);
    const cifras: CardStat[] = [
        { label: t.cardSeasons, value: String(receipt.seasons) },
        { label: t.cardCaps, value: String(receipt.caps) },
        { label: t.cardPeakOvr, value: String(receipt.peakOvr) },
    ];

    return {
        // El titular es lo ÚNICO que el recibo guardó del arquetipo, y lo guardó
        // como frase. Se traduce por índice inverso (`archetypeLabelIn`), que es
        // la única concesión de toda la capa a traducir por texto.
        headline: archetypeLabelIn(receipt.archetype, locale),
        ovr: receipt.peakOvr,
        number: null,
        // Sin `origin` no se puede armar una URL absoluta, y una relativa en la
        // og:image no resuelve: mejor sin bandera que con un hueco roto.
        flagUrl: null,
        employment: '',
        headline3: cifras,
        trophies: [],
        awards: [],
        blurb: '',
        surname: identity.surname,
        position: positionLabel(identity.position, getPosition(identity.position).labelEs, locale),
        nationality: countryNameIn(
            identity.nationalityCountryCode,
            findCountry(identity.nationalityCountryCode)?.nameEs ?? '',
            locale,
        ),
        countryCode: identity.nationalityCountryCode || null,
        span: '',
        clubs: [],
        stats: cifras,
        notice: t.cardReceiptNotice,
    };
}
