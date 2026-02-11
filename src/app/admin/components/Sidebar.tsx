'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';
import { useAuth } from '@/context/AuthContext';

type SidebarSection = 'dashboard' | 'tournaments' | 'my-tournaments' | 'matches' | 'results' | 'events' | 'export' | 'operators' | 'settings' | 'entities' | 'users' | 'integrations' | 'branding' | 'audit';

interface SidebarItem {
    id: SidebarSection;
    icon: string;
    label: string;
    badge?: number;
    href: string;
    roles: ('admin_general' | 'admin_union' | 'admin_torneo' | 'operador')[];
}

const sidebarItems: SidebarItem[] = [
    // System Admin Items
    { id: 'dashboard', icon: '📊', label: 'Dashboard', href: '/admin/super', roles: ['admin_general'] },
    { id: 'entities', icon: '🌐', label: 'Entidades Globales', href: '/admin/super/entidades', roles: ['admin_general'] },
    { id: 'users', icon: '👥', label: 'Usuarios', href: '/admin/users', roles: ['admin_general'] },
    { id: 'integrations', icon: '🔌', label: 'Integraciones', href: '/admin/super/integraciones', roles: ['admin_general'] },
    { id: 'branding', icon: '🎨', label: 'Branding', href: '/admin/super/branding', roles: ['admin_general'] },
    { id: 'audit', icon: '📜', label: 'Auditoría', href: '/admin/super/audit', roles: ['admin_general'] },

    // Tournament Admin / Operator Items
    { id: 'tournaments', icon: '🏆', label: 'Torneos (Global)', href: '/admin/torneos', roles: ['admin_general'] },
    { id: 'my-tournaments', icon: '📂', label: 'Mis Torneos', href: '/admin/mis-torneos', roles: ['admin_general', 'admin_union', 'admin_torneo'] },
    { id: 'matches', icon: '📅', label: 'Partidos', badge: 3, href: '/admin/super/partidos', roles: ['admin_general'] },
    { id: 'results', icon: '✅', label: 'Resultados', badge: 3, href: '/admin/super/resultados', roles: ['admin_general'] },
    { id: 'events', icon: '⚡', label: 'Eventos', href: '/admin/super/eventos', roles: ['admin_general'] },
    { id: 'export', icon: '📤', label: 'Exportar', href: '/admin/super/export', roles: ['admin_general'] },
    { id: 'operators', icon: '👥', label: 'Operadores', href: '/admin/super/operadores', roles: ['admin_general'] },
    { id: 'settings', icon: '⚙️', label: 'Configuración', href: '/admin/super/configuracion', roles: ['admin_general'] },
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
                            {user.role === 'admin_general' ? 'Admin. General' : user.role === 'admin_union' ? 'Admin. Unión' : user.role === 'admin_torneo' ? 'Admin. Torneo' : 'Operador'}
                        </span>
                    </div>
                </div>
                <button onClick={logout} className={styles.logoutBtn}>
                    Cerrar Sesión
                </button>
            </div>
        </aside>
    );
}
