// SEMILLA del catálogo 2026-27 (Fase 2.5). Nombres de clubes aportados por el
// usuario (solo nombres; los puntos/posiciones de las tablas se ignoran, son una
// foto de temporada). Los clubes de Argentina/Uruguay/Chile NO van acá: se cargan
// desde Supabase por DI. El "level" y "rating" son de DISEÑO del juego (genéricos),
// según la tabla de niveles acordada — no ratings oficiales.
//
// Regla dura: ningún club amateur (AR/UY/CL) supera rating 46 (se aplica en el loader Supabase).

export type ClubLevel =
    | 'elite-world' // Top 14, PREM, URC, Super Rugby
    | 'elite-pro' // Japan League One D1
    | 'pro-second' // Pro D2, Championship, NPC, Japan D2
    | 'pro-regional' // Nationale, Currie Cup Premier, Super Rugby Americas
    | 'semipro' // Rugby Europe Super Cup, España DH, Japan D3
    | 'development' // España DH Élite, Currie Cup First Division
    | 'amateur'; // AR/UY/CL (desde Supabase)

// Estatus profesional del club. Por defecto se deriva del nivel, pero una
// competición puede declararlo explícitamente cuando el nivel deportivo y el
// profesionalismo no coinciden (caso Super Rugby Americas: nivel regional,
// franquicias 100% profesionales).
export type ProfessionalStatus = 'professional' | 'semi' | 'amateur';

// Banda de REFERENCIA por nivel (fallback). El rating real de cada club es
// EXPLÍCITO (clubStrength.ts) y puede caer fuera de la banda cuando un club es
// notoriamente fuerte o flojo dentro de su competición (ej. Leinster vs Zebre).
export const LEVEL_RATING: Record<ClubLevel, [number, number]> = {
    'elite-world': [80, 96],
    'elite-pro': [76, 91],
    'pro-second': [64, 82],
    'pro-regional': [58, 76],
    semipro: [48, 64],
    development: [40, 54],
    amateur: [24, 46],
};

export interface RosterGroup {
    competitionId: string;
    label: string;
    countryCode: string; // país sede (o 'multi' para franquicias regionales)
    region: string;
    level: ClubLevel;
    kind: 'domestic-league' | 'regional-franchise';
    /** Override explícito cuando el nivel deportivo no refleja el profesionalismo. */
    professionalStatus?: ProfessionalStatus;
    clubs: string[]; // nombres reales
}

export const ROSTERS_2026_27: RosterGroup[] = [
    {
        competitionId: 'top14', label: 'Top 14', countryCode: 'fr', region: 'europe', level: 'elite-world', kind: 'domestic-league',
        clubs: ['Stade Toulousain', 'Union Bordeaux-Bègles', 'Stade Rochelais', 'Racing 92', 'Stade Français', 'ASM Clermont', 'Section Paloise', 'Montpellier', 'RC Toulon', 'Castres Olympique', 'LOU Rugby', 'Aviron Bayonnais', 'USA Perpignan', 'RC Vannes'],
    },
    {
        competitionId: 'prod2', label: 'Pro D2', countryCode: 'fr', region: 'europe', level: 'pro-second', kind: 'domestic-league',
        clubs: ['Colomiers Rugby', 'Provence Rugby', 'Oyonnax', 'Valence Romans', 'CA Brive', 'SU Agen', 'FC Grenoble', 'Soyaux-Angoulême XV', 'Biarritz Olympique', 'US Dax', 'AS Béziers', 'USON Nevers', 'Stade Aurillacois', 'Nissa Rugby', 'RC Narbonnais', 'US Montauban'],
    },
    {
        // Nationale 2026/27 (FFR): sin Narbonne/Niçois (ascendidos a Pro D2) ni
        // duplicar Chambéry (= SOC Savoie). 14 clubes.
        competitionId: 'nationale', label: 'Nationale', countryCode: 'fr', region: 'europe', level: 'pro-regional', kind: 'domestic-league',
        clubs: ['Albi', 'Périgueux', 'Bourgoin', 'Vienne', 'Marcq', 'Orléans', 'Rennes', 'Rouen', 'Massy', 'Suresnes', 'US Bressane', 'Carcassonne', 'Chambéry', 'Stade Montois'],
    },
    {
        competitionId: 'prem', label: 'Gallagher PREM', countryCode: 'gb-eng', region: 'europe', level: 'elite-world', kind: 'domestic-league',
        clubs: ['Bath', 'Bristol Bears', 'Exeter Chiefs', 'Gloucester', 'Harlequins', 'Leicester Tigers', 'Newcastle Red Bulls', 'Northampton Saints', 'Sale Sharks', 'Saracens'],
    },
    {
        competitionId: 'championship', label: 'Championship', countryCode: 'gb-eng', region: 'europe', level: 'pro-second', kind: 'domestic-league',
        clubs: ['Ealing Trailfinders', 'Bedford Blues', 'Coventry', 'Worcester Warriors', 'Chinnor', 'Hartpury University', 'Cornish Pirates', 'Doncaster Knights', 'Nottingham', 'Ampthill', 'Caldy', 'Richmond', 'London Scottish', 'Cambridge'],
    },
    {
        competitionId: 'urc', label: 'URC', countryCode: 'multi', region: 'europe-sa', level: 'elite-world', kind: 'regional-franchise',
        clubs: ['Leinster', 'Munster', 'Ulster', 'Connacht', 'Glasgow Warriors', 'Edinburgh Rugby', 'Ospreys', 'Scarlets', 'Cardiff Rugby', 'Dragons', 'Benetton Treviso', 'Zebre Parma', 'Bulls', 'Stormers', 'Sharks', 'Lions'],
    },
    {
        competitionId: 'super-rugby', label: 'Super Rugby Pacific', countryCode: 'multi', region: 'pacific', level: 'elite-world', kind: 'regional-franchise',
        clubs: ['Hurricanes', 'Chiefs', 'Crusaders', 'Blues', 'Reds', 'Brumbies', 'Western Force', 'Waratahs', 'Highlanders', 'Fijian Drua', 'Moana Pasifika'],
    },
    {
        competitionId: 'npc', label: 'NPC', countryCode: 'nz', region: 'pacific', level: 'pro-second', kind: 'domestic-league',
        clubs: ['Auckland', 'Bay of Plenty', 'Canterbury', 'Counties Manukau', "Hawke's Bay", 'Manawatu', 'North Harbour', 'Northland', 'Otago', 'Southland', 'Taranaki', 'Tasman', 'Waikato', 'Wellington'],
    },
    {
        competitionId: 'currie-premier', label: 'Currie Cup Premier', countryCode: 'za', region: 'africa', level: 'pro-regional', kind: 'domestic-league',
        clubs: ['Free State Cheetahs', 'Natal Sharks', 'Boland Kavaliers', 'Western Province', 'Golden Lions', 'Pumas', 'Griquas', 'Blue Bulls'],
    },
    {
        competitionId: 'currie-first', label: 'Currie Cup First Division', countryCode: 'za', region: 'africa', level: 'development', kind: 'domestic-league',
        clubs: ['SWD Eagles', 'EP Elephants', 'Valke', 'Leopards', 'Griffons', 'Border Bulldogs'],
    },
    {
        competitionId: 'super-cup', label: 'Rugby Europe Super Cup', countryCode: 'multi', region: 'europe-emerging', level: 'semipro', kind: 'regional-franchise',
        clubs: ['Castilla y León Iberians', 'Lusitanos XV', 'Brussels Devils', 'Delta', 'Bohemia Rugby Warriors', 'Romanian Wolves'],
    },
    {
        // Super Rugby Americas 2026: la competición REGIONAL PROFESIONAL de
        // Sudamérica (8 franquicias). Reemplaza a la inventada "Copa Sudamericana":
        // no es una copa eliminatoria, es una liga regional, y sus franquicias NO
        // son los clubes domésticos AR/UY/CL (esos llegan por Supabase).
        // Fuente: https://www.superrugbyamericas.com/
        competitionId: 'sra', label: 'Super Rugby Americas', countryCode: 'multi', region: 'south-america',
        level: 'pro-regional', kind: 'regional-franchise', professionalStatus: 'professional',
        clubs: ['Dogos XV', 'Peñarol Rugby', 'Pampas', 'Selknam', 'Cobras Brasil Rugby', 'Tarucas', 'Yacaré XV', 'Capibaras XV'],
    },
    {
        // España 2026/27 (FER): DH = 10 clubes. (DH B = 32 clubes en 4 grupos:
        // roster no publicado en texto por FER — pendiente de cargar, NO se inventa.)
        competitionId: 'esp-dh', label: 'División de Honor', countryCode: 'es', region: 'europe-emerging', level: 'semipro', kind: 'domestic-league',
        clubs: ['VRAC Valladolid', 'Aparejadores Burgos', 'Alcobendas', 'Complutense Cisneros', 'Pozuelo', 'La Vila', 'Liceo Francés', 'Ordizia', 'Santboiana', 'El Salvador'],
    },
    {
        competitionId: 'esp-dhelite', label: 'División de Honor Élite', countryCode: 'es', region: 'europe-emerging', level: 'development', kind: 'domestic-league',
        clubs: ['Barça Rugby', 'Sant Cugat', 'Getxo', 'Hernani', 'Gernika', 'Real Ciencias Sevilla', 'Fénix Zaragoza', 'Les Abelles', 'RC Valencia', 'Industriales'],
    },
    {
        // DHB 2026/27 (iSquad): Grupos A+B+C = 24 clubes verificados. Grupo D (8)
        // sin fixtures publicados aún → pendiente documentado (PENDING_COMPETITIONS).
        competitionId: 'esp-dhb', label: 'División de Honor B', countryCode: 'es', region: 'europe-emerging', level: 'development', kind: 'domestic-league',
        clubs: [
            // Grupo A
            'Aranda', 'Cormorán Santander', 'Belenos', 'Universitario Bilbao', 'La Única', 'Gaztedi', 'Arrasate', 'Gipuzkoa Sortzen',
            // Grupo B
            'Akra Bárbara', 'Barcelona Universitari', 'Natació Poble Nou', 'CAU Valencia', 'El Toro', "L'Hospitalet", 'Sitges', 'VPC Andorra',
            // Grupo C
            'CAR Sevilla', 'Soto del Real', 'Cisneros Zeta', 'Jaén', 'Alcobendas B', 'Alcalá', 'CAR Cáceres', 'Majadahonda',
        ],
    },
    {
        competitionId: 'jpn-d1', label: 'Japan League One D1', countryCode: 'jp', region: 'asia', level: 'elite-pro', kind: 'domestic-league',
        clubs: ['Saitama Wild Knights', 'Toshiba Brave Lupus Tokyo', 'Kubota Spears', 'Yokohama Canon Eagles', 'Tokyo Sungoliath', 'Kobelco Kobe Steelers', 'Toyota Verblitz', 'Shizuoka BlueRevs', 'Urayasu D-Rocks', 'Mie Honda Heat', 'Mitsubishi Sagamihara Dynaboars', 'BlackRams Tokyo'],
    },
    {
        competitionId: 'jpn-d2', label: 'Japan League One D2', countryCode: 'jp', region: 'asia', level: 'pro-second', kind: 'domestic-league',
        clubs: ['Green Rockets Tokatsu', 'Kyuden Voltex', 'Shimizu Koto Blue Sharks', 'Toyota Industries Shuttles Aichi', 'Kamaishi Seawaves', 'Hanazono Kintetsu Liners', 'Hino Red Dolphins', 'RedHurricanes Osaka'],
    },
    {
        // D3 2026/27 = 7 clubes (nuevo: AZ-COM MARUWA Momotaro's). NO usar el
        // roster 2025/26 que tenía 6.
        competitionId: 'jpn-d3', label: 'Japan League One D3', countryCode: 'jp', region: 'asia', level: 'semipro', kind: 'domestic-league',
        clubs: ['Kurita Water Gush Akishima', 'Sayama Secom Rugguts', 'Chugoku Red Regulions', 'Skyactivs Hiroshima', 'Yakult Levins Toda', 'LeRIRO Fukuoka', "AZ-COM MARUWA Momotaro's"],
    },
];

// Temporada del catálogo. Todo club/competición debe ser de ESTA temporada; no
// se mezclan rosters de temporadas distintas (validado por tests).
export const CATALOG_SEASON = '2026-27';

// Conteo EXIGIDO por competición (gate del importador). Si un roster no coincide,
// el test falla — evita mezclar temporadas o rosters incompletos.
export const EXPECTED_COUNTS: Record<string, number> = {
    top14: 14, prod2: 16, nationale: 14,
    prem: 10, championship: 14,
    urc: 16, 'super-rugby': 11, npc: 14,
    'currie-premier': 8, 'currie-first': 6, 'super-cup': 6, sra: 8,
    'esp-dh': 10, 'esp-dhelite': 10, 'esp-dhb': 24, // DHB A+B+C cargados; Grupo D pendiente
    'jpn-d1': 12, 'jpn-d2': 8, 'jpn-d3': 7, // Japón total = 27
};

// DHB objetivo 2026/27 = 32 (4 grupos de 8). Cargados A/B/C (24) desde iSquad.
export const ESP_DHB_TARGET = 32;

// Grupos/competiciones cuyo roster real todavía NO publica iSquad. Se documentan
// como pendientes (no se inventan) y NO bloquean el resto del grafo.
export const PENDING_COMPETITIONS: { competitionId: string; label: string; level: ClubLevel; expectedCount: number }[] = [
    { competitionId: 'esp-dhb-grupo-d', label: 'DHB · Grupo D', level: 'development', expectedCount: 8 },
];
