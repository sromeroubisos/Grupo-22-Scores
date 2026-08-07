// Fuerza EXPLÍCITA por club (datos estáticos versionados 2026-27). NO derivada
// de nivel ni hash: diferencia clubes dentro de una misma competición.
//   rating: fortaleza deportiva actual (0..100)
//   prestige: historia y capacidad de atraer jugadores (0..100)
//   marketBand: alcance económico (1 amateur … 6 gigante)
// Valores de DISEÑO del juego (no ratings oficiales). Clave = nombre EXACTO del
// club tal como aparece en rosters2026.ts.

export interface ClubStrength {
    rating: number;
    prestige: number;
    marketBand: number;
}

export const CLUB_STRENGTH: Record<string, ClubStrength> = {
    // ── Top 14 ──────────────────────────────────────────────────────────────
    'Stade Toulousain': { rating: 95, prestige: 98, marketBand: 6 },
    'Union Bordeaux-Bègles': { rating: 90, prestige: 80, marketBand: 6 },
    'Stade Rochelais': { rating: 88, prestige: 84, marketBand: 6 },
    'RC Toulon': { rating: 86, prestige: 90, marketBand: 6 },
    'Racing 92': { rating: 84, prestige: 86, marketBand: 6 },
    'ASM Clermont': { rating: 83, prestige: 89, marketBand: 6 },
    'Castres Olympique': { rating: 82, prestige: 80, marketBand: 5 },
    'Montpellier': { rating: 81, prestige: 78, marketBand: 6 },
    'Stade Français': { rating: 82, prestige: 84, marketBand: 5 },
    'Section Paloise': { rating: 80, prestige: 64, marketBand: 5 },
    'LOU Rugby': { rating: 81, prestige: 70, marketBand: 5 },
    'Aviron Bayonnais': { rating: 79, prestige: 74, marketBand: 5 },
    'USA Perpignan': { rating: 74, prestige: 74, marketBand: 4 },
    'RC Vannes': { rating: 72, prestige: 54, marketBand: 4 },

    // ── Pro D2 ──────────────────────────────────────────────────────────────
    'Provence Rugby': { rating: 76, prestige: 58, marketBand: 4 },
    'Oyonnax': { rating: 75, prestige: 66, marketBand: 4 },
    'Colomiers Rugby': { rating: 74, prestige: 60, marketBand: 3 },
    'CA Brive': { rating: 74, prestige: 78, marketBand: 4 },
    'FC Grenoble': { rating: 73, prestige: 76, marketBand: 4 },
    'Biarritz Olympique': { rating: 72, prestige: 82, marketBand: 4 },
    'Valence Romans': { rating: 71, prestige: 50, marketBand: 3 },
    'SU Agen': { rating: 71, prestige: 74, marketBand: 3 },
    'AS Béziers': { rating: 71, prestige: 72, marketBand: 3 },
    'RC Narbonnais': { rating: 70, prestige: 70, marketBand: 3 },
    'US Montauban': { rating: 70, prestige: 60, marketBand: 3 },
    'US Dax': { rating: 69, prestige: 66, marketBand: 3 },
    'USON Nevers': { rating: 69, prestige: 56, marketBand: 3 },
    'Soyaux-Angoulême XV': { rating: 68, prestige: 52, marketBand: 3 },
    'Stade Aurillacois': { rating: 67, prestige: 58, marketBand: 3 },
    'Nissa Rugby': { rating: 66, prestige: 48, marketBand: 3 },

    // ── Nationale ───────────────────────────────────────────────────────────
    'Albi': { rating: 65, prestige: 62, marketBand: 3 },
    'Carcassonne': { rating: 64, prestige: 64, marketBand: 3 },
    'Périgueux': { rating: 63, prestige: 58, marketBand: 2 },
    'Massy': { rating: 63, prestige: 52, marketBand: 2 },
    'Chambéry': { rating: 62, prestige: 54, marketBand: 2 },
    'Bourgoin': { rating: 62, prestige: 66, marketBand: 2 },
    'Stade Montois': { rating: 62, prestige: 60, marketBand: 3 },
    'Suresnes': { rating: 61, prestige: 48, marketBand: 2 },
    'Rouen': { rating: 61, prestige: 50, marketBand: 2 },
    'Vienne': { rating: 60, prestige: 46, marketBand: 2 },
    'Orléans': { rating: 60, prestige: 44, marketBand: 2 },
    'US Bressane': { rating: 60, prestige: 52, marketBand: 2 },
    'Rennes': { rating: 59, prestige: 46, marketBand: 2 },
    'Marcq': { rating: 58, prestige: 42, marketBand: 2 },

    // ── PREM (Inglaterra) ───────────────────────────────────────────────────
    'Saracens': { rating: 90, prestige: 92, marketBand: 6 },
    'Northampton Saints': { rating: 89, prestige: 84, marketBand: 6 },
    'Bath': { rating: 88, prestige: 86, marketBand: 6 },
    'Bristol Bears': { rating: 85, prestige: 72, marketBand: 5 },
    'Leicester Tigers': { rating: 85, prestige: 90, marketBand: 6 },
    'Sale Sharks': { rating: 84, prestige: 74, marketBand: 5 },
    'Exeter Chiefs': { rating: 83, prestige: 82, marketBand: 5 },
    'Harlequins': { rating: 84, prestige: 84, marketBand: 6 },
    'Gloucester': { rating: 80, prestige: 78, marketBand: 5 },
    'Newcastle Red Bulls': { rating: 78, prestige: 66, marketBand: 5 },

    // ── Championship (Inglaterra) ───────────────────────────────────────────
    'Ealing Trailfinders': { rating: 76, prestige: 58, marketBand: 4 },
    'Coventry': { rating: 71, prestige: 62, marketBand: 3 },
    'Bedford Blues': { rating: 70, prestige: 64, marketBand: 3 },
    'Cornish Pirates': { rating: 69, prestige: 58, marketBand: 3 },
    'Doncaster Knights': { rating: 69, prestige: 60, marketBand: 3 },
    'Hartpury University': { rating: 68, prestige: 48, marketBand: 2 },
    'Worcester Warriors': { rating: 68, prestige: 70, marketBand: 3 },
    'Chinnor': { rating: 66, prestige: 44, marketBand: 2 },
    'Nottingham': { rating: 65, prestige: 54, marketBand: 2 },
    'Ampthill': { rating: 65, prestige: 46, marketBand: 2 },
    'Caldy': { rating: 62, prestige: 42, marketBand: 2 },
    'Richmond': { rating: 62, prestige: 56, marketBand: 2 },
    'London Scottish': { rating: 61, prestige: 58, marketBand: 2 },
    'Cambridge': { rating: 60, prestige: 46, marketBand: 2 },

    // ── URC ─────────────────────────────────────────────────────────────────
    'Leinster': { rating: 94, prestige: 96, marketBand: 6 },
    'Munster': { rating: 86, prestige: 92, marketBand: 6 },
    'Glasgow Warriors': { rating: 87, prestige: 78, marketBand: 5 },
    'Bulls': { rating: 85, prestige: 82, marketBand: 5 },
    'Stormers': { rating: 84, prestige: 84, marketBand: 5 },
    'Ulster': { rating: 82, prestige: 84, marketBand: 5 },
    'Sharks': { rating: 83, prestige: 80, marketBand: 6 },
    'Edinburgh Rugby': { rating: 81, prestige: 72, marketBand: 5 },
    'Connacht': { rating: 78, prestige: 70, marketBand: 4 },
    'Cardiff Rugby': { rating: 76, prestige: 74, marketBand: 4 },
    'Ospreys': { rating: 77, prestige: 76, marketBand: 4 },
    'Scarlets': { rating: 75, prestige: 74, marketBand: 4 },
    'Lions': { rating: 76, prestige: 76, marketBand: 5 },
    'Benetton Treviso': { rating: 74, prestige: 62, marketBand: 4 },
    'Dragons': { rating: 68, prestige: 64, marketBand: 3 },
    'Zebre Parma': { rating: 64, prestige: 50, marketBand: 3 },

    // ── Super Rugby Pacific ─────────────────────────────────────────────────
    'Crusaders': { rating: 92, prestige: 98, marketBand: 5 },
    'Chiefs': { rating: 89, prestige: 82, marketBand: 5 },
    'Hurricanes': { rating: 87, prestige: 84, marketBand: 5 },
    'Blues': { rating: 86, prestige: 84, marketBand: 5 },
    'Brumbies': { rating: 84, prestige: 86, marketBand: 5 },
    'Reds': { rating: 81, prestige: 80, marketBand: 5 },
    'Highlanders': { rating: 78, prestige: 78, marketBand: 4 },
    'Waratahs': { rating: 78, prestige: 80, marketBand: 5 },
    'Western Force': { rating: 76, prestige: 62, marketBand: 4 },
    'Fijian Drua': { rating: 74, prestige: 58, marketBand: 4 },
    'Moana Pasifika': { rating: 70, prestige: 52, marketBand: 4 },

    // ── NPC (Nueva Zelanda) ─────────────────────────────────────────────────
    'Canterbury': { rating: 76, prestige: 84, marketBand: 3 },
    'Wellington': { rating: 74, prestige: 76, marketBand: 3 },
    'Auckland': { rating: 74, prestige: 82, marketBand: 3 },
    'Waikato': { rating: 73, prestige: 74, marketBand: 3 },
    'Tasman': { rating: 73, prestige: 62, marketBand: 3 },
    'Bay of Plenty': { rating: 71, prestige: 62, marketBand: 2 },
    'Taranaki': { rating: 71, prestige: 66, marketBand: 3 },
    'Counties Manukau': { rating: 70, prestige: 60, marketBand: 2 },
    "Hawke's Bay": { rating: 70, prestige: 64, marketBand: 2 },
    'North Harbour': { rating: 69, prestige: 58, marketBand: 2 },
    'Otago': { rating: 69, prestige: 72, marketBand: 3 },
    'Northland': { rating: 66, prestige: 54, marketBand: 2 },
    'Manawatu': { rating: 66, prestige: 56, marketBand: 2 },
    'Southland': { rating: 65, prestige: 58, marketBand: 2 },

    // ── Currie Cup Premier (Sudáfrica) ──────────────────────────────────────
    'Blue Bulls': { rating: 74, prestige: 80, marketBand: 3 },
    'Western Province': { rating: 73, prestige: 82, marketBand: 3 },
    'Natal Sharks': { rating: 72, prestige: 78, marketBand: 3 },
    'Golden Lions': { rating: 71, prestige: 76, marketBand: 3 },
    'Free State Cheetahs': { rating: 70, prestige: 72, marketBand: 3 },
    'Pumas': { rating: 66, prestige: 54, marketBand: 2 },
    'Griquas': { rating: 64, prestige: 58, marketBand: 2 },
    'Boland Kavaliers': { rating: 60, prestige: 48, marketBand: 2 },

    // ── Currie Cup First Division (Sudáfrica) ───────────────────────────────
    'SWD Eagles': { rating: 52, prestige: 44, marketBand: 2 },
    'EP Elephants': { rating: 51, prestige: 52, marketBand: 2 },
    'Valke': { rating: 49, prestige: 42, marketBand: 1 },
    'Leopards': { rating: 48, prestige: 44, marketBand: 1 },
    'Griffons': { rating: 47, prestige: 42, marketBand: 1 },
    'Border Bulldogs': { rating: 44, prestige: 46, marketBand: 1 },

    // ── Rugby Europe Super Cup ──────────────────────────────────────────────
    'Castilla y León Iberians': { rating: 62, prestige: 48, marketBand: 3 },
    'Lusitanos XV': { rating: 60, prestige: 50, marketBand: 3 },
    'Delta': { rating: 55, prestige: 40, marketBand: 2 },
    'Brussels Devils': { rating: 54, prestige: 40, marketBand: 2 },
    'Bohemia Rugby Warriors': { rating: 52, prestige: 38, marketBand: 2 },
    'Romanian Wolves': { rating: 51, prestige: 44, marketBand: 2 },

    // ── Super Rugby Americas (franquicias profesionales, mercado chico) ──────
    'Dogos XV': { rating: 68, prestige: 52, marketBand: 3 },
    'Peñarol Rugby': { rating: 66, prestige: 58, marketBand: 3 },
    'Pampas': { rating: 64, prestige: 56, marketBand: 3 },
    'Selknam': { rating: 62, prestige: 46, marketBand: 2 },
    'Cobras Brasil Rugby': { rating: 60, prestige: 44, marketBand: 2 },
    'Tarucas': { rating: 59, prestige: 42, marketBand: 2 },
    'Yacaré XV': { rating: 58, prestige: 40, marketBand: 2 },
    'Capibaras XV': { rating: 56, prestige: 38, marketBand: 2 },

    // ── España · División de Honor ──────────────────────────────────────────
    'VRAC Valladolid': { rating: 62, prestige: 68, marketBand: 3 },
    'Aparejadores Burgos': { rating: 61, prestige: 62, marketBand: 3 },
    'Alcobendas': { rating: 58, prestige: 56, marketBand: 2 },
    'Complutense Cisneros': { rating: 57, prestige: 60, marketBand: 2 },
    'Pozuelo': { rating: 56, prestige: 46, marketBand: 2 },
    'La Vila': { rating: 55, prestige: 48, marketBand: 2 },
    'Liceo Francés': { rating: 54, prestige: 52, marketBand: 2 },
    'Ordizia': { rating: 54, prestige: 58, marketBand: 2 },
    'Santboiana': { rating: 53, prestige: 62, marketBand: 2 },
    'El Salvador': { rating: 55, prestige: 64, marketBand: 2 },

    // ── España · División de Honor Élite ────────────────────────────────────
    'Barça Rugby': { rating: 50, prestige: 54, marketBand: 2 },
    'Sant Cugat': { rating: 49, prestige: 46, marketBand: 2 },
    'Real Ciencias Sevilla': { rating: 49, prestige: 52, marketBand: 2 },
    'Getxo': { rating: 48, prestige: 46, marketBand: 1 },
    'Gernika': { rating: 48, prestige: 48, marketBand: 1 },
    'Hernani': { rating: 47, prestige: 48, marketBand: 1 },
    'Fénix Zaragoza': { rating: 46, prestige: 44, marketBand: 1 },
    'RC Valencia': { rating: 46, prestige: 42, marketBand: 1 },
    'Les Abelles': { rating: 45, prestige: 44, marketBand: 1 },
    'Industriales': { rating: 44, prestige: 42, marketBand: 1 },

    // ── España · División de Honor B (iSquad, Grupos A/B/C) ──────────────────
    'Aranda': { rating: 42, prestige: 34, marketBand: 1 },
    'Cormorán Santander': { rating: 40, prestige: 32, marketBand: 1 },
    'Belenos': { rating: 44, prestige: 40, marketBand: 1 },
    'Universitario Bilbao': { rating: 43, prestige: 36, marketBand: 1 },
    'La Única': { rating: 39, prestige: 30, marketBand: 1 },
    'Gaztedi': { rating: 43, prestige: 38, marketBand: 1 },
    'Arrasate': { rating: 40, prestige: 32, marketBand: 1 },
    'Gipuzkoa Sortzen': { rating: 38, prestige: 30, marketBand: 1 },
    'Akra Bárbara': { rating: 40, prestige: 32, marketBand: 1 },
    'Barcelona Universitari': { rating: 42, prestige: 36, marketBand: 1 },
    'Natació Poble Nou': { rating: 41, prestige: 34, marketBand: 1 },
    'CAU Valencia': { rating: 44, prestige: 40, marketBand: 1 },
    'El Toro': { rating: 40, prestige: 30, marketBand: 1 },
    "L'Hospitalet": { rating: 41, prestige: 34, marketBand: 1 },
    'Sitges': { rating: 39, prestige: 32, marketBand: 1 },
    'VPC Andorra': { rating: 42, prestige: 36, marketBand: 1 },
    'CAR Sevilla': { rating: 42, prestige: 36, marketBand: 1 },
    'Soto del Real': { rating: 40, prestige: 32, marketBand: 1 },
    'Cisneros Zeta': { rating: 43, prestige: 38, marketBand: 1 },
    'Jaén': { rating: 40, prestige: 30, marketBand: 1 },
    'Alcobendas B': { rating: 41, prestige: 40, marketBand: 1 },
    'Alcalá': { rating: 39, prestige: 32, marketBand: 1 },
    'CAR Cáceres': { rating: 40, prestige: 32, marketBand: 1 },
    'Majadahonda': { rating: 44, prestige: 38, marketBand: 1 },

    // ── Japan League One D1 (mercado rico: marketBand alto, rating fuerte) ───
    'Saitama Wild Knights': { rating: 90, prestige: 82, marketBand: 6 },
    'Toshiba Brave Lupus Tokyo': { rating: 88, prestige: 80, marketBand: 6 },
    'Kubota Spears': { rating: 85, prestige: 70, marketBand: 6 },
    'Yokohama Canon Eagles': { rating: 84, prestige: 72, marketBand: 6 },
    'Tokyo Sungoliath': { rating: 83, prestige: 78, marketBand: 6 },
    'Kobelco Kobe Steelers': { rating: 82, prestige: 76, marketBand: 6 },
    'Toyota Verblitz': { rating: 82, prestige: 72, marketBand: 6 },
    'Shizuoka BlueRevs': { rating: 80, prestige: 64, marketBand: 5 },
    'Mie Honda Heat': { rating: 78, prestige: 58, marketBand: 5 },
    'Urayasu D-Rocks': { rating: 79, prestige: 56, marketBand: 5 },
    'Mitsubishi Sagamihara Dynaboars': { rating: 77, prestige: 54, marketBand: 5 },
    'BlackRams Tokyo': { rating: 78, prestige: 60, marketBand: 5 },

    // ── Japan League One D2 ─────────────────────────────────────────────────
    'Green Rockets Tokatsu': { rating: 70, prestige: 52, marketBand: 4 },
    'Kyuden Voltex': { rating: 69, prestige: 48, marketBand: 4 },
    'Shimizu Koto Blue Sharks': { rating: 68, prestige: 46, marketBand: 4 },
    'Toyota Industries Shuttles Aichi': { rating: 68, prestige: 50, marketBand: 4 },
    'Kamaishi Seawaves': { rating: 66, prestige: 56, marketBand: 3 },
    'Hanazono Kintetsu Liners': { rating: 66, prestige: 54, marketBand: 4 },
    'Hino Red Dolphins': { rating: 65, prestige: 46, marketBand: 3 },
    'RedHurricanes Osaka': { rating: 65, prestige: 48, marketBand: 4 },

    // ── Japan League One D3 ─────────────────────────────────────────────────
    'Kurita Water Gush Akishima': { rating: 58, prestige: 42, marketBand: 3 },
    'Sayama Secom Rugguts': { rating: 56, prestige: 40, marketBand: 3 },
    'Chugoku Red Regulions': { rating: 55, prestige: 40, marketBand: 3 },
    'Skyactivs Hiroshima': { rating: 54, prestige: 40, marketBand: 3 },
    'Yakult Levins Toda': { rating: 53, prestige: 38, marketBand: 3 },
    'LeRIRO Fukuoka': { rating: 52, prestige: 38, marketBand: 3 },
    "AZ-COM MARUWA Momotaro's": { rating: 50, prestige: 34, marketBand: 3 }, // nuevo 2026/27

    // ── Piso amateur de cada pirámide ───────────────────────────────────────
    // marketBand 1: son clubes sin estructura profesional detrás. El rating los
    // ordena dentro de su división; el prestigio distingue al club histórico
    // venido a menos (Lourdes, Maties) del que nunca estuvo arriba.

    // Heartland Championship (NZ) · nivel amateur
    'Wanganui': { rating: 44, prestige: 34, marketBand: 1 },
    'South Canterbury': { rating: 43, prestige: 32, marketBand: 1 },
    'Thames Valley': { rating: 41, prestige: 28, marketBand: 1 },
    'North Otago': { rating: 40, prestige: 30, marketBand: 1 },
    'Mid Canterbury': { rating: 39, prestige: 27, marketBand: 1 },
    'King Country': { rating: 38, prestige: 33, marketBand: 1 }, // cuna de Colin Meads
    'Wairarapa Bush': { rating: 37, prestige: 28, marketBand: 1 },
    'Horowhenua Kapiti': { rating: 35, prestige: 24, marketBand: 1 },
    'Poverty Bay': { rating: 34, prestige: 26, marketBand: 1 },
    'East Coast': { rating: 31, prestige: 20, marketBand: 1 },
    'Buller': { rating: 30, prestige: 22, marketBand: 1 },
    'West Coast': { rating: 28, prestige: 21, marketBand: 1 },

    // Fédérale 1 (FR) · nivel development
    'Tarbes': { rating: 49, prestige: 46, marketBand: 2 },
    'Blagnac': { rating: 48, prestige: 34, marketBand: 2 },
    'Cognac': { rating: 47, prestige: 32, marketBand: 2 },
    'Dijon': { rating: 46, prestige: 33, marketBand: 2 },
    'Mâcon': { rating: 45, prestige: 30, marketBand: 2 },
    'Nîmes': { rating: 45, prestige: 36, marketBand: 2 },
    'Auch': { rating: 44, prestige: 38, marketBand: 2 },
    'Langon': { rating: 43, prestige: 28, marketBand: 2 },
    'Saint-Jean-de-Luz': { rating: 42, prestige: 32, marketBand: 2 },
    'Hyères Carqueiranne': { rating: 42, prestige: 27, marketBand: 2 },
    'Bagnères': { rating: 41, prestige: 35, marketBand: 2 },
    'Villefranche-de-Lauragais': { rating: 40, prestige: 26, marketBand: 2 },

    // Fédérale 2 (FR) · nivel amateur
    'Lourdes': { rating: 43, prestige: 44, marketBand: 1 }, // 8 veces campeón de Francia
    'Anglet': { rating: 40, prestige: 28, marketBand: 1 },
    'Céret': { rating: 38, prestige: 26, marketBand: 1 },
    'Trélissac': { rating: 37, prestige: 22, marketBand: 1 },
    'Objat': { rating: 36, prestige: 24, marketBand: 1 },
    'La Voulte': { rating: 35, prestige: 30, marketBand: 1 },
    'Lavaur': { rating: 34, prestige: 23, marketBand: 1 },
    'Millau': { rating: 33, prestige: 22, marketBand: 1 },
    'Gujan-Mestras': { rating: 31, prestige: 20, marketBand: 1 },
    'Saint-Sulpice': { rating: 29, prestige: 19, marketBand: 1 },

    // National League 1 (ENG) · nivel development
    'Sale FC': { rating: 49, prestige: 42, marketBand: 2 },
    'Rosslyn Park': { rating: 48, prestige: 40, marketBand: 2 },
    'Plymouth Albion': { rating: 47, prestige: 36, marketBand: 2 },
    'Birmingham Moseley': { rating: 46, prestige: 38, marketBand: 2 },
    'Rams RFC': { rating: 45, prestige: 28, marketBand: 2 },
    'Leeds Tykes': { rating: 45, prestige: 40, marketBand: 2 },
    'Blackheath': { rating: 44, prestige: 44, marketBand: 2 }, // el club más antiguo del mundo
    'Esher': { rating: 43, prestige: 30, marketBand: 2 },
    'Cinderford': { rating: 42, prestige: 27, marketBand: 2 },
    'Darlington Mowden Park': { rating: 42, prestige: 29, marketBand: 2 },
    "Bishop's Stortford": { rating: 41, prestige: 26, marketBand: 2 },
    'Taunton Titans': { rating: 40, prestige: 25, marketBand: 2 },

    // National League 2 (ENG) · nivel amateur
    'Sedgley Park': { rating: 42, prestige: 28, marketBand: 1 },
    'Fylde': { rating: 41, prestige: 32, marketBand: 1 },
    'Hull Ionians': { rating: 39, prestige: 25, marketBand: 1 },
    'Luctonians': { rating: 38, prestige: 24, marketBand: 1 },
    'Rotherham Titans': { rating: 37, prestige: 34, marketBand: 1 },
    'Sheffield Tigers': { rating: 35, prestige: 26, marketBand: 1 },
    'Bournville': { rating: 33, prestige: 20, marketBand: 1 },
    'Old Albanian': { rating: 32, prestige: 22, marketBand: 1 },
    'Tonbridge Juddians': { rating: 31, prestige: 21, marketBand: 1 },
    'Westcliff': { rating: 29, prestige: 19, marketBand: 1 },

    // Community Cup (ZA) · nivel amateur
    'Maties': { rating: 44, prestige: 42, marketBand: 1 }, // Stellenbosch, cantera histórica
    'Tuks': { rating: 43, prestige: 40, marketBand: 1 },
    'College Rovers': { rating: 40, prestige: 30, marketBand: 1 },
    'Durbanville-Bellville': { rating: 38, prestige: 28, marketBand: 1 },
    'False Bay': { rating: 37, prestige: 27, marketBand: 1 },
    'Hamiltons': { rating: 36, prestige: 32, marketBand: 1 },
    'Old Selbornians': { rating: 34, prestige: 24, marketBand: 1 },
    'Pretoria Police': { rating: 33, prestige: 26, marketBand: 1 },
    'Rustenburg Impala': { rating: 31, prestige: 22, marketBand: 1 },
    'Wanderers': { rating: 29, prestige: 25, marketBand: 1 },

    // Top Regional Leagues (JP) · nivel amateur
    'Tokyo Gas': { rating: 42, prestige: 30, marketBand: 1 },
    'Nippon Express': { rating: 40, prestige: 28, marketBand: 1 },
    'Fukuoka Sanix Blues': { rating: 39, prestige: 36, marketBand: 1 }, // ex Top League
    'Chugoku Electric Power': { rating: 37, prestige: 25, marketBand: 1 },
    'Kansai Electric Power': { rating: 35, prestige: 24, marketBand: 1 },
    'Toyota Boshoku Blue Tornado': { rating: 34, prestige: 26, marketBand: 1 },
    'Meiji Yasuda': { rating: 32, prestige: 22, marketBand: 1 },
    'Setouchi Ohki': { rating: 30, prestige: 20, marketBand: 1 },

    // ── Major League Rugby (EE.UU.) · nivel pro-regional ─────────────────────
    // El rating cuenta 2026 y el PRESTIGIO cuenta la historia, que en esta liga
    // dicen cosas distintas: Chicago hizo la primera temporada regular perfecta
    // de la historia (10-0 con bonus de try en los diez partidos, 50 de 50 puntos
    // posibles) y ganó la final 35-17 a California Legion en su propio SeatGeek
    // Stadium; New England venía del tricampeonato 2023-24-25 y terminó 5º. Uno
    // tiene el título nuevo, el otro la vitrina.
    //
    // `marketBand` 2-3 y no más: el tope salarial reportado ronda los 500.000 USD
    // por club. Es una liga profesional de mercado chico, y las dos cosas son
    // ciertas a la vez.
    'Chicago Hounds': { rating: 68, prestige: 56, marketBand: 3 },
    'California Legion': { rating: 65, prestige: 48, marketBand: 3 }, // fusión San Diego + LA, finalista en su debut
    'New England Free Jacks': { rating: 64, prestige: 64, marketBand: 3 }, // tricampeón 2023-24-25
    'Old Glory DC': { rating: 61, prestige: 44, marketBand: 2 },
    'Seattle Seawolves': { rating: 59, prestige: 58, marketBand: 2 }, // campeón 2018 y 2019
    'Anthem RC': { rating: 57, prestige: 34, marketBand: 2 }, // Charlotte, franquicia nueva

    // ── D1A universitaria (CRAA) · nivel development ─────────────────────────
    // California está sola arriba y no es una opinión: campeón 2025 y 2026,
    // invicto, ~65 puntos por partido y 30 títulos nacionales. El prestigio
    // separa al programa histórico (Cal, Navy, Army, Saint Mary's) del que está
    // subiendo rápido (Grand Canyon).
    //
    // `marketBand` 2 para todos: una universidad tiene estructura —cancha,
    // preparador, viajes— que un club amateur no tiene, pero las becas se
    // articulan caso por caso y no hay salario.
    'California': { rating: 54, prestige: 62, marketBand: 2 },
    'Navy': { rating: 51, prestige: 48, marketBand: 2 }, // finalista 2026 (13-1), campeón 2023 invicto
    "Saint Mary's": { rating: 50, prestige: 46, marketBand: 2 }, // campeón 2024 y 2021, 4 títulos
    'Life University': { rating: 50, prestige: 44, marketBand: 2 }, // finalista 2025, programa con becas
    'Lindenwood': { rating: 48, prestige: 36, marketBand: 2 },
    'Army': { rating: 47, prestige: 42, marketBand: 2 }, // campeón 2022
    'BYU': { rating: 46, prestige: 44, marketBand: 2 }, // potencia histórica de la era Varsity Cup
    'Arizona': { rating: 45, prestige: 34, marketBand: 2 },
    'Cal Poly': { rating: 44, prestige: 34, marketBand: 2 },
    'Penn State': { rating: 43, prestige: 32, marketBand: 2 },
    'Grand Canyon': { rating: 42, prestige: 26, marketBand: 2 }, // programa en ascenso rápido
    'Arkansas State': { rating: 41, prestige: 26, marketBand: 2 },

    // ── DI universitaria (NCR) · nivel amateur ───────────────────────────────
    // La Ivy League entera, en la pirámide que corona en diciembre. Brown va
    // primero por los títulos Ivy de 2021, 2023 y 2024.
    'Brown': { rating: 42, prestige: 40, marketBand: 1 },
    'Dartmouth': { rating: 40, prestige: 34, marketBand: 1 },
    'Harvard': { rating: 39, prestige: 34, marketBand: 1 },
    'Yale': { rating: 38, prestige: 32, marketBand: 1 },
    'Princeton': { rating: 37, prestige: 32, marketBand: 1 },
    'Cornell': { rating: 36, prestige: 28, marketBand: 1 },
    'Penn': { rating: 35, prestige: 28, marketBand: 1 },
    'Columbia': { rating: 34, prestige: 24, marketBand: 1 },

    // ── Portugal · Divisão de Honra · nivel semipro ──────────────────────────
    // Rating por 2025-26 y prestigio por palmarés, que acá se separan mucho:
    // CDUL tiene 20 títulos y hoy no pelea el campeonato; Benfica acaba de ganar
    // el 10º, el primero desde 2001. Cascais va segundo en rating porque llegó a
    // la última jornada con el título en la mano y se le escapó por un bonus.
    'Benfica': { rating: 58, prestige: 58, marketBand: 3 }, // campeón 2025-26, 10 títulos
    'Cascais': { rating: 57, prestige: 44, marketBand: 2 },
    'Belenenses': { rating: 56, prestige: 54, marketBand: 2 }, // bicampeón 2024 y 2025, 10 títulos
    'Direito': { rating: 54, prestige: 56, marketBand: 2 }, // 12 títulos, campeón 2023
    'CDUL': { rating: 53, prestige: 62, marketBand: 2 }, // 20 títulos: el más ganador
    'Agronomia': { rating: 52, prestige: 46, marketBand: 2 },
    'Técnico': { rating: 50, prestige: 40, marketBand: 2 },
    'São Miguel': { rating: 49, prestige: 34, marketBand: 1 }, // Azores: el único de fuera del continente
    'CDUP': { rating: 48, prestige: 38, marketBand: 1 },
    'Académica': { rating: 47, prestige: 42, marketBand: 1 },
    'Santarém': { rating: 45, prestige: 30, marketBand: 1 },
    'Montemor-o-Novo': { rating: 44, prestige: 26, marketBand: 1 },

    // ── Italia · Serie A Élite · nivel semipro ───────────────────────────────
    // Cinco equipos competitivos y una cola muy débil, que es lo que hace a esta
    // liga distinta de las otras cuatro: Valorugby le ganó 518-209 el agregado a
    // Biella, que cerró con una victoria y 833 puntos en contra. El rating tiene
    // que poder contar eso.
    'Valorugby Emilia': { rating: 60, prestige: 52, marketBand: 3 }, // primer Scudetto + Coppa Italia
    'Petrarca': { rating: 59, prestige: 66, marketBand: 3 }, // campeón 2022 y 2024
    'Rugby Rovigo Delta': { rating: 58, prestige: 64, marketBand: 3 }, // campeón 2023 y 2025 (triplete)
    'Viadana': { rating: 54, prestige: 44, marketBand: 2 },
    'Lyons Piacenza': { rating: 53, prestige: 40, marketBand: 2 },
    'Mogliano': { rating: 52, prestige: 46, marketBand: 2 },
    'Rangers Vicenza': { rating: 51, prestige: 40, marketBand: 2 },
    'Fiamme Oro': { rating: 50, prestige: 42, marketBand: 2 },
    'Parabiago': { rating: 46, prestige: 30, marketBand: 1 }, // sube de Serie A
    'Biella': { rating: 44, prestige: 34, marketBand: 1 },

    // ── Italia · Serie A · nivel amateur ─────────────────────────────────────
    // El prestigio hace acá el trabajo que el rating no puede: Calvisano fue
    // cinco veces campeón de Italia y Roma Olimpic es de 1930. Están abajo, no
    // son cualquiera.
    'Rugby Calvisano': { rating: 46, prestige: 52, marketBand: 2 },
    'ASR Milano': { rating: 44, prestige: 40, marketBand: 2 },
    'Rugby Parma': { rating: 43, prestige: 38, marketBand: 1 },
    'Valsugana': { rating: 42, prestige: 34, marketBand: 1 },
    'Rugby San Donà': { rating: 41, prestige: 36, marketBand: 1 },
    'CUS Torino': { rating: 40, prestige: 34, marketBand: 1 },
    'Rugby Noceto': { rating: 39, prestige: 30, marketBand: 1 },
    'Verona Rugby': { rating: 38, prestige: 30, marketBand: 1 },
    'Rugby Roma Olimpic': { rating: 37, prestige: 40, marketBand: 1 },
    'Rugby Bologna 1928': { rating: 36, prestige: 32, marketBand: 1 },
    'Amatori Alghero': { rating: 34, prestige: 28, marketBand: 1 },
    'Rugby Lecco': { rating: 32, prestige: 26, marketBand: 1 },

    // ── Brasil · Super 12 · nivel amateur ────────────────────────────────────
    // Rating por 2026 (tres jornadas jugadas al 30/7: invictos Jacareí, Poli y
    // Farrapos; SPAC 104-12 a Nova Lima y Joaca 0-60 con Farrapos) y prestigio por
    // historia, donde manda otra cosa: SPAC tiene ~12 títulos y São José ~9, y
    // Farrapos es el finalista perenne —2017, 2018, 2024, 2025— sin ninguno.
    'Jacareí': { rating: 46, prestige: 48, marketBand: 2 }, // bicampeón 2024 y 2025
    'SPAC': { rating: 45, prestige: 54, marketBand: 2 }, // ~12 títulos históricos
    'Farrapos': { rating: 45, prestige: 46, marketBand: 2 }, // cuatro finales, cero títulos
    'Poli': { rating: 44, prestige: 42, marketBand: 2 }, // campeón 2022
    'São José': { rating: 43, prestige: 50, marketBand: 2 }, // ~9 títulos
    'Pasteur': { rating: 42, prestige: 40, marketBand: 2 }, // campeón 2023 invicto
    'Charrua': { rating: 40, prestige: 30, marketBand: 1 },
    'Desterro': { rating: 38, prestige: 32, marketBand: 1 },
    'Tornados Indaiatuba': { rating: 36, prestige: 24, marketBand: 1 },
    'Rio Branco': { rating: 34, prestige: 24, marketBand: 1 },
    'Nova Lima': { rating: 30, prestige: 20, marketBand: 1 }, // primer club de Minas Gerais en primera
    'Joaca': { rating: 28, prestige: 20, marketBand: 1 },

    // ═══════════════════════════════════════════════════════════════════════
    // 2026-27.11 · dieciséis sistemas domésticos nuevos
    // ═══════════════════════════════════════════════════════════════════════
    //
    // El criterio es el mismo de siempre y conviene repetirlo porque acá se nota
    // más que en ningún otro bloque: RATING es fuerza deportiva de hoy y PRESTIGIO
    // es historia. En estas ligas los dos números se separan muchísimo —Pontypool
    // tuvo la primera línea más famosa del rugby y hoy pelea abajo; Hunter
    // Wildfires no tiene historia y compite— y ahí está la gracia. Un club con
    // prestigio alto y rating bajo es el club grande venido a menos, y el motor lo
    // usa: el prestigio pesa en el atractivo de una oferta.

    // ── Australia · Shute Shield (semipro) ───────────────────────────────────
    // Sydney University y Randwick arriba, y por motivos distintos: la Universidad
    // domina el siglo XXI, Randwick es el club de los Ella y el que tiene el
    // palmarés más largo. Los dos últimos son los dos que llegaron después: los
    // Two Blues del oeste de Sídney y los Wildfires de Newcastle.
    'Sydney University': { rating: 62, prestige: 76, marketBand: 3 },
    'Randwick': { rating: 60, prestige: 84, marketBand: 3 },
    'Northern Suburbs': { rating: 58, prestige: 60, marketBand: 2 },
    'Manly': { rating: 57, prestige: 66, marketBand: 2 },
    'Gordon': { rating: 56, prestige: 58, marketBand: 2 },
    'Eastwood': { rating: 55, prestige: 68, marketBand: 2 },
    'Warringah': { rating: 54, prestige: 56, marketBand: 2 },
    'Eastern Suburbs': { rating: 53, prestige: 54, marketBand: 2 },
    'Southern Districts': { rating: 52, prestige: 48, marketBand: 2 },
    'West Harbour': { rating: 50, prestige: 50, marketBand: 2 },
    'Hunter Wildfires': { rating: 49, prestige: 34, marketBand: 1 },
    'Western Sydney Two Blues': { rating: 48, prestige: 42, marketBand: 1 },

    // ── Australia · Hospital Cup (Queensland, amateur) ───────────────────────
    // La Universidad de Queensland y Brothers son los dos que se reparten el siglo
    // de historia de Brisbane. Bond es la excepción del grupo: campus privado de la
    // Gold Coast, sin historia y con estructura.
    'University of Queensland': { rating: 54, prestige: 66, marketBand: 2 },
    'Brothers': { rating: 52, prestige: 68, marketBand: 2 },
    'Souths': { rating: 50, prestige: 58, marketBand: 2 },
    'GPS': { rating: 49, prestige: 54, marketBand: 2 },
    'Easts': { rating: 48, prestige: 52, marketBand: 2 },
    'Bond University': { rating: 47, prestige: 40, marketBand: 2 },
    'Norths': { rating: 46, prestige: 50, marketBand: 1 },
    'Sunnybank': { rating: 45, prestige: 46, marketBand: 1 },
    'Wests': { rating: 43, prestige: 44, marketBand: 1 },

    // ── Gales · Premiership (amateur) ────────────────────────────────────────
    // ACÁ EL PRESTIGIO MANDA AL REVÉS QUE EL RATING, y es la liga donde más se nota
    // de todo el catálogo. Newport le ganó a los All Blacks en 1963 y Neath fue "los
    // All Blacks galeses"; Pontypool tuvo la primera línea más famosa de la historia
    // del rugby (Faulkner, Windsor, Price). Los tres están abajo en fuerza y arriba
    // en historia. Arriba en fuerza están Cardiff RFC —el equipo de abajo del
    // Cardiff de la URC— y Merthyr, que subió con plata reciente y sin vitrina.
    'Cardiff RFC': { rating: 54, prestige: 70, marketBand: 2 },
    'Pontypridd': { rating: 53, prestige: 68, marketBand: 2 },
    'Merthyr': { rating: 52, prestige: 44, marketBand: 2 },
    'Llandovery': { rating: 51, prestige: 46, marketBand: 1 },
    'Aberavon': { rating: 50, prestige: 56, marketBand: 1 },
    'Newport': { rating: 49, prestige: 72, marketBand: 2 }, // le ganó a los All Blacks en 1963
    'RGC 1404': { rating: 48, prestige: 34, marketBand: 1 }, // el norte, el proyecto más nuevo
    'Ebbw Vale': { rating: 47, prestige: 50, marketBand: 1 },
    'Bridgend': { rating: 46, prestige: 58, marketBand: 1 },
    'Neath': { rating: 45, prestige: 66, marketBand: 1 }, // los "All Blacks galeses"
    'Carmarthen Quins': { rating: 44, prestige: 38, marketBand: 1 },
    'Pontypool': { rating: 43, prestige: 62, marketBand: 1 }, // la Pontypool front row

    // ── Irlanda · AIL 1A (amateur por reglamento) ────────────────────────────
    // Clontarf y Cork Constitution se reparten los títulos modernos; Dublin
    // University es el Trinity, fundado en 1854 y el club de rugby más antiguo del
    // mundo con actividad continua — de ahí que su prestigio no se parezca a su
    // fuerza.
    'Clontarf': { rating: 54, prestige: 62, marketBand: 2 },
    'Cork Constitution': { rating: 53, prestige: 66, marketBand: 2 },
    'Lansdowne': { rating: 52, prestige: 60, marketBand: 2 },
    'Terenure College': { rating: 51, prestige: 48, marketBand: 1 },
    'Young Munster': { rating: 49, prestige: 56, marketBand: 1 },
    "St. Mary's College": { rating: 48, prestige: 54, marketBand: 1 },
    'Ballynahinch': { rating: 46, prestige: 42, marketBand: 1 },
    'Dublin University': { rating: 44, prestige: 50, marketBand: 1 }, // Trinity, 1854

    // ── Escocia · Premiership (amateur) ──────────────────────────────────────
    // Las Borders sostienen el prestigio de esta liga: Hawick es el club más
    // ganador de Escocia y Melrose es donde se inventó el rugby seven en 1883. En
    // fuerza mandan hoy los de Edimburgo y Ayr.
    'Currie Chieftains': { rating: 50, prestige: 48, marketBand: 1 },
    'Ayr': { rating: 49, prestige: 52, marketBand: 1 },
    "Heriot's": { rating: 48, prestige: 54, marketBand: 1 },
    'Hawick': { rating: 47, prestige: 62, marketBand: 1 }, // el más ganador de Escocia
    'Melrose': { rating: 46, prestige: 58, marketBand: 1 }, // donde nació el seven, 1883
    'Watsonians': { rating: 45, prestige: 50, marketBand: 1 },
    'Boroughmuir Bears': { rating: 44, prestige: 46, marketBand: 1 },
    'Selkirk': { rating: 42, prestige: 40, marketBand: 1 },
    'Jed-Forest': { rating: 41, prestige: 38, marketBand: 1 },
    'Musselburgh': { rating: 40, prestige: 30, marketBand: 1 },

    // ── Georgia · Didi 10 (semipro) ──────────────────────────────────────────
    // Black Lion está solo arriba y la distancia es real: es la franquicia de la
    // unión, la que juega la Rugby Europe Super Cup. Lelo Saracens es el club con
    // más títulos y el que le pelea.
    'Black Lion': { rating: 62, prestige: 56, marketBand: 3 },
    'Lelo Saracens': { rating: 58, prestige: 64, marketBand: 2 },
    'Aia Kutaisi': { rating: 56, prestige: 60, marketBand: 2 },
    'Armazi': { rating: 54, prestige: 46, marketBand: 2 },
    'Batumi': { rating: 53, prestige: 44, marketBand: 2 },
    'Khvamli': { rating: 52, prestige: 40, marketBand: 1 },
    'Akademia': { rating: 51, prestige: 38, marketBand: 1 },
    'Kharebi': { rating: 50, prestige: 42, marketBand: 1 },
    'Aresi': { rating: 49, prestige: 36, marketBand: 1 },
    'Vephkhvebi': { rating: 48, prestige: 34, marketBand: 1 },

    // ── Rumania · Liga Națională (semipro) ───────────────────────────────────
    // Steaua (Ejército) y Dinamo (Interior) son los dos clubes institucionales y por
    // eso su prestigio es más alto que su fuerza de hoy: la liga la vienen ganando
    // Baia Mare y Timișoara.
    'CSM Știința Baia Mare': { rating: 60, prestige: 62, marketBand: 2 },
    'CSA Steaua București': { rating: 59, prestige: 70, marketBand: 2 },
    'Dinamo București': { rating: 57, prestige: 64, marketBand: 2 },
    'SCM USV Timișoara': { rating: 56, prestige: 60, marketBand: 2 },
    'Rapid București': { rating: 52, prestige: 48, marketBand: 1 },
    'Universitatea Cluj': { rating: 51, prestige: 42, marketBand: 1 },
    'RC Gura Humorului': { rating: 49, prestige: 36, marketBand: 1 },
    'RC Bârlad': { rating: 48, prestige: 38, marketBand: 1 },

    // ── Rusia · Campeonato (profesional) ─────────────────────────────────────
    // Los dos de Krasnoyarsk arriba —Enisei-STM y Krasny Yar son la misma ciudad y
    // el clásico del rugby ruso—, y Enisei con margen: es el que llegó a jugar la
    // Challenge Cup europea.
    'Enisei-STM': { rating: 70, prestige: 74, marketBand: 3 },
    'Krasny Yar': { rating: 66, prestige: 70, marketBand: 3 },
    'Strela-Ak Bars': { rating: 63, prestige: 52, marketBand: 2 },
    'VVA-Podmoskovye': { rating: 62, prestige: 60, marketBand: 2 },
    'Lokomotiv Penza': { rating: 61, prestige: 46, marketBand: 2 },
    'Slava Moscow': { rating: 60, prestige: 48, marketBand: 2 },
    'Dinamo Moscow': { rating: 59, prestige: 44, marketBand: 2 },
    'Metallurg Novokuznetsk': { rating: 58, prestige: 40, marketBand: 2 },

    // ── Fiyi · Skipper Cup (amateur, uniones provinciales) ───────────────────
    // Nadroga y Suva son las dos provincias históricas; Naitasiri viene siendo la
    // más fuerte de los últimos años. Abajo están las islas chicas, que compiten con
    // lo que tienen: Malolo, Ovalau, Yasawa.
    'Nadroga': { rating: 54, prestige: 70, marketBand: 1 },
    'Naitasiri': { rating: 52, prestige: 62, marketBand: 1 },
    'Suva': { rating: 51, prestige: 64, marketBand: 1 },
    'Namosi': { rating: 50, prestige: 52, marketBand: 1 },
    'Tailevu': { rating: 49, prestige: 50, marketBand: 1 },
    'Nadi': { rating: 48, prestige: 54, marketBand: 1 },
    'Lautoka': { rating: 46, prestige: 44, marketBand: 1 },
    'Northland de Fiyi': { rating: 45, prestige: 34, marketBand: 1 },
    'Macuata': { rating: 44, prestige: 36, marketBand: 1 },
    'Yasawa': { rating: 43, prestige: 30, marketBand: 1 },
    'Ovalau': { rating: 42, prestige: 32, marketBand: 1 },
    'Malolo': { rating: 41, prestige: 28, marketBand: 1 },
    'Vatukoula': { rating: 40, prestige: 26, marketBand: 1 },

    // ── Canadá (amateur) ─────────────────────────────────────────────────────
    // Los dos primeros no son clubes y por eso están arriba: Pacific Pride es la
    // academia de Rugby Canada y Ontario Blues un seleccionado provincial. Abajo sí
    // hay clubes, con la isla de Vancouver (Castaway Wanderers, James Bay) como la
    // zona más fuerte del país.
    'Pacific Pride': { rating: 52, prestige: 44, marketBand: 2 }, // academia de Rugby Canada
    'Ontario Blues': { rating: 50, prestige: 48, marketBand: 2 }, // seleccionado provincial
    'UBC Thunderbirds': { rating: 48, prestige: 56, marketBand: 1 },
    'Castaway Wanderers': { rating: 47, prestige: 54, marketBand: 1 },
    'James Bay AA': { rating: 46, prestige: 50, marketBand: 1 },
    'Meraloma RFC': { rating: 44, prestige: 42, marketBand: 1 },
    'Toronto Scottish': { rating: 43, prestige: 40, marketBand: 1 },
    'Calgary Hornets': { rating: 42, prestige: 36, marketBand: 1 },
    'Edmonton Clansmen': { rating: 41, prestige: 34, marketBand: 1 },
    'Montreal Irish': { rating: 40, prestige: 32, marketBand: 1 },

    // ── Bélgica · Elite League (amateur) ─────────────────────────────────────
    'Kituro RC': { rating: 44, prestige: 46, marketBand: 1 },
    'Boitsfort RC': { rating: 42, prestige: 44, marketBand: 1 },
    'ASUB Waterloo': { rating: 41, prestige: 40, marketBand: 1 },
    'Dendermonde RC': { rating: 39, prestige: 38, marketBand: 1 },
    'La Hulpe RC': { rating: 37, prestige: 34, marketBand: 1 },
    'RC Liège': { rating: 35, prestige: 32, marketBand: 1 },
    'Soignies RC': { rating: 33, prestige: 30, marketBand: 1 },

    // ── Países Bajos · Ereklasse (amateur) ───────────────────────────────────
    "RC 't Gooi": { rating: 44, prestige: 52, marketBand: 1 },
    'Haagsche RC': { rating: 42, prestige: 48, marketBand: 1 },
    'RC Hilversum': { rating: 40, prestige: 44, marketBand: 1 },
    'DIOK Leiden': { rating: 38, prestige: 40, marketBand: 1 },
    'RFC Haarlem': { rating: 36, prestige: 38, marketBand: 1 },
    'Castricum RC': { rating: 35, prestige: 34, marketBand: 1 },
    'Oisterwijk Oysters': { rating: 33, prestige: 30, marketBand: 1 },
    'RC Eemland': { rating: 31, prestige: 28, marketBand: 1 },

    // ── Perú · Torneo Metropolitano (amateur) ────────────────────────────────
    // Los de Lima arriba y el interior abajo, que es la forma real de esta
    // competición: Arequipa, Chiclayo, Trujillo, Ilo, Barranca y Piura viajan.
    'Lima Rugby Club': { rating: 42, prestige: 46, marketBand: 1 },
    'Alumni Rugby Club': { rating: 40, prestige: 44, marketBand: 1 },
    'Club Cruzados': { rating: 39, prestige: 40, marketBand: 1 },
    'Old Markhamians RFC': { rating: 38, prestige: 42, marketBand: 1 },
    'Leones de San Marcos': { rating: 37, prestige: 34, marketBand: 1 },
    'Blues Rugby Association': { rating: 36, prestige: 32, marketBand: 1 },
    'Dragones Rugby Club': { rating: 35, prestige: 30, marketBand: 1 },
    'Navy Warriors Rugby Club': { rating: 34, prestige: 32, marketBand: 1 },
    'Flaming Lions RFC': { rating: 33, prestige: 28, marketBand: 1 },
    'Toros Rugby Club': { rating: 32, prestige: 26, marketBand: 1 }, // Arequipa
    'Unión Rugby Club': { rating: 31, prestige: 26, marketBand: 1 },
    'Zuma Sport Rugby': { rating: 30, prestige: 24, marketBand: 1 },
    'Mochikas Rugby Club': { rating: 29, prestige: 26, marketBand: 1 }, // Chiclayo
    'Sharks Rugby Club': { rating: 28, prestige: 24, marketBand: 1 }, // Trujillo
    'Piura Rugby Club': { rating: 27, prestige: 22, marketBand: 1 },
    'Sea Wolf Rugby Club': { rating: 26, prestige: 20, marketBand: 1 }, // Ilo
    'Vikingos Rugby Club': { rating: 25, prestige: 20, marketBand: 1 }, // Barranca

    // ── Colombia · Liga Nacional (amateur) ───────────────────────────────────
    'Tucanes Rugby Club': { rating: 42, prestige: 44, marketBand: 1 }, // Bogotá
    'Bogotá Rugby Club': { rating: 40, prestige: 46, marketBand: 1 },
    'Carneros Rugby Club': { rating: 38, prestige: 36, marketBand: 1 }, // Medellín
    'Cali Rugby Club': { rating: 36, prestige: 38, marketBand: 1 },
    'Gatos Rugby Club': { rating: 35, prestige: 32, marketBand: 1 }, // Medellín
    'Universitario del Valle': { rating: 33, prestige: 34, marketBand: 1 },
    'Barranquilla Rugby Club': { rating: 32, prestige: 30, marketBand: 1 },
    'Lions Rugby Club': { rating: 30, prestige: 26, marketBand: 1 },
    'Búhos Rugby Club': { rating: 28, prestige: 24, marketBand: 1 },
    'Pasto Rugby Club': { rating: 26, prestige: 22, marketBand: 1 },

    // ── Paraguay · Primera División (amateur) ────────────────────────────────
    // Sin CURDA ni San José, que juegan el Regional NEA argentino y están cargados
    // ahí: por eso el techo de esta liga es más bajo de lo que sería con ellos.
    'Asunción Rugby Club': { rating: 44, prestige: 48, marketBand: 1 },
    'Cristo Rey Rugby Club': { rating: 41, prestige: 40, marketBand: 1 },
    'Santa Clara Rugby Club': { rating: 39, prestige: 36, marketBand: 1 },
    'Luque Rugby Club': { rating: 36, prestige: 32, marketBand: 1 },
    'Presidente Hayes Rugby Club': { rating: 34, prestige: 34, marketBand: 1 },
    'Mariano Roque Alonso Rugby Club': { rating: 31, prestige: 26, marketBand: 1 },

    // ── Bolivia · Liga Boliviana (amateur, la banda más baja del catálogo) ───
    'Santa Cruz Rugby Club': { rating: 38, prestige: 40, marketBand: 1 },
    'Jenecherú Rugby Club': { rating: 36, prestige: 34, marketBand: 1 }, // Santa Cruz
    'La Paz Rugby Club': { rating: 34, prestige: 36, marketBand: 1 },
    'Universitario Rugby Club': { rating: 32, prestige: 30, marketBand: 1 }, // Cochabamba
    'Supay Rugby Club': { rating: 30, prestige: 28, marketBand: 1 }, // Cochabamba
    'Aranjuez Rugby Club': { rating: 28, prestige: 24, marketBand: 1 }, // Tarija
    'Tigres Rugby Club': { rating: 26, prestige: 22, marketBand: 1 }, // Tarija
    'Yacuiba Rugby Club': { rating: 24, prestige: 20, marketBand: 1 },

    // ── México · Liga Mexicana XV (amateur) ──────────────────────────────────
    // Los cinco de abajo cambiaron al cruzar la nómina contra los escudos reales
    // (ver el comentario de `mx-liga` en rosters2026.ts). Los ratings se conservan
    // por POSICIÓN y no por nombre: la fuerza relativa de la liga ya estaba
    // calibrada y lo que cambió es quién ocupa cada lugar.
    'Pumas UNAM': { rating: 42, prestige: 48, marketBand: 1 },
    'Wallabies RFC': { rating: 40, prestige: 44, marketBand: 1 },
    'Tazmania RFC': { rating: 39, prestige: 40, marketBand: 1 },
    'Black Thunder RC': { rating: 37, prestige: 34, marketBand: 1 },
    'Koalas RFC': { rating: 36, prestige: 34, marketBand: 1 },
    "Rhino's RFC": { rating: 35, prestige: 32, marketBand: 1 },
    'Cumiyais RFC': { rating: 34, prestige: 30, marketBand: 1 }, // Monterrey
    'Tigres UANL': { rating: 33, prestige: 30, marketBand: 1 }, // Universidad Autónoma de Nuevo León
    'Templarios Rugby': { rating: 32, prestige: 28, marketBand: 1 },
    'Legión de Cuervos': { rating: 31, prestige: 26, marketBand: 1 },
    'Bisontes Rugby Club': { rating: 30, prestige: 26, marketBand: 1 }, // Guadalajara
    'Coyotes Rugby Club': { rating: 29, prestige: 24, marketBand: 1 },
    'Axolotl Rugby Club': { rating: 28, prestige: 24, marketBand: 1 },
    'Leones Rugby': { rating: 27, prestige: 22, marketBand: 1 }, // Colima
    'Asociación Ciudad de México': { rating: 26, prestige: 20, marketBand: 1 },
};
