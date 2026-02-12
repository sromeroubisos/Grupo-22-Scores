'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UnionDashboardRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.push('/admin');
    }, [router]);

    return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Redirigiendo al Panel Principal...
        </div>
    );
}
