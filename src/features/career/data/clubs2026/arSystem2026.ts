// SISTEMA DE COMPETENCIAS DEL RUGBY DE CLUBES ARGENTINO — temporada base 2026.
//
// Este archivo es el CANON. Es datos puros: no importa nada del motor ni de
// React, no lee el entorno y no usa azar. La resolución a `ClubDef[]` (que sí
// necesita el snapshot para heredar escudos) vive en `arCatalog.ts`.
//
// ── LA REGLA QUE ORDENA TODO: SON DOS RAMAS PARALELAS ────────────────────────
//
// El rugby argentino NO es una sola pirámide nacional:
//
//   · Rama URBA (Buenos Aires): pirámide clásica de 7 divisiones con ascensos y
//     descensos directos entre niveles. 91 clubes.
//   · Rama INTERIOR: 7 regiones, cada una con su torneo regional (su liga real,
//     con primera y segunda división). Los regionales reparten cupos al Torneo
//     del Interior, que corona al campeón del interior.
//
// Las dos ramas se cruzan UNA sola vez por temporada, en el Nacional de Clubes
// (campeón del Top 14 vs campeón del TDI A). Un club de la URBA NUNCA asciende
// al interior ni viceversa: son universos cerrados. Por eso cada rama tiene su
// propia cadena de ascenso (`promotesTo`) y ninguna cruza de `branch`.
//
// ── POR QUÉ CADA DIVISIÓN ES SU PROPIA COMPETICIÓN ──────────────────────────
//
// Antes todo el rugby argentino era UNA competición paraguas (`sa-ar`) con un
// campo `divisionTier` de 1 a 4. Eso no puede expresar este sistema:
//   · con una sola liga no hay forma de declarar "el campeón de Primera A
//     asciende al Top 14" sin que también ascienda el campeón de Córdoba;
//   · los cupos del TDI se reparten POR REGIÓN y por posición final en el
//     regional — se necesita una liga de origen por región para declararlos;
//   · 4 escalones no alcanzan para los 7 niveles del canon.
//
// Cada división lleva entonces su propio `competitionId`, igual que las
// francesas o inglesas del catálogo internacional.

/**
 * Sube si cambia CUALQUIER cosa de este archivo. Va dentro de la versión de catálogo.
 *
 * 2026.3 — la Patagonia y la Unión Andina, completas. La Patagonia deja de ser una
 * división lump ("Torneo Austral y locales patagónicos") y pasa a tener una
 * competición por unión: Austral+Chubut, Alto Valle, Tierra del Fuego, Santa Cruz
 * y el desarrollo del Chubut. La Unión Andina pasa de dos clubes a siete. Y se
 * corrigen dos ubicaciones que estaban mal: Los Chelcos juega el Andino y La
 * Querencia el Regional del NOA, lo que dejó al Desarrollo cordobés sin nómina.
 */
export const AR_SYSTEM_VERSION = '2026.3';

/** Las dos ramas del sistema. No hay ascenso ni descenso entre ellas. */
export type ArBranch = 'urba' | 'interior';

/**
 * Nivel de fuerza del canon, 1 (élite) a 7 (base). Es la jerarquía DEPORTIVA
 * declarada, no una posición en una escalera: la URBA ocupa los siete niveles y
 * cada región ocupa los suyos.
 */
export type CanonLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Región del canon. La URBA es su propia rama, no una región del interior. */
export type ArRegion =
    | 'urba'
    | 'centro' // Córdoba (una sola unión)
    | 'litoral' // Rosario + Santafesina + Entrerriana
    | 'oeste' // Cuyo + Sanjuanina
    | 'noa' // Tucumán + Salta + Santiago del Estero + Jujuy + Andina (Catamarca y La Rioja)
    | 'nea' // Nordeste + Misiones + Formosa (+ dos clubes paraguayos)
    | 'pampeana' // Mar del Plata + Unión del Sur + UROBA
    | 'patagonia'; // Valle del Chubut + Austral + Alto Valle + Lagos del Sur

/** Nombre de la región para mostrar. "Centro" y "Córdoba" son sinónimos. */
export const AR_REGION_LABEL: Readonly<Record<ArRegion, string>> = {
    urba: 'URBA',
    centro: 'Córdoba',
    litoral: 'Litoral',
    oeste: 'Oeste',
    noa: 'Noroeste',
    nea: 'Nordeste',
    pampeana: 'Pampeana',
    patagonia: 'Patagonia',
};

// ── ESCALA DE FUERZA ────────────────────────────────────────────────────────
//
// El canon trae bandas 0-100 (Nivel 1 = 88-100). Esas bandas son INTERNAS a
// Argentina y no se pueden copiar al catálogo global: con Newman en 95 el rugby
// de clubes argentino quedaría arriba de Leinster (94) y de Toulouse (95), y el
// salto al profesionalismo —que en el juego pasa por Super Rugby Americas, con
// piso de oferta en 59— dejaría de existir.
//
// Se remapea entonces al rango amateur del juego conservando lo único que el
// canon declara inviolable: EL ORDEN Y LA FRONTERA. Cada banda de acá lleva
// anotada la banda del canon de la que sale.
//
// La frontera inviolable: el piso de URBA Primera B tiene que estar ARRIBA del
// techo de todo el interior salvo las tres excepciones (Oeste, Centro y
// Litoral, cuyas primeras divisiones son Nivel 2). Acá: 39 > 38. Hay un test
// que lo verifica sobre el catálogo construido, no sobre esta tabla.
//
// Los solapamientos entre niveles adyacentes son DELIBERADOS: son los que
// producen upsets creíbles (el mejor de Primera C puede ganarle al peor de
// Primera B). No los cierres.

export type RatingBand = readonly [number, number];

export const AR_RATING_BANDS = {
    /** Nivel 1 · élite (canon 88-100). Solo URBA Top 14. */
    n1: [48, 52],
    /**
     * Nivel 2 · URBA Primera A (canon 74-88). Va 2 puntos arriba de las tres
     * primeras del interior: el canon dice que compiten de igual a igual pero
     * que a igual rating la URBA tiene una ventaja leve (+2 a +3).
     */
    n2Urba: [45, 48],
    /** Nivel 2 · las tres excepciones del interior (canon 74-88). */
    n2Interior: [43, 46],
    /** Nivel 3 · alto (canon 64-75). Solo URBA Primera B. */
    n3: [39, 42],
    /** Nivel 4 · medio-alto (canon 52-63). Techo del interior no-excepción. */
    n4: [34, 38],
    /** Nivel 5 · medio (canon 42-56). */
    n5: [30, 36],
    /** Nivel 6 · medio-bajo (canon 32-48). */
    n6: [27, 32],
    /** Nivel 7 · base (canon 22-37). Locales y desarrollo. */
    n7: [24, 29],
} as const satisfies Record<string, RatingBand>;

export type ArBandKey = keyof typeof AR_RATING_BANDS;

/** Techo absoluto del rugby doméstico argentino. Queda debajo del piso SRA (56). */
export const AR_RATING_MAX = AR_RATING_BANDS.n1[1];
export const AR_RATING_MIN = AR_RATING_BANDS.n7[0];

/**
 * Banda deportiva GLOBAL (0-3) por nivel del canon. Es un instrumento de
 * comparación entre países, NO la jerarquía doméstica.
 *
 * EL TECHO EN 3 ES CARGA ESTRUCTURAL, no una opinión sobre cuánto vale el Top 14
 * de la URBA. La banda define la ventana de fichaje: un pase de ±1 banda es un
 * movimiento normal y no pide nada, y los saltos más grandes tienen que pasar por
 * una VÍA declarada. La vía al profesionalismo sudamericano
 * (`ar-domestic-to-sra`) exige 59 de media, y Super Rugby Americas está en la
 * banda 5. Con el Top 14 en banda 4, la SRA quedaba a ±1: medido, un jugador de
 * 56 en La Plata recibía oferta de franquicia sin pasar por el requisito. Con el
 * techo en 3 el salto al profesionalismo vuelve a ser un salto.
 *
 * Siete niveles en cuatro bandas obligan a tres empates. Se eligieron los tres
 * pares donde el canon declara los solapamientos más grandes:
 *   · N2/N3 → canon 74-88 y 64-75;
 *   · N4/N5 → canon 52-63 y 42-56;
 *   · N6/N7 → canon 32-48 y 22-37.
 *
 * Lo que se pierde con cada empate es solo el matiz del TEXTO del movimiento (un
 * pase de Primera A a Primera B se lee lateral en vez de descenso). Lo que NO se
 * pierde es la jerarquía deportiva: eso vive en el `rating`, que es lo que decide
 * los partidos, y ahí los siete niveles siguen separados.
 */
export const AR_SPORTING_BAND: Readonly<Record<CanonLevel, 0 | 1 | 2 | 3>> = {
    1: 3, 2: 2, 3: 2, 4: 1, 5: 1, 6: 0, 7: 0,
};

// ── DIVISIONES ──────────────────────────────────────────────────────────────

export interface ArDivision {
    /** Id de competición. Prefijo `ar-` + rama/región + división. */
    competitionId: string;
    /** Nombre real, tal como se muestra. */
    label: string;
    branch: ArBranch;
    region: ArRegion;
    canonLevel: CanonLevel;
    band: ArBandKey;
    /**
     * Clubes en ORDEN DE FUERZA, del más fuerte al más flojo. El orden es la
     * decisión de diseño: de él sale el rating de cada club dentro de la banda
     * de su división ("asigná a cada club un valor dentro de la banda de su
     * división, sesgado por su historia"). No hay hash ni azar.
     */
    clubs: readonly string[];
    /** Fechas de temporada regular del EQUIPO. */
    regularSeasonMatches: number;
    /** División a la que asciende el campeón, dentro de la MISMA rama. */
    promotesTo?: string;
    /** División a la que descienden los últimos, dentro de la MISMA rama. */
    relegatesTo?: string;
    promotionSlots?: number;
    relegationSlots?: number;
    /** Nota de estructura: byes, fases, o incertidumbre de la fuente. */
    note?: string;
}

// ── RAMA A · URBA ───────────────────────────────────────────────────────────
// 7 niveles, 91 clubes. La primera división se llama Top 14 desde 2026 (antes
// Top 12; se amplió de 12 a 14). No existe una "Cuarta": el séptimo nivel se
// llama Desarrollo.
//
// Ascensos y descensos, exactamente como los declara el canon:
//   · Top 14: los 4 primeros juegan semis y final; los 2 últimos descienden.
//   · Primera A/B/C y Segunda: 2 ascensos (campeón directo + playoff 2°-5°),
//     los 2 últimos descienden.
//   · Tercera: 2 ascensos, desciende SOLO el último.
//   · Desarrollo: sin descensos. Asciende el campeón solo si cumple requisitos
//     reglamentarios (infraestructura, divisiones formativas).

const URBA_DIVISIONS: readonly ArDivision[] = [
    {
        competitionId: 'ar-urba-top14',
        label: 'Top 14 de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 1, band: 'n1',
        regularSeasonMatches: 18,
        relegatesTo: 'ar-urba-primera-a', relegationSlots: 2,
        note: 'los 4 primeros juegan semifinales y final; los 2 últimos descienden directo',
        clubs: [
            'Newman', 'CASI', 'SIC', 'Hindú Club', 'Alumni', 'Belgrano Athletic', 'Los Tilos',
            'Regatas Bella Vista', 'CUBA', 'La Plata', 'Los Matreros', 'Buenos Aires',
            'Atlético del Rosario', 'Champagnat',
        ],
    },
    {
        competitionId: 'ar-urba-primera-a',
        label: 'Primera A de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 2, band: 'n2Urba',
        regularSeasonMatches: 18,
        promotesTo: 'ar-urba-top14', promotionSlots: 2,
        relegatesTo: 'ar-urba-primera-b', relegationSlots: 2,
        clubs: [
            'San Luis', 'San Cirano', 'Lomas Athletic', 'Curupaytí', 'Pucará', 'GEBA', 'Hurling',
            'San Fernando', 'San Andrés', 'Pueyrredón', 'San Albano', 'Olivos',
            'Deportiva Francesa', 'Universitario de La Plata',
        ],
    },
    {
        competitionId: 'ar-urba-primera-b',
        label: 'Primera B de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 3, band: 'n3',
        regularSeasonMatches: 18,
        promotesTo: 'ar-urba-primera-a', promotionSlots: 2,
        relegatesTo: 'ar-urba-primera-c', relegationSlots: 2,
        clubs: [
            'Universitario de Quilmes', 'Banco Nación', 'Manuel Belgrano', 'Liceo Naval',
            'San Patricio', 'Don Bosco', 'San Martín', 'Mariano Moreno', 'Italiano',
            'Argentino', 'Delta', 'Monte Grande', 'Liceo Militar', 'Vicentinos',
        ],
    },
    {
        competitionId: 'ar-urba-primera-c',
        label: 'Primera C de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 4, band: 'n4',
        regularSeasonMatches: 18,
        promotesTo: 'ar-urba-primera-b', promotionSlots: 2,
        relegatesTo: 'ar-urba-segunda', relegationSlots: 2,
        clubs: [
            'Lanús', 'SITAS', 'San Carlos', 'Del Sur', 'Luján', 'Los Molinos',
            'Ciudad de Buenos Aires', 'Centro Naval', 'Areco', 'Virreyes', "St. Brendan's",
            'Daom', 'CASA de Padua', 'San Miguel',
        ],
    },
    {
        competitionId: 'ar-urba-segunda',
        label: 'Segunda de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 5, band: 'n5',
        regularSeasonMatches: 18,
        promotesTo: 'ar-urba-primera-c', promotionSlots: 2,
        relegatesTo: 'ar-urba-tercera', relegationSlots: 2,
        clubs: [
            'El Retiro', 'Tigre', 'Atlético y Progreso', 'Mercedes', 'Old Georgian',
            'Atlético Chascomús', 'San Marcos', 'Tiro Federal de San Pedro', 'Las Cañas',
            'Varela Jr.', 'La Salle', 'Los Pinos', 'Albatros', 'Vicente López',
        ],
    },
    {
        competitionId: 'ar-urba-tercera',
        label: 'Tercera de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 20,
        promotesTo: 'ar-urba-segunda', promotionSlots: 2,
        relegatesTo: 'ar-urba-desarrollo', relegationSlots: 1,
        note: '11 equipos: una fecha libre por jornada. Desciende SOLO el último',
        clubs: [
            'Arsenal Zárate', 'Los Cedros', 'Gimnasia y Esgrima de Ituzaingó',
            'Ciudad de Campana', 'Almafuerte', 'Beromama', 'Porteño', 'Banco Hipotecario',
            'PAC General Rodríguez', 'Tiro Federal de Baradero', 'Berisso',
        ],
    },
    {
        competitionId: 'ar-urba-desarrollo',
        label: 'Desarrollo de la URBA',
        branch: 'urba', region: 'urba', canonLevel: 7, band: 'n7',
        regularSeasonMatches: 18,
        promotesTo: 'ar-urba-tercera', promotionSlots: 1,
        note: 'sin descensos: es la base. El campeón asciende solo si cumple los requisitos reglamentarios (infraestructura, divisiones formativas); si no, sube el mejor ubicado que sí los cumpla',
        clubs: [
            'Ezeiza', 'Berazategui', 'Obras Sanitarias', 'Defensores de Glew', 'San José',
            'Rivadavia de Lobos', 'Atlético San Andrés', 'Marcos Paz', 'Floresta',
            'Sociedad Hebraica',
        ],
    },
];

// ── RAMA B · EL INTERIOR ────────────────────────────────────────────────────
// Cada región es una escalera CERRADA: su primera y su segunda división, con
// ascenso entre ellas y nada más. Los cupos al Torneo del Interior se declaran
// aparte (`TDI_CUPOS_2026`), porque las plazas pertenecen a la REGIÓN y no al
// club.

const INTERIOR_DIVISIONS: readonly ArDivision[] = [
    // ── CENTRO · Córdoba (Unión Cordobesa) · Nivel 2 / Nivel 4 ──────────────
    // Región de una sola unión. El torneo de Primera lleva el nombre de
    // fantasía "Javier 'Pelado' Morra".
    {
        competitionId: 'ar-centro-top10',
        label: 'Top 10 A de Córdoba',
        branch: 'interior', region: 'centro', canonLevel: 2, band: 'n2Interior',
        regularSeasonMatches: 18,
        relegatesTo: 'ar-centro-super9b', relegationSlots: 1,
        clubs: [
            'Jockey Club Córdoba', 'Tala', 'La Tablada', 'Córdoba Athletic',
            'Universitario de Córdoba', 'Palermo Bajo', 'Urú Curé', 'Carlos Paz',
            'Jockey Club Villa María', 'San Martín de Villa María',
        ],
    },
    {
        competitionId: 'ar-centro-super9b',
        label: 'Súper 9 B de Córdoba',
        branch: 'interior', region: 'centro', canonLevel: 4, band: 'n4',
        regularSeasonMatches: 16,
        promotesTo: 'ar-centro-top10', promotionSlots: 1,
        note: '9 equipos: una fecha libre por jornada',
        clubs: [
            'Baguales', 'Córdoba Rugby Club', 'Los Cuervos', 'Alta Gracia',
            'San Francisco', 'Santa Rosa de Córdoba', 'Río Tercero',
            'Aero Club Río Cuarto', 'Social La Carlota',
        ],
    },

    // ── LITORAL · Torneo Regional del Litoral · Nivel 2 / Nivel 4 ───────────
    // Torneo INTERUNIÓN de tres uniones (Rosario, Santafesina, Entrerriana).
    // Ninguna de las tres tiene liga propia de primera: el TRL ES su liga.
    {
        competitionId: 'ar-litoral-top10',
        label: 'Top 10 del Litoral',
        branch: 'interior', region: 'litoral', canonLevel: 2, band: 'n2Interior',
        regularSeasonMatches: 18,
        relegatesTo: 'ar-litoral-segunda', relegationSlots: 1,
        note: '18 fechas (dos ruedas) + semifinales y final. Desciende directo el último',
        clubs: [
            'Duendes', 'Jockey Club de Rosario', 'Gimnasia y Esgrima de Rosario',
            'Old Resian', 'Santa Fe Rugby Club', 'CRAI', 'Universitario de Rosario',
            'Estudiantes de Paraná', 'Paraná Rowing Club', 'Jockey Club de Venado Tuerto',
        ],
    },
    {
        competitionId: 'ar-litoral-segunda',
        label: 'Segunda del Litoral',
        branch: 'interior', region: 'litoral', canonLevel: 4, band: 'n4',
        regularSeasonMatches: 11,
        promotesTo: 'ar-litoral-top10', promotionSlots: 1,
        note: '11 fechas y después Copa de Oro (1°-6°, define campeón y ascenso directo) y Copa de Plata (7°-12°)',
        clubs: [
            'CRAR', 'Logaritmo', 'Universitario de Santa Fe', 'Alma Juniors',
            'Los Caranchos', 'Provincial', 'Tilcara', 'San Nicolás Rugby',
            'La Salle Jobson', 'Cha Roga', 'Los Pampas de Rufino',
            'Gimnasia y Esgrima de Pergamino',
        ],
    },

    // ── OESTE · Regional Cuyano · Nivel 2 / Nivel 4 / Nivel 6 ───────────────
    // La temporada arranca con los torneos provinciales (Mendoza y San Juan),
    // que reparten las plazas; el regional se juega en la segunda mitad del año
    // dividido en tres copas.
    {
        competitionId: 'ar-oeste-oro',
        label: 'Copa de Oro del Oeste',
        branch: 'interior', region: 'oeste', canonLevel: 2, band: 'n2Interior',
        regularSeasonMatches: 14,
        relegatesTo: 'ar-oeste-plata', relegationSlots: 1,
        note: '6 plazas de Mendoza + 2 de San Juan, repartidas por los torneos provinciales',
        clubs: [
            'Los Tordos', 'Marista', 'Mendoza Rugby Club', 'Liceo', 'CPBM',
            'Universitario de San Juan', 'San Juan Rugby Club', 'Teqüe Rugby Club',
        ],
    },
    {
        competitionId: 'ar-oeste-plata',
        label: 'Copa de Plata del Oeste',
        branch: 'interior', region: 'oeste', canonLevel: 4, band: 'n4',
        regularSeasonMatches: 14,
        promotesTo: 'ar-oeste-oro', promotionSlots: 1,
        relegatesTo: 'ar-oeste-bronce', relegationSlots: 1,
        note: '5 plazas de Mendoza + 3 de San Juan',
        clubs: [
            'Peumayén', 'Universitario de Mendoza', 'Huazihul', 'Banco Rugby Club',
            'Tacurú', 'Jockey Club de San Juan', 'Alfiles', 'Belgrano Rugby Club',
        ],
    },
    {
        // La Bronce SÍ existe y es el tercer nivel real del Oeste. Antes no se
        // modelaba porque el único club de ese nivel en el catálogo era San
        // Jorge y una liga de un equipo no reparte título: con Rivadavia —que
        // estaba mal puesto en la Plata— son dos, y la división se sostiene.
        competitionId: 'ar-oeste-bronce',
        label: 'Copa de Bronce del Oeste',
        branch: 'interior', region: 'oeste', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 12,
        promotesTo: 'ar-oeste-plata', promotionSlots: 1,
        note: 'los dos clubes con respaldo en el catálogo real; la nómina completa de la Bronce no se publica. El Torneo Reubicación (playoff Oro-Plata-Bronce) todavía no se modela',
        clubs: ['Rivadavia', 'San Jorge de Mendoza'],
    },

    // ── NOROESTE · Regional del NOA · Nivel 4 / Nivel 6 ─────────────────────
    // Organiza la Unión de Rugby de Tucumán. Integran Tucumán, Salta, Santiago
    // del Estero y Jujuy. La clasificación va en dos etapas: el Torneo Tucumano
    // reparte las plazas tucumanas y la Liga Norte Grande las del resto.
    // Jujuy integra la región pero no aporta clubes a ninguna de las dos.
    {
        competitionId: 'ar-noa-a',
        label: 'Regional del NOA A',
        branch: 'interior', region: 'noa', canonLevel: 4, band: 'n4',
        regularSeasonMatches: 18,
        relegatesTo: 'ar-noa-b', relegationSlots: 2,
        note: '8 clubes de Tucumán + 2 de Salta. El segundo club salteño no está confirmado oficialmente',
        clubs: [
            'Tucumán Rugby', 'Natación y Gimnasia', 'Tucumán Lawn Tennis', 'Huirapuca',
            'Universitario de Salta', 'Los Tarcos', 'Cardenales', 'Jockey Club de Salta',
            'Universitario de Tucumán', 'Lince',
        ],
    },
    {
        competitionId: 'ar-noa-b',
        label: 'Regional del NOA B',
        branch: 'interior', region: 'noa', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 14,
        promotesTo: 'ar-noa-a', promotionSlots: 2,
        note: 'Tucumán no tiene una Primera B de clubes propia: su segundo nivel se canaliza por acá y por el Torneo Desarrollo de la unión. Tigres y Old Lions bajaron del A en 2025. La Querencia entra en 2026.3: estaba puesta en el Desarrollo cordobés y juega el NOA',
        clubs: [
            'Tigres', 'Santiago Lawn Tennis', 'Gimnasia y Tiro', 'Old Lions',
            'Jockey Club de Tucumán', 'Tiro Federal de Salta', 'Santiago Rugby',
            'Aguará Guazú', 'La Querencia',
        ],
    },
    {
        // La Unión Andina (Catamarca y La Rioja) integra el NOA por abajo, no el
        // NEA ni el Litoral. Estos dos clubes estaban puestos a mil kilómetros de
        // su casa: Los Hurones es de Valle Viejo (Catamarca) y Los Teros, de la
        // capital catamarqueña.
        // 2026.3: entra la Unión Andina COMPLETA. Antes eran dos clubes —los dos
        // que tenían fila en el catálogo real— y ahora son los siete que juegan el
        // torneo.
        //
        // Los Chelcos vuelve a casa. El canon lo tenía en el Torneo de Desarrollo
        // de Córdoba con una nota que decía "está registrado en La Rioja pero juega
        // el torneo de Córdoba", y no es así: juega el Andino, que es el de su
        // unión. Con él y con La Querencia —que se fue al Regional del NOA B— el
        // Desarrollo cordobés se queda sin nómina y sale del canon (ver
        // `AR_NOT_MODELLED`).
        //
        // El nombre completo de CRAR va sin sigla y a propósito: "CRAR" ya es un
        // club del Litoral en este catálogo, y dos clubes distintos no pueden
        // compartir nombre. Es la misma solución que "San José de Paraguay".
        competitionId: 'ar-noa-andina',
        label: 'Torneo Andino (Catamarca y La Rioja)',
        branch: 'interior', region: 'noa', canonLevel: 7, band: 'n7',
        regularSeasonMatches: 12,
        promotesTo: 'ar-noa-b', promotionSlots: 1,
        note: 'la base del NOA: los siete clubes de la Unión Andina (Catamarca y La Rioja)',
        clubs: [
            'Los Teros', 'Los Hurones', 'Los Chelcos', 'Club Riojano Amigos del Rugby',
            'Catamarca Rugby Club', 'Los Matacos', 'Club Social Rugby',
        ],
    },

    // ── NORDESTE · Regional del Nordeste · Nivel 5 / Nivel 6 ────────────────
    // Uniones del Nordeste (Chaco + Corrientes), Misiones y Formosa. INCLUYE
    // DOS CLUBES PARAGUAYOS Y NO SE SACAN: San José (Asunción) y CURDA (Club
    // Universitario de Rugby de Asunción) entran por invitación como campeón y
    // subcampeón del Campeonato Paraguayo del año anterior, y compiten de igual
    // a igual — en 2026 los dos terminaron la primera rueda en zona de playoff.
    //
    // Y no son los únicos extranjeros del sistema: desde 2026.3, UMAG y The British
    // School (Punta Arenas) juegan la Unión Santacruceña por el mismo motivo —la
    // unión de al lado les queda más cerca que cualquier otra. El sistema son 260
    // clubes argentinos + 2 paraguayos + 2 chilenos.
    {
        competitionId: 'ar-nea-a',
        label: 'Regional NEA A',
        branch: 'interior', region: 'nea', canonLevel: 5, band: 'n5',
        regularSeasonMatches: 14,
        relegatesTo: 'ar-nea-bc', relegationSlots: 2,
        note: 'primera rueda de 9 partidos; los 8 primeros pasan a segunda ronda arrastrando puntos; 9° y 10° caen al Ascenso. Los 4 primeros a semis y final; 5°-8° juegan reválida',
        clubs: [
            'Taragüy', 'Aranduroga', 'CURNE', 'San Patricio de Corrientes',
            'Regatas Resistencia', 'CAPRI', 'Sixty', 'Aguará', 'San José de Paraguay',
            'CURDA',
        ],
    },
    {
        // NO es "el torneo de Ascenso": la zona Ascenso es la SEGUNDA FASE de la
        // tabla del Regional A, no un torneo aparte. El segundo nivel real del
        // NEA es el Regional B/C (cuatro zonas), al que se suman los torneos de
        // Desarrollo y los clasificatorios de cada unión. Acá van los clubes
        // reales de ese escalón, que son de tres uniones distintas: URNE (Chaco
        // y Corrientes), Formosa y Misiones.
        competitionId: 'ar-nea-bc',
        label: 'Regional del NEA B/C',
        branch: 'interior', region: 'nea', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 12,
        promotesTo: 'ar-nea-a', promotionSlots: 2,
        note: 'el Regional B/C real son 16 equipos en 4 zonas y la nómina completa no se publica. Pay Ubre y UNCAUS juegan además el clasificatorio de la URNE; Italiana de Charata y Abipones, el Torneo Desarrollo; Chajá y Caza y Pesca son de Formosa, y Carayá y Centro Cazadores de Misiones',
        clubs: [
            'Pay Ubre', 'UNCAUS', 'Italiana de Charata', 'Chajá', 'Centro Cazadores',
            'Carayá', 'Abipones', 'Caza y Pesca',
        ],
    },

    // ── PAMPEANA · Regional Pampeano · Nivel 5 / Nivel 6 ────────────────────
    // Mar del Plata + Unión del Sur (Bahía Blanca) + UROBA (Oeste de Buenos
    // Aires). Ninguna tiene regional propio: sus torneos locales son
    // clasificatorios a este.
    {
        competitionId: 'ar-pampeana-a',
        label: 'Regional Pampeano A',
        branch: 'interior', region: 'pampeana', canonLevel: 5, band: 'n5',
        regularSeasonMatches: 14,
        relegatesTo: 'ar-pampeana-b', relegationSlots: 2,
        note: 'etapa clasificatoria marplatense: dos zonas de 6 (Torneo A y Torneo B). Los 4 primeros del A van directo; los 2 últimos del A más los 2 primeros del B juegan un Final Four por los cupos restantes',
        clubs: [
            'Sociedad Sportiva de Bahía Blanca', 'Argentino de Bahía Blanca',
            'Mar del Plata Club', 'Universitario de Mar del Plata', 'IPR Sporting',
            'Comercial Rugby Club', 'Los Cardos', 'San Ignacio',
        ],
    },
    {
        competitionId: 'ar-pampeana-b',
        label: 'Regional Pampeano B',
        branch: 'interior', region: 'pampeana', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 14,
        promotesTo: 'ar-pampeana-a', promotionSlots: 2,
        note: 'la región tiene además una tercera división ("C") sin nómina conocida: no se inventa',
        clubs: [
            'Universitario de Bahía Blanca', 'Estudiantes de Olavarría', 'Los 50',
            'Biguá', 'Unión del Sur', 'Uncas', 'Pueyrredón de Mar del Plata',
            'Los Miuras',
        ],
    },

    // ── PATAGONIA · Regional Patagónico · Nivel 5 ───────────────────────────
    // Valle del Chubut, Austral, Alto Valle y Lagos del Sur. UNA SOLA división
    // de 8 equipos en 2 zonas de 4. Es la región más débil y la de calendario
    // más corto. Su segundo nivel son los torneos de cada unión (Nivel 7).
    {
        competitionId: 'ar-patagonia-regional',
        label: 'Regional Patagónico',
        branch: 'interior', region: 'patagonia', canonLevel: 5, band: 'n5',
        regularSeasonMatches: 6,
        relegatesTo: 'ar-patagonia-austral', relegationSlots: 1,
        note: '2 zonas de 4: 3 fechas todos contra todos, semifinales cruzadas y final',
        clubs: [
            'Trelew', 'Bigornia Club', 'Chenque', 'Roca', 'Neuquén',
            'Deportivo Portugués', 'Marabunta', 'Las Águilas',
        ],
    },
];

// ── LA BASE · TORNEOS LOCALES, DE DESARROLLO Y CLASIFICATORIOS ──────────────
//
// El canon cierra la pirámide con "torneos locales y de desarrollo de las
// uniones del interior". No es relleno: son los clubes REALES que juegan por
// debajo del regional de su región, y existen en el catálogo del sitio.
//
// No todos son Nivel 7. El que CLASIFICA al regional del año siguiente —el
// Torneo Austral en la Patagonia— es el segundo nivel de su región, no la base,
// y va en Nivel 6.
//
// Tienen que estar por dos motivos. Uno del canon: sin ellos el interior no
// tiene base y la pirámide se corta en el aire. Y uno del juego: si el club de
// alguien no está, no puede jugar en su club — que es el sentido de tener
// Argentina modelada.
//
// La nómina de cada uno sale del catálogo real; el orden, como en toda división
// de este archivo, es la decisión de fuerza.

const LOCAL_DIVISIONS: readonly ArDivision[] = [
    // NO HAY "Torneo Oficial de Desarrollo de Córdoba" ACÁ, y su ausencia es el
    // resultado de una corrección, no un olvido. La división existía en el canon
    // con dos clubes, y los dos estaban mal puestos: Los Chelcos es de la Unión
    // Andina y La Querencia juega el Regional del NOA. Movidos a su lugar, la
    // división se quedó sin un solo club — y una división sin nómina no se
    // sostiene con clubes prestados. Queda declarada en `AR_NOT_MODELLED` hasta que
    // aparezca su nómina real, que son ~24 equipos en tres zonas.
    {
        // Sin "Torneos Locales del Litoral": el TRL 2026 estrenó formato con DOS
        // divisiones (Primera de 10 y Segunda de 12) y eliminó la Tercera. Los
        // tres clubes que estaban acá no eran del Litoral y se fueron a su
        // región: Los Teros a la Andina, Centro Cazadores al NEA (Misiones) y
        // Belgrano Rugby Club a Cuyo (Mendoza).
        competitionId: 'ar-pampeana-uroba-sur',
        label: 'Regional Pampeano UROBA-Sur',
        branch: 'interior', region: 'pampeana', canonLevel: 7, band: 'n7',
        regularSeasonMatches: 12,
        promotesTo: 'ar-pampeana-b', promotionSlots: 1,
        note: 'la división real que clasifica al Regional Pampeano por la Unión del Sur y la UROBA. Cuatro de los seis clubes no están en el catálogo real y van sin escudo, declarados',
        clubs: [
            'El Nacional', 'Santa Rosa de La Pampa', 'Punta Alta Rugby Club',
            'Pico Rugby Club', 'Kamikazes de Colón', 'Los Indios de Bolívar',
        ],
    },
    // ── PATAGONIA · UNA COMPETICIÓN POR UNIÓN (2026.3) ──────────────────────
    //
    // EL SISTEMA PATAGÓNICO TIENE TRES NIVELES Y ANTES ACÁ HABÍA UNO SOLO. Cada
    // unión juega su campeonato en la primera parte del año; después los mejores
    // clubes de esas uniones disputan el Regional Patagónico, que es la
    // competencia que reúne a toda la región; y desde la reforma de la UAR de 2025
    // las plazas al Torneo del Interior ya no salen directamente de ahí sino del
    // mérito deportivo de la temporada anterior.
    //
    // Hasta 2026.2 todo lo que estaba debajo del Regional vivía en una sola
    // división llamada "Torneo Austral y locales patagónicos", y eso metía en el
    // mismo torneo a un club de Ushuaia y a uno de Cinco Saltos —1.800 km— que es
    // exactamente el error que la auditoría 2026-27.10 corrigió en el resto del
    // interior. Ahora hay una competición por unión, igual que hay una por región
    // en el NOA o en el Litoral.
    //
    // NIVEL 6 las tres uniones cuyos clubes son habituales en el Regional (Austral
    // con Chubut, y Alto Valle); NIVEL 7 Santa Cruz y Tierra del Fuego, cuya
    // presencia en el Regional varió según la temporada y el formato aprobado por
    // la UAR, y el desarrollo del Valle del Chubut.
    //
    // UN CLUB, UNA COMPETICIÓN: los que juegan el Regional Patagónico no se repiten
    // acá abajo aunque también disputen el torneo de su unión. Marabunta, Neuquén y
    // Roca no están en el Alto Valle; Las Águilas no está en Tierra del Fuego;
    // Trelew y Bigornia no están en el Austral. Están arriba.
    {
        competitionId: 'ar-patagonia-austral',
        label: 'Torneo Austral (Valle del Chubut y Austral)',
        branch: 'interior', region: 'patagonia', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 14,
        promotesTo: 'ar-patagonia-regional', promotionSlots: 1,
        note: 'el Torneo Austral lo juegan juntas la Unión del Valle del Chubut y la Unión de Rugby Austral, y es CLASIFICATORIO al Regional Patagónico: es el segundo nivel de la región, no su base. Puerto Madryn, finalista del Regional 2025, encabeza la nómina',
        clubs: [
            'Puerto Madryn', 'Comodoro', 'Calafate', 'Patoruzú',
            'Universitario de Comodoro', 'Draig Goch', 'Los Cóndores', 'Huergo',
            'Cazones', 'San Jorge de la Austral',
        ],
    },
    {
        // La unión más grande de la Patagonia: quince clubes afiliados, de los
        // cuales los tres más fuertes (Marabunta, Neuquén y Roca) están en el
        // Regional. Quedan doce acá.
        //
        // "Aguará del Alto Valle" lleva el sufijo porque Aguará es un club del NEA
        // que ya está en este catálogo, y dos clubes distintos no pueden compartir
        // nombre. Mismo criterio que "San José de Paraguay".
        competitionId: 'ar-patagonia-alto-valle',
        label: 'Torneo del Alto Valle',
        branch: 'interior', region: 'patagonia', canonLevel: 6, band: 'n6',
        regularSeasonMatches: 14,
        promotesTo: 'ar-patagonia-regional', promotionSlots: 1,
        note: 'la Unión de Rugby del Alto Valle (Neuquén y Río Negro) tiene 15 afiliados; tres juegan el Regional y estos doce, su torneo',
        clubs: [
            'Cipolletti', 'Allen', 'Trébol', 'Cinco Saltos', 'CUC', 'Regina',
            'Patagonia Rugby Club', 'Catriel', 'Dinos', 'Los Patos', 'Zorros',
            'Aguará del Alto Valle',
        ],
    },
    {
        // Nueve clubes afiliados, de los cuales Las Águilas juega el Regional.
        // Ocho unions provinciales de la isla más austral del sistema: Ushuaia,
        // Río Grande y Tolhuin.
        competitionId: 'ar-patagonia-tdf',
        label: 'Torneo de Tierra del Fuego',
        branch: 'interior', region: 'patagonia', canonLevel: 7, band: 'n7',
        regularSeasonMatches: 10,
        promotesTo: 'ar-patagonia-austral', promotionSlots: 1,
        note: 'la URTF tiene 9 afiliados; Las Águilas juega el Regional y estos ocho, el provincial. Su presencia en el Regional Patagónico varía según la temporada',
        clubs: [
            'Universitario de Río Grande', 'Ushuaia Rugby Club', 'Los Gallos',
            'Río Grande Rugby & Hockey', 'Colegio del Sur', 'Orcas', 'Turu',
            'Tolhuin',
        ],
    },
    {
        // DOS CLUBES CHILENOS Y NO SE SACAN, exactamente como los dos paraguayos
        // del NEA: UMAG (Universidad de Magallanes) y The British School son de
        // Punta Arenas y compiten en la Unión Santacruceña, porque Río Gallegos
        // está más cerca de Punta Arenas que de cualquier otra ciudad con rugby.
        // O sea: el sistema son clubes argentinos + 2 paraguayos + 2 chilenos.
        //
        // "El Calafate Rugby & Hockey" es de El Calafate (Santa Cruz) y NO es el
        // "Calafate" del Torneo Austral, que es de Comodoro Rivadavia. Son dos
        // clubes distintos con nombres parecidos y por eso van escritos completos.
        competitionId: 'ar-patagonia-santacruz',
        label: 'Torneo Santacruceño',
        branch: 'interior', region: 'patagonia', canonLevel: 7, band: 'n7',
        regularSeasonMatches: 10,
        promotesTo: 'ar-patagonia-austral', promotionSlots: 1,
        note: 'la Unión Santacruceña, con los dos clubes de Punta Arenas que compiten en ella. Su presencia en el Regional Patagónico varía según la temporada',
        clubs: [
            'Macá Tobiano', 'Coseba', 'El Calafate Rugby & Hockey', 'Los Guanacos',
            'UMAG', 'The British School',
        ],
    },
    {
        // Los clubes de desarrollo del Valle del Chubut. Dos de los cuatro son de
        // Río Negro (Valcheta y Valle Medio) y aun así compiten acá: la geografía
        // patagónica hace que la unión más cercana no sea siempre la de la
        // provincia. Se cargan donde juegan, no donde el mapa diría.
        //
        // "Albatros del Chubut" lleva sufijo porque Albatros es un club de la
        // Segunda de la URBA que ya está en el catálogo.
        //
        // Los Dinos no está acá aunque la nómina de desarrollo lo nombre: es el
        // mismo club que el Dinos del Alto Valle, y se carga una sola vez.
        competitionId: 'ar-patagonia-chubut-desarrollo',
        label: 'Desarrollo del Valle del Chubut',
        branch: 'interior', region: 'patagonia', canonLevel: 7, band: 'n7',
        regularSeasonMatches: 8,
        promotesTo: 'ar-patagonia-austral', promotionSlots: 1,
        note: 'los clubes de desarrollo de la Unión del Valle del Chubut; Valcheta y Valle Medio son rionegrinos y compiten igual acá',
        clubs: ['Los Jabalíes', 'Valle Medio', 'Valcheta', 'Albatros del Chubut'],
    },
];

export const AR_DIVISIONS: readonly ArDivision[] = [
    ...URBA_DIVISIONS,
    ...INTERIOR_DIVISIONS,
    ...LOCAL_DIVISIONS,
];

// ── TORNEO DEL INTERIOR · reparto de cupos 2026 ─────────────────────────────
//
// LAS PLAZAS NO PERTENECEN AL CLUB, PERTENECEN A LA REGIÓN. El reglamento dice
// que participan los 16 clasificados en los torneos regionales del año
// anterior, "según las plazas correspondientes a cada región por el mérito
// deportivo del Torneo del Interior de la edición anterior".
//
// Consecuencia: no hay ascenso ni descenso de clubes entre TDI A y TDI B. Un
// campeón del TDI A puede terminar jugando el B dos años después si su regional
// lo relega — le pasó a Tucumán Lawn Tennis, campeón del A en 2024 y en el B en
// 2026.
//
// Este es el estado INICIAL 2026. El ciclo anual que reasigna las plazas
// (tabla general de 1 a 32, reválidas de los puestos 29-32) todavía no está
// modelado: los cupos son fijos.

export interface TdiCupos {
    region: ArRegion;
    /** Primera división regional de la que salen los clasificados. */
    sourceCompetitionId: string;
    tdiA: number;
    tdiB: number;
}

export const TDI_CUPOS_2026: readonly TdiCupos[] = [
    { region: 'centro', sourceCompetitionId: 'ar-centro-top10', tdiA: 6, tdiB: 2 },
    { region: 'litoral', sourceCompetitionId: 'ar-litoral-top10', tdiA: 6, tdiB: 2 },
    { region: 'oeste', sourceCompetitionId: 'ar-oeste-oro', tdiA: 2, tdiB: 3 },
    { region: 'noa', sourceCompetitionId: 'ar-noa-a', tdiA: 1, tdiB: 6 },
    { region: 'nea', sourceCompetitionId: 'ar-nea-a', tdiA: 1, tdiB: 0 },
    { region: 'pampeana', sourceCompetitionId: 'ar-pampeana-a', tdiA: 0, tdiB: 3 },
    { region: 'patagonia', sourceCompetitionId: 'ar-patagonia-regional', tdiA: 0, tdiB: 0 },
];

export const TDI_A_SLOTS = 16;
export const TDI_B_SLOTS = 16;

/** Id del torneo que corona al campeón del interior. */
export const TDI_A_ID = 'ar-tdi-a';
export const TDI_B_ID = 'ar-tdi-b';
/** La única competición del año donde se cruzan las dos ramas. */
export const NACIONAL_DE_CLUBES_ID = 'ar-nacional-de-clubes';

// ── API ─────────────────────────────────────────────────────────────────────

const BY_ID = new Map(AR_DIVISIONS.map((d) => [d.competitionId, d]));

export function arDivisionOf(competitionId: string): ArDivision | null {
    return BY_ID.get(competitionId) ?? null;
}

/** ¿Ese id es una división del sistema argentino? */
export function isArDivision(competitionId: string): boolean {
    return BY_ID.has(competitionId);
}

/** Clave de sistema doméstico (unión/región) de una división argentina. */
export function arRegionOf(competitionId: string): ArRegion | null {
    return BY_ID.get(competitionId)?.region ?? null;
}

export function arBranchOf(competitionId: string): ArBranch | null {
    return BY_ID.get(competitionId)?.branch ?? null;
}

/**
 * Rating de un club por su POSICIÓN DECLARADA dentro de la división: se reparte
 * la banda de la división de forma pareja, del techo al piso. Determinístico y
 * sin hash — el mismo club tiene el mismo rating hoy y en seis meses.
 */
export function arRatingAt(division: ArDivision, index: number): number {
    const [lo, hi] = AR_RATING_BANDS[division.band];
    const total = division.clubs.length;
    if (total <= 1) return hi;
    const span = hi - lo;
    return Math.round(hi - (span * index) / (total - 1));
}

/**
 * Prestigio: historia y capacidad de atraer jugadores. Arranca del nivel de la
 * división (un club de Primera C no tiene el arrastre de uno del Top 14) y se
 * corrige a mano SOLO para los clubes cuya historia no coincide con dónde están
 * hoy — el club grande venido a menos y el que nunca estuvo arriba.
 */
const AR_PRESTIGE_OVERRIDE: Readonly<Record<string, number>> = {
    // Los grandes históricos de la URBA: su arrastre supera a su rating.
    CASI: 52, SIC: 52, Newman: 50, Alumni: 50, 'Belgrano Athletic': 48,
    'Hindú Club': 47, CUBA: 47, 'Buenos Aires': 45, 'Atlético del Rosario': 46,
    // Los máximos ganadores del Torneo del Interior.
    Duendes: 48, 'La Tablada': 47, 'Jockey Club de Rosario': 45,
    'Jockey Club Córdoba': 45, 'Córdoba Athletic': 44,
    // Campeón del TDI A 2024 que en 2026 juega el B: la historia le queda grande.
    'Tucumán Lawn Tennis': 42, 'Tucumán Rugby': 42,
    'Los Tordos': 40, 'Mendoza Rugby Club': 39,
    Taragüy: 36, 'Sociedad Sportiva de Bahía Blanca': 34,
};

/** Prestigio base por nivel del canon. */
const AR_PRESTIGE_BY_LEVEL: Readonly<Record<CanonLevel, number>> = {
    1: 44, 2: 38, 3: 33, 4: 29, 5: 26, 6: 23, 7: 20,
};

export function arPrestigeOf(division: ArDivision, clubName: string, index: number): number {
    const override = AR_PRESTIGE_OVERRIDE[clubName];
    if (override !== undefined) return override;
    const base = AR_PRESTIGE_BY_LEVEL[division.canonLevel];
    // Dentro de la división, el orden de fuerza mueve el prestigio apenas: el
    // prestigio es historia, no la tabla de esta temporada.
    const total = Math.max(1, division.clubs.length - 1);
    return Math.round(base - (index / total) * 4);
}

/** Todos los nombres de club del canon, en orden estable de división. */
export function arCanonClubNames(): { name: string; division: ArDivision; index: number }[] {
    return AR_DIVISIONS.flatMap((division) =>
        division.clubs.map((name, index) => ({ name, division, index })),
    );
}

/** Conteo exigido por división (gate del catálogo). */
export function arExpectedCounts(): Record<string, number> {
    return Object.fromEntries(AR_DIVISIONS.map((d) => [d.competitionId, d.clubs.length]));
}

/**
 * Divisiones que el canon nombra pero cuya nómina real no está publicada. Se
 * documentan como pendientes en vez de inventarlas o de fingir que están
 * completas.
 */
export const AR_PENDING_ROSTERS: readonly { competitionId: string; note: string }[] = [
    { competitionId: 'ar-nea-bc', note: 'el Regional B/C son 16 equipos en 4 zonas; hay 8 identificados en el catálogo real' },
    { competitionId: 'ar-oeste-bronce', note: 'la Copa de Bronce no publica nómina; hay 2 clubes identificados' },
    { competitionId: 'ar-pampeana-uroba-sur', note: '4 de los 6 clubes no tienen fila en el catálogo real y van sin escudo' },
    // 2026.3: la Patagonia pasó de una división lump a una por unión, y casi
    // ninguno de sus clubes tiene fila en el catálogo real. Están declarados como
    // pendientes de escudo, no de nómina: los planteles son los afiliados reales de
    // cada unión.
    { competitionId: 'ar-patagonia-alto-valle', note: 'los 12 clubes son los afiliados reales de la URAV; casi ninguno tiene fila en el catálogo real y van sin escudo' },
    { competitionId: 'ar-patagonia-tdf', note: 'los 8 clubes son los afiliados reales de la URTF; van sin escudo' },
    { competitionId: 'ar-patagonia-santacruz', note: 'los 6 clubes son los de la Unión Santacruceña, con los dos de Punta Arenas; van sin escudo' },
    { competitionId: 'ar-patagonia-chubut-desarrollo', note: 'los clubes de desarrollo de la URVCh; van sin escudo' },
];

/**
 * Competiciones que el canon NOMBRA pero que no se modelan como división, con el
 * motivo. Se declara para que la ausencia sea una decisión leída y no un olvido.
 */
export const AR_NOT_MODELLED: readonly { label: string; reason: string }[] = [
    {
        label: 'Regional Pampeano C',
        reason: 'el canon la menciona sin nómina conocida: no se inventa',
    },
    {
        label: 'Torneo Oficial de Desarrollo de Córdoba',
        reason: 'existía como división del canon con dos clubes, y los dos estaban mal ubicados: Los Chelcos es de la Unión Andina y La Querencia juega el Regional del NOA. Corregidos, la división se quedó sin nómina — son ~24 equipos en 3 zonas y no hay lista publicada, así que se declara en vez de sostenerla con clubes prestados',
    },
    {
        label: 'Unión de Rugby de los Lagos del Sur',
        reason: 'la unión existe y aporta clubes al Regional Patagónico, pero no tenemos su nómina de afiliados. Su club más conocido, Los Jabalíes (El Bolsón), compite en el desarrollo del Valle del Chubut y está cargado ahí',
    },
    {
        label: 'Torneo Reubicación del Oeste',
        reason: 'es el playoff que reordena Oro, Plata y Bronce al cierre; el motor resuelve ascensos y descensos con `promotesTo`/`relegatesTo` y todavía no modela playoffs entre tres divisiones',
    },
    {
        label: 'Liga Norte Grande',
        reason: 'clasificatorio de Salta y Santiago del Estero que corre ANTES del Regional del NOA: reparte plazas, no reparte título propio',
    },
    {
        label: 'Torneo Tucumano',
        reason: 'lo mismo del lado tucumano: reparte las plazas del NOA A',
    },
];

// ── PUENTE CON EL CATÁLOGO REAL ─────────────────────────────────────────────
//
// Los clubes de este archivo se declaran con su nombre CANÓNICO, pero el
// escudo real de cada uno se pide con el `sourceId` de la fila de Supabase
// (`crestKeyOf`). Si el nombre canónico no encuentra su fila, el club pierde el
// escudo y cae al monograma — inaceptable: en este proyecto los equipos van
// siempre con escudo real.
//
// El cruce se hace por nombre normalizado (sin acentos, sin puntuación y sin las
// palabras de relleno: "Club", "Rugby", "R.C.", "de", "la"…). Donde eso no
// alcanza va un alias EXPLÍCITO. No hay coincidencia difusa ni umbral de
// parecido: o el nombre normaliza igual, o hay alias, o el club es nuevo.
//
// Los dos casos que obligan a alias explícito y no a mejor normalización:
//   · las siglas, que no se parecen a nada ("SIC" ≠ "San Isidro Club");
//   · los HOMÓNIMOS, donde dos filas normalizan igual y hay que decir cuál es
//     cuál — el San Patricio de la URBA y el de Corrientes son dos clubes, y el
//     canon prohíbe fusionarlos.
export const AR_SNAPSHOT_ALIAS: Readonly<Record<string, string>> = {
    // Siglas y nombres de fantasía.
    SIC: 'San Isidro Club',
    'Universitario de Quilmes': 'CUQ',
    CPBM: 'C.P.B.M.',
    'Social La Carlota': 'C.S. La Carlota',
    'Aero Club Río Cuarto': 'Aero Club Río IV',
    Tacurú: 'Tacurú Rugby Hockey Club',
    'San Nicolás Rugby': 'Regatas Belgrano San Nicolás', // la fusión de 2019
    // HOMÓNIMOS: el orden importa, cada uno apunta a SU fila.
    'San Patricio': 'Club San Patricio', // URBA Primera B
    'San Patricio de Corrientes': 'San Patricio', // Regional NEA A
    'San Jorge de Mendoza': 'San Jorge R.C.',
    'San Jorge de la Austral': 'San Jorge R.C. (UA)',
    'Santa Rosa de La Pampa': 'Santa Rosa R.C.',
};

/**
 * Filas del catálogo real que quedan FUERA del sistema argentino, con el motivo.
 * Se registran para no perderlas de vista:
 *
 *   · Policía Ciudad de Buenos Aires no aparece en ninguna de las divisiones que
 *     el canon nombra, y meterlo en Desarrollo rompería el plantel de 10 que el
 *     canon declara;
 *   · "Jockey Club Córdoba Caballeros" NO ES UN CLUB: es el Torneo
 *     Interprovincial Caballeros (veteranos) del Jockey Club Córdoba, que ya
 *     juega el Top 10 A. Ponerlo en la pirámide de mayores lo duplicaba.
 */
export const AR_SNAPSHOT_UNPLACED: readonly string[] = [
    'Policia Ciudad de Buenos Aires',
    'Jockey Club Córdoba Caballeros',
];
