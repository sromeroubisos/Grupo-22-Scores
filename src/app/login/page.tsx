'use client'

import styles from './login.module.css'
import OAuthButtons from './components/OAuthButtons'
import EmailLoginForm from './components/EmailLoginForm'
import AuthErrorBanner from './components/AuthErrorBanner'
import AuthSuccessBanner from './components/AuthSuccessBanner'
import LocalDevAccessPanel from './components/LocalDevAccessPanel'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginContent() {
    const searchParams = useSearchParams()
    const errorParam = searchParams.get('error')
    const messageParam = searchParams.get('message')
    const [error, setError] = useState<string | null>(null)
    const derivedError =
        error ?? (
            errorParam === 'auth-code-error'
                ? 'No pudimos verificar tu sesion. Intenta nuevamente.'
                : errorParam
                    ? 'Ocurrio un error de autenticacion.'
                    : null
        )
    const success =
        messageParam === 'password-updated'
            ? 'Tu contrasena fue actualizada. Ya podes iniciar sesion con la nueva clave.'
            : null
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const configError = !supabaseUrl || supabaseUrl.includes('placeholder')

    return (
        <div className={styles.loginCard}>
            {configError ? (
                <div className={styles.configWarning}>
                    Configuracion incompleta: revisa `.env.local`
                </div>
            ) : null}

            <AuthErrorBanner message={derivedError} />
            <AuthSuccessBanner message={success} />

            <div className={styles.cardHeader}>
                <span className={styles.logo}>G22SCORES</span>
                <h1 className={styles.title}>Iniciar sesion</h1>
                <p className={styles.subtitle}>Elige un metodo para continuar</p>
            </div>

            <OAuthButtons />

            <div className={styles.divider}>
                <span>o con email</span>
            </div>

            <EmailLoginForm onError={setError} />

            <LocalDevAccessPanel onError={setError} />

            <div className={styles.secondaryLinks}>
                <Link href="/auth/forgot-password" className={styles.link}>
                    Olvide mi contrasena
                </Link>
            </div>

            <div className={styles.footerLink}>
                No tenes cuenta? <Link href="/register" className={styles.linkAccent}>Registrate</Link>
            </div>

            <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--basalt-600)', marginTop: '24px' }}>
                Al continuar, aceptas nuestros <Link href="/terminos" className={styles.link}>Terminos</Link> y <Link href="/privacidad" className={styles.link}>Privacidad</Link>.
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
