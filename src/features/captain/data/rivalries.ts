// EL CAPITÁN — los clásicos.
//
// Qué es un clásico, y por qué es una lista escrita a mano ─────────────────────
// No se deduce. La tentación es calcularlo —dos clubes de la misma ciudad, o de
// la misma división, o los dos más ganadores— y las tres cuentas dan mal: CASI y
// SIC están a doce cuadras y son EL clásico, Alumni y Belgrano Athletic también
// son de zona norte y no lo son; Duendes y Jockey de Rosario comparten Top 10 con
// otros ocho que no le importan a nadie; Béziers–Narbonne están más cerca que
// Béziers–Perpignan y pesan menos. Un clásico es historia, no geometría, así que
// entra como DATO y no como fórmula.
//
// El criterio de corte, y se aplicó igual en los quince países: clásicos GRANDES
// de verdad —rivalidad histórica, identidad territorial o peso competitivo—, no
// cualquier partido importante. Por eso Uruguay tiene tres pares y Francia
// quince: no es que se buscó menos en Uruguay, es que allá los grandes son tres.
//
// ── Lo que esto vale adentro del juego ──────────────────────────────────────
// Es la única puerta a la regla más cara de la Pertenencia: irse de un club al
// club de esta lista BORRA lo construido allá y le baja el techo para siempre
// (`engine/betrayal.ts`). Agregar un par acá no toca una línea de motor y sin
// embargo cambia qué pases son una traición en una partida en curso — por eso
// tiene versión propia y el guardado la sella, igual que los torneos, la tienda
// y el calendario internacional.
//
// ── Los ids son del catálogo de Carrera de Rugby ────────────────────────────
// Entran por `data/catalogs.ts` como todo lo demás. Un id mal escrito NO se
// nota jugando —`getClub` devuelve un club por defecto en vez de fallar— así que
// el que los vigila es `rivalries.test.ts`, que verifica los ciento y pico
// contra el catálogo real. Si un club se va del catálogo, ahí se rompe.
//
// ── Lo que la lista NO tiene, y por qué ─────────────────────────────────────
// Clásicos reales cuyo par no existe en el catálogo 2026: Leicester–Wasps y
// London Irish–London Welsh (los tres clubes desaparecieron), L'Aquila–Petrarca
// y L'Aquila–Rovigo, SPAC–Bandeirantes y las de Curitiba, San Diego–Rugby ATL y
// Seattle–Utah, Waratahs–Rebels, Toulon–Nice (Nissa está, pero el clásico de la
// Costa Azul es de otra época). Quedan anotados acá y no como par comentado: un
// par comentado se descomenta sin verificar nada, y este renglón obliga a mirar
// el catálogo primero.

import { clubExists } from './catalogs.ts';

/**
 * La versión del catálogo de clásicos.
 *
 * PARÁMETRO LIBRE en el sentido del §1.9: no se deriva de nada. Sube cuando se
 * agrega, se saca o se corrige un par — o sea, cuando una partida guardada
 * pasaría a tener otra respuesta a «¿este pase es al clásico?».
 */
export const CAPTAIN_RIVALRIES_VERSION = '1.0.0';

/**
 * Un clásico: dos clubes, por id de catálogo.
 *
 * SIN NOMBRE DEL DERBY, a propósito. «Derby Basque» o «el clásico vallisoletano»
 * son lindos y no los lee nadie: la tarjeta del mercado nombra a los dos clubes,
 * y esos nombres salen del catálogo, que es su dueño. Sesenta y pico de rótulos
 * decorativos serían sesenta y pico de strings que envejecen sin que ningún test
 * los mire.
 */
export type ClassicRivalry = readonly [string, string];

// ═══════════════════════════════════════════════════════════════════════════
//  🇦🇷 ARGENTINA — los dieciséis
// ═══════════════════════════════════════════════════════════════════════════
//
// Uno por región y los grandes de cada una. El de arriba de todo es CASI–SIC:
// el clásico del rugby argentino, sin discusión y sin empate posible.
const AR: readonly ClassicRivalry[] = [
    ['sb-casi', 'sb-san-isidro-club'], // CASI – SIC
    ['sb-cuba', 'sb-hindu-club'], // zona norte de la URBA
    ['sb-asoc-alumni', 'sb-belgrano-athletic'], // el de Buenos Aires
    ['sb-tala-rugby-club', 'sb-club-la-tablada'], // el gran clásico cordobés
    ['sb-jockey-club-cordoba', 'sb-cordoba-athletic-club'], // el del sur cordobés
    ['sb-duendes-r-c', 'sb-jockey-club-de-rosario'], // el rosarino
    ['sb-tucuman-rugby-club', 'sb-universitario-de-tucuman'], // el grande del NOA
    ['sb-tucuman-rugby-club', 'sb-tucuman-lawn-tennis'], // el histórico tucumano
    ['sb-los-tordos-rugby-club', 'sb-marista-rugby-club'], // el mendocino
    ['sb-santa-fe-r-c', 'sb-crai'], // el santafesino
    ['sb-jockey-club-salta', 'sb-gimnasia-y-tiro'], // el salteño
    ['sb-santiago-lawn-tennis-club', 'sb-old-lions-r-c'], // el santiagueño
    ['sb-parana-rowing', 'sb-estudiantes-de-parana'], // el de Paraná
    ['sb-marabunta-r-c', 'sb-neuquen-r-c'], // el patagónico
    ['sb-patoruzu-r-c', 'sb-trelew-r-c'], // el de Chubut
    ['sb-capri', 'sb-centro-cazadores'], // el misionero
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇺🇾 URUGUAY — el Big 3, y nada más
// ═══════════════════════════════════════════════════════════════════════════
//
// Los tres grandes de Montevideo entre sí. Trébol de Paysandú es campeón
// uruguayo y NO está: su rivalidad con Old Christians es deportiva y reciente,
// no un clásico. Es exactamente el corte que este archivo existe para hacer.
const UY: readonly ClassicRivalry[] = [
    ['sb-old-boys-girls-club', 'sb-old-christians-club'], // el superclásico
    ['sb-old-christians-club', 'sb-carrasco-polo'],
    ['sb-old-boys-girls-club', 'sb-carrasco-polo'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇨🇱 CHILE
// ═══════════════════════════════════════════════════════════════════════════
//
// OJO CON OLD BOYS: hay dos en el catálogo y son clubes distintos —
// `sb-old-boys-r-c` es el chileno y `sb-old-boys-girls-club` el uruguayo—. Los
// pares van por id justamente por esto.
const CL: readonly ClassicRivalry[] = [
    ['sb-old-boys-r-c', 'sb-universidad-catolica'],
    ['sb-old-boys-r-c', 'sb-old-mackayans'],
    ['sb-old-boys-r-c', 'sb-cobs'],
    ['sb-cobs', 'sb-universidad-catolica'],
    ['sb-old-mackayans', 'sb-old-johns'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇫🇷 FRANCIA — quince, y la mitad no son de Top 14
// ═══════════════════════════════════════════════════════════════════════════
//
// Es el único país donde hizo falta separar «clásico de la primera de hoy» de
// «clásico histórico». Béziers–Narbonne y Dax–Mont-de-Marsan son enormes y hoy
// se juegan en Pro D2 y en Nationale: filtrarlos por la división en la que están
// parados en 2026 sería perder el clásico por una tabla de posiciones.
const FR: readonly ClassicRivalry[] = [
    ['aviron-bayonnais', 'biarritz-olympique'], // el derby vasco
    ['stade-francais', 'racing-92'], // el derby parisino
    ['stade-toulousain', 'castres-olympique'], // el de Occitania
    ['asm-clermont', 'ca-brive'], // el del Macizo Central
    ['asm-clermont', 'rc-toulon'], // diez años de finales
    ['as-beziers', 'usa-perpignan'], // el del Languedoc-Rosellón
    ['stade-toulousain', 'stade-francais'], // Le Classico
    ['stade-toulousain', 'rc-toulon'],
    ['union-bordeaux-begles', 'stade-rochelais'], // el del Atlántico
    ['as-beziers', 'rc-narbonnais'],
    ['rc-narbonnais', 'usa-perpignan'],
    ['us-dax', 'stade-montois'], // el de las Landas
    ['biarritz-olympique', 'section-paloise'],
    ['aviron-bayonnais', 'section-paloise'],
    ['fc-grenoble', 'bourgoin'], // el de los Alpes
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇪🇸 ESPAÑA
// ═══════════════════════════════════════════════════════════════════════════
//
// VRAC–El Salvador es el único que además de la rivalidad deportiva tiene el
// derbi: los dos son de Valladolid.
const ES: readonly ClassicRivalry[] = [
    ['vrac-valladolid', 'el-salvador'], // el derbi vallisoletano
    ['santboiana', 'el-salvador'],
    ['santboiana', 'vrac-valladolid'],
    ['complutense-cisneros', 'alcobendas'], // el derbi madrileño
    ['real-ciencias-sevilla', 'el-salvador'],
    ['barca-rugby', 'santboiana'], // el catalán
];

// ═══════════════════════════════════════════════════════════════════════════
//  🏴 INGLATERRA
// ═══════════════════════════════════════════════════════════════════════════
//
// Leicester–Northampton se juega desde 1888 y pasa los 250 partidos. Es el que
// va arriba de todos.
const ENG: readonly ClassicRivalry[] = [
    ['leicester-tigers', 'northampton-saints'], // East Midlands Derby
    ['bath', 'gloucester'], // West Country
    ['bath', 'bristol-bears'],
    ['leicester-tigers', 'bath'],
    ['harlequins', 'saracens'], // el de Londres
    ['bristol-bears', 'exeter-chiefs'],
    ['gloucester', 'bristol-bears'],
    ['leicester-tigers', 'gloucester'],
    ['sale-sharks', 'leicester-tigers'],
    ['sale-sharks', 'newcastle-red-bulls'],
    ['saracens', 'northampton-saints'],
    ['bath', 'exeter-chiefs'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇮🇹 ITALIA
// ═══════════════════════════════════════════════════════════════════════════
const IT: readonly ClassicRivalry[] = [
    ['rugby-rovigo-delta', 'petrarca'], // el clásico italiano
    ['benetton-treviso', 'petrarca'],
    ['rugby-rovigo-delta', 'rugby-calvisano'],
    ['petrarca', 'rugby-calvisano'],
    ['benetton-treviso', 'rugby-rovigo-delta'],
    ['rugby-calvisano', 'benetton-treviso'],
    ['mogliano', 'benetton-treviso'],
    ['viadana', 'rugby-calvisano'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇵🇹 PORTUGAL — todo Lisboa
// ═══════════════════════════════════════════════════════════════════════════
const PT: readonly ClassicRivalry[] = [
    ['cdul', 'direito'],
    ['cdul', 'agronomia'],
    ['direito', 'agronomia'], // el de Monsanto
    ['direito', 'belenenses'],
    ['cdul', 'belenenses'],
    ['agronomia', 'belenenses'],
    ['belenenses', 'benfica'],
    ['direito', 'tecnico'],
    ['cdul', 'tecnico'],
    ['agronomia', 'tecnico'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇧🇷 BRASIL — São Paulo y Rio Grande do Sul
// ═══════════════════════════════════════════════════════════════════════════
const BR: readonly ClassicRivalry[] = [
    ['spac', 'sao-jose'],
    ['spac', 'pasteur'],
    ['sao-jose', 'pasteur'],
    ['poli', 'pasteur'],
    ['poli', 'sao-jose'],
    ['poli', 'spac'],
    ['farrapos', 'charrua'], // o clássico gaúcho
    ['farrapos', 'desterro'],
    ['charrua', 'desterro'],
    ['farrapos', 'pasteur'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇺🇸 MAJOR LEAGUE RUGBY
// ═══════════════════════════════════════════════════════════════════════════
//
// La liga más joven de la lista, así que los clásicos tienen menos historia y
// hay que ser más estricto. Seattle–California Legion es el que la propia MLR
// llama su rivalidad más grande: el Legion es el club de San Diego con el nombre
// que lleva en 2026, y por eso el par histórico entra por ese id.
const US: readonly ClassicRivalry[] = [
    ['seattle-seawolves', 'california-legion'],
    ['new-england-free-jacks', 'old-glory-dc'], // Freedom Cup
    ['new-england-free-jacks', 'seattle-seawolves'], // Coffee Cup
    ['chicago-hounds', 'california-legion'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🇳🇿 NUEVA ZELANDA — el NPC, que es rugby de provincia
// ═══════════════════════════════════════════════════════════════════════════
//
// Auckland–Canterbury es Norte contra Sur y ciudad contra campo; Otago–Southland
// son los dos que más veces se enfrentaron entre sí en todo el país.
const NZ: readonly ClassicRivalry[] = [
    ['auckland', 'canterbury'],
    ['auckland', 'waikato'], // Battle of the Bombays
    ['otago', 'southland'], // Southern Derby
    ['canterbury', 'otago'],
    ['canterbury', 'wellington'],
    ['auckland', 'wellington'],
    ['waikato', 'bay-of-plenty'],
    ['taranaki', 'waikato'],
    ['hawke-s-bay', 'manawatu'],
    ['north-harbour', 'auckland'],
    ['canterbury', 'southland'],
    ['wellington', 'manawatu'],
    ['auckland', 'counties-manukau'],
    ['waikato', 'counties-manukau'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  🌏 SUPER RUGBY PACIFIC
// ═══════════════════════════════════════════════════════════════════════════
//
// Es el único bloque donde casi todos se cruzan con casi todos, y no es
// desprolijidad: son cinco franquicias neozelandesas que se reparten un país
// entero, con la competición separando partidos de rivalidad en su propio
// calendario. Waratahs–Reds viene de 1882 y es mucho más viejo que el torneo.
const SUPER: readonly ClassicRivalry[] = [
    ['blues', 'crusaders'],
    ['blues', 'chiefs'],
    ['crusaders', 'highlanders'], // South Island Derby
    ['chiefs', 'hurricanes'],
    ['blues', 'hurricanes'],
    ['chiefs', 'crusaders'],
    ['blues', 'highlanders'],
    ['highlanders', 'hurricanes'],
    ['highlanders', 'chiefs'],
    ['waratahs', 'reds'],
    ['brumbies', 'waratahs'],
    ['brumbies', 'reds'],
    ['western-force', 'brumbies'],
    ['reds', 'western-force'],
    ['waratahs', 'western-force'],
    ['fijian-drua', 'moana-pasifika'], // el del Pacífico
    ['fijian-drua', 'reds'],
    ['fijian-drua', 'waratahs'],
    ['moana-pasifika', 'hurricanes'],
];

/** Todos los clásicos, en un solo lugar. */
export const CLASSIC_RIVALRIES: readonly ClassicRivalry[] = [
    ...AR, ...UY, ...CL, ...FR, ...ES, ...ENG, ...IT, ...PT, ...BR, ...US, ...NZ, ...SUPER,
];

/**
 * El índice, armado una vez.
 *
 * SE LEE POR CLAVE Y NUNCA SE ITERA PARA ELEGIR. Es la regla del §1 del CLAUDE
 * de Carrera de Rugby y acá vale igual: recorrer un `Map` para sortear un rival
 * ataría el resultado al orden en que este archivo está escrito, que es una
 * fuente de no-determinismo encubierta. `classicRivalsOf` devuelve la lista
 * ORDENADA por si alguna vez alguien la recorre.
 */
const RIVALS_BY_CLUB: ReadonlyMap<string, readonly string[]> = (() => {
    const index = new Map<string, string[]>();
    for (const [a, b] of CLASSIC_RIVALRIES) {
        if (!index.has(a)) index.set(a, []);
        if (!index.has(b)) index.set(b, []);
        index.get(a)!.push(b);
        index.get(b)!.push(a);
    }
    for (const rivales of index.values()) rivales.sort((x, y) => x.localeCompare(y));
    return index;
})();

/** Los clásicos rivales de un club, ordenados. Vacío si no tiene. */
export function classicRivalsOf(clubId: string | null): readonly string[] {
    if (!clubId) return [];
    return RIVALS_BY_CLUB.get(clubId) ?? [];
}

/**
 * ¿Estos dos son el clásico?
 *
 * Simétrica y sin orden: `areClassicRivals(a, b) === areClassicRivals(b, a)`. Un
 * club no es rival de sí mismo, y esa guarda no es teórica — quedarse en el club
 * pasa por acá con los dos ids iguales.
 */
export function areClassicRivals(a: string | null, b: string | null): boolean {
    if (!a || !b || a === b) return false;
    return classicRivalsOf(a).includes(b);
}

/**
 * Los ids que no están en el catálogo de clubes.
 *
 * Existe para el test y para nada más: un id mal escrito no se nota jugando
 * porque `getClub` devuelve un club por defecto en vez de fallar, así que el
 * clásico simplemente no ocurriría nunca y nadie se enteraría.
 */
export function unknownRivalryClubs(): readonly string[] {
    const faltantes = new Set<string>();
    for (const [a, b] of CLASSIC_RIVALRIES) {
        if (!clubExists(a)) faltantes.add(a);
        if (!clubExists(b)) faltantes.add(b);
    }
    return [...faltantes].sort((x, y) => x.localeCompare(y));
}
