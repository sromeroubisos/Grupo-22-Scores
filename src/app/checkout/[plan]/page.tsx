import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
    PLANS,
    FOUNDER_PROMO_ENABLED,
    FOUNDER_PROMO_MONTHS,
    isPurchasablePlan,
    getEffectivePriceUsd,
    type PlanTier,
} from '@/lib/billing/plans';
import { getUserPlanContext } from '@/lib/billing/subscriptions';
import CheckoutButton from './CheckoutButton';
import styles from './checkout.module.css';

interface CheckoutPageProps {
    params: Promise<{ plan: string }>;
    searchParams: Promise<{ status?: string; reason?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
    const { plan: rawPlan } = await params;
    const { status: statusParam } = await searchParams;
    const plan = rawPlan as PlanTier;

    if (!isPurchasablePlan(plan)) {
        if (plan === 'organizacion') {
            redirect('/contacto#contacto');
        }
        redirect('/contacto#precios');
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/login?returnTo=${encodeURIComponent(`/checkout/${plan}`)}`);
    }

    const planDef = PLANS[plan];
    const priceUsd = getEffectivePriceUsd(plan);
    const isFounder = FOUNDER_PROMO_ENABLED && planDef.founderPriceUsd != null;

    // Si ya tiene una suscripción activa al mismo o mejor plan, mostrar mensaje.
    const planCtx = await getUserPlanContext(supabase, user.id);
    const planRank: Record<PlanTier, number> = { free: 0, inicial: 1, pro: 2, organizacion: 3 };
    const alreadyHasEqualOrBetter =
        planCtx.status === 'active' && planRank[planCtx.tier] >= planRank[plan];

    const showCancelled = statusParam === 'cancelled' || statusParam === 'failure';
    const showPending = statusParam === 'pending';

    return (
        <div className={styles.page}>
            <div className={styles.inner}>
                <Link href="/contacto#precios" className={styles.back}>
                    ← Volver a planes
                </Link>

                {showCancelled && (
                    <div className={`${styles.banner} ${styles.bannerWarn}`}>
                        El pago fue cancelado o falló. Podés reintentarlo cuando quieras.
                    </div>
                )}
                {showPending && (
                    <div className={`${styles.banner} ${styles.bannerInfo}`}>
                        Tu pago está pendiente de acreditación. Te notificamos cuando se confirme.
                    </div>
                )}
                {alreadyHasEqualOrBetter && (
                    <div className={`${styles.banner} ${styles.bannerInfo}`}>
                        Ya tenés el plan <strong>{planCtx.plan.name}</strong> activo.{' '}
                        <Link href="/billing">Ver mi suscripción</Link>.
                    </div>
                )}

                <h1 className={styles.title}>Contratar {planDef.name}</h1>
                <p className={styles.subtitle}>{planDef.tagline}</p>

                <div className={styles.summary}>
                    <h2 className={styles.summaryTitle}>Resumen</h2>
                    <ul className={styles.summaryList}>
                        {planDef.features.map((f) => (
                            <li key={f}>• {f}</li>
                        ))}
                    </ul>

                    <div className={styles.priceRow}>
                        <span className={styles.priceLabel}>Total mensual</span>
                        <div className={styles.priceWrap}>
                            {isFounder && planDef.founderPriceUsd !== planDef.listPriceUsd && (
                                <span className={styles.priceListed}>USD {planDef.listPriceUsd}</span>
                            )}
                            <span className={styles.price}>USD {priceUsd}</span>
                            <span className={styles.pricePeriod}>/ mes</span>
                        </div>
                    </div>
                    {isFounder && (
                        <p className={styles.founderNote}>
                            Precio fundador por {FOUNDER_PROMO_MONTHS} meses. Después del período promocional pasa a USD {planDef.listPriceUsd}/mes.
                        </p>
                    )}
                    <p className={styles.fxNote}>
                        Se cobra en pesos al tipo de cambio del día vía MercadoPago.
                    </p>
                </div>

                <CheckoutButton
                    plan={plan}
                    disabled={alreadyHasEqualOrBetter}
                />

                <p className={styles.terms}>
                    Al contratar aceptás los términos del servicio. Podés cancelar cuando quieras desde tu panel de suscripción.
                </p>
            </div>
        </div>
    );
}
