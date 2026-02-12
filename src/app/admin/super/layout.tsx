'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import SuperSidebar from './SuperSidebar';
import styles from './layout.module.css';
import { SuperConsoleProvider, useSuperConsole } from './SuperConsoleContext';

function SuperTopbar() {
    const { filters, setFilters } = useSuperConsole();

    return (
        <div className={styles.topbar}>
            <div className={styles.topbarLeft}>
                <div className={styles.topbarTitle}>Consola Superadmin</div>
                <div className={styles.topbarSubtitle}>Catalogo maestro y operacion de datos</div>
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
    );
}

export default function GlobalAdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();

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
                <SuperSidebar />
                <main className={styles.main}>
                    <SuperTopbar />
                    {children}
                </main>
            </div>
        </SuperConsoleProvider>
    );
}
