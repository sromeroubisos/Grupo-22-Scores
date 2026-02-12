'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import { useAuth } from '@/context/AuthContext';

type SidebarSection =
    | 'dashboard'
    | 'tournaments'
    | 'matches'
    | 'clubs'
    | 'players'
    | 'roles'
    | 'news'
    | 'moderation'
    | 'sync';

interface SidebarItem {
    id: SidebarSection;
    icon: string;
    label: string;
    badge?: number;
    href: string;
    roles: ('admin_general' | 'admin_union' | 'admin_torneo' | 'operador')[];
}

const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', icon: 'D', label: 'Dashboard', href: '/admin/super', roles: ['admin_general'] },
    { id: 'tournaments', icon: 'T', label: 'Torneos', href: '/admin/super/torneos', roles: ['admin_general'] },
    { id: 'matches', icon: 'M', label: 'Partidos', href: '/admin/super/partidos', roles: ['admin_general'] },
    { id: 'clubs', icon: 'C', label: 'Clubes', href: '/admin/super/clubes', roles: ['admin_general'] },
    { id: 'players', icon: 'J', label: 'Jugadores', href: '/admin/super/jugadores', roles: ['admin_general'] },
    { id: 'roles', icon: 'R', label: 'Personas y Roles', href: '/admin/super/personas-roles', roles: ['admin_general'] },
    { id: 'news', icon: 'N', label: 'Noticias', href: '/admin/super/noticias', roles: ['admin_general'] },
    { id: 'moderation', icon: 'A', label: 'Moderacion / Auditoria', href: '/admin/super/moderacion', roles: ['admin_general'] },
    { id: 'sync', icon: 'S', label: 'Fuentes / Sync API', href: '/admin/super/sync', roles: ['admin_general'] }
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    if (!user) return null;

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <Link href="/" className={styles.sidebarLogo}>
                    <span className={styles.logoIcon}>G22</span>
                    <span className={styles.logoText}>Admin</span>
                </Link>
            </div>

            <nav className={styles.sidebarNav}>
                {sidebarItems.map((item) => {
                    if (!item.roles.includes(user.role as any)) return null;

                    const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));

                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={`${styles.sidebarItem} ${isActive ? styles.active : ''}`}
                        >
                            <span className={styles.sidebarIcon}>{item.icon}</span>
                            <span className={styles.sidebarLabel}>{item.label}</span>
                            {item.badge && <span className={styles.sidebarBadge}>{item.badge}</span>}
                        </Link>
                    );
                })}
            </nav>

            <div className={styles.sidebarFooter}>
                <div className={styles.userInfo}>
                    <div className={styles.userAvatar}>{user.name.charAt(0)}</div>
                    <div className={styles.userDetails}>
                        <span className={styles.userName}>{user.name}</span>
                        <span className={styles.userRole}>
                            {user.role === 'admin_general'
                                ? 'Superadmin'
                                : user.role === 'admin_union'
                                    ? 'Admin Union'
                                    : user.role === 'admin_torneo'
                                        ? 'Admin Torneo'
                                        : 'Operador'}
                        </span>
                    </div>
                </div>
                <button onClick={logout} className={styles.logoutBtn}>
                    Cerrar Sesion
                </button>
            </div>
        </aside>
    );
}
