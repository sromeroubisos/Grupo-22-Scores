'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function MatchDashboardRedirect() {
    const params = useParams();
    const router = useRouter();
    const matchId = params?.id as string;

    useEffect(() => {
        // Redirect legacy matches path to the new consolidated Match Center
        if (matchId) {
            router.replace(`/admin/super/partidos/${matchId}`);
        }
    }, [matchId, router]);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0D0D0D',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#00A365', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 20 }}></div>
            <p style={{ opacity: 0.6, fontSize: 14 }}>Redireccionando al Match Center...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
