'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import WorldCupTicker from '@/components/WorldCupTicker';
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
    const isManagementPage = pathname?.startsWith('/admin');
    const isOnboardingPage = pathname?.startsWith('/onboarding');
    const isClubAdminPage = pathname?.startsWith('/club-admin');
    const returnTo = pathname || '/';

    useEffect(() => {
        if (isLoading) return;

        if (isManagementPage && !isAuthenticated) {
            router.push('/login');
            return;
        }

        // Redirect to onboarding if authenticated but onboarding not completed
        if (
            isAuthenticated &&
            user &&
            user.onboardingCompleted === false &&
            !isOnboardingPage
        ) {
            router.push(`/onboarding/preferences?returnTo=${encodeURIComponent(returnTo)}`);
        }
    }, [isLoading, isManagementPage, isAuthenticated, user, isOnboardingPage, returnTo, router]);

    // Onboarding pages get a blank layout (no header/footer/nav)
    if (isOnboardingPage) {
        return (
            <SportProvider>
                {children}
            </SportProvider>
        );
    }

    if (isManagementPage) {
        return (
            <SportProvider>
                <Header />
                {children}
            </SportProvider>
        );
    }

    if (isClubAdminPage) {
        return (
            <SportProvider>
                <Header />
                <WorldCupTicker />
                <div className={styles.layoutContainer}>
                    <main className={styles.mainContent}>{children}</main>
                </div>
                <MobileBottomNav />
            </SportProvider>
        );
    }

    return (
        <SportProvider>
            <Header />
            <WorldCupTicker />
            <div className={styles.layoutContainer}>
                {/* Sidebar removed as per user request to move it to page level */}
                <main className={styles.mainContent}>{children}</main>
            </div>
            <Footer />
            <MobileBottomNav />
        </SportProvider>
    );
}
