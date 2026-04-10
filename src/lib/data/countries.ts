import type { Country } from '@/lib/types';
import regionIndex from 'language-subtag-registry/data/json/region.json';

const CURATED_COUNTRIES: Record<string, Country> = {
    // ===== INTERNATIONAL / REGIONS =====
    'international': {
        id: 'international',
        name: 'International',
        nameEs: 'Internacional',
        code: 'INT',
        flagEmoji: '🌍',
        region: 'international',
    },
    'africa': {
        id: 'africa',
        name: 'Africa',
        nameEs: 'África',
        code: 'AFR',
        flagEmoji: '🌍',
        region: 'africa',
    },
    'asia': {
        id: 'asia',
        name: 'Asia',
        nameEs: 'Asia',
        code: 'ASI',
        flagEmoji: '🌏',
        region: 'asia',
    },
    'europe': {
        id: 'europe',
        name: 'Europe',
        nameEs: 'Europa',
        code: 'EUR',
        flagEmoji: '🌍',
        region: 'europe',
    },
    'north-central-america': {
        id: 'north-central-america',
        name: 'North & Central America',
        nameEs: 'Norte y Centroamérica',
        code: 'NCA',
        flagEmoji: '🌎',
        region: 'north-america',
    },
    'south-america': {
        id: 'south-america',
        name: 'South America',
        nameEs: 'Sudamérica',
        code: 'SAM',
        flagEmoji: '🌎',
        region: 'south-america',
    },
    'oceania': {
        id: 'oceania',
        name: 'Oceania',
        nameEs: 'Oceanía',
        code: 'OCE',
        flagEmoji: '🌏',
        region: 'oceania',
    },

    // ===== COUNTRIES A-Z =====
    'albania': {
        id: 'albania',
        name: 'Albania',
        nameEs: 'Albania',
        code: 'AL',
        flagEmoji: '🇦🇱',
        region: 'europe',
    },
    'algeria': {
        id: 'algeria',
        name: 'Algeria',
        nameEs: 'Argelia',
        code: 'DZ',
        flagEmoji: '🇩🇿',
        region: 'africa',
    },
    'argentina': {
        id: 'argentina',
        name: 'Argentina',
        nameEs: 'Argentina',
        code: 'AR',
        flagEmoji: '🇦🇷',
        region: 'south-america',
    },
    'australia': {
        id: 'australia',
        name: 'Australia',
        nameEs: 'Australia',
        code: 'AU',
        flagEmoji: '🇦🇺',
        region: 'oceania',
    },
    'austria': {
        id: 'austria',
        name: 'Austria',
        nameEs: 'Austria',
        code: 'AT',
        flagEmoji: '🇦🇹',
        region: 'europe',
    },
    'belgium': {
        id: 'belgium',
        name: 'Belgium',
        nameEs: 'Bélgica',
        code: 'BE',
        flagEmoji: '🇧🇪',
        region: 'europe',
    },
    'brazil': {
        id: 'brazil',
        name: 'Brazil',
        nameEs: 'Brasil',
        code: 'BR',
        flagEmoji: '🇧🇷',
        region: 'south-america',
    },
    'canada': {
        id: 'canada',
        name: 'Canada',
        nameEs: 'Canadá',
        code: 'CA',
        flagEmoji: '🇨🇦',
        region: 'north-america',
    },
    'chile': {
        id: 'chile',
        name: 'Chile',
        nameEs: 'Chile',
        code: 'CL',
        flagEmoji: '🇨🇱',
        region: 'south-america',
    },
    'china': {
        id: 'china',
        name: 'China',
        nameEs: 'China',
        code: 'CN',
        flagEmoji: '🇨🇳',
        region: 'asia',
    },
    'colombia': {
        id: 'colombia',
        name: 'Colombia',
        nameEs: 'Colombia',
        code: 'CO',
        flagEmoji: '🇨🇴',
        region: 'south-america',
    },
    'croatia': {
        id: 'croatia',
        name: 'Croatia',
        nameEs: 'Croacia',
        code: 'HR',
        flagEmoji: '🇭🇷',
        region: 'europe',
    },
    'czech-republic': {
        id: 'czech-republic',
        name: 'Czech Republic',
        nameEs: 'República Checa',
        code: 'CZ',
        flagEmoji: '🇨🇿',
        region: 'europe',
    },
    'england': {
        id: 'england',
        name: 'England',
        nameEs: 'Inglaterra',
        code: 'EN',
        flagEmoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        region: 'europe',
    },
    'finland': {
        id: 'finland',
        name: 'Finland',
        nameEs: 'Finlandia',
        code: 'FI',
        flagEmoji: '🇫🇮',
        region: 'europe',
    },
    'france': {
        id: 'france',
        name: 'France',
        nameEs: 'Francia',
        code: 'FR',
        flagEmoji: '🇫🇷',
        region: 'europe',
    },
    'georgia': {
        id: 'georgia',
        name: 'Georgia',
        nameEs: 'Georgia',
        code: 'GE',
        flagEmoji: '🇬🇪',
        region: 'europe',
    },
    'germany': {
        id: 'germany',
        name: 'Germany',
        nameEs: 'Alemania',
        code: 'DE',
        flagEmoji: '🇩🇪',
        region: 'europe',
    },
    'greece': {
        id: 'greece',
        name: 'Greece',
        nameEs: 'Grecia',
        code: 'GR',
        flagEmoji: '🇬🇷',
        region: 'europe',
    },
    'india': {
        id: 'india',
        name: 'India',
        nameEs: 'India',
        code: 'IN',
        flagEmoji: '🇮🇳',
        region: 'asia',
    },
    'ireland': {
        id: 'ireland',
        name: 'Ireland',
        nameEs: 'Irlanda',
        code: 'IE',
        flagEmoji: '🇮🇪',
        region: 'europe',
    },
    'israel': {
        id: 'israel',
        name: 'Israel',
        nameEs: 'Israel',
        code: 'IL',
        flagEmoji: '🇮🇱',
        region: 'asia',
    },
    'italy': {
        id: 'italy',
        name: 'Italy',
        nameEs: 'Italia',
        code: 'IT',
        flagEmoji: '🇮🇹',
        region: 'europe',
    },
    'japan': {
        id: 'japan',
        name: 'Japan',
        nameEs: 'Japón',
        code: 'JP',
        flagEmoji: '🇯🇵',
        region: 'asia',
    },
    'lithuania': {
        id: 'lithuania',
        name: 'Lithuania',
        nameEs: 'Lituania',
        code: 'LT',
        flagEmoji: '🇱🇹',
        region: 'europe',
    },
    'mexico': {
        id: 'mexico',
        name: 'Mexico',
        nameEs: 'México',
        code: 'MX',
        flagEmoji: '🇲🇽',
        region: 'north-america',
    },
    'netherlands': {
        id: 'netherlands',
        name: 'Netherlands',
        nameEs: 'Países Bajos',
        code: 'NL',
        flagEmoji: '🇳🇱',
        region: 'europe',
    },
    'new-zealand': {
        id: 'new-zealand',
        name: 'New Zealand',
        nameEs: 'Nueva Zelanda',
        code: 'NZ',
        flagEmoji: '🇳🇿',
        region: 'oceania',
    },
    'philippines': {
        id: 'philippines',
        name: 'Philippines',
        nameEs: 'Filipinas',
        code: 'PH',
        flagEmoji: '🇵🇭',
        region: 'asia',
    },
    'poland': {
        id: 'poland',
        name: 'Poland',
        nameEs: 'Polonia',
        code: 'PL',
        flagEmoji: '🇵🇱',
        region: 'europe',
    },
    'portugal': {
        id: 'portugal',
        name: 'Portugal',
        nameEs: 'Portugal',
        code: 'PT',
        flagEmoji: '🇵🇹',
        region: 'europe',
    },
    'puerto-rico': {
        id: 'puerto-rico',
        name: 'Puerto Rico',
        nameEs: 'Puerto Rico',
        code: 'PR',
        flagEmoji: '🇵🇷',
        region: 'north-america',
    },
    'romania': {
        id: 'romania',
        name: 'Romania',
        nameEs: 'Rumania',
        code: 'RO',
        flagEmoji: '🇷🇴',
        region: 'europe',
    },
    'russia': {
        id: 'russia',
        name: 'Russia',
        nameEs: 'Rusia',
        code: 'RU',
        flagEmoji: '🇷🇺',
        region: 'europe',
    },
    'scotland': {
        id: 'scotland',
        name: 'Scotland',
        nameEs: 'Escocia',
        code: 'SCO',
        flagEmoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        region: 'europe',
    },
    'serbia': {
        id: 'serbia',
        name: 'Serbia',
        nameEs: 'Serbia',
        code: 'RS',
        flagEmoji: '🇷🇸',
        region: 'europe',
    },
    'slovenia': {
        id: 'slovenia',
        name: 'Slovenia',
        nameEs: 'Eslovenia',
        code: 'SI',
        flagEmoji: '🇸🇮',
        region: 'europe',
    },
    'south-africa': {
        id: 'south-africa',
        name: 'South Africa',
        nameEs: 'Sudáfrica',
        code: 'ZA',
        flagEmoji: '🇿🇦',
        region: 'africa',
    },
    'spain': {
        id: 'spain',
        name: 'Spain',
        nameEs: 'España',
        code: 'ES',
        flagEmoji: '🇪🇸',
        region: 'europe',
    },
    'switzerland': {
        id: 'switzerland',
        name: 'Switzerland',
        nameEs: 'Suiza',
        code: 'CH',
        flagEmoji: '🇨🇭',
        region: 'europe',
    },
    'turkey': {
        id: 'turkey',
        name: 'Turkey',
        nameEs: 'Turquía',
        code: 'TR',
        flagEmoji: '🇹🇷',
        region: 'europe',
    },
    'uruguay': {
        id: 'uruguay',
        name: 'Uruguay',
        nameEs: 'Uruguay',
        code: 'UY',
        flagEmoji: '🇺🇾',
        region: 'south-america',
    },
    'usa': {
        id: 'usa',
        name: 'USA',
        nameEs: 'Estados Unidos',
        code: 'US',
        flagEmoji: '🇺🇸',
        region: 'north-america',
    },
    'venezuela': {
        id: 'venezuela',
        name: 'Venezuela',
        nameEs: 'Venezuela',
        code: 'VE',
        flagEmoji: '🇻🇪',
        region: 'south-america',
    },
    'wales': {
        id: 'wales',
        name: 'Wales',
        nameEs: 'Gales',
        code: 'WAL',
        flagEmoji: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
        region: 'europe',
    },
    'denmark': {
        id: 'denmark',
        name: 'Denmark',
        nameEs: 'Dinamarca',
        code: 'DK',
        flagEmoji: '🇩🇰',
        region: 'europe',
    },
    'hungary': {
        id: 'hungary',
        name: 'Hungary',
        nameEs: 'Hungría',
        code: 'HU',
        flagEmoji: '🇭🇺',
        region: 'europe',
    },
    'norway': {
        id: 'norway',
        name: 'Norway',
        nameEs: 'Noruega',
        code: 'NO',
        flagEmoji: '🇳🇴',
        region: 'europe',
    },
    'sweden': {
        id: 'sweden',
        name: 'Sweden',
        nameEs: 'Suecia',
        code: 'SE',
        flagEmoji: '🇸🇪',
        region: 'europe',
    },
    'bulgaria': {
        id: 'bulgaria',
        name: 'Bulgaria',
        nameEs: 'Bulgaria',
        code: 'BG',
        flagEmoji: '🇧🇬',
        region: 'europe',
    },
    'south-korea': {
        id: 'south-korea',
        name: 'South Korea',
        nameEs: 'Corea del Sur',
        code: 'KR',
        flagEmoji: '🇰🇷',
        region: 'asia',
    },

    // ===== TENNIS CATEGORIES (Virtual Countries) =====
    'grand-slams': {
        id: 'grand-slams',
        name: 'Grand Slams',
        nameEs: 'Grand Slams',
        code: 'GS',
        flagEmoji: '🏆',
        region: 'international',
    },
    'atp-singles': {
        id: 'atp-singles',
        name: 'ATP Singles',
        nameEs: 'ATP Singles',
        code: 'ATP',
        flagEmoji: '🎾',
        region: 'international',
    },
    'wta-singles': {
        id: 'wta-singles',
        name: 'WTA Singles',
        nameEs: 'WTA Singles',
        code: 'WTA',
        flagEmoji: '🎾',
        region: 'international',
    },
    'atp-doubles': {
        id: 'atp-doubles',
        name: 'ATP Doubles',
        nameEs: 'ATP Dobles',
        code: 'ATD',
        flagEmoji: '🎾',
        region: 'international',
    },
    'wta-doubles': {
        id: 'wta-doubles',
        name: 'WTA Doubles',
        nameEs: 'WTA Dobles',
        code: 'WTD',
        flagEmoji: '🎾',
        region: 'international',
    },
    'mixed-doubles': {
        id: 'mixed-doubles',
        name: 'Mixed Doubles',
        nameEs: 'Dobles Mixtos',
        code: 'MXD',
        flagEmoji: '🎾',
        region: 'international',
    },
    'exhibition-men': {
        id: 'exhibition-men',
        name: 'Exhibition - Men',
        nameEs: 'Exhibición - Hombres',
        code: 'EXM',
        flagEmoji: '🎾',
        region: 'international',
    },
    'exhibition-women': {
        id: 'exhibition-women',
        name: 'Exhibition - Women',
        nameEs: 'Exhibición - Mujeres',
        code: 'EXW',
        flagEmoji: '🎾',
        region: 'international',
    },
    'atp-challenger': {
        id: 'atp-challenger',
        name: 'ATP Challenger',
        nameEs: 'ATP Challenger',
        code: 'CHA',
        flagEmoji: '🎾',
        region: 'international',
    },
    'wta-125': {
        id: 'wta-125',
        name: 'WTA 125',
        nameEs: 'WTA 125',
        code: '125',
        flagEmoji: '🎾',
        region: 'international',
    },
};

const AUTO_COUNTRY_CODE_EXCLUSIONS = new Set([
    'AA',
    'AC',
    'AN',
    'BU',
    'CP',
    'CQ',
    'CS',
    'DD',
    'DG',
    'EA',
    'EU',
    'FX',
    'IC',
    'NT',
    'SU',
    'TA',
    'TP',
    'UK',
    'UN',
    'YD',
    'YU',
    'ZR',
    'ZZ',
]);

const AUTO_COUNTRY_CODE_OVERRIDES: Record<string, Partial<Omit<Country, 'code'>>> = {
    AQ: { id: 'antarctica', name: 'Antarctica', nameEs: 'Antartida' },
    BN: { id: 'brunei', name: 'Brunei', nameEs: 'Brunei' },
    CD: {
        id: 'democratic-republic-of-the-congo',
        name: 'Democratic Republic of the Congo',
        nameEs: 'Republica Democratica del Congo',
    },
    CG: {
        id: 'republic-of-the-congo',
        name: 'Republic of the Congo',
        nameEs: 'Republica del Congo',
    },
    CI: { id: 'ivory-coast', name: 'Ivory Coast', nameEs: 'Costa de Marfil' },
    CV: { id: 'cape-verde', name: 'Cape Verde', nameEs: 'Cabo Verde' },
    FM: { id: 'micronesia', name: 'Federated States of Micronesia', nameEs: 'Micronesia' },
    GB: { id: 'united-kingdom', name: 'United Kingdom', nameEs: 'Reino Unido' },
    HK: { id: 'hong-kong', name: 'Hong Kong', nameEs: 'Hong Kong' },
    KN: { id: 'saint-kitts-and-nevis', name: 'Saint Kitts and Nevis', nameEs: 'San Cristobal y Nieves' },
    KP: { id: 'north-korea', name: 'North Korea', nameEs: 'Corea del Norte' },
    LA: { id: 'laos', name: 'Laos', nameEs: 'Laos' },
    LC: { id: 'saint-lucia', name: 'Saint Lucia', nameEs: 'Santa Lucia' },
    MD: { id: 'moldova', name: 'Moldova', nameEs: 'Moldavia' },
    MK: { id: 'north-macedonia', name: 'North Macedonia', nameEs: 'Macedonia del Norte' },
    MM: { id: 'myanmar', name: 'Myanmar', nameEs: 'Myanmar' },
    MO: { id: 'macao', name: 'Macao', nameEs: 'Macao' },
    PS: { id: 'palestine', name: 'Palestine', nameEs: 'Palestina' },
    SX: { id: 'sint-maarten', name: 'Sint Maarten', nameEs: 'Sint Maarten' },
    SZ: { id: 'eswatini', name: 'Eswatini', nameEs: 'Esuatini' },
    TL: { id: 'timor-leste', name: 'Timor-Leste', nameEs: 'Timor Oriental' },
    TW: { id: 'taiwan', name: 'Taiwan', nameEs: 'Taiwan' },
    US: { id: 'usa', name: 'United States', nameEs: 'Estados Unidos' },
    VA: { id: 'vatican-city', name: 'Vatican City', nameEs: 'Ciudad del Vaticano' },
    VC: {
        id: 'saint-vincent-and-the-grenadines',
        name: 'Saint Vincent and the Grenadines',
        nameEs: 'San Vicente y las Granadinas',
    },
    VG: { id: 'british-virgin-islands', name: 'British Virgin Islands', nameEs: 'Islas Virgenes Britanicas' },
    VI: { id: 'us-virgin-islands', name: 'U.S. Virgin Islands', nameEs: 'Islas Virgenes de los Estados Unidos' },
    XK: { id: 'kosovo', name: 'Kosovo', nameEs: 'Kosovo' },
};

const MANUAL_EXTRA_COUNTRIES: Record<string, Country> = {
    'abkhazia': {
        id: 'abkhazia',
        name: 'Abkhazia',
        nameEs: 'Abjasia',
        code: 'XA',
        region: 'europe',
    },
    'kosovo': {
        id: 'kosovo',
        name: 'Kosovo',
        nameEs: 'Kosovo',
        code: 'XK',
        region: 'europe',
    },
    'northern-cyprus': {
        id: 'northern-cyprus',
        name: 'Northern Cyprus',
        nameEs: 'Chipre del Norte',
        code: 'XC',
        region: 'europe',
    },
    'northern-ireland': {
        id: 'northern-ireland',
        name: 'Northern Ireland',
        nameEs: 'Irlanda del Norte',
        code: 'XI',
        flagEmoji: '🏴',
        region: 'europe',
    },
    'somaliland': {
        id: 'somaliland',
        name: 'Somaliland',
        nameEs: 'Somalilandia',
        code: 'XS',
        region: 'africa',
    },
    'south-ossetia': {
        id: 'south-ossetia',
        name: 'South Ossetia',
        nameEs: 'Osetia del Sur',
        code: 'XO',
        region: 'europe',
    },
    'transnistria': {
        id: 'transnistria',
        name: 'Transnistria',
        nameEs: 'Transnistria',
        code: 'XT',
        region: 'europe',
    },
};

const ENGLISH_DISPLAY_NAMES =
    typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['en'], { type: 'region' })
        : null;

const SPANISH_DISPLAY_NAMES =
    typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['es'], { type: 'region' })
        : null;

const CURATED_COUNTRY_CODES = new Set(
    [...Object.values(CURATED_COUNTRIES), ...Object.values(MANUAL_EXTRA_COUNTRIES)]
        .map((country) => country.code.toUpperCase()),
);

function slugifyCountryLabel(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function buildFlagEmoji(code: string): string | undefined {
    if (!/^[A-Z]{2}$/.test(code)) return undefined;
    return String.fromCodePoint(...code.split('').map((char) => 127397 + char.charCodeAt(0)));
}

function buildGeneratedCountryEntry(code: string): [string, Country] | null {
    const override = AUTO_COUNTRY_CODE_OVERRIDES[code] ?? {};
    const name = override.name || ENGLISH_DISPLAY_NAMES?.of(code);
    const nameEs = override.nameEs || SPANISH_DISPLAY_NAMES?.of(code) || name;

    if (!name || !nameEs) return null;

    const country: Country = {
        id: override.id || slugifyCountryLabel(name),
        name,
        nameEs,
        code,
        flagEmoji: override.flagEmoji || buildFlagEmoji(code),
        region: override.region,
    };

    return [country.id, country];
}

const AUTO_GENERATED_COUNTRIES: Record<string, Country> = Object.fromEntries(
    Object.keys(regionIndex)
        .map((code) => code.toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code))
        .filter((code) => !AUTO_COUNTRY_CODE_EXCLUSIONS.has(code))
        .filter((code) => !CURATED_COUNTRY_CODES.has(code))
        .map((code) => buildGeneratedCountryEntry(code))
        .filter((entry): entry is [string, Country] => entry !== null),
);

export const COUNTRIES: Record<string, Country> = {
    ...AUTO_GENERATED_COUNTRIES,
    ...CURATED_COUNTRIES,
    ...MANUAL_EXTRA_COUNTRIES,
};

const normalizeCountryLookupValue = (value: string | null | undefined): string => {
    return String(value || '').trim().toLowerCase();
};

export const getCountryById = (id: string): Country | undefined => {
    return COUNTRIES[id];
};

export const findCountryRecord = (
    countryId?: string | null,
    fallbackName?: string | null,
): Country | undefined => {
    const normalizedId = normalizeCountryLookupValue(countryId);
    if (normalizedId) {
        const direct = getCountryById(normalizedId);
        if (direct) {
            return direct;
        }
    }

    const normalizedName = normalizeCountryLookupValue(fallbackName);
    if (!normalizedName) {
        return undefined;
    }

    return Object.values(COUNTRIES).find((country) => (
        normalizeCountryLookupValue(country.id) === normalizedName ||
        normalizeCountryLookupValue(country.name) === normalizedName ||
        normalizeCountryLookupValue(country.nameEs) === normalizedName ||
        normalizeCountryLookupValue(country.code) === normalizedName
    ));
};

export const resolveCountryId = (
    countryId?: string | null,
    fallbackName?: string | null,
    fallbackId = 'international',
): string => {
    const normalizedId = normalizeCountryLookupValue(countryId);
    return findCountryRecord(countryId, fallbackName)?.id || normalizedId || fallbackId;
};

export const getCountriesByRegion = (region: Country['region']): Country[] => {
    return Object.values(COUNTRIES).filter(country => country.region === region);
};

export const getAllCountries = (): Country[] => {
    return Object.values(COUNTRIES).sort((a, b) => (a.nameEs || a.name).localeCompare(b.nameEs || b.name, 'es'));
};

export type TournamentCountryOption = {
    id: string;
    label: string;
    code?: string | null;
    flagEmoji?: string | null;
    dbBacked?: boolean;
};

type TournamentCountrySource = {
    id: string;
    name?: string | null;
    nameEs?: string | null;
    code?: string | null;
    flagEmoji?: string | null;
    flag_emoji?: string | null;
};

const NON_TOURNAMENT_COUNTRY_IDS = new Set(
    Object.values(COUNTRIES)
        .filter((country) => country.id !== 'international' && country.code.trim().length !== 2)
        .map((country) => country.id),
);

function normalizeCountryKey(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeTournamentCountryValue(value: string): string {
    return slugifyCountryLabel(value);
}

export const isTournamentCountrySelectable = (id?: string | null): boolean => {
    if (!id?.trim()) return false;

    const normalizedId = normalizeCountryKey(id);
    if (normalizedId === 'international') return true;

    const staticCountry = COUNTRIES[normalizedId];
    if (!staticCountry) return true;

    return !NON_TOURNAMENT_COUNTRY_IDS.has(staticCountry.id);
};

export const getTournamentCountryOptions = (
    extraCountries: TournamentCountrySource[] = [],
): TournamentCountryOption[] => {
    const options = new Map<string, TournamentCountryOption>();
    const databaseCountryIds = new Set(
        extraCountries
            .map((country) => country.id?.trim())
            .filter((id): id is string => Boolean(id))
            .map((id) => normalizeCountryKey(id)),
    );

    const upsertOption = (source: TournamentCountrySource, preferSourceId = false) => {
        if (!source.id?.trim()) return;
        if (!isTournamentCountrySelectable(source.id)) return;

        const normalizedId = normalizeCountryKey(source.id);
        const staticCountry = COUNTRIES[normalizedId];
        const label =
            source.nameEs?.trim() ||
            staticCountry?.nameEs ||
            source.name?.trim() ||
            staticCountry?.name ||
            source.id.trim();

        if (!label) return;

        const existing = options.get(normalizedId);
        const nextOption: TournamentCountryOption = {
            id: source.id.trim(),
            label,
            code: source.code ?? staticCountry?.code ?? null,
            flagEmoji: source.flagEmoji ?? source.flag_emoji ?? staticCountry?.flagEmoji ?? null,
            dbBacked: databaseCountryIds.has(normalizedId),
        };

        if (!existing || preferSourceId) {
            options.set(normalizedId, nextOption);
        }
    };

    Object.values(COUNTRIES).forEach((country) => upsertOption(country));
    extraCountries.forEach((country) => upsertOption(country, true));
    upsertOption({ id: 'international', nameEs: 'Internacional' }, databaseCountryIds.has('international'));

    const internationalOption = options.get('international') ?? {
        id: 'international',
        label: 'Internacional',
        dbBacked: databaseCountryIds.has('international'),
    };

    options.delete('international');

    return [
        ...Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, 'es')),
        internationalOption,
    ];
};

export const resolveTournamentCountryOption = (
    value: string | null | undefined,
    extraCountries: TournamentCountrySource[] = [],
): TournamentCountryOption | null => {
    if (!value?.trim()) return null;

    const normalizedValue = normalizeTournamentCountryValue(value);
    if (!normalizedValue) return null;

    const options = getTournamentCountryOptions(extraCountries);

    return options.find((option) => {
        const normalizedId = normalizeTournamentCountryValue(option.id);
        const normalizedLabel = normalizeTournamentCountryValue(option.label);
        const normalizedCode = option.code ? normalizeTournamentCountryValue(option.code) : '';

        return normalizedValue === normalizedId
            || normalizedValue === normalizedLabel
            || (normalizedCode.length > 0 && normalizedValue === normalizedCode);
    }) || null;
};

export const resolveTournamentCountryId = (
    value: string | null | undefined,
    extraCountries: TournamentCountrySource[] = [],
): string | null => {
    return resolveTournamentCountryOption(value, extraCountries)?.id || null;
};

export const resolveTournamentCountryLabel = (
    value: string | null | undefined,
    extraCountries: TournamentCountrySource[] = [],
): string | null => {
    return resolveTournamentCountryOption(value, extraCountries)?.label || null;
};
