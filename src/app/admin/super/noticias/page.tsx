'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NoticiasAdminRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/noticias');
    }, [router]);

    return (
        <div style={{ padding: '40px', color: 'var(--basalt-400)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            Redirigiendo a /noticias...
        </div>
    );
}
