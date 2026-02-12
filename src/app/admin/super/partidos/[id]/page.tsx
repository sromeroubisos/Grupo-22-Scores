'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function SuperadminMatchRedirect() {
    const router = useRouter();
    const params = useParams();
    const matchId = params?.id as string | undefined;

    useEffect(() => {
        if (!matchId) return;
        router.push(`/admin/matches/${matchId}`);
    }, [matchId, router]);

    return (
        <div style={{ padding: '40px', color: 'var(--color-text-secondary)' }}>
            Redirigiendo a la consola del partido...
        </div>
    );
}
