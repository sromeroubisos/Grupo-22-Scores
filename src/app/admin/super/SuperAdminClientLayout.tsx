'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import SuperSidebar from './SuperSidebar';
import styles from './layout.module.css';
import { SuperConsoleProvider, useSuperConsole } from './SuperConsoleContext';
import { findActiveSuperNavItem, superNavItems } from './navigation';
import { isGlobalAdminRole } from '@/lib/auth/roles';

function SuperTopbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
    const { filters, setFilters } = useSuperConsole();
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const pathname = usePathname();
    const activeNavItem = findActiveSuperNavItem(pathname);
    const activeTabRef = useRef<HTMLAnchorElement | null>(null);

    useEffect(() => {
        activeTabRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
        });
    }, [pathname]);

    return (
        <>
            <div className={styles.topbar}>
                <div className={styles.topbarRow}>
                    <button className={styles.mobileMenuBtn} onClick={onToggleSidebar} aria-label="Abrir menú">
                        <svg className={styles.mobileMenuIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>

                    <div className={styles.topbarLeft}>
                        <div className={styles.topbarTitle}>
                            {activeNavItem?.label || 'Consola Superadmin'}
                        </div>
                        <div className={styles.topbarSubtitle}>
                            {activeNavItem?.description || 'Catalogo maestro y operacion de datos'}
                        </div>
                    </div>

                    <div className={styles.mobileControls}>
                        <button className={styles.topbarBtn} onClick={() => setIsFilterOpen(true)} style={{ padding: '8px', borderRadius: '50%', background: 'transparent' }}>
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                        </button>
                    </div>

                    {/* Controles superiores removidos a petición del usuario */}
                </div>

                {/* Mobile Tabs Embedded in Header */}
                <div className={styles.mobileTabs} aria-label="Modulos del panel">
                    {superNavItems.map((tab) => (
                        <Link
                            key={tab.id}
                            href={tab.href}
                            prefetch={false}
                            ref={activeNavItem?.id === tab.id ? activeTabRef : null}
                            className={`${styles.mobileTab} ${activeNavItem?.id === tab.id ? styles.mobileTabActive : ''}`}
                        >
                            {tab.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Filter Sheet for Mobile */}
            {isFilterOpen && (
                <>
                    <div className={styles.filterOverlay} onClick={() => setIsFilterOpen(false)} />
                    <div className={styles.filterSheet}>
                        <div className={styles.filterSheetHeader}>
                            <h3 className={styles.filterSheetTitle}>Filtros</h3>
                            <button className={styles.closeBtn} onClick={() => setIsFilterOpen(false)}>✕</button>
                        </div>
                        <div className={styles.filterSheetContent}>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Buscar</label>
                                <input
                                    className={styles.topbarInput}
                                    placeholder="Buscar..."
                                    value={filters.search}
                                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Deporte</label>
                                <select
                                    className={styles.topbarSelect}
                                    value={filters.sport}
                                    onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="all">Todos los deportes</option>
                                    <option value="rugby">Rugby</option>
                                    <option value="football">Futbol</option>
                                    <option value="hockey">Hockey</option>
                                </select>
                            </div>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Pais</label>
                                <select
                                    className={styles.topbarSelect}
                                    value={filters.country}
                                    onChange={(event) => setFilters((prev) => ({ ...prev, country: event.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="all">Pais</option>
                                    <option value="Argentina">Argentina</option>
                                    <option value="Uruguay">Uruguay</option>
                                    <option value="Chile">Chile</option>
                                </select>
                            </div>
                            <div className={styles.filterGroup}>
                                <label className={styles.filterLabel}>Estado</label>
                                <select
                                    className={styles.topbarSelect}
                                    value={filters.status}
                                    onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                                    style={{ width: '100%' }}
                                >
                                    <option value="all">Estado</option>
                                    <option value="activo">Activo</option>
                                    <option value="finalizado">Finalizado</option>
                                    <option value="archivado">Archivado</option>
                                    <option value="pendiente">Pendiente</option>
                                </select>
                            </div>
                        </div>
                        <div className={styles.filterSheetActions}>
                            <button className={styles.btnSecondary} onClick={() => {
                                setFilters({ search: '', sport: 'all', country: 'all', status: 'all', source: 'all' });
                                setIsFilterOpen(false);
                            }}>Reset</button>
                            <button className={styles.topbarBtn} onClick={() => setIsFilterOpen(false)} style={{ flex: 1 }}>Aplicar Filtros</button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

export default function SuperAdminClientLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const isUnionManageRoute = /^\/admin\/super\/uniones\/[^/]+$/.test(pathname || '');
    const isAuthorized = isGlobalAdminRole(user?.role);

    useEffect(() => {
        if (isLoading) return; // Wait until auth state is resolved

        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        if (!isAuthorized) {
            router.push('/');
        }
    }, [isAuthenticated, isAuthorized, router, isLoading]);

    // Lock body scroll when mobile sidebar is open
    useEffect(() => {
        if (isSidebarOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isSidebarOpen]);

    if (!isAuthenticated || !isAuthorized) {
        return (
            <div style={{ padding: '50px', display: 'flex', justifyContent: 'center' }}>
                <div className="spinner"></div>
            </div>
        );
    }
    return (
        <SuperConsoleProvider>
            <div className={styles.layout}>
                <SuperSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                {isUnionManageRoute ? (
                    <main className={`${styles.main} ${styles.entityMain}`}>
                        <div className={styles.entityMobileBar}>
                            <button className={styles.mobileMenuBtn} onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menÃº">
                                <svg className={styles.mobileMenuIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <div className={styles.entityMobileLabel}>Union / Federacion</div>
                        </div>
                        <div className={styles.entityContent}>
                            {children}
                        </div>
                    </main>
                ) : (
                    <main className={styles.main}>
                        <SuperTopbar onToggleSidebar={() => setIsSidebarOpen(true)} />
                        <div className={styles.contentWrapper}>
                            {children}
                        </div>
                    </main>
                )}
            </div>
        </SuperConsoleProvider>
    );
}
