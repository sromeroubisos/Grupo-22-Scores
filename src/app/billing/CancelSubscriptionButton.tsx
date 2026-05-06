'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './billing.module.css';

interface Props {
    subscriptionId: string;
}

export default function CancelSubscriptionButton({ subscriptionId }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    const onCancel = async () => {
        if (loading) return;
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/billing/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscriptionId }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                setError(body?.error || 'No pudimos cancelar la suscripción.');
                setLoading(false);
                return;
            }
            router.refresh();
        } catch {
            setError('Error de red.');
            setLoading(false);
        }
    };

    if (!confirming) {
        return (
            <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setConfirming(true)}
            >
                Cancelar suscripción
            </button>
        );
    }

    return (
        <div className={styles.cancelConfirm}>
            <p>¿Seguro? Vas a perder los beneficios del plan al final del período.</p>
            <div className={styles.cancelActions}>
                <button
                    type="button"
                    className={styles.cancelBtnDanger}
                    onClick={onCancel}
                    disabled={loading}
                >
                    {loading ? 'Cancelando…' : 'Sí, cancelar'}
                </button>
                <button
                    type="button"
                    className={styles.cancelBtnGhost}
                    onClick={() => setConfirming(false)}
                    disabled={loading}
                >
                    No, mantener
                </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
        </div>
    );
}
