'use client';

import { useAuth } from '@/context/AuthContext';
import LoginScreen from './components/LoginScreen';
import AccessDenied from './components/AccessDenied';
import Sidebar from './components/Sidebar';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminWrapper({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isAuthenticated) {
            // Optional: Redirect to login or just show LoginScreen
            // router.push('/login'); 
        }
    }, [isAuthenticated, router]);

    const isMatchConsole = pathname?.startsWith('/admin/matches/');
    const isTournamentAdmin = pathname?.startsWith('/admin/torneo/');
    const isUnionAdmin = pathname?.startsWith('/admin/union/');
    const isDiscipline = pathname?.startsWith('/admin/disciplina/');
    const isSuperAdmin = pathname?.startsWith('/admin/super');
    const isDashboard = pathname === '/admin';

    const isAllowed = user && ['admin_general'].includes(user.role);

    if (!isAuthenticated && !isMatchConsole) {
        return <LoginScreen />;
    }

    if (isAuthenticated && !isAllowed && !isMatchConsole) {
        return (
            <div style={{ padding: '100px', textAlign: 'center' }}>
                <h1>Acceso Denegado</h1>
                <p>No tienes permisos para acceder al Panel de Federación.</p>
                {user?.role === 'admin_club' && (
                    <button
                        onClick={() => router.push('/club-admin')}
                        style={{ marginTop: '20px', padding: '10px 20px', background: 'var(--accent-bio)', color: '#000', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Ir al Panel de Club
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex w-full min-h-screen bg-background text-foreground">
            {!isMatchConsole && !isTournamentAdmin && !isUnionAdmin && !isDiscipline && !isSuperAdmin && <Sidebar />}
            <main className="flex-1 w-full min-w-0 flex flex-col">
                {children}
            </main>
        </div>
    );
}
