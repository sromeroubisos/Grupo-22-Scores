'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import styles from '../login.module.css'
import { sanitizeReturnTo } from '../redirects'
import { normalizeEmail, signInWithPasswordAndRedirect } from '../auth-client'
import { clearSupabaseBrowserSession } from '@/lib/supabase/client'
import { CAPTCHA_PENDING_MESSAGE, isCaptchaEnabled } from '@/lib/auth/captcha'
import CaptchaField from './CaptchaField'

export default function EmailLoginForm({ onError }: { onError: (msg: string | null) => void }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [captchaToken, setCaptchaToken] = useState<string | null>(null)
    // Turnstile entrega tokens de un solo uso: despues de cada intento fallido
    // hay que pedir uno nuevo, o el siguiente reenvia el mismo y Supabase lo
    // rechaza sin siquiera mirar la credencial.
    const [captchaReset, setCaptchaReset] = useState(0)
    const submittingRef = useRef(false)
    const searchParams = useSearchParams()
    const roleIntent = searchParams.get('roleIntent')
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'), roleIntent)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (submittingRef.current) return
        onError(null)

        const normalizedEmail = normalizeEmail(email)

        if (!normalizedEmail || !password.trim()) {
            onError('Por favor completa todos los campos')
            return
        }

        if (isCaptchaEnabled() && !captchaToken) {
            onError(CAPTCHA_PENDING_MESSAGE)
            return
        }

        submittingRef.current = true
        setLoading(true)
        try {
            await signInWithPasswordAndRedirect({
                email: normalizedEmail,
                password,
                returnTo,
                captchaToken,
            })
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Ocurrio un error al iniciar sesion')
            setCaptchaReset((n) => n + 1)
        } finally {
            submittingRef.current = false
            setLoading(false)
        }
    }

    const handleClearSession = () => {
        try {
            clearSupabaseBrowserSession()
            onError('Sesion guardada limpiada. Proba ingresar de nuevo.')
        } catch {
            onError('No pudimos limpiar la sesion guardada. Borra cookies del sitio y reintenta.')
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
                        placeholder="********"
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

            <CaptchaField onToken={setCaptchaToken} resetSignal={captchaReset} />

            <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <button
                type="button"
                className={styles.link}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 0 0',
                    fontSize: 12,
                    alignSelf: 'center',
                    textDecoration: 'underline',
                }}
                onClick={handleClearSession}
            >
                No podes ingresar? Limpiar sesion guardada
            </button>
        </form>
    )
}
