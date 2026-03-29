type TeamLogoSource = Record<string, unknown> | null | undefined;
const TEAM_LOGO_PROXY_PATH = '/api/assets/team-logo';

const EXTERNAL_TEAM_LOGO_OVERRIDES: Record<string, string> = {
    // Add external club overrides here.
    // Examples:
    // '12345': '/logos/clubs/my-club.png',
    // 'fs-team-12345': '/logos/clubs/my-club.png',
    // 'ras-team-12345': '/logos/clubs/my-club.png',
};

const OVERRIDE_LOOKUP = Object.fromEntries(
    Object.entries(EXTERNAL_TEAM_LOGO_OVERRIDES).map(([key, value]) => [key.trim().toLowerCase(), value]),
);

const ID_FIELDS = ['team_id', 'teamId', 'id', 'external_id', 'externalId'] as const;
const LOGO_FIELDS = [
    'small_image_path',
    'smaill_image_path',
    'image_path',
    'logo',
    'logo_url',
    'logo_path',
    'team_logo',
] as const;
const EXTERNAL_CONTEXT_FIELDS = ['team_url', 'teamUrl'] as const;
const EXTERNAL_PROVIDER_FIELDS = ['provider', 'source', 'dataSource', 'data_source'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function addCandidate(candidates: Set<string>, value: unknown) {
    if (value === null || value === undefined) return;

    const raw = String(value).trim();
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

    if (/^[a-z0-9]+$/i.test(raw)) {
        candidates.add(`fs-team-${normalized}`);
        candidates.add(`fs-${normalized}`);
        candidates.add(`ras-team-${normalized}`);
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
    }

    return null;
}

function getSourceLogo(source: TeamLogoSource): string {
    if (!isRecord(source)) return '';

    for (const field of LOGO_FIELDS) {
        const value = source[field];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }

    return '';
}

function hasExternalKeyPrefix(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return normalized.startsWith('fs-team-') || normalized.startsWith('fs-') || normalized.startsWith('ras-team-');
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
    }

    return false;
}

function buildProxyLogoUrl(key: string, fallbackLogo: string): string {
    const params = new URLSearchParams();
    params.set('key', key);
    if (fallbackLogo) params.set('fallback', fallbackLogo);
    return `${TEAM_LOGO_PROXY_PATH}?${params.toString()}`;
}

export function getExternalTeamLogoOverride(...sources: TeamLogoSource[]): string | null {
    const candidates = new Set<string>();

    for (const source of sources) {
        if (!isRecord(source)) continue;

        for (const field of ID_FIELDS) {
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

    const fallbackLogo = sources.map(getSourceLogo).find(Boolean) || '';
    if (fallbackLogo.startsWith(`${TEAM_LOGO_PROXY_PATH}?`)) return fallbackLogo;

    const candidateKey = getFirstCandidateKey(...sources);
    if (candidateKey && (hasExternalContext(...sources) || hasExternalKeyPrefix(candidateKey))) {
        return buildProxyLogoUrl(candidateKey, fallbackLogo);
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
