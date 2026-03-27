import { supabase } from '../supabase';
import { Database } from '../database.types';
import { normalizeError } from '../utils/errorUtils';
import { getMissingTournamentPriorityMessage, isMissingColumnError } from '../utils/supabaseSchema';

export interface TournamentGlobal {
  id: string;
  name: string;
  slug: string;
  sport_id: string;
  sport_name: string;
  country_id: string | null;
  country_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  is_active: boolean;
  is_popular: boolean;
  display_order: number | null;
  priority: number | null;
  followers_count: number;
  is_followed_by_user: boolean;
  created_at: string;
  updated_at: string;
  display_name?: string;
  original_name?: string;
  is_api_managed?: boolean;
}

export type TournamentUpdate = Database['public']['Tables']['tournaments']['Update'];

const TOURNAMENT_FALLBACK_SELECT_WITH_PRIORITY = `
  id, name, slug, sport_id, country_id, union_id,
  logo_url, is_popular, is_visible, display_name, status, priority,
  created_at, updated_at,
  sport:sports(name),
  country:countries(name),
  union:unions(name)
`;

const TOURNAMENT_FALLBACK_SELECT = `
  id, name, slug, sport_id, country_id, union_id,
  logo_url, is_popular, is_visible, display_name, status,
  created_at, updated_at,
  sport:sports(name),
  country:countries(name),
  union:unions(name)
`;

export const tournamentService = {
  /**
   * Fetches all tournaments from all sports in a single request.
   * Includes popularity, logos, and follower data.
   */
  async getAllTournaments(options: { 
    includeHidden?: boolean,
    userId?: string 
  } = {}): Promise<TournamentGlobal[]> {
    try {
      const { data, error } = await supabase.rpc('get_all_tournaments', {
        p_include_hidden: options.includeHidden || false,
        p_viewer_user_id: options.userId || null
      });

      if (error) {
        console.warn('[tournamentService] RPC failed, falling back to direct table query:', error.message);
        return this.getTournamentsFallback(options);
      }

      return data as TournamentGlobal[];
    } catch (err: any) {
      if (err.code === 'PGRST202' || err.message?.includes('not find the function') || err.message?.includes('priority')) {
        return this.getTournamentsFallback(options);
      }
      const normalized = normalizeError(err);
      console.error('[tournamentService] getAllTournaments failed:', normalized);
      throw normalized;
    }
  },

  /**
   * Fallback method when RPC is missing or failing
   */
  async getTournamentsFallback(options: { includeHidden?: boolean }): Promise<TournamentGlobal[]> {
    const buildQuery = (select: string) => {
      let query = supabase
        .from('tournaments')
        .select(select);

      if (!options.includeHidden) {
        // is_active was dropped, use status and is_visible
        query = query.eq('status', 'published').or('is_visible.eq.true,is_visible.is.null');
      }

      return query;
    };

    let { data, error } = await buildQuery(TOURNAMENT_FALLBACK_SELECT_WITH_PRIORITY);

    if (error && isMissingColumnError(error, 'priority')) {
      ({ data, error } = await buildQuery(TOURNAMENT_FALLBACK_SELECT));
    }

    if (error) {
      console.error('[tournamentService] Fallback also failed:', error);
      throw error;
    }

    // Dynamic selects degrade Supabase inference here; normalize to a plain row array.
    const rows = (data as any[]) || [];

    // Map to TournamentGlobal shape
    return rows.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug || '',
      sport_id: t.sport_id || '',
      sport_name: (t.sport as any)?.name || 'Unknown',
      country_id: t.country_id || null,
      country_name: (t.country as any)?.name || null,
      // organization_id column was dropped; fall back to union_id
      organization_id: t.union_id || null,
      organization_name: (t.union as any)?.name || null,
      logo_url: t.logo_url || null,
      is_active: t.status === 'published' && t.is_visible !== false,
      is_popular: t.is_popular === true,
      display_order: 0,
      priority: typeof t.priority === 'number' ? t.priority : 0,
      followers_count: 0,
      is_followed_by_user: false,
      created_at: t.created_at,
      updated_at: t.updated_at,
      display_name: t.display_name,
      original_name: null,
      is_api_managed: false
    })) as any[];
  },

  /**
   * Updates tournament metadata like popularity, logo, etc.
   * Only allows specific whitelisted columns to prevent errors with non-existent fields.
   */
  async updateTournamentMeta(id: string, updates: Partial<TournamentUpdate>) {
    // 1. Strict whitelist of REAL columns in 'tournaments' table
    const ALLOWED_COLUMNS = [
      'name', 'slug', 'sport_id', 'country_id', 'union_id',
      'logo_url', 'banner_url', 'is_visible', 'is_popular',
      'display_name', 'status', 'season_id',
      'category', 'age_grade', 'format', 'ruleset',
      'primary_color', 'secondary_color', 'priority'
    ];

    // 2. Filter payload strictly
    const filteredUpdates: any = {};
    const ignoredFields: string[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (ALLOWED_COLUMNS.includes(key)) {
        filteredUpdates[key] = value;
      } else {
        ignoredFields.push(key);
      }
    });

    // Detailed debug logs
    console.log(`[tournamentService] Updating tournament ${id}:`, {
      keys: Object.keys(filteredUpdates),
      is_popular_update: filteredUpdates.is_popular !== undefined ? filteredUpdates.is_popular : 'not_updating'
    });

    if (ignoredFields.length > 0) {
      console.warn('[tournamentService] IGNORED KEYS (Not in whitelist):', ignoredFields);
    }

    // Early exit if no valid columns to update
    if (Object.keys(filteredUpdates).length === 0) {
      console.warn('[tournamentService] No valid columns to update for tournament:', id);
      return null;
    }

    // 3. DEEP DIAGNOSIS
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    // Check UUID validity
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.error(`[tournamentService] INVALID UUID passed: ${id}`);
      throw new Error(`ID de torneo inválido: ${id}. No es un formato UUID válido.`);
    }

    // Step 3a: Existence check
    const { data: existing, error: checkError } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();

    if (checkError) {
      console.error('[tournamentService] Database check error:', checkError);
      throw new Error(`Error al verificar existencia del torneo: ${checkError.message}`);
    }

    if (!existing) {
      // If we are here, we might want to check if it's visible with a service role bypass (not possible client-side)
      // but we can check if there are ANY tournaments to see if it's a general connection issue.
      const { count } = await supabase.from('tournaments').select('*', { count: 'exact', head: true });
      
      console.error(`[tournamentService] Tournament ${id} not found. Total records in table visible to user: ${count}`);
      throw new Error(`Torneo NO ENCONTRADO (ID: ${id}). Es posible que haya sido eliminado o que el ID suministrado sea incorrecto.`);
    }

    // 4. PERFORM UPDATE
    const runUpdate = (payload: Record<string, unknown>) =>
      supabase
        .from('tournaments')
        .update(payload)
        .eq('id', id)
        .select()
        .maybeSingle();

    let { data, error, status } = await runUpdate(filteredUpdates);

    if (error && filteredUpdates.priority !== undefined && isMissingColumnError(error, 'priority')) {
      const { priority: _ignoredPriority, ...retryUpdates } = filteredUpdates;

      if (Object.keys(retryUpdates).length === 0) {
        throw new Error(getMissingTournamentPriorityMessage());
      }

      console.warn('[tournamentService] priority column missing. Retrying update without priority.');
      ({ data, error, status } = await runUpdate(retryUpdates));
    }

    if (error) {
      const normalized = normalizeError(error);
      console.error('[tournamentService] updateTournamentMeta failed:', {
        error: normalized,
        tournament_id: id,
        user_id: userId
      });

      // Special handling for RLS/Permissions
      if (normalized.code === '42501' || normalized.message.toLowerCase().includes('permission') || normalized.message.toLowerCase().includes('policy')) {
        let role = 'unknown';
        if (userId) {
          // Try table first
          const { data: userData } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
          
          if (userData?.role) {
            role = userData.role;
          } else {
            // Fallback to RPC which has SECURITY DEFINER
            const { data: rpcRole } = await (supabase as any).rpc('get_my_role');
            if (rpcRole) role = String(rpcRole);
          }
        }
        throw new Error(`PERMISO DENEGADO: Tu rol '${role}' no tiene permisos para actualizar torneos (Código RLS 42501).`);
      }

      throw normalized;
    }

    // 5. FINAL DIAGNOSIS
    if (!data) {
      console.error('[tournamentService] Update affected 0 rows despite record existing. RLS block detected.', { id, userId });
      
      let role = 'unknown';
      if (userId) {
        const { data: userData } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
        if (userData?.role) {
          role = userData.role;
        } else {
          const { data: rpcRole } = await (supabase as any).rpc('get_my_role');
          if (rpcRole) role = String(rpcRole);
        }
      }
      
      throw new Error(`BLOQUEO DE SEGURIDAD (RLS): El torneo existe, pero tu sesión (Rol: ${role}) no tiene permisos para modificar la tabla 'tournaments'.`);
    }

    return data;
  },

  /**
   * Toggles the follow status for a tournament.
   */
  async toggleFollow(tournamentId: string) {
    const { data, error } = await supabase.rpc('toggle_tournament_follow', {
      p_tournament_id: tournamentId
    });

    if (error) {
      console.error('Error toggling tournament follow:', error);
      throw error;
    }

    return data as boolean; // Returns true if followed, false if unfollowed
  },

  /**
   * Uploads a logo for a tournament.
   * Note: Assumes a 'tournament-logos' bucket exists in Supabase.
   */
  async uploadLogo(id: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${id}-${Math.random()}.${fileExt}`;
    const filePath = `logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('tournaments')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Error uploading logo:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('tournaments')
      .getPublicUrl(filePath);

    // Also update the tournament record
    await this.updateTournamentMeta(id, { logo_url: publicUrl });

    return publicUrl;
  }
};
