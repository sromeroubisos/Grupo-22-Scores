'use client';

import React from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function UsersLayout({ children }: { children: React.ReactNode }) {
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
            router.push('/admin');
        }
    }, [isAuthenticated, user, router]);

    if (!isAuthenticated || !isAuthorized) {
        return <div style={{ padding: '50px', display: 'flex', justifyContent: 'center' }}>Processing...</div>;
    }
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
            {/* Sidebar managed by AdminWrapper */}
            <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {children}
            </main>
        </div>
    );
}
