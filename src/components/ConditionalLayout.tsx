'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { SportProvider } from '@/context/SportContext';
import { useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './ConditionalLayout.module.css';

interface ConditionalLayoutProps {
    children: React.ReactNode;
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();
    const isCoachPanel = pathname?.startsWith('/entrenador');
    const isManagementPage = pathname?.startsWith('/admin') || pathname?.startsWith('/club-admin') || isCoachPanel;

    useEffect(() => {
        if (!isLoading && isManagementPage && !isAuthenticated) {
            router.push('/login');
        }
    }, [isLoading, isManagementPage, isAuthenticated, router]);

    if (isManagementPage) {
        return (
            <>
                {!isCoachPanel && <Header />}
                {children}
            </>
        );
    }

    return (
        <SportProvider>
            <Header />
            <div className={styles.layoutContainer}>
                {/* Sidebar removed as per user request to move it to page level */}
                <main className={styles.mainContent}>{children}</main>
            </div>
            <Footer />
            <MobileBottomNav />
        </SportProvider>
    );
}
