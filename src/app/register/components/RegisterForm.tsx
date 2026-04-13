'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
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

        if (password.length < 6) {
            onError('La contrasena debe tener al menos 6 caracteres')
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    emailRedirectTo: getEmailConfirmationRedirect(),
                },
            })

            if (error) throw error

            onSuccess('Te enviamos un email para confirmar tu cuenta. Revisa tu bandeja y sigue el enlace para activar el acceso.')
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Ocurrio un error al registrarse')
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

            <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
        </form>
    )
}
