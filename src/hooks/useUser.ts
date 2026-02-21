'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, isSuperAdmin } from '@/lib/types/user'

/**
 * Hook to get and manage current user
 */
export function useUser() {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        loadUser()

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
            if (event === 'SIGNED_IN' && session) {
                // Sync user with database
                await fetch('/api/auth/sync-user', { method: 'POST' })
                loadUser()
            } else if (event === 'SIGNED_OUT') {
                setUser(null)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    async function loadUser() {
        try {
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                setUser(null)
                setLoading(false)
                return
            }

            const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single()

            setUser(userData)
        } catch (error) {
            console.error('Error loading user:', error)
            setUser(null)
        } finally {
            setLoading(false)
        }
    }

    async function updateProfile(updates: Partial<User>) {
        if (!user) return

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', user.id)

        if (!error) {
            setUser({ ...user, ...updates })
        }

        return { error }
    }

    async function signOut() {
        await supabase.auth.signOut()
        setUser(null)
    }

    return {
        user,
        loading,
        updateProfile,
        signOut,
        isSuperAdmin: isSuperAdmin(user),
        isAuthenticated: !!user
    }
}
