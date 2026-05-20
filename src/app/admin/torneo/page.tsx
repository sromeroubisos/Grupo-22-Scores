import Link from 'next/link';
import { ArrowUpRight, ChevronDown, ChevronRight, Info, Plus, Shield, Upload } from 'lucide-react';
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
                <p className={styles.pageSubtitle}>Gestioná tus clubes y torneos asignados.</p>
            </header>

            <div className={styles.statsGrid}>
                <Link href="/admin/torneo/clubes" prefetch={false} className={styles.statCard}>
                    <ArrowUpRight className={styles.statArrow} size={16} aria-hidden />
                    <p className={styles.statEyebrow}>Clubes</p>
                    <h2 className={styles.statValue}>{stats.clubs}</h2>
                    <p className={styles.statLabel}>
                        {isUnlimited ? 'Total del sistema' : 'Con acceso concedido'}
                    </p>
                </Link>

                <Link href="/admin/torneo/torneos" prefetch={false} className={styles.statCard}>
                    <ArrowUpRight className={styles.statArrow} size={16} aria-hidden />
                    <p className={styles.statEyebrow}>Torneos</p>
                    <h2 className={styles.statValue}>{stats.tournaments}</h2>
                    <p className={styles.statLabel}>{stats.drafts} en borrador</p>
                </Link>
            </div>

            <section className={styles.quickAccess}>
                <h2 className={styles.quickAccessTitle}>
                    Accesos rápidos
                    <span className={styles.quickAccessRule} aria-hidden />
                </h2>
                <div className={styles.quickAccessList}>
                    <Link
                        href="/admin/torneo/torneos/crear"
                        prefetch={false}
                        className={`${styles.quickAction} ${styles.quickActionPrimary}`}
                    >
                        <span className={styles.quickActionMain}>
                            <Plus size={20} aria-hidden />
                            <span>Crear torneo</span>
                        </span>
                        <ChevronRight size={18} aria-hidden className={styles.quickActionChevron} />
                    </Link>
                    <Link href="/admin/torneo/clubes/crear" prefetch={false} className={styles.quickAction}>
                        <span className={styles.quickActionMain}>
                            <Shield size={20} aria-hidden className={styles.quickActionIconAccent} />
                            <span>Crear club</span>
                        </span>
                        <ChevronRight size={18} aria-hidden className={styles.quickActionChevron} />
                    </Link>
                    <Link href="/admin/torneo/importar" prefetch={false} className={styles.quickAction}>
                        <span className={styles.quickActionMain}>
                            <Upload size={20} aria-hidden />
                            <span>Importar Excel</span>
                        </span>
                        <ChevronRight size={18} aria-hidden className={styles.quickActionChevron} />
                    </Link>
                </div>
            </section>

            <details className={styles.aboutPanel}>
                <summary className={styles.aboutPanelSummary}>
                    <span className={styles.aboutPanelSummaryLabel}>
                        <Info size={15} aria-hidden />
                        Sobre este panel
                    </span>
                    <ChevronDown size={16} aria-hidden className={styles.aboutPanelChevron} />
                </summary>
                <p className={styles.aboutPanelBody}>
                    {isUnlimited
                        ? 'Tu sesión actual ve absolutamente todo (super admin / admin general).'
                        : 'Ves únicamente los clubes y torneos que creaste o que un Super Admin te concedió desde Personas y Roles. Pedí acceso adicional al equipo central si necesitás más alcance.'}
                </p>
            </details>

            <p className={styles.versionTag}>G22 Scores</p>
        </div>
    );
}
