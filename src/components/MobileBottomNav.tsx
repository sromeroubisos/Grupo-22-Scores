'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hrefParaTorneos } from '@/content/embudo';
import { useAuth } from '@/context/AuthContext';
import { useSport } from '@/context/SportContext';
import { trackEvent } from '@/lib/analytics';
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

/**
 * Las cinco pestañas, ordenadas por lo que la gente viene a hacer.
 *
 * La auditoría mobile (2026-10-19) mostró que el torneo es la unidad con la
 * que piensa el usuario —"¿cómo salió el Top 14?"— y que la barra no lo decía:
 * la pestaña se llamaba "Ligas" y lo que uno sigue vivía escondido detrás del
 * avatar. Por eso "Torneos" y "Mis torneos" tienen lugar propio, y lo
 * secundario (buscar, juegos, rankings, cuenta) va a "Más".
 */
const navItems = [
    { href: '/', label: 'Inicio', icon: 'home', matchPrefixes: ['/', '/matches'] },
    { href: '/tournaments', label: 'Torneos', icon: 'trophy', matchPrefixes: ['/tournaments'] },
    { href: '/favorites', label: 'Mis torneos', icon: 'star', matchPrefixes: ['/favorites'] },
    { href: '/noticias', label: 'Noticias', icon: 'news', matchPrefixes: ['/noticias'] },
];

/** Rutas que, sin pestaña propia, encienden "Más". */
const MORE_PREFIXES = ['/search', '/juegos', '/prode', '/rankings', '/profile', '/para-torneos', '/para-clubes', '/notifications'];

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
        case 'home':
            return (
                <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
                </svg>
            );
        case 'star':
            return (
                <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
                </svg>
            );
        case 'more':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
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

type MoreLink = {
    href: string;
    label: string;
    hint: string;
    icon: string;
    onClick?: () => void;
};

/**
 * La hoja de "Más": lo que no entra en la barra, con nombre y una línea que
 * dice qué hay adentro. Una lista de íconos sueltos obligaba a adivinar.
 */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { user, login } = useAuth();
    const { selectedSport } = useSport();
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, open]);

    if (!open) return null;

    // Cinco renglones, de lo que más se usa a lo que menos. Solo "Iniciar sesión"
    // lleva una línea de ayuda: el resto se explica con su nombre. "Organizá tu
    // torneo" es la puerta de dirigentes y va al final, lejos de quien viene a
    // mirar resultados (auditoría de densidad, 2026-10-20).
    const links: MoreLink[] = [
        { href: '/search', label: 'Buscar', hint: '', icon: 'search' },
        { href: '/juegos', label: 'Juegos y Prode', hint: '', icon: 'games' },
        { href: `/rankings?sport=${encodeURIComponent(selectedSport.id)}`, label: 'Rankings', hint: '', icon: 'trophy' },
        user
            ? { href: '/profile', label: 'Mi cuenta', hint: '', icon: 'user' }
            : { href: '/login', label: 'Iniciar sesión', hint: 'Para ver lo que seguís en otros dispositivos', icon: 'user' },
        {
            href: hrefParaTorneos('nav'),
            label: 'Organizá tu torneo',
            hint: '',
            icon: 'building',
            onClick: () => trackEvent('clubs_promo_click', { location: 'nav' }),
        },
    ];

    return (
        <div className={styles.sheetRoot}>
            <button type="button" className={styles.scrim} aria-label="Cerrar" onClick={onClose} />
            <div
                ref={panelRef}
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby="more-sheet-title"
            >
                <div className={styles.sheetHandle} aria-hidden="true" />
                <div className={styles.sheetHeader}>
                    <h2 id="more-sheet-title" className={styles.sheetTitle}>Más</h2>
                    <button type="button" className={styles.sheetClose} onClick={onClose}>Cerrar</button>
                </div>
                <ul className={styles.sheetList}>
                    {links.map((link) => (
                        <li key={link.label}>
                            {link.href === '/login' ? (
                                <button
                                    type="button"
                                    className={styles.sheetItem}
                                    onClick={() => {
                                        onClose();
                                        login('fan', `${window.location.pathname}${window.location.search}`);
                                    }}
                                >
                                    <span className={styles.sheetIcon}><SheetIcon name={link.icon} /></span>
                                    <span className={styles.sheetText}>
                                        <strong>{link.label}</strong>
                                        {link.hint ? <small>{link.hint}</small> : null}
                                    </span>
                                </button>
                            ) : (
                                <Link
                                    href={link.href}
                                    className={styles.sheetItem}
                                    onClick={() => {
                                        link.onClick?.();
                                        onClose();
                                    }}
                                >
                                    <span className={styles.sheetIcon}><SheetIcon name={link.icon} /></span>
                                    <span className={styles.sheetText}>
                                        <strong>{link.label}</strong>
                                        {link.hint ? <small>{link.hint}</small> : null}
                                    </span>
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function SheetIcon({ name }: { name: string }) {
    if (name === 'building') {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
                <path d="M10 21v-6h4v6" />
            </svg>
        );
    }
    if (name === 'user') {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
        );
    }
    return <NavIcon name={name} />;
}

export default function MobileBottomNav() {
    const pathname = usePathname();
    const hidden = BOTTOM_NAV_HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix));
    const navRef = useAnchorToVisualViewport(!hidden);
    const [moreOpen, setMoreOpen] = useState(false);
    const closeMore = useCallback(() => setMoreOpen(false), []);

    // Navegar cierra la hoja aunque el destino sea la misma ruta.
    useEffect(() => {
        setMoreOpen(false);
    }, [pathname]);

    if (hidden) {
        return null;
    }

    const moreActive = moreOpen || MORE_PREFIXES.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));

    return (
        <>
            <nav ref={navRef} className={styles.nav} aria-label="Navegación principal">
                <div className={styles.navList}>
                    {navItems.map((item) => {
                        const active = !moreOpen && isActive(pathname, item.href, item.matchPrefixes);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                                aria-current={active ? 'page' : undefined}
                            >
                                <NavIcon name={item.icon} active={active} />
                                <span className={styles.navLabel}>{item.label}</span>
                            </Link>
                        );
                    })}
                    <button
                        type="button"
                        className={`${styles.navItem} ${moreActive ? styles.navItemActive : ''}`}
                        aria-expanded={moreOpen}
                        aria-haspopup="dialog"
                        onClick={() => setMoreOpen((current) => !current)}
                    >
                        <NavIcon name="more" active={moreActive} />
                        <span className={styles.navLabel}>Más</span>
                    </button>
                </div>
            </nav>
            <MoreSheet open={moreOpen} onClose={closeMore} />
        </>
    );
}
