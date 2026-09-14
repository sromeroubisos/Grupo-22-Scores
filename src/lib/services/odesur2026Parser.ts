/**
 * Lectura de la API de resultados de los Juegos Suramericanos ODESUR
 * Santa Fe 2026 (Bornan Web Results).
 *
 * El sitio público (`results.santafe2026.org`) es una SPA de Vue que pega a
 * `back.results.santafe2026.org`. Es el MISMO software que publica los
 * resultados de la FISU, así que las rutas son las de `fisuRugbySevensParser`
 * con otro campeonato:
 *
 *   /s/{champ}/{lang}/{disc}/schedule/days           los días de una disciplina
 *   /s/{champ}/{lang}/{disc}/schedule/daily/{date}   las unidades de un día
 *   /s/{champ}/{lang}/ALL/schedule/day/{date}        el día de TODOS los deportes
 *   /s/{champ}/{lang}/{disc}/groups/{evento}         las zonas y su tabla
 *   /s/{champ}/{lang}/{disc}/results/{unidad}        la planilla de un partido
 *   /s/{champ}/{lang}/ALL/medals/standings           el medallero
 *
 * El envoltorio es el de la FISU (zlib servido como texto) y adentro hay UTF-8
 * válido: medido en bytes, `Hipódromo` trae `c3 b3` y `VILLAGRÁN` `c3 81`. Si
 * en una consola de Windows aparece `VILLAGR?N`, es la consola, no el dato.
 *
 * Dos cosas que sí cuestan caro si se pasan por alto:
 *
 *  1. `ALL/schedule/day/{fecha}` NO trae los equipos: los lados llegan vacíos.
 *     El cronograma con marcador es el de cada disciplina,
 *     `{disc}/schedule/daily/{fecha}`.
 *  2. El hockey informa el huso MAL: `-06:00` donde todo el resto dice
 *     `-03:00`. No se juega en otro huso — está medido contra el reloj: a las
 *     14:47 de Argentina, el partido que decía `14:00:00-06:00` estaba
 *     `RUNNING`. La hora de pared es la argentina y el offset es basura, así
 *     que se descarta y se fuerza `-03:00` para TODAS las disciplinas. Ver
 *     `parseOdesurDateTime`.
 *
 * Este módulo es PURO: entra JSON, sale dato. Sin red, sin caché, sin DOM. Es
 * lo que se puede probar con `node --test` (`odesur2026Parser.test.ts`).
 */

import type { MatchStatus } from '@/types/match';

export const ODESUR_PROVIDER = 'odesur';
export const ODESUR_RESULTS_URL = 'https://results.santafe2026.org';
export const ODESUR_API_URL = 'https://back.results.santafe2026.org';
export const ODESUR_LOGO_URL = `${ODESUR_RESULTS_URL}/favicon.png`;

/** Campeonato e idioma con los que se arma cada ruta de la API. */
export const ODESUR_CHAMP = 'JSUD2026';
export const ODESUR_LANG = 'en';

export const ODESUR_SEASON = '2026';
export const ODESUR_EVENT_NAME = 'Juegos Suramericanos Santa Fe 2026';
/** Primer y último día de los Juegos, según `schedule/matrix`. */
export const ODESUR_FIRST_DAY = '2026-09-13';
export const ODESUR_LAST_DAY = '2026-09-26';

export const ODESUR_MATCH_ID_PREFIX = 'odesur-match-';
export const ODESUR_TOURNAMENT_ID_PREFIX = 'odesur-2026-';
export const ODESUR_TEAM_ID_PREFIX = 'odesur-team-';

// --------------------------------------------------------------------------
// Disciplinas
// --------------------------------------------------------------------------

/**
 * Las disciplinas de equipo que entran al feed de partidos. Son las que la
 * API publica con la forma `{M|W}.TEAM{n}------`, que es la que se puede leer
 * como un partido: dos lados, un marcador, una zona.
 *
 * El tenis NO está acá a propósito. Es `SINGLES`/`DOUBLES`, no `TEAM`, y en
 * G22 tiene vertical propia (sets, `compareCode`, grilla de celdas) que no es
 * el modelo `Match`. Entra igual al apartado de los Juegos, que lee el
 * cronograma crudo y no necesita el modelo de partido.
 */
export type OdesurDisciplineCode = 'RU7' | 'HOC' | 'FBL' | 'HBL' | 'VVO' | 'VBV' | 'WPO';

export type OdesurDiscipline = {
    code: OdesurDisciplineCode;
    /** Deporte de G22 al que se suma en el feed. */
    sportId: string;
    /** Cómo se llama el deporte en la tarjeta. */
    nameEs: string;
    /**
     * Tamaño del equipo con el que la API arma el `EvKey`: `TEAM11` en hockey
     * y fútbol, `TEAM7` en seven, handball y waterpolo, `TEAM6` en vóley,
     * `TEAM2` en beach. Hace falta para reconstruir el `ResCode` desde el id
     * de un partido.
     */
    teamSize: number;
};

export const ODESUR_DISCIPLINES: Record<OdesurDisciplineCode, OdesurDiscipline> = {
    RU7: { code: 'RU7', sportId: 'rugby', nameEs: 'Rugby Seven', teamSize: 7 },
    HOC: { code: 'HOC', sportId: 'field-hockey', nameEs: 'Hockey', teamSize: 11 },
    FBL: { code: 'FBL', sportId: 'football', nameEs: 'Fútbol', teamSize: 11 },
    HBL: { code: 'HBL', sportId: 'handball', nameEs: 'Handball', teamSize: 7 },
    VVO: { code: 'VVO', sportId: 'volleyball', nameEs: 'Vóley', teamSize: 6 },
    VBV: { code: 'VBV', sportId: 'beach-volleyball', nameEs: 'Beach vóley', teamSize: 2 },
    WPO: { code: 'WPO', sportId: 'water-polo', nameEs: 'Waterpolo', teamSize: 7 },
};

export const ODESUR_DISCIPLINE_CODES = Object.keys(ODESUR_DISCIPLINES) as OdesurDisciplineCode[];

/** Las disciplinas de los Juegos que alimentan un deporte de G22. */
export function odesurDisciplinesForSport(sportId: string): OdesurDiscipline[] {
    const normalized = String(sportId || '').trim().toLowerCase();
    return ODESUR_DISCIPLINE_CODES
        .map((code) => ODESUR_DISCIPLINES[code])
        .filter((discipline) => discipline.sportId === normalized);
}

export function isOdesurSport(sportId: string): boolean {
    return odesurDisciplinesForSport(sportId).length > 0;
}

/**
 * ¿Es la copia de los Juegos que publica OTRO proveedor? FlashScore puede
 * listar los Suramericanos como una liga más; con los dos adentro, cada
 * partido saldría dos veces. Es el mismo criterio que `mergeHockeyProviders`
 * con el Mundial: de la otra fuente se cae SOLO su copia de los Juegos.
 */
export function isOdesurCopyLeague(leagueName: string | null | undefined): boolean {
    return /south american games|juegos (?:sur|sud)americanos|odesur/i.test(String(leagueName || ''));
}

// --------------------------------------------------------------------------
// Competencias (disciplina + género)
// --------------------------------------------------------------------------

export type OdesurGender = 'm' | 'w';

export type OdesurCompetition = {
    discipline: OdesurDiscipline;
    gender: OdesurGender;
    /** `EvKey` con el que la API nombra al evento (`W.TEAM11------------`). */
    eventKey: string;
    /** Id con el que el resto de la app referencia al torneo. */
    tournamentId: string;
    name: string;
    genderLabel: string;
    url: string;
};

/**
 * El `EvKey` tiene ancho fijo de 20: prefijo de género, punto, y el código del
 * evento rellenado con guiones. `W.TEAM11------------`.
 */
export function odesurEventKey(gender: OdesurGender, teamSize: number): string {
    return `${gender.toUpperCase()}.${`TEAM${teamSize}`.padEnd(18, '-')}`;
}

export function odesurCompetition(code: OdesurDisciplineCode, gender: OdesurGender): OdesurCompetition {
    const discipline = ODESUR_DISCIPLINES[code];
    const genderLabel = gender === 'm' ? 'Masculino' : 'Femenino';
    const eventKey = odesurEventKey(gender, discipline.teamSize);

    return {
        discipline,
        gender,
        eventKey,
        tournamentId: `${ODESUR_TOURNAMENT_ID_PREFIX}${code.toLowerCase()}-${gender}`,
        name: `${discipline.nameEs} ${genderLabel} — Suramericanos 2026`,
        genderLabel,
        url: `${ODESUR_RESULTS_URL}/#/discipline/${code}/schedule/by-event/${eventKey}`,
    };
}

export function odesurCompetitionsForSport(sportId: string): OdesurCompetition[] {
    return odesurDisciplinesForSport(sportId)
        .flatMap((discipline) => (['m', 'w'] as OdesurGender[]).map((gender) => odesurCompetition(discipline.code, gender)));
}

export function parseOdesurTournamentId(value: unknown): OdesurCompetition | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized.startsWith(ODESUR_TOURNAMENT_ID_PREFIX)) return null;

    const match = /^([a-z0-9]{3})-([mw])$/.exec(normalized.slice(ODESUR_TOURNAMENT_ID_PREFIX.length));
    if (!match) return null;

    const code = match[1].toUpperCase() as OdesurDisciplineCode;
    if (!ODESUR_DISCIPLINES[code]) return null;

    return odesurCompetition(code, match[2] as OdesurGender);
}

// --------------------------------------------------------------------------
// Delegaciones
// --------------------------------------------------------------------------

/**
 * Las 15 delegaciones de los Juegos: código ODESUR -> nombre en castellano. El
 * nombre PELADO es además el que resuelve la bandera en `teamLogoOverrides`,
 * así que se escribe como está allá.
 */
const ORGS: Record<string, string> = {
    ARG: 'Argentina',
    ARU: 'Aruba',
    BOL: 'Bolivia',
    BRA: 'Brasil',
    CHI: 'Chile',
    COL: 'Colombia',
    CUW: 'Curazao',
    ECU: 'Ecuador',
    GUY: 'Guyana',
    PAN: 'Panamá',
    PAR: 'Paraguay',
    PER: 'Perú',
    SUR: 'Surinam',
    URU: 'Uruguay',
    VEN: 'Venezuela',
};

export const ODESUR_ORG_CODES = Object.keys(ORGS).sort();

/**
 * Código ISO de cada delegación, para la bandera SVG de `public/flags`. Hace
 * falta porque el cajón de banderas curadas (`public/logos/selecciones`) tiene
 * solo 5 de las 15: los que no están ahí caen a la SVG por este código.
 */
const ORG_ISO2: Record<string, string> = {
    ARG: 'ar',
    ARU: 'aw',
    BOL: 'bo',
    BRA: 'br',
    CHI: 'cl',
    COL: 'co',
    CUW: 'cw',
    ECU: 'ec',
    GUY: 'gy',
    PAN: 'pa',
    PAR: 'py',
    PER: 'pe',
    SUR: 'sr',
    URU: 'uy',
    VEN: 've',
};

export function odesurOrgIso2(code: string | null): string | null {
    if (!code) return null;
    return ORG_ISO2[code.toUpperCase()] ?? null;
}

// --------------------------------------------------------------------------
// Los 60 deportes de los Juegos
// --------------------------------------------------------------------------

/**
 * Nombre en castellano de cada disciplina, con el código de la API. Es para
 * el medallero por deporte y la agenda del apartado de los Juegos, que
 * muestran las 60 aunque solo 7 entren al feed de partidos.
 */
const DISCIPLINE_NAMES: Record<string, string> = {
    ARC: 'Tiro con arco',
    ASK: 'Patinaje artístico',
    ATH: 'Atletismo',
    BDM: 'Bádminton',
    BMF: 'BMX freestyle',
    BMX: 'BMX racing',
    BOU: 'Bochas',
    BOX: 'Boxeo',
    BWL: 'Bowling',
    CLB: 'Escalada deportiva',
    CRD: 'Ciclismo de ruta',
    CSL: 'Canotaje slalom',
    CSP: 'Canotaje de velocidad',
    CTR: 'Ciclismo de pista',
    DIV: 'Clavados',
    EDR: 'Adiestramiento',
    EJP: 'Salto ecuestre',
    ELS: 'Esports',
    EVE: 'Concurso completo',
    FBA: 'Frontball',
    FBL: 'Fútbol',
    FEN: 'Esgrima',
    FGT: 'Trinquete',
    FRN: 'Frontón',
    GAR: 'Gimnasia artística',
    GLF: 'Golf',
    GRY: 'Gimnasia rítmica',
    GTR: 'Gimnasia en trampolín',
    HBL: 'Handball',
    HOC: 'Hockey',
    JUD: 'Judo',
    KTE: 'Karate',
    MPN: 'Pentatlón moderno',
    MTB: 'Ciclismo de montaña',
    OWS: 'Aguas abiertas',
    PDL: 'Pádel',
    RCB: 'Remo costero',
    ROW: 'Remo',
    RQL: 'Racquetball',
    RU7: 'Rugby Seven',
    SAL: 'Vela',
    SBL: 'Softbol',
    SHO: 'Tiro',
    SKB: 'Skateboarding',
    SQU: 'Squash',
    SRF: 'Surf',
    SSK: 'Patinaje de velocidad',
    SUP: 'Stand up paddle',
    SWA: 'Natación artística',
    SWM: 'Natación',
    TEN: 'Tenis',
    TKW: 'Taekwondo',
    TRI: 'Triatlón',
    TTE: 'Tenis de mesa',
    VBV: 'Beach vóley',
    VVO: 'Vóley',
    WLF: 'Levantamiento de pesas',
    WPO: 'Waterpolo',
    WRE: 'Lucha',
    WSK: 'Esquí náutico',
};

export function odesurDisciplineName(code: string, fallback = ''): string {
    return DISCIPLINE_NAMES[code.trim().toUpperCase()] || fallback || code;
}

/** Los 60 deportes, por nombre en castellano: el índice del apartado. */
export function odesurAllDisciplines(): Array<{ code: string; name: string }> {
    return Object.entries(DISCIPLINE_NAMES)
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * El vocabulario de las pruebas y las instancias, en castellano.
 *
 * No es un catálogo de las ~400 pruebas: es el puñado de palabras con que la
 * API las arma ("100m Freestyle", "Heat 2", "Round of 16"), medido sobre los
 * 1910 turnos de los 14 días. Lo que no está en la lista queda como vino, y
 * eso incluye a propósito los nombres propios de cada deporte (Kumite, K1,
 * ILCA 7, Keirin), que en castellano se dicen igual.
 *
 * El orden importa: lo largo antes que lo corto ("Freestyle Relay" antes que
 * "Relay", "Double Sculls" antes que "Double").
 */
const ES_VOCABULARY: Array<[RegExp, string]> = [
    // Pesos: "up to 54 kg", "57Kg", "49 kg to 57 kg".
    [/\bup to (\d+)\s*kg\b/gi, 'hasta $1 kg'],
    [/(\d+)\s*kg to (\d+)\s*kg\b/gi, '$1 a $2 kg'],
    [/(\d+)\s*kg\b/gi, '$1 kg'],
    // Postas y estilos: "4 x 100m Medley Relay" -> "Posta 4x100 m combinada".
    [/\b4 x (\d+)m Freestyle Relay\b/gi, 'posta 4x$1 m libre'],
    [/\b4 x (\d+)m Medley Relay\b/gi, 'posta 4x$1 m combinada'],
    [/\b4 x (\d+)m Relay Mixed\b/gi, 'posta 4x$1 m mixta'],
    [/\b4 x (\d+)m Relay\b/gi, 'posta 4x$1 m'],
    [/\bRelay\b/gi, 'posta'],
    [/\b(\d+)m Freestyle\b/gi, '$1 m libre'],
    [/\b(\d+)m Backstroke\b/gi, '$1 m espalda'],
    [/\b(\d+)m Breaststroke\b/gi, '$1 m pecho'],
    [/\b(\d+)m Butterfly\b/gi, '$1 m mariposa'],
    [/\b(\d+)m Medley\b/gi, '$1 m combinado'],
    [/\b(\d+)m Hurdles\b/gi, '$1 m con vallas'],
    [/\b(\d+)m Steeplechase\b/gi, '$1 m con obstáculos'],
    // Clavados y tiro: el aparato adelante, la distancia atrás.
    [/\bSynchroni[sz]ed (\d+)m Springboard\b/gi, 'trampolín $1 m sincronizado'],
    [/\bSynchroni[sz]ed\b/gi, 'sincronizado'],
    [/\b(\d+)m Springboard\b/gi, 'trampolín $1 m'],
    [/\b(\d+)m Platform\b/gi, 'plataforma $1 m'],
    [/\b(\d+)m Air Pistol\b/gi, 'pistola de aire $1 m'],
    [/\b(\d+)m Air Rifle\b/gi, 'rifle de aire $1 m'],
    [/\b(\d+)m Rapid Fire Pistol\b/gi, 'pistola tiro rápido $1 m'],
    [/\b(\d+)m (?:Rifle Three Positions|Three Positions Rifle)\b/gi, 'rifle tres posiciones $1 m'],
    [/\b(\d+)m Pistol\b/gi, 'pistola $1 m'],
    // Distancias sueltas: "10,000m" -> "10.000 m", "10km" -> "10 km".
    [/\b(\d{1,2})[,.](\d{3})\s*m\b/gi, '$1.$2 m'],
    [/\b(\d+)m\b/g, '$1 m'],
    [/\b(\d+)km\b/gi, '$1 km'],
    // Atletismo.
    [/\bHalf Marathon Walk\b/gi, 'media maratón de marcha'],
    [/\bHigh Jump\b/gi, 'salto en alto'],
    [/\bLong Jump\b/gi, 'salto en largo'],
    [/\bTriple Jump\b/gi, 'salto triple'],
    [/\bPole Vault\b/gi, 'salto con garrocha'],
    [/\bShot Put\b/gi, 'lanzamiento de bala'],
    [/\bDiscus(?: Throw)?\b/gi, 'lanzamiento de disco'],
    [/\bJavelin Throw\b/gi, 'lanzamiento de jabalina'],
    [/\bHammer Throw\b/gi, 'lanzamiento de martillo'],
    [/\bDecathlon\b/gi, 'decatlón'],
    [/\bHeptathlon\b/gi, 'heptatlón'],
    // Gimnasia.
    [/\bIndividual All-Around\b/gi, 'individual general'],
    [/\bFloor Exercise\b/gi, 'suelo'],
    [/\bBalance Beam\b/gi, 'viga de equilibrio'],
    [/\bAsymmetrical Bars\b/gi, 'paralelas asimétricas'],
    [/\bVault\b/gi, 'salto'],
    [/\bIndividual Ball\b/gi, 'pelota'],
    [/\bIndividual Clubs\b/gi, 'mazas'],
    [/\bIndividual Hoop\b/gi, 'aro'],
    [/\bIndividual Ribbon\b/gi, 'cinta'],
    // Esgrima y lucha. `\b` no ve la "É" como letra: va con lookaround Unicode.
    [/\bFoil\b/gi, 'florete'],
    [/(?<!\p{L})[ÉE]p[ée]e(?!\p{L})/giu, 'espada'],
    [/\bSabre\b/gi, 'sable'],
    [/\bGreco-Roman\b/gi, 'grecorromana'],
    // Ciclismo.
    [/\bRoad Race\b/gi, 'ruta'],
    [/\bIndividual Time Trial\b/gi, 'contrarreloj individual'],
    [/\bTime Trial\b/gi, 'contrarreloj'],
    [/\bTeam Pursuit\b/gi, 'persecución por equipos'],
    [/\bTeam Sprint\b/gi, 'velocidad por equipos'],
    [/\bIndividual Sprint\b/gi, 'velocidad individual'],
    [/\bPoints Race\b/gi, 'carrera por puntos'],
    [/\bElimination Race\b/gi, 'eliminación'],
    [/(?<!Direct )\bElimination\b/gi, 'eliminación'],
    [/\bPoints\b/gi, 'puntos'],
    [/\bDistance\b/gi, 'distancia'],
    [/\bScratch Race\b/gi, 'scratch'],
    [/\bTempo Race\b/gi, 'tempo'],
    // Remo.
    [/\bLightweight Double Sculls\b/gi, 'doble par peso ligero'],
    [/\bIndividual Lightweight\b/gi, 'single peso ligero'],
    [/\bSingle Sculls\b/gi, 'single'],
    [/\bQuadruple Sculls\b/gi, 'cuádruple par'],
    [/\bDouble Sculls\b/gi, 'doble par'],
    [/\bPair\b(?= \()/gi, 'dos sin timonel'],
    [/\bFour\b(?= \()/gi, 'cuatro sin timonel'],
    [/\bEight\b(?= \()/gi, 'ocho con timonel'],
    // Ecuestre, vela, deportes de tabla y de salón.
    [/\bTeam Dressage\b/gi, 'por equipos'],
    [/\bIndividual Dressage\b/gi, 'individual'],
    [/\bTeam Jumping\b/gi, 'salto por equipos'],
    [/\bIndividual Jumping\b/gi, 'salto individual'],
    [/\bEventing Individual\b/gi, 'completo individual'],
    [/\bEventing Team\b/gi, 'completo por equipos'],
    [/\bOne-person Dinghy\b/gi, 'bote individual'],
    [/\b2-person Snipe Boat - Mixed\b/gi, 'snipe doble mixto'],
    [/\bWindsurfing\b/gi, 'windsurf'],
    [/\bStreet Skateboarding\b/gi, 'street'],
    [/\bCross-country\b/gi, 'cross country'],
    [/\bSolo Dance\b/gi, 'danza solo'],
    [/\bFree Dance\b/gi, 'danza libre'],
    [/\bStyle Dance\b/gi, 'danza de estilo'],
    [/\bShort Program\b/gi, 'programa corto'],
    [/\bLong Program\b/gi, 'programa libre'],
    [/\bTechnical Routine\b/gi, 'rutina técnica'],
    [/\bFree Routine\b/gi, 'rutina libre'],
    [/\bAcrobatic Routine\b/gi, 'rutina acrobática'],
    [/\bDuets?\b/gi, 'dúo'],
    [/\bCompound Mixed Archery Team\b/gi, 'compuesto equipo mixto'],
    [/\bTeam Archery Compound\b/gi, 'compuesto por equipos'],
    [/\bRecurve\b/gi, 'recurvo'],
    [/\bCompound\b/gi, 'compuesto'],
    [/\bSpeed\b/gi, 'velocidad'],
    [/\bLead\b/gi, 'dificultad'],
    [/\bMixed Teams\b/gi, 'equipos mixtos'],
    [/\bMixed Team\b/gi, 'equipo mixto'],
    [/\bDoubles?\b/gi, 'dobles'],
    [/\b(?:Team|Teams) General\b/gi, 'equipos general'],
    [/\bTeams\b/gi, 'equipos'],
    [/\b(\S+) Team\b(?! Final)/gi, '$1 por equipos'],
    [/\bTeam (?!Final\b)(\S+)/gi, '$1 por equipos'],
    [/\b(?:Overall|Total)\b/gi, 'general'],
    [/\bTechnical\b/gi, 'técnica'],
    [/\bFreestyle\b/gi, 'libre'],
    [/\bFree\b/gi, 'libre'],
    // Instancias. Las llaves se dicen como en el fútbol: octavos, cuartos, semi.
    [/\bFinals? - Gold Medal Match\b/gi, 'por el oro'],
    [/\bFinals? - Bronze Medal Match\b/gi, 'por el bronce'],
    [/\bFinals - Jumping Test\b/gi, 'final de salto'],
    [/\b(?:Gold Medal (?:Match|Bout)|For Gold)\b/gi, 'por el oro'],
    [/\b(?:Bronze Medal (?:Matches|Match|Bout)|For Bronze)\b/gi, 'por el bronce'],
    [/\bBronze\s*[–-]\s*3\.º vs 4\.º/gi, 'por el bronce'],
    [/\bBronze\b/gi, 'bronce'],
    [/\bPreliminaries - Round of 16\b/gi, 'octavos de final'],
    [/(?:\bRound of 16|\b1\/8 Finals|\b1\/8 Round|\bTable of 16)\b/gi, 'octavos de final'],
    [/(?:\bRound of 32|\b1\/16 Round|\bTable of 32)\b/gi, '16avos de final'],
    [/\bRound of 64\b/gi, '32avos de final'],
    [/\bQuarter-?finals?\b/gi, 'cuartos de final'],
    [/\bSemi-?finals?\b/gi, 'semifinal'],
    [/\bFinals\b/gi, 'final'],
    [/\bQualification Race\b/gi, 'carrera de clasificación'],
    [/\b(?:Qualification|Qualifying|Qualify Round)\b/gi, 'clasificación'],
    [/\bFencing Seeding Round\b/gi, 'ronda de clasificación'],
    [/\bFencing Direct Elimination\b/gi, 'eliminación directa'],
    [/\bRanking Round\b/gi, 'ronda de clasificación'],
    [/\bPreliminary Round\b/gi, 'ronda preliminar'],
    [/\b(?:Pool Stage|Group Play Stage|Group Stage)\b/gi, 'fase de grupos'],
    [/\bRound Robin\b/gi, 'todos contra todos'],
    [/\bRepechage\b/gi, 'repechaje'],
    [/\bMedal Race\b/gi, 'regata por medallas'],
    [/\bRace (\d+(?:, \d+)*) and (\d+)\b/gi, 'regatas $1 y $2'],
    [/\bFirst Round\b/gi, 'primera ronda'],
    [/\bFirst\s+Competition\b/gi, 'primera competencia'],
    [/\bSecond Competition\b/gi, 'segunda competencia'],
    [/\bThird Competition\b/gi, 'tercera competencia'],
    [/\bRound one\b/gi, 'ronda 1'],
    [/\bRound two\b/gi, 'ronda 2'],
    [/\bTeam Final\b/gi, 'final por equipos'],
    [/\bIndividual Final\b/gi, 'final individual'],
    [/\bCross Country Test\b/gi, 'prueba de cross country'],
    [/\bDressage Test\b/gi, 'prueba de adiestramiento'],
    [/\bFor Place (\d+)-(\d+)\b/gi, 'puestos $1-$2'],
    [/\bHeats\b/gi, 'series'],
    [/\bHeat\b/gi, 'serie'],
    [/\bMotos\b/gi, 'mangas'],
    [/\bLaser Run\b/gi, 'laser run'],
    [/\bFirst Run\b/gi, 'primera pasada'],
    [/\bSecond Run\b/gi, 'segunda pasada'],
    [/\bRun\b/g, 'pasada'],
    [/\bRace\b/gi, 'carrera'],
    [/\bBalls\b/gi, 'bolas'],
    [/\bJump\b/gi, 'salto'],
    [/\bTricks\b/gi, 'trucos'],
    [/\bMatch\b/gi, 'partido'],
    [/\bGame\b/gi, 'partido'],
    [/\bBout\b/gi, 'combate'],
    [/\bRound\b/gi, 'ronda'],
    [/\bDay\b/gi, 'día'],
    [/\bStage\b/gi, 'etapa'],
    [/\bSubdivision\b/gi, 'subdivisión'],
    [/\bDecider\b/gi, 'desempate'],
    [/\bObstacle\b/gi, 'obstáculos'],
    [/\bSwimming\b/gi, 'natación'],
    [/\b(?:Group|Pool)\b/gi, 'grupo'],
    // Una prueba que ya dijo si es individual lo dice en minúscula al final.
    [/(?<=\S) Individual\b/g, ' individual'],
];

/**
 * Un texto de la API en castellano, con mayúscula inicial.
 *
 *   "Round of 16"            -> "Octavos de final"
 *   "4 x 100m Medley Relay"  -> "Posta 4x100 m combinada"
 */
export function odesurEs(raw: string): string {
    let text = raw.trim();
    if (!text) return '';
    for (const [pattern, replacement] of ES_VOCABULARY) {
        text = text.replace(pattern, replacement);
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * El nombre de una prueba con el género en castellano adelante y la prueba
 * traducida por `odesurEs`.
 *
 *   "Women's 1m Springboard" -> "Femenino · Trampolín 1 m"
 */
export function odesurEventName(raw: string): string {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    // El género suele ir adelante ("Men's 100m"), pero hay pruebas que lo
    // escriben al final o en el medio ("1X Men's", "Shiai Men's -60 Kg") y
    // otras que lo repiten ("Men's EA SPORT FC Men's"). Se toma el primero y
    // se sacan todos. "Mixed" solo cuenta adelante: en "Trap Mixed Team" es el
    // equipo, no la rama.
    const found = /(?:^|\s)(Men's|Women's)(?=\s|$)/i.exec(trimmed);
    const mixed = /^Mixed\s+/i.test(trimmed);
    if (!found && !mixed) return odesurEs(trimmed);
    const gender = mixed ? 'Mixto' : (/^men's$/i.test(found?.[1] ?? '') ? 'Masculino' : 'Femenino');
    const rest = trimmed
        .replace(/^Mixed\s+/i, '')
        .replace(/(?:^|\s)(?:Men's|Women's)(?=\s|$)/gi, ' ')
        .trim();
    // En los deportes de equipo la prueba es "Men's Team": el deporte ya lo
    // dice la tarjeta, así que queda la rama sola.
    if (!rest || /^team$/i.test(rest)) return gender;
    return `${gender} · ${odesurEs(rest)}`;
}

export function odesurOrgName(code: string | null, fallback = ''): string {
    if (!code) return fallback;
    return ORGS[code.toUpperCase()] || fallback || code;
}

export function odesurTeamId(code: string | null, fallbackName: string): string {
    if (code) return `${ODESUR_TEAM_ID_PREFIX}${code.toUpperCase()}`;
    const slug = fallbackName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return `${ODESUR_TEAM_ID_PREFIX}${slug || 'tbd'}`;
}

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------

/**
 * Vocabulario de estados de Bornan, tal cual aparece en el bundle del sitio.
 * `PROVISIONAL` es el fixture todavía sin confirmar (el seven lo muestra así
 * días antes de jugarse): es programado, no un estado raro.
 */
const SCHEDULED_STATUSES = new Set(['START_LIST', 'SCHEDULED', 'GETTING_READY', 'UNCONFIRMED', 'PROVISIONAL']);
const LIVE_STATUSES = new Set(['RUNNING', 'LIVE', 'INTERMEDIATE', 'INTERRUPTED']);
const FINISHED_STATUSES = new Set(['FINISHED', 'UNOFFICIAL', 'OFFICIAL', 'PROTESTED']);
const POSTPONED_STATUSES = new Set(['POSTPONED', 'RESCHEDULED', 'DELAYED']);

export function classifyOdesurStatus(status: string, hasScore: boolean): MatchStatus {
    const token = status.trim().toUpperCase();
    if (FINISHED_STATUSES.has(token)) return 'final';
    if (LIVE_STATUSES.has(token)) return 'live';
    if (POSTPONED_STATUSES.has(token)) return 'postponed';
    if (token === 'CANCELLED' || token === 'CANCELED') return 'cancelled';
    if (SCHEDULED_STATUSES.has(token) || token === '') return 'scheduled';
    // Estado desconocido: si ya hay marcador, se está jugando.
    return hasScore ? 'live' : 'scheduled';
}

/**
 * Lo que va en el reloj de un partido en juego. Los deportes no comparten la
 * forma del período: hockey y waterpolo juegan cuartos, el vóley sets, el
 * resto tiempos.
 */
export function odesurLiveLabel(
    status: string,
    currentPeriod: number | null,
    code: OdesurDisciplineCode,
): string {
    const token = status.trim().toUpperCase();
    if (token === 'INTERMEDIATE') return 'Entretiempo';
    if (token === 'INTERRUPTED') return 'Interrumpido';

    if (currentPeriod && currentPeriod > 0) {
        if (code === 'HOC' || code === 'WPO') return `${currentPeriod}C`;
        if (code === 'VVO' || code === 'VBV') return `Set ${currentPeriod}`;
        if (currentPeriod <= 2) return `${currentPeriod}T`;
        return 'Alargue';
    }

    return 'En juego';
}

// --------------------------------------------------------------------------
// Etapas
// --------------------------------------------------------------------------

/**
 * Traduce la instancia que publica la API (`PhaseDescA` + `UnitDescA`). Bornan
 * escribe las zonas como "Group A" y las llaves en inglés.
 */
export function odesurStageName(phaseDescA: string, unitDescA: string): { pool: string | null; stageName: string } {
    const phase = phaseDescA.trim();
    const unit = unitDescA.trim();

    // Una letra o un número: "Group Stage" no es la zona "STAGE".
    const group = /^(?:Group|Pool)\s+([A-Za-z]|\d{1,2})$/.exec(phase);
    if (group) {
        const letter = group[1].toUpperCase();
        return { pool: letter, stageName: `Grupo ${letter}` };
    }

    if (/^(?:gold medal|finals?)(?: match| game)?$/i.test(phase)) {
        if (/bronze/i.test(unit)) return { pool: null, stageName: 'Tercer puesto' };
        return { pool: null, stageName: 'Final' };
    }
    if (/bronze/i.test(phase)) return { pool: null, stageName: 'Tercer puesto' };
    if (/^semi-?finals?$/i.test(phase)) return { pool: null, stageName: 'Semifinal' };
    if (/^quarter-?finals?$/i.test(phase)) return { pool: null, stageName: 'Cuartos de final' };
    if (/^group stage$/i.test(phase) || /^preliminary round(?: - pool [a-z])?$/i.test(phase)) {
        return { pool: null, stageName: 'Fase de grupos' };
    }

    // "Classification 5th-8th" (cruce) y "Classification 5th-6th" (un puesto).
    // Algunas disciplinas escriben el ordinal con "°": "Classification 9°-12°".
    const placing = /^(?:Placing|Classification)\s+(\d+)(?:st|nd|rd|th|°|º)?\s*-\s*(\d+)(?:st|nd|rd|th|°|º)?$/i.exec(phase);
    if (placing) {
        const from = Number(placing[1]);
        const to = Number(placing[2]);
        return to - from === 1
            ? { pool: null, stageName: `${from}° puesto` }
            : { pool: null, stageName: `Puestos ${from}-${to}` };
    }

    return { pool: null, stageName: odesurEs(phase || unit) };
}

/** "First Quarter" / "1st Half" / "Set 2" -> como se leen al lado del marcador. */
export function odesurPeriodName(raw: string, code: OdesurDisciplineCode): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    // Bornan rotula el cierre de cada cuarto de hockey con el hito que marca
    // ("Halftime", "Full Time"), no con su número. Se traduce por posición.
    const quarters: Record<string, string> = {
        'first quarter': '1C',
        'second quarter': '2C',
        halftime: '2C',
        'third quarter': '3C',
        'fourth quarter': '4C',
        'full time': '4C',
    };
    const quarter = quarters[trimmed.toLowerCase()];
    if (quarter && (code === 'HOC' || code === 'WPO')) return quarter;

    if (/^1st\s+half$/i.test(trimmed) || trimmed.toUpperCase() === 'P1') return 'Primer tiempo';
    if (/^2nd\s+half$/i.test(trimmed) || trimmed.toUpperCase() === 'P2') return 'Segundo tiempo';
    if (/^set\s*\d+$/i.test(trimmed)) return trimmed.replace(/^set\s*/i, 'Set ');
    if (/shoot ?-?out/i.test(trimmed)) return 'Definición';
    if (/extra/i.test(trimmed)) return 'Alargue';
    return trimmed;
}

// --------------------------------------------------------------------------
// Tipos normalizados
// --------------------------------------------------------------------------

export type OdesurUnit = {
    /**
     * `ResCode` completo, la llave con la que la API nombra al partido. Vacío
     * en un partido provisional: Bornan la asigna recién al confirmarlo.
     */
    resCode: string;
    /** Fixture publicado sin llave todavía (ver `parseOdesurUnit`). */
    provisional: boolean;
    code: OdesurDisciplineCode;
    gender: OdesurGender;
    /** Código de fase (`GP01`, `SFNL`) y número de unidad (`000100`). */
    phaseCode: string;
    unitCode: string;
    /** Instante de inicio en UTC (ISO), ya con el huso corregido. */
    startsAtIso: string | null;
    dateTimeRaw: string;
    homeCode: string | null;
    awayCode: string | null;
    homeName: string;
    awayName: string;
    pool: string | null;
    stageName: string;
    unitName: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
    state: MatchStatus;
    isLive: boolean;
    venue: string;
    /** Si la unidad reparte medallas (final, bronce). */
    medal: boolean;
};

export type OdesurStandingRow = {
    position: number | null;
    code: string | null;
    name: string;
    played: number | null;
    won: number | null;
    lost: number | null;
    tied: number | null;
    pointsFor: number | null;
    pointsAgainst: number | null;
    diff: number | null;
    points: number | null;
};

export type OdesurGroup = {
    /** Código de fase del grupo (`GP01`). */
    phaseCode: string;
    gender: OdesurGender;
    name: string;
    rows: OdesurStandingRow[];
};

export type OdesurPeriod = {
    order: number;
    name: string;
    home: number | null;
    away: number | null;
};

export type OdesurRosterPlayer = {
    name: string;
    bib: string;
    position: string;
};

export type OdesurResultDetail = {
    status: string;
    state: MatchStatus;
    homeScore: number | null;
    awayScore: number | null;
    currentPeriod: number | null;
    periods: OdesurPeriod[];
    homeRoster: OdesurRosterPlayer[];
    awayRoster: OdesurRosterPlayer[];
};

export type OdesurAction = {
    /**
     * Tipo canónico del catálogo de eventos de la app (`goal`, `try`,
     * `yellow_card`…), el que dibuja `MatchTimeline`. Null para lo que la
     * cronología no muestra (un cambio de arquero, un tiro que no entró).
     */
    type: string | null;
    period: string;
    order: number;
    /** Minuto de juego, ya como número. */
    minute: number | null;
    timestamp: string;
    /** "Gol", "Córner corto", "Tarjeta verde"… en castellano cuando se puede. */
    label: string;
    result: string;
    scoreHome: number | null;
    scoreAway: number | null;
    side: 'home' | 'away' | null;
    playerName: string;
    playerBib: string;
};

export type OdesurMedalCount = {
    code: string;
    name: string;
    gold: number;
    silver: number;
    bronze: number;
    total: number;
};

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : '');
}

function toInt(value: unknown): number | null {
    const raw = asString(value).trim().replace('+', '');
    if (!/^-?\d+$/.test(raw)) return null;
    return Number(raw);
}

function orgCode(value: unknown): string | null {
    const raw = asString(value).trim().toUpperCase();
    return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

function extension(list: unknown, code: string): string {
    if (!Array.isArray(list)) return '';
    for (const item of list) {
        const record = asRecord(item);
        if (record && asString(record.Code) === code) return asString(record.Value);
    }
    return '';
}

/**
 * El huso de las sedes. Todas quedan en Santa Fe (Santa Fe, Rosario, Rafaela).
 */
export const ODESUR_UTC_OFFSET = '-03:00';

/**
 * La hora de los Juegos, en UTC.
 *
 * Se descarta el huso que informa la API y se fuerza el de Argentina. No es
 * una preferencia: el hockey publica `-06:00` y todo el resto `-03:00`, con
 * todas las sedes en la misma provincia. Medido contra el reloj (un partido de
 * las `14:00-06:00` corriendo a las 14:47 de Argentina), lo bueno es la hora
 * de pared y lo que sobra es el offset. Tomar el instante tal cual correría el
 * hockey tres horas.
 */
export function parseOdesurDateTime(raw: string): string | null {
    const wall = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)/.exec(raw.trim());
    if (!wall) return null;
    const parsed = new Date(`${wall[1]}${ODESUR_UTC_OFFSET}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// --------------------------------------------------------------------------
// Parsers
// --------------------------------------------------------------------------

/**
 * Separa `W.TEAM11------------.GP01.000100--` en evento, fase y unidad. A
 * diferencia de la FISU, acá conviven disciplinas con distinto tamaño de
 * equipo, así que el evento se lee y se valida contra el catálogo en vez de
 * darlo por sentado.
 */
export function splitResCode(resCode: string): { eventKey: string; phaseCode: string; unitCode: string } | null {
    const match = /^([MWX]\.[A-Z0-9]+-*)\.([A-Z0-9-]{2,6})\.(\d{6})--$/.exec(resCode.trim());
    if (!match) return null;
    return { eventKey: match[1], phaseCode: match[2], unitCode: match[3] };
}

/**
 * La `Key` de un partido provisional: evento y fase, sin unidad
 * (`W.TEAM6-------------.----`, `M.TEAM11------------.GPA-`).
 */
export function splitProvisionalKey(key: string): { eventKey: string; phaseCode: string } | null {
    const match = /^([MWX]\.[A-Z0-9]+-*)\.([A-Z0-9-]{2,6})$/.exec(key.trim());
    if (!match) return null;
    return { eventKey: match[1], phaseCode: match[2] };
}

/** "2026-09-15T10:00:00-03:00" -> "202609151000": la hora de pared, compacta. */
export function odesurWallStamp(raw: string): string | null {
    const wall = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw.trim());
    return wall ? `${wall[1]}${wall[2]}${wall[3]}${wall[4]}${wall[5]}` : null;
}

/** La competencia (disciplina + género) a la que corresponde un `EvKey`. */
export function competitionOfEventKey(
    code: OdesurDisciplineCode,
    eventKey: string,
): OdesurCompetition | null {
    for (const gender of ['m', 'w'] as OdesurGender[]) {
        const competition = odesurCompetition(code, gender);
        if (competition.eventKey === eventKey) return competition;
    }
    return null;
}

/**
 * Una unidad del cronograma al modelo propio. Devuelve null para lo que no es
 * un partido de equipo de una disciplina que seguimos: otra disciplina, una
 * fila de fase, un evento individual o un `ResCode` con otra forma.
 *
 * Ojo con el fixture `PROVISIONAL`: todo partido futuro viene SIN `ResCode`
 * —con equipos y horario, pero sin llave— hasta que la mesa lo confirma, en
 * general el mismo día. Dejarlo afuera era esconder el fixture entero del
 * vóley, el fútbol y el handball hasta que se juegan. Entra como provisional
 * cuando se sabe quién juega (los dos países) y cuándo; su id se arma con eso
 * (ver `odesurMatchIdOf`). Un "Por definir contra Por definir" no tiene
 * identidad: queda en la agenda y no en el feed.
 */
export function parseOdesurUnit(item: unknown): OdesurUnit | null {
    const record = asRecord(item);
    if (!record) return null;
    if (record.IsPhase === true) return null;

    const code = asString(record.Disc).trim().toUpperCase() as OdesurDisciplineCode;
    if (!ODESUR_DISCIPLINES[code]) return null;

    const home = asRecord(record.Home);
    const away = asRecord(record.Away);
    const homeCode = orgCode(home?.Org);
    const awayCode = orgCode(away?.Org);
    const dateTimeRaw = asString(record.DateTimeRaw);

    const confirmed = splitResCode(asString(record.ResCode) || asString(record.Key));
    const pending = confirmed ? null : splitProvisionalKey(asString(record.Key));
    if (!confirmed && !pending) return null;
    // Un provisional sin los dos países o sin hora no se puede identificar.
    if (pending && (!homeCode || !awayCode || !odesurWallStamp(dateTimeRaw))) return null;

    const eventKey = confirmed?.eventKey ?? pending?.eventKey ?? '';
    const competition = competitionOfEventKey(code, eventKey);
    if (!competition) return null;

    const homeScore = toInt(home?.Result);
    const awayScore = toInt(away?.Result);
    const status = asString(record.Status);
    const { pool, stageName } = odesurStageName(asString(record.PhaseDescA), asString(record.UnitDescA));
    const medal = asString(record.Medal).trim();

    return {
        resCode: confirmed ? `${confirmed.eventKey}.${confirmed.phaseCode}.${confirmed.unitCode}--` : '',
        provisional: !confirmed,
        code,
        gender: competition.gender,
        phaseCode: confirmed?.phaseCode ?? pending?.phaseCode ?? '',
        unitCode: confirmed?.unitCode ?? '',
        startsAtIso: parseOdesurDateTime(dateTimeRaw),
        dateTimeRaw,
        homeCode,
        awayCode,
        homeName: homeCode
            ? odesurOrgName(homeCode, asString(home?.Name))
            : (asString(home?.Name).trim() || 'Por definir'),
        awayName: awayCode
            ? odesurOrgName(awayCode, asString(away?.Name))
            : (asString(away?.Name).trim() || 'Por definir'),
        pool,
        stageName,
        unitName: asString(record.UnitDescA) || asString(record.UnitDesc),
        homeScore,
        awayScore,
        status,
        state: classifyOdesurStatus(status, homeScore !== null && awayScore !== null),
        isLive: record.IsLive === true,
        venue: asString(record.VenueDesc) || asString(record.LocDesc),
        medal: medal !== '' && medal !== '0',
    };
}

/** El cronograma de un día, filtrado a los partidos de equipo que seguimos. */
export function parseOdesurDaily(json: unknown): OdesurUnit[] {
    if (!Array.isArray(json)) return [];
    return json
        .map((item) => parseOdesurUnit(item))
        .filter((unit): unit is OdesurUnit => unit !== null);
}

/** Los días con actividad de una disciplina (`schedule/days`). */
export function parseOdesurDays(json: unknown): string[] {
    if (!Array.isArray(json)) return [];
    return json
        .map((item) => asString(asRecord(item)?.raw).trim())
        .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
}

/**
 * Las zonas de un evento con su tabla (`groups/{evento}`).
 *
 * Cada zona trae la tabla OFICIAL armada en `Competitors` (`Rk`, puntos,
 * jugados, a favor, en contra). Se lee tal cual y no se recalcula: `Rk` ya
 * aplica los desempates del reglamento de cada disciplina, que acá no se
 * reproducen, y una tabla calculada por nosotros podría contradecir a la de
 * la mesa en el primer empate.
 */
export function parseOdesurGroups(json: unknown, gender: OdesurGender): OdesurGroup[] {
    const groups = asRecord(json)?.Groups;
    if (!Array.isArray(groups)) return [];

    return groups
        .map((item) => {
            const group = asRecord(item);
            if (!group) return null;

            const phaseCode = asString(group.Key).split('.')[1] || '';
            const { stageName } = odesurStageName(asString(group.DescA), '');

            const rows = (Array.isArray(group.Competitors) ? group.Competitors : [])
                .map((entry) => parseOdesurStandingRow(entry))
                .filter((row): row is OdesurStandingRow => row !== null)
                .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.name.localeCompare(b.name, 'es'));

            return { phaseCode, gender, name: stageName || asString(group.DescA), rows };
        })
        .filter((group): group is OdesurGroup => group !== null && group.rows.length > 0);
}

function parseOdesurStandingRow(item: unknown): OdesurStandingRow | null {
    const record = asRecord(item);
    if (!record) return null;

    const code = orgCode(record.Org);
    const name = odesurOrgName(code, asString(record.Name));
    if (!name) return null;

    const pointsFor = toInt(record.For);
    const pointsAgainst = toInt(record.Against);

    return {
        position: toInt(record.Rk) ?? toInt(record.RkPo),
        code,
        name,
        played: toInt(record.Played),
        won: toInt(record.Won),
        lost: toInt(record.Lost),
        tied: toInt(record.Tied),
        pointsFor,
        pointsAgainst,
        diff: toInt(record.Diff)
            ?? (pointsFor !== null && pointsAgainst !== null ? pointsFor - pointsAgainst : null),
        points: toInt(record.Points),
    };
}

/**
 * La planilla de un partido (`results/{unidad}`). Los planteles vienen en
 * `Competitors`, uno por lado y en el orden local/visitante.
 */
export function parseOdesurResultDetail(json: unknown, code: OdesurDisciplineCode): OdesurResultDetail | null {
    const record = asRecord(json);
    if (!record) return null;

    const info = asRecord(record.Info);
    const results = asRecord(record.Results);
    if (!info && !results) return null;

    const [rawHome, rawAway] = asString(results?.Result).split('-');
    const homeScore = toInt(rawHome);
    const awayScore = toInt(rawAway);
    const status = asString(info?.Status);

    const sides = (Array.isArray(record.Competitors) ? record.Competitors : [])
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Json => entry !== null);

    const rosterOf = (index: number): OdesurRosterPlayer[] => {
        const members = sides[index]?.Members;
        if (!Array.isArray(members)) return [];
        return members
            .map((member) => {
                const player = asRecord(member);
                const name = asString(player?.Name).trim();
                if (!name) return null;
                return {
                    // "VILLAGRÁN Fernanda" -> "Fernanda Villagrán", como el resto de las fichas.
                    name: odesurPersonName(name),
                    bib: asString(player?.Bib).trim(),
                    position: asString(player?.PosDesc).trim(),
                };
            })
            .filter((player): player is OdesurRosterPlayer => player !== null);
    };

    const periods = (Array.isArray(results?.Periods) ? results.Periods : [])
        .map((item, index) => {
            const period = asRecord(item);
            if (!period) return null;
            return {
                order: toInt(period.Order) ?? index + 1,
                name: odesurPeriodName(asString(period.Desc), code),
                // `ResHome` es el parcial del período; `TotHome`, el acumulado.
                home: toInt(period.ResHome),
                away: toInt(period.ResAway),
            };
        })
        .filter((period): period is OdesurPeriod => period !== null);

    return {
        status,
        state: classifyOdesurStatus(status, homeScore !== null && awayScore !== null),
        homeScore,
        awayScore,
        currentPeriod: toInt(results?.CurrentPeriod),
        periods,
        homeRoster: rosterOf(0),
        awayRoster: rosterOf(1),
    };
}

/** Traducciones de las acciones que aparecen en la cronología. */
const ACTION_LABELS: Record<string, string> = {
    GOAL: 'Gol',
    // El gol de jugada del hockey (lo opuesto al córner corto). Bornan lo
    // escribe en plural.
    'FIELD GOAL': 'Gol de jugada',
    'FIELD GOALS': 'Gol de jugada',
    'PENALTY CORNER': 'Córner corto',
    'SHOT PC': 'Córner corto',
    'PENALTY STROKE': 'Penal',
    'GREEN CARD': 'Tarjeta verde',
    'YELLOW CARD': 'Tarjeta amarilla',
    'RED CARD': 'Tarjeta roja',
    'GOALKEEPER SUBSTITUTION': 'Cambio de arquero',
    SUBSTITUTION: 'Cambio',
    TRY: 'Try',
    CONVERSION: 'Conversión',
    'PENALTY TRY': 'Try penal',
    'DROP GOAL': 'Drop',
    PENALTY: 'Penal',
};

function translateAction(label: string): string {
    return ACTION_LABELS[label.trim().toUpperCase()] || label.trim();
}

/**
 * La jugada al vocabulario de la cronología. Se mira el código crudo, la
 * descripción larga y el resultado juntos, porque Bornan reparte el dato: en
 * hockey un gol de córner corto es la acción `SHOT_PC` con resultado `GOAL`,
 * y el tipo que importa es el resultado, no la jugada.
 *
 * El orden importa: "penalty goal" tiene que ganarle a "goal", y el try penal
 * cuenta como try.
 */
export function odesurEventType(action: string, description: string, result: string): string | null {
    const text = `${action} ${description}`.toUpperCase().replace(/_/g, ' ');
    const outcome = result.trim().toUpperCase();

    if (/GREEN CARD/.test(text)) return 'green_card';
    if (/YELLOW CARD/.test(text)) return 'yellow_card';
    if (/RED CARD/.test(text)) return 'red_card';
    if (/\bP?TRY\b/.test(text)) return 'try';
    if (/CONVERSION/.test(text)) return /MISS|FAIL|NO GOAL/.test(outcome) ? null : 'conversion';
    if (/DROP/.test(text)) return /MISS|FAIL|NO GOAL/.test(outcome) ? null : 'drop_goal';
    if (/PENALTY GOAL|PENALTY KICK/.test(text) && outcome === 'GOAL') return 'penalty_goal';
    if (/OWN GOAL/.test(text)) return 'own_goal';
    if (outcome === 'GOAL') return 'goal';
    if (/\bSUBSTITUTION\b/.test(text) && !/GOALKEEPER/.test(text)) return 'substitution';
    return null;
}

/** La cronología de un partido (`actions/{Total|Summary}/{unidad}`). */
export function parseOdesurActions(json: unknown): OdesurAction[] {
    if (!Array.isArray(json)) return [];

    return json
        .map((item, index) => {
            const record = asRecord(item);
            if (!record) return null;

            const extensions = record.Extensions;
            const team = asString(record.Team).trim().toUpperCase();
            const label = extension(extensions, 'ActionLDesc') || asString(record.ActionDesc) || asString(record.Action);
            const rawResult = asString(record.Result) || extension(extensions, 'ResultSDesc');
            // El autor de la jugada viaja en `Competitors`, no en la raíz.
            const actor = asRecord(Array.isArray(record.Competitors) ? record.Competitors[0] : null);
            const rawName = asString(actor?.Name).trim() || asString(record.Name).trim() || asString(record.PartName).trim();

            return {
                type: odesurEventType(asString(record.Action), label, rawResult),
                period: asString(record.Period),
                order: toInt(record.Order) ?? index + 1,
                minute: toInt(extension(extensions, 'ActionMinute')),
                timestamp: asString(record.TimeStamp),
                label: translateAction(label),
                result: translateAction(extension(extensions, 'ResultSDesc') || asString(record.Result)),
                scoreHome: toInt(record.ScoreH),
                scoreAway: toInt(record.ScoreA),
                side: team === 'H' ? 'home' : (team === 'A' ? 'away' : null),
                playerName: rawName ? odesurPersonName(rawName) : '',
                playerBib: asString(actor?.Bib).trim() || asString(record.Bib).trim(),
            } satisfies OdesurAction;
        })
        .filter((action): action is OdesurAction => action !== null);
}

/**
 * El medallero (`medals/standings` o `medals/discipline`). La API cuenta por
 * género dentro de cada metal; acá solo interesa el total de cada uno.
 *
 * El orden es el olímpico (oros, después platas, después bronces) y se
 * reafirma acá aunque la API ya lo mande ordenado: es el contrato de la tabla
 * y no tiene por qué depender de que el proveedor no cambie de idea.
 */
export function parseOdesurMedals(json: unknown): OdesurMedalCount[] {
    if (!Array.isArray(json)) return [];

    return json
        .map((item) => {
            const record = asRecord(item);
            if (!record) return null;

            const code = orgCode(record.Org);
            if (!code) return null;

            const count = asRecord(record.Count);
            const metal = (key: string): number => toInt(asRecord(count?.[key])?.total) ?? 0;
            const gold = metal('ME_GOLD');
            const silver = metal('ME_SILVER');
            const bronze = metal('ME_BRONZE');

            return {
                code,
                name: odesurOrgName(code, asString(record.OrgDesc)),
                gold,
                silver,
                bronze,
                total: gold + silver + bronze,
            } satisfies OdesurMedalCount;
        })
        .filter((row): row is OdesurMedalCount => row !== null && row.total > 0)
        .sort(compareMedals);
}

export function compareMedals(a: OdesurMedalCount, b: OdesurMedalCount): number {
    return b.gold - a.gold
        || b.silver - a.silver
        || b.bronze - a.bronze
        || a.name.localeCompare(b.name, 'es');
}

/**
 * Posiciones con empate: dos delegaciones con los mismos tres metales
 * comparten puesto, y la siguiente salta ("1, 2, 2, 4"), como en el medallero
 * oficial.
 */
export function rankMedals(rows: OdesurMedalCount[]): Array<OdesurMedalCount & { position: number }> {
    const sorted = [...rows].sort(compareMedals);
    return sorted.map((row, index) => {
        const tiedWithPrevious = index > 0
            && sorted[index - 1].gold === row.gold
            && sorted[index - 1].silver === row.silver
            && sorted[index - 1].bronze === row.bronze;
        let position = index + 1;
        if (tiedWithPrevious) {
            let first = index - 1;
            while (first > 0
                && sorted[first - 1].gold === row.gold
                && sorted[first - 1].silver === row.silver
                && sorted[first - 1].bronze === row.bronze) {
                first -= 1;
            }
            position = first + 1;
        }
        return { ...row, position };
    });
}

// --------------------------------------------------------------------------
// Medallistas y agenda (el apartado de los Juegos)
// --------------------------------------------------------------------------

export type OdesurMetal = 'gold' | 'silver' | 'bronze';

export type OdesurMedallist = {
    metal: OdesurMetal;
    orgCode: string | null;
    orgName: string;
    /** El atleta o, en una prueba de equipo, la delegación. */
    name: string;
    isTeam: boolean;
    discipline: string;
    disciplineName: string;
    eventName: string;
    /** Instante de la entrega, en UTC y con el huso corregido. */
    awardedAtIso: string | null;
};

const METALS: Record<string, OdesurMetal> = {
    ME_GOLD: 'gold',
    ME_SILVER: 'silver',
    ME_BRONZE: 'bronze',
};

const METAL_ORDER: Record<OdesurMetal, number> = { gold: 0, silver: 1, bronze: 2 };

/**
 * "ZAPATA Daniela" -> "Daniela Zapata". La API escribe el apellido en
 * mayúsculas y primero; todo lo que viene en mayúsculas es apellido (así
 * entran los compuestos: "DE LA CRUZ María" -> "María De La Cruz").
 */
export function odesurPersonName(raw: string): string {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return raw.trim();

    const isUpper = (token: string) => token === token.toUpperCase() && /\p{L}/u.test(token);
    const surname: string[] = [];
    let index = 0;
    while (index < tokens.length && isUpper(tokens[index])) {
        surname.push(tokens[index]);
        index += 1;
    }
    const given = tokens.slice(index);
    if (surname.length === 0 || given.length === 0) return raw.trim();

    const titled = surname.map((token) => token.charAt(0) + token.slice(1).toLowerCase());
    return [...given, ...titled].join(' ');
}

/** Quién ganó cada medalla (`{disc}/medals/discipline` o `medals/latest`). */
export function parseOdesurMedallists(json: unknown): OdesurMedallist[] {
    if (!Array.isArray(json)) return [];

    return json
        .map((item) => {
            const record = asRecord(item);
            if (!record) return null;

            const metal = METALS[asString(record.Medal).trim().toUpperCase()];
            if (!metal) return null;

            const code = orgCode(record.Org);
            const discipline = asString(record.Disc).trim().toUpperCase();
            const isTeam = asString(record.Type).trim().toUpperCase() === 'T';
            const orgName = odesurOrgName(code, asString(record.OrgDesc));
            const rawName = asString(record.Name).trim();

            return {
                metal,
                orgCode: code,
                orgName,
                name: isTeam ? orgName : (odesurPersonName(rawName) || orgName),
                isTeam,
                discipline,
                disciplineName: odesurDisciplineName(discipline, asString(record.DiscDesc)),
                eventName: odesurEventName(asString(record.EventDesc)),
                awardedAtIso: parseOdesurDateTime(asString(record.DateRaw)),
            } satisfies OdesurMedallist;
        })
        .filter((row): row is OdesurMedallist => row !== null)
        .sort((a, b) => (
            a.eventName.localeCompare(b.eventName, 'es')
            || METAL_ORDER[a.metal] - METAL_ORDER[b.metal]
            || a.name.localeCompare(b.name, 'es')
        ));
}

/**
 * Los deportes que ya repartieron medallas (`medals/params`). Es lo que
 * permite pedir el medallero de cada deporte sin recorrer los 60.
 */
export function parseOdesurMedalDisciplines(json: unknown): string[] {
    const disciplines = asRecord(json)?.disciplines;
    if (!Array.isArray(disciplines)) return [];
    return disciplines
        .map((item) => {
            const record = asRecord(item);
            const code = asString(record?.Disc).trim().toUpperCase();
            const count = toInt(record?.Count) ?? 0;
            return /^[A-Z0-9]{3}$/.test(code) && count > 0 ? code : null;
        })
        .filter((code): code is string => code !== null)
        .sort();
}

/** Uno de los dos lados de un cruce: un país (equipo) o un atleta con su país. */
export type OdesurEntrant = {
    org: string | null;
    name: string;
    /** Lo que marca el tablero: goles, sets, toques. Vacío antes de empezar. */
    result: string;
    winner: boolean;
};

export type OdesurAgendaItem = {
    key: string;
    /** La llave de la unidad para pedir su resultado; vacía si no la tiene. */
    resCode: string;
    discipline: string;
    disciplineName: string;
    eventName: string;
    /** La instancia: "Grupo A", "Final", "Series". */
    phaseName: string;
    /** La unidad dentro de la instancia: "Partido 3", "Serie 2". */
    unitName: string;
    startsAtIso: string | null;
    status: string;
    state: MatchStatus;
    venue: string;
    /** Si la unidad reparte medallas. */
    medal: boolean;
    /** Si es un partido de las disciplinas que tienen ficha en G22. */
    matchId: string | null;
    /** Uno contra uno (un partido, un combate) o una prueba de muchos. */
    isH2H: boolean;
    /** Las delegaciones que compiten en la unidad. */
    orgs: string[];
    home: OdesurEntrant | null;
    away: OdesurEntrant | null;
    /** Si la fuente publica la clasificación de la unidad. */
    hasResults: boolean;
    /**
     * Los tres primeros de una prueba que no es un cruce, con su marca y, en
     * una final, su medalla. El cronograma de cada deporte los trae en cada
     * unidad terminada (`Results`): la agenda muestra el resultado sin pedir
     * la clasificación entera.
     */
    podium: OdesurPodiumEntry[];
    /** Cuántos compiten en la unidad, si la fuente lo dice. */
    participants: number | null;
};

export type OdesurPodiumEntry = {
    rank: number | null;
    org: string | null;
    name: string;
    result: string;
    metal: OdesurMetal | null;
};

function parsePodium(value: unknown, isTeam: boolean): OdesurPodiumEntry[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            const record = asRecord(item);
            if (!record || record.HasData === false) return null;
            const org = orgCode(record.Org);
            const rawName = asString(record.Name).trim();
            if (!org && !rawName) return null;
            const rank = toInt(record.RkPo);
            return {
                rank: rank && rank > 0 ? rank : null,
                org,
                name: isTeam || !rawName ? odesurOrgName(org, rawName) : odesurPersonName(rawName),
                result: asString(record.Result).trim(),
                metal: METALS[asString(record.Medal).trim().toUpperCase()] ?? null,
            } satisfies OdesurPodiumEntry;
        })
        .filter((entry): entry is OdesurPodiumEntry => entry !== null)
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 3);
}

function parseEntrant(value: unknown, isTeam: boolean): OdesurEntrant | null {
    const record = asRecord(value);
    if (!record) return null;
    const org = orgCode(record.Org);
    const rawName = asString(record.Name).trim();
    if (!org && !rawName) return null;
    return {
        org,
        // En equipo el lado es el país; en individual, la persona.
        name: isTeam || !rawName ? odesurOrgName(org, rawName) : odesurPersonName(rawName),
        result: asString(record.Result).trim(),
        winner: record.Winner === true,
    };
}

/**
 * La agenda de un día. Sirve igual para `ALL/schedule/day/{fecha}` (todos los
 * deportes, SIN competidores) y para `{DISC}/schedule/daily/{fecha}` (un
 * deporte, CON `Orgs` en cada unidad y `Home`/`Away` en los cruces): son la
 * misma fila, y la segunda trae de más quién compite. Con eso la agenda puede
 * decir quién juega y filtrar por país en los 60 deportes, no solo en los de
 * equipo.
 */
export function parseOdesurAgenda(json: unknown): OdesurAgendaItem[] {
    if (!Array.isArray(json)) return [];

    return json
        .map((item) => {
            const record = asRecord(item);
            if (!record || record.IsPhase === true) return null;

            const discipline = asString(record.Disc).trim().toUpperCase();
            if (!discipline) return null;

            const resCode = asString(record.ResCode).trim();
            const key = resCode || asString(record.Key);
            const status = asString(record.Status);
            const medal = asString(record.Medal).trim();
            const unit = parseOdesurUnit(record);
            const isH2H = record.isH2H === true;
            const isTeam = asString(record.Type).trim().toUpperCase() === 'T';

            const home = isH2H ? parseEntrant(record.Home, isTeam) : null;
            const away = isH2H ? parseEntrant(record.Away, isTeam) : null;
            const orgs = new Set<string>();
            if (Array.isArray(record.Orgs)) {
                for (const value of record.Orgs) {
                    const code = orgCode(value);
                    if (code) orgs.add(code);
                }
            }
            if (home?.org) orgs.add(home.org);
            if (away?.org) orgs.add(away.org);
            const hasScore = Boolean(home?.result && away?.result);
            const unitName = odesurEs(asString(record.UnitDescA));
            const phaseName = odesurStageName(asString(record.PhaseDescA), asString(record.UnitDescA)).stageName;

            return {
                key,
                resCode,
                discipline,
                disciplineName: odesurDisciplineName(discipline, asString(record.DiscDesc)),
                eventName: odesurEventName(asString(record.EventDesc)),
                phaseName,
                // Una unidad que repite la instancia ("Final" en la fase
                // "Final", "Por el bronce" en "Tercer puesto") no suma nada al lado.
                unitName: unitName === phaseName
                    || (phaseName === 'Tercer puesto' && /bronce/i.test(unitName))
                    || (phaseName === 'Final' && /oro/i.test(unitName))
                    ? ''
                    : unitName,
                startsAtIso: parseOdesurDateTime(asString(record.DateTimeRaw)),
                status,
                state: record.IsLive === true ? 'live' : classifyOdesurStatus(status, hasScore),
                venue: asString(record.VenueDesc) || asString(record.LocDesc),
                medal: medal !== '' && medal !== '0',
                matchId: unit ? odesurMatchIdOf(unit) : null,
                isH2H,
                orgs: [...orgs].sort(),
                home,
                away,
                hasResults: record.ShowResults === true && resCode !== '',
                podium: isH2H ? [] : parsePodium(record.Results, isTeam),
                participants: toInt(asRecord(record.Counters)?.Partics),
            } satisfies OdesurAgendaItem;
        })
        .filter((item): item is OdesurAgendaItem => item !== null)
        .sort((a, b) => (
            (a.startsAtIso ?? '').localeCompare(b.startsAtIso ?? '')
            || a.disciplineName.localeCompare(b.disciplineName, 'es')
        ));
}

export type OdesurRankingRow = {
    rank: number | null;
    org: string | null;
    /** El atleta o, en una prueba de equipo, el país. */
    name: string;
    /** La marca: un tiempo, una distancia, un puntaje. */
    result: string;
    /** Lo que no es una marca: "DNS", "DNF", "DSQ". */
    note: string;
    /** Pasó a la siguiente instancia. */
    qualified: boolean;
};

/**
 * La clasificación de una unidad (`{DISC}/results/{ResCode}`): quién llegó en
 * qué puesto y con qué marca. Es lo que se ve al abrir una serie o una final
 * de un deporte individual; los cruces ya llevan el marcador en la agenda.
 */
export function parseOdesurRanking(json: unknown): OdesurRankingRow[] {
    const record = asRecord(json);
    if (!record || !Array.isArray(record.Competitors)) return [];
    const isTeam = asString(asRecord(record.Info)?.Type).trim().toUpperCase() === 'T';

    return record.Competitors
        .map((item, index) => {
            const row = asRecord(item);
            if (!row) return null;
            const org = orgCode(row.Org);
            const rawName = asString(row.Name).trim();
            const irm = asString(row.IRM).trim().toUpperCase();
            const rank = toInt(row.RkPo) || toInt(row.Rk);
            return {
                entry: {
                    rank: rank && rank > 0 ? rank : null,
                    org,
                    name: isTeam || !rawName
                        ? odesurOrgName(org, rawName || asString(row.OrgDesc))
                        : odesurPersonName(rawName),
                    result: asString(row.Result).trim(),
                    note: irm && irm !== 'OK' ? irm : '',
                    qualified: /^q$/i.test(asString(row.Qualified).trim()),
                } satisfies OdesurRankingRow,
                order: toInt(row.StartSortOrder) ?? index,
            };
        })
        .filter((row): row is { entry: OdesurRankingRow; order: number } => row !== null)
        // Primero los que tienen puesto, en orden; después el resto, en el
        // orden de largada (una serie que todavía no se corrió).
        .sort((a, b) => (
            (a.entry.rank ?? Number.MAX_SAFE_INTEGER) - (b.entry.rank ?? Number.MAX_SAFE_INTEGER)
            || a.order - b.order
        ))
        .map((row) => row.entry);
}

// --------------------------------------------------------------------------
// Ids
// --------------------------------------------------------------------------

/**
 * El id de un partido. El confirmado lleva la llave de Bornan (fase y
 * unidad); el provisional, lo único que lo identifica antes de tenerla: la
 * hora de pared y los dos países (`odesur-match-vvo-w-p202609151000-ARG-PAR`).
 * Cuando la mesa lo confirma el feed pasa a mostrarlo con el id nuevo, y el
 * viejo sigue abriendo la ficha: `findOdesurUnit` lo encuentra por los mismos
 * datos.
 */
export function odesurMatchIdOf(unit: OdesurUnit): string {
    if (unit.provisional) {
        return toOdesurProvisionalMatchId(
            unit.code,
            unit.gender,
            odesurWallStamp(unit.dateTimeRaw) ?? '',
            unit.homeCode ?? '',
            unit.awayCode ?? '',
        );
    }
    return toOdesurMatchId(unit.code, unit.gender, unit.phaseCode, unit.unitCode);
}

export function toOdesurProvisionalMatchId(
    code: OdesurDisciplineCode,
    gender: OdesurGender,
    stamp: string,
    homeCode: string,
    awayCode: string,
): string {
    return `${ODESUR_MATCH_ID_PREFIX}${code.toLowerCase()}-${gender}-p${stamp}-${homeCode.toUpperCase()}-${awayCode.toUpperCase()}`;
}

export function toOdesurMatchId(
    code: OdesurDisciplineCode,
    gender: OdesurGender,
    phaseCode: string,
    unitCode: string,
): string {
    // El guion es el separador del id, así que el de la fase viaja como "_".
    return `${ODESUR_MATCH_ID_PREFIX}${code.toLowerCase()}-${gender}-${phaseCode.replace(/-/g, '_')}-${unitCode}`;
}

export type OdesurProvisionalKey = { stamp: string; homeCode: string; awayCode: string };

export type ParsedOdesurMatchId = {
    competition: OdesurCompetition;
    /** La llave de Bornan; null si el id es de un partido provisional. */
    resCode: string | null;
    provisional: OdesurProvisionalKey | null;
};

export function parseOdesurMatchId(value: unknown): ParsedOdesurMatchId | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();

    const provisional = new RegExp(`^${ODESUR_MATCH_ID_PREFIX}([a-z0-9]{3})-([mw])-p(\\d{12})-([A-Z]{3})-([A-Z]{3})$`, 'i')
        .exec(trimmed);
    const confirmed = provisional
        ? null
        : new RegExp(`^${ODESUR_MATCH_ID_PREFIX}([a-z0-9]{3})-([mw])-([A-Z0-9_]{2,6})-(\\d{6})$`, 'i').exec(trimmed);
    const match = provisional ?? confirmed;
    if (!match) return null;

    const code = match[1].toUpperCase() as OdesurDisciplineCode;
    if (!ODESUR_DISCIPLINES[code]) return null;

    const competition = odesurCompetition(code, match[2].toLowerCase() as OdesurGender);

    if (provisional) {
        return {
            competition,
            resCode: null,
            provisional: {
                stamp: provisional[3],
                homeCode: provisional[4].toUpperCase(),
                awayCode: provisional[5].toUpperCase(),
            },
        };
    }

    const phaseCode = match[3].toUpperCase().replace(/_/g, '-');
    return { competition, resCode: `${competition.eventKey}.${phaseCode}.${match[4]}--`, provisional: null };
}

/**
 * El partido que nombra un id, entre los de su torneo. Un id provisional se
 * resuelve por la hora y los dos países, así que sigue abriendo la ficha
 * después de que el partido se confirma y cambia de llave.
 */
export function findOdesurUnit(units: OdesurUnit[], parsed: ParsedOdesurMatchId): OdesurUnit | null {
    if (parsed.resCode) return units.find((unit) => unit.resCode === parsed.resCode) ?? null;

    const key = parsed.provisional;
    if (!key) return null;
    return units.find((unit) => (
        unit.homeCode === key.homeCode
        && unit.awayCode === key.awayCode
        && odesurWallStamp(unit.dateTimeRaw) === key.stamp
    )) ?? null;
}
