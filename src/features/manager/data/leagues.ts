// Datos de clubes y ligas para el mundo demo.

import type { CountryCode, NatlCountryCode } from './names.ts'
import { AR_LEAGUES, SOUTH_AMERICA_LEAGUES } from './argentina.ts'

export type AnyCountryCode = CountryCode | NatlCountryCode

export interface ClubData {
  name: string
  shortName: string
  city: string
  baseReputation: number
  /** Override del país de este club (para ligas multi-país como URC o SRA).
   *  Se acepta cualquier ISO-3 presente en WORLD_RUGBY_NATIONS; `randomAnyName`
   *  cae en pool genérico para códigos sin pool específico. */
  countryOverride?: string
  /** Id del club en el catálogo de G22; con él se pide el escudo real. */
  catalogId?: string
  /** Ruta pública del escudo real, o null si no hay archivo. */
  crest?: string | null
  primaryColor?: string
  secondaryColor?: string
}

export interface LeagueData {
  name: string
  shortName: string
  countryCode: CountryCode | NatlCountryCode
  countryName: string
  region: 'europe' | 'oceania' | 'south_america' | 'north_america' | 'africa' | 'asia'
  tier: 1 | 2 | 3 | 4
  federationName: string
  salaryCap: number | null
  startMonth: number
  startDay: number
  /** Hemisferio organizativo: determina si la liga arranca en Y (norte, Sep-Jun)
   *  o en Y+1 (sur, Feb-Jun) dentro del seasonYear, y qué release windows aplica. */
  northOrSouth: 'north' | 'south'
  clubs: ClubData[]
  /** Varias ligas de un mismo país comparten UN solo `Country` (Argentina tiene 28). El país
   *  toma el tier del catálogo de naciones de World Rugby, no el de la liga. */
  sharedCountry?: boolean
  /** Si true, los clubes usan su countryOverride; no es una liga "de un país". */
  multiCountry?: boolean
  /** Si false, la liga termina con la tabla regular y no se generan playoffs. Default: true. */
  hasPlayoff?: boolean
  /** Número de equipos clasificados a playoff: 0 | 4 | 6 | 8. Default: 8 si >=12 clubes, 4 si menos. */
  playoffTeams?: 0 | 4 | 6 | 8
  /** Cuántos equipos suben al final de temporada al tier superior emparejado. Default: 0. */
  promotion?: number
  /** Cuántos equipos descienden al final de temporada al tier inferior emparejado. Default: 0. */
  relegation?: number
}

export const DIVISION_DE_HONOR: LeagueData = {
  name: 'División de Honor', shortName: 'DH',
  countryCode: 'ESP', countryName: 'España', region: 'europe', tier: 2,
  federationName: 'FER', salaryCap: 800_000,
  startMonth: 9, startDay: 5,
  northOrSouth: 'north',
  playoffTeams: 4,
  clubs: [
    { name: 'VRAC Valladolid', shortName: 'VRC', city: 'Valladolid', baseReputation: 65 },
    { name: 'Aparejadores Burgos', shortName: 'BUR', city: 'Burgos', baseReputation: 55 },
    { name: 'Alcobendas Rugby', shortName: 'ALC', city: 'Alcobendas', baseReputation: 50 },
    { name: 'CR Cisneros', shortName: 'CIS', city: 'Madrid', baseReputation: 45 },
    { name: 'Hernani CRE', shortName: 'HER', city: 'Hernani', baseReputation: 48 },
    { name: 'SilverStorm El Salvador', shortName: 'SAL', city: 'Valladolid', baseReputation: 60 },
    { name: 'Sanitas Alcalá', shortName: 'SAA', city: 'Alcalá', baseReputation: 42 },
    { name: 'Independiente Santander', shortName: 'IND', city: 'Santander', baseReputation: 40 },
    { name: 'Vigo Rugby', shortName: 'VIG', city: 'Vigo', baseReputation: 38 },
    { name: 'CRC Pozuelo', shortName: 'POZ', city: 'Pozuelo', baseReputation: 35 },
    { name: 'Getxo Artea', shortName: 'GET', city: 'Getxo', baseReputation: 35 },
    { name: 'Ordizia RE', shortName: 'ORD', city: 'Ordizia', baseReputation: 32 }
  ]
}

export const TOP_14: LeagueData = {
  name: 'Top 14', shortName: 'T14',
  countryCode: 'FRA', countryName: 'Francia', region: 'europe', tier: 1,
  federationName: 'FFR / LNR', salaryCap: 12_000_000,
  startMonth: 9, startDay: 5,
  northOrSouth: 'north',
  playoffTeams: 6, relegation: 1,
  clubs: [
    { name: 'Stade Toulousain', shortName: 'TLS', city: 'Toulouse', baseReputation: 95 },
    { name: 'Racing 92', shortName: 'R92', city: 'Nanterre', baseReputation: 88 },
    { name: 'La Rochelle', shortName: 'STR', city: 'La Rochelle', baseReputation: 87 },
    { name: 'Bordeaux Bègles', shortName: 'UBB', city: 'Bordeaux', baseReputation: 82 },
    { name: 'Stade Français', shortName: 'SFP', city: 'Paris', baseReputation: 80 },
    { name: 'Castres Olympique', shortName: 'CAS', city: 'Castres', baseReputation: 75 },
    { name: 'Lyon OU', shortName: 'LOU', city: 'Lyon', baseReputation: 78 },
    { name: 'Montpellier Hérault', shortName: 'MHR', city: 'Montpellier', baseReputation: 76 },
    { name: 'Section Paloise', shortName: 'PAU', city: 'Pau', baseReputation: 68 },
    { name: 'Clermont Auvergne', shortName: 'ASM', city: 'Clermont-Ferrand', baseReputation: 85 },
    { name: 'Toulon RCT', shortName: 'RCT', city: 'Toulon', baseReputation: 83 },
    { name: 'Bayonne', shortName: 'AVB', city: 'Bayonne', baseReputation: 64 },
    { name: 'Perpignan USAP', shortName: 'USA', city: 'Perpignan', baseReputation: 62 },
    { name: 'Vannes RC', shortName: 'RCV', city: 'Vannes', baseReputation: 55 }
  ]
}

export const PRO_D2: LeagueData = {
  name: 'Pro D2', shortName: 'PD2',
  countryCode: 'FRA', countryName: 'Francia', region: 'europe', tier: 2,
  federationName: 'FFR / LNR', salaryCap: 4_500_000,
  startMonth: 8, startDay: 28,
  northOrSouth: 'north',
  playoffTeams: 6, promotion: 1,
  clubs: [
    { name: 'Grenoble FCG', shortName: 'FCG', city: 'Grenoble', baseReputation: 62 },
    { name: 'Mont-de-Marsan', shortName: 'SMR', city: 'Mont-de-Marsan', baseReputation: 55 },
    { name: 'Oyonnax Rugby', shortName: 'OYO', city: 'Oyonnax', baseReputation: 58 },
    { name: 'Provence Rugby', shortName: 'PRR', city: 'Aix-en-Provence', baseReputation: 54 },
    { name: 'SU Agen', shortName: 'AGN', city: 'Agen', baseReputation: 50 },
    { name: 'Béziers', shortName: 'ASB', city: 'Béziers', baseReputation: 48 },
    { name: 'Brive', shortName: 'CAB', city: 'Brive-la-Gaillarde', baseReputation: 56 },
    { name: 'Colomiers', shortName: 'COL', city: 'Colomiers', baseReputation: 44 },
    { name: 'Dax', shortName: 'DAX', city: 'Dax', baseReputation: 42 },
    { name: 'Aurillac', shortName: 'AUR', city: 'Aurillac', baseReputation: 38 },
    { name: 'Nevers', shortName: 'USO', city: 'Nevers', baseReputation: 45 },
    { name: 'Rouen Normandie', shortName: 'RNR', city: 'Rouen', baseReputation: 40 },
    { name: 'Soyaux Angoulême', shortName: 'SAR', city: 'Angoulême', baseReputation: 46 },
    { name: 'Biarritz Olympique', shortName: 'BOP', city: 'Biarritz', baseReputation: 60 },
    { name: 'Carcassonne', shortName: 'USC', city: 'Carcassonne', baseReputation: 36 },
    { name: 'Valence Romans', shortName: 'VRD', city: 'Valence', baseReputation: 38 }
  ]
}

export const PREMIERSHIP: LeagueData = {
  name: 'Gallagher Premiership', shortName: 'GP',
  countryCode: 'ENG', countryName: 'Inglaterra', region: 'europe', tier: 1,
  federationName: 'RFU', salaryCap: 7_000_000,
  startMonth: 9, startDay: 12,
  northOrSouth: 'north',
  playoffTeams: 4, relegation: 1,
  clubs: [
    { name: 'Saracens', shortName: 'SAR', city: 'Londres', baseReputation: 92 },
    { name: 'Leicester Tigers', shortName: 'LEI', city: 'Leicester', baseReputation: 88 },
    { name: 'Bath Rugby', shortName: 'BTH', city: 'Bath', baseReputation: 85 },
    { name: 'Sale Sharks', shortName: 'SLE', city: 'Manchester', baseReputation: 82 },
    { name: 'Northampton Saints', shortName: 'NOR', city: 'Northampton', baseReputation: 86 },
    { name: 'Harlequins', shortName: 'HAR', city: 'Londres', baseReputation: 83 },
    { name: 'Exeter Chiefs', shortName: 'EXE', city: 'Exeter', baseReputation: 87 },
    { name: 'Bristol Bears', shortName: 'BRI', city: 'Bristol', baseReputation: 78 },
    { name: 'Gloucester', shortName: 'GLO', city: 'Gloucester', baseReputation: 75 },
    { name: 'Newcastle Falcons', shortName: 'NEW', city: 'Newcastle', baseReputation: 65 }
  ]
}

export const RFU_CHAMPIONSHIP: LeagueData = {
  name: 'RFU Championship', shortName: 'CHA',
  countryCode: 'ENG', countryName: 'Inglaterra', region: 'europe', tier: 2,
  federationName: 'RFU', salaryCap: 1_500_000,
  startMonth: 9, startDay: 12,
  northOrSouth: 'north',
  playoffTeams: 6, promotion: 1,
  clubs: [
    { name: 'Ealing Trailfinders', shortName: 'EAL', city: 'Londres', baseReputation: 70 },
    { name: 'Bedford Blues', shortName: 'BED', city: 'Bedford', baseReputation: 60 },
    { name: 'Coventry', shortName: 'COV', city: 'Coventry', baseReputation: 58 },
    { name: 'Worcester Warriors', shortName: 'WOR', city: 'Worcester', baseReputation: 65 },
    { name: 'Chinnor', shortName: 'CHN', city: 'Chinnor', baseReputation: 48 },
    { name: 'Hartpury', shortName: 'HPY', city: 'Gloucester', baseReputation: 50 },
    { name: 'Cornish Pirates', shortName: 'CPI', city: 'Penzance', baseReputation: 55 },
    { name: 'Doncaster Knights', shortName: 'DON', city: 'Doncaster', baseReputation: 56 },
    { name: 'Nottingham', shortName: 'NOT', city: 'Nottingham', baseReputation: 50 },
    { name: 'Ampthill', shortName: 'AMP', city: 'Ampthill', baseReputation: 45 },
    { name: 'Caldy', shortName: 'CLD', city: 'West Kirby', baseReputation: 42 },
    { name: 'Richmond', shortName: 'RIC', city: 'Londres', baseReputation: 48 },
    { name: 'London Scottish', shortName: 'LSC', city: 'Londres', baseReputation: 46 },
    { name: 'Cambridge', shortName: 'CAM', city: 'Cambridge', baseReputation: 40 }
  ]
}

export const URC: LeagueData = {
  name: 'United Rugby Championship', shortName: 'URC',
  countryCode: 'ESP', countryName: 'Multi-país', region: 'europe', tier: 1,
  federationName: 'EPCR / URC', salaryCap: null,
  startMonth: 9, startDay: 20,
  northOrSouth: 'north',
  multiCountry: true,
  playoffTeams: 8,
  clubs: [
    { name: 'Leinster Rugby', shortName: 'LEI', city: 'Dublín', baseReputation: 94, countryOverride: 'IRL' },
    { name: 'Munster Rugby', shortName: 'MUN', city: 'Limerick', baseReputation: 88, countryOverride: 'IRL' },
    { name: 'Ulster Rugby', shortName: 'ULS', city: 'Belfast', baseReputation: 82, countryOverride: 'IRL' },
    { name: 'Connacht Rugby', shortName: 'CON', city: 'Galway', baseReputation: 72, countryOverride: 'IRL' },
    { name: 'Glasgow Warriors', shortName: 'GLA', city: 'Glasgow', baseReputation: 85, countryOverride: 'SCO' },
    { name: 'Edinburgh Rugby', shortName: 'EDI', city: 'Edimburgo', baseReputation: 78, countryOverride: 'SCO' },
    { name: 'Cardiff Rugby', shortName: 'CAR', city: 'Cardiff', baseReputation: 70, countryOverride: 'WAL' },
    { name: 'Ospreys', shortName: 'OSP', city: 'Swansea', baseReputation: 72, countryOverride: 'WAL' },
    { name: 'Scarlets', shortName: 'SCA', city: 'Llanelli', baseReputation: 68, countryOverride: 'WAL' },
    { name: 'Dragons RFC', shortName: 'DRA', city: 'Newport', baseReputation: 60, countryOverride: 'WAL' },
    { name: 'Benetton Treviso', shortName: 'BEN', city: 'Treviso', baseReputation: 75, countryOverride: 'ITA' },
    { name: 'Zebre Parma', shortName: 'ZEB', city: 'Parma', baseReputation: 58, countryOverride: 'ITA' },
    { name: 'Vodacom Bulls', shortName: 'BUL', city: 'Pretoria', baseReputation: 85, countryOverride: 'ZAF' },
    { name: 'Cell C Sharks', shortName: 'SHA', city: 'Durban', baseReputation: 82, countryOverride: 'ZAF' },
    { name: 'DHL Stormers', shortName: 'STO', city: 'Cape Town', baseReputation: 86, countryOverride: 'ZAF' },
    { name: 'Emirates Lions', shortName: 'LIO', city: 'Johannesburgo', baseReputation: 78, countryOverride: 'ZAF' }
  ]
}

export const SUPER_RUGBY_PACIFIC: LeagueData = {
  name: 'Super Rugby Pacific', shortName: 'SRP',
  countryCode: 'ENG', countryName: 'Pacífico', region: 'oceania', tier: 1,
  federationName: 'SANZAAR', salaryCap: null,
  startMonth: 2, startDay: 14,
  northOrSouth: 'south',
  multiCountry: true,
  playoffTeams: 6,
  clubs: [
    { name: 'Crusaders', shortName: 'CRU', city: 'Christchurch', baseReputation: 96, countryOverride: 'NZL' },
    { name: 'Blues', shortName: 'BLU', city: 'Auckland', baseReputation: 88, countryOverride: 'NZL' },
    { name: 'Chiefs', shortName: 'CHI', city: 'Hamilton', baseReputation: 86, countryOverride: 'NZL' },
    { name: 'Hurricanes', shortName: 'HUR', city: 'Wellington', baseReputation: 84, countryOverride: 'NZL' },
    { name: 'Highlanders', shortName: 'HIG', city: 'Dunedin', baseReputation: 78, countryOverride: 'NZL' },
    { name: 'NSW Waratahs', shortName: 'WAR', city: 'Sídney', baseReputation: 80, countryOverride: 'AUS' },
    { name: 'Queensland Reds', shortName: 'RED', city: 'Brisbane', baseReputation: 78, countryOverride: 'AUS' },
    { name: 'ACT Brumbies', shortName: 'BRU', city: 'Canberra', baseReputation: 82, countryOverride: 'AUS' },
    { name: 'Melbourne Rebels', shortName: 'REB', city: 'Melbourne', baseReputation: 64, countryOverride: 'AUS' },
    { name: 'Western Force', shortName: 'FOR', city: 'Perth', baseReputation: 66, countryOverride: 'AUS' },
    { name: 'Fijian Drua', shortName: 'DRU', city: 'Suva', baseReputation: 68, countryOverride: 'FIJ' },
    { name: 'Moana Pasifika', shortName: 'MOA', city: 'Auckland', baseReputation: 60, countryOverride: 'SAM' }
  ]
}

export const JAPAN_LEAGUE_ONE: LeagueData = {
  name: 'Japan Rugby League One', shortName: 'JRL',
  countryCode: 'JPN', countryName: 'Japón', region: 'asia', tier: 1,
  federationName: 'JRFU', salaryCap: null,
  startMonth: 12, startDay: 9,
  northOrSouth: 'south',
  playoffTeams: 4,
  clubs: [
    { name: 'Saitama Wild Knights', shortName: 'WKN', city: 'Saitama', baseReputation: 85 },
    { name: 'Yokohama Eagles', shortName: 'YEA', city: 'Yokohama', baseReputation: 78 },
    { name: 'Tokyo Sungoliath', shortName: 'SUN', city: 'Tokio', baseReputation: 82 },
    { name: 'Toshiba Brave Lupus', shortName: 'BLU', city: 'Tokio', baseReputation: 80 },
    { name: 'Kobe Steelers', shortName: 'KOB', city: 'Kobe', baseReputation: 74 },
    { name: 'Kubota Spears', shortName: 'KUB', city: 'Funabashi', baseReputation: 76 },
    { name: 'Shizuoka Blue Revs', shortName: 'BRE', city: 'Shizuoka', baseReputation: 64 },
    { name: 'Mie Honda Heat', shortName: 'HON', city: 'Suzuka', baseReputation: 56 },
    { name: 'Black Rams Tokyo', shortName: 'BRT', city: 'Tokio', baseReputation: 62 },
    { name: 'Mitsubishi Sagamihara', shortName: 'DYB', city: 'Sagamihara', baseReputation: 58 },
    { name: 'Hanazono Liners', shortName: 'LIN', city: 'Osaka', baseReputation: 50 },
    { name: 'Toyota Verblitz', shortName: 'VER', city: 'Toyota', baseReputation: 72 }
  ]
}

export const MAJOR_LEAGUE_RUGBY: LeagueData = {
  name: 'Major League Rugby', shortName: 'MLR',
  countryCode: 'USA', countryName: 'Estados Unidos', region: 'north_america', tier: 1,
  federationName: 'USAR', salaryCap: 600_000,
  startMonth: 3, startDay: 1,
  northOrSouth: 'south',
  playoffTeams: 4,
  clubs: [
    { name: 'New England Free Jacks', shortName: 'NEF', city: 'Boston', baseReputation: 65 },
    { name: 'San Diego Legion', shortName: 'SDL', city: 'San Diego', baseReputation: 62 },
    { name: 'Houston SaberCats', shortName: 'HOU', city: 'Houston', baseReputation: 56 },
    { name: 'Chicago Hounds', shortName: 'CHI', city: 'Chicago', baseReputation: 54 },
    { name: 'Seattle Seawolves', shortName: 'SEA', city: 'Seattle', baseReputation: 60 },
    { name: 'NOLA Gold', shortName: 'NOL', city: 'Nueva Orleans', baseReputation: 52 },
    { name: 'Old Glory DC', shortName: 'OGD', city: 'Washington', baseReputation: 50 },
    { name: 'Utah Warriors', shortName: 'UTW', city: 'Salt Lake City', baseReputation: 54 },
    { name: 'RFC Los Angeles', shortName: 'RLA', city: 'Los Ángeles', baseReputation: 48 },
    { name: 'Anthem Rugby Carolina', shortName: 'ARC', city: 'Charlotte', baseReputation: 45 },
    { name: 'Dallas Jackals', shortName: 'DAL', city: 'Dallas', baseReputation: 42 },
    { name: 'Miami Sharks', shortName: 'MIA', city: 'Miami', baseReputation: 46 }
  ]
}

export const SUPER_RUGBY_AMERICAS: LeagueData = {
  name: 'Súper Rugby Américas', shortName: 'SRA',
  countryCode: 'ARG', countryName: 'Sudamérica', region: 'south_america', tier: 1,
  federationName: 'Sudamérica Rugby', salaryCap: null,
  startMonth: 3, startDay: 14,
  northOrSouth: 'south',
  multiCountry: true,
  // Su `countryCode` ARG es el país real: comparte Country con las ligas argentinas.
  sharedCountry: true,
  playoffTeams: 4,
  clubs: [
    { name: 'Dogos XV', shortName: 'DOG', city: 'Córdoba', baseReputation: 72, countryOverride: 'ARG' },
    { name: 'Pampas XV', shortName: 'PAM', city: 'Buenos Aires', baseReputation: 70, countryOverride: 'ARG' },
    { name: 'Tarucas XV', shortName: 'TAR', city: 'San Salvador de Jujuy', baseReputation: 60, countryOverride: 'ARG' },
    { name: 'Pumas XV', shortName: 'PUM', city: 'Buenos Aires', baseReputation: 74, countryOverride: 'ARG' },
    { name: 'Peñarol Rugby', shortName: 'PEN', city: 'Montevideo', baseReputation: 65, countryOverride: 'URU' },
    { name: 'Selknam', shortName: 'SEL', city: 'Santiago', baseReputation: 58, countryOverride: 'CHI' },
    { name: 'Yacaré XV', shortName: 'YAC', city: 'Asunción', baseReputation: 48, countryOverride: 'PAR' },
    { name: 'Cobras XV', shortName: 'COB', city: 'São Paulo', baseReputation: 52, countryOverride: 'BRA' }
  ]
}

export const CURRIE_CUP: LeagueData = {
  name: 'Currie Cup Premier Division', shortName: 'CCP',
  countryCode: 'ZAF', countryName: 'Sudáfrica', region: 'africa', tier: 2,
  federationName: 'SA Rugby', salaryCap: null,
  startMonth: 8, startDay: 15,
  northOrSouth: 'south',
  playoffTeams: 4,
  clubs: [
    { name: 'Blue Bulls', shortName: 'BBU', city: 'Pretoria', baseReputation: 75 },
    { name: 'Western Province', shortName: 'WPR', city: 'Cape Town', baseReputation: 78 },
    { name: 'Sharks XV', shortName: 'SHX', city: 'Durban', baseReputation: 72 },
    { name: 'Golden Lions', shortName: 'GLI', city: 'Johannesburgo', baseReputation: 70 },
    { name: 'Free State Cheetahs', shortName: 'CHE', city: 'Bloemfontein', baseReputation: 68 },
    { name: 'Griquas', shortName: 'GRI', city: 'Kimberley', baseReputation: 55 },
    { name: 'Pumas', shortName: 'PMA', city: 'Nelspruit', baseReputation: 54 },
    { name: 'Boland Cavaliers', shortName: 'BLD', city: 'Wellington', baseReputation: 45 }
  ]
}

export const ALL_LEAGUES: LeagueData[] = [
  DIVISION_DE_HONOR,
  TOP_14,
  PRO_D2,
  PREMIERSHIP,
  RFU_CHAMPIONSHIP,
  URC,
  SUPER_RUGBY_PACIFIC,
  JAPAN_LEAGUE_ONE,
  MAJOR_LEAGUE_RUGBY,
  SUPER_RUGBY_AMERICAS,
  CURRIE_CUP,
  // El sistema argentino completo y Uruguay y Chile, leídos del catálogo de G22.
  ...AR_LEAGUES,
  ...SOUTH_AMERICA_LEAGUES
]
