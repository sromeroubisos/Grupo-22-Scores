'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from '../../page.module.css';

type JoinLeagueResponse = {
    ok?: boolean;
    joined?: boolean;
    leagueUrl?: string;
    message?: string;
    error?: string;
};

function normalizeInviteCode(value: string) {
    return value.replace(/\s+/g, '').toUpperCase();
}

// Tras ingresar, mandamos al usuario directo al panel de cargar resultados de la
// liga (la pantalla lee ?jugar=1 para abrir ese tab y scrollear hasta él).
function withJugarMarker(leagueUrl: string) {
    return `${leagueUrl}${leagueUrl.includes('?') ? '&' : '?'}jugar=1`;
}

function ProdeJoinLeagueContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, login } = useAuth();
    const initialCode = normalizeInviteCode(searchParams.get('codigo') || '');
    const [inviteCode, setInviteCode] = useState(initialCode);
    const [isJoining, setIsJoining] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);
    const lastAutoCodeRef = useRef('');

    useEffect(() => {
        if (!initialCode) {
            return;
        }

        setInviteCode(initialCode);
    }, [initialCode]);

    async function joinLeague(codeOverride?: string) {
        const nextCode = normalizeInviteCode(codeOverride ?? inviteCode);
        if (!nextCode || isJoining) {
            return;
        }

        if (!user) {
            login('fan', typeof window === 'undefined' ? `/prode/ligas/unirse?codigo=${encodeURIComponent(nextCode)}` : `${window.location.pathname}?codigo=${encodeURIComponent(nextCode)}`);
            return;
        }

        setIsJoining(true);
        setFeedback('Validando codigo...');

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    action: 'join_by_code',
                    inviteCode: nextCode,
                }),
            });

            const result = await response.json() as JoinLeagueResponse;

            if (!response.ok || !result.leagueUrl) {
                throw new Error(result.error || 'No se pudo ingresar a la liga privada.');
            }

            setFeedback(result.message || 'Ingreso confirmado. Redirigiendo...');
            router.replace(withJugarMarker(result.leagueUrl));
            router.refresh();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'No se pudo ingresar a la liga privada.');
        } finally {
            setIsJoining(false);
        }
    }

    useEffect(() => {
        if (!user || !initialCode || hasAutoSubmitted || lastAutoCodeRef.current === initialCode) {
            return;
        }

        lastAutoCodeRef.current = initialCode;
        setHasAutoSubmitted(true);
        void (async () => {
            const nextCode = normalizeInviteCode(initialCode);
            if (!nextCode) {
                return;
            }

            setIsJoining(true);
            setFeedback('Validando codigo...');

            try {
                const response = await fetch('/api/prode/private-leagues', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        action: 'join_by_code',
                        inviteCode: nextCode,
                    }),
                });

                const result = await response.json() as JoinLeagueResponse;

                if (!response.ok || !result.leagueUrl) {
                    throw new Error(result.error || 'No se pudo ingresar a la liga privada.');
                }

                setFeedback(result.message || 'Ingreso confirmado. Redirigiendo...');
                router.replace(withJugarMarker(result.leagueUrl));
                router.refresh();
            } catch (error) {
                setFeedback(error instanceof Error ? error.message : 'No se pudo ingresar a la liga privada.');
            } finally {
                setIsJoining(false);
            }
        })();
    }, [hasAutoSubmitted, initialCode, router, user]);

    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.detailShell}>
                    <Link href="/prode" className={styles.backLink}>← Volver al lobby</Link>

                    <section className={styles.privateLeagueCta}>
                        <div>
                            <p className={styles.privateLeagueEyebrow}>Invitacion</p>
                            <h1 className={styles.privateLeagueTitle}>Ingresar con codigo</h1>
                            <p className={styles.privateLeagueText}>
                                Pega el codigo unico de la liga privada para sumarte al grupo y entrar directo a competir.
                            </p>
                        </div>

                        <div className={styles.section}>
                            <label htmlFor="invite-code" className={styles.formLabel}>Codigo de invitacion</label>
                            <input
                                id="invite-code"
                                type="text"
                                inputMode="text"
                                autoCapitalize="characters"
                                autoCorrect="off"
                                className={styles.formInput}
                                placeholder="Ej: ABC123"
                                value={inviteCode}
                                onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
                                disabled={isJoining}
                            />

                            <p className={styles.sectionText}>
                                Si llegaste desde un link compartido, el codigo ya deberia estar cargado automaticamente.
                            </p>

                            <div className={styles.privateLeagueActions}>
                                <button
                                    type="button"
                                    className={styles.posterPrimaryCta}
                                    disabled={!inviteCode || isJoining}
                                    onClick={() => void joinLeague()}
                                >
                                    {isJoining ? 'Ingresando...' : user ? 'Entrar a la liga' : 'Iniciar sesion y entrar'}
                                </button>
                                <Link href="/prode/ligas/nueva" className={styles.posterSecondaryCta}>
                                    Crear mi propia liga
                                </Link>
                            </div>

                            {feedback ? (
                                <div className={styles.warning}>{feedback}</div>
                            ) : null}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

// useSearchParams exige un límite de Suspense en Next (App Router); sin él, el
// build de esta página falla. Igual que invitacion-club y onboarding/preferences.
export default function ProdeJoinLeaguePage() {
    return (
        <Suspense fallback={<div className={styles.page}><div className="container" /></div>}>
            <ProdeJoinLeagueContent />
        </Suspense>
    );
}
