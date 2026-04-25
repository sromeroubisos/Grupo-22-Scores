import { NextResponse } from 'next/server'
import { syncUserProfile } from '@/lib/auth/syncUserProfile'
import { createClient } from '@/lib/supabase/server'

function sanitizeNext(raw: string | null): string {
    if (!raw) return '/'
    return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = sanitizeNext(searchParams.get('next'))

    if (code) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            try {
                await syncUserProfile(data.user)
            } catch (syncError) {
                console.error('Error syncing user:', syncError)
            }

            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
