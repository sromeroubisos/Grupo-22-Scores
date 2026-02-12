'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { DisciplinasProvider } from './components/DisciplinasContext';
import styles from './layout.module.css';

const navItems = [
    { id: 'dashboard', label: 'Dashboard', href: '/club-admin' },
    { id: 'identidad', label: 'Identidad del Club', href: '/club-admin/identidad' },
    { id: 'disciplinas', label: 'Disciplinas', href: '/club-admin/disciplinas' },
    { id: 'divisiones', label: 'Divisiones / Equipos', href: '/club-admin/divisiones' },
    { id: 'planteles', label: 'Planteles', href: '/club-admin/planteles' },
    { id: 'staff', label: 'Staff', href: '/club-admin/staff' },
    { id: 'fixture', label: 'Partidos / Fixture', href: '/club-admin/fixture' },
    { id: 'estadisticas', label: 'Estadísticas', href: '/club-admin/estadisticas' },
    { id: 'documentos', label: 'Documentos', href: '/club-admin/documentos' },
    { id: 'comunicaciones', label: 'Comunicaciones', href: '/club-admin/comunicaciones' },
    { id: 'sponsors', label: 'Sponsors', href: '/club-admin/sponsors' },
    { id: 'usuarios', label: 'Usuarios y permisos', href: '/club-admin/usuarios' },
    { id: 'integraciones', label: 'Integraciones', href: '/club-admin/integraciones' },
    { id: 'auditoria', label: 'Auditoría', href: '/club-admin/auditoria' },
];

export default function ClubAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        } else if (!isLoading && isAuthenticated && user?.role !== 'admin_club' && user?.role !== 'admin_general' && user?.role !== 'entrenador') {
            router.push('/');
        }
    }, [isLoading, isAuthenticated, user, router]);

    if (isLoading || !isAuthenticated) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>Cargando...</div>;
    }

    const isActive = (href: string) => {
        if (!pathname) return false;
        if (href === '/club-admin') return pathname === href;
        return pathname.startsWith(href);
    };

    return (
        <DisciplinasProvider>
            <div className={styles.page}>
                <div className={styles.background} aria-hidden="true" />
                <div className={styles.layout}>
                    <aside className={styles.sidebar}>
                        <div className={styles.brand}>
                            <span className={styles.brandLogo} />
                            <span className={styles.brandName}>Club Admin</span>
                        </div>

                        <nav className={styles.nav}>
                            {navItems.map((item) => (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`${styles.navItem} ${isActive(item.href) ? styles.navItemActive : ''}`}
                                    aria-current={isActive(item.href) ? 'page' : undefined}
                                >
                                    <span className={styles.navIcon} />
                                    {item.label}
                                </Link>
                            ))}
                        </nav>

                        <div className={styles.sidebarFooter} />
                    </aside>

                    <main className={styles.main}>{children}</main>
                </div>
            </div>
        </DisciplinasProvider>
    );
}
