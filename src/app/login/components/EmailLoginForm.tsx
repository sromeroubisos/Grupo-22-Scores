'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import styles from '../login.module.css'
import { Eye, EyeOff } from 'lucide-react'

/** Only allow relative paths for returnTo to prevent open-redirect attacks. */
function sanitizeReturnTo(raw: string | null, roleIntent?: string | null): string {
    if (!raw) {
        // If we have a role intent but no returnTo, help the user get to the right place
        if (roleIntent === 'admin_general' || roleIntent === 'super_admin') return '/admin/super'
        if (roleIntent === 'admin_club') return '/club-admin'
        if (
            roleIntent === 'admin_union' ||
            roleIntent === 'admin_torneo' ||
            roleIntent === 'gestor_deportes' ||
            roleIntent === 'gestor_torneos' ||
            roleIntent === 'gestor_partidos' ||
            roleIntent === 'gestor_clubes'
        ) return '/admin'
        return '/'
    }
    // Must start with / and not // (which would be treated as protocol-relative)
    if (raw.startsWith('/') && !raw.startsWith('//')) {
        return raw
    }
    return '/'
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

        if (!email.trim() || !password.trim()) {
            onError('Por favor completá todos los campos')
            return
        }

        setLoading(true)
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    throw new Error('Credenciales incorrectas. Verificá tu email y contraseña.')
                }
                throw error
            }

            console.log('[EmailLoginForm] Login successful for:', data.user?.email)
            console.log('[EmailLoginForm] Session present:', !!data.session)

            // Ensure email/password logins also create/update the public.users profile
            // before redirecting to pages that expect it server-side.
            try {
                await fetch('/api/auth/sync-user', {
                    method: 'POST',
                    credentials: 'same-origin',
                })
            } catch (syncError) {
                console.warn('[EmailLoginForm] sync-user failed, continuing with redirect:', syncError)
            }

            // Use a hard navigation so client and server auth state stay aligned.
            window.location.assign(returnTo)
        } catch (error: unknown) {
            console.error('[EmailLoginForm] Login error:', error)
            onError(error instanceof Error ? error.message : 'Ocurrió un error al iniciar sesión')
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
                <label className={styles.label} htmlFor="password">Contraseña</label>
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
                    />
                    <button
                        type="button"
                        className={styles.togglePass}
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
