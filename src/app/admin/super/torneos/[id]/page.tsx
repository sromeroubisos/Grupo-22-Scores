'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/mock-db';

export default function SuperadminTournamentRedirect() {
    const router = useRouter();
    const params = useParams();
    const tournamentId = params?.id as string | undefined;

    useEffect(() => {
        if (!tournamentId) return;
        const tournament = db.tournaments.find(t => t.id === tournamentId);
        if (!tournament) return;
        router.push(`/admin/union/${tournament.unionId}/torneos/crear?tournamentId=${tournamentId}&from=super`);
    }, [tournamentId, router]);

    return (
        <div style={{ padding: '40px', color: 'var(--color-text-secondary)' }}>
            Redirigiendo a la edicion del torneo...
        </div>
    );
}
