'use client'

import { createClient } from '@/lib/supabase/client'
import styles from '../login.module.css'
import { useState } from 'react'

export default function OAuthButtons() {
    const [loading, setLoading] = useState<string | null>(null)
    const supabase = createClient()

    const handleLogin = async (provider: 'google' | 'apple' | 'facebook') => {
        setLoading(provider)
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            })
            if (error) throw error
        } catch (error) {
            console.error('OAuth error:', error)
            setLoading(null)
            // Ideally dispatch error to parent or context
        }
    }

    return (
        <div className={styles.socialButtons}>
            <button
                className={styles.socialBtn}
                onClick={() => handleLogin('google')}
                disabled={!!loading}
            >
                {loading === 'google' ? 'Conectando...' : (
                    <>
                        <svg className={styles.icon} viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M24 12.276c0-.853-.075-1.67-.215-2.457H12.273v4.646h6.577a5.618 5.618 0 0 1-2.44 3.702v3.08h3.948c2.311-2.126 3.642-5.26 3.642-8.97z" />
                            <path fill="#34A853" d="M12.273 24c3.303 0 6.079-1.106 8.103-3.003l-3.95-3.08c-1.096.732-2.503 1.161-4.153 1.161-3.189 0-5.892-2.155-6.85-5.068H1.362v3.176A12.26 12.26 0 0 0 12.273 24z" />
                            <path fill="#FBBC05" d="M5.423 13.99A7.37 7.37 0 0 1 5.097 12c0-.69.12-1.353.326-1.99V6.833H1.362a12.25 12.25 0 0 0 0 10.334l4.06-3.177z" />
                            <path fill="#4285F4" d="M12.273 4.757c1.795 0 3.407.618 4.672 1.83l3.504-3.505C18.348 1.14 15.61 0 12.273 0 7.424 0 3.193 2.76 1.362 6.833l4.062 3.176c.958-2.912 3.66-5.252 6.849-5.252z" />
                        </svg>
                        Continuar con Google
                    </>
                )}
            </button>
            <button
                className={styles.socialBtn}
                onClick={() => handleLogin('apple')}
                disabled={!!loading}
            >
                {loading === 'apple' ? 'Conectando...' : (
                    <>
                        <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-.96-.45-1.95-.51-3.05 0-1.1.52-1.98.51-3.21-.43-5.23-4-4.83-9.5-2.22-11.83 1.35-1.2 3.25-1.1 3.93-.11.63.89 1.62.9 2.11.05.86-1.48 3.5-1.06 4.68.75 1.48 2.2 1.16 3.95.83 4.54-3.5 1.5-2.3 4.41-1.35 4.41-.05.15-.3.26-.51.35-.95.42-1.83 1.05-2.26 1.77-1.17 2.05.02 5.11 2.5 6.45-.66 1.78-1.57 3.52-2.7 4.61-.43.43-.87.82-1.23 1.15zM12.03 2.1c.07 2.4-1.93 4.65-4.22 4.48-.37-2.58 2.22-4.93 4.22-4.48z" />
                        </svg>
                        Continuar con Apple
                    </>
                )}
            </button>
            <button
                className={styles.socialBtn}
                onClick={() => handleLogin('facebook')}
                disabled={!!loading}
            >
                {loading === 'facebook' ? 'Conectando...' : (
                    <>
                        <svg className={styles.icon} fill="#1877F2" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        Continuar con Facebook
                    </>
                )}
            </button>
        </div>
    )
}
