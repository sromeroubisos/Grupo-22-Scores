// PostgREST filter sanitization utilities.
//
// Background: Supabase's `.or(...)` / `.filter(...)` builder takes a string
// that is parsed by PostgREST as part of the URL query. Interpolating
// user-controlled input directly is unsafe because special characters can
// terminate the current filter, inject extra clauses, or trigger
// pathological scans (e.g. `*%` collapsing into `% % %`).
//
// These helpers escape user input so it can be safely embedded in
// `ilike`/`like` patterns and `eq`/`in` comparisons.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Escapes a string so it can be embedded inside an `ilike.%...%` pattern in
 * a PostgREST `.or()` filter without allowing the user to break out of the
 * pattern.
 *
 * Strips/escapes:
 *   - SQL LIKE wildcards (`%`, `_`)            → `\%`, `\_`
 *   - PostgREST filter delimiters (`,`, `(`, `)`) → removed
 *   - PostgREST tree separators (`*`)         → removed
 *   - Backslashes                              → escaped
 */
export function escapePostgrestLike(value: string): string {
    if (typeof value !== 'string') return '';
    return value
        .replace(/\\/g, '\\\\')
        .replace(/[%_]/g, (m) => `\\${m}`)
        .replace(/[(),*]/g, '');
}

/**
 * Validates that a string is a UUID. Use this before interpolating IDs into
 * `.or()` / `.filter()` strings (Supabase's `.eq()` is parameterized but
 * `.or()` is not, so unchecked interpolation is unsafe).
 */
export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Returns the value if it is a UUID, otherwise throws. Intended for use
 * inside server actions / API handlers where invalid IDs should fail fast.
 */
export function assertUuid(value: unknown, label = 'id'): string {
    if (!isUuid(value)) {
        throw new Error(`${label} must be a valid UUID`);
    }
    return value;
}
