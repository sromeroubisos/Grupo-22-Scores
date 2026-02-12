'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SuperSidebar.module.css';

type NavItem = {
    id: string;
    label: string;
    href: string;
    iconPath: string;
};

type NavGroup = {
    id: string;
    label: string;
    items: NavItem[];
};

const navGroups: NavGroup[] = [
    {
        id: 'core',
        label: 'Core Engine',
        items: [
            {
                id: 'dashboard',
                label: 'Dashboard',
                href: '/admin/super',
                iconPath:
                    'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'
            },
            {
                id: 'tournaments',
                label: 'Torneos',
                href: '/admin/super/torneos',
                iconPath:
                    'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
            },
            {
                id: 'matches',
                label: 'Partidos',
                href: '/admin/super/partidos',
                iconPath: 'M13 10V3L4 14h7v7l9-11h-7z'
            },
            {
                id: 'clubs',
                label: 'Clubes',
                href: '/admin/super/clubes',
                iconPath:
                    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
            },
            {
                id: 'players',
                label: 'Jugadores',
                href: '/admin/super/jugadores',
                iconPath:
                    'M9.75 2.75a2.5 2.5 0 015 0v1.5a2.5 2.5 0 01-5 0v-1.5zM4 9a4 4 0 014-4h8a4 4 0 014 4v8a4 4 0 01-4 4H8a4 4 0 01-4-4V9z'
            },
            {
                id: 'folders',
                label: 'Carpetas',
                href: '/admin/super/carpetas',
                iconPath:
                    'M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z'
            }
        ]
    },
    {
        id: 'entities',
        label: 'Entidades',
        items: [
            {
                id: 'roles',
                label: 'Personas y Roles',
                href: '/admin/super/personas-roles',
                iconPath:
                    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
            },
            {
                id: 'news',
                label: 'Noticias',
                href: '/admin/super/noticias',
                iconPath:
                    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
            },
            {
                id: 'moderation',
                label: 'Moderacion / Auditoria',
                href: '/admin/super/moderacion',
                iconPath:
                    'M11 11V7a1 1 0 112 0v4a1 1 0 11-2 0zM10 15a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM12 2a9 9 0 00-9 9v2a9 9 0 006 8.485V22a1 1 0 002 0v-0.515A9 9 0 0021 13v-2a9 9 0 00-9-9z'
            }
        ]
    },
    {
        id: 'system',
        label: 'Sistema',
        items: [
            {
                id: 'sync',
                label: 'Fuentes / Sync API',
                href: '/admin/super/sync',
                iconPath:
                    'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
            }
        ]
    }
];

function Icon({ path }: { path: string }) {
    return (
        <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
        </svg>
    );
}

export default function SuperSidebar() {
    const pathname = usePathname();

    return (
        <aside className={styles.sidebar}>
            <div className={styles.brand}>
                <span className={styles.brandDot} />
                TECTONIC <span className={styles.brandTag}>V1</span>
            </div>

            <nav className={styles.nav}>
                {navGroups.map((group) => (
                    <div key={group.id} className={styles.navGroup}>
                        <div className={styles.navLabel}>{group.label}</div>
                        {group.items.map((item) => {
                            const isActive =
                                pathname === item.href ||
                                (item.href !== '/admin/super' && pathname.startsWith(item.href));
                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                >
                                    <Icon path={item.iconPath} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
