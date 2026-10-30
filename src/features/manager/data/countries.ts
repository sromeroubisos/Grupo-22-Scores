// Catálogo completo de naciones miembro de World Rugby (134 federaciones)
// agrupadas por las 6 uniones regionales reales.

export type Region = 'europe' | 'oceania' | 'south_america' | 'north_america' | 'africa' | 'asia'

export interface NationData {
  code: string
  name: string
  region: Region
  /** Federación regional a la que pertenece. */
  union: 'Rugby Europe' | 'Oceania Rugby' | 'Sudamérica Rugby' | 'Rugby Americas North' | 'Rugby Africa' | 'Asia Rugby'
  /** Categoría jerárquica aproximada (1 = élite, 4 = en desarrollo). */
  tier: 1 | 2 | 3 | 4
  federationName: string
}

/** Las 134 naciones miembro de World Rugby. */
export const WORLD_RUGBY_NATIONS: NationData[] = [
  // ---------- RUGBY EUROPE (50 federaciones) ----------
  { code: 'ENG', name: 'Inglaterra', region: 'europe', union: 'Rugby Europe', tier: 1, federationName: 'RFU' },
  { code: 'FRA', name: 'Francia', region: 'europe', union: 'Rugby Europe', tier: 1, federationName: 'FFR' },
  { code: 'IRL', name: 'Irlanda', region: 'europe', union: 'Rugby Europe', tier: 1, federationName: 'IRFU' },
  { code: 'SCO', name: 'Escocia', region: 'europe', union: 'Rugby Europe', tier: 1, federationName: 'SRU' },
  { code: 'WAL', name: 'Gales', region: 'europe', union: 'Rugby Europe', tier: 1, federationName: 'WRU' },
  { code: 'ITA', name: 'Italia', region: 'europe', union: 'Rugby Europe', tier: 1, federationName: 'FIR' },
  { code: 'GEO', name: 'Georgia', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'GRU' },
  { code: 'ROU', name: 'Rumanía', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'FRR' },
  { code: 'POR', name: 'Portugal', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'FPR' },
  { code: 'ESP', name: 'España', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'FER' },
  { code: 'RUS', name: 'Rusia', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'FRR' },
  { code: 'GER', name: 'Alemania', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'DRV' },
  { code: 'NED', name: 'Países Bajos', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'Rugby Nederland' },
  { code: 'BEL', name: 'Bélgica', region: 'europe', union: 'Rugby Europe', tier: 2, federationName: 'BRF' },
  { code: 'SUI', name: 'Suiza', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'SRF' },
  { code: 'POL', name: 'Polonia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'PZR' },
  { code: 'CZE', name: 'Chequia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'CRU' },
  { code: 'CRO', name: 'Croacia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'HRS' },
  { code: 'UKR', name: 'Ucrania', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'NFRU' },
  { code: 'LTU', name: 'Lituania', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'LRF' },
  { code: 'LAT', name: 'Letonia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'LRF' },
  { code: 'SWE', name: 'Suecia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'SRF' },
  { code: 'DEN', name: 'Dinamarca', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'DRU' },
  { code: 'NOR', name: 'Noruega', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'NRF' },
  { code: 'FIN', name: 'Finlandia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'FRF' },
  { code: 'AUT', name: 'Austria', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'ÖRV' },
  { code: 'HUN', name: 'Hungría', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'MRSZ' },
  { code: 'GRE', name: 'Grecia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'HRF' },
  { code: 'BUL', name: 'Bulgaria', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'BFR' },
  { code: 'SRB', name: 'Serbia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'RSS' },
  { code: 'BIH', name: 'Bosnia y Herzegovina', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'RU BiH' },
  { code: 'MNE', name: 'Montenegro', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'CRS' },
  { code: 'MKD', name: 'Macedonia del Norte', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'RFM' },
  { code: 'SVK', name: 'Eslovaquia', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'SRU' },
  { code: 'SVN', name: 'Eslovenia', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'RZS' },
  { code: 'ISR', name: 'Israel', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'IRU' },
  { code: 'TUR', name: 'Turquía', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'TRF' },
  { code: 'AND', name: 'Andorra', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'FAR' },
  { code: 'LUX', name: 'Luxemburgo', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'FLRXIII' },
  { code: 'MLT', name: 'Malta', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'MRF' },
  { code: 'CYP', name: 'Chipre', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'CRF' },
  { code: 'EST', name: 'Estonia', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'ERU' },
  { code: 'MDA', name: 'Moldavia', region: 'europe', union: 'Rugby Europe', tier: 3, federationName: 'FRM' },
  { code: 'BLR', name: 'Bielorrusia', region: 'europe', union: 'Rugby Europe', tier: 4, federationName: 'BRU' },
  { code: 'KAZ', name: 'Kazajistán', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'KZRU' },

  // ---------- OCEANIA RUGBY (10) ----------
  { code: 'NZL', name: 'Nueva Zelanda', region: 'oceania', union: 'Oceania Rugby', tier: 1, federationName: 'NZR' },
  { code: 'AUS', name: 'Australia', region: 'oceania', union: 'Oceania Rugby', tier: 1, federationName: 'Rugby Australia' },
  { code: 'FIJ', name: 'Fiji', region: 'oceania', union: 'Oceania Rugby', tier: 2, federationName: 'FRU' },
  { code: 'SAM', name: 'Samoa', region: 'oceania', union: 'Oceania Rugby', tier: 2, federationName: 'SRU' },
  { code: 'TGA', name: 'Tonga', region: 'oceania', union: 'Oceania Rugby', tier: 2, federationName: 'TRU' },
  { code: 'PNG', name: 'Papúa Nueva Guinea', region: 'oceania', union: 'Oceania Rugby', tier: 3, federationName: 'PNGRFU' },
  { code: 'COK', name: 'Islas Cook', region: 'oceania', union: 'Oceania Rugby', tier: 3, federationName: 'CIRU' },
  { code: 'NIU', name: 'Niue', region: 'oceania', union: 'Oceania Rugby', tier: 4, federationName: 'NRU' },
  { code: 'SOL', name: 'Islas Salomón', region: 'oceania', union: 'Oceania Rugby', tier: 4, federationName: 'SIRFU' },
  { code: 'TAH', name: 'Tahití', region: 'oceania', union: 'Oceania Rugby', tier: 4, federationName: 'FTR' },
  { code: 'VAN', name: 'Vanuatu', region: 'oceania', union: 'Oceania Rugby', tier: 4, federationName: 'VRFU' },
  { code: 'NCL', name: 'Nueva Caledonia', region: 'oceania', union: 'Oceania Rugby', tier: 4, federationName: 'CTRNC' },

  // ---------- SUDAMÉRICA RUGBY (10) ----------
  { code: 'ARG', name: 'Argentina', region: 'south_america', union: 'Sudamérica Rugby', tier: 1, federationName: 'UAR' },
  { code: 'URU', name: 'Uruguay', region: 'south_america', union: 'Sudamérica Rugby', tier: 2, federationName: 'URU' },
  { code: 'CHI', name: 'Chile', region: 'south_america', union: 'Sudamérica Rugby', tier: 2, federationName: 'Chile Rugby' },
  { code: 'BRA', name: 'Brasil', region: 'south_america', union: 'Sudamérica Rugby', tier: 2, federationName: 'CBRu' },
  { code: 'PAR', name: 'Paraguay', region: 'south_america', union: 'Sudamérica Rugby', tier: 3, federationName: 'URP' },
  { code: 'COL', name: 'Colombia', region: 'south_america', union: 'Sudamérica Rugby', tier: 3, federationName: 'FCR' },
  { code: 'VEN', name: 'Venezuela', region: 'south_america', union: 'Sudamérica Rugby', tier: 3, federationName: 'FVR' },
  { code: 'PER', name: 'Perú', region: 'south_america', union: 'Sudamérica Rugby', tier: 3, federationName: 'URP' },
  { code: 'ECU', name: 'Ecuador', region: 'south_america', union: 'Sudamérica Rugby', tier: 4, federationName: 'FER' },
  { code: 'BOL', name: 'Bolivia', region: 'south_america', union: 'Sudamérica Rugby', tier: 4, federationName: 'URB' },
  { code: 'GUY', name: 'Guyana', region: 'south_america', union: 'Rugby Americas North', tier: 3, federationName: 'GRFU' },

  // ---------- RUGBY AMERICAS NORTH (20) ----------
  { code: 'USA', name: 'Estados Unidos', region: 'north_america', union: 'Rugby Americas North', tier: 2, federationName: 'USA Rugby' },
  { code: 'CAN', name: 'Canadá', region: 'north_america', union: 'Rugby Americas North', tier: 2, federationName: 'Rugby Canada' },
  { code: 'MEX', name: 'México', region: 'north_america', union: 'Rugby Americas North', tier: 3, federationName: 'FMRU' },
  { code: 'JAM', name: 'Jamaica', region: 'north_america', union: 'Rugby Americas North', tier: 3, federationName: 'JRFU' },
  { code: 'TTO', name: 'Trinidad y Tobago', region: 'north_america', union: 'Rugby Americas North', tier: 3, federationName: 'TTRU' },
  { code: 'BAR', name: 'Barbados', region: 'north_america', union: 'Rugby Americas North', tier: 3, federationName: 'BRU' },
  { code: 'BAH', name: 'Bahamas', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'BRU' },
  { code: 'BMU', name: 'Bermudas', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'BRFU' },
  { code: 'CAY', name: 'Islas Caimán', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'CIRU' },
  { code: 'CUB', name: 'Cuba', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'FCR' },
  { code: 'GRN', name: 'Granada', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'GRFU' },
  { code: 'HAI', name: 'Haití', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'FHR' },
  { code: 'CRC', name: 'Costa Rica', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'CCR' },
  { code: 'GUT', name: 'Guatemala', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'AGR' },
  { code: 'SLV', name: 'El Salvador', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'FSR' },
  { code: 'HON', name: 'Honduras', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'FHR' },
  { code: 'PAN', name: 'Panamá', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'FPR' },
  { code: 'DOM', name: 'República Dominicana', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'FDR' },
  { code: 'LCA', name: 'Santa Lucía', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'SLRFU' },
  { code: 'VCT', name: 'San Vicente y Granadinas', region: 'north_america', union: 'Rugby Americas North', tier: 4, federationName: 'SVGRFU' },

  // ---------- RUGBY AFRICA (39) ----------
  { code: 'ZAF', name: 'Sudáfrica', region: 'africa', union: 'Rugby Africa', tier: 1, federationName: 'SA Rugby' },
  { code: 'NAM', name: 'Namibia', region: 'africa', union: 'Rugby Africa', tier: 2, federationName: 'NRU' },
  { code: 'ZIM', name: 'Zimbabue', region: 'africa', union: 'Rugby Africa', tier: 2, federationName: 'ZRU' },
  { code: 'KEN', name: 'Kenia', region: 'africa', union: 'Rugby Africa', tier: 2, federationName: 'KRU' },
  { code: 'UGA', name: 'Uganda', region: 'africa', union: 'Rugby Africa', tier: 2, federationName: 'URU' },
  { code: 'TUN', name: 'Túnez', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'FTR' },
  { code: 'MAR', name: 'Marruecos', region: 'africa', union: 'Rugby Africa', tier: 2, federationName: 'FRMR' },
  { code: 'ALG', name: 'Argelia', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'FAR' },
  { code: 'EGY', name: 'Egipto', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'ERU' },
  { code: 'CIV', name: 'Costa de Marfil', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'FIR' },
  { code: 'SEN', name: 'Senegal', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'FSR' },
  { code: 'MLI', name: 'Malí', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FMR' },
  { code: 'BFA', name: 'Burkina Faso', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FBR' },
  { code: 'GHA', name: 'Ghana', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'GRFU' },
  { code: 'NGA', name: 'Nigeria', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'NRFF' },
  { code: 'CMR', name: 'Camerún', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'FCR' },
  { code: 'GAB', name: 'Gabón', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FGR' },
  { code: 'COG', name: 'Congo', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FECOR' },
  { code: 'COD', name: 'RD del Congo', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FERUGBY' },
  { code: 'BDI', name: 'Burundi', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FBR' },
  { code: 'RWA', name: 'Ruanda', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'RRF' },
  { code: 'TZA', name: 'Tanzania', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'TRU' },
  { code: 'ZAM', name: 'Zambia', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'ZRU' },
  { code: 'BWA', name: 'Botsuana', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'BRU' },
  { code: 'NAMA', name: 'Lesoto', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'LRU' },
  { code: 'SWZ', name: 'Esuatini', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'ERU' },
  { code: 'MDG', name: 'Madagascar', region: 'africa', union: 'Rugby Africa', tier: 3, federationName: 'FMR' },
  { code: 'MUS', name: 'Mauricio', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'MRU' },
  { code: 'SEY', name: 'Seychelles', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'SRU' },
  { code: 'ETH', name: 'Etiopía', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'ERU' },
  { code: 'LBA', name: 'Libia', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'LRA' },
  { code: 'MWI', name: 'Malaui', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'MRFU' },
  { code: 'SDN', name: 'Sudán', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'SRA' },
  { code: 'SSD', name: 'Sudán del Sur', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'SSRA' },
  { code: 'MOZ', name: 'Mozambique', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FMR' },
  { code: 'TOG', name: 'Togo', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FTR' },
  { code: 'BEN', name: 'Benín', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FBR' },
  { code: 'GNB', name: 'Guinea-Bissau', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FGBR' },
  { code: 'NIG', name: 'Níger', region: 'africa', union: 'Rugby Africa', tier: 4, federationName: 'FNR' },

  // ---------- ASIA RUGBY (31) ----------
  { code: 'JPN', name: 'Japón', region: 'asia', union: 'Asia Rugby', tier: 2, federationName: 'JRFU' },
  { code: 'KOR', name: 'Corea del Sur', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'KRU' },
  { code: 'HKG', name: 'Hong Kong, China', region: 'asia', union: 'Asia Rugby', tier: 2, federationName: 'HKCR' },
  { code: 'CHN', name: 'China', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'CRFA' },
  { code: 'TPE', name: 'Taipéi Chino', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'CTRU' },
  { code: 'PHI', name: 'Filipinas', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'PRFU' },
  { code: 'THA', name: 'Tailandia', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'TRU' },
  { code: 'MAS', name: 'Malasia', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'MRU' },
  { code: 'SGP', name: 'Singapur', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'SCR' },
  { code: 'IDN', name: 'Indonesia', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'PRUI' },
  { code: 'IND', name: 'India', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'IRFU' },
  { code: 'PAK', name: 'Pakistán', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'PRU' },
  { code: 'SRI', name: 'Sri Lanka', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'SLR' },
  { code: 'NPL', name: 'Nepal', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'NRA' },
  { code: 'IRI', name: 'Irán', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'IRFU' },
  { code: 'UAE', name: 'Emiratos Árabes Unidos', region: 'asia', union: 'Asia Rugby', tier: 3, federationName: 'UAERF' },
  { code: 'QAT', name: 'Catar', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'QRU' },
  { code: 'KSA', name: 'Arabia Saudita', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'SARF' },
  { code: 'LBN', name: 'Líbano', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'LRF' },
  { code: 'JOR', name: 'Jordania', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'JRF' },
  { code: 'UZB', name: 'Uzbekistán', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'URU' },
  { code: 'KGZ', name: 'Kirguistán', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'KRF' },
  { code: 'BAN', name: 'Bangladés', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'BRFF' },
  { code: 'BRN', name: 'Brunéi', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'BRU' },
  { code: 'CAM', name: 'Camboya', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'CRF' },
  { code: 'LAO', name: 'Laos', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'LRA' },
  { code: 'MGL', name: 'Mongolia', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'MRA' },
  { code: 'MYA', name: 'Myanmar', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'MRF' },
  { code: 'TKM', name: 'Turkmenistán', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'TRU' },
  { code: 'GUM', name: 'Guam', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'GRFU' },
  { code: 'IRQ', name: 'Irak', region: 'asia', union: 'Asia Rugby', tier: 4, federationName: 'IRU' }
]

/** Códigos para los que existen pools de nombres específicos. */
export const NATIONS_WITH_NAME_POOLS = new Set([
  'ESP', 'FRA', 'ENG', 'IRL', 'SCO', 'WAL', 'ITA', 'ZAF',
  'NZL', 'AUS', 'ARG', 'JPN', 'USA',
  'FIJ', 'SAM', 'TGA', 'GEO', 'ROU', 'URU', 'CHI'
])

export function getNationByCode(code: string): NationData | undefined {
  return WORLD_RUGBY_NATIONS.find((n) => n.code === code)
}
