'use client';

import { useState } from 'react';
import type { PlanTier } from '@/lib/billing/plans';
import styles from './checkout.module.css';

interface CheckoutButtonProps {
    plan: PlanTier;
    disabled?: boolean;
}

export default function CheckoutButton({ plan, disabled }: CheckoutButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClick = async () => {
        if (loading || disabled) return;
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/checkout/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan }),
            });

            const body = await res.json().catch(() => null);

            if (!res.ok || !body?.checkoutUrl) {
                setError(body?.error || 'No pudimos iniciar el pago. Intentá de nuevo en unos minutos.');
                setLoading(false);
                return;
            }

            window.location.assign(body.checkoutUrl);
        } catch {
            setError('Error de red. Verificá tu conexión y reintentá.');
            setLoading(false);
        }
    };

    return (
        <div className={styles.ctaWrap}>
            <button
                type="button"
                className={styles.cta}
                onClick={handleClick}
                disabled={loading || disabled}
            >
                {loading ? 'Redirigiendo…' : 'Pagar con MercadoPago'}
            </button>
            {error && <p className={styles.errorMsg}>{error}</p>}
        </div>
    );
}
