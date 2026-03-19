'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function SuperadminTournamentRedirect() {
    const router = useRouter();
    const params = useParams();
    const tournamentId = params?.id as string | undefined;

    useEffect(() => {
        if (!tournamentId) return;
        router.push(`/admin/super/torneos/crear?tournamentId=${tournamentId}`);
    }, [tournamentId, router]);

    return (
        <div style={{ padding: '40px', color: 'var(--color-text-secondary)' }}>
            Redirigiendo a la edición del torneo...
        </div>
    );
}
