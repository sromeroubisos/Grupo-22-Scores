'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from '../login/login.module.css';

function InviteContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'idle' | 'accepting' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState<string | null>(null);
    const [inviteInfo, setInviteInfo] = useState<{ scopeLabel: string; roleLabel: string } | null>(null);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Link de invitacion invalido. Falta el token.');
            return;
        }

        if (authLoading) return;

        if (!isAuthenticated) {
            const returnTo = `/invitacion-club?token=${encodeURIComponent(token)}`;
            router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
            return;
        }

        // Autenticado y con token: consumir invitación
        setStatus('accepting');
        fetch('/api/club-admin/invites/accept', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        })
            .then(async (res) => {
                const payload = await res.json().catch(() => ({ ok: false, error: 'Respuesta invalida' }));
                if (!res.ok || payload.ok === false) {
                    throw new Error(payload.error || 'No se pudo procesar la invitacion');
                }
                setStatus('success');
                setInviteInfo({
                    scopeLabel: payload.data?.scopeType === 'club_family' ? 'Familia de club' : 'Club',
                    roleLabel: getRoleLabel(payload.data?.role),
                });
                // Redirigir al panel del club después de unos segundos
                setTimeout(() => {
                    router.replace('/club-admin');
                }, 2500);
            })
            .catch((err) => {
                setStatus('error');
                setMessage(err instanceof Error ? err.message : 'Error desconocido');
            });
    }, [token, isAuthenticated, authLoading, router]);

    if (!token) {
        return (
            <div className={styles.tectonicPage}>
                <div className={styles.loginCard}>
                    <div className={styles.cardHeader}>
                        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                        <h1 className={styles.title}>Invitacion invalida</h1>
                        <p className={styles.subtitle}>El link no contiene un token valido.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.tectonicPage}>
            <div className={styles.loginCard}>
                <div className={styles.cardHeader}>
                    {status === 'accepting' || authLoading ? (
                        <>
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                            <h1 className={styles.title}>Procesando invitacion</h1>
                            <p className={styles.subtitle}>Un momento mientras validamos tu acceso...</p>
                        </>
                    ) : status === 'success' ? (
                        <>
                            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                            <h1 className={styles.title}>¡Listo!</h1>
                            <p className={styles.subtitle}>
                                Ya tenes acceso como <strong>{inviteInfo?.roleLabel}</strong> en este {inviteInfo?.scopeLabel}.
                            </p>
                            <p className={styles.subtitle}>Te llevamos al panel del club...</p>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <h1 className={styles.title}>No se pudo unir</h1>
                            <p className={styles.subtitle}>{message || 'Ocurrio un error al procesar la invitacion.'}</p>
                        </>
                    )}
                </div>

                {status === 'error' ? (
                    <div className={styles.footerLink} style={{ marginTop: '24px' }}>
                        <a href={`mailto:?subject=Invitacion a club&body=Hola, te comparto el link para unirte: ${typeof window !== 'undefined' ? window.location.href : ''}`} className={styles.linkAccent}>
                            <Mail className="w-4 h-4 inline mr-1" />
                            Compartir por email
                        </a>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
        admin: 'Administrador',
        editor: 'Editor',
        operator: 'Operador',
        viewer: 'Solo lectura',
    };
    return labels[role] || role;
}

export default function InvitacionClubPage() {
    return (
        <Suspense fallback={
            <div className={styles.tectonicPage}>
                <div className={styles.loginCard}>
                    <div className={styles.cardHeader}>
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <h1 className={styles.title}>Cargando...</h1>
                    </div>
                </div>
            </div>
        }>
            <InviteContent />
        </Suspense>
    );
}
