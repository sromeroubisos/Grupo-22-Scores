'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale, UiStrings } from '@/features/career';
import { DEFAULT_LOCALE, LOCALE_HTML_LANG, detectLocale, stringsFor, storeLocale } from '@/features/career';

/**
 * EL IDIOMA DEL JUEGO, EN EL CLIENTE.
 *
 * Se resuelve DESPUÉS del primer render y no antes, y es a propósito: el
 * servidor no sabe qué idioma eligió este jugador —la preferencia vive en
 * `localStorage`— así que si el provider arrancara en inglés, el HTML del
 * servidor y el del cliente no coincidirían y React tiraría un error de
 * hidratación en cada carga.
 *
 * Por eso el primer pintado es SIEMPRE en español (el idioma canónico) y el
 * efecto lo cambia si corresponde. En la práctica no se ve un salto: la portada
 * arranca en `loading` mientras se lee el disco, que es el mismo tick.
 *
 * La preferencia NO entra en el guardado de la partida (`g22-carrera-rugby`):
 * tiene su propia clave, así que cambiar de idioma no invalida nada ni obliga a
 * subir `schema`. Ver `features/career/i18n/locale.ts`.
 */
interface LocaleContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: UiStrings;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function CareerLocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

    useEffect(() => {
        const detected = detectLocale();
        if (detected !== DEFAULT_LOCALE) setLocaleState(detected);
    }, []);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        storeLocale(next);
    }, []);

    // El `lang` del documento acompaña al idioma del juego. Sin esto un lector de
    // pantalla lee el inglés con la fonética del español, que es peor que no
    // traducir nada. El título de la pestaña sale de `generateMetadata`, que corre
    // en el servidor y no puede saber el idioma: se ajusta acá.
    useEffect(() => {
        const previous = document.documentElement.lang;
        document.documentElement.lang = LOCALE_HTML_LANG[locale];
        document.title = stringsFor(locale).pageTitle;
        return () => { document.documentElement.lang = previous; };
    }, [locale]);

    const value = useMemo(
        () => ({ locale, setLocale, t: stringsFor(locale) }),
        [locale, setLocale],
    );

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
    const context = useContext(LocaleContext);
    if (context === null) {
        // Un componente del juego fuera del provider es un error de armado, no un
        // caso a tolerar: devolver el español en silencio dejaría media pantalla
        // sin traducir y nadie sabría por qué.
        throw new Error('useLocale se usó fuera de <CareerLocaleProvider>');
    }
    return context;
}
