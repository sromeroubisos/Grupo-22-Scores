'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import styles from '../login.module.css'
import { Eye, EyeOff } from 'lucide-react'

export default function EmailLoginForm({ onError }: { onError: (msg: string | null) => void }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
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

        setLoading(true)
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    throw new Error('Credenciales incorrectas. Verificá tu email y contraseña.')
                }
                throw error
            }
            router.push('/dashboard')
            router.refresh()
        } catch (error: any) {
            onError(error.message || 'Ocurrió un error al iniciar sesión')
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
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
