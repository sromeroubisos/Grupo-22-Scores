export type TournamentAudience = 'mayores' | 'juveniles';

/**
 * Cómo se lee cada segmento en pantalla. La clave `juveniles` es la que viaja en
 * la URL (`?audience=juveniles`) y en el estado, así que no se toca: lo que
 * cambia es el rótulo, porque la pestaña no es sólo de juveniles — también es
 * donde vive la reserva (Intermedia, Preintermedia).
 */
export const AUDIENCE_LABELS: Record<TournamentAudience, string> = {
    mayores: 'Mayores',
    juveniles: 'Juveniles/Reserva',
};

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
 * Por qué se mira ANTES que el grado y que el nombre: `PRIMERA A - Intermedia`
 * matchea `/\bprimera\b/` de `ADULT_PATTERNS` y su `age_grade` dice `mayores`,
 * así que sin esta puerta cualquiera de los dos lo mandaría a la portada.
 *
 * Por qué no va anclada al principio: el `subcategory` viene limpio
 * (`Intermedia`), pero el nombre no (`Top 14 - Intermedia`), y la portada resuelve
 * la audiencia de un partido SÓLO por nombre — no tiene el grado a mano.
 * `(?:pre[\s-]?)?` cubre las tres grafías que llegan: `Preintermedia`,
 * `Pre Intermedia` y `Pre-Intermedia`.
 */
const RESERVA = /\b(?:pre[\s-]?)?intermedias?\b|\breservas?\b/i;

const YOUTH_PATTERNS = [
    /\bjuv(?:enil(?:es)?)?\b/i,
    /\b(?:u|m)\s*-?\s*\d{1,2}\b/i,
    /\bsub\s*-?\s*\d{1,2}\b/i,
    /\binfantil(?:es)?\b/i,
    /\bcadete(?:s)?\b/i,
    /\bmenores?\b/i,
    /\bformativas?\b/i,
];

// `reserva` NO está acá a propósito: es el otro segmento. Ver RESERVA arriba.
const ADULT_PATTERNS = [
    /\bmayores?\b/i,
    /\badult(?:s)?\b/i,
    /\bsenior(?:es)?\b/i,
    /\bprimera\b/i,
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

/**
 * A qué segmento de la portada pertenece un torneo.
 *
 * El orden en que se miran las pistas ES la regla, y se lee así:
 *
 *  1. `isYouth` explícito.
 *  2. Reserva (Intermedia / Preintermedia / Reserva), venga del grado, de la
 *     categoría o del nombre. Va arriba del `age_grade` porque son adultos y el
 *     grado dice `mayores`: si lo dejáramos decidir, la reserva volvería a la
 *     portada.
 *  3. `age_grade` / `age_group`. **Éste es el override del super admin**: lo que
 *     elija en el creador de torneos gana sobre lo que diga el nombre, que es lo
 *     de más abajo.
 *  4. Categoría, y recién al final el nombre — de donde sale que un
 *     "Menores de 15" caiga solo en juveniles/reserva sin que nadie lo cargue a
 *     mano, porque la portada resuelve los partidos únicamente por nombre.
 */
export function resolveTournamentAudience(input: TournamentAudienceInput): TournamentAudience {
    if (input.isYouth) {
        return 'juveniles';
    }

    const ageHints = collectHints([input.ageGrade, input.ageGroup]);
    const categoryHints = collectHints([input.category, ...(input.categories ?? [])]);
    const nameHints = collectHints([input.name, input.displayName, input.originalName]);

    // La reserva va con juveniles, no en la portada de mayores. Se mira en las
    // cuatro fuentes porque cada pantalla tiene distintas a mano: la consola pasa
    // el `subcategory`, el super admin puede escribirlo como grado, y la portada
    // sólo cuenta con el nombre del torneo del partido.
    if (matchesAnyPattern(
        collectHints([input.subcategory]).concat(ageHints, categoryHints, nameHints),
        [RESERVA],
    )) {
        return 'juveniles';
    }

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
