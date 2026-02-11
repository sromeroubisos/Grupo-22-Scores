import type { Metadata } from 'next';
import AdminWrapper from './AdminWrapper';

export const metadata: Metadata = {
    title: 'Admin Panel - G22 Scores',
    description: 'Panel de administración para gestión de torneos y partidos',
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AdminWrapper>
            {children}
        </AdminWrapper>
    );
}
