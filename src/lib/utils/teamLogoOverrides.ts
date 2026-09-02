type TeamLogoSource = Record<string, unknown> | null | undefined;
const TEAM_LOGO_PROXY_PATH = '/api/assets/team-logo';

const EXTERNAL_TEAM_LOGO_OVERRIDES: Record<string, string> = {
    // Add external club overrides here.
    // Examples:
    // '12345': '/logos/clubs/my-club.png',
    // 'fs-team-12345': '/logos/clubs/my-club.png',
    // 'ras-team-12345': '/logos/clubs/my-club.png',
    // 'espn-team-12345': '/logos/clubs/my-club.png',
};

const OVERRIDE_LOOKUP = Object.fromEntries(
    Object.entries(EXTERNAL_TEAM_LOGO_OVERRIDES).map(([key, value]) => [key.trim().toLowerCase(), value]),
);

/**
 * LA BANDERA DE UNA SELECCION.
 *
 * Un seleccionado no tiene escudo de club: tiene bandera. El proveedor manda lo que
 * tenga a mano y no siempre es eso —Argentina llegaba unas veces con la bandera y
 * otras con dos letras sobre un circulo gris—, asi que la identidad de un pais la
 * pone la plataforma y no la fuente.
 *
 * Va por NOMBRE y no por id a proposito: el mismo pais vive bajo varios ids de
 * proveedor y aparecen ids nuevos solos (por eso existe `dedupeExternalTeams` en
 * /api/search/universal). Una tabla de ids nace desactualizada; una de nombres no.
 * Ademas asi alcanza a las selecciones que viven en `clubs` —las asiaticas estan
 * cargadas ahi— sin repetir el mapa.
 */
const NATIONAL_TEAM_FLAG_BASE = '/logos/selecciones';

const NATIONAL_TEAM_FLAGS: Record<string, string> = {
    argentina: 'argentina',
    australia: 'australia',
    belgium: 'belgium', belgica: 'belgium',
    brazil: 'brazil', brasil: 'brazil',
    canada: 'canada',
    chile: 'chile',
    china: 'china',
    croatia: 'croatia', croacia: 'croatia',
    czechia: 'czechia', 'czech republic': 'czechia', chequia: 'czechia', 'republica checa': 'czechia',
    denmark: 'denmark', dinamarca: 'denmark',
    england: 'england', inglaterra: 'england',
    fiji: 'fiji', fiyi: 'fiji',
    france: 'france', francia: 'france',
    georgia: 'georgia',
    germany: 'germany', alemania: 'germany',
    guam: 'guam',
    'hong kong': 'hong-kong', 'hong kong china': 'hong-kong',
    india: 'india',
    ireland: 'ireland', irlanda: 'ireland',
    italy: 'italy', italia: 'italy',
    japan: 'japan', japon: 'japan',
    laos: 'laos',
    lithuania: 'lithuania', lituania: 'lithuania',
    malaysia: 'malaysia', malasia: 'malaysia',
    netherlands: 'netherlands', 'paises bajos': 'netherlands', holanda: 'netherlands',
    'new zealand': 'new-zealand', 'nueva zelanda': 'new-zealand', 'nueva zelandia': 'new-zealand',
    peru: 'peru',
    philippines: 'philippines', filipinas: 'philippines',
    poland: 'poland', polonia: 'poland',
    portugal: 'portugal',
    romania: 'romania', rumania: 'romania',
    samoa: 'samoa',
    scotland: 'scotland', escocia: 'scotland',
    singapore: 'singapore', singapur: 'singapore',
    'south africa': 'south-africa', sudafrica: 'south-africa',
    'south korea': 'south-korea', korea: 'south-korea', 'corea del sur': 'south-korea',
    spain: 'spain', espana: 'spain',
    'sri lanka': 'sri-lanka',
    sweden: 'sweden', suecia: 'sweden',
    switzerland: 'switzerland', suiza: 'switzerland',
    taiwan: 'taiwan', 'chinese taipei': 'taiwan',
    thailand: 'thailand', tailandia: 'thailand',
    tonga: 'tonga',
    turkey: 'turkey', turquia: 'turkey',
    ukraine: 'ukraine', ucrania: 'ukraine',
    'united states': 'united-states', usa: 'united-states', 'estados unidos': 'united-states',
    uruguay: 'uruguay',
    vietnam: 'vietnam',
    wales: 'wales', gales: 'wales',
    zimbabwe: 'zimbabwe', zimbabue: 'zimbabwe',
};

function normalizeNationKey(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Solo el nombre PELADO del pais.
 *
 * "Argentina" lleva la bandera. "Argentina XV", "Argentina 7s", "Argentina M20" y
 * "Wales W" no: son equipos distintos —otra categoria, otra rama, otro plantel— y
 * cada uno se queda con la identidad que ya tiene. La bandera es del seleccionado
 * mayor y de nadie mas.
 *
 * Que la coincidencia sea exacta ademas resuelve solo el problema de los clubes que
 * arrancan igual: "New Zealand Warriors" es de la NRL y "Croatia Dakovo" es un club
 * croata, y ninguno de los dos entra por la puerta del pais.
 */
export function getNationalTeamFlag(rawName: unknown): string | null {
    if (typeof rawName !== 'string') return null;

    const slug = NATIONAL_TEAM_FLAGS[normalizeNationKey(rawName)];
    return slug ? `${NATIONAL_TEAM_FLAG_BASE}/${slug}.png` : null;
}

const ID_FIELDS = [
    'team_id',
    'teamId',
    'id',
    'external_id',
    'externalId',
    'participant_id',
    'participantId',
    'event_participant_id',
    'eventParticipantId',
] as const;
const LOGO_FIELDS = [
    'small_image_path',
    'smaill_image_path',
    'image_path',
    'image',
    'logo',
    'logo_url',
    'logo_path',
    'team_logo',
    'smallImagePath',
    'imagePath',
] as const;
const EXTERNAL_CONTEXT_FIELDS = ['team_url', 'teamUrl'] as const;
const EXTERNAL_PROVIDER_FIELDS = ['provider', 'source', 'dataSource', 'data_source'] as const;
const NAME_FIELDS = ['team_name', 'teamName', 'name', 'short_name', 'shortName'] as const;
const SPORT_FIELDS = ['sport', 'sport_id', 'sportId'] as const;
const LEAGUE_FIELDS = ['league', 'league_slug', 'leagueSlug'] as const;
const VERSION_FIELDS = [
    'logo_updated_at',
    'logoUpdatedAt',
    'override_updated_at',
    'overrideUpdatedAt',
    'updated_at',
    'updatedAt',
    'logo_version',
    'logoVersion',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function extractIdFromTeamUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    let pathname = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            pathname = new URL(trimmed).pathname;
        } catch {
            pathname = trimmed;
        }
    }

    const segments = pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length < 2) return null;
    if (segments[0].toLowerCase() !== 'team') return null;

    const candidate = segments[segments.length - 1];
    if (!candidate || !/^[a-z0-9]+$/i.test(candidate)) return null;

    return candidate;
}

function addCandidate(candidates: Set<string>, value: unknown) {
    if (value === null || value === undefined) return;

    const extractedFromUrl = extractIdFromTeamUrl(value);
    const raw = (extractedFromUrl || String(value)).trim();
    if (!raw) return;

    const normalized = raw.toLowerCase();
    candidates.add(normalized);

    if (normalized.startsWith('fs-team-')) {
        const stripped = normalized.slice(8);
        if (stripped) {
            candidates.add(stripped);
            candidates.add(`fs-${stripped}`);
        }
        return;
    }

    if (normalized.startsWith('fs-')) {
        const stripped = normalized.slice(3);
        if (stripped) {
            candidates.add(stripped);
            candidates.add(`fs-team-${stripped}`);
        }
        return;
    }

    if (normalized.startsWith('ras-team-')) {
        const stripped = normalized.slice(9);
        if (stripped) {
            candidates.add(stripped);
        }
        return;
    }

    if (normalized.startsWith('espn-team-')) {
        const stripped = normalized.slice(10);
        if (stripped) {
            candidates.add(stripped);
        }
        return;
    }

    if (/^[a-z0-9]+$/i.test(raw)) {
        candidates.add(`fs-team-${normalized}`);
        candidates.add(`fs-${normalized}`);
        candidates.add(`ras-team-${normalized}`);
        candidates.add(`espn-team-${normalized}`);
    }
}

function getFirstCandidateKey(...sources: TeamLogoSource[]): string | null {
    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of ID_FIELDS) {
            const value = source[field];
            if (value === null || value === undefined) continue;

            const raw = String(value).trim();
            if (raw) return raw;
        }

        for (const field of EXTERNAL_CONTEXT_FIELDS) {
            const extracted = extractIdFromTeamUrl(source[field]);
            if (extracted) return extracted;
        }

        for (const field of NAME_FIELDS) {
            const value = source[field];
            if (value === null || value === undefined) continue;

            const raw = String(value).trim();
            if (raw) return raw;
        }
    }

    return null;
}

function getFirstExternalTeamUrl(...sources: TeamLogoSource[]): string {
    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of EXTERNAL_CONTEXT_FIELDS) {
            const value = source[field];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
    }

    return '';
}

function getFirstExternalTeamName(...sources: TeamLogoSource[]): string {
    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of NAME_FIELDS) {
            const value = source[field];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
    }

    return '';
}

function normalizeVersionToken(value: unknown): string {
    if (value === null || value === undefined) return '';

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(Math.trunc(value));
    }

    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
        return String(parsed);
    }

    return trimmed;
}

function normalizeSportToken(value: unknown): string {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'soccer') return 'football';
    if (normalized === 'rugby-union' || normalized === 'rugby-sevens') return 'rugby';
    return normalized;
}

function inferSportFromIdValue(value: unknown): string {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.startsWith('espn-soccer-team-') || normalized.startsWith('espn-soccer-')) return 'football';
    if (normalized.startsWith('espn-racing-team-') || normalized.startsWith('espn-racing-')) return 'motorsport';
    if (normalized.startsWith('espn-team-') || normalized.startsWith('espn-league-')) return 'american-football';
    if (normalized.startsWith('ras-team-') || normalized.startsWith('ras-league-')) return 'rugby';
    return '';
}

function getFirstSport(...sources: TeamLogoSource[]): string {
    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of SPORT_FIELDS) {
            const normalized = normalizeSportToken(source[field]);
            if (normalized) return normalized;
        }

        for (const field of LEAGUE_FIELDS) {
            const value = source[field];
            if (typeof value !== 'string') continue;
            const trimmed = value.trim().toLowerCase();
            if (!trimmed) continue;
            const inferred = inferSportFromIdValue(`espn-soccer-${trimmed}`);
            if (inferred) return inferred;
        }

        for (const field of ID_FIELDS) {
            const inferred = inferSportFromIdValue(source[field]);
            if (inferred) return inferred;
        }
    }

    return '';
}

function getFirstLogoVersion(...sources: TeamLogoSource[]): string {
    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of VERSION_FIELDS) {
            const normalized = normalizeVersionToken(source[field]);
            if (normalized) return normalized;
        }
    }

    return '';
}

function getSourceLogo(source: TeamLogoSource): string {
    if (!isRecord(source)) return '';

    for (const field of LOGO_FIELDS) {
        const value = source[field];
        if (typeof value === 'string' && value.trim()) {
            const trimmed = value.trim();

            if (trimmed.startsWith('//')) {
                return `https:${trimmed}`;
            }

            if (trimmed.startsWith('/res/')) {
                return `https://static.flashscore.com${trimmed}`;
            }

            return trimmed;
        }
    }

    return '';
}

function hasExternalKeyPrefix(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return normalized.startsWith('fs-team-') || normalized.startsWith('fs-') || normalized.startsWith('ras-team-') || normalized.startsWith('espn-team-');
}

function hasExternalContext(...sources: TeamLogoSource[]): boolean {
    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of EXTERNAL_CONTEXT_FIELDS) {
            const value = source[field];
            if (typeof value === 'string' && value.trim()) {
                return true;
            }
        }

        for (const field of EXTERNAL_PROVIDER_FIELDS) {
            const value = source[field];
            if (typeof value !== 'string') continue;

            const normalized = value.trim().toLowerCase();
            if (!normalized) continue;

            if (
                normalized === 'api' ||
                normalized === 'external' ||
                normalized.includes('espn') ||
                normalized.includes('flashscore') ||
                normalized.includes('rugby-api-sports')
            ) {
                return true;
            }
        }

        for (const field of ID_FIELDS) {
            const value = source[field];
            if (value === null || value === undefined) continue;

            if (hasExternalKeyPrefix(String(value))) {
                return true;
            }
        }

        for (const field of LOGO_FIELDS) {
            const value = source[field];
            if (typeof value !== 'string') continue;

            const normalized = value.trim().toLowerCase();
            if (!normalized) continue;

            if (
                normalized.includes('flashscore') ||
                normalized.includes('espncdn') ||
                normalized.includes('api-sports') ||
                normalized.includes('rapidapi')
            ) {
                return true;
            }
        }
    }

    return false;
}

function buildProxyLogoUrl(key: string, fallbackLogo: string, teamUrl: string, teamName: string, version: string, sport: string): string {
    const params = new URLSearchParams();
    params.set('key', key);
    if (fallbackLogo) params.set('fallback', fallbackLogo);
    if (teamUrl) params.set('team_url', teamUrl);
    if (teamName) params.set('name', teamName);
    if (version) params.set('v', version);
    if (sport) params.set('sport', sport);
    return `${TEAM_LOGO_PROXY_PATH}?${params.toString()}`;
}

/**
 * URL del proxy para el escudo de un club de la base, pedido por su id.
 *
 * El feed de partidos NO lee `clubs.logo_url`: hay cientos de escudos en base64
 * (uno solo llega a 850 KB) y un sábado con 500 clubes hacía que la consulta
 * devolviera 47 MB y muriera en producción. El proxy resuelve el escudo por id
 * y lo sirve con cache; la versión (`v`) la agrega `resolveTeamLogo` desde
 * `updated_at`, así que acá no viaja.
 */
export function buildClubLogoProxyUrl(clubId: string, teamName: string): string {
    return buildProxyLogoUrl(clubId, '', '', teamName, '', '');
}

function extendProxyLogoUrl(
    proxyLogoUrl: string,
    key: string,
    fallbackLogo: string,
    teamUrl: string,
    teamName: string,
    version: string,
    sport: string,
): string {
    try {
        const parsed = new URL(proxyLogoUrl, 'http://localhost');
        if (key && !parsed.searchParams.get('key')) parsed.searchParams.set('key', key);
        if (fallbackLogo && fallbackLogo !== proxyLogoUrl && !parsed.searchParams.get('fallback')) {
            parsed.searchParams.set('fallback', fallbackLogo);
        }
        if (teamUrl && !parsed.searchParams.get('team_url')) parsed.searchParams.set('team_url', teamUrl);
        if (teamName && !parsed.searchParams.get('name')) parsed.searchParams.set('name', teamName);
        if (version && parsed.searchParams.get('v') !== version) parsed.searchParams.set('v', version);
        if (sport && !parsed.searchParams.get('sport')) parsed.searchParams.set('sport', sport);
        return `${TEAM_LOGO_PROXY_PATH}?${parsed.searchParams.toString()}`;
    } catch {
        return proxyLogoUrl;
    }
}

export function getExternalTeamLogoOverride(...sources: TeamLogoSource[]): string | null {
    const candidates = new Set<string>();

    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of ID_FIELDS) {
            addCandidate(candidates, source[field]);
        }

        for (const field of EXTERNAL_CONTEXT_FIELDS) {
            addCandidate(candidates, source[field]);
        }
    }

    for (const candidate of candidates) {
        const override = OVERRIDE_LOOKUP[candidate];
        if (override) return override;
    }

    // La bandera se busca DESPUES de los overrides por id: una excepcion escrita a mano
    // para un equipo puntual tiene que poder ganarle a la regla general del pais.
    return getNationalTeamFlag(getFirstExternalTeamName(...sources));
}

export function resolveTeamLogo(...sources: TeamLogoSource[]): string {
    const override = getExternalTeamLogoOverride(...sources);
    if (override) return override;

    const candidateKey = getFirstCandidateKey(...sources);
    const teamUrl = getFirstExternalTeamUrl(...sources);
    const teamName = getFirstExternalTeamName(...sources);
    const version = getFirstLogoVersion(...sources);
    const sport = getFirstSport(...sources);
    const fallbackLogo = sources.map(getSourceLogo).find(Boolean) || '';
    if (fallbackLogo.startsWith(`${TEAM_LOGO_PROXY_PATH}?`)) {
        return extendProxyLogoUrl(fallbackLogo, candidateKey || '', '', teamUrl, teamName, version, sport);
    }

    if (candidateKey && fallbackLogo.startsWith('data:')) {
        return buildProxyLogoUrl(candidateKey, '', teamUrl, teamName, version, sport);
    }

    if (candidateKey && (hasExternalContext(...sources) || hasExternalKeyPrefix(candidateKey))) {
        return buildProxyLogoUrl(candidateKey, fallbackLogo, teamUrl, teamName, version, sport);
    }

    for (const source of sources) {
        const logo = getSourceLogo(source);
        if (logo) return logo;
    }

    return '';
}

export function applyExternalTeamLogoOverride<T extends TeamLogoSource>(source: T, ...extraSources: TeamLogoSource[]): T {
    if (!isRecord(source)) return source;

    const resolvedLogo = resolveTeamLogo(source, ...extraSources);
    if (!resolvedLogo) return source;

    return {
        ...source,
        small_image_path: resolvedLogo,
        image_path: resolvedLogo,
        logo: resolvedLogo,
        logo_url: resolvedLogo,
        logo_path: resolvedLogo,
        team_logo: resolvedLogo,
    } as T;
}
