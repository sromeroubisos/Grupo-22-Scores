/**
 * Tournament Sync Lock
 *
 * Candado por torneo contra escrituras automáticas. Si `tournaments.sync_locked`
 * es true, los procesos automáticos (syncs externos ESPN/FlashScore, webhook de
 * WhatsApp, imports) no deben modificar el torneo. La edición manual desde el
 * admin sigue permitida (esos flujos no consultan este helper).
 */

import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { isUuid } from '@/lib/utils/postgrest';

export const TOURNAMENT_SYNC_LOCKED_MESSAGE = 'Este torneo está bloqueado contra sincronización automática';

// Acepta cualquier cliente Supabase (tipado, admin o "like"); solo usamos
// select/eq/maybeSingle sobre la tabla tournaments.
type SupabaseClientLike = { from(table: any): any };

/**
 * Devuelve true si el torneo tiene `sync_locked = true`.
 *
 * Manejo defensivo (no bloquear): si el id no es UUID, si la columna todavía
 * no existe (42703 / PGRST204) o si la consulta falla, retorna false.
 */
export async function isTournamentSyncLocked(
  supabase: SupabaseClientLike,
  tournamentId: string
): Promise<boolean> {
  if (!isUuid(tournamentId)) return false;

  try {
    const { data, error } = await supabase
      .from('tournaments')
      .select('sync_locked')
      .eq('id', tournamentId)
      .maybeSingle();

    if (error) {
      if (!isMissingColumnError(error, 'sync_locked')) {
        console.warn('[tournamentSyncLock] No se pudo consultar sync_locked:', {
          tournamentId,
          code: error.code ?? null,
          message: error.message ?? null,
        });
      }
      return false;
    }

    return (data as { sync_locked?: boolean | null } | null)?.sync_locked === true;
  } catch (error) {
    console.warn('[tournamentSyncLock] Error consultando sync_locked:', { tournamentId, error });
    return false;
  }
}

/**
 * Lanza un Error si el torneo está lockeado contra sincronización automática.
 */
export async function assertTournamentNotSyncLocked(
  supabase: SupabaseClientLike,
  tournamentId: string
): Promise<void> {
  if (await isTournamentSyncLocked(supabase, tournamentId)) {
    throw new Error(TOURNAMENT_SYNC_LOCKED_MESSAGE);
  }
}
