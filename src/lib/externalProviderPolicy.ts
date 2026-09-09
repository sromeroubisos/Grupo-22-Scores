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

// El hockey de la plataforma es sobre césped: 'field-hockey' es el que tiene los
// torneos y el que el selector rotula "Hockey" (ver src/lib/data/sports.ts).
// 'hockey' a secas es el de hielo y NO entra acá.
const FIELD_HOCKEY_SPORT_KEYS = new Set([
    'field-hockey',
    '24',
    '/field-hockey/',
]);

// El tenis lo sirve ESPN (`src/lib/services/tennis.ts`), nunca FlashScore. El
// `'2'` es el id con el que FlashScore mapea tenis en su `SPORT_MAPPING`: está
// acá para reconocer la clave que llega de afuera, no para pedirle nada.
const TENNIS_SPORT_KEYS = new Set([
    'tennis',
    'tenis',
    '2',
    '/tennis/',
    '/tenis/',
]);

const FOOTBALL_SPORT_KEYS = new Set([
    'football',
    'soccer',
    'futbol',
    'fútbol',
    '1',
    '/football/',
    '/soccer/',
]);

export const FLASHSCORE_PROVIDER = 'flashscore';
export const ESPN_PROVIDER = 'espn';
export const SOFASCORE_PROVIDER = 'sofascore';

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

export function isFieldHockeySport(value: unknown): boolean {
    const normalized = normalizeSportKey(value);
    if (!normalized) return false;
    return FIELD_HOCKEY_SPORT_KEYS.has(normalized);
}

export function isTennisSport(value: unknown): boolean {
    const normalized = normalizeSportKey(value);
    if (!normalized) return false;
    return TENNIS_SPORT_KEYS.has(normalized);
}

export function isFootballSport(value: unknown): boolean {
    const normalized = normalizeSportKey(value);
    if (!normalized) return false;
    return FOOTBALL_SPORT_KEYS.has(normalized);
}

/**
 * Deportes ACTIVOS que todavía no tienen fuente externa declarada.
 *
 * No es lo mismo que "deporte apagado": un deporte de acá está a la vista y se
 * le pueden crear torneos y cargar partidos a mano. Lo que no tiene es
 * sincronismo. La distinción hace falta porque FlashScore mapea más deportes de
 * los que la plataforma sigue: sin esta puerta, `fixture-sync` y `live-sync`
 * traerían el deporte entero del mundo y la portada mostraría partidos que
 * nadie de la plataforma cargó.
 *
 * Para darle fuente: sacarlo de acá y mapear el proveedor en
 * `getPreferredExternalProviderForSport`.
 */
export const SPORTS_WITHOUT_EXTERNAL_PROVIDER = new Set<string>([
    // El tenis está acá por lo contrario que un deporte sin fuente: le sobra —ESPN
    // sirve vivo, día, ranking y cuadro con modelo propio (`TennisMatch`)—
    // pero NO pasa por `Match`, así que `fixture-sync` y `live-sync` no tienen
    // nada que sincronizar. Sin esta puerta resolverían tenis por el camino de
    // FlashScore (deporte 2) y la portada se llenaría de ITF y futures del
    // mundo entero.
    'tennis',
]);

export function isFlashScoreEnabledForSport(value?: unknown): boolean {
    // Despite the name, this gates whether an *external* listing should run
    // for the sport. Football still passes because the football path inside
    // flashscore.ts delegates to the SofaScore microservice (or short-circuits
    // to an empty payload when the bridge is unavailable — it never falls
    // back to a real FlashScore HTTP call).
    // El set compara contra la clave canónica, así que por sí solo dejaría
    // pasar los alias ('tenis', '2', '/tennis/'). Para el tenis la puerta
    // tiene que cerrar por CUALQUIER alias: basta que un llamador pase el id
    // numérico para que el sync se vaya a buscar el deporte 2 a FlashScore.
    if (isTennisSport(value)) return false;
    const normalized = normalizeSportKey(value);
    if (normalized && SPORTS_WITHOUT_EXTERNAL_PROVIDER.has(normalized)) return false;
    return true;
}

export function getPreferredExternalProviderForSport(value: unknown) {
    if (isAmericanFootballSport(value)) return ESPN_PROVIDER;
    if (isMotorsportSport(value)) return ESPN_PROVIDER;
    if (isFootballSport(value)) return ESPN_PROVIDER;
    if (isTennisSport(value)) return ESPN_PROVIDER;
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
