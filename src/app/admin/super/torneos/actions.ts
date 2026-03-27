'use server'

import { revalidatePath } from 'next/cache';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getMissingTournamentPriorityMessage, isMissingColumnError } from '@/lib/utils/supabaseSchema';

type TournamentUpdate = Database['public']['Tables']['tournaments']['Update'];

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ALLOWED_COLUMNS = [
    'name', 'slug', 'sport_id', 'country_id', 'union_id',
    'logo_url', 'banner_url', 'is_visible', 'is_popular',
    'display_name', 'status', 'season_id',
    'category', 'age_grade', 'format', 'ruleset',
    'primary_color', 'secondary_color', 'priority',
] as const;

type AllowedTournamentColumn = typeof ALLOWED_COLUMNS[number];

function sanitizeTournamentUpdates(updates: Partial<TournamentUpdate>) {
    const filteredUpdates: Partial<Pick<TournamentUpdate, AllowedTournamentColumn>> = {};

    for (const [key, value] of Object.entries(updates)) {
        if ((ALLOWED_COLUMNS as readonly string[]).includes(key)) {
            (filteredUpdates as Record<string, unknown>)[key] = value;
        }
    }

    return filteredUpdates;
}

async function writeTournamentAuditLog(
    actorUserId: string,
    tournamentId: string,
    action: 'update' | 'delete',
    changes: Record<string, unknown>
) {
    try {
        const admin = createAdminClient();
        await admin.from('admin_audit_log').insert({
            actor_user_id: actorUserId,
            entity_type: 'tournament',
            entity_id: tournamentId,
            action,
            changes,
            source: 'super-admin-tournaments',
        });
    } catch (error) {
        console.error('[super/torneos/actions] audit log failed:', error);
    }
}

async function runTournamentWriteWithPriorityFallback(
    payload: Record<string, unknown>,
    mutate: (nextPayload: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string | null; details?: string | null; code?: string | null } | null }>
) {
    const firstAttempt = await mutate(payload);

    if (
        firstAttempt.error == null ||
        payload.priority === undefined ||
        !isMissingColumnError(firstAttempt.error, 'priority')
    ) {
        return firstAttempt;
    }

    const payloadWithoutPriority = { ...payload };
    delete payloadWithoutPriority.priority;

    if (Object.keys(payloadWithoutPriority).length === 0) {
        return {
            data: null,
            error: { message: getMissingTournamentPriorityMessage() },
        };
    }

    console.warn('[super/torneos/actions] priority column missing. Retrying tournament update without priority.');
    return mutate(payloadWithoutPriority);
}

export async function updateSuperTournamentMeta(
    id: string,
    updates: Partial<TournamentUpdate>
): Promise<{ success: true; id: string }> {
    if (!UUID_REGEX.test(id)) {
        throw new Error(`ID de torneo invalido: ${id}`);
    }

    const supabase = await createClient();
    const context = await requireGlobalAdminContext(supabase);
    const admin = createAdminClient();

    const filteredUpdates = sanitizeTournamentUpdates(updates);
    if (Object.keys(filteredUpdates).length === 0) {
        throw new Error('No se enviaron campos validos para actualizar el torneo.');
    }

    const { data: existing, error: existingError } = await admin
        .from('tournaments')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (existingError) {
        throw new Error(existingError.message);
    }

    if (!existing) {
        throw new Error(`Torneo no encontrado (${id}).`);
    }

    const { error } = await runTournamentWriteWithPriorityFallback(
        filteredUpdates as Record<string, unknown>,
        (nextPayload) =>
            admin
                .from('tournaments')
                .update(nextPayload)
                .eq('id', id)
                .select('id')
                .maybeSingle()
    );

    if (error) {
        throw new Error(error.message || 'No se pudo actualizar el torneo.');
    }

    await writeTournamentAuditLog(context.userId, id, 'update', filteredUpdates as Record<string, unknown>);

    revalidatePath('/admin/super/torneos');
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/tournaments/${id}`);

    return { success: true, id };
}

export async function deleteSuperTournament(id: string): Promise<{ success: true }> {
    if (!UUID_REGEX.test(id)) {
        throw new Error(`ID de torneo invalido: ${id}`);
    }

    const supabase = await createClient();
    const context = await requireGlobalAdminContext(supabase);
    const admin = createAdminClient();

    const { error } = await admin.from('tournaments').delete().eq('id', id);
    if (error) {
        throw new Error(error.message);
    }

    await writeTournamentAuditLog(context.userId, id, 'delete', { deleted: true });

    revalidatePath('/admin/super/torneos');
    revalidatePath('/admin/entities');

    return { success: true };
}
