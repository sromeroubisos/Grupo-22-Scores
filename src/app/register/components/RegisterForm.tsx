'use client'

import { useMemo, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage } from '@/lib/auth/errors'
import { CAPTCHA_PENDING_MESSAGE, captchaOptions, isCaptchaEnabled } from '@/lib/auth/captcha'
import CaptchaField from '../../login/components/CaptchaField'
import { checkPassword } from '@/lib/auth/passwordPolicy'
import PasswordStrengthMeter from '../../login/components/PasswordStrengthMeter'
import styles from '../../login/login.module.css'

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

function getEmailConfirmationRedirect(): string | undefined {
    if (typeof window === 'undefined') return undefined

    const next = encodeURIComponent('/auth/confirm?next=/')
    return `${window.location.origin}/auth/callback?next=${next}`
}

type RegisterFormProps = {
    onError: (msg: string | null) => void
    onSuccess: (msg: string | null) => void
}

export default function RegisterForm({ onError, onSuccess }: RegisterFormProps) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [captchaToken, setCaptchaToken] = useState<string | null>(null)
    // Turnstile entrega tokens de un solo uso: despues de cada intento fallido
    // hay que pedir uno nuevo, o el siguiente reenvia el mismo y Supabase lo
    // rechaza sin siquiera mirar la credencial.
    const [captchaReset, setCaptchaReset] = useState(0)
    const submittingRef = useRef(false)

    // El mismo veredicto alimenta la barra y la validacion del submit: si se
    // calcularan por separado, la pantalla podria decir que esta bien y el
    // submit rechazarla.
    const passwordCheck = useMemo(
        () => checkPassword(password, { email }),
        [password, email],
    )

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (submittingRef.current) return
        onError(null)
        onSuccess(null)

        const normalizedEmail = normalizeEmail(email)

        if (!normalizedEmail || !password.trim()) {
            onError('Por favor completa todos los campos')
            return
        }

        if (password !== confirmPassword) {
            onError('Las contrasenas no coinciden')
            return
        }

        if (!passwordCheck.ok) {
            onError(passwordCheck.problems[0])
            return
        }

        if (isCaptchaEnabled() && !captchaToken) {
            onError(CAPTCHA_PENDING_MESSAGE)
            return
        }

        submittingRef.current = true
        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    emailRedirectTo: getEmailConfirmationRedirect(),
                    ...captchaOptions(captchaToken),
                },
            })

            if (error) throw error

            onSuccess('Te enviamos un email para confirmar tu cuenta. Revisa tu bandeja y sigue el enlace para activar el acceso.')
        } catch (error: unknown) {
            onError(getAuthErrorMessage(error, 'Ocurrio un error al registrarse'))
            setCaptchaReset((n) => n + 1)
        } finally {
            submittingRef.current = false
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
                        autoComplete="new-password"
                        required
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
                <PasswordStrengthMeter check={passwordCheck} password={password} />
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="confirm-password">Confirmar contrasena</label>
                <div className={styles.inputWrapper}>
                    <input
                        id="confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        className={styles.input}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                    />
                </div>
            </div>

            <CaptchaField onToken={setCaptchaToken} resetSignal={captchaReset} />

            <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
        </form>
    )
}
