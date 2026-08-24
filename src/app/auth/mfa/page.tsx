'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNext } from '@/lib/auth/redirect'
import { getAuthErrorMessage } from '@/lib/auth/errors'
import styles from '../../login/login.module.css'
import AuthErrorBanner from '../../login/components/AuthErrorBanner'
import { normalizarCodigo, verificarCodigoYSalir } from './verify'

/**
 * Desafío del segundo factor: la pantalla a la que rebota el guard cuando la
 * sesión es aal1 y el usuario ya tiene un TOTP verificado.
 */
function MfaChallenge() {
    const searchParams = useSearchParams()
    const returnTo = useMemo(() => sanitizeNext(searchParams.get('returnTo')), [searchParams])

    const [factorId, setFactorId] = useState<string | null>(null)
    const [code, setCode] = useState('')
    const [cargando, setCargando] = useState(true)
    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        let vigente = true

        const cargarFactor = async () => {
            const { data, error: listError } = await supabase.auth.mfa.listFactors()
            if (!vigente) return

            if (listError) {
                setError(getAuthErrorMessage(listError, 'No pudimos leer tu configuracion de dos pasos.'))
                setCargando(false)
                return
            }

            const verificado = (data?.totp ?? []).find((factor) => factor.status === 'verified')

            if (!verificado) {
                // No tiene factor: no hay nada que desafiar. La pantalla de alta
                // es la que corresponde.
                window.location.assign(`/auth/mfa/alta?returnTo=${encodeURIComponent(returnTo)}`)
                return
            }

            setFactorId(verificado.id)
            setCargando(false)
        }

        void cargarFactor()

        return () => {
            vigente = false
        }
    }, [supabase, returnTo])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (enviando || !factorId) return

        setError(null)

        if (code.length !== 6) {
            setError('El codigo tiene seis digitos.')
            return
        }

        setEnviando(true)
        try {
            await verificarCodigoYSalir(supabase, factorId, code, returnTo)
        } catch (err: unknown) {
            setError(getAuthErrorMessage(err, 'El codigo no es valido o ya vencio. Proba con el siguiente.'))
            setCode('')
            setEnviando(false)
        }
    }

    return (
        <div className={styles.loginCard}>
            <AuthErrorBanner message={error} />

            <div className={styles.cardHeader}>
                <span className={styles.logo}>G22SCORES</span>
                <h1 className={styles.title}>Verificacion en dos pasos</h1>
                <p className={styles.subtitle}>
                    Abri tu app de autenticacion y escribi el codigo de seis digitos.
                </p>
            </div>

            <form onSubmit={handleSubmit} className={styles.emailForm}>
                <div className={styles.inputGroup}>
                    <label className={styles.label} htmlFor="mfa-code">Codigo</label>
                    <input
                        id="mfa-code"
                        className={`${styles.input} ${styles.codeInput}`}
                        value={code}
                        onChange={(event) => setCode(normalizarCodigo(event.target.value))}
                        placeholder="000000"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        // El navegador ofrece el codigo del SMS/app sin que el
                        // usuario tenga que ir a buscarlo.
                        autoFocus
                        disabled={cargando || enviando}
                        required
                    />
                </div>

                <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={cargando || enviando || code.length !== 6}
                >
                    {cargando
                        ? 'Cargando...'
                        : enviando
                            ? 'Verificando...'
                            : code.length !== 6
                                ? 'Escribi los seis digitos'
                                : 'Verificar'}
                </button>
            </form>

            <p className={styles.mfaHint}>
                Si perdiste el acceso a la app, pedile a un super admin que te
                desactive el segundo factor.
            </p>
        </div>
    )
}

export default function MfaChallengePage() {
    return (
        <div className={styles.tectonicPage}>
            <Suspense fallback={<div style={{ color: '#fff' }}>Cargando...</div>}>
                <MfaChallenge />
            </Suspense>
        </div>
    )
}
