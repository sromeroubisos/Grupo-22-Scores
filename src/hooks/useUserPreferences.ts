'use client'

import { useEffect, useState } from 'react'

import { useAuth } from '@/context/AuthContext'
import { getFavoriteSports } from '@/lib/services/preferencesService'
import { createClient } from '@/lib/supabase/client'

interface UserPreferences {
    favoriteSportIds: string[]
    favoriteLeagueIds: string[]
    isLoading: boolean
}

export function useUserPreferences(): UserPreferences {
    const { user } = useAuth()
    const userId = user?.id
    const [favoriteSportIds, setFavoriteSportIds] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!userId) {
            setFavoriteSportIds([])
            setIsLoading(false)
            return
        }

        const supabase = createClient()
        let cancelled = false

        async function load() {
            setIsLoading(true)

            try {
                const sports = await getFavoriteSports(supabase, userId)
                if (!cancelled) {
                    setFavoriteSportIds(sports)
                }
            } catch (err) {
                console.error('[useUserPreferences] load error:', err)
            } finally {
                if (!cancelled) {
                    setIsLoading(false)
                }
            }
        }

        load()

        return () => {
            cancelled = true
        }
    }, [userId])

    return {
        favoriteSportIds,
        favoriteLeagueIds: [],
        isLoading,
    }
}
