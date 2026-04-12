import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingStatus {
    user_id: string
    preferences_onboarding_completed: boolean
    sports_completed: boolean
    leagues_completed: boolean
    skipped: boolean
    completed_at: string | null
    updated_at: string
}

export interface FavoriteLeagueEntry {
    leagueId: string
    sportId: string
    sortOrder: number
}

export interface LeagueItem {
    id: string
    name: string
    displayName: string | null
    sport: string
    country: string | null
    logoUrl: string | null
}

function isUuidLike(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

// ─── Onboarding Status ────────────────────────────────────────────────────────

export async function getOnboardingStatus(
    supabase: SupabaseClient,
    userId: string
): Promise<OnboardingStatus | null> {
    const { data, error } = await supabase
        .from('user_onboarding_status')
        .select('*')
        .eq('user_id', userId)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error('[preferencesService] getOnboardingStatus error:', error.message)
    }

    return data ?? null
}

export async function completeOnboarding(
    supabase: SupabaseClient,
    userId: string,
    options: { skipped: boolean; sportsCompleted?: boolean; leaguesCompleted?: boolean }
): Promise<void> {
    const { error } = await supabase
        .from('user_onboarding_status')
        .upsert({
            user_id: userId,
            preferences_onboarding_completed: true,
            sports_completed: options.sportsCompleted ?? !options.skipped,
            leagues_completed: options.leaguesCompleted ?? !options.skipped,
            skipped: options.skipped,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

    if (error) {
        console.error('[preferencesService] completeOnboarding error:', error.message)
        throw error
    }
}

// ─── Favorite Sports ──────────────────────────────────────────────────────────

export async function getFavoriteSports(
    supabase: SupabaseClient,
    userId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from('user_favorite_sports')
        .select('sport_id, sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })

    if (error) {
        console.error('[preferencesService] getFavoriteSports error:', error.message)
        return []
    }

    return (data ?? []).map((r: any) => r.sport_id)
}

export async function saveFavoriteSports(
    supabase: SupabaseClient,
    userId: string,
    sportIds: string[]
): Promise<void> {
    // Delete all existing favorites for this user
    const { error: deleteError } = await supabase
        .from('user_favorite_sports')
        .delete()
        .eq('user_id', userId)

    if (deleteError) {
        console.error('[preferencesService] saveFavoriteSports delete error:', deleteError.message)
        throw deleteError
    }

    if (sportIds.length === 0) return

    // Insert new favorites with sort order
    const rows = sportIds.map((sportId, index) => ({
        user_id: userId,
        sport_id: sportId,
        sort_order: index,
    }))

    const { error: insertError } = await supabase
        .from('user_favorite_sports')
        .insert(rows)

    if (insertError) {
        console.error('[preferencesService] saveFavoriteSports insert error:', insertError.message)
        throw insertError
    }
}

// ─── Favorite Leagues ─────────────────────────────────────────────────────────

export async function getFavoriteLeagues(
    supabase: SupabaseClient,
    userId: string
): Promise<FavoriteLeagueEntry[]> {
    void supabase
    void userId
    return []
}

export async function saveFavoriteLeagues(
    supabase: SupabaseClient,
    userId: string,
    leagues: { leagueId: string; sportId: string }[]
): Promise<void> {
    void supabase
    void userId
    void leagues
}

// ─── League Discovery ─────────────────────────────────────────────────────────

export async function getLeaguesBySports(
    supabase: SupabaseClient,
    sportIds: string[]
): Promise<LeagueItem[]> {
    if (sportIds.length === 0) return []

    // Query 1: tournaments table
    // - Exclude only 'archived' (include draft, published, active)
    // - Use neq(is_visible, false) to include both true AND null values
    const { data: tourData, error: tourError } = await supabase
        .from('tournaments')
        .select('id, name, display_name, country_id, sport_id, logo_url, is_visible, slug')
        .in('sport_id', sportIds)
        .neq('is_visible', false)
        .order('name', { ascending: true });

    if (tourError) {
        console.error('[preferencesService] getLeaguesBySports tournaments error:', tourError.message)
    }

    // Query 2: unions table (federations/leagues/associations)
    // sport column may not exist — fetch all and filter client-side via branding JSONB
    const supabaseAny = supabase as any
    const { data: unionData, error: unionError } = await supabaseAny
        .from('unions')
        .select('id, name, country, branding')
        .order('name', { ascending: true })

    if (unionError) {
        console.error('[preferencesService] getLeaguesBySports unions error:', unionError?.message)
    }

    const results: LeagueItem[] = []

    // Map tournaments — use raw UUID as id (matches tournament IDs used in the home page)
    for (const t of (tourData ?? [])) {
        results.push({
            id: String(t.id),
            name: t.display_name || t.name,
            displayName: t.display_name ?? null,
            sport: t.sport_id,
            country: t.country_id ?? null,
            logoUrl: t.logo_url || null,
        })
    }

    // Map unions — extract sport from branding JSONB, filter client-side
    for (const u of (unionData ?? [])) {
        const effectiveSport = u.branding?.organization?.identity?.sport
        if (!effectiveSport || !sportIds.includes(effectiveSport)) continue
        results.push({
            id: String(u.id),
            name: u.name,
            displayName: null,
            sport: effectiveSport,
            country: u.country ?? null,
            logoUrl: u.branding?.logo_url ?? null,
        })
    }

    return results.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
