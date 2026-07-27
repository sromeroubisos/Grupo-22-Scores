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
};
