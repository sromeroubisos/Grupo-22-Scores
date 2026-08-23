'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav, { BOTTOM_NAV_HIDDEN_PREFIXES } from '@/components/MobileBottomNav';
import WorldCupTicker from '@/components/WorldCupTicker';
import ClubsPromoBar from '@/components/clubs-promo/ClubsPromoBar';
import ProdeWorldCupBanner from '@/components/ProdeWorldCupBanner';
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
    // Pantalla full-screen del Prode Mundial: trae su propio fondo y bottom nav,
    // así que va sin el chrome global (header/ticker/nav/footer).
    const isProdeFullScreen = pathname === '/prode/mundial';
    /**
     * Carrera de Rugby: la pantalla de juego entra ENTERA en el viewport y no
     * scrollea. Conserva el header (la navegación del sitio sigue disponible)
     * pero va sin footer ni nav inferior: son 246 px de pie institucional y 78
     * de barra fija que, debajo de un juego, sólo empujan la decisión fuera de
     * pantalla. No es full-screen como el Prode Mundial — es una rama propia
     * porque el header se queda.
     */
    const isFullHeightGame = pathname?.startsWith('/juegos/minijuegos/carrera-rugby') ?? false;
    /**
     * La barra inferior NO se dibuja en esta ruta, así que el pie que la reserva
     * tampoco corresponde.
     *
     * `.mainContent` reserva `--mobile-nav-height` abajo de 900 px para que la
     * barra no tape el final del contenido. La barra decide en su propio archivo
     * dónde no aparecer (`BOTTOM_NAV_HIDDEN_PREFIXES`) y la reserva no se
     * enteraba: en El Capitán eran 74 px de nada al final de cada pantalla —el
     * 9% del lienzo de un teléfono— y era todo lo que separaba a la pantalla de
     * juego de no scrollear.
     */
    const sinBarraInferior = BOTTOM_NAV_HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix)) ?? false;
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
    if (isOnboardingPage || isProdeFullScreen) {
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

    if (isFullHeightGame) {
        return (
            <SportProvider>
                <Header />
                {/* `data-full-height` es el gancho para que globals.css le dé
                    alto REAL a html y body SÓLO en esta ruta. Sin eso el shell
                    hereda `min-height: 100vh` del body, que dentro de un root
                    con `zoom: 0.7` resuelve al viewport SIN zoom y deja el
                    contenedor un 30% corto. */}
                <main className={styles.gameContent} data-full-height="">{children}</main>
            </SportProvider>
        );
    }

    return (
        <SportProvider>
            <Header />
            <WorldCupTicker />
            <div className={styles.layoutContainer}>
                {/* Sidebar removed as per user request to move it to page level */}
                <main className={styles.mainContent} data-sin-barra={sinBarraInferior ? '' : undefined}>
                    {children}
                </main>
            </div>
            <Footer />
            <MobileBottomNav />
            {/*
                La barra de clubes va SÓLO en la rama pública: no en el gestor,
                no en el club-admin, no en el onboarding y no en los minijuegos
                a pantalla completa. A quien ya está adentro trabajando no se le
                vende la plataforma que está usando.

                No la reserva nadie con padding y no hace falta: es `fixed`, así
                que no empuja un píxel de contenido ni suma CLS.
            */}
            <ClubsPromoBar />
            <ProdeWorldCupBanner />
        </SportProvider>
    );
}
