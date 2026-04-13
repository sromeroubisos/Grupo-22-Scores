'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from '../../login/login.module.css'
import AuthErrorBanner from '../../login/components/AuthErrorBanner'
import AuthSuccessBanner from '../../login/components/AuthSuccessBanner'

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

function getResetPasswordRedirect(): string | undefined {
    if (typeof window === 'undefined') return undefined

    const next = encodeURIComponent('/auth/update-password')
    return `${window.location.origin}/auth/callback?next=${next}`
}

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const supabase = createClient()

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)
        setSuccess(null)

        const normalizedEmail = normalizeEmail(email)
        if (!normalizedEmail) {
            setError('Ingresa un email valido')
            return
        }

        setLoading(true)
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
                redirectTo: getResetPasswordRedirect(),
            })

            if (resetError) throw resetError

            setSuccess('Te enviamos un email para cambiar tu contrasena. Revisa tu bandeja y sigue el enlace.')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'No pudimos enviar el email de recuperacion')
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
                    <h1 className={styles.title}>Recuperar contrasena</h1>
                    <p className={styles.subtitle}>Te enviaremos un enlace para definir una nueva clave.</p>
                </div>

                <form onSubmit={handleSubmit} className={styles.emailForm}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label} htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            className={styles.input}
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="nombre@ejemplo.com"
                            autoComplete="email"
                            required
                        />
                    </div>

                    <button type="submit" className={styles.submitBtn} disabled={loading}>
                        {loading ? 'Enviando...' : 'Enviar email de recuperacion'}
                    </button>
                </form>

                <div className={styles.footerLink}>
                    <Link href="/login" className={styles.linkAccent}>Volver a iniciar sesion</Link>
                </div>
            </section>
        </main>
    )
}
