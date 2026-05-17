'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import styles from '../login.module.css'
import { detectEmbeddedBrowserFromNavigator } from '@/lib/auth/embeddedBrowser'

// Shown only when the login page is opened inside an in-app browser (Gmail,
// Instagram, WhatsApp, ...). Google OAuth is unreliable/blocked there, so we
// warn the user, point them at the system browser, and steer them to the
// email + password path which has no cross-origin hop.
export default function EmbeddedBrowserNotice() {
    const [app, setApp] = useState<string | null>(null)
    const [visible, setVisible] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const info = detectEmbeddedBrowserFromNavigator()
        if (info.isEmbedded) {
            setApp(info.app)
            setVisible(true)
        }
    }, [])

    if (!visible) return null

    const fromApp = app ? ` de ${app}` : ''

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.origin + '/login')
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            /* clipboard unavailable */
        }
    }

    return (
        <div className={styles.embeddedNotice} role="alert">
            <span className={styles.embeddedNoticeTitle}>
                <AlertTriangle size={16} /> Estás en el navegador interno{fromApp}
            </span>
            <span>
                El inicio de sesión con <strong>Google</strong> no funciona en este navegador.
                Para entrar con Google, abrí esta página en <strong>Safari</strong> o{' '}
                <strong>Chrome</strong> (botón <strong>•••</strong> arriba → “Abrir en Safari/Chrome”).
                O, más simple: iniciá sesión acá mismo con tu <strong>email y contraseña</strong>.
            </span>
            <div className={styles.embeddedNoticeActions}>
                <button type="button" className={styles.embeddedNoticeBtn} onClick={() => void copyLink()}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? ' Enlace copiado' : ' Copiar enlace para abrir en el navegador'}
                </button>
            </div>
        </div>
    )
}
