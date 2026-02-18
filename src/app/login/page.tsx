'use client'

import styles from './login.module.css'
import OAuthButtons from './components/OAuthButtons'

import AuthErrorBanner from './components/AuthErrorBanner'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'


function LoginContent() {
    const searchParams = useSearchParams()
    const errorParam = searchParams.get('error')
    const [error, setError] = useState<string | null>(null)
    const [configError, setConfigError] = useState(false)

    useEffect(() => {
        if (errorParam) {
            if (errorParam === 'auth-code-error') {
                setError('No pudimos verificar tu sesión. Intenta nuevamente.')
            } else {
                setError('Ocurrió un error de autenticación.')
            }
        }

        // Check for configuration
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
            setConfigError(true)
        }
    }, [errorParam])


    return (
        <div className={styles.loginCard}>
            {configError && (
                <div className={styles.configWarning}>
                    ⚠️ Configuración incompleta: Revisa .env.local
                </div>
            )}
            <AuthErrorBanner message={error} />

            <div className={styles.cardHeader}>
                <span className={styles.logo}>G22SCORES</span>
                <h1 className={styles.title}>Iniciar sesión</h1>
                <p className={styles.subtitle}>Elegí un método para continuar</p>
            </div>

            <OAuthButtons />

            <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--basalt-600)', marginTop: '16px' }}>
                Al continuar, aceptás nuestros <Link href="/terms" className={styles.link}>Términos</Link> y <Link href="/privacy" className={styles.link}>Privacidad</Link>.
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <div className={styles.tectonicPage}>
            <Suspense fallback={<div style={{ color: '#fff' }}>Cargando...</div>}>
                <LoginContent />
            </Suspense>
        </div>
    )
}
