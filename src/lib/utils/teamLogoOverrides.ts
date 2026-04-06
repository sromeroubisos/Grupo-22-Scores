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

function buildProxyLogoUrl(key: string, fallbackLogo: string, teamUrl: string, teamName: string): string {
    const params = new URLSearchParams();
    params.set('key', key);
    if (fallbackLogo) params.set('fallback', fallbackLogo);
    if (teamUrl) params.set('team_url', teamUrl);
    if (teamName) params.set('name', teamName);
    return `${TEAM_LOGO_PROXY_PATH}?${params.toString()}`;
}

function extendProxyLogoUrl(
    proxyLogoUrl: string,
    key: string,
    fallbackLogo: string,
    teamUrl: string,
    teamName: string,
): string {
    try {
        const parsed = new URL(proxyLogoUrl, 'http://localhost');
        if (key && !parsed.searchParams.get('key')) parsed.searchParams.set('key', key);
        if (fallbackLogo && fallbackLogo !== proxyLogoUrl && !parsed.searchParams.get('fallback')) {
            parsed.searchParams.set('fallback', fallbackLogo);
        }
        if (teamUrl && !parsed.searchParams.get('team_url')) parsed.searchParams.set('team_url', teamUrl);
        if (teamName && !parsed.searchParams.get('name')) parsed.searchParams.set('name', teamName);
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

    return null;
}

export function resolveTeamLogo(...sources: TeamLogoSource[]): string {
    const override = getExternalTeamLogoOverride(...sources);
    if (override) return override;

    const candidateKey = getFirstCandidateKey(...sources);
    const teamUrl = getFirstExternalTeamUrl(...sources);
    const teamName = getFirstExternalTeamName(...sources);
    const fallbackLogo = sources.map(getSourceLogo).find(Boolean) || '';
    if (fallbackLogo.startsWith(`${TEAM_LOGO_PROXY_PATH}?`)) {
        return extendProxyLogoUrl(fallbackLogo, candidateKey || '', '', teamUrl, teamName);
    }

    if (candidateKey && (hasExternalContext(...sources) || hasExternalKeyPrefix(candidateKey))) {
        return buildProxyLogoUrl(candidateKey, fallbackLogo, teamUrl, teamName);
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
