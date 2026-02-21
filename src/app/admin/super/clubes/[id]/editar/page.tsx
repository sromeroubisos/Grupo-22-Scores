'use client';

// Redirect canónico: editar → manage?tab=identidad
// Preserva deep links existentes sin romper bookmarks.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function EditClubRedirect() {
    const router = useRouter();
    const params = useParams();
    const clubId = params?.id as string | undefined;

    useEffect(() => {
        if (!clubId) return;
        router.replace(`/admin/super/clubes/${clubId}/manage?tab=identidad`);
    }, [clubId, router]);

    return (
        <div style={{ padding: '40px', color: '#6b7280', fontSize: '14px' }}>
            Redirigiendo al panel de gestión...
        </div>
    );
}
