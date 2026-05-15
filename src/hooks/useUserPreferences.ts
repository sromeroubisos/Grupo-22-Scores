'use client'

import { useEffect, useState } from 'react'

import { useAuth } from '@/context/AuthContext'
import { getFavoriteLeagues, getFavoriteSports } from '@/lib/services/preferencesService'
import { createClient } from '@/lib/supabase/client'

interface UserPreferences {
    favoriteSportIds: string[]
    favoriteLeagueIds: string[]
    isLoading: boolean
}

export function useUserPreferences(): UserPreferences {
    const { user, isLoading: authLoading, isSessionVerified } = useAuth()
    const userId = user?.id
    const [favoriteSportIds, setFavoriteSportIds] = useState<string[]>([])
    const [favoriteLeagueIds, setFavoriteLeagueIds] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (authLoading || !isSessionVerified || !userId) {
            setFavoriteSportIds([])
            setFavoriteLeagueIds([])
            setIsLoading(authLoading || !isSessionVerified)
            return
        }

        const activeUserId = userId

        const supabase = createClient()
        let cancelled = false

        async function load() {
            setIsLoading(true)

            try {
                const [sports, leagues] = await Promise.all([
                    getFavoriteSports(supabase, activeUserId),
                    getFavoriteLeagues(supabase, activeUserId),
                ])
                if (!cancelled) {
                    setFavoriteSportIds(sports)
                    setFavoriteLeagueIds(leagues.map((entry) => entry.leagueId))
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
    }, [authLoading, isSessionVerified, userId])

    return {
        favoriteSportIds,
        favoriteLeagueIds,
        isLoading,
    }
}
