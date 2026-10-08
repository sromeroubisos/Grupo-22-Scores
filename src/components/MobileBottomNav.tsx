'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './MobileBottomNav.module.css';

/**
 * Dónde NO se dibuja la barra.
 *
 * Las cinco primeras son pantallas de trámite: entrar, leer un texto legal,
 * escribir un mensaje. La sexta es distinta y merece el renglón: los minijuegos
 * son la única pantalla del sitio donde el alto ES el contenido. En El Capitán,
 * la barra de 78 px era la diferencia entre ver las cuatro opciones de la
 * pretemporada y ver tres — o sea, entre decidir mirando y decidir de memoria.
 *
 * La salida no se pierde: la cabecera del sitio es `sticky` y queda a la vista
 * con el logo, la búsqueda y el menú, y el pie sigue abajo de todo.
 *
 * ── Por qué se exporta ──────────────────────────────────────────────────────
 * Porque el layout RESERVA el alto de la barra con un `padding-bottom` en
 * `.mainContent`, y esa reserva no sabía de esta lista: en El Capitán la barra
 * no se dibujaba y el pie seguía ahí igual, o sea 74 px de nada al final de
 * cada pantalla del juego —medido a 390 × 844—. Una lista sola, leída por los
 * dos, es lo que hace imposible que vuelvan a discrepar.
 */
export const BOTTOM_NAV_HIDDEN_PREFIXES = [
    '/login',
    '/terminos',
    '/privacidad',
    '/contacto',
    '/ayuda',
    '/juegos/minijuegos/el-capitan',
];

const navItems = [
    { href: '/', label: 'Partidos', icon: 'matches', matchPrefixes: ['/', '/matches'] },
    { href: '/noticias', label: 'Noticias', icon: 'news', matchPrefixes: ['/noticias'] },
    { href: '/tournaments', label: 'Ligas', icon: 'trophy', matchPrefixes: ['/tournaments'] },
    // El Prode entra por Juegos: no tiene pestaña propia, pero la de Juegos
    // queda activa mientras se navega el prode.
    { href: '/juegos', label: 'Juegos', icon: 'games', matchPrefixes: ['/juegos', '/prode'] },
    { href: '/search', label: 'Buscar', icon: 'search', matchPrefixes: ['/search'] },
];

function isActive(pathname: string | null, href: string, matchPrefixes: string[]) {
    if (!pathname) return false;
    if (href === '/') return pathname === '/' || pathname.startsWith('/matches');
    // Un prefijo vale como segmento entero: `/juegos-odesur` empieza con
    // "/juegos" y no es la sección de minijuegos.
    return matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function NavIcon({ name, active }: { name: string; active?: boolean }) {
    const strokeWidth = active ? 3 : 2;

    switch (name) {
        case 'matches':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
                    <path d="M3 6h18" />
                    <path d="M6 10h12" />
                    <path d="M8 14h8" />
                    <path d="M10 18h4" />
                </svg>
            );
        case 'news':
            return (
                <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                    <path d="M4 7h12" />
                    <path d="M4 11h16" />
                    <path d="M4 15h10" />
                    <path d="M18 7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7" />
                </svg>
            );
        case 'trophy':
            return (
                <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                    <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
                    <path d="M6 4h-2a2 2 0 0 0-2 2v1a5 5 0 0 0 5 5" />
                    <path d="M18 4h2a2 2 0 0 1 2 2v1a5 5 0 0 1-5 5" />
                    <path d="M12 12v4" />
                    <path d="M8 20h8" />
                </svg>
            );
        case 'games':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
                    <path d="M6 12h4M8 10v4" />
                    <circle cx="15.5" cy="11" r="0.9" fill="currentColor" stroke="none" />
                    <circle cx="17" cy="13" r="0.9" fill="currentColor" stroke="none" />
                    <path d="M17.5 6H6.5A4.5 4.5 0 0 0 2 10.5v3A4.5 4.5 0 0 0 6.5 18c1.3 0 2-.6 2.8-1.4l.4-.6h4.6l.4.6c.8.8 1.5 1.4 2.8 1.4a4.5 4.5 0 0 0 4.5-4.5v-3A4.5 4.5 0 0 0 17.5 6Z" />
                </svg>
            );
        case 'search':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                </svg>
            );
        default:
            return null;
    }
}

/**
 * Ancla la barra al borde de abajo de lo que se VE, no al del layout viewport.
 *
 * En la web app instalada del iPhone (standalone), después de abrir y cerrar el
 * teclado o de volver de segundo plano, Safari deja el layout viewport más
 * corto que la pantalla: un `fixed; bottom: 0` queda flotando ~85 px arriba
 * del borde, con contenido pasando por debajo, y el scroll termina antes de
 * tiempo (captura del usuario, 2026-10-08). `visualViewport` sí sabe dónde
 * está el borde real: la diferencia se corrige con un `translateY`, y además se
 * fuerza un re-scroll para que Safari recalcule el viewport.
 *
 * Con zoom (scale ≠ 1) o con el teclado abierto (diferencia negativa) no se
 * toca nada: ahí la barra tiene que comportarse como siempre.
 */
function useAnchorToVisualViewport(enabled: boolean) {
    const ref = useRef<HTMLElement>(null);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!enabled || !vv) return;

        let frame = 0;
        const apply = () => {
            frame = 0;
            const nav = ref.current;
            if (!nav) return;
            const gap = vv.offsetTop + vv.height - window.innerHeight;
            const shift = Math.abs(vv.scale - 1) < 0.01 && gap > 1 ? Math.round(gap) : 0;
            nav.style.setProperty('--nav-shift', `${shift}px`);
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(apply);
        };
        // Al cerrar el teclado o volver a la app, Safari a veces no rehace el
        // viewport hasta el próximo scroll: se lo pedimos en el lugar.
        const relayout = () => {
            setTimeout(() => {
                window.scrollTo(window.scrollX, window.scrollY);
                schedule();
            }, 80);
        };
        const onVisible = () => {
            if (document.visibilityState === 'visible') relayout();
        };

        schedule();
        vv.addEventListener('resize', schedule);
        vv.addEventListener('scroll', schedule);
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('orientationchange', relayout);
        window.addEventListener('pageshow', relayout);
        document.addEventListener('focusout', relayout);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            vv.removeEventListener('resize', schedule);
            vv.removeEventListener('scroll', schedule);
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('orientationchange', relayout);
            window.removeEventListener('pageshow', relayout);
            document.removeEventListener('focusout', relayout);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled]);

    return ref;
}

export default function MobileBottomNav() {
    const pathname = usePathname();
    const hidden = BOTTOM_NAV_HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix));
    const navRef = useAnchorToVisualViewport(!hidden);

    if (hidden) {
        return null;
    }

    return (
        <nav ref={navRef} className={styles.nav} aria-label="Navegacion principal">
            <div className={styles.navList}>
                {navItems.map((item) => {
                    const active = isActive(pathname, item.href, item.matchPrefixes);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                        >
                            <NavIcon name={item.icon} active={active} />
                            <span>{item.label}</span>
                            <span className={styles.navDot} />
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
