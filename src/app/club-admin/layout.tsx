'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { DisciplinasProvider } from './components/DisciplinasContext';
import { ManagedClubProvider, useManagedClubContext } from './components/ManagedClubContext';
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

function ClubAdminScaffold({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const {
        clubs,
        activeClub,
        activeClubId,
        loading,
        error,
        setActiveClubId,
    } = useManagedClubContext();

    const isActive = (href: string) => {
        if (!pathname) return false;
        if (href === '/club-admin') return pathname === href;
        return pathname.startsWith(href);
    };

    const buildHref = (href: string) => {
        if (!activeClubId) return href;
        return `${href}?club=${encodeURIComponent(activeClubId)}`;
    };

    return (
        <div className={styles.page}>
            <div className={styles.background} aria-hidden="true" />
            <div className={styles.layout}>
                <aside className={styles.sidebar}>
                    <div className={styles.brand}>
                        <span className={styles.brandLogo} />
                        <span className={styles.brandName}>Club Admin</span>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            padding: '0.75rem',
                            border: '1px solid var(--club-stroke)',
                            borderRadius: '14px',
                            background: 'var(--club-panel-inner)',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            Club activo
                        </span>
                        {loading ? (
                            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                Resolviendo familia...
                            </span>
                        ) : clubs.length > 1 ? (
                            <select
                                value={activeClubId || ''}
                                onChange={(event) => setActiveClubId(event.target.value)}
                                style={{
                                    width: '100%',
                                    borderRadius: '12px',
                                    border: '1px solid var(--club-stroke)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: 'var(--color-text-primary)',
                                    padding: '0.8rem 0.9rem',
                                    fontSize: '0.95rem',
                                }}
                            >
                                {clubs.map((club) => (
                                    <option key={club.id} value={club.id}>
                                        {club.familyRootId === club.id ? 'Base' : 'Derivado'} · {club.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <strong style={{ fontSize: '0.95rem' }}>
                                    {activeClub?.name || 'Sin club activo'}
                                </strong>
                                {activeClub?.familyRootName && activeClub.familyRootName !== activeClub.name && (
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                        Familia {activeClub.familyRootName}
                                    </span>
                                )}
                                {activeClub && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                                        Gestión {activeClub.managementType === 'club_family' ? 'por familia de club' : 'por club'}
                                    </span>
                                )}
                            </div>
                        )}
                        {error && (
                            <span style={{ fontSize: '0.75rem', color: '#fca5a5' }}>
                                {error}
                            </span>
                        )}
                    </div>

                    <nav className={styles.nav}>
                        {navItems.map((item) => (
                            <Link
                                key={item.id}
                                href={buildHref(item.href)}
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
    );
}

export default function ClubAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const hasClubMembership = Boolean(
        user?.memberships?.some((membership) =>
            ['club', 'club_family'].includes(membership.scopeType) &&
            ['admin', 'operator', 'editor'].includes(membership.role)
        )
    );
    const canAccessClubPanel = Boolean(
        user?.role === 'admin_club' ||
        user?.role === 'admin_general' ||
        user?.role === 'entrenador' ||
        hasClubMembership
    );

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        } else if (!isLoading && isAuthenticated && !canAccessClubPanel) {
            router.push('/');
        }
    }, [isLoading, isAuthenticated, canAccessClubPanel, router]);

    if (isLoading || !isAuthenticated) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>Cargando...</div>;
    }

    return (
        <ManagedClubProvider>
            <DisciplinasProvider>
                <ClubAdminScaffold>{children}</ClubAdminScaffold>
            </DisciplinasProvider>
        </ManagedClubProvider>
    );
}
