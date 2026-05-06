import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { getUserPlanContext } from '@/lib/billing/subscriptions';
import styles from './tournament-admin.module.css';

export const dynamic = 'force-dynamic';

function fmtLimit(n: number): string {
    return n >= Number.MAX_SAFE_INTEGER ? '∞' : String(n);
}

async function loadStats(scope: Awaited<ReturnType<typeof resolveTournamentAdminScope>>) {
    const supabase = await createClient();

    if (!scope.isUnlimited) {
        const tournamentIds = Array.from(scope.tournamentIds);
        const clubIds = Array.from(scope.clubIds);

        const tournamentsResult = tournamentIds.length > 0
            ? await supabase.from('tournaments').select('id, status').in('id', tournamentIds)
            : { data: [] as Array<{ id: string; status: string | null }>, error: null };

        const tournaments = tournamentsResult.data ?? [];
        return {
            clubs: clubIds.length,
            tournaments: tournaments.length,
            drafts: tournaments.filter((t) => t.status === 'draft').length,
        };
    }

    const [clubsCount, tournamentsCount, draftCount] = await Promise.all([
        supabase.from('clubs').select('id', { count: 'exact', head: true }),
        supabase.from('tournaments').select('id', { count: 'exact', head: true }),
        supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ]);

    return {
        clubs: clubsCount.count ?? 0,
        tournaments: tournamentsCount.count ?? 0,
        drafts: draftCount.count ?? 0,
    };
}

async function loadOwnedActiveTournaments(userId: string): Promise<number> {
    const supabase = await createClient();
    const { count } = await supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('created_by_user_id', userId)
        .neq('status', 'archived');
    return count ?? 0;
}

export default async function TournamentAdminHome() {
    const supabase = await createClient();
    const ctx = await requireTournamentAdminContext(supabase).catch(() => null);
    if (!ctx) return null;

    const scope = await resolveTournamentAdminScope(supabase, ctx);
    const [stats, planCtx, ownedActive] = await Promise.all([
        loadStats(scope).catch(() => ({ clubs: 0, tournaments: 0, drafts: 0 })),
        getUserPlanContext(supabase, ctx.userId, ctx.rawRole),
        loadOwnedActiveTournaments(ctx.userId).catch(() => 0),
    ]);
    const isUnlimited = scope.isUnlimited;
    const planLimits = planCtx.plan.limits;
    const atTournamentLimit = !planCtx.isUnlimited && ownedActive >= planLimits.maxActiveTournaments;
    const showUpgrade = !planCtx.isUnlimited && planCtx.tier !== 'organizacion';

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
                <Link href="/admin/torneo/clubes" className={styles.statCard}>
                    <p className={styles.statEyebrow}>Clubes</p>
                    <h2 className={styles.statValue}>{stats.clubs}</h2>
                    <p className={styles.statLabel}>
                        {isUnlimited
                            ? 'Total de clubes registrados en el sistema.'
                            : 'Clubes que creaste o sobre los que tenés acceso concedido.'}
                    </p>
                    <div className={styles.statCta}>Ir a Clubes →</div>
                </Link>

                <Link href="/admin/torneo/torneos" className={styles.statCard}>
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

                <Link
                    href={planCtx.subscriptionId ? '/billing' : '/contacto#precios'}
                    className={styles.statCard}
                >
                    <p className={styles.statEyebrow}>Plan</p>
                    <h2 className={styles.statValue}>{planCtx.plan.name}</h2>
                    <p className={styles.statLabel}>
                        {planCtx.isUnlimited
                            ? 'Acceso ilimitado (admin global).'
                            : `${ownedActive} / ${fmtLimit(planLimits.maxActiveTournaments)} torneos activos · hasta ${fmtLimit(planLimits.maxTeamsPerTournament)} equipos por torneo`}
                    </p>
                    <div className={styles.statCta}>
                        {planCtx.subscriptionId
                            ? 'Ver suscripción →'
                            : showUpgrade
                                ? 'Mejorar plan →'
                                : 'Ver planes →'}
                    </div>
                </Link>
            </div>

            {atTournamentLimit && (
                <section className={`${styles.dashboardSection}`} style={{ marginBottom: 16 }}>
                    <p className={styles.dashboardSectionTitle}>Llegaste al límite de tu plan</p>
                    <p className={styles.dashboardSectionBody}>
                        Tu plan <strong>{planCtx.plan.name}</strong> permite hasta {fmtLimit(planLimits.maxActiveTournaments)}{' '}
                        {planLimits.maxActiveTournaments === 1 ? 'torneo activo' : 'torneos activos'}.{' '}
                        <Link href="/contacto#precios" style={{ color: 'var(--accent-cyan)' }}>
                            Pasate a un plan superior
                        </Link>{' '}
                        para crear más.
                    </p>
                </section>
            )}

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
