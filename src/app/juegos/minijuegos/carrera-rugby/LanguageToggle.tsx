'use client';

import { LOCALES, LOCALE_LABELS, LOCALE_SHORT } from '@/features/career';
import { useLocale } from './LocaleContext';
import styles from './carrera.module.css';

/**
 * ES / EN, arriba a la derecha.
 *
 * Es un `radiogroup` y no un botón que alterna: con dos idiomas la diferencia se
 * nota poco, pero un botón que dice "EN" no aclara si eso es el idioma actual o
 * el que se va a poner. Con dos opciones y `aria-checked`, el estado se lee sin
 * ambigüedad y el día que entre un tercer idioma no hay que rehacerlo.
 *
 * Las etiquetas van EN SU PROPIO IDIOMA (`Español`, `English`): un selector que
 * traduce sus opciones obliga a entender el idioma que no hablás para salir de
 * él. Lo visible en pantalla es el código corto; el nombre completo va al lector
 * de pantalla y al `title`.
 */
export default function LanguageToggle() {
    const { locale, setLocale, t } = useLocale();

    return (
        <div className={styles.langSwitch} role="radiogroup" aria-label={t.languageLabel}>
            {LOCALES.map((code) => (
                <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={locale === code}
                    lang={code}
                    title={LOCALE_LABELS[code]}
                    className={`${styles.langOption} ${locale === code ? styles.langOptionOn : ''}`}
                    onClick={() => setLocale(code)}
                >
                    <span aria-hidden="true">{LOCALE_SHORT[code]}</span>
                    <span className={styles.srOnly}>{LOCALE_LABELS[code]}</span>
                </button>
            ))}
        </div>
    );
}
