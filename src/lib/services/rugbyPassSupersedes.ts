/**
 * QUE TORNEO DE FLASHSCORE DEJA DE MOSTRARSE PORQUE YA LO TRAE RUGBYPASS.
 *
 * Cuando una competicion entra por RugbyPass, su equivalente de FlashScore no
 * puede aparecer en ningun lado: si aparecen las dos, el mismo partido sale dos
 * veces. Y `dedupeCrossSourceMatches` NO alcanza por si solo — pliega el
 * archivo (`ra-`) contra el proveedor vivo, pero FlashScore y RugbyPass son los
 * DOS "vivo", asi que sin esto sobreviven ambos.
 *
 * ── POR QUE NO SE PUEDE FILTRAR POR NOMBRE ──────────────────────────────────
 * En `data/tournaments/rugby.ts` conviven `rugby-france-top-14` ("Top 14", de
 * Francia) y `rugby-argentina-top-14` ("Top 14", el de la URBA). Son dos
 * competiciones distintas con el MISMO nombre. Un filtro por nombre pelado
 * apagaria el Top 14 argentino, que no lo cubre RugbyPass y que ademas es el
 * que mas le importa a este sitio.
 *
 * Por eso se resuelve por id del catalogo, o por fragmento de URL (que lleva el
 * pais adentro), o por nombre CON el pais coincidiendo. Nunca por nombre solo.
 *
 * ── LO QUE NO TIENE EQUIVALENTE ─────────────────────────────────────────────
 * "Internationals" (RugbyPass 3) queda sin mapear a proposito: es un cajon de
 * sastre que mezcla el Rugby Championship 2026 con Czech Republic vs Mexico y
 * Paraguay vs Brazil. No hay UN torneo de FlashScore que le corresponda, y
 * apagar los test matches en bloque perderia partidos que RugbyPass no trae.
 * Para esos, la red de seguridad es el pliegue por identidad del feed.
 *
 * El Rugby Europe Championship (269) queda sin mapear por el motivo contrario:
 * no hay a quien apagar. No tiene ficha en `data/tournaments/rugby.ts`, asi que
 * FlashScore no lo publica por este sitio y no hay con que duplicarlo.
 */

import { RUGBYPASS_COMPETITIONS, RUGBYPASS_MATCH_ID_PREFIX } from './rugbyPassParser.ts';

export interface SupersededTournament {
    /** La competicion de RugbyPass que lo reemplaza. */
    rugbyPassCompetitionId: number;
    /** Ids del catalogo de `data/tournaments/rugby.ts`. Es la via mas precisa. */
    tournamentIds: readonly string[];
    /** Fragmentos de la URL de FlashScore: llevan el pais adentro. */
    urlFragments: readonly string[];
    /** Nombres. Solo valen ACOMPANADOS del pais — ver el Top 14 de arriba. */
    names: readonly string[];
    /**
     * Paises con los que puede llegar. Va como lista porque cada proveedor
     * rotula distinto lo multipais: la URC puede venir como 'Europe', 'World'
     * o 'International' segun quien la publique.
     */
    countries: readonly string[];
}

export const RUGBYPASS_SUPERSEDES: readonly SupersededTournament[] = [
    {
        rugbyPassCompetitionId: 208,
        // 'jZAJkgK7' es el id opaco de FlashScore; el otro es el del catalogo.
        tournamentIds: ['rugby-nz-bunnings-npc', 'jzajkgk7', 'darnqf5r'],
        urlFragments: ['/new-zealand/bunnings-npc/', '/new-zealand/npc/'],
        names: ['bunnings npc', 'hilux npc', 'npc'],
        countries: ['new zealand', 'nueva zelanda', 'nz'],
    },
    {
        rugbyPassCompetitionId: 203,
        // El Top 14 frances es '6LLKpkiU'; el argentino es 'ILOhakKD'. Los ids
        // opacos los distinguen sin ambiguedad, que es lo que el nombre no puede.
        tournamentIds: ['rugby-france-top-14', '6llkpkiu', 'szd3lkgt'],
        urlFragments: ['/france/top-14/'],
        // 'top 14' a secas tambien es el torneo argentino: sin el pais no vale.
        names: ['top 14', 'top14'],
        countries: ['france', 'francia'],
    },
    {
        rugbyPassCompetitionId: 211,
        // La Pro D2 no tiene flashScoreIds en el catalogo: va por URL y nombre.
        tournamentIds: ['rugby-france-pro-d2'],
        urlFragments: ['/france/pro-d2/'],
        names: ['pro d2', 'prod2'],
        countries: ['france', 'francia'],
    },
    {
        rugbyPassCompetitionId: 201,
        tournamentIds: ['rugby-england-premiership', 'pa7boy5e', 'za7d2lo5'],
        urlFragments: ['/england/premiership-rugby/'],
        // La Premiership Cup y la Premiership Women son OTRAS competiciones y
        // no las cubre RugbyPass: por eso los nombres van completos y exactos.
        names: ['premiership rugby', 'gallagher premiership'],
        countries: ['england', 'inglaterra'],
    },
    {
        rugbyPassCompetitionId: 204,
        tournamentIds: ['rugby-united-rugby-championship', 'eyhym58u', 'jbhqxtnh'],
        urlFragments: ['/world/united-rugby-championship/'],
        names: ['united rugby championship', 'urc'],
        countries: ['international', 'internacional', 'europe', 'world', 'europa', 'mundo'],
    },

    // ── Las que entran por la pagina de su competicion ──────────────────────
    {
        rugbyPassCompetitionId: 209,
        tournamentIds: ['rugby-six-nations', 'oi2gtjwp', 'faepan8o'],
        urlFragments: ['/europe/six-nations/'],
        // 'six nations' a secas tambien es el femenino y el U20, que RugbyPass
        // publica aparte (248 y 217) y este conector NO trae. Por eso los
        // nombres van completos y el pais acompana.
        names: ['six nations'],
        countries: ['europe', 'europa', 'international', 'internacional'],
    },
    {
        rugbyPassCompetitionId: 214,
        tournamentIds: ['rugby-championship', 'm54dknqe', 'xxwsbyzh'],
        urlFragments: ['/world/rugby-championship/'],
        // OJO: 'rugby championship' es tambien el final de 'united rugby
        // championship' y de 'u20 rugby championship'. El match es por nombre
        // COMPLETO, no por fragmento, asi que estas dos no se tocan; el id
        // opaco es igual la via principal.
        names: ['rugby championship', 'the rugby championship'],
        countries: ['international', 'internacional', 'world', 'mundo'],
    },
    {
        rugbyPassCompetitionId: 219,
        tournamentIds: ['rugby-pacific-nations-cup'],
        urlFragments: ['/world/pacific-nations-cup/'],
        names: ['pacific nations cup'],
        countries: ['oceania', 'international', 'internacional', 'world', 'mundo'],
    },
    {
        rugbyPassCompetitionId: 114,
        tournamentIds: ['rugby-nations-championship'],
        urlFragments: ['/world/nations-championship/'],
        names: ['nations championship'],
        countries: ['international', 'internacional', 'world', 'mundo'],
    },
    {
        rugbyPassCompetitionId: 242,
        // No tiene ficha en `data/tournaments/rugby.ts`: va por URL y nombre.
        tournamentIds: [],
        urlFragments: ['/europe/champions-cup/', '/europe/european-champions-cup/'],
        names: ['champions cup', 'european champions cup', 'investec champions cup', 'heineken champions cup'],
        countries: ['europe', 'europa', 'international', 'internacional'],
    },
    {
        rugbyPassCompetitionId: 243,
        // MISMA TRAMPA QUE EL TOP 14: en el catalogo hay una
        // `rugby-wales-challenge-cup` que es la copa GALESA, otra competicion
        // que RugbyPass no trae. Por eso el pais es obligatorio y la URL apunta
        // a `/europe/`: sin eso, sumar la copa europea apagaba la galesa.
        tournamentIds: [],
        urlFragments: ['/europe/challenge-cup/', '/europe/european-challenge-cup/'],
        names: ['challenge cup', 'european challenge cup', 'epcr challenge cup'],
        countries: ['europe', 'europa', 'international', 'internacional'],
    },
] as const;

/** Minusculas, sin acentos y sin puntuacion: 'Pro D2.' y 'pro d2' son lo mismo. */
export function normalizeTournamentKey(value: unknown): string {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * LO QUE RUGBYPASS NO APAGA NUNCA, aunque algun dia publique algo parecido.
 *
 * Super Rugby Americas y el Americas Rugby Championship se quedan con la fuente
 * que ya los trae. Son las competiciones sudamericanas que a este sitio le
 * importan, y RugbyPass no esta en condiciones de reemplazarlas:
 *
 * - **Super Rugby Americas NO EXISTE en RugbyPass.** Medido sobre las 36
 *   competiciones del feed y las 32 del catalogo: hay "Super Rugby Pacific"
 *   (oid 205) y ninguna Americas. En los 299 equipos de `/teams/` no aparece un
 *   solo club del torneo — ni Dogos XV, ni Pampas, ni Penarol, ni Selknam, ni
 *   Yacare XV, ni Tarucas. Solo estan las selecciones mayores.
 * - **El ARC (oid 266) es dato abandonado** y ya esta en `RUGBYPASS_EXCLUDED`
 *   con su medicion: 0% de los partidos jugados tiene resultado.
 *
 * Esta lista existe para que la regla quede escrita y no dependa de que el
 * catalogo siga como hoy: si manana RugbyPass suma la Americas, sumarla a
 * `RUGBYPASS_COMPETITIONS` no alcanza para apagar la fuente actual — hay que
 * borrarla de aca a proposito, y hay un test que lo defiende.
 */
export const RUGBYPASS_NUNCA_REEMPLAZA: readonly { name: string; reason: string }[] = [
    {
        name: 'Super Rugby Americas',
        reason: 'RugbyPass no la publica: no esta entre sus 36 competiciones ni tiene ninguno de sus clubes en el catalogo de equipos',
    },
    {
        name: 'Americas Rugby Championship',
        reason: 'dato abandonado en RugbyPass: 0% de los partidos jugados tiene resultado (ver RUGBYPASS_EXCLUDED)',
    },
] as const;

/** Nombres, normalizados, de lo que nunca puede quedar reemplazado. */
const NUNCA_REEMPLAZA = new Set(
    RUGBYPASS_NUNCA_REEMPLAZA.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
);

/**
 * `true` si este torneo esta protegido y ninguna regla puede apagarlo.
 *
 * Se compara por nombre normalizado y tambien contra los segmentos separados
 * por `:`, porque FlashScore mete el pais ADENTRO del nombre en rugby
 * ("South America: Super Rugby Americas") — la misma razon por la que el
 * matcher de abajo parte el nombre.
 */
export function estaProtegido(match: SupersedableMatch): boolean {
    const nombres = [match.tournamentName, match.leagueName, match.tournament?.name]
        .map((v) => String(v ?? ''))
        .filter(Boolean);

    for (const nombre of nombres) {
        for (const parte of nombre.split(':')) {
            const limpio = parte.toLowerCase().normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
            if (NUNCA_REEMPLAZA.has(limpio)) return true;
        }
    }
    return false;
}

/**
 * Las dos formas en que llega un partido: plana (la fila de la cache y el
 * `Match` del proveedor) y anidada (el enriquecido que arma
 * `mapCachedToEnrichedMatch`, que guarda el torneo en `tournament`). Se aceptan
 * las dos porque el filtro corre en los dos lugares — al escribir y al leer.
 */
export interface SupersedableMatch {
    tournamentId?: unknown;
    tournamentName?: unknown;
    countryName?: unknown;
    tournamentUrl?: unknown;
    /** Como los nombra el `Match` que arma flashscore.ts. */
    leagueId?: unknown;
    leagueName?: unknown;
    leagueUrl?: unknown;
    tournament?: { id?: unknown; name?: unknown; country?: unknown; url?: unknown } | null;
}

/**
 * `true` si esta fila de FlashScore corresponde a un torneo que ya trae
 * RugbyPass, y por lo tanto no tiene que persistirse ni mostrarse.
 *
 * Solo se aplica a filas de OTRO proveedor: una fila de RugbyPass nunca se
 * reemplaza a si misma. Quien llame tiene que asegurarse de eso (o usar
 * `isSupersededByRugbyPass`, que ya descarta los ids `rp-`).
 */
/**
 * La entrada que reemplaza a este partido, o `null`. Devuelve la entrada y no un
 * booleano porque quien filtra necesita saber QUE competicion de RugbyPass lo
 * reemplaza, para poder chequear que esa competicion haya traido datos.
 */
export function supersedingEntry(match: SupersedableMatch): SupersededTournament | null {
    // La proteccion va PRIMERO: ninguna regla de reemplazo puede pasarle por
    // encima, ni siquiera una que empareje por id exacto.
    if (estaProtegido(match)) return null;

    const ids = [match.tournamentId, match.leagueId, match.tournament?.id]
        .map((v) => String(v ?? '').trim().toLowerCase())
        .filter(Boolean);
    const urls = [match.tournamentUrl, match.leagueUrl, match.tournament?.url]
        .map((v) => String(v ?? '').trim().toLowerCase())
        .filter(Boolean);

    // EL PAIS VIENE ADENTRO DEL NOMBRE.
    //
    // En rugby FlashScore no manda `country_name`, asi que el mapper cae a
    // 'International' y el pais real queda pegado al nombre:
    // "New Zealand: Bunnings NPC". Comparar el nombre entero fallaba por los dos
    // lados a la vez — ni el nombre ni el pais coincidian.
    //
    // Por eso el nombre se parte en segmentos y el pais se busca entre el campo
    // declarado Y esos mismos segmentos.
    const segments = String(match.tournamentName ?? match.leagueName ?? match.tournament?.name ?? '')
        .split(':')
        .map(normalizeTournamentKey)
        .filter(Boolean);
    const countryCandidates = new Set(
        [normalizeTournamentKey(match.countryName ?? match.tournament?.country), ...segments].filter(Boolean)
    );

    for (const entry of RUGBYPASS_SUPERSEDES) {
        if (ids.some((id) => entry.tournamentIds.includes(id))) return entry;
        if (urls.some((url) => entry.urlFragments.some((f) => url.includes(f)))) return entry;
        // El nombre NUNCA decide solo: tiene que aparecer tambien el pais. Es lo
        // que salva al Top 14 argentino, cuyo segmento de pais es 'argentina'.
        const nombreCoincide = segments.some((seg) => entry.names.includes(seg));
        const paisCoincide = entry.countries.some((c) => countryCandidates.has(c));
        if (nombreCoincide && paisCoincide) return entry;
    }
    return null;
}

export function matchesSupersededTournament(match: SupersedableMatch): boolean {
    return supersedingEntry(match) !== null;
}

/**
 * De `rp-comp-208` a 208. Es como se reconoce que una fila de RugbyPass cubre
 * una competicion determinada.
 */
export function rugbyPassCompetitionIdOf(match: SupersedableMatch & { id?: unknown }): number | null {
    if (!String(match.id ?? '').toLowerCase().startsWith(RUGBYPASS_MATCH_ID_PREFIX)) return null;
    const raw = String(match.tournamentId ?? match.tournament?.id ?? '');
    const m = raw.match(/^rp-comp-(\d+)$/i);
    return m ? Number(m[1]) : null;
}

/**
 * La forma en que lo usan el cron y el feed: una fila de RugbyPass pasa siempre;
 * una de cualquier otra fuente se apaga si su torneo ya lo cubre RugbyPass.
 */
export function isSupersededByRugbyPass(
    match: SupersedableMatch & { id?: unknown },
    /**
     * Competiciones de RugbyPass que SI trajeron datos en esta tanda. Sin este
     * argumento el reemplazo es incondicional, que es lo que dejo la pantalla en
     * blanco: se apago FlashScore antes de que existiera una sola fila `rp-`.
     * Pasarlo hace que el reemplazo solo ocurra cuando hay con que reemplazar.
     */
    covered?: ReadonlySet<number>
): boolean {
    if (String(match.id ?? '').toLowerCase().startsWith(RUGBYPASS_MATCH_ID_PREFIX)) return false;
    const entry = supersedingEntry(match);
    if (!entry) return false;
    if (!covered) return true;
    return covered.has(entry.rugbyPassCompetitionId);
}

/** Para el reporte del cron y para chequear que las dos listas no se separen. */
export function supersededCompetitionIds(): number[] {
    return RUGBYPASS_SUPERSEDES.map((s) => s.rugbyPassCompetitionId);
}

/**
 * Competiciones habilitadas de RugbyPass que todavia NO apagan ningun torneo de
 * FlashScore. Hoy es solo "Internationals" y esta explicado arriba; si aparece
 * otra, es que alguien sumo una competicion y se olvido del reemplazo.
 */
export function competitionsWithoutSupersede(): number[] {
    const conReemplazo = new Set(supersededCompetitionIds());
    return RUGBYPASS_COMPETITIONS
        .map((c) => c.id)
        .filter((id) => !conReemplazo.has(id));
}
