import type { Metadata } from 'next';
import AdminWrapper from './AdminWrapper';
import { Suspense } from 'react';

export const metadata: Metadata = {
    title: 'Admin Panel - G22 Scores',
    description: 'Panel de administración para gestión de torneos y partidos',
};

import { AdminConsoleProvider } from './AdminContext';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-system-secondary">Cargando...</div>}>
            <AdminConsoleProvider>
                <AdminWrapper>
                    {children}
                </AdminWrapper>
            </AdminConsoleProvider>
        </Suspense>
    );
}
