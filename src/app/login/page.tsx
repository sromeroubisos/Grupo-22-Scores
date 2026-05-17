'use client'

import styles from './login.module.css'
import OAuthButtons from './components/OAuthButtons'
import EmailLoginForm from './components/EmailLoginForm'
import AuthErrorBanner from './components/AuthErrorBanner'
import AuthSuccessBanner from './components/AuthSuccessBanner'
import EmbeddedBrowserNotice from './components/EmbeddedBrowserNotice'
import LocalDevAccessPanel from './components/LocalDevAccessPanel'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { clearSupabaseBrowserSession } from '@/lib/supabase/client'

const RECOVERABLE_ERROR_PARAMS = new Set([
    'auth-code-error',
    'auth-pkce-error',
    'auth-state-error',
    'auth-expired',
])

function LoginContent() {
    const searchParams = useSearchParams()
    const errorParam = searchParams.get('error')
    const detailParam = searchParams.get('detail')
    const messageParam = searchParams.get('message')
    const [error, setError] = useState<string | null>(null)

    // When the user lands back on /login after a failed callback (PKCE
    // mismatch, expired link, bad state, etc.), the stale cookie or local
    // storage that caused the failure is still there. Wipe it once on
    // mount so the next attempt starts clean instead of inheriting the
    // same broken state.
    useEffect(() => {
        if (errorParam && RECOVERABLE_ERROR_PARAMS.has(errorParam)) {
            try {
                clearSupabaseBrowserSession()
                console.info('[login] cleared stale supabase session after recoverable error:', errorParam)
            } catch (cleanupError) {
                console.warn('[login] failed to clear stale session:', cleanupError)
            }
        }
    }, [errorParam])

    const errorMessages: Record<string, string> = {
        'auth-code-error': 'No pudimos verificar tu sesion. Intenta nuevamente.',
        'auth-pkce-error': 'La sesion de inicio de sesion no es valida. Intenta de nuevo.',
        'auth-expired': 'El enlace de inicio de sesion expiro. Solicita uno nuevo.',
        'auth-state-error': 'La solicitud de autenticacion fue alterada. Intenta nuevamente.',
        'login_cancelled': 'Inicio de sesion cancelado.',
        'login_provider_error': 'El proveedor de autenticacion reporto un error. Intenta mas tarde.',
    }

    const baseError = errorParam && errorMessages[errorParam]
        ? errorMessages[errorParam]
        : errorParam
            ? 'Ocurrio un error de autenticacion.'
            : null
    const detailedError = baseError && detailParam
        ? `${baseError} (${detailParam.slice(0, 160)})`
        : baseError
    const derivedError = error ?? detailedError
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
                    Configuracion incompleta: revisa .env.local
                </div>
            ) : null}

            <AuthErrorBanner message={derivedError} />
            <AuthSuccessBanner message={success} />
            <EmbeddedBrowserNotice />

            <div className={styles.cardHeader}>
                <span className={styles.logo}>G22SCORES</span>
                <h1 className={styles.title}>Iniciar sesion</h1>
                <p className={styles.subtitle}>Elige un metodo para continuar</p>
            </div>

            <OAuthButtons onError={setError} />

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
