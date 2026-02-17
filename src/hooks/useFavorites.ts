'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Favorite, EntityType } from '@/lib/types/user'

/**
 * Hook to manage favorites for a specific entity
 */
export function useFavorite(entityType: EntityType, entityId: string) {
  const [isFavorited, setIsFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    checkAuthAndFavorite()
  }, [entityType, entityId])

  async function checkAuthAndFavorite() {
    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setIsAuthenticated(false)
        setIsFavorited(false)
        return
      }

      setIsAuthenticated(true)

      // Try to check if favorited (RPC function may not exist yet)
      const { data, error } = await supabase.rpc('is_favorited', {
        p_entity_type: entityType,
        p_entity_id: entityId
      })

      if (error) {
        // RPC function doesn't exist or other error - fail silently
        console.warn('Favorite check unavailable (SQL schema may not be applied yet)')
        setIsFavorited(false)
        return
      }

      setIsFavorited(data || false)
    } catch (error: any) {
      console.warn('Error checking favorite:', error?.message || 'Unknown')
      setIsFavorited(false)
    }
  }

  async function toggle() {
    if (!isAuthenticated) {
      window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname)
      return { success: false, error: 'Not authenticated' }
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('toggle_favorite', {
        p_entity_type: entityType,
        p_entity_id: entityId
      })

      if (error) throw error

      setIsFavorited(data)
      return { success: true, isFavorited: data }
    } catch (error: any) {
      console.error('Error toggling favorite:', error?.message || error)
      return { success: false, error: error?.message || 'Unknown error' }
    } finally {
      setLoading(false)
    }
  }

  return {
    isFavorited,
    loading,
    toggle,
    isAuthenticated
  }
}

/**
 * Hook to get all user favorites
 */
export function useFavorites(entityType?: EntityType) {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    loadFavorites()
  }, [entityType])

  async function loadFavorites() {
    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setFavorites([])
        setError('Not authenticated')
        setLoading(false)
        return
      }

      // Try to get favorites (RPC function may not exist yet)
      const { data, error: rpcError } = await supabase.rpc('get_user_favorites', {
        p_entity_type: entityType || null
      })

      if (rpcError) {
        // RPC function doesn't exist - fail silently
        console.warn('Favorites unavailable (SQL schema may not be applied yet)')
        setError('Favorites not available')
        setFavorites([])
        setLoading(false)
        return
      }

      setFavorites(data || [])
      setError(null)
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown error'
      console.warn('Error loading favorites:', errorMessage)
      setError(errorMessage)
      setFavorites([])
    } finally {
      setLoading(false)
    }
  }

  async function remove(favoriteId: string) {
    const { error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('id', favoriteId)

    if (!deleteError) {
      setFavorites(favorites.filter(f => f.id !== favoriteId))
    }

    return { error: deleteError }
  }

  const isFavorite = useCallback(
    (type: EntityType, entityId: string) =>
      favorites.some(f => f.entity_type === type && f.entity_id === entityId),
    [favorites]
  )

  const isLeagueFavorite = useCallback(
    (entityId: string) => isFavorite('league', entityId) || isFavorite('tournament', entityId),
    [isFavorite]
  )

  async function toggleFavorite(type: EntityType, entityId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname)
      return
    }
    try {
      const { data, error: rpcError } = await supabase.rpc('toggle_favorite', {
        p_entity_type: type,
        p_entity_id: entityId
      })
      if (rpcError) throw rpcError
      await loadFavorites()
    } catch (err: any) {
      console.error('Error toggling favorite:', err?.message || err)
    }
  }

  const toggleLeagueFavorite = useCallback(
    (entityId: string) => toggleFavorite('league', entityId),
    []
  )

  return {
    favorites,
    loading,
    error,
    remove,
    refresh: loadFavorites,
    isFavorite,
    isLeagueFavorite,
    toggleFavorite,
    toggleLeagueFavorite,
  }
}
