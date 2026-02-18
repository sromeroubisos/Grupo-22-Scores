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
        </div>
    )
}
