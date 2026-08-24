'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { checkPassword } from '@/lib/auth/passwordPolicy'
import PasswordStrengthMeter from '../../login/components/PasswordStrengthMeter'
import styles from '../../login/login.module.css'
import AuthErrorBanner from '../../login/components/AuthErrorBanner'
import AuthSuccessBanner from '../../login/components/AuthSuccessBanner'

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [checkingSession, setCheckingSession] = useState(true)
    const [ready, setReady] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    // Se guarda para que la politica pueda rechazar una contrasena que contenga
    // el propio email; el resto de la pantalla no lo usa.
    const [email, setEmail] = useState<string | null>(null)
    const supabase = createClient()

    const passwordCheck = useMemo(
        () => checkPassword(password, { email }),
        [password, email],
    )

    useEffect(() => {
        let isMounted = true

        const loadSession = async () => {
            const { data, error: sessionError } = await supabase.auth.getSession()

            if (!isMounted) return

            if (sessionError) {
                setError(sessionError.message)
                setReady(false)
            } else if (data.session) {
                setReady(true)
                setEmail(data.session.user.email ?? null)
            } else {
                setError('El enlace no es valido o ya expiro. Solicita un nuevo email de recuperacion.')
                setReady(false)
            }

            setCheckingSession(false)
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return
            setReady(Boolean(session))
            if (session) {
                setError(null)
                setEmail(session.user.email ?? null)
            }
        })

        void loadSession()

        return () => {
            isMounted = false
            subscription.unsubscribe()
        }
    }, [supabase])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)
        setSuccess(null)

        if (!ready) {
            setError('Primero necesitas abrir el enlace que te enviamos por email.')
            return
        }

        if (!passwordCheck.ok) {
            setError(passwordCheck.problems[0])
            return
        }

        if (password !== confirmPassword) {
            setError('Las contrasenas no coinciden')
            return
        }

        setLoading(true)
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password })
            if (updateError) throw updateError

            setSuccess('Tu contrasena fue actualizada correctamente.')
            setPassword('')
            setConfirmPassword('')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'No pudimos actualizar tu contrasena')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className={styles.tectonicPage}>
            <section className={styles.loginCard}>
                <AuthErrorBanner message={error} />
                <AuthSuccessBanner message={success} />

                <div className={styles.cardHeader}>
                    <span className={styles.logo}>G22SCORES</span>
                    <h1 className={styles.title}>Nueva contrasena</h1>
                    <p className={styles.subtitle}>
                        {checkingSession
                            ? 'Verificando tu enlace...'
                            : 'Define una nueva contrasena para recuperar el acceso a tu cuenta.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className={styles.emailForm}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label} htmlFor="new-password">Nueva contrasena</label>
                        <div className={styles.inputWrapper}>
                            <input
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                className={styles.input}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                required
                                disabled={!ready || checkingSession}
                            />
                            <button
                                type="button"
                                className={styles.togglePass}
                                onClick={() => setShowPassword((current) => !current)}
                                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <PasswordStrengthMeter check={passwordCheck} password={password} />
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label} htmlFor="confirm-password">Confirmar contrasena</label>
                        <input
                            id="confirm-password"
                            type={showPassword ? 'text' : 'password'}
                            className={styles.input}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            required
                            disabled={!ready || checkingSession}
                        />
                    </div>

                    <button type="submit" className={styles.submitBtn} disabled={!ready || checkingSession || loading}>
                        {loading ? 'Actualizando...' : 'Guardar nueva contrasena'}
                    </button>
                </form>

                <div className={styles.footerLink}>
                    <Link href="/login?message=password-updated" className={styles.linkAccent}>
                        Volver al inicio de sesion
                    </Link>
                </div>
            </section>
        </main>
    )
}
