'use server'

import { createClient } from '@/lib/supabase/server';
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
        cleanUpdates[key] = updates[key];
    }

    let table = '';
    switch (type) {
        case 'club': table = 'clubs'; break;
        case 'tournament': table = 'tournaments'; break;
        case 'player': table = 'players'; break;
        case 'match': table = 'matches'; break;
    }

    // 4. Update via Supabase (RLS is strictly enforced here based on the active user session)
    const { error } = await supabase
        .from(table)
        .update(cleanUpdates)
        .eq('id', id);

    if (error) {
        console.error(`Error updating ${type}:`, error);
        throw new Error(error.message);
    }

    // Revalidate the manage page and the public page
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`); // Assumes classic route, handled internally

    return { success: true };
}
