'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Este page es un redirect canónico hacia /manage.
// NO usa mock-db. Redirige directamente usando el id de la URL.

export default function SuperadminClubPage() {
    const router = useRouter();
    const params = useParams();
    const clubId = params?.id as string | undefined;

    useEffect(() => {
        if (!clubId) return;
        // Redirect inmediato a la página de gestión unificada
        router.replace(`/admin/super/clubes/${clubId}/manage`);
    }, [clubId, router]);

    return (
        <div style={{ padding: '40px', color: '#6b7280', fontSize: '14px' }}>
            Redirigiendo al panel de gestión...
        </div>
    );
}
