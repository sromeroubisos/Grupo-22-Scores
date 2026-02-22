'use server'

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { EntityType } from '@/lib/services/entityResolver';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ALLOWED_FIELDS: Record<EntityType, string[]> = {
    tournament: ['name', 'season_id', 'region', 'status'],
    club: ['name', 'city', 'union_id', 'logo_url'],
    match: ['date_time', 'home_club_id', 'away_club_id', 'venue', 'status'],
    player: ['name', 'club_id', 'position', 'nationality']
};

export async function updateEntity(type: EntityType, id: string, updates: Record<string, any>) {
    const supabase = await createClient();

    // 1. Auth Check (Server-side session)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // 2. Validate IDs as UUID where applicable (clubs use string keys)
    if (type !== 'club' && !UUID_REGEX.test(id)) {
        throw new Error(`Invalid ID format. Entity ${type} requires a valid UUID.`);
    }

    // 3. Strict Field Allowlist Filtering
    const allowed = ALLOWED_FIELDS[type];
    if (!allowed) throw new Error('Invalid entity type');

    const cleanUpdates: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
        if (!allowed.includes(key)) {
            throw new Error(`Security Error: Modification of field '${key}' is not allowed for ${type}.`);
        }

        let value = updates[key];

        // Per-field FK UUID validation
        const isFkField = ['union_id', 'club_id', 'season_id', 'home_club_id', 'away_club_id'].includes(key);
        if (isFkField) {
            // Normalize empty string to null to avoid DB errors
            if (value === '') value = null;

            if (value !== null && !UUID_REGEX.test(value)) {
                throw new Error(`Validation Error: Field '${key}' must be a valid UUID or null.`);
            }
        }

        cleanUpdates[key] = value;
    }

    let table = '';
    switch (type) {
        case 'club': table = 'clubs'; break;
        case 'tournament': table = 'tournaments'; break;
        case 'player': table = 'players'; break;
        case 'match': table = 'matches'; break;
    }

    // Fetch pre-state
    const { data: preData } = await supabase.from(table as any).select('*').eq('id', id).single();

    // 4. Update via Supabase (RLS is strictly enforced here based on the active user session)
    const { error } = await supabase
        .from(table)
        .update(cleanUpdates)
        .eq('id', id);

    if (error) {
        console.error(`Error updating ${type}:`, error);
        throw new Error(error.message);
    }

    // Fetch post-state
    const { data: postData } = await supabase.from(table as any).select('*').eq('id', id).single();

    // Calculate deterministic diff
    const changes: Record<string, any> = {};
    if (preData && postData) {
        for (const key of allowed) {
            const oldVal = preData[key];
            const newVal = postData[key];
            if (oldVal !== newVal) {
                changes[key] = { old: oldVal, new: newVal };
            }
        }
    } else {
        // Fallback: log what we tried to update
        for (const key of Object.keys(cleanUpdates)) {
            changes[key] = { new: cleanUpdates[key] };
        }
    }

    if (Object.keys(changes).length > 0) {
        try {
            // Use admin client (service_role) for audit inserts:
            // - bypasses RLS → guaranteed write regardless of user JWT state
            // - entity updates above still use user session (RLS enforced)
            const supabaseAdmin = createAdminClient();
            const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
                actor_user_id: user.id,
                entity_type: type,
                entity_id: id,
                action: 'update',
                changes,
                source: 'unified-admin'
            });
            if (auditError) throw auditError;
        } catch (err: unknown) {
            // fail-open: log error server-side but never block the update
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[audit] Failed to write audit log:', msg);
        }
    }

    // Revalidate the manage page and the public page
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`); // Assumes classic route, handled internally

    return { success: true };
}
