import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, type PlanTier } from '@/lib/billing/plans';
import CancelSubscriptionButton from './CancelSubscriptionButton';
import styles from './billing.module.css';

interface SubscriptionRow {
    id: string;
    plan: string;
    status: string;
    provider: string;
    provider_subscription_id: string | null;
    price_usd: number | null;
    price_ars: number | null;
    is_founder_price: boolean | null;
    current_period_end: string | null;
    cancelled_at: string | null;
    created_at: string;
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return iso;
    }
}

function statusLabel(status: string): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
    switch (status) {
        case 'active':
            return { label: 'Activa', tone: 'good' };
        case 'pending':
            return { label: 'Pendiente de pago', tone: 'warn' };
        case 'past_due':
            return { label: 'Pago atrasado', tone: 'warn' };
        case 'cancelled':
            return { label: 'Cancelada', tone: 'bad' };
        case 'expired':
            return { label: 'Vencida', tone: 'bad' };
        default:
            return { label: 'Inactiva', tone: 'neutral' };
    }
}

export default async function BillingPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        redirect('/login?returnTo=/billing');
    }

    const admin = createAdminClient();
    const { data: subs } = await admin
        .from('subscriptions')
        .select('id, plan, status, provider, provider_subscription_id, price_usd, price_ars, is_founder_price, current_period_end, cancelled_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const rows = (subs as SubscriptionRow[] | null) ?? [];
    const active = rows.find((r) => r.status === 'active' || r.status === 'pending');
    const history = rows.filter((r) => !active || r.id !== active.id);

    return (
        <div className={styles.page}>
            <div className={styles.inner}>
                <h1 className={styles.title}>Mi suscripción</h1>

                {!active && (
                    <div className={styles.empty}>
                        <p>No tenés ninguna suscripción activa.</p>
                        <Link href="/contacto#precios" className={styles.cta}>
                            Ver planes
                        </Link>
                    </div>
                )}

                {active && (
                    <div className={styles.card}>
                        <div className={styles.row}>
                            <span className={styles.label}>Plan</span>
                            <span className={styles.value}>
                                {PLANS[active.plan as PlanTier]?.name ?? active.plan}
                                {active.is_founder_price && (
                                    <span className={styles.founderBadge}>Fundador</span>
                                )}
                            </span>
                        </div>
                        <div className={styles.row}>
                            <span className={styles.label}>Estado</span>
                            <span className={`${styles.value} ${styles[`tone_${statusLabel(active.status).tone}`]}`}>
                                {statusLabel(active.status).label}
                            </span>
                        </div>
                        <div className={styles.row}>
                            <span className={styles.label}>Precio</span>
                            <span className={styles.value}>
                                USD {active.price_usd?.toFixed(2) ?? '—'}
                                {active.price_ars && (
                                    <span className={styles.muted}>
                                        {' '}· ~ARS {Math.round(active.price_ars).toLocaleString('es-AR')}
                                    </span>
                                )}
                                <span className={styles.muted}> / mes</span>
                            </span>
                        </div>
                        <div className={styles.row}>
                            <span className={styles.label}>
                                {active.status === 'active' ? 'Próximo cobro' : 'Vence'}
                            </span>
                            <span className={styles.value}>{fmtDate(active.current_period_end)}</span>
                        </div>
                        <div className={styles.row}>
                            <span className={styles.label}>Provider</span>
                            <span className={styles.value}>{active.provider}</span>
                        </div>

                        {active.status === 'pending' && (
                            <div className={styles.note}>
                                Tu suscripción está pendiente de autorización en MercadoPago.{' '}
                                <Link href={`/checkout/${active.plan}`}>Reintentar el pago</Link>.
                            </div>
                        )}

                        {(active.status === 'active' || active.status === 'pending') && (
                            <CancelSubscriptionButton subscriptionId={active.id} />
                        )}
                    </div>
                )}

                {history.length > 0 && (
                    <section className={styles.history}>
                        <h2 className={styles.historyTitle}>Historial</h2>
                        <ul className={styles.historyList}>
                            {history.map((row) => (
                                <li key={row.id} className={styles.historyItem}>
                                    <span>{PLANS[row.plan as PlanTier]?.name ?? row.plan}</span>
                                    <span className={styles[`tone_${statusLabel(row.status).tone}`]}>
                                        {statusLabel(row.status).label}
                                    </span>
                                    <span className={styles.muted}>{fmtDate(row.created_at)}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
}
