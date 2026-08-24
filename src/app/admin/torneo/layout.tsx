import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireRequestTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveAdminGuardRedirect } from '@/lib/auth/adminGuardRedirect';
import { jakarta, mono } from './fonts';
import TournamentAdminSidebar from './components/TournamentAdminSidebar';
import styles from './tournament-admin.module.css';

export const metadata: Metadata = {
    title: 'Panel Torneos | Vitreous Basalt',
    description: 'Panel del Administrador de Torneos: clubes y torneos.',
};

export default async function TournamentAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    try {
        // Memoizado: /admin/layout.tsx ya resolvio el contexto en este mismo render.
        await requireRequestTournamentAdminContext();
    } catch (error) {
        redirect(await resolveAdminGuardRedirect(error));
    }

    return (
        <div className={`${styles.shell} ${jakarta.variable} ${mono.variable}`}>
            <div className={styles.scaffoldTop} aria-hidden />
            <div className={styles.scaffoldCorner} aria-hidden />
            <TournamentAdminSidebar />
            <main className={styles.main}>
                {children}
            </main>
            {/* Portal target for modals/overlays. Child of .shell so it
                inherits the theme CSS variables, but a sibling of .main so
                it escapes .main's stacking context (position:relative;
                z-index:10) that otherwise traps fixed dialogs below the
                global header. .shell itself is not a stacking context. */}
            <div id="torneo-overlay-root" />
        </div>
    );
}
