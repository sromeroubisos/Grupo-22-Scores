import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
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
    const supabase = await createClient();

    try {
        await requireTournamentAdminContext(supabase);
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
        </div>
    );
}
