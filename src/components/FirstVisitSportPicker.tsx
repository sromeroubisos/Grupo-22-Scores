'use client';

/**
 * Invitación de primera visita: "¿Qué deporte querés ver primero?"
 *
 * Aparece UNA vez por dispositivo, solo en la home, solo a quien no tiene
 * sesión, y recién después de que el feed pintó. La respuesta queda en
 * localStorage (lib/deviceSportPreference) y SportContext la lee al arrancar,
 * así que el visitante ve su deporte sin registrarse. Elegir es un solo toque.
 *
 * Después de elegir hay un segundo paso que invita a crear la cuenta, con
 * "Seguir sin cuenta" al mismo nivel visual: la cuenta es un plus (favoritos
 * que te siguen a otro dispositivo), no un peaje.
 *
 * Reglas de "no molestar":
 *  - Cerrar sin elegir cuenta como respuesta: no se vuelve a preguntar.
 *  - No aparece si vino por ?sport= (dominio satélite) ni fuera de `/`.
 *  - No aparece con sesión iniciada: ese usuario tiene su onboarding.
 *  - /?sportPicker=1 lo fuerza para QA.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { useSport } from '@/context/SportContext';
import type { Sport } from '@/lib/types';
import {
    dismissDeviceSportPrompt,
    setDeviceSportId,
    shouldPromptForDeviceSport,
} from '@/lib/deviceSportPreference';

import styles from './FirstVisitSportPicker.module.css';

// Espera antes de aparecer: que el visitante vea el sitio primero.
const APPEAR_DELAY_MS = 1100;
const ANIM_MS = 260;
// Pausa entre tocar un deporte y pasar al paso 2, para que se vea el estado elegido.
const PICK_SETTLE_MS = 240;

type Step = 'pick' | 'account';

export default function FirstVisitSportPicker() {
    const pathname = usePathname();
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const { activeSports, setSelectedSport } = useSport();

    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState<Step>('pick');
    const [picked, setPicked] = useState<Sport | null>(null);
    const [reduceMotion, setReduceMotion] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const accountPrimaryRef = useRef<HTMLAnchorElement>(null);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduceMotion(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    const onHome = pathname === '/';

    useEffect(() => {
        if (!onHome || authLoading || isAuthenticated) return;

        let forced = false;
        let cameBySportUrl = false;
        try {
            const params = new URLSearchParams(window.location.search);
            forced = params.get('sportPicker') === '1';
            cameBySportUrl = !!params.get('sport');
        } catch {
            return;
        }
        if (!forced) {
            if (cameBySportUrl) return;
            if (!shouldPromptForDeviceSport()) return;
        }

        const timer = window.setTimeout(() => {
            setMounted(true);
            requestAnimationFrame(() => setVisible(true));
        }, APPEAR_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [onHome, authLoading, isAuthenticated]);

    // Si inicia sesión con la invitación abierta, o se va de la home (botón
    // atrás del navegador), la hoja se retira sola: no tiene que quedar
    // flotando arriba de otra página.
    useEffect(() => {
        if (mounted && (isAuthenticated || !onHome)) {
            setVisible(false);
            window.setTimeout(() => setMounted(false), ANIM_MS);
        }
    }, [isAuthenticated, onHome, mounted]);

    const close = useCallback(() => {
        setVisible(false);
        window.setTimeout(() => setMounted(false), reduceMotion ? 120 : ANIM_MS);
    }, [reduceMotion]);

    // Cerrar sin elegir = "ahora no", y no se insiste. Cerrar en el paso 2
    // conserva el deporte ya elegido.
    const dismiss = useCallback(() => {
        if (step === 'pick') dismissDeviceSportPrompt();
        close();
    }, [step, close]);

    const pick = useCallback((sport: Sport) => {
        if (picked) return;
        setPicked(sport);
        setDeviceSportId(sport.id);
        setSelectedSport(sport);
        window.setTimeout(() => setStep('account'), reduceMotion ? 0 : PICK_SETTLE_MS);
    }, [picked, reduceMotion, setSelectedSport]);

    // Foco: al abrir, en el diálogo (no en una opción: el anillo de foco se
    // confunde con "elegido"); al pasar de paso, en la acción principal.
    useEffect(() => {
        if (!visible) return;
        const target = step === 'pick' ? sheetRef.current : accountPrimaryRef.current;
        target?.focus({ preventScroll: true });
    }, [visible, step]);

    // Escape cierra. Tab queda adentro del diálogo: con aria-modal el lector
    // de pantalla ya no ve la página de atrás, y el teclado tampoco debería.
    useEffect(() => {
        if (!mounted) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                dismiss();
                return;
            }
            if (e.key !== 'Tab' || !sheetRef.current) return;
            const focusables = Array.from(
                sheetRef.current.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            ).filter((el) => el.offsetParent !== null);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;
            const inside = active ? sheetRef.current.contains(active) : false;
            if (e.shiftKey) {
                if (!inside || active === first || active === sheetRef.current) {
                    e.preventDefault();
                    last.focus();
                }
            } else if (!inside || active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mounted, dismiss]);

    useEffect(() => {
        if (!mounted) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [mounted]);

    if (!mounted) return null;

    const stateClass = visible ? styles.open : '';
    const motionClass = reduceMotion ? styles.reduceMotion : '';

    return (
        <div
            className={`${styles.backdrop} ${stateClass} ${motionClass}`}
            onClick={dismiss}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="first-visit-sport-title"
                ref={sheetRef}
                tabIndex={-1}
                className={`${styles.sheet} ${stateClass} ${motionClass}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.grip} aria-hidden="true" />

                <button
                    type="button"
                    className={styles.close}
                    onClick={dismiss}
                    aria-label={step === 'pick' ? 'Ahora no' : 'Cerrar'}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>

                {step === 'pick' ? (
                    <div className={styles.stepBody} key="pick">
                        <p className={styles.eyebrow}>Bienvenido a G22 Scores</p>
                        <h2 id="first-visit-sport-title" className={styles.title}>
                            ¿Qué deporte querés ver primero?
                        </h2>
                        <p className={styles.subtitle}>
                            Lo guardamos en este dispositivo. Lo cambiás cuando quieras desde el menú.
                        </p>

                        <div className={styles.grid} role="radiogroup" aria-label="Deporte favorito">
                            {activeSports.map((sport, index) => {
                                const isPicked = picked?.id === sport.id;
                                return (
                                    <button
                                        key={sport.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={isPicked}
                                        className={`${styles.option} ${isPicked ? styles.optionPicked : ''} ${picked && !isPicked ? styles.optionDimmed : ''}`}
                                        style={{ ['--i' as string]: index }}
                                        onClick={() => pick(sport)}
                                    >
                                        <span className={styles.optionIcon} aria-hidden="true">{sport.icon}</span>
                                        <span
                                            lang="es"
                                            className={`${styles.optionName} ${sport.nameEs.length > 10 ? styles.optionNameLong : ''}`}
                                        >
                                            {sport.nameEs}
                                        </span>
                                        <span className={styles.optionCheck} aria-hidden="true">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <button type="button" className={styles.ghost} onClick={dismiss}>
                            Ahora no
                        </button>
                    </div>
                ) : (
                    <div className={styles.stepBody} key="account">
                        <div className={styles.pickedBadge}>
                            <span className={styles.pickedIcon} aria-hidden="true">{picked?.icon}</span>
                            <span className={styles.pickedText}>
                                Listo. Vas a ver <strong>{picked?.nameEs}</strong> primero.
                            </span>
                        </div>

                        <h2 id="first-visit-sport-title" className={styles.title}>
                            ¿Querés que te siga a cualquier dispositivo?
                        </h2>
                        <p className={styles.subtitle}>
                            Con una cuenta guardás tus clubes y torneos favoritos, y te avisamos cuando juegan.
                            Es gratis y tarda un minuto.
                        </p>

                        <div className={styles.actions}>
                            <Link
                                ref={accountPrimaryRef}
                                href="/register"
                                className={styles.primary}
                                onClick={close}
                            >
                                Crear cuenta
                            </Link>
                            <button type="button" className={styles.secondary} onClick={close}>
                                Seguir sin cuenta
                            </button>
                        </div>

                        <p className={styles.footnote}>
                            ¿Ya tenés cuenta?{' '}
                            <Link href="/login?returnTo=%2F" className={styles.footnoteLink} onClick={close}>
                                Iniciá sesión
                            </Link>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
