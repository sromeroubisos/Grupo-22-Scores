'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import styles from '../../login/login.module.css'
import { Eye, EyeOff } from 'lucide-react'

export default function RegisterForm({ onError }: { onError: (msg: string | null) => void }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        onError(null)

        if (!email.trim() || !password.trim()) {
            onError('Por favor completá todos los campos')
            return
        }

        if (password !== confirmPassword) {
            onError('Las contraseñas no coinciden')
            return
        }

        if (password.length < 6) {
            onError('La contraseña debe tener al menos 6 caracteres')
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            })
            if (error) throw error

            // If success
            onError('¡Cuenta creada! Revisa tu email para confirmar.')
            // Optionally redirect or show success message properly
            // router.push('/login?message=check-email')
        } catch (error: any) {
            onError(error.message || 'Ocurrió un error al registrarse')
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
                        autoComplete="new-password"
                        required
                    />
                    <button
                        type="button"
                        className={styles.togglePass}
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="confirm-password">Confirmar Contraseña</label>
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
                {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
            </button>
        </form>
    )
}
