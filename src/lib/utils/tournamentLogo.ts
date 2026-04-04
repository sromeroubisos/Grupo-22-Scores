import { getCachedLogo } from './logoCache';

const TOURNAMENT_SOURCE_PATHS = [
    [],
    ['tournament'],
    ['tournament_stage'],
    ['stage'],
    ['competition'],
    ['league'],
    ['details'],
    ['data'],
    ['DATA'],
    ['event'],
    ['EVENT'],
] as const;

const TOURNAMENT_LOGO_PATHS = [
    ['logo'],
    ['logo_url'],
    ['logoUrl'],
    ['image'],
    ['image_path'],
    ['small_image_path'],
    ['logo_path'],
    ['tournament_logo'],
    ['tournament_image_path'],
    ['icon'],
    ['branding', 'logo_url'],
    ['branding', 'logoUrl'],
    ['branding', 'organization', 'identity', 'logo'],
    ['organization', 'identity', 'logo'],
    ['identity', 'logo'],
] as const;

const TOURNAMENT_ID_PATHS = [
    ['id'],
    ['tournament_id'],
    ['tournament_stage_id'],
    ['stage_id'],
    ['stageId'],
    ['external_id'],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function readPath(source: unknown, path: readonly string[]): unknown {
    let current = source;

    for (const segment of path) {
        if (!isRecord(current)) return undefined;
        current = current[segment];
    }

    return current;
}

function readNonEmptyString(source: unknown, path: readonly string[]): string | null {
    const value = readPath(source, path);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pushUnique(target: string[], value: string | null) {
    if (value && !target.includes(value)) {
        target.push(value);
    }
}

function collectTournamentIds(source: unknown): string[] {
    const ids: string[] = [];

    for (const sourcePath of TOURNAMENT_SOURCE_PATHS) {
        const scopedSource = sourcePath.length === 0 ? source : readPath(source, sourcePath);
        if (!isRecord(scopedSource)) continue;

        for (const idPath of TOURNAMENT_ID_PATHS) {
            pushUnique(ids, readNonEmptyString(scopedSource, idPath));
        }
    }

    return ids;
}

function collectTournamentLogos(source: unknown): string[] {
    const logos: string[] = [];

    for (const sourcePath of TOURNAMENT_SOURCE_PATHS) {
        const scopedSource = sourcePath.length === 0 ? source : readPath(source, sourcePath);
        if (!isRecord(scopedSource)) continue;

        for (const logoPath of TOURNAMENT_LOGO_PATHS) {
            pushUnique(logos, readNonEmptyString(scopedSource, logoPath));
        }
    }

    return logos;
}

export function resolveTournamentLogo(source: unknown, fallbackLogo?: string | null): string | null {
    const directLogos = collectTournamentLogos(source);

    for (const logo of directLogos) {
        return logo;
    }

    for (const tournamentId of collectTournamentIds(source)) {
        const cachedLogo = getCachedLogo(tournamentId);
        if (cachedLogo) return cachedLogo;
    }

    return typeof fallbackLogo === 'string' && fallbackLogo.trim() ? fallbackLogo.trim() : null;
}
