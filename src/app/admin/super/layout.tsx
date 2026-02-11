'use client';

import React from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
            <Sidebar />
            <main style={{ flex: 1, marginLeft: '260px', display: 'flex', flexDirection: 'column' }} className="admin-main">
                {children}
            </main>
            <style jsx global>{`
                @media (max-width: 768px) {
                    .admin-main {
                        margin-left: 0 !important;
                    }
                }
            `}</style>
        </div>
    );
}
