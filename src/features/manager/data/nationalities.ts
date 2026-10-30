export interface NationalityOption {
  code: string
  label: string
}

const SPECIAL_NATIONALITIES: NationalityOption[] = [
  { code: 'ENG', label: 'Inglaterra' },
  { code: 'NIR', label: 'Irlanda del Norte' },
  { code: 'SCO', label: 'Escocia' },
  { code: 'WAL', label: 'Gales' }
]

const REGION_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW'
] as const

const REGION_LABEL_OVERRIDES: Record<string, string> = {
  XK: 'Kosovo'
}

const LEGACY_ALPHA3_TO_REGION: Record<string, string> = {
  ARG: 'AR',
  AUS: 'AU',
  CHI: 'CL',
  ESP: 'ES',
  FIJ: 'FJ',
  FRA: 'FR',
  GEO: 'GE',
  IRL: 'IE',
  ITA: 'IT',
  JPN: 'JP',
  NZL: 'NZ',
  SAM: 'WS',
  TGA: 'TO',
  URU: 'UY',
  USA: 'US',
  ZAF: 'ZA'
}

const displayNames = new Intl.DisplayNames(['es'], { type: 'region' })
const collator = new Intl.Collator('es', { sensitivity: 'base' })

const regionOptions = REGION_CODES.map((code) => ({
  code,
  label: REGION_LABEL_OVERRIDES[code] ?? displayNames.of(code) ?? code
}))

export const NATIONALITY_OPTIONS: NationalityOption[] = [
  ...SPECIAL_NATIONALITIES,
  ...regionOptions
].sort((a, b) => collator.compare(a.label, b.label))

export function getNationalityName(code: string): string {
  const option = NATIONALITY_OPTIONS.find((n) => n.code === code)
  const legacyRegion = LEGACY_ALPHA3_TO_REGION[code]
  return option?.label ?? (legacyRegion ? displayNames.of(legacyRegion) : undefined) ?? code
}
