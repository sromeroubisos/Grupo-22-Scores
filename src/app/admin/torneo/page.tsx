import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import styles from './tournament-admin.module.css';

export const dynamic = 'force-dynamic';

async function loadStats(scope: Awaited<ReturnType<typeof resolveTournamentAdminScope>>) {
    const supabase = await createClient();
    // Service-role: the RLS SELECT policy hides drafts, which would make the
    // "X en borrador" / totals read 0 for a gestor. Scope is enforced by the
    // .in(scope.*Ids) filter below; unlimited = global admin (sees all anyway).
    const reader = getServiceWriter(supabase, 'admin/torneo (home stats)');

    if (!scope.isUnlimited) {
        const tournamentIds = Array.from(scope.tournamentIds);
        const clubIds = Array.from(scope.clubIds);

        const tournamentsResult = tournamentIds.length > 0
            ? await reader.from('tournaments').select('id, status').in('id', tournamentIds)
            : { data: [] as Array<{ id: string; status: string | null }>, error: null };

        const tournaments = tournamentsResult.data ?? [];
        return {
            clubs: clubIds.length,
            tournaments: tournaments.length,
            drafts: tournaments.filter((t) => t.status === 'draft').length,
        };
    }

    const [clubsCount, tournamentsCount, draftCount] = await Promise.all([
        reader.from('clubs').select('id', { count: 'exact', head: true }),
        reader.from('tournaments').select('id', { count: 'exact', head: true }),
        reader.from('tournaments').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ]);

    return {
        clubs: clubsCount.count ?? 0,
        tournaments: tournamentsCount.count ?? 0,
        drafts: draftCount.count ?? 0,
    };
}

export default async function TournamentAdminHome() {
    const supabase = await createClient();
    const ctx = await requireTournamentAdminContext(supabase).catch(() => null);
    if (!ctx) return null;

    const scope = await resolveTournamentAdminScope(supabase, ctx);
    const stats = await loadStats(scope).catch(() => ({ clubs: 0, tournaments: 0, drafts: 0 }));
    const isUnlimited = scope.isUnlimited;

    return (
        <div>
            <header className={styles.pageHeader}>
                <div className={styles.eyebrow}>
                    <div className={styles.eyebrowDash} />
                    <span className={styles.eyebrowLabel}>Admin View</span>
                </div>
                <h1 className={styles.pageTitle}>Inicio</h1>
                <p className={styles.pageSubtitle}>
                    Centro de mando del Administrador de Torneos. Operás solo sobre los clubes y
                    torneos que creás vos o que el Super Admin te concedió.
                </p>
            </header>

            <div className={styles.statsGrid}>
                <Link href="/admin/torneo/clubes" prefetch={false} className={styles.statCard}>
                    <p className={styles.statEyebrow}>Clubes</p>
                    <h2 className={styles.statValue}>{stats.clubs}</h2>
                    <p className={styles.statLabel}>
                        {isUnlimited
                            ? 'Total de clubes registrados en el sistema.'
                            : 'Clubes que creaste o sobre los que tenés acceso concedido.'}
                    </p>
                    <div className={styles.statCta}>Ir a Clubes →</div>
                </Link>

                <Link href="/admin/torneo/torneos" prefetch={false} className={styles.statCard}>
                    <p className={styles.statEyebrow}>Torneos</p>
                    <h2 className={styles.statValue}>{stats.tournaments}</h2>
                    <p className={styles.statLabel}>
                        {stats.drafts} en borrador ·{' '}
                        {isUnlimited
                            ? 'Total de torneos registrados.'
                            : 'Solo torneos accesibles para tu cuenta.'}
                    </p>
                    <div className={styles.statCta}>Ir a Torneos →</div>
                </Link>
            </div>

            <section className={styles.dashboardSection}>
                <p className={styles.dashboardSectionTitle}>Sobre este panel</p>
                <p className={styles.dashboardSectionBody}>
                    {isUnlimited
                        ? 'Tu sesión actual ve absolutamente todo (super admin / admin general).'
                        : 'Ves únicamente los clubes y torneos que creaste o que un Super Admin te concedió desde Personas y Roles. Pedí acceso adicional al equipo central si necesitás más alcance.'}
                </p>
            </section>
        </div>
    );
}
