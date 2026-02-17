'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link'; // Added Link import
import SuperSidebar from './SuperSidebar';
import styles from './layout.module.css';
import { SuperConsoleProvider, useSuperConsole } from './SuperConsoleContext';

function SuperTopbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
    const { filters, setFilters } = useSuperConsole();
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const pathname = usePathname();

    // Mobile Tabs Configuration
    const mobileTabs = [
        { id: 'dashboard', label: 'Dashboard', href: '/admin/super' },
        { id: 'torneos', label: 'Torneos', href: '/admin/super/torneos' },
        { id: 'partidos', label: 'Partidos', href: '/admin/super/partidos' },
        { id: 'clubes', label: 'Clubes', href: '/admin/super/clubes' },
        { id: 'jugadores', label: 'Jugadores', href: '/admin/super/jugadores' },
        { id: 'noticias', label: 'Noticias', href: '/admin/super/noticias' },
    ];

    const isActive = (href: string) => {
        if (href === '/admin/super') return pathname === href;
        return pathname?.startsWith(href);
    };

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
                            {/* Dynamic Title based on Path */}
                            {mobileTabs.find(t => isActive(t.href))?.label || 'Consola Superadmin'}
                        </div>
                        <div className={styles.topbarSubtitle}>Catalogo maestro y operacion de datos</div>
                    </div>

                    <div className={styles.mobileControls}>
                        <button className={styles.topbarBtn} onClick={() => setIsFilterOpen(true)} style={{ padding: '8px', borderRadius: '50%', background: 'transparent' }}>
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                        </button>
                    </div>

                    <div className={styles.topbarControls}>
                        <select
                            className={styles.topbarSelect}
                            value={filters.sport}
                            onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}
                        >
                            <option value="all">Todos los deportes</option>
                            <option value="rugby">Rugby</option>
                            <option value="football">Futbol</option>
                            <option value="hockey">Hockey</option>
                        </select>
                        <input
                            className={styles.topbarInput}
                            placeholder="Buscar en toda la consola..."
                            value={filters.search}
                            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                        />
                        <select
                            className={styles.topbarSelect}
                            value={filters.country}
                            onChange={(event) => setFilters((prev) => ({ ...prev, country: event.target.value }))}
                        >
                            <option value="all">Pais</option>
                            <option value="Argentina">Argentina</option>
                            <option value="Uruguay">Uruguay</option>
                            <option value="Chile">Chile</option>
                        </select>
                        <select
                            className={styles.topbarSelect}
                            value={filters.status}
                            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            <option value="all">Estado</option>
                            <option value="activo">Activo</option>
                            <option value="finalizado">Finalizado</option>
                            <option value="archivado">Archivado</option>
                            <option value="pendiente">Pendiente</option>
                        </select>
                        <select
                            className={styles.topbarSelect}
                            value={filters.source}
                            onChange={(event) => setFilters((prev) => ({ ...prev, source: event.target.value }))}
                        >
                            <option value="all">Fuente</option>
                            <option value="API">API</option>
                            <option value="Manual">Manual</option>
                        </select>
                        <button className={styles.topbarBtn}>+ Crear</button>
                        <div className={styles.topbarAlert}>3 conflictos</div>
                    </div>
                </div>

                {/* Mobile Tabs Embedded in Header */}
                <div className={styles.mobileTabs}>
                    {mobileTabs.map(tab => (
                        <Link key={tab.id} href={tab.href} className={`${styles.mobileTab} ${isActive(tab.href) ? styles.mobileTabActive : ''}`}>
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

export default function GlobalAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isAuthorized, setIsAuthorized] = React.useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        if (user?.role === 'admin_general') {
            setIsAuthorized(true);
        } else {
            router.push('/');
        }
    }, [isAuthenticated, user, router]);

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
                <main className={styles.main}>
                    <SuperTopbar onToggleSidebar={() => setIsSidebarOpen(true)} />
                    <div className={styles.contentWrapper}>
                        {children}
                    </div>
                </main>
            </div>
        </SuperConsoleProvider>
    );
}
