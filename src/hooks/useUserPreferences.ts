'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { getFavoriteSports, getFavoriteLeagues } from '@/lib/services/preferencesService'

type FavoriteLeaguePreferenceUpdatedDetail = {
    leagueId?: string
    isFavorite?: boolean
}

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

        function handleFavoriteLeaguePreferenceUpdated(event: Event) {
            const detail = (event as CustomEvent<FavoriteLeaguePreferenceUpdatedDetail>).detail
            const leagueId = typeof detail?.leagueId === 'string' ? detail.leagueId.trim() : ''
            const isFavorite = detail?.isFavorite === true

            if (!leagueId) return

            setFavoriteLeagueIds(prev => {
                const exists = prev.includes(leagueId)

                if (isFavorite) {
                    return exists ? prev : [...prev, leagueId]
                }

                return exists ? prev.filter(id => id !== leagueId) : prev
            })
        }

        window.addEventListener('preferences:favorite-leagues-updated', handleFavoriteLeaguePreferenceUpdated)

        return () => {
            cancelled = true
            window.removeEventListener('preferences:favorite-leagues-updated', handleFavoriteLeaguePreferenceUpdated)
        }
    }, [user?.id])

    return { favoriteSportIds, favoriteLeagueIds, isLoading }
}
