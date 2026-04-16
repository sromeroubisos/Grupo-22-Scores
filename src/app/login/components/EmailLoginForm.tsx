'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import styles from '../login.module.css'
import { sanitizeReturnTo } from '../redirects'

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

export default function EmailLoginForm({ onError }: { onError: (msg: string | null) => void }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const searchParams = useSearchParams()
    const roleIntent = searchParams.get('roleIntent')
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'), roleIntent)
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        onError(null)

        const normalizedEmail = normalizeEmail(email)

        if (!normalizedEmail || !password.trim()) {
            onError('Por favor completa todos los campos')
            return
        }

        setLoading(true)
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password,
            })

            if (error) {
                if (
                    error.message.includes('supabase_auth_unreachable')
                    || error.message.includes('Supabase auth request failed')
                    || error.message.includes('Failed to fetch')
                ) {
                    onError('No pudimos contactar el servicio de autenticacion. Intenta de nuevo en unos segundos.')
                    return
                }

                if (error.message.includes('Invalid login credentials')) {
                    onError('Credenciales incorrectas. Verifica tu email y contrasena.')
                    return
                }

                if (error.message.includes('Email not confirmed')) {
                    onError('Tu email todavia no fue confirmado. Revisa tu correo y abre el enlace de confirmacion antes de iniciar sesion.')
                    return
                }

                throw error
            }

            console.log('[EmailLoginForm] Login successful for:', data.user?.email)
            console.log('[EmailLoginForm] Session present:', !!data.session)

            try {
                await fetch('/api/auth/sync-user', {
                    method: 'POST',
                    credentials: 'same-origin',
                })
            } catch (syncError) {
                console.warn('[EmailLoginForm] sync-user failed, continuing with redirect:', syncError)
            }

            window.location.assign(returnTo)
        } catch (error: unknown) {
            console.error('[EmailLoginForm] Login error:', error)
            onError(error instanceof Error ? error.message : 'Ocurrio un error al iniciar sesion')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className={styles.emailForm}>
            <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="email">Email</label>
                <input
                    id="email"
                    type="email"
                    className={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@ejemplo.com"
                    autoComplete="email"
                    required
                    suppressHydrationWarning
                />
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="password">Contrasena</label>
                <div className={styles.inputWrapper}>
                    <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        className={styles.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                        suppressHydrationWarning
                    />
                    <button
                        type="button"
                        className={styles.togglePass}
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
        </form>
    )
}
