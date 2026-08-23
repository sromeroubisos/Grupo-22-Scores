'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { BOTTOM_NAV_HIDDEN_PREFIXES } from '@/components/MobileBottomNav';
import { trackEvent } from '@/lib/analytics';
import { BARRA, hrefParaClubes, PARA_CLUBES_HREF } from '@/content/para-clubes';
import styles from './ClubsPromoBar.module.css';

/**
 * La barra de abajo, con las reglas puestas por escrito.
 *
 * El principio del sitio es que el hincha que entra a ver el resultado de su
 * equipo lo vea SIN TOCAR NADA. Entonces esta barra:
 *
 * - no oscurece nada, no tiene overlay y no bloquea el scroll;
 * - no atrapa el foco: el contenido de atrás sigue enteramente usable;
 * - no aparece al entrar ni por temporizador, sino recién cuando el visitante
 *   scrolleó el 60% de la página — o sea, cuando ya vio lo que vino a ver;
 * - se cierra y no vuelve por 30 días.
 *
 * Y se apoya arriba de la barra de navegación inferior, que en este sitio
 * existe abajo de 900px: taparla sería sacarle al visitante la navegación para
 * mostrarle un aviso.
 */

const CLAVE_DESCARTE = 'g22_clubs_promo_dismissed';
const DIAS_DE_SILENCIO = 30;
const MS_DE_SILENCIO = DIAS_DE_SILENCIO * 24 * 60 * 60 * 1000;
const UMBRAL_SCROLL = 0.6;

/**
 * Toda lectura del storage va en try/catch y asume que puede volver vacía:
 * modo privado, cuota llena y navegadores que bloquean el acceso son
 * escenarios reales, y ninguno puede romper la página.
 */
function fueDescartada(): boolean {
    try {
        const guardado = window.localStorage.getItem(CLAVE_DESCARTE);
        if (!guardado) return false;

        const momento = Number(guardado);
        if (!Number.isFinite(momento)) {
            // Valor viejo o corrupto: se limpia y se empieza de nuevo.
            window.localStorage.removeItem(CLAVE_DESCARTE);
            return false;
        }

        return Date.now() - momento < MS_DE_SILENCIO;
    } catch {
        return false;
    }
}

function guardarDescarte(): void {
    try {
        window.localStorage.setItem(CLAVE_DESCARTE, String(Date.now()));
    } catch {
        // Sin storage la barra vuelve en la próxima visita. Es molesto, no roto.
    }
}

export default function ClubsPromoBar() {
    const pathname = usePathname();
    const [montada, setMontada] = useState(false);
    const [visible, setVisible] = useState(false);
    const [entrada, setEntrada] = useState(false);

    // Si ya está en /para-clubes no hay nada que ofrecerle: ya llegó.
    const enParaClubes = pathname?.startsWith(PARA_CLUBES_HREF) ?? false;

    /**
     * En las rutas donde la barra de navegación inferior no se dibuja, esta se
     * apoya directamente en el borde. La lista se lee de su propio archivo para
     * que las dos no puedan discrepar.
     */
    const sinBarraInferior = BOTTOM_NAV_HIDDEN_PREFIXES.some(
        (prefijo) => pathname?.startsWith(prefijo),
    ) ?? false;

    useEffect(() => {
        if (enParaClubes) return;
        if (fueDescartada()) return;
        setMontada(true);
    }, [enParaClubes]);

    useEffect(() => {
        if (!montada || visible) return;

        const revisar = () => {
            const alto = document.documentElement.scrollHeight;
            const visto = window.scrollY + window.innerHeight;

            // Una página que no scrollea nunca llega al 60%: ahí la barra
            // simplemente no aparece, y está bien que así sea.
            if (alto <= window.innerHeight) return;

            if (visto / alto >= UMBRAL_SCROLL) {
                setVisible(true);
            }
        };

        revisar();
        window.addEventListener('scroll', revisar, { passive: true });
        window.addEventListener('resize', revisar, { passive: true });

        return () => {
            window.removeEventListener('scroll', revisar);
            window.removeEventListener('resize', revisar);
        };
    }, [montada, visible]);

    useEffect(() => {
        if (!visible) return;

        // Un cuadro entre montar y animar: sin esto el navegador pinta la barra
        // ya en su posición final y la transición no ocurre.
        const cuadro = requestAnimationFrame(() => setEntrada(true));
        trackEvent('clubs_promo_view', { location: 'bar' });

        return () => cancelAnimationFrame(cuadro);
    }, [visible]);

    const cerrar = useCallback(() => {
        guardarDescarte();
        setEntrada(false);
        setVisible(false);
        setMontada(false);
    }, []);

    if (!montada || !visible || enParaClubes) return null;

    return (
        <div
            className={`${styles.barra} ${entrada ? styles.visible : ''} ${sinBarraInferior ? styles.sinNav : ''}`}
            role="region"
            aria-label="G22 para clubes"
        >
            <p className={styles.texto}>{BARRA.texto}</p>

            <Link
                href={hrefParaClubes('barra')}
                className={styles.accion}
                onClick={() => trackEvent('clubs_promo_click', { location: 'bar' })}
            >
                {BARRA.accion}
            </Link>

            <button type="button" className={styles.cerrar} onClick={cerrar} aria-label={BARRA.cerrar}>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                </svg>
            </button>
        </div>
    );
}
