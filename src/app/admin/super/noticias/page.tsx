'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NoticiasAdminRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/editorial');
    }, [router]);

    return (
        <div style={{ padding: '40px', color: 'var(--basalt-400)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            Redirigiendo a /admin/editorial...
        </div>
    );
}
