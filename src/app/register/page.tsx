'use client'

import styles from '../login/login.module.css'
import RegisterForm from './components/RegisterForm'
import AuthErrorBanner from '../login/components/AuthErrorBanner'
import { useState, Suspense } from 'react'
import Link from 'next/link'

function RegisterContent() {
    const [error, setError] = useState<string | null>(null)

    return (
        <div className={styles.loginCard}>
            <AuthErrorBanner message={error} />

            <div className={styles.cardHeader}>
                <span className={styles.logo}>G22SCORES</span>
                <h1 className={styles.title}>Crear Cuenta</h1>
                <p className={styles.subtitle}>Unete para seguir tus torneos</p>
            </div>

            <RegisterForm onError={setError} />

            <div className={styles.footerLink}>
                ¿Ya tenés cuenta? <Link href="/login" className={styles.linkAccent}>Iniciá sesión</Link>
            </div>

            <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--basalt-600)', marginTop: '24px' }}>
                Al registrarte, aceptás nuestros <Link href="/terms" className={styles.link}>Términos</Link> y <Link href="/privacy" className={styles.link}>Privacidad</Link>.
            </div>
        </div>
    )
}

export default function RegisterPage() {
    return (
        <div className={styles.tectonicPage}>
            <Suspense fallback={<div style={{ color: '#fff' }}>Cargando...</div>}>
                <RegisterContent />
            </Suspense>
        </div>
    )
}
