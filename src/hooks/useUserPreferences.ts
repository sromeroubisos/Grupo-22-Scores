'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { getFavoriteSports, getFavoriteLeagues } from '@/lib/services/preferencesService'

interface UserPreferences {
    favoriteSportIds: string[]
    favoriteLeagueIds: string[]
    isLoading: boolean
}

export function useUserPreferences(): UserPreferences {
    const { user } = useAuth()
    const [favoriteSportIds, setFavoriteSportIds] = useState<string[]>([])
    const [favoriteLeagueIds, setFavoriteLeagueIds] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!user) {
            setFavoriteSportIds([])
            setFavoriteLeagueIds([])
            setIsLoading(false)
            return
        }

        const supabase = createClient()
        let cancelled = false

        async function load() {
            setIsLoading(true)
            try {
                const [sports, leagues] = await Promise.all([
                    getFavoriteSports(supabase, user!.id),
                    getFavoriteLeagues(supabase, user!.id),
                ])
                if (!cancelled) {
                    setFavoriteSportIds(sports)
                    setFavoriteLeagueIds(leagues.map(l => l.leagueId))
                }
            } catch (err) {
                console.error('[useUserPreferences] load error:', err)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [user?.id])

    return { favoriteSportIds, favoriteLeagueIds, isLoading }
}
