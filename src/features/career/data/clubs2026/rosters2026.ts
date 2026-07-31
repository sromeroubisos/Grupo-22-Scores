// SEMILLA del catálogo 2026-27 (Fase 2.5). Nombres de clubes aportados por el
// usuario (solo nombres; los puntos/posiciones de las tablas se ignoran, son una
// foto de temporada). Los clubes de Argentina/Uruguay/Chile NO van acá: se cargan
// desde Supabase por DI. El "level" y "rating" son de DISEÑO del juego (genéricos),
// según la tabla de niveles acordada — no ratings oficiales.
//
// Regla dura del rugby amateur: su techo queda DEBAJO del piso profesional de la
// región (la franquicia más floja de Super Rugby Americas está en 56), para que
// dar el salto siga siendo un salto. Uruguay y Chile topean en 46 (lo aplica el
// loader de Supabase); Argentina llega a 52 porque su pirámide tiene siete
// niveles declarados y no entran en 23 puntos sin pisarse — ver
// `arSystem2026.ts`, AR_RATING_BANDS.

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
    amateur: [24, 52],
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

    // ── PISO AMATEUR DE CADA PIRÁMIDE ────────────────────────────────────────
    //
    // Antes el catálogo se cortaba en Nationale (Francia), Championship
    // (Inglaterra), NPC (Nueva Zelanda), Currie Cup First (Sudáfrica) y League
    // One D3 (Japón), que ya son competiciones profesionales o mixtas. La
    // consecuencia era concreta y estaba documentada como limitación: elegir la
    // ruta AMATEUR en esos países no daba una carrera amateur — degradaba en
    // silencio a un club profesional.
    //
    // Estos escalones existen para que la ruta amateur tenga de dónde elegir en
    // todos lados. Son competiciones REALES; los rosters son representativos y
    // no la lista oficial publicada de la temporada (evidencia
    // 'game-calibration' en competition-levels2026.ts). No se inventan
    // competiciones: se modela el piso que ya existe en el rugby de cada país.

    {
        // Heartland Championship: las uniones provinciales de NZ que no están en
        // el NPC. Rugby de club amateur, con jugadores que trabajan.
        competitionId: 'nz-heartland', label: 'Heartland Championship', countryCode: 'nz', region: 'pacific', level: 'amateur', kind: 'domestic-league',
        clubs: ['Wanganui', 'South Canterbury', 'Thames Valley', 'North Otago', 'Mid Canterbury', 'King Country', 'Wairarapa Bush', 'Horowhenua Kapiti', 'Poverty Bay', 'East Coast', 'Buller', 'West Coast'],
    },
    {
        // Fédérale 1: el tercer escalón francés, mayoritariamente amateur.
        competitionId: 'fr-federale1', label: 'Fédérale 1', countryCode: 'fr', region: 'europe', level: 'development', kind: 'domestic-league',
        clubs: ['Tarbes', 'Blagnac', 'Cognac', 'Dijon', 'Mâcon', 'Nîmes', 'Auch', 'Langon', 'Saint-Jean-de-Luz', 'Hyères Carqueiranne', 'Bagnères', 'Villefranche-de-Lauragais'],
    },
    {
        competitionId: 'fr-federale2', label: 'Fédérale 2', countryCode: 'fr', region: 'europe', level: 'amateur', kind: 'domestic-league',
        clubs: ['Lourdes', 'Anglet', 'Céret', 'Trélissac', 'Objat', 'La Voulte', 'Lavaur', 'Millau', 'Gujan-Mestras', 'Saint-Sulpice'],
    },
    {
        competitionId: 'eng-national1', label: 'National League 1', countryCode: 'gb-eng', region: 'europe', level: 'development', kind: 'domestic-league',
        clubs: ['Sale FC', 'Rosslyn Park', 'Plymouth Albion', 'Birmingham Moseley', 'Rams RFC', 'Leeds Tykes', 'Blackheath', 'Esher', 'Cinderford', 'Darlington Mowden Park', "Bishop's Stortford", 'Taunton Titans'],
    },
    {
        competitionId: 'eng-national2', label: 'National League 2', countryCode: 'gb-eng', region: 'europe', level: 'amateur', kind: 'domestic-league',
        clubs: ['Sedgley Park', 'Fylde', 'Hull Ionians', 'Luctonians', 'Rotherham Titans', 'Sheffield Tigers', 'Bournville', 'Old Albanian', 'Tonbridge Juddians', 'Westcliff'],
    },
    {
        // Community Cup: el rugby de clubes sudafricano por debajo de las
        // uniones provinciales. Amateur, con clubes históricos.
        competitionId: 'za-community', label: 'Community Cup', countryCode: 'za', region: 'africa', level: 'amateur', kind: 'domestic-league',
        clubs: ['Maties', 'Tuks', 'College Rovers', 'Durbanville-Bellville', 'False Bay', 'Hamiltons', 'Old Selbornians', 'Pretoria Police', 'Rustenburg Impala', 'Wanderers'],
    },
    {
        // Ligas regionales japonesas (Top East / West / Kyushu): el rugby de
        // empresa por debajo de League One. Los jugadores tienen trabajo.
        competitionId: 'jpn-regional', label: 'Top Regional Leagues', countryCode: 'jp', region: 'asia', level: 'amateur', kind: 'domestic-league',
        clubs: ['Tokyo Gas', 'Nippon Express', 'Fukuoka Sanix Blues', 'Chugoku Electric Power', 'Kansai Electric Power', 'Toyota Boshoku Blue Tornado', 'Meiji Yasuda', 'Setouchi Ohki'],
    },

    // ── ESTADOS UNIDOS ───────────────────────────────────────────────────────
    {
        // MLR 2026. LO PRIMERO QUE HAY QUE SABER ES QUE LA LIGA SE DERRUMBÓ DE
        // TAMAÑO: once equipos en 2025, SEIS en 2026. Se retiraron NOLA Gold,
        // Miami Sharks, Houston SaberCats (finalista 2025) y Utah Warriors, y San
        // Diego Legion + Rugby FC Los Angeles se fusionaron en California Legion,
        // franquicia itinerante con cinco sedes (Irvine, San Diego, LA, Moraga,
        // Sacramento).
        //
        // Tabla ÚNICA, sin conferencias, por primera vez desde 2019: diez partidos
        // por equipo —ida y vuelta contra los cinco rivales— en once semanas, y
        // cuatro a playoffs (semis con localía 1v4 / 2v3 y final única).
        //
        // PROFESIONAL DE VERDAD Y CON POCA PLATA, que son las dos cosas a la vez:
        // en febrero de 2026 se firmó el primer convenio colectivo del rugby
        // profesional estadounidense (MLR + USRPA, vigencia 2026-27 con cláusula de
        // reapertura económica) y el tope salarial se reporta en torno a 500.000 USD
        // por club (cifra de prensa, no oficial). El mecanismo particular es que el
        // tope se AMPLÍA cumpliendo objetivos de desarrollo de base —participantes
        // sub-14, academias de secundaria, formación de entrenadores—: no existe
        // exención tipo "marquee player", el tope extra se gana desarrollando y no
        // fichando. Por eso el nivel deportivo va en la banda regional y el modelo
        // económico es `professional`: son dos ejes distintos.
        competitionId: 'us-mlr', label: 'Major League Rugby', countryCode: 'us', region: 'north-america',
        level: 'pro-regional', kind: 'domestic-league', professionalStatus: 'professional',
        clubs: ['Chicago Hounds', 'New England Free Jacks', 'Old Glory DC', 'Seattle Seawolves', 'Anthem RC', 'California Legion'],
    },
    {
        // EL RUGBY MASCULINO UNIVERSITARIO NO ES DEPORTE NCAA, y de ahí sale todo
        // lo demás. Desde una escisión de 2021 hay DOS PIRÁMIDES PARALELAS con
        // campeonatos nacionales separados que no se reconocen entre sí:
        //
        //   · CRAA (D1A / D1AA / D2) — D1A es la máxima categoría de facto y su
        //     campeonato se juega en PRIMAVERA (final a principios de mayo).
        //   · NCR (DI / DI-AA / DII / DIII) — más numerosa, y su campeonato de
        //     quince se decide en OTOÑO (diciembre). Ésa es la diferencia
        //     estructural más importante entre las dos.
        //
        // Regla geográfica gruesa: Oeste y Sur tienden a la CRAA; Noreste,
        // Mid-Atlantic y Medio Oeste tienden a NCR.
        //
        // El 28 de julio de 2026 USA Rugby y la CRAA anunciaron un joint venture
        // —USA Rugby aporta inversión, personal, tecnología y supervisión
        // financiera sin subir cuotas; la CRAA retiene el liderazgo—. El comunicado
        // no menciona a NCR: la fragmentación sigue, así que acá siguen siendo dos
        // competiciones y no una.
        //
        // El campeonato D1A es un bracket de 16 divididos en regiones Este y Oeste
        // por RANKING NACIONAL (no solo campeones de conferencia), con los mejores
        // sembrados locales hasta semifinales; final 2026 en Kuntz Stadium,
        // Indianápolis: California 36 – Navy 22, segundo título consecutivo de Cal
        // y su 30º nacional, el 26º de Jack Clark en su 43ª temporada, invicto.
        //
        // ROSTER REPRESENTATIVO, no la división completa: son los doce mejores
        // programas de 2025-26 por ranking. D1A tiene más clubes; cargar los doce
        // que pelean el bracket es lo que hace jugable la pirámide sin inventar
        // nombres. Evidencia `game-calibration` en competition-levels2026.ts.
        //
        // "Varsity" NO significa nivel deportivo: Saint Mary's, cuatro veces
        // campeón nacional, figura en su propia web como club sport, mientras Cal,
        // Navy y Army sí son varsity institucional. Las becas se articulan caso por
        // caso vía universidad o fundraising, no bajo marco NCAA.
        competitionId: 'us-d1a', label: 'D1A universitaria (CRAA)', countryCode: 'us', region: 'north-america',
        level: 'development', kind: 'domestic-league',
        clubs: ['California', 'Navy', "Saint Mary's", 'Life University', 'Lindenwood', 'Army', 'BYU', 'Arizona', 'Cal Poly', 'Penn State', 'Grand Canyon', 'Arkansas State'],
    },
    {
        // NCR DI · Liberty Conference. LA IVY LEAGUE YA NO TIENE LIGA PROPIA: desde
        // 2022 sus ocho miembros compiten acá, aunque se sigue dando el título Ivy
        // (Brown lo ganó en 2021, 2023 y 2024). Es el ejemplo más claro de la
        // fragmentación: ocho universidades de primera línea juegan el campeonato
        // de la OTRA pirámide, la que corona en diciembre.
        //
        // ROSTER PARCIAL Y DECLARADO: NCR DI es mucho más grande que esto. Se cargan
        // los ocho de la Liberty Conference porque son un conjunto REAL y cerrado
        // —los ocho miembros de la Ivy— y no una selección arbitraria. El resto de
        // NCR DI queda sin cargar en vez de completarse con candidatos plausibles.
        competitionId: 'us-ncr-d1', label: 'DI universitaria (NCR)', countryCode: 'us', region: 'north-america',
        level: 'amateur', kind: 'domestic-league',
        clubs: ['Brown', 'Dartmouth', 'Harvard', 'Yale', 'Princeton', 'Cornell', 'Penn', 'Columbia'],
    },

    // ── PORTUGAL ─────────────────────────────────────────────────────────────
    {
        // Campeonato Nacional Divisão de Honra. La propia FPR lo llama "TOP 12
        // Divisão de Honra" en sus documentos, y no tiene patrocinador de título
        // (las copas sí: Taça de Portugal Santander, Supertaça Cartrack).
        //
        // EL FORMATO MÁS RARO DE LOS CINCO, y no termina en final:
        //   · fase regular — 3 grupos de 4, ida y vuelta = SOLO 6 partidos;
        //   · fase final — los 2 primeros de cada grupo al Grupo do Título (ida y
        //     vuelta, 10 jornadas); los 3º y 4º al Grupo Taça Plate;
        //   · NO hay playoff ni final: el campeón es el 1º del Grupo do Título, y
        //     los puntos NO se arrastran (cada grupo final arranca de cero).
        //
        // El bonus ofensivo es más exigente que el estándar internacional: hacen
        // falta ≥4 ensayos Y diferencia positiva de ≥3 sobre el rival.
        //
        // Y el calendario está invertido respecto de lo esperable: la liga NO abre
        // la temporada. Primero van la Taça (desde octubre) y la Supertaça (1 de
        // noviembre); la Divisão de Honra arrancó el 30 de noviembre de 2025 y cerró
        // el 16 de mayo de 2026.
        //
        // 2025-26: campeón el Benfica, su 10º título y el primero desde 2001 —25
        // años—, decidido en la última jornada de la forma más portuguesa posible:
        // perdió en Cascais 28-14 pero le negó a Cascais el bonus ofensivo que
        // necesitaba para ser campeón. Palmarés histórico: CDUL 20, Direito 12,
        // Belenenses 10, Benfica 10. Siete de los doce clubes son de Lisboa, y nadie
        // fuera del eje Lisboa-Cascais pelea el título.
        //
        // EL NIVEL SE ENTIENDE MIRANDO AFUERA: la liga es semiprofesional y el
        // núcleo de Os Lobos juega en Francia (Top 14, Pro D2, Nationale), no en
        // Portugal. El puente es Lusitanos XV —franquicia con base en Lisboa formada
        // solo por jugadores radicados en Portugal, que juega la Rugby Europe Super
        // Cup y funciona de hecho como segunda selección— y el Plan de Actividades
        // 2026 de la FPR establece que sus jugadores podrán ser contratados
        // directamente por la federación. Esa es la vía declarada en
        // `TRANSFER_PATHWAYS`, no una oferta que aparece porque el escalón alcanza.
        competitionId: 'pt-honra', label: 'Divisão de Honra', countryCode: 'pt', region: 'europe-emerging',
        level: 'semipro', kind: 'domestic-league',
        clubs: ['Benfica', 'Cascais', 'Belenenses', 'Direito', 'CDUL', 'Agronomia', 'Técnico', 'São Miguel', 'CDUP', 'Académica', 'Santarém', 'Montemor-o-Novo'],
    },

    // ── ITALIA ───────────────────────────────────────────────────────────────
    {
        // Serie A Élite (nombre comercial 2025-26: Soladria Serie A Élite).
        // Historial de nombres: Super 10 → Top12 → Peroni Top10 → Serie A Élite
        // desde 2023.
        //
        // LA CLAVE ITALIANA, Y HAY QUE ENTENDERLA BIEN: Benetton Treviso y Zebre
        // Parma NO juegan la liga doméstica. Compiten en el United Rugby
        // Championship y en las copas europeas, están FUERA de la pirámide de
        // ascensos y descensos, y la FIR las financia como franquicias de alto
        // rendimiento. Consecuencia directa: el Scudetto italiano no lo pelean los
        // dos mejores clubes de Italia — el campeón nacional es el mejor de la
        // TERCERA capa (selecciones → franquicias URC → clubes de Serie A Élite).
        // En este catálogo eso ya estaba bien modelado (las dos viven en `urc`) y lo
        // que se agrega es la capa que faltaba.
        //
        // El vínculo entre capas es explícito y bastante original, y viaja en dos
        // vías declaradas (ver `TRANSFER_PATHWAYS`):
        //   · ASIGNACIÓN DE ACADEMIAS — desde 2023-24 la FIR reparte a los juveniles
        //     de Benetton y Zebre entre los clubes de la Serie A Élite para
        //     garantizarles minutos, con lógica declaradamente inspirada en el draft
        //     de la NBA (favorecer a los peor clasificados). En el primer reparto
        //     fueron 19 atletas a Mogliano, Viadana, Rovigo, Valorugby, Vicenza,
        //     Colorno y Lyons.
        //   · PERMIT PLAYERS — jugadores de club doméstico convocables por Benetton
        //     o Zebre. Es la vía de ascenso individual al profesionalismo.
        //
        // 2025-26: HBS Colorno retiró su primer equipo y fue excluido el 2 de marzo.
        // El Consejo Federal decidió seguir con 9 equipos, borró los partidos contra
        // Colorno (cada equipo terminó jugando 16 en vez de 18) y anuló la plaza de
        // descenso. Final del 2 de junio en el Plebiscito de Padova, con lleno:
        // Valorugby Emilia 27 – Petrarca 5, primer Scudetto del club de Reggio
        // Emilia y doblete (también la Coppa Italia, 26-10 a Petrarca en febrero).
        // Rompe el duopolio moderno Petrarca-Rovigo.
        //
        // 2026-27 = esos 9 + Parabiago, que sube: la reforma amplía todas las
        // categorías inferiores pero deja la Élite CONGELADA EN 10, que es una señal
        // de prioridades.
        competitionId: 'ita-serie-a-elite', label: 'Serie A Élite', countryCode: 'it', region: 'europe-emerging',
        level: 'semipro', kind: 'domestic-league',
        clubs: ['Valorugby Emilia', 'Petrarca', 'Rugby Rovigo Delta', 'Viadana', 'Lyons Piacenza', 'Mogliano', 'Rangers Vicenza', 'Fiamme Oro', 'Parabiago', 'Biella'],
    },
    {
        // Serie A: el escalón de abajo, amateur, de donde sube Parabiago. Existe por
        // el mismo motivo que la Fédérale 2 o la Heartland — sin él, elegir la ruta
        // AMATEUR en Italia degradaba en silencio a un club semiprofesional— y
        // además es lo que le da a la Élite un descenso al que temer.
        //
        // ROSTER REPRESENTATIVO de clubes REALES de la categoría, no la nómina
        // publicada de la temporada (evidencia `game-calibration`). Calvisano va
        // primero a propósito: cinco veces campeón de Italia, hoy acá.
        competitionId: 'ita-serie-a', label: 'Serie A', countryCode: 'it', region: 'europe-emerging',
        level: 'amateur', kind: 'domestic-league',
        clubs: ['Rugby Calvisano', 'ASR Milano', 'Rugby Parma', 'Valsugana', 'Rugby San Donà', 'CUS Torino', 'Rugby Noceto', 'Verona Rugby', 'Rugby Roma Olimpic', 'Rugby Bologna 1928', 'Amatori Alghero', 'Rugby Lecco'],
    },

    // ── BRASIL ───────────────────────────────────────────────────────────────
    {
        // Campeonato Brasileiro Masculino de Rugby XV, comercialmente Super 12.
        // Evolución: Super 8 (~2016-17) → Super 16 (oficializado en 2018) → Super 12
        // (desde 2022). 2020 y 2021 no se jugaron por pandemia. Hoy son 12 + 12 = 24
        // clubes en el sistema nacional (la 2ª división también se comunica como
        // "Super 12 – 2ª divisão", que no está cargada acá).
        //
        // Formato 2026: 3 grupos regionalizados de 4 a ida y vuelta (6 jornadas) →
        // HEXAGONAL con los 2 mejores de cada grupo a una sola vuelta (5 jornadas) →
        // GRANDE FINAL 1º vs 2º del hexagonal, partido único, 28 de noviembre. No hay
        // semifinales. Novedad 2026: la REPESCAGEM —los 2 peores de cada grupo de 1ª
        // más los 2 mejores de cada grupo de 2ª, 12 clubes en 3 grupos regionales—
        // reparte SEIS de las doce plazas de 2027.
        //
        // Calendario invertido en 2026: la CBRu dio vuelta la temporada. El Sevens
        // abre el año (abril-mayo) y el XV pasa al segundo semestre, del 20 de junio
        // al 28 de noviembre. Motivo declarado: restricción de recursos y gestión del
        // desgaste de plantillas.
        //
        // Campeones recientes: Jacareí bicampeón (2024 y 2025 — la final 2025 se
        // decidió 11-11 y 4-3 en patadas alternadas, segunda vez en la historia),
        // Pasteur 2023 invicto rompiendo una sequía desde 1994, Poli 2022. Farrapos
        // es el gran finalista perenne (2017, 2018, 2024, 2025) sin ningún título.
        // Históricamente dominan SPAC (~12) y São José (~9).
        //
        // AMATEUR / SEMIPROFESIONAL, y la CBRu reconoce abiertamente la caída de
        // recursos: muchas transmisiones son por YouTube de los propios clubes y el
        // límite es de 5 extranjeros por planilla (excepción para residentes de +3
        // años). BRASIL NO APORTA CLUBES DEL SUPER 12 A SÚPER RUGBY AMÉRICAS: aporta
        // Cobras Brasil Rugby, franquicia gestionada directamente por la
        // confederación, que es el brazo profesional y la antesala de los Tupis. Los
        // calendarios están diseñados para no solaparse (SRA de febrero a junio,
        // Super 12 desde el 20 de junio). Esa es la vía declarada al profesionalismo.
        competitionId: 'br-super12', label: 'Super 12', countryCode: 'br', region: 'south-america',
        level: 'amateur', kind: 'domestic-league',
        clubs: [
            // Grupo A (Sur)
            'Farrapos', 'Charrua', 'Desterro', 'Joaca',
            // Grupo B (São Paulo)
            'Poli', 'São José', 'Tornados Indaiatuba', 'Rio Branco',
            // Grupo C (Sudeste)
            'Jacareí', 'SPAC', 'Pasteur', 'Nova Lima',
        ],
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
    // Piso amateur de cada pirámide (rosters representativos, ver el comentario
    // de la sección en ROSTERS_2026_27).
    'nz-heartland': 12, 'fr-federale1': 12, 'fr-federale2': 10,
    'eng-national1': 12, 'eng-national2': 10, 'za-community': 10, 'jpn-regional': 8,
    // Estados Unidos: la MLR son SEIS y el conteo es el gate que lo protege —el
    // roster de 2025 tenía once, y cargarlo sería mezclar temporadas.
    'us-mlr': 6, 'us-d1a': 12, 'us-ncr-d1': 8,
    // Portugal, Italia y Brasil.
    'pt-honra': 12, 'ita-serie-a-elite': 10, 'ita-serie-a': 12, 'br-super12': 12,
};

// DHB objetivo 2026/27 = 32 (4 grupos de 8). Cargados A/B/C (24) desde iSquad.
export const ESP_DHB_TARGET = 32;

// Competiciones REALES cuyo roster todavía no está cargado. Se documentan como
// pendientes (no se inventan) y NO bloquean el resto del grafo.
//
// `expectedCount` es `null` cuando el organizador no publicó ni la nómina ni el
// tamaño. Es distinto de cero, y la diferencia importa: cero se lee como "esa
// competición no tiene clubes" y null dice "no sabemos cuántos son". Poner un
// número plausible sería exactamente lo que esta lista existe para evitar.
export const PENDING_COMPETITIONS: { competitionId: string; label: string; level: ClubLevel; expectedCount: number | null }[] = [
    { competitionId: 'esp-dhb-grupo-d', label: 'DHB · Grupo D', level: 'development', expectedCount: 8 },
    // Portugal. El segundo escalón existe, pero no está cargado y eso tiene una
    // consecuencia concreta y declarada: la Divisão de Honra es el ÚNICO escalón
    // portugués del catálogo, así que la ruta amateur de un portugués arranca en un
    // club semiprofesional con `routeDowngraded` en true. Es el mismo hueco que
    // Francia y Nueva Zelanda tenían antes de la Fédérale 2 y la Heartland, y se
    // cierra igual: cargando el escalón real, no bajándole el nivel a la DH.
    //
    // Y hay un dato que el usuario mismo dejó sin confirmar: QUIÉN GANÓ LA I DIVISÃO
    // 2025-26 y por lo tanto cuál es el 12º equipo de 2026-27. Mientras no exista esa
    // pieza, cargar los ascensos portugueses sería inventar el resultado.
    { competitionId: 'pt-idivisao', label: 'I Divisão', level: 'amateur', expectedCount: null },
    // Brasil. La 2ª divisão son otros 12 clubes (el sistema nacional son 24) y de
    // ella salen SEIS de las doce plazas de 2027 vía Repescagem. Sin sus nombres no
    // se puede declarar el ascenso: el grafo quedaría apuntando a una liga vacía.
    { competitionId: 'br-super12-2da', label: 'Super 12 · 2ª divisão', level: 'amateur', expectedCount: 12 },
];

/**
 * PREGUNTAS ABIERTAS de las cinco ligas que entraron en `2026-27.9`. Se anotan
 * acá y no en un comentario perdido porque son datos que el motor MODELARÍA si
 * existieran, y a los tres meses nadie se va a acordar de que faltaban:
 *
 *   · MLR — el límite vigente de extranjeros por plantel en 2026. El motor todavía
 *     no modela cupos de extranjero en ninguna liga (Brasil sí lo tiene declarado:
 *     5 por planilla, con excepción para residentes de +3 años), así que hoy no
 *     cambia nada; el día que los modele, éste es el número que falta.
 *   · Portugal — el campeón de la I Divisão 2025-26 (ver arriba).
 *   · Universitario de EE.UU. — las reglas de ELEGIBILIDAD ACADÉMICA. No se asume
 *     el modelo NCAA de "cinco años para cuatro temporadas": cada organización
 *     (CRAA y NCR) fija las suyas y no las tenemos. Importa porque de ahí saldría
 *     cuántas temporadas puede jugar un universitario antes de tener que salir.
 */
export const OPEN_QUESTIONS_2026_27: readonly { competitionId: string; question: string }[] = [
    { competitionId: 'us-mlr', question: 'Límite vigente de extranjeros por plantel en 2026.' },
    { competitionId: 'pt-honra', question: 'Campeón de la I Divisão 2025-26 y 12º equipo de 2026-27.' },
    { competitionId: 'us-d1a', question: 'Reglas de elegibilidad académica de la CRAA (no se asume el modelo NCAA).' },
    { competitionId: 'us-ncr-d1', question: 'Reglas de elegibilidad académica de NCR (no se asume el modelo NCAA).' },
];
