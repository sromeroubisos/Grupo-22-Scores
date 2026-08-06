export type TournamentAudience = 'mayores' | 'juveniles';

type TournamentAudienceInput = {
    ageGrade?: string | null;
    category?: string | null;
    ageGroup?: string | null;
    name?: string | null;
    displayName?: string | null;
    originalName?: string | null;
    categories?: Array<string | null | undefined> | null;
    isYouth?: boolean | null;
    /**
     * El grado, cuando el torneo lo tiene. Decide antes que todo lo demás en un
     * caso: la Intermedia y las Preintermedias son equipos de RESERVA, y van con
     * juveniles y no en la portada de mayores. Ver abajo.
     */
    subcategory?: string | null;
};

/**
 * Los grados de reserva de una división de mayores.
 *
 * `age_grade` dice `mayores` —y está bien, son jugadores adultos— pero el equipo
 * que juega la Intermedia del Top 14 no es el primero del club: es el segundo.
 * Agrupados con la Superior, la portada muestra ocho entradas del mismo torneo;
 * agrupados con juveniles, quedan donde el hincha los busca.
 *
 * Por qué se mira ANTES que el nombre: `PRIMERA A - Intermedia` matchea
 * `/\bprimera\b/` de `ADULT_PATTERNS`, así que sin esta puerta el nombre lo
 * mandaría a mayores.
 */
const RESERVA = /^(intermedia|preintermedia)\b/i;

const YOUTH_PATTERNS = [
    /\bjuv(?:enil(?:es)?)?\b/i,
    /\b(?:u|m)\s*-?\s*\d{1,2}\b/i,
    /\bsub\s*-?\s*\d{1,2}\b/i,
    /\binfantil(?:es)?\b/i,
    /\bcadete(?:s)?\b/i,
    /\bmenores?\b/i,
    /\bformativas?\b/i,
];

const ADULT_PATTERNS = [
    /\bmayores?\b/i,
    /\badult(?:s)?\b/i,
    /\bsenior(?:es)?\b/i,
    /\bprimera\b/i,
    /\breserva\b/i,
    /\bveteran(?:o|os|a|as)\b/i,
    /\bsuperior\b/i,
];

function collectHints(values: Array<string | null | undefined>): string[] {
    return values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim());
}

function matchesAnyPattern(values: string[], patterns: RegExp[]): boolean {
    return values.some((value) => patterns.some((pattern) => pattern.test(value)));
}

export function resolveTournamentAudience(input: TournamentAudienceInput): TournamentAudience {
    if (input.isYouth) {
        return 'juveniles';
    }

    // La reserva va con juveniles, no en la portada de mayores.
    if (RESERVA.test(String(input.subcategory ?? '').trim())) {
        return 'juveniles';
    }

    const ageHints = collectHints([input.ageGrade, input.ageGroup]);
    const categoryHints = collectHints([input.category, ...(input.categories ?? [])]);
    const nameHints = collectHints([input.name, input.displayName, input.originalName]);

    if (matchesAnyPattern(ageHints, YOUTH_PATTERNS)) {
        return 'juveniles';
    }

    if (matchesAnyPattern(ageHints, ADULT_PATTERNS)) {
        return 'mayores';
    }

    if (matchesAnyPattern(categoryHints, YOUTH_PATTERNS)) {
        return 'juveniles';
    }

    if (matchesAnyPattern(categoryHints, ADULT_PATTERNS)) {
        return 'mayores';
    }

    if (matchesAnyPattern(nameHints, YOUTH_PATTERNS)) {
        return 'juveniles';
    }

    if (matchesAnyPattern(nameHints, ADULT_PATTERNS)) {
        return 'mayores';
    }

    return 'mayores';
}

export function syncAgeGradeWithAudience(
    ageGrade: string | null | undefined,
    audience: TournamentAudience,
): string {
    const normalizedAgeGrade = ageGrade?.trim() || '';
    const currentAudience = resolveTournamentAudience({ ageGrade: normalizedAgeGrade });

    if (audience === 'juveniles') {
        return currentAudience === 'juveniles' && normalizedAgeGrade ? normalizedAgeGrade : 'Juveniles';
    }

    return 'Mayores (Adults)';
}
