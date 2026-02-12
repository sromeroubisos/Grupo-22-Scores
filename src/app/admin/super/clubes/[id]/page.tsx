'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/mock-db';

export default function SuperadminClubEditRedirect() {
    const router = useRouter();
    const params = useParams();
    const clubId = params?.id as string | undefined;

    useEffect(() => {
        if (!clubId) return;
        const club = db.clubs.find((c) => c.id === clubId);
        if (!club) return;
        router.push(`/admin/union/${club.unionId}/clubes/crear?clubId=${clubId}&from=super`);
    }, [clubId, router]);

    return (
        <div style={{ padding: '40px', color: 'var(--color-text-secondary)' }}>
            Redirigiendo a la edicion del club...
        </div>
    );
}
