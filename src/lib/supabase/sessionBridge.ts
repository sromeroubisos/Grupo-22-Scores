import type { Session } from '@supabase/supabase-js'

type SessionTokens = Pick<Session, 'access_token' | 'refresh_token'>

export async function commitSupabaseSessionForServer(
    session: SessionTokens,
    next = '/',
) {
    if (!session.access_token || !session.refresh_token) {
        throw new Error('Missing Supabase session tokens')
    }

    const response = await fetch('/api/auth/commit-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            next,
        }),
    })

    if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || `Session commit failed (${response.status})`)
    }
}
