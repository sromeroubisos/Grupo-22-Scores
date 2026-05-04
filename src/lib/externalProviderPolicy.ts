import type {
    EspnAmericanFootballConfig,
    EspnMotorsportConfig,
    FlashScoreConfig,
    RugbyApiSportsConfig,
} from '@/lib/types/flashscore-integration';

const RUGBY_SPORT_KEYS = new Set([
    'rugby',
    'rugby-union',
    'rugby-league',
    '8',
    '19',
    '/rugby-union/',
    '/rugby-league/',
]);

const AMERICAN_FOOTBALL_SPORT_KEYS = new Set([
    'american-football',
    '5',
    '/american-football/',
]);

const MOTORSPORT_SPORT_KEYS = new Set([
    'motorsport',
    '31',
    '/motorsport/',
    '/automovilismo/',
    '/racing/',
]);

export const FLASHSCORE_PROVIDER = 'flashscore';
export const ESPN_PROVIDER = 'espn';

export function normalizeSportKey(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    return normalized || null;
}

export function isRugbySport(value: unknown): boolean {
    const normalized = normalizeSportKey(value);
    if (!normalized) return false;
    return RUGBY_SPORT_KEYS.has(normalized);
}

export function isAmericanFootballSport(value: unknown): boolean {
    const normalized = normalizeSportKey(value);
    if (!normalized) return false;
    return AMERICAN_FOOTBALL_SPORT_KEYS.has(normalized);
}

export function isMotorsportSport(value: unknown): boolean {
    const normalized = normalizeSportKey(value);
    if (!normalized) return false;
    return MOTORSPORT_SPORT_KEYS.has(normalized);
}

export function isFlashScoreEnabledForSport(value?: unknown): boolean {
    void value;
    return true;
}

export function getPreferredExternalProviderForSport(value: unknown) {
    if (isAmericanFootballSport(value)) return ESPN_PROVIDER;
    if (isMotorsportSport(value)) return ESPN_PROVIDER;
    return FLASHSCORE_PROVIDER;
}

export function getRulesetFlashScoreConfig(ruleset: unknown): FlashScoreConfig | null {
    if (!ruleset || typeof ruleset !== 'object') return null;

    const rawRuleset = ruleset as Record<string, unknown>;
    const external = rawRuleset.external && typeof rawRuleset.external === 'object'
        ? rawRuleset.external as Record<string, unknown>
        : null;

    const rawConfig = external?.flashscore ?? rawRuleset.flashscore ?? null;

    if (!rawConfig || typeof rawConfig !== 'object') return null;
    return rawConfig as FlashScoreConfig;
}

export function getTournamentFlashScoreConfig(
    tournament: { sport_id?: unknown; sport?: unknown; ruleset?: unknown } | null | undefined
): FlashScoreConfig | null {
    if (!tournament) return null;

    const sportKey = tournament.sport_id ?? tournament.sport ?? null;
    if (!isFlashScoreEnabledForSport(sportKey)) return null;

    return getRulesetFlashScoreConfig(tournament.ruleset);
}

export function getRulesetRugbyApiSportsConfig(ruleset?: unknown): RugbyApiSportsConfig | null {
    void ruleset;
    return null;
}

export function getTournamentRugbyApiSportsConfig(
    tournament: { sport_id?: unknown; sport?: unknown; ruleset?: unknown } | null | undefined
): RugbyApiSportsConfig | null {
    if (!tournament) return null;

    const sportKey = tournament.sport_id ?? tournament.sport ?? null;
    if (!isRugbySport(sportKey)) return null;

    return getRulesetRugbyApiSportsConfig(tournament.ruleset);
}

export function getRulesetEspnAmericanFootballConfig(ruleset: unknown): EspnAmericanFootballConfig | null {
    if (!ruleset || typeof ruleset !== 'object') return null;

    const rawRuleset = ruleset as Record<string, unknown>;
    const external = rawRuleset.external && typeof rawRuleset.external === 'object'
        ? rawRuleset.external as Record<string, unknown>
        : null;

    const rawConfig =
        external?.espn ??
        external?.espnAmericanFootball ??
        rawRuleset.espn ??
        rawRuleset.espnAmericanFootball ??
        null;

    if (!rawConfig || typeof rawConfig !== 'object') return null;
    return rawConfig as EspnAmericanFootballConfig;
}

export function getTournamentEspnAmericanFootballConfig(
    tournament: { sport_id?: unknown; sport?: unknown; ruleset?: unknown } | null | undefined
): EspnAmericanFootballConfig | null {
    if (!tournament) return null;

    const sportKey = tournament.sport_id ?? tournament.sport ?? null;
    if (!isAmericanFootballSport(sportKey)) return null;

    return getRulesetEspnAmericanFootballConfig(tournament.ruleset);
}

export function getRulesetEspnMotorsportConfig(ruleset: unknown): EspnMotorsportConfig | null {
    if (!ruleset || typeof ruleset !== 'object') return null;

    const rawRuleset = ruleset as Record<string, unknown>;
    const external = rawRuleset.external && typeof rawRuleset.external === 'object'
        ? rawRuleset.external as Record<string, unknown>
        : null;

    const rawConfig =
        external?.espnMotorsport ??
        rawRuleset.espnMotorsport ??
        null;

    if (!rawConfig || typeof rawConfig !== 'object') return null;
    return rawConfig as EspnMotorsportConfig;
}

export function getTournamentEspnMotorsportConfig(
    tournament: { sport_id?: unknown; sport?: unknown; ruleset?: unknown } | null | undefined
): EspnMotorsportConfig | null {
    if (!tournament) return null;

    const sportKey = tournament.sport_id ?? tournament.sport ?? null;
    if (!isMotorsportSport(sportKey)) return null;

    return getRulesetEspnMotorsportConfig(tournament.ruleset);
}

export function withFlashScoreRuleset(ruleset: unknown, config: Partial<FlashScoreConfig>) {
    const currentRuleset = (ruleset && typeof ruleset === 'object')
        ? ruleset as Record<string, unknown>
        : {};

    const currentExternal = currentRuleset.external && typeof currentRuleset.external === 'object'
        ? currentRuleset.external as Record<string, unknown>
        : {};

    const currentFlashScore = getRulesetFlashScoreConfig(currentRuleset) ?? {};
    const cleanRuleset = { ...currentRuleset };
    const cleanExternal = { ...currentExternal };
    delete cleanRuleset.rugbyApiSports;
    delete cleanRuleset.rugby_api_sports;
    delete cleanExternal.rugbyApiSports;
    delete cleanExternal.rugby_api_sports;

    return {
        ...cleanRuleset,
        external: {
            ...cleanExternal,
            flashscore: {
                ...currentFlashScore,
                ...config,
            },
        },
        flashscore: {
            ...currentFlashScore,
            ...config,
        },
    };
}

export function withRugbyApiSportsRuleset(ruleset: unknown, config?: Partial<RugbyApiSportsConfig>) {
    void config;
    const currentRuleset = (ruleset && typeof ruleset === 'object')
        ? ruleset as Record<string, unknown>
        : {};

    return currentRuleset;
}

export function withEspnAmericanFootballRuleset(ruleset: unknown, config: Partial<EspnAmericanFootballConfig>) {
    const currentRuleset = (ruleset && typeof ruleset === 'object')
        ? ruleset as Record<string, unknown>
        : {};

    const currentExternal = currentRuleset.external && typeof currentRuleset.external === 'object'
        ? currentRuleset.external as Record<string, unknown>
        : {};

    const currentConfig = getRulesetEspnAmericanFootballConfig(currentRuleset) ?? {};

    return {
        ...currentRuleset,
        external: {
            ...currentExternal,
            espn: {
                ...currentConfig,
                ...config,
            },
        },
        espn: {
            ...currentConfig,
            ...config,
        },
    };
}

export function withEspnMotorsportRuleset(ruleset: unknown, config: Partial<EspnMotorsportConfig>) {
    const currentRuleset = (ruleset && typeof ruleset === 'object')
        ? ruleset as Record<string, unknown>
        : {};

    const currentExternal = currentRuleset.external && typeof currentRuleset.external === 'object'
        ? currentRuleset.external as Record<string, unknown>
        : {};

    const currentConfig = getRulesetEspnMotorsportConfig(currentRuleset) ?? {};

    return {
        ...currentRuleset,
        external: {
            ...currentExternal,
            espnMotorsport: {
                ...currentConfig,
                ...config,
            },
        },
        espnMotorsport: {
            ...currentConfig,
            ...config,
        },
    };
}
