'use client'

import { useEffect, useRef } from 'react'
import { getCaptchaSiteKey } from '@/lib/auth/captcha'
import styles from '../login.module.css'

type TurnstileOptions = {
    sitekey: string
    callback: (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
    theme?: 'auto' | 'light' | 'dark'
}

type TurnstileApi = {
    render: (el: HTMLElement, options: TurnstileOptions) => string
    reset: (widgetId: string) => void
    remove: (widgetId: string) => void
}

declare global {
    interface Window {
        turnstile?: TurnstileApi
    }
}

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Carga el script una sola vez para toda la sesión de navegación. Si dos
 * formularios montan el campo (login y registro en la misma visita), el segundo
 * espera la misma promesa en vez de inyectar otro `<script>`.
 */
let scriptPromise: Promise<void> | null = null

function cargarTurnstile(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('sin window'))
    if (window.turnstile) return Promise.resolve()
    if (scriptPromise) return scriptPromise

    scriptPromise = new Promise<void>((resolve, reject) => {
        const existente = document.getElementById(SCRIPT_ID)
        if (existente) {
            existente.addEventListener('load', () => resolve())
            existente.addEventListener('error', () => reject(new Error('no cargo turnstile')))
            return
        }

        const script = document.createElement('script')
        script.id = SCRIPT_ID
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        script.onload = () => resolve()
        script.onerror = () => {
            // Que se pueda reintentar en el proximo montaje.
            scriptPromise = null
            reject(new Error('no cargo turnstile'))
        }
        document.head.appendChild(script)
    })

    return scriptPromise
}

/**
 * Widget de Turnstile. **No renderiza nada** si no hay site key configurada, así
 * que puede quedar montado en los formularios antes de que exista la cuenta de
 * Cloudflare.
 *
 * @param onToken   Recibe el token, o `null` cuando vence o falla.
 * @param resetSignal Cambiá este número para pedir un widget nuevo. Hace falta
 *                  después de cada intento fallido: el token es de un solo uso y
 *                  reenviar el mismo lo rechaza Supabase, así que sin el reset
 *                  el segundo intento falla siempre.
 */
export default function CaptchaField({
    onToken,
    resetSignal = 0,
}: {
    onToken: (token: string | null) => void
    resetSignal?: number
}) {
    const siteKey = getCaptchaSiteKey()
    const contenedor = useRef<HTMLDivElement | null>(null)
    const widgetId = useRef<string | null>(null)

    // El callback se guarda en un ref para que cambiar la identidad de la
    // funcion en cada render del formulario no vuelva a montar el widget.
    const onTokenRef = useRef(onToken)
    onTokenRef.current = onToken

    useEffect(() => {
        if (!siteKey) return

        let cancelado = false

        cargarTurnstile()
            .then(() => {
                if (cancelado || !contenedor.current || widgetId.current || !window.turnstile) return

                widgetId.current = window.turnstile.render(contenedor.current, {
                    sitekey: siteKey,
                    callback: (token) => onTokenRef.current(token),
                    'expired-callback': () => onTokenRef.current(null),
                    'error-callback': () => onTokenRef.current(null),
                    theme: 'auto',
                })
            })
            .catch(() => {
                // Sin widget no hay token. El formulario avisa que falta la
                // verificacion en vez de mandar un login que Supabase va a
                // rechazar igual.
                if (!cancelado) onTokenRef.current(null)
            })

        return () => {
            cancelado = true
            if (widgetId.current && window.turnstile) {
                window.turnstile.remove(widgetId.current)
                widgetId.current = null
            }
        }
    }, [siteKey])

    useEffect(() => {
        if (!resetSignal || !widgetId.current || !window.turnstile) return
        window.turnstile.reset(widgetId.current)
        onTokenRef.current(null)
    }, [resetSignal])

    if (!siteKey) return null

    return <div ref={contenedor} className={styles.captchaField} />
}
