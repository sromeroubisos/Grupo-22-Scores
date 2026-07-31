// EL IDIOMA ES PRESENTACIÓN, Y POR ESO NO ENTRA EN EL GUARDADO.
//
// La regla del §2 del CLAUDE.md dice que tocar la forma de `CareerState` obliga a
// subir `schema` y a migrar. El idioma no tiene por qué pagar ese precio: no es un
// dato de la carrera —la misma partida se puede leer en los dos— así que vive en
// su propia clave de `localStorage` y una partida guardada antes de que esto
// existiera se sigue cargando igual.
//
// Y por el mismo motivo el MOTOR NO SABE DE IDIOMAS. Todo lo que el motor escribe
// —`decisionLog[].text`, `seasons[].decisionText`— se sigue escribiendo en
// español, que es el idioma canónico del dato: si el motor escribiera en inglés,
// una partida jugada en inglés y leída en español mostraría un historial mezclado,
// y el `stateHash` del digest congelado dependería del idioma del jugador. La
// traducción se resuelve al RENDERIZAR, con `eventId + optionId + outcomeIndex`,
// que es información que `decisionLog` ya guarda.

export const LOCALES = ['es', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** Clave propia, separada de `g22-carrera-rugby` (el guardado de la partida). */
export const LOCALE_STORAGE_KEY = 'g22-carrera-rugby-lang';

export function isLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Idioma con el que arranca la página.
 *
 * Manda lo que el jugador eligió alguna vez; si nunca eligió, el idioma del
 * navegador, y si tampoco hay, español. NO se detecta en el servidor: el HTML
 * se renderiza igual para todos y el idioma se resuelve en el cliente, así que
 * la página sigue siendo estática y no hay dos versiones en caché.
 */
export function readStoredLocale(): Locale | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        return isLocale(raw) ? raw : null;
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): se usa el default.
        return null;
    }
}

export function storeLocale(locale: Locale): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // Sin acceso a localStorage: el idioma vale para esta sesión y ya.
    }
}

/** Idioma del navegador, sólo si es uno de los que el juego habla. */
export function browserLocale(): Locale | null {
    if (typeof navigator === 'undefined') return null;
    const languages = navigator.languages ?? [navigator.language];
    for (const tag of languages) {
        const base = String(tag).toLowerCase().split('-')[0];
        if (isLocale(base)) return base;
    }
    return null;
}

export function detectLocale(): Locale {
    return readStoredLocale() ?? browserLocale() ?? DEFAULT_LOCALE;
}

/** Etiqueta del idioma en su propio idioma. Un selector nunca traduce sus opciones. */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
    es: 'Español',
    en: 'English',
};

/** Código corto para el botón. */
export const LOCALE_SHORT: Readonly<Record<Locale, string>> = {
    es: 'ES',
    en: 'EN',
};

/** Atributo `lang` del contenido del juego. */
export const LOCALE_HTML_LANG: Readonly<Record<Locale, string>> = {
    es: 'es-AR',
    en: 'en',
};
