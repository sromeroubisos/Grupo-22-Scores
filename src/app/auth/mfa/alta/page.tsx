'use client'

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNext } from '@/lib/auth/redirect'
import { getAuthErrorMessage } from '@/lib/auth/errors'
import styles from '../../../login/login.module.css'
import AuthErrorBanner from '../../../login/components/AuthErrorBanner'
import { normalizarCodigo, verificarCodigoYSalir } from '../verify'

type Alta = {
    factorId: string
    qr: string
    secreto: string
}

function MfaEnroll() {
    const searchParams = useSearchParams()
    const returnTo = useMemo(() => sanitizeNext(searchParams.get('returnTo')), [searchParams])

    const [alta, setAlta] = useState<Alta | null>(null)
    const [code, setCode] = useState('')
    const [cargando, setCargando] = useState(true)
    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [verSecreto, setVerSecreto] = useState(false)

    const supabase = useMemo(() => createClient(), [])
    // StrictMode corre el efecto dos veces en desarrollo. Sin este candado, la
    // segunda pasada da de alta un segundo factor sin verificar.
    const iniciado = useRef(false)

    useEffect(() => {
        if (iniciado.current) return
        iniciado.current = true

        let vigente = true

        const iniciarAlta = async () => {
            const { data: factores, error: listError } = await supabase.auth.mfa.listFactors()
            if (!vigente) return

            if (listError) {
                setError(getAuthErrorMessage(listError, 'No pudimos leer tu configuracion de dos pasos.'))
                setCargando(false)
                return
            }

            const totp = factores?.all?.filter((factor) => factor.factor_type === 'totp') ?? []

            if (totp.some((factor) => factor.status === 'verified')) {
                // Ya lo tenia configurado: lo que falta es el desafio, no el alta.
                window.location.assign(`/auth/mfa?returnTo=${encodeURIComponent(returnTo)}`)
                return
            }

            // Cada visita a esta pantalla crea un factor nuevo. Los intentos
            // abandonados quedan colgados como "unverified" y ensucian la lista
            // que despues mira el guard, asi que se limpian antes.
            for (const pendiente of totp.filter((factor) => factor.status === 'unverified')) {
                await supabase.auth.mfa.unenroll({ factorId: pendiente.id }).catch(() => null)
            }

            const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
            if (!vigente) return

            if (enrollError || !data) {
                setError(getAuthErrorMessage(
                    enrollError,
                    'No pudimos iniciar el alta. Revisa que la verificacion en dos pasos este habilitada en Supabase.',
                ))
                setCargando(false)
                return
            }

            setAlta({ factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret })
            setCargando(false)
        }

        void iniciarAlta()

        return () => {
            vigente = false
        }
    }, [supabase, returnTo])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (enviando || !alta) return

        setError(null)

        if (code.length !== 6) {
            setError('El codigo tiene seis digitos.')
            return
        }

        setEnviando(true)
        try {
            await verificarCodigoYSalir(supabase, alta.factorId, code, returnTo)
        } catch (err: unknown) {
            setError(getAuthErrorMessage(err, 'El codigo no coincide. Revisa la hora del telefono y proba con el siguiente.'))
            setCode('')
            setEnviando(false)
        }
    }

    return (
        <div className={styles.loginCard}>
            <AuthErrorBanner message={error} />

            <div className={styles.cardHeader}>
                <span className={styles.logo}>G22SCORES</span>
                <h1 className={styles.title}>Activar dos pasos</h1>
                <p className={styles.subtitle}>
                    Tu rol maneja todos los clubes y torneos. Con la contrasena sola no alcanza.
                </p>
            </div>

            <ol className={styles.mfaSteps}>
                <li>Instala Google Authenticator, Authy o 1Password.</li>
                <li>Escanea el codigo con la app.</li>
                <li>Escribi los seis digitos que te muestra.</li>
            </ol>

            {cargando && <p className={styles.mfaHint}>Preparando el codigo...</p>}

            {alta && (
                <>
                    <div className={styles.mfaQrBox}>
                        {/* Sin lazy: es el contenido principal de la pantalla. */}
                        <img src={alta.qr} alt="Codigo QR para vincular tu app de autenticacion" />
                    </div>

                    {verSecreto ? (
                        <p className={styles.mfaSecret}>{alta.secreto}</p>
                    ) : (
                        <button
                            type="button"
                            className={styles.link}
                            onClick={() => setVerSecreto(true)}
                        >
                            No puedo escanear: mostrar la clave
                        </button>
                    )}

                    <form onSubmit={handleSubmit} className={styles.emailForm}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label} htmlFor="mfa-code">Codigo de la app</label>
                            <input
                                id="mfa-code"
                                className={`${styles.input} ${styles.codeInput}`}
                                value={code}
                                onChange={(event) => setCode(normalizarCodigo(event.target.value))}
                                placeholder="000000"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                disabled={enviando}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={enviando || code.length !== 6}
                        >
                            {enviando
                                ? 'Activando...'
                                : code.length !== 6
                                    ? 'Escribi los seis digitos'
                                    : 'Activar dos pasos'}
                        </button>
                    </form>

                    <p className={styles.mfaHint}>
                        Guarda la clave en tu gestor de contrasenas. Si perdes el telefono y no
                        la tenes, vas a necesitar que otro super admin te desactive el factor.
                    </p>
                </>
            )}
        </div>
    )
}

export default function MfaEnrollPage() {
    return (
        <div className={styles.tectonicPage}>
            <Suspense fallback={<div style={{ color: '#fff' }}>Cargando...</div>}>
                <MfaEnroll />
            </Suspense>
        </div>
    )
}
