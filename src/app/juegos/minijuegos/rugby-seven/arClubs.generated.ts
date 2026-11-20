// ARCHIVO GENERADO — no editar a mano.
// Fuente: el canon del rugby argentino de la Carrera (features/career/data/clubs2026/arSystem2026.ts
// vía arCatalog.ts: clubes, divisiones, fuerza y cupos del TDI 2026) + el color principal de cada
// club de la tabla `clubs` de Supabase y su puntaje del ranking de clubes de Salida de 22
// (`club_ranking_entries`, ranking "Ranking Clubes Rugby"), (cruzado por el sourceId del catálogo; null si la base no lo tiene).
// Se congela a propósito: el juego no consulta la base en vivo.
// Regenerado el 2026-11-20.

export interface ArSevenClub {
    id: string;
    name: string;
    short: string;
    color: string | null;
    rating: number;
    division: string;
    /** Puntaje del ranking de clubes de Salida de 22 (escala argentina: el mejor del país ronda 99). null si no está rankeado. */
    ranking: number | null;
}

export interface ArSevenDivision {
    id: string;
    label: string;
    branch: "urba" | "interior";
    region: string;
    level: number;
    promotesTo: string | null;
    relegatesTo: string | null;
    /** Ids de club, del más fuerte al más flojo. */
    clubs: string[];
}

export const AR_SEVEN_CLUBS: ArSevenClub[] = [
 {
  "id": "ar-aguara-del-alto-valle",
  "name": "Aguará del Alto Valle",
  "short": "AAV",
  "color": null,
  "rating": 27,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-albatros",
  "name": "Albatros",
  "short": "ALB",
  "color": null,
  "rating": 30,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-albatros-del-chubut",
  "name": "Albatros del Chubut",
  "short": "AC",
  "color": null,
  "rating": 24,
  "division": "ar-patagonia-chubut-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-allen",
  "name": "Allen",
  "short": "ALL",
  "color": null,
  "rating": 32,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-almafuerte",
  "name": "Almafuerte",
  "short": "ALM",
  "color": null,
  "rating": 30,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-arsenal-zarate",
  "name": "Arsenal Zárate",
  "short": "AZ",
  "color": null,
  "rating": 32,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-atletico-chascomus",
  "name": "Atlético Chascomús",
  "short": "AC",
  "color": null,
  "rating": 34,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-atletico-san-andres",
  "name": "Atlético San Andrés",
  "short": "ASA",
  "color": null,
  "rating": 26,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-atletico-y-progreso",
  "name": "Atlético y Progreso",
  "short": "AP",
  "color": null,
  "rating": 35,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-banco-hipotecario",
  "name": "Banco Hipotecario",
  "short": "BH",
  "color": null,
  "rating": 29,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-berazategui",
  "name": "Berazategui",
  "short": "BER",
  "color": null,
  "rating": 28,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-berisso",
  "name": "Berisso",
  "short": "BER",
  "color": null,
  "rating": 27,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-beromama",
  "name": "Beromama",
  "short": "BER",
  "color": null,
  "rating": 30,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-bigua",
  "name": "Biguá",
  "short": "BIG",
  "color": null,
  "rating": 30,
  "division": "ar-pampeana-b",
  "ranking": null
 },
 {
  "id": "ar-catamarca-rugby-club",
  "name": "Catamarca Rugby Club",
  "short": "CRC",
  "color": null,
  "rating": 26,
  "division": "ar-noa-andina",
  "ranking": null
 },
 {
  "id": "ar-catriel",
  "name": "Catriel",
  "short": "CAT",
  "color": null,
  "rating": 29,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-cinco-saltos",
  "name": "Cinco Saltos",
  "short": "CS",
  "color": null,
  "rating": 31,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-cipolletti",
  "name": "Cipolletti",
  "short": "CIP",
  "color": null,
  "rating": 32,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-ciudad-de-campana",
  "name": "Ciudad de Campana",
  "short": "CC",
  "color": null,
  "rating": 31,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-club-riojano-amigos-del-rugby",
  "name": "Club Riojano Amigos del Rugby",
  "short": "CRAR",
  "color": null,
  "rating": 27,
  "division": "ar-noa-andina",
  "ranking": null
 },
 {
  "id": "ar-club-social-rugby",
  "name": "Club Social Rugby",
  "short": "CSR",
  "color": null,
  "rating": 24,
  "division": "ar-noa-andina",
  "ranking": null
 },
 {
  "id": "ar-colegio-del-sur",
  "name": "Colegio del Sur",
  "short": "CS",
  "color": null,
  "rating": 26,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-coseba",
  "name": "Coseba",
  "short": "COS",
  "color": null,
  "rating": 28,
  "division": "ar-patagonia-santacruz",
  "ranking": null
 },
 {
  "id": "ar-cuc",
  "name": "CUC",
  "short": "CUC",
  "color": null,
  "rating": 30,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-curda",
  "name": "CURDA",
  "short": "CUR",
  "color": null,
  "rating": 30,
  "division": "ar-nea-a",
  "ranking": null
 },
 {
  "id": "ar-defensores-de-glew",
  "name": "Defensores de Glew",
  "short": "DG",
  "color": null,
  "rating": 27,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-dinos",
  "name": "Dinos",
  "short": "DIN",
  "color": null,
  "rating": 28,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-el-calafate-rugby-hockey",
  "name": "El Calafate Rugby & Hockey",
  "short": "CRH",
  "color": null,
  "rating": 27,
  "division": "ar-patagonia-santacruz",
  "ranking": null
 },
 {
  "id": "ar-el-retiro",
  "name": "El Retiro",
  "short": "ELR",
  "color": null,
  "rating": 36,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-estudiantes-de-olavarria",
  "name": "Estudiantes de Olavarría",
  "short": "EO",
  "color": null,
  "rating": 31,
  "division": "ar-pampeana-b",
  "ranking": null
 },
 {
  "id": "ar-ezeiza",
  "name": "Ezeiza",
  "short": "EZE",
  "color": null,
  "rating": 29,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-floresta",
  "name": "Floresta",
  "short": "FLO",
  "color": null,
  "rating": 25,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-gimnasia-y-esgrima-de-ituzaingo",
  "name": "Gimnasia y Esgrima de Ituzaingó",
  "short": "GEI",
  "color": null,
  "rating": 31,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-huergo",
  "name": "Huergo",
  "short": "HUE",
  "color": null,
  "rating": 28,
  "division": "ar-patagonia-austral",
  "ranking": null
 },
 {
  "id": "ar-jockey-club-villa-maria",
  "name": "Jockey Club Villa María",
  "short": "JCVM",
  "color": null,
  "rating": 43,
  "division": "ar-centro-top10",
  "ranking": null
 },
 {
  "id": "ar-kamikazes-de-colon",
  "name": "Kamikazes de Colón",
  "short": "KC",
  "color": null,
  "rating": 25,
  "division": "ar-pampeana-uroba-sur",
  "ranking": null
 },
 {
  "id": "ar-la-salle",
  "name": "La Salle",
  "short": "LAS",
  "color": null,
  "rating": 31,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-las-canas",
  "name": "Las Cañas",
  "short": "LAS",
  "color": null,
  "rating": 32,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-los-cedros",
  "name": "Los Cedros",
  "short": "LOS",
  "color": null,
  "rating": 32,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-los-condores",
  "name": "Los Cóndores",
  "short": "LOS",
  "color": null,
  "rating": 29,
  "division": "ar-patagonia-austral",
  "ranking": null
 },
 {
  "id": "ar-los-gallos",
  "name": "Los Gallos",
  "short": "LOS",
  "color": null,
  "rating": 28,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-los-guanacos",
  "name": "Los Guanacos",
  "short": "LOS",
  "color": null,
  "rating": 26,
  "division": "ar-patagonia-santacruz",
  "ranking": null
 },
 {
  "id": "ar-los-indios-de-bolivar",
  "name": "Los Indios de Bolívar",
  "short": "IB",
  "color": null,
  "rating": 24,
  "division": "ar-pampeana-uroba-sur",
  "ranking": null
 },
 {
  "id": "ar-los-jabalies",
  "name": "Los Jabalíes",
  "short": "LOS",
  "color": null,
  "rating": 29,
  "division": "ar-patagonia-chubut-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-los-matacos",
  "name": "Los Matacos",
  "short": "LOS",
  "color": null,
  "rating": 25,
  "division": "ar-noa-andina",
  "ranking": null
 },
 {
  "id": "ar-los-patos",
  "name": "Los Patos",
  "short": "LOS",
  "color": null,
  "rating": 28,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-los-pinos",
  "name": "Los Pinos",
  "short": "LOS",
  "color": null,
  "rating": 31,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-maca-tobiano",
  "name": "Macá Tobiano",
  "short": "MT",
  "color": null,
  "rating": 29,
  "division": "ar-patagonia-santacruz",
  "ranking": null
 },
 {
  "id": "ar-marcos-paz",
  "name": "Marcos Paz",
  "short": "MP",
  "color": null,
  "rating": 25,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-mercedes",
  "name": "Mercedes",
  "short": "MER",
  "color": null,
  "rating": 35,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-obras-sanitarias",
  "name": "Obras Sanitarias",
  "short": "OS",
  "color": null,
  "rating": 28,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-old-georgian",
  "name": "Old Georgian",
  "short": "OG",
  "color": null,
  "rating": 34,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-orcas",
  "name": "Orcas",
  "short": "ORC",
  "color": null,
  "rating": 25,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-pac-general-rodriguez",
  "name": "PAC General Rodríguez",
  "short": "PGR",
  "color": null,
  "rating": 28,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-patagonia-rugby-club",
  "name": "Patagonia Rugby Club",
  "short": "PRC",
  "color": null,
  "rating": 29,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-pico-rugby-club",
  "name": "Pico Rugby Club",
  "short": "PRC",
  "color": null,
  "rating": 26,
  "division": "ar-pampeana-uroba-sur",
  "ranking": null
 },
 {
  "id": "ar-porteno",
  "name": "Porteño",
  "short": "POR",
  "color": null,
  "rating": 29,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-pueyrredon-de-mar-del-plata",
  "name": "Pueyrredón de Mar del Plata",
  "short": "PMP",
  "color": null,
  "rating": 28,
  "division": "ar-pampeana-b",
  "ranking": null
 },
 {
  "id": "ar-punta-alta-rugby-club",
  "name": "Punta Alta Rugby Club",
  "short": "PARC",
  "color": null,
  "rating": 27,
  "division": "ar-pampeana-uroba-sur",
  "ranking": null
 },
 {
  "id": "ar-regina",
  "name": "Regina",
  "short": "REG",
  "color": null,
  "rating": 30,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-rio-grande-rugby-hockey",
  "name": "Río Grande Rugby & Hockey",
  "short": "RGRH",
  "color": null,
  "rating": 27,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-rivadavia-de-lobos",
  "name": "Rivadavia de Lobos",
  "short": "RL",
  "color": null,
  "rating": 26,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-san-jose",
  "name": "San José",
  "short": "SJ",
  "color": null,
  "rating": 27,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-san-jose-de-paraguay",
  "name": "San José de Paraguay",
  "short": "SJP",
  "color": null,
  "rating": 31,
  "division": "ar-nea-a",
  "ranking": null
 },
 {
  "id": "ar-san-marcos",
  "name": "San Marcos",
  "short": "SM",
  "color": null,
  "rating": 33,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-san-martin-de-villa-maria",
  "name": "San Martín de Villa María",
  "short": "SMVM",
  "color": null,
  "rating": 43,
  "division": "ar-centro-top10",
  "ranking": null
 },
 {
  "id": "ar-santa-rosa-de-cordoba",
  "name": "Santa Rosa de Córdoba",
  "short": "SRC",
  "color": null,
  "rating": 36,
  "division": "ar-centro-super9b",
  "ranking": null
 },
 {
  "id": "ar-sociedad-hebraica",
  "name": "Sociedad Hebraica",
  "short": "SH",
  "color": null,
  "rating": 24,
  "division": "ar-urba-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-the-british-school",
  "name": "The British School",
  "short": "TBS",
  "color": null,
  "rating": 24,
  "division": "ar-patagonia-santacruz",
  "ranking": null
 },
 {
  "id": "ar-tigre",
  "name": "Tigre",
  "short": "TIG",
  "color": null,
  "rating": 36,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-tiro-federal-de-baradero",
  "name": "Tiro Federal de Baradero",
  "short": "TFB",
  "color": null,
  "rating": 28,
  "division": "ar-urba-tercera",
  "ranking": null
 },
 {
  "id": "ar-tiro-federal-de-san-pedro",
  "name": "Tiro Federal de San Pedro",
  "short": "TFSP",
  "color": null,
  "rating": 33,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-tolhuin",
  "name": "Tolhuin",
  "short": "TOL",
  "color": null,
  "rating": 24,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-trebol",
  "name": "Trébol",
  "short": "TRÉ",
  "color": null,
  "rating": 31,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-turu",
  "name": "Turu",
  "short": "TUR",
  "color": null,
  "rating": 25,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-umag",
  "name": "UMAG",
  "short": "UMA",
  "color": null,
  "rating": 25,
  "division": "ar-patagonia-santacruz",
  "ranking": null
 },
 {
  "id": "ar-uncas",
  "name": "Uncas",
  "short": "UNC",
  "color": null,
  "rating": 28,
  "division": "ar-pampeana-b",
  "ranking": null
 },
 {
  "id": "ar-universitario-de-comodoro",
  "name": "Universitario de Comodoro",
  "short": "UC",
  "color": null,
  "rating": 30,
  "division": "ar-patagonia-austral",
  "ranking": null
 },
 {
  "id": "ar-universitario-de-rio-grande",
  "name": "Universitario de Río Grande",
  "short": "URG",
  "color": null,
  "rating": 29,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-ushuaia-rugby-club",
  "name": "Ushuaia Rugby Club",
  "short": "URC",
  "color": null,
  "rating": 28,
  "division": "ar-patagonia-tdf",
  "ranking": null
 },
 {
  "id": "ar-valcheta",
  "name": "Valcheta",
  "short": "VAL",
  "color": null,
  "rating": 26,
  "division": "ar-patagonia-chubut-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-valle-medio",
  "name": "Valle Medio",
  "short": "VM",
  "color": null,
  "rating": 27,
  "division": "ar-patagonia-chubut-desarrollo",
  "ranking": null
 },
 {
  "id": "ar-varela-jr",
  "name": "Varela Jr.",
  "short": "VJ",
  "color": null,
  "rating": 32,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-vicente-lopez",
  "name": "Vicente López",
  "short": "VL",
  "color": null,
  "rating": 30,
  "division": "ar-urba-segunda",
  "ranking": null
 },
 {
  "id": "ar-zorros",
  "name": "Zorros",
  "short": "ZOR",
  "color": null,
  "rating": 27,
  "division": "ar-patagonia-alto-valle",
  "ranking": null
 },
 {
  "id": "ar-abipones",
  "name": "Abipones",
  "short": "ABI",
  "color": "#767676",
  "rating": 28,
  "division": "ar-nea-bc",
  "ranking": 37.5
 },
 {
  "id": "ar-aero-club-rio-iv",
  "name": "Aero Club Río Cuarto",
  "short": "ACRC",
  "color": "#f7e486",
  "rating": 35,
  "division": "ar-centro-super9b",
  "ranking": 29.5
 },
 {
  "id": "ar-aguara",
  "name": "Aguará",
  "short": "AGU",
  "color": "#0190d4",
  "rating": 31,
  "division": "ar-nea-a",
  "ranking": 56
 },
 {
  "id": "ar-aguara-guazu",
  "name": "Aguará Guazú",
  "short": "AG",
  "color": "#db2911",
  "rating": 28,
  "division": "ar-noa-b",
  "ranking": 36
 },
 {
  "id": "ar-alfiles-s-c",
  "name": "Alfiles",
  "short": "ALF",
  "color": "#fefaf7",
  "rating": 35,
  "division": "ar-oeste-plata",
  "ranking": 38.2
 },
 {
  "id": "ar-alma-juniors",
  "name": "Alma Juniors",
  "short": "AJ",
  "color": "#373435",
  "rating": 37,
  "division": "ar-litoral-segunda",
  "ranking": 50.1
 },
 {
  "id": "ar-alta-gracia-r-c",
  "name": "Alta Gracia",
  "short": "AG",
  "color": "#fe7d00",
  "rating": 37,
  "division": "ar-centro-super9b",
  "ranking": 46
 },
 {
  "id": "ar-aranduroga-r-c",
  "name": "Aranduroga",
  "short": "ARA",
  "color": "#ffffff",
  "rating": 35,
  "division": "ar-nea-a",
  "ranking": 64.9
 },
 {
  "id": "ar-argentino-de-bahia-blanca",
  "name": "Argentino de Bahía Blanca",
  "short": "ABB",
  "color": "#222c57",
  "rating": 35,
  "division": "ar-pampeana-a",
  "ranking": 49
 },
 {
  "id": "ar-argentino-r-c",
  "name": "Argentino",
  "short": "ARG",
  "color": "#182b63",
  "rating": 40,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-asoc-alumni",
  "name": "Alumni",
  "short": "ALU",
  "color": "#fd0000",
  "rating": 51,
  "division": "ar-urba-top14",
  "ranking": 85.3
 },
 {
  "id": "ar-asoc-del-sur",
  "name": "Del Sur",
  "short": "DEL",
  "color": "#00baf1",
  "rating": 37,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-atletico-del-rosario",
  "name": "Atlético del Rosario",
  "short": "AR",
  "color": "#5bc0e6",
  "rating": 48,
  "division": "ar-urba-top14",
  "ranking": 72.6
 },
 {
  "id": "ar-baguales-r-c",
  "name": "Baguales",
  "short": "BAG",
  "color": "#fd6200",
  "rating": 38,
  "division": "ar-centro-super9b",
  "ranking": 51.9
 },
 {
  "id": "ar-banco-nacion",
  "name": "Banco Nación",
  "short": "BN",
  "color": "#2a75ba",
  "rating": 42,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-banco-rugby-club",
  "name": "Banco Rugby Club",
  "short": "BRC",
  "color": "#14587b",
  "rating": 36,
  "division": "ar-oeste-plata",
  "ranking": 37
 },
 {
  "id": "ar-belgrano-athletic",
  "name": "Belgrano Athletic",
  "short": "BA",
  "color": "#fdca00",
  "rating": 50,
  "division": "ar-urba-top14",
  "ranking": 77.9
 },
 {
  "id": "ar-belgrano-rugby-club",
  "name": "Belgrano Rugby Club",
  "short": "BRC",
  "color": "#e3211f",
  "rating": 34,
  "division": "ar-oeste-plata",
  "ranking": 24.4
 },
 {
  "id": "ar-bigornia-r-c",
  "name": "Bigornia Club",
  "short": "BC",
  "color": "#ff7801",
  "rating": 35,
  "division": "ar-patagonia-regional",
  "ranking": 38
 },
 {
  "id": "ar-buenos-aires-crc",
  "name": "Buenos Aires",
  "short": "BA",
  "color": "#ed3d27",
  "rating": 49,
  "division": "ar-urba-top14",
  "ranking": 74.9
 },
 {
  "id": "ar-c-a-provincial",
  "name": "Provincial",
  "short": "PRO",
  "color": "#ed2024",
  "rating": 36,
  "division": "ar-litoral-segunda",
  "ranking": 39.8
 },
 {
  "id": "ar-c-p-b-m",
  "name": "CPBM",
  "short": "CPB",
  "color": null,
  "rating": 44,
  "division": "ar-oeste-oro",
  "ranking": 76.1
 },
 {
  "id": "ar-c-s-la-carlota",
  "name": "Social La Carlota",
  "short": "SC",
  "color": "#0f8d37",
  "rating": 34,
  "division": "ar-centro-super9b",
  "ranking": 30.4
 },
 {
  "id": "ar-calafate-r-c",
  "name": "Calafate",
  "short": "CAL",
  "color": "#45afdf",
  "rating": 31,
  "division": "ar-patagonia-austral",
  "ranking": 44.8
 },
 {
  "id": "ar-capri",
  "name": "CAPRI",
  "short": "CAP",
  "color": "#09648d",
  "rating": 33,
  "division": "ar-nea-a",
  "ranking": 45.4
 },
 {
  "id": "ar-caraya",
  "name": "Carayá",
  "short": "CAR",
  "color": "#fdf003",
  "rating": 28,
  "division": "ar-nea-bc",
  "ranking": 29
 },
 {
  "id": "ar-cardenales-r-c",
  "name": "Cardenales",
  "short": "CAR",
  "color": "#e40003",
  "rating": 35,
  "division": "ar-noa-a",
  "ranking": 75.2
 },
 {
  "id": "ar-carlos-paz-rugby-club",
  "name": "Carlos Paz",
  "short": "CP",
  "color": "#0d3667",
  "rating": 44,
  "division": "ar-centro-top10",
  "ranking": 58.5
 },
 {
  "id": "ar-casa-de-padua",
  "name": "CASA de Padua",
  "short": "CP",
  "color": "#49116e",
  "rating": 34,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-casi",
  "name": "CASI",
  "short": "CAS",
  "color": "#2ca4c4",
  "rating": 52,
  "division": "ar-urba-top14",
  "ranking": 85.9
 },
 {
  "id": "ar-caza-y-pesca",
  "name": "Caza y Pesca",
  "short": "CP",
  "color": "#c42911",
  "rating": 27,
  "division": "ar-nea-bc",
  "ranking": 34.4
 },
 {
  "id": "ar-cazones-r-c",
  "name": "Cazones",
  "short": "CAZ",
  "color": "#0d417c",
  "rating": 28,
  "division": "ar-patagonia-austral",
  "ranking": 19.2
 },
 {
  "id": "ar-centro-cazadores",
  "name": "Centro Cazadores",
  "short": "CC",
  "color": "#312682",
  "rating": 29,
  "division": "ar-nea-bc",
  "ranking": 25
 },
 {
  "id": "ar-centro-naval",
  "name": "Centro Naval",
  "short": "CN",
  "color": "#4cb3e7",
  "rating": 36,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-cha-roga-r-c",
  "name": "Cha Roga",
  "short": "CR",
  "color": "#c30e2f",
  "rating": 35,
  "division": "ar-litoral-segunda",
  "ranking": 31.2
 },
 {
  "id": "ar-chaja",
  "name": "Chajá",
  "short": "CHA",
  "color": "#030f83",
  "rating": 30,
  "division": "ar-nea-bc",
  "ranking": 19.3
 },
 {
  "id": "ar-chenque-r-c",
  "name": "Chenque",
  "short": "CHE",
  "color": "#017ffd",
  "rating": 34,
  "division": "ar-patagonia-regional",
  "ranking": 42.6
 },
 {
  "id": "ar-ciudad-de-buenos-aires",
  "name": "Ciudad de Buenos Aires",
  "short": "CBA",
  "color": "#8fabd2",
  "rating": 36,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-club-areco",
  "name": "Areco",
  "short": "ARE",
  "color": "#e93236",
  "rating": 36,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-club-champagnat",
  "name": "Champagnat",
  "short": "CHA",
  "color": "#023162",
  "rating": 48,
  "division": "ar-urba-top14",
  "ranking": 65.7
 },
 {
  "id": "ar-club-daom",
  "name": "Daom",
  "short": "DAO",
  "color": "#d12329",
  "rating": 35,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-club-el-nacional",
  "name": "El Nacional",
  "short": "ELN",
  "color": "#66b1ce",
  "rating": 29,
  "division": "ar-pampeana-uroba-sur",
  "ranking": 22.6
 },
 {
  "id": "ar-club-italiano",
  "name": "Italiano",
  "short": "ITA",
  "color": "#e30512",
  "rating": 40,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-club-la-tablada",
  "name": "La Tablada",
  "short": "LAT",
  "color": "#070561",
  "rating": 45,
  "division": "ar-centro-top10",
  "ranking": 86.1
 },
 {
  "id": "ar-club-las-aguilas",
  "name": "Las Águilas",
  "short": "LAS",
  "color": "#ff00ea",
  "rating": 30,
  "division": "ar-patagonia-regional",
  "ranking": 29.6
 },
 {
  "id": "ar-club-los-50",
  "name": "Los 50",
  "short": "LOS",
  "color": "#05245e",
  "rating": 31,
  "division": "ar-pampeana-b",
  "ranking": 50.6
 },
 {
  "id": "ar-club-newman",
  "name": "Newman",
  "short": "NEW",
  "color": "#691a32",
  "rating": 52,
  "division": "ar-urba-top14",
  "ranking": 99
 },
 {
  "id": "ar-club-palermo-bajo",
  "name": "Palermo Bajo",
  "short": "PB",
  "color": "#84282b",
  "rating": 44,
  "division": "ar-centro-top10",
  "ranking": 73.4
 },
 {
  "id": "ar-club-pucara",
  "name": "Pucará",
  "short": "PUC",
  "color": "#ed1c24",
  "rating": 47,
  "division": "ar-urba-primera-a",
  "ranking": 48.8
 },
 {
  "id": "ar-club-san-patricio",
  "name": "San Patricio",
  "short": "SP",
  "color": "#048bbb",
  "rating": 41,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-club-tilcara",
  "name": "Tilcara",
  "short": "TIL",
  "color": "#2e9028",
  "rating": 36,
  "division": "ar-litoral-segunda",
  "ranking": 40.6
 },
 {
  "id": "ar-club-universitario-de-cordoba",
  "name": "Universitario de Córdoba",
  "short": "UC",
  "color": "#ff0000",
  "rating": 45,
  "division": "ar-centro-top10",
  "ranking": 80.7
 },
 {
  "id": "ar-comercial-r-c",
  "name": "Comercial Rugby Club",
  "short": "CRC",
  "color": "#0ab4d5",
  "rating": 32,
  "division": "ar-pampeana-a",
  "ranking": 67.5
 },
 {
  "id": "ar-comodoro-r-c",
  "name": "Comodoro",
  "short": "COM",
  "color": "#21325e",
  "rating": 31,
  "division": "ar-patagonia-austral",
  "ranking": 45.1
 },
 {
  "id": "ar-cordoba-athletic-club",
  "name": "Córdoba Athletic",
  "short": "CA",
  "color": "#000000",
  "rating": 45,
  "division": "ar-centro-top10",
  "ranking": 82.6
 },
 {
  "id": "ar-cordoba-rugby-club",
  "name": "Córdoba Rugby Club",
  "short": "CRC",
  "color": "#23479b",
  "rating": 38,
  "division": "ar-centro-super9b",
  "ranking": 44.7
 },
 {
  "id": "ar-crai",
  "name": "CRAI",
  "short": "CRA",
  "color": "#1c83bc",
  "rating": 44,
  "division": "ar-litoral-top10",
  "ranking": 75.8
 },
 {
  "id": "ar-crar",
  "name": "CRAR",
  "short": "CRA",
  "color": "#006d3e",
  "rating": 38,
  "division": "ar-litoral-segunda",
  "ranking": 45
 },
 {
  "id": "ar-cuba",
  "name": "CUBA",
  "short": "CUB",
  "color": "#134d9f",
  "rating": 50,
  "division": "ar-urba-top14",
  "ranking": 76.5
 },
 {
  "id": "ar-cuq",
  "name": "Universitario de Quilmes",
  "short": "UQ",
  "color": "#009fe0",
  "rating": 42,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-curne",
  "name": "CURNE",
  "short": "CUR",
  "color": "#f4ec18",
  "rating": 35,
  "division": "ar-nea-a",
  "ranking": 75.6
 },
 {
  "id": "ar-curupayti",
  "name": "Curupaytí",
  "short": "CUR",
  "color": "#ff0000",
  "rating": 47,
  "division": "ar-urba-primera-a",
  "ranking": 49.7
 },
 {
  "id": "ar-delta-r-c",
  "name": "Delta",
  "short": "DEL",
  "color": "#c6262f",
  "rating": 40,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-deportiva-francesa",
  "name": "Deportiva Francesa",
  "short": "DF",
  "color": "#d9232f",
  "rating": 45,
  "division": "ar-urba-primera-a",
  "ranking": 45.9
 },
 {
  "id": "ar-deportivo-portugues",
  "name": "Deportivo Portugués",
  "short": "DP",
  "color": "#2d5f39",
  "rating": 32,
  "division": "ar-patagonia-regional",
  "ranking": 38.7
 },
 {
  "id": "ar-don-bosco",
  "name": "Don Bosco",
  "short": "DB",
  "color": "#ed1b23",
  "rating": 41,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-draig-goch-r-c",
  "name": "Draig Goch",
  "short": "DG",
  "color": "#da251c",
  "rating": 29,
  "division": "ar-patagonia-austral",
  "ranking": 23.7
 },
 {
  "id": "ar-duendes-r-c",
  "name": "Duendes",
  "short": "DUE",
  "color": "#319448",
  "rating": 46,
  "division": "ar-litoral-top10",
  "ranking": 89.2
 },
 {
  "id": "ar-estudiantes-de-parana",
  "name": "Estudiantes de Paraná",
  "short": "EP",
  "color": "#e3bf5d",
  "rating": 44,
  "division": "ar-litoral-top10",
  "ranking": 85.3
 },
 {
  "id": "ar-geba",
  "name": "GEBA",
  "short": "GEB",
  "color": "#2bafcf",
  "rating": 47,
  "division": "ar-urba-primera-a",
  "ranking": 46.2
 },
 {
  "id": "ar-gimnasia-y-esgrima-de-pergamino",
  "name": "Gimnasia y Esgrima de Pergamino",
  "short": "GEP",
  "color": "#302b53",
  "rating": 34,
  "division": "ar-litoral-segunda",
  "ranking": 32.7
 },
 {
  "id": "ar-gimnasia-y-esgrima-de-rosario",
  "name": "Gimnasia y Esgrima de Rosario",
  "short": "GER",
  "color": "#20254e",
  "rating": 45,
  "division": "ar-litoral-top10",
  "ranking": 77.7
 },
 {
  "id": "ar-gimnasia-y-tiro",
  "name": "Gimnasia y Tiro",
  "short": "GT",
  "color": "#1faee2",
  "rating": 31,
  "division": "ar-noa-b",
  "ranking": 55.9
 },
 {
  "id": "ar-hindu-club",
  "name": "Hindú Club",
  "short": "HC",
  "color": "#c9b510",
  "rating": 51,
  "division": "ar-urba-top14",
  "ranking": 87
 },
 {
  "id": "ar-huazihul",
  "name": "Huazihul",
  "short": "HUA",
  "color": "#ed1a23",
  "rating": 37,
  "division": "ar-oeste-plata",
  "ranking": 51.5
 },
 {
  "id": "ar-huirapuca",
  "name": "Huirapuca",
  "short": "HUI",
  "color": "#33a44d",
  "rating": 37,
  "division": "ar-noa-a",
  "ranking": 81.9
 },
 {
  "id": "ar-hurling",
  "name": "Hurling",
  "short": "HUR",
  "color": "#342562",
  "rating": 47,
  "division": "ar-urba-primera-a",
  "ranking": 46
 },
 {
  "id": "ar-ipr-sporting",
  "name": "IPR Sporting",
  "short": "IS",
  "color": "#282828",
  "rating": 33,
  "division": "ar-pampeana-a",
  "ranking": 70.8
 },
 {
  "id": "ar-italiana-de-charata",
  "name": "Italiana de Charata",
  "short": "IC",
  "color": "#0092dc",
  "rating": 31,
  "division": "ar-nea-bc",
  "ranking": 22.3
 },
 {
  "id": "ar-jockey-club-cordoba",
  "name": "Jockey Club Córdoba",
  "short": "JCC",
  "color": "#fa0000",
  "rating": 46,
  "division": "ar-centro-top10",
  "ranking": 86.1
 },
 {
  "id": "ar-jockey-club-de-rosario",
  "name": "Jockey Club de Rosario",
  "short": "JCR",
  "color": "#2e9028",
  "rating": 46,
  "division": "ar-litoral-top10",
  "ranking": 83.4
 },
 {
  "id": "ar-jockey-club-de-tucuman",
  "name": "Jockey Club de Tucumán",
  "short": "JCT",
  "color": "#922c24",
  "rating": 30,
  "division": "ar-noa-b",
  "ranking": 65.9
 },
 {
  "id": "ar-jockey-club-de-venado-tuerto",
  "name": "Jockey Club de Venado Tuerto",
  "short": "JCVT",
  "color": "#ec1431",
  "rating": 43,
  "division": "ar-litoral-top10",
  "ranking": 61.8
 },
 {
  "id": "ar-jockey-club-salta",
  "name": "Jockey Club de Salta",
  "short": "JCS",
  "color": "#ff0101",
  "rating": 35,
  "division": "ar-noa-a",
  "ranking": 62.7
 },
 {
  "id": "ar-jockey-club-san-juan",
  "name": "Jockey Club de San Juan",
  "short": "JCSJ",
  "color": "#006024",
  "rating": 35,
  "division": "ar-oeste-plata",
  "ranking": 35.9
 },
 {
  "id": "ar-la-plata",
  "name": "La Plata",
  "short": "LAP",
  "color": "#005e9c",
  "rating": 49,
  "division": "ar-urba-top14",
  "ranking": 74.9
 },
 {
  "id": "ar-la-querencia",
  "name": "La Querencia",
  "short": "LAQ",
  "color": "#225bdc",
  "rating": 27,
  "division": "ar-noa-b",
  "ranking": null
 },
 {
  "id": "ar-la-salle-jobson",
  "name": "La Salle Jobson",
  "short": "SJ",
  "color": "#437b8f",
  "rating": 35,
  "division": "ar-litoral-segunda",
  "ranking": 34.7
 },
 {
  "id": "ar-lanus-r-c",
  "name": "Lanús",
  "short": "LAN",
  "color": "#7f1542",
  "rating": 38,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-liceo-militar",
  "name": "Liceo Militar",
  "short": "LM",
  "color": "#f3c61f",
  "rating": 39,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-liceo-naval",
  "name": "Liceo Naval",
  "short": "LN",
  "color": "#31a1db",
  "rating": 41,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-liceo-rugby-club",
  "name": "Liceo",
  "short": "LIC",
  "color": null,
  "rating": 45,
  "division": "ar-oeste-oro",
  "ranking": 73.5
 },
 {
  "id": "ar-lince-rugby-club",
  "name": "Lince",
  "short": "LIN",
  "color": "#7f8084",
  "rating": 34,
  "division": "ar-noa-a",
  "ranking": 56.9
 },
 {
  "id": "ar-logaritmo-rugby-club",
  "name": "Logaritmo",
  "short": "LOG",
  "color": "#672534",
  "rating": 38,
  "division": "ar-litoral-segunda",
  "ranking": 43.5
 },
 {
  "id": "ar-lomas-athletic",
  "name": "Lomas Athletic",
  "short": "LA",
  "color": "#fcca0e",
  "rating": 48,
  "division": "ar-urba-primera-a",
  "ranking": 49.5
 },
 {
  "id": "ar-los-caranchos",
  "name": "Los Caranchos",
  "short": "LOS",
  "color": "#1e0067",
  "rating": 37,
  "division": "ar-litoral-segunda",
  "ranking": 40
 },
 {
  "id": "ar-los-cardos-r-c",
  "name": "Los Cardos",
  "short": "LOS",
  "color": "#005c20",
  "rating": 31,
  "division": "ar-pampeana-a",
  "ranking": 59.4
 },
 {
  "id": "ar-los-chelcos",
  "name": "Los Chelcos",
  "short": "LOS",
  "color": "#00a365",
  "rating": 27,
  "division": "ar-noa-andina",
  "ranking": 34.1
 },
 {
  "id": "ar-los-cuervos-r-c",
  "name": "Los Cuervos",
  "short": "LOS",
  "color": "#2d7895",
  "rating": 37,
  "division": "ar-centro-super9b",
  "ranking": 42.8
 },
 {
  "id": "ar-los-hurones",
  "name": "Los Hurones",
  "short": "LOS",
  "color": "#a30000",
  "rating": 28,
  "division": "ar-noa-andina",
  "ranking": 44.5
 },
 {
  "id": "ar-los-matreros",
  "name": "Los Matreros",
  "short": "LOS",
  "color": "#ed2a32",
  "rating": 49,
  "division": "ar-urba-top14",
  "ranking": 71.2
 },
 {
  "id": "ar-los-miuras",
  "name": "Los Miuras",
  "short": "LOS",
  "color": "#e71c22",
  "rating": 27,
  "division": "ar-pampeana-b",
  "ranking": 34
 },
 {
  "id": "ar-los-molinos",
  "name": "Los Molinos",
  "short": "LOS",
  "color": "#9a3a32",
  "rating": 36,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-los-tarcos",
  "name": "Los Tarcos",
  "short": "LOS",
  "color": "#e60000",
  "rating": 36,
  "division": "ar-noa-a",
  "ranking": 70.7
 },
 {
  "id": "ar-los-teros-r-c",
  "name": "Los Teros",
  "short": "LOS",
  "color": "#f9f9f9",
  "rating": 29,
  "division": "ar-noa-andina",
  "ranking": 52.7
 },
 {
  "id": "ar-los-tilos",
  "name": "Los Tilos",
  "short": "LOS",
  "color": "#33a02c",
  "rating": 50,
  "division": "ar-urba-top14",
  "ranking": 82.2
 },
 {
  "id": "ar-los-tordos-rugby-club",
  "name": "Los Tordos",
  "short": "LOS",
  "color": "#df0204",
  "rating": 46,
  "division": "ar-oeste-oro",
  "ranking": 86
 },
 {
  "id": "ar-lujan-r-c",
  "name": "Luján",
  "short": "LUJ",
  "color": "#3199df",
  "rating": 37,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-manuel-belgrano",
  "name": "Manuel Belgrano",
  "short": "MB",
  "color": "#e51b24",
  "rating": 42,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-mar-del-plata-club",
  "name": "Mar del Plata Club",
  "short": "MPC",
  "color": "#386639",
  "rating": 34,
  "division": "ar-pampeana-a",
  "ranking": 72.1
 },
 {
  "id": "ar-marabunta-r-c",
  "name": "Marabunta",
  "short": "MAR",
  "color": "#158837",
  "rating": 31,
  "division": "ar-patagonia-regional",
  "ranking": 63.8
 },
 {
  "id": "ar-mariano-moreno",
  "name": "Mariano Moreno",
  "short": "MM",
  "color": "#fb0101",
  "rating": 40,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-marista-rugby-club",
  "name": "Marista",
  "short": "MAR",
  "color": null,
  "rating": 46,
  "division": "ar-oeste-oro",
  "ranking": 82.6
 },
 {
  "id": "ar-mendoza-rugby-club",
  "name": "Mendoza Rugby Club",
  "short": "MRC",
  "color": "#ffffff",
  "rating": 45,
  "division": "ar-oeste-oro",
  "ranking": 72.7
 },
 {
  "id": "ar-monte-grande",
  "name": "Monte Grande",
  "short": "MG",
  "color": "#ec1b23",
  "rating": 39,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-natacion-y-gimnasia",
  "name": "Natación y Gimnasia",
  "short": "NG",
  "color": "#e70000",
  "rating": 38,
  "division": "ar-noa-a",
  "ranking": 81.4
 },
 {
  "id": "ar-neuquen-r-c",
  "name": "Neuquén",
  "short": "NEU",
  "color": "#e1001a",
  "rating": 33,
  "division": "ar-patagonia-regional",
  "ranking": 61.6
 },
 {
  "id": "ar-old-lions-r-c",
  "name": "Old Lions",
  "short": "OL",
  "color": "#0000fb",
  "rating": 30,
  "division": "ar-noa-b",
  "ranking": 57.3
 },
 {
  "id": "ar-old-resian-club",
  "name": "Old Resian",
  "short": "OR",
  "color": "#bf0411",
  "rating": 45,
  "division": "ar-litoral-top10",
  "ranking": 73.1
 },
 {
  "id": "ar-olivos-r-c",
  "name": "Olivos",
  "short": "OLI",
  "color": "#ff7f00",
  "rating": 45,
  "division": "ar-urba-primera-a",
  "ranking": 44
 },
 {
  "id": "ar-pampas-de-rufino",
  "name": "Los Pampas de Rufino",
  "short": "PR",
  "color": "#123d8c",
  "rating": 34,
  "division": "ar-litoral-segunda",
  "ranking": 36.4
 },
 {
  "id": "ar-parana-rowing",
  "name": "Paraná Rowing Club",
  "short": "PRC",
  "color": "#7598ce",
  "rating": 43,
  "division": "ar-litoral-top10",
  "ranking": 78.3
 },
 {
  "id": "ar-patoruzu-r-c",
  "name": "Patoruzú",
  "short": "PAT",
  "color": "#f7c100",
  "rating": 30,
  "division": "ar-patagonia-austral",
  "ranking": 38
 },
 {
  "id": "ar-pay-ubre",
  "name": "Pay Ubre",
  "short": "PU",
  "color": "#1b3359",
  "rating": 32,
  "division": "ar-nea-bc",
  "ranking": 31.7
 },
 {
  "id": "ar-peumayen-rugby-club",
  "name": "Peumayén",
  "short": "PEU",
  "color": "#e21831",
  "rating": 38,
  "division": "ar-oeste-plata",
  "ranking": 41.4
 },
 {
  "id": "ar-puerto-madryn-r-c",
  "name": "Puerto Madryn",
  "short": "PM",
  "color": "#0b0162",
  "rating": 32,
  "division": "ar-patagonia-austral",
  "ranking": 32.6
 },
 {
  "id": "ar-pueyrredon",
  "name": "Pueyrredón",
  "short": "PUE",
  "color": "#00498e",
  "rating": 46,
  "division": "ar-urba-primera-a",
  "ranking": 46.5
 },
 {
  "id": "ar-regatas-belgrano-san-nicolas",
  "name": "San Nicolás Rugby",
  "short": "SNR",
  "color": "#31307c",
  "rating": 35,
  "division": "ar-litoral-segunda",
  "ranking": 34.1
 },
 {
  "id": "ar-regatas-de-bella-vista",
  "name": "Regatas Bella Vista",
  "short": "RBV",
  "color": "#0e367b",
  "rating": 50,
  "division": "ar-urba-top14",
  "ranking": 74.7
 },
 {
  "id": "ar-regatas-de-resistencia",
  "name": "Regatas Resistencia",
  "short": "RR",
  "color": "#ff0000",
  "rating": 33,
  "division": "ar-nea-a",
  "ranking": 58.2
 },
 {
  "id": "ar-rio-tercero-r-c",
  "name": "Río Tercero",
  "short": "RT",
  "color": "#048d3d",
  "rating": 35,
  "division": "ar-centro-super9b",
  "ranking": 29.2
 },
 {
  "id": "ar-rivadavia-rugby-club",
  "name": "Rivadavia",
  "short": "RIV",
  "color": "#a80000",
  "rating": 32,
  "division": "ar-oeste-bronce",
  "ranking": 22.6
 },
 {
  "id": "ar-roca-r-c",
  "name": "Roca",
  "short": "ROC",
  "color": "#d20325",
  "rating": 33,
  "division": "ar-patagonia-regional",
  "ranking": 40.5
 },
 {
  "id": "ar-san-albano",
  "name": "San Albano",
  "short": "SA",
  "color": "#005d8d",
  "rating": 46,
  "division": "ar-urba-primera-a",
  "ranking": 43.3
 },
 {
  "id": "ar-san-andres",
  "name": "San Andrés",
  "short": "SA",
  "color": "#00529b",
  "rating": 46,
  "division": "ar-urba-primera-a",
  "ranking": 44.8
 },
 {
  "id": "ar-san-carlos",
  "name": "San Carlos",
  "short": "SC",
  "color": "#2e3e8b",
  "rating": 37,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-san-cirano",
  "name": "San Cirano",
  "short": "SC",
  "color": "#267821",
  "rating": 48,
  "division": "ar-urba-primera-a",
  "ranking": 54.9
 },
 {
  "id": "ar-san-fernando",
  "name": "San Fernando",
  "short": "SF",
  "color": "#0b3770",
  "rating": 46,
  "division": "ar-urba-primera-a",
  "ranking": 47.5
 },
 {
  "id": "ar-san-francisco-r-c",
  "name": "San Francisco",
  "short": "SF",
  "color": "#026ab3",
  "rating": 36,
  "division": "ar-centro-super9b",
  "ranking": 37.9
 },
 {
  "id": "ar-san-ignacio-r-c",
  "name": "San Ignacio",
  "short": "SI",
  "color": "#2e5235",
  "rating": 30,
  "division": "ar-pampeana-a",
  "ranking": 56.7
 },
 {
  "id": "ar-san-isidro-club",
  "name": "SIC",
  "short": "SIC",
  "color": "#2390cf",
  "rating": 51,
  "division": "ar-urba-top14",
  "ranking": 83.8
 },
 {
  "id": "ar-san-jorge-r-c",
  "name": "San Jorge de Mendoza",
  "short": "SJM",
  "color": "#ed3338",
  "rating": 27,
  "division": "ar-oeste-bronce",
  "ranking": 34.1
 },
 {
  "id": "ar-san-jorge-r-c-ua",
  "name": "San Jorge de la Austral",
  "short": "SJA",
  "color": "#0e1218",
  "rating": 27,
  "division": "ar-patagonia-austral",
  "ranking": 15
 },
 {
  "id": "ar-san-juan-rugby-club",
  "name": "San Juan Rugby Club",
  "short": "SJRC",
  "color": "#00a365",
  "rating": 43,
  "division": "ar-oeste-oro",
  "ranking": 75.4
 },
 {
  "id": "ar-san-luis",
  "name": "San Luis",
  "short": "SL",
  "color": "#ac0929",
  "rating": 48,
  "division": "ar-urba-primera-a",
  "ranking": 57.1
 },
 {
  "id": "ar-san-martin",
  "name": "San Martín",
  "short": "SM",
  "color": "#13833b",
  "rating": 41,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-san-miguel-r-c",
  "name": "San Miguel",
  "short": "SM",
  "color": "#ffffff",
  "rating": 34,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-san-patricio",
  "name": "San Patricio de Corrientes",
  "short": "SPC",
  "color": "#e7312d",
  "rating": 34,
  "division": "ar-nea-a",
  "ranking": 59.9
 },
 {
  "id": "ar-santa-fe-r-c",
  "name": "Santa Fe Rugby Club",
  "short": "SFRC",
  "color": null,
  "rating": 45,
  "division": "ar-litoral-top10",
  "ranking": 80.8
 },
 {
  "id": "ar-santa-rosa-r-c",
  "name": "Santa Rosa de La Pampa",
  "short": "SRP",
  "color": "#791f1c",
  "rating": 28,
  "division": "ar-pampeana-uroba-sur",
  "ranking": 33
 },
 {
  "id": "ar-santiago-lawn-tennis-club",
  "name": "Santiago Lawn Tennis",
  "short": "SLT",
  "color": "#bd0100",
  "rating": 31,
  "division": "ar-noa-b",
  "ranking": 55.6
 },
 {
  "id": "ar-santiago-rugby-club",
  "name": "Santiago Rugby",
  "short": "SR",
  "color": "#1b1c14",
  "rating": 28,
  "division": "ar-noa-b",
  "ranking": 35
 },
 {
  "id": "ar-sitas",
  "name": "SITAS",
  "short": "SIT",
  "color": "#de282e",
  "rating": 38,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-sixty-r-c",
  "name": "Sixty",
  "short": "SIX",
  "color": "#0193dc",
  "rating": 32,
  "division": "ar-nea-a",
  "ranking": 57.7
 },
 {
  "id": "ar-sociedad-sportiva-de-bahia-blanca",
  "name": "Sociedad Sportiva de Bahía Blanca",
  "short": "SSBB",
  "color": "#2a1050",
  "rating": 36,
  "division": "ar-pampeana-a",
  "ranking": 78
 },
 {
  "id": "ar-st-brendan-s",
  "name": "St. Brendan's",
  "short": "SBS",
  "color": "#066c2a",
  "rating": 35,
  "division": "ar-urba-primera-c",
  "ranking": null
 },
 {
  "id": "ar-tacuru-rugby-hockey-club",
  "name": "Tacurú",
  "short": "TAC",
  "color": "#2d3283",
  "rating": 36,
  "division": "ar-oeste-plata",
  "ranking": 39.8
 },
 {
  "id": "ar-tala-rugby-club",
  "name": "Tala",
  "short": "TAL",
  "color": "#000000",
  "rating": 46,
  "division": "ar-centro-top10",
  "ranking": 96.7
 },
 {
  "id": "ar-taraguy-r-c",
  "name": "Taragüy",
  "short": "TAR",
  "color": "#272622",
  "rating": 36,
  "division": "ar-nea-a",
  "ranking": 76.1
 },
 {
  "id": "ar-teque-r-c",
  "name": "Teqüe Rugby Club",
  "short": "TRC",
  "color": "#004b99",
  "rating": 43,
  "division": "ar-oeste-oro",
  "ranking": 62.2
 },
 {
  "id": "ar-tigres-r-c",
  "name": "Tigres",
  "short": "TIG",
  "color": "#0a0a0a",
  "rating": 32,
  "division": "ar-noa-b",
  "ranking": 70.1
 },
 {
  "id": "ar-tiro-federal-salta",
  "name": "Tiro Federal de Salta",
  "short": "TFS",
  "color": "#00adf1",
  "rating": 29,
  "division": "ar-noa-b",
  "ranking": 42.2
 },
 {
  "id": "ar-trelew-r-c",
  "name": "Trelew",
  "short": "TRE",
  "color": "#101010",
  "rating": 36,
  "division": "ar-patagonia-regional",
  "ranking": 40.1
 },
 {
  "id": "ar-tucuman-lawn-tennis",
  "name": "Tucumán Lawn Tennis",
  "short": "TLT",
  "color": "#094489",
  "rating": 37,
  "division": "ar-noa-a",
  "ranking": 80.5
 },
 {
  "id": "ar-tucuman-rugby-club",
  "name": "Tucumán Rugby",
  "short": "TR",
  "color": "#009746",
  "rating": 38,
  "division": "ar-noa-a",
  "ranking": 84.7
 },
 {
  "id": "ar-uncaus",
  "name": "UNCAUS",
  "short": "UNC",
  "color": "#57a9e5",
  "rating": 31,
  "division": "ar-nea-bc",
  "ranking": 22.7
 },
 {
  "id": "ar-union-del-sur",
  "name": "Unión del Sur",
  "short": "US",
  "color": "#135f96",
  "rating": 29,
  "division": "ar-pampeana-b",
  "ranking": 49.3
 },
 {
  "id": "ar-universitario-de-bahia-blanca",
  "name": "Universitario de Bahía Blanca",
  "short": "UBB",
  "color": "#fd1004",
  "rating": 32,
  "division": "ar-pampeana-b",
  "ranking": 30.9
 },
 {
  "id": "ar-universitario-de-la-plata",
  "name": "Universitario de La Plata",
  "short": "UP",
  "color": "#1a171b",
  "rating": 45,
  "division": "ar-urba-primera-a",
  "ranking": 40.1
 },
 {
  "id": "ar-universitario-de-mar-del-plata",
  "name": "Universitario de Mar del Plata",
  "short": "UMP",
  "color": "#0092df",
  "rating": 33,
  "division": "ar-pampeana-a",
  "ranking": 71.3
 },
 {
  "id": "ar-universitario-de-mendoza",
  "name": "Universitario de Mendoza",
  "short": "UM",
  "color": "#00843b",
  "rating": 37,
  "division": "ar-oeste-plata",
  "ranking": 46.3
 },
 {
  "id": "ar-universitario-de-rosario",
  "name": "Universitario de Rosario",
  "short": "UR",
  "color": "#1a1a1a",
  "rating": 44,
  "division": "ar-litoral-top10",
  "ranking": 70.1
 },
 {
  "id": "ar-universitario-de-salta",
  "name": "Universitario de Salta",
  "short": "US",
  "color": "#00a235",
  "rating": 36,
  "division": "ar-noa-a",
  "ranking": 62.5
 },
 {
  "id": "ar-universitario-de-san-juan",
  "name": "Universitario de San Juan",
  "short": "USJ",
  "color": "#87d2e9",
  "rating": 44,
  "division": "ar-oeste-oro",
  "ranking": 70.5
 },
 {
  "id": "ar-universitario-de-santa-fe",
  "name": "Universitario de Santa Fe",
  "short": "USF",
  "color": "#000000",
  "rating": 37,
  "division": "ar-litoral-segunda",
  "ranking": 54.3
 },
 {
  "id": "ar-universitario-de-tucuman",
  "name": "Universitario de Tucumán",
  "short": "UT",
  "color": "#6d6c6c",
  "rating": 34,
  "division": "ar-noa-a",
  "ranking": 72.1
 },
 {
  "id": "ar-uru-cure-rugby-club",
  "name": "Urú Curé",
  "short": "UC",
  "color": "#2c58a0",
  "rating": 44,
  "division": "ar-centro-top10",
  "ranking": 74.9
 },
 {
  "id": "ar-vicentinos",
  "name": "Vicentinos",
  "short": "VIC",
  "color": "#003366",
  "rating": 39,
  "division": "ar-urba-primera-b",
  "ranking": null
 },
 {
  "id": "ar-virreyes-r-c",
  "name": "Virreyes",
  "short": "VIR",
  "color": "#257d33",
  "rating": 35,
  "division": "ar-urba-primera-c",
  "ranking": null
 }
];

export const AR_SEVEN_DIVISIONS: ArSevenDivision[] = [
 {
  "id": "ar-urba-top14",
  "label": "Top 14 de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 1,
  "promotesTo": null,
  "relegatesTo": "ar-urba-primera-a",
  "clubs": [
   "ar-casi",
   "ar-club-newman",
   "ar-asoc-alumni",
   "ar-hindu-club",
   "ar-san-isidro-club",
   "ar-belgrano-athletic",
   "ar-cuba",
   "ar-los-tilos",
   "ar-regatas-de-bella-vista",
   "ar-buenos-aires-crc",
   "ar-la-plata",
   "ar-los-matreros",
   "ar-atletico-del-rosario",
   "ar-club-champagnat"
  ]
 },
 {
  "id": "ar-urba-primera-a",
  "label": "Primera A de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 2,
  "promotesTo": "ar-urba-top14",
  "relegatesTo": "ar-urba-primera-b",
  "clubs": [
   "ar-lomas-athletic",
   "ar-san-cirano",
   "ar-san-luis",
   "ar-curupayti",
   "ar-geba",
   "ar-hurling",
   "ar-club-pucara",
   "ar-pueyrredon",
   "ar-san-albano",
   "ar-san-andres",
   "ar-san-fernando",
   "ar-deportiva-francesa",
   "ar-olivos-r-c",
   "ar-universitario-de-la-plata"
  ]
 },
 {
  "id": "ar-urba-primera-b",
  "label": "Primera B de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 3,
  "promotesTo": "ar-urba-primera-a",
  "relegatesTo": "ar-urba-primera-c",
  "clubs": [
   "ar-banco-nacion",
   "ar-manuel-belgrano",
   "ar-cuq",
   "ar-don-bosco",
   "ar-liceo-naval",
   "ar-san-martin",
   "ar-club-san-patricio",
   "ar-argentino-r-c",
   "ar-delta-r-c",
   "ar-club-italiano",
   "ar-mariano-moreno",
   "ar-liceo-militar",
   "ar-monte-grande",
   "ar-vicentinos"
  ]
 },
 {
  "id": "ar-urba-primera-c",
  "label": "Primera C de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 4,
  "promotesTo": "ar-urba-primera-b",
  "relegatesTo": "ar-urba-segunda",
  "clubs": [
   "ar-lanus-r-c",
   "ar-sitas",
   "ar-asoc-del-sur",
   "ar-lujan-r-c",
   "ar-san-carlos",
   "ar-club-areco",
   "ar-centro-naval",
   "ar-ciudad-de-buenos-aires",
   "ar-los-molinos",
   "ar-club-daom",
   "ar-st-brendan-s",
   "ar-virreyes-r-c",
   "ar-casa-de-padua",
   "ar-san-miguel-r-c"
  ]
 },
 {
  "id": "ar-urba-segunda",
  "label": "Segunda de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 5,
  "promotesTo": "ar-urba-primera-c",
  "relegatesTo": "ar-urba-tercera",
  "clubs": [
   "ar-el-retiro",
   "ar-tigre",
   "ar-atletico-y-progreso",
   "ar-mercedes",
   "ar-atletico-chascomus",
   "ar-old-georgian",
   "ar-san-marcos",
   "ar-tiro-federal-de-san-pedro",
   "ar-las-canas",
   "ar-varela-jr",
   "ar-la-salle",
   "ar-los-pinos",
   "ar-albatros",
   "ar-vicente-lopez"
  ]
 },
 {
  "id": "ar-urba-tercera",
  "label": "Tercera de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 6,
  "promotesTo": "ar-urba-segunda",
  "relegatesTo": "ar-urba-desarrollo",
  "clubs": [
   "ar-arsenal-zarate",
   "ar-los-cedros",
   "ar-ciudad-de-campana",
   "ar-gimnasia-y-esgrima-de-ituzaingo",
   "ar-almafuerte",
   "ar-beromama",
   "ar-banco-hipotecario",
   "ar-porteno",
   "ar-pac-general-rodriguez",
   "ar-tiro-federal-de-baradero",
   "ar-berisso"
  ]
 },
 {
  "id": "ar-urba-desarrollo",
  "label": "Desarrollo de la URBA",
  "branch": "urba",
  "region": "urba",
  "level": 7,
  "promotesTo": "ar-urba-tercera",
  "relegatesTo": null,
  "clubs": [
   "ar-ezeiza",
   "ar-berazategui",
   "ar-obras-sanitarias",
   "ar-defensores-de-glew",
   "ar-san-jose",
   "ar-atletico-san-andres",
   "ar-rivadavia-de-lobos",
   "ar-floresta",
   "ar-marcos-paz",
   "ar-sociedad-hebraica"
  ]
 },
 {
  "id": "ar-centro-top10",
  "label": "Top 10 A de Córdoba",
  "branch": "interior",
  "region": "centro",
  "level": 2,
  "promotesTo": null,
  "relegatesTo": "ar-centro-super9b",
  "clubs": [
   "ar-jockey-club-cordoba",
   "ar-tala-rugby-club",
   "ar-cordoba-athletic-club",
   "ar-club-la-tablada",
   "ar-club-universitario-de-cordoba",
   "ar-carlos-paz-rugby-club",
   "ar-club-palermo-bajo",
   "ar-uru-cure-rugby-club",
   "ar-jockey-club-villa-maria",
   "ar-san-martin-de-villa-maria"
  ]
 },
 {
  "id": "ar-centro-super9b",
  "label": "Súper 9 B de Córdoba",
  "branch": "interior",
  "region": "centro",
  "level": 4,
  "promotesTo": "ar-centro-top10",
  "relegatesTo": null,
  "clubs": [
   "ar-baguales-r-c",
   "ar-cordoba-rugby-club",
   "ar-alta-gracia-r-c",
   "ar-los-cuervos-r-c",
   "ar-san-francisco-r-c",
   "ar-santa-rosa-de-cordoba",
   "ar-aero-club-rio-iv",
   "ar-rio-tercero-r-c",
   "ar-c-s-la-carlota"
  ]
 },
 {
  "id": "ar-litoral-top10",
  "label": "Top 10 del Litoral",
  "branch": "interior",
  "region": "litoral",
  "level": 2,
  "promotesTo": null,
  "relegatesTo": "ar-litoral-segunda",
  "clubs": [
   "ar-duendes-r-c",
   "ar-jockey-club-de-rosario",
   "ar-gimnasia-y-esgrima-de-rosario",
   "ar-old-resian-club",
   "ar-santa-fe-r-c",
   "ar-crai",
   "ar-estudiantes-de-parana",
   "ar-universitario-de-rosario",
   "ar-jockey-club-de-venado-tuerto",
   "ar-parana-rowing"
  ]
 },
 {
  "id": "ar-litoral-segunda",
  "label": "Segunda del Litoral",
  "branch": "interior",
  "region": "litoral",
  "level": 4,
  "promotesTo": "ar-litoral-top10",
  "relegatesTo": null,
  "clubs": [
   "ar-crar",
   "ar-logaritmo-rugby-club",
   "ar-alma-juniors",
   "ar-los-caranchos",
   "ar-universitario-de-santa-fe",
   "ar-c-a-provincial",
   "ar-club-tilcara",
   "ar-cha-roga-r-c",
   "ar-la-salle-jobson",
   "ar-regatas-belgrano-san-nicolas",
   "ar-gimnasia-y-esgrima-de-pergamino",
   "ar-pampas-de-rufino"
  ]
 },
 {
  "id": "ar-oeste-oro",
  "label": "Copa de Oro del Oeste",
  "branch": "interior",
  "region": "oeste",
  "level": 2,
  "promotesTo": null,
  "relegatesTo": "ar-oeste-plata",
  "clubs": [
   "ar-los-tordos-rugby-club",
   "ar-marista-rugby-club",
   "ar-liceo-rugby-club",
   "ar-mendoza-rugby-club",
   "ar-c-p-b-m",
   "ar-universitario-de-san-juan",
   "ar-san-juan-rugby-club",
   "ar-teque-r-c"
  ]
 },
 {
  "id": "ar-oeste-plata",
  "label": "Copa de Plata del Oeste",
  "branch": "interior",
  "region": "oeste",
  "level": 4,
  "promotesTo": "ar-oeste-oro",
  "relegatesTo": "ar-oeste-bronce",
  "clubs": [
   "ar-peumayen-rugby-club",
   "ar-huazihul",
   "ar-universitario-de-mendoza",
   "ar-banco-rugby-club",
   "ar-tacuru-rugby-hockey-club",
   "ar-alfiles-s-c",
   "ar-jockey-club-san-juan",
   "ar-belgrano-rugby-club"
  ]
 },
 {
  "id": "ar-oeste-bronce",
  "label": "Copa de Bronce del Oeste",
  "branch": "interior",
  "region": "oeste",
  "level": 6,
  "promotesTo": "ar-oeste-plata",
  "relegatesTo": null,
  "clubs": [
   "ar-rivadavia-rugby-club",
   "ar-san-jorge-r-c"
  ]
 },
 {
  "id": "ar-noa-a",
  "label": "Regional del NOA A",
  "branch": "interior",
  "region": "noa",
  "level": 4,
  "promotesTo": null,
  "relegatesTo": "ar-noa-b",
  "clubs": [
   "ar-natacion-y-gimnasia",
   "ar-tucuman-rugby-club",
   "ar-huirapuca",
   "ar-tucuman-lawn-tennis",
   "ar-los-tarcos",
   "ar-universitario-de-salta",
   "ar-cardenales-r-c",
   "ar-jockey-club-salta",
   "ar-lince-rugby-club",
   "ar-universitario-de-tucuman"
  ]
 },
 {
  "id": "ar-noa-b",
  "label": "Regional del NOA B",
  "branch": "interior",
  "region": "noa",
  "level": 6,
  "promotesTo": "ar-noa-a",
  "relegatesTo": null,
  "clubs": [
   "ar-tigres-r-c",
   "ar-gimnasia-y-tiro",
   "ar-santiago-lawn-tennis-club",
   "ar-jockey-club-de-tucuman",
   "ar-old-lions-r-c",
   "ar-tiro-federal-salta",
   "ar-aguara-guazu",
   "ar-santiago-rugby-club",
   "ar-la-querencia"
  ]
 },
 {
  "id": "ar-noa-andina",
  "label": "Torneo Andino (Catamarca y La Rioja)",
  "branch": "interior",
  "region": "noa",
  "level": 7,
  "promotesTo": "ar-noa-b",
  "relegatesTo": null,
  "clubs": [
   "ar-los-teros-r-c",
   "ar-los-hurones",
   "ar-club-riojano-amigos-del-rugby",
   "ar-los-chelcos",
   "ar-catamarca-rugby-club",
   "ar-los-matacos",
   "ar-club-social-rugby"
  ]
 },
 {
  "id": "ar-nea-a",
  "label": "Regional NEA A",
  "branch": "interior",
  "region": "nea",
  "level": 5,
  "promotesTo": null,
  "relegatesTo": "ar-nea-bc",
  "clubs": [
   "ar-taraguy-r-c",
   "ar-aranduroga-r-c",
   "ar-curne",
   "ar-san-patricio",
   "ar-capri",
   "ar-regatas-de-resistencia",
   "ar-sixty-r-c",
   "ar-aguara",
   "ar-san-jose-de-paraguay",
   "ar-curda"
  ]
 },
 {
  "id": "ar-nea-bc",
  "label": "Regional del NEA B/C",
  "branch": "interior",
  "region": "nea",
  "level": 6,
  "promotesTo": "ar-nea-a",
  "relegatesTo": null,
  "clubs": [
   "ar-pay-ubre",
   "ar-italiana-de-charata",
   "ar-uncaus",
   "ar-chaja",
   "ar-centro-cazadores",
   "ar-abipones",
   "ar-caraya",
   "ar-caza-y-pesca"
  ]
 },
 {
  "id": "ar-pampeana-a",
  "label": "Regional Pampeano A",
  "branch": "interior",
  "region": "pampeana",
  "level": 5,
  "promotesTo": null,
  "relegatesTo": "ar-pampeana-b",
  "clubs": [
   "ar-sociedad-sportiva-de-bahia-blanca",
   "ar-argentino-de-bahia-blanca",
   "ar-mar-del-plata-club",
   "ar-ipr-sporting",
   "ar-universitario-de-mar-del-plata",
   "ar-comercial-r-c",
   "ar-los-cardos-r-c",
   "ar-san-ignacio-r-c"
  ]
 },
 {
  "id": "ar-pampeana-b",
  "label": "Regional Pampeano B",
  "branch": "interior",
  "region": "pampeana",
  "level": 6,
  "promotesTo": "ar-pampeana-a",
  "relegatesTo": null,
  "clubs": [
   "ar-universitario-de-bahia-blanca",
   "ar-estudiantes-de-olavarria",
   "ar-club-los-50",
   "ar-bigua",
   "ar-union-del-sur",
   "ar-pueyrredon-de-mar-del-plata",
   "ar-uncas",
   "ar-los-miuras"
  ]
 },
 {
  "id": "ar-patagonia-regional",
  "label": "Regional Patagónico",
  "branch": "interior",
  "region": "patagonia",
  "level": 5,
  "promotesTo": null,
  "relegatesTo": "ar-patagonia-austral",
  "clubs": [
   "ar-trelew-r-c",
   "ar-bigornia-r-c",
   "ar-chenque-r-c",
   "ar-neuquen-r-c",
   "ar-roca-r-c",
   "ar-deportivo-portugues",
   "ar-marabunta-r-c",
   "ar-club-las-aguilas"
  ]
 },
 {
  "id": "ar-pampeana-uroba-sur",
  "label": "Regional Pampeano UROBA-Sur",
  "branch": "interior",
  "region": "pampeana",
  "level": 7,
  "promotesTo": "ar-pampeana-b",
  "relegatesTo": null,
  "clubs": [
   "ar-club-el-nacional",
   "ar-santa-rosa-r-c",
   "ar-punta-alta-rugby-club",
   "ar-pico-rugby-club",
   "ar-kamikazes-de-colon",
   "ar-los-indios-de-bolivar"
  ]
 },
 {
  "id": "ar-patagonia-austral",
  "label": "Torneo Austral (Valle del Chubut y Austral)",
  "branch": "interior",
  "region": "patagonia",
  "level": 6,
  "promotesTo": "ar-patagonia-regional",
  "relegatesTo": null,
  "clubs": [
   "ar-puerto-madryn-r-c",
   "ar-calafate-r-c",
   "ar-comodoro-r-c",
   "ar-patoruzu-r-c",
   "ar-universitario-de-comodoro",
   "ar-draig-goch-r-c",
   "ar-los-condores",
   "ar-cazones-r-c",
   "ar-huergo",
   "ar-san-jorge-r-c-ua"
  ]
 },
 {
  "id": "ar-patagonia-alto-valle",
  "label": "Torneo del Alto Valle",
  "branch": "interior",
  "region": "patagonia",
  "level": 6,
  "promotesTo": "ar-patagonia-regional",
  "relegatesTo": null,
  "clubs": [
   "ar-allen",
   "ar-cipolletti",
   "ar-cinco-saltos",
   "ar-trebol",
   "ar-cuc",
   "ar-regina",
   "ar-catriel",
   "ar-patagonia-rugby-club",
   "ar-dinos",
   "ar-los-patos",
   "ar-aguara-del-alto-valle",
   "ar-zorros"
  ]
 },
 {
  "id": "ar-patagonia-tdf",
  "label": "Torneo de Tierra del Fuego",
  "branch": "interior",
  "region": "patagonia",
  "level": 7,
  "promotesTo": "ar-patagonia-austral",
  "relegatesTo": null,
  "clubs": [
   "ar-universitario-de-rio-grande",
   "ar-los-gallos",
   "ar-ushuaia-rugby-club",
   "ar-rio-grande-rugby-hockey",
   "ar-colegio-del-sur",
   "ar-orcas",
   "ar-turu",
   "ar-tolhuin"
  ]
 },
 {
  "id": "ar-patagonia-santacruz",
  "label": "Torneo Santacruceño",
  "branch": "interior",
  "region": "patagonia",
  "level": 7,
  "promotesTo": "ar-patagonia-austral",
  "relegatesTo": null,
  "clubs": [
   "ar-maca-tobiano",
   "ar-coseba",
   "ar-el-calafate-rugby-hockey",
   "ar-los-guanacos",
   "ar-umag",
   "ar-the-british-school"
  ]
 },
 {
  "id": "ar-patagonia-chubut-desarrollo",
  "label": "Desarrollo del Valle del Chubut",
  "branch": "interior",
  "region": "patagonia",
  "level": 7,
  "promotesTo": "ar-patagonia-austral",
  "relegatesTo": null,
  "clubs": [
   "ar-los-jabalies",
   "ar-valle-medio",
   "ar-valcheta",
   "ar-albatros-del-chubut"
  ]
 }
];

/** Plazas de cada región en el TDI A y B 2026 y de qué regional salen. */
export const AR_SEVEN_CUPOS: { region: string; sourceCompetitionId: string; tdiA: number; tdiB: number }[] = [
 {
  "region": "centro",
  "sourceCompetitionId": "ar-centro-top10",
  "tdiA": 6,
  "tdiB": 2
 },
 {
  "region": "litoral",
  "sourceCompetitionId": "ar-litoral-top10",
  "tdiA": 6,
  "tdiB": 2
 },
 {
  "region": "oeste",
  "sourceCompetitionId": "ar-oeste-oro",
  "tdiA": 2,
  "tdiB": 3
 },
 {
  "region": "noa",
  "sourceCompetitionId": "ar-noa-a",
  "tdiA": 1,
  "tdiB": 6
 },
 {
  "region": "nea",
  "sourceCompetitionId": "ar-nea-a",
  "tdiA": 1,
  "tdiB": 0
 },
 {
  "region": "pampeana",
  "sourceCompetitionId": "ar-pampeana-a",
  "tdiA": 0,
  "tdiB": 3
 },
 {
  "region": "patagonia",
  "sourceCompetitionId": "ar-patagonia-regional",
  "tdiA": 0,
  "tdiB": 0
 }
];
