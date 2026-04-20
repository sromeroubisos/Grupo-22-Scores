'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from '../login.module.css'
import { sanitizeReturnTo } from '../redirects'
import { signInWithPasswordAndRedirect } from '../auth-client'

type LocalPasswordAccessEntry = {
    id: string
    kind: 'password'
    title: string
    description: string
    buttonLabel?: string
    email: string
    password: string
    returnTo?: string
    roleIntent?: string
}

type LocalHrefAccessEntry = {
    id: string
    kind: 'href'
    title: string
    description: string
    buttonLabel?: string
    href: string
}

type LocalLoginAccessEntry = LocalPasswordAccessEntry | LocalHrefAccessEntry

type LocalLoginAccessConfig = {
    entries?: LocalLoginAccessEntry[]
}

function isLocalHostname(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

export default function LocalDevAccessPanel({ onError }: { onError: (msg: string | null) => void }) {
    const searchParams = useSearchParams()
    const [entries, setEntries] = useState<LocalLoginAccessEntry[]>([])
    const [pendingId, setPendingId] = useState<string | null>(null)

    const fallbackReturnTo = useMemo(
        () => sanitizeReturnTo(searchParams.get('returnTo'), searchParams.get('roleIntent')),
        [searchParams],
    )

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        if (process.env.NODE_ENV !== 'development' || !isLocalHostname(window.location.hostname)) {
            return
        }

        let cancelled = false

        const load = async () => {
            try {
                const response = await fetch('/local-dev/login-access.json', {
                    cache: 'no-store',
                })

                if (!response.ok) {
                    return
                }

                const payload = await response.json() as LocalLoginAccessConfig
                if (!cancelled) {
                    setEntries(Array.isArray(payload.entries) ? payload.entries : [])
                }
            } catch {
                if (!cancelled) {
                    setEntries([])
                }
            }
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [])

    if (!entries.length) {
        return null
    }

    const handleClick = async (entry: LocalLoginAccessEntry) => {
        onError(null)

        if (entry.kind === 'href') {
            window.location.assign(entry.href)
            return
        }

        setPendingId(entry.id)
        try {
            await signInWithPasswordAndRedirect({
                email: entry.email,
                password: entry.password,
                returnTo: sanitizeReturnTo(entry.returnTo ?? fallbackReturnTo, entry.roleIntent ?? searchParams.get('roleIntent')),
            })
        } catch (error) {
            console.error('[LocalDevAccessPanel] Login error:', error)
            onError(error instanceof Error ? error.message : 'Ocurrio un error al iniciar sesion')
        } finally {
            setPendingId(null)
        }
    }

    return (
        <div className={styles.localAccessList}>
            {entries.map((entry) => (
                <div key={entry.id} className={styles.guestAccessCard}>
                    <div>
                        <p className={styles.guestAccessEyebrow}>Acceso local</p>
                        <p className={styles.guestAccessTitle}>{entry.title}</p>
                        <p className={styles.guestAccessBody}>{entry.description}</p>
                    </div>
                    <button
                        type="button"
                        className={styles.guestAccessButton}
                        onClick={() => void handleClick(entry)}
                        disabled={pendingId === entry.id}
                    >
                        {pendingId === entry.id ? 'Ingresando...' : (entry.buttonLabel || 'Entrar')}
                    </button>
                </div>
            ))}
        </div>
    )
}
