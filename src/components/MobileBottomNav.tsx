'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './MobileBottomNav.module.css';

const hiddenPrefixes = ['/login', '/terminos', '/privacidad', '/contacto', '/ayuda'];

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
    return matchPrefixes.some((prefix) => pathname.startsWith(prefix));
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

export default function MobileBottomNav() {
    const pathname = usePathname();

    if (hiddenPrefixes.some((prefix) => pathname?.startsWith(prefix))) {
        return null;
    }

    return (
        <nav className={styles.nav} aria-label="Navegacion principal">
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
