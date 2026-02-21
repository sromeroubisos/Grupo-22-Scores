'use server'

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { EntityType } from '@/lib/services/entityResolver';

export async function updateEntity(type: EntityType, id: string, updates: Record<string, any>) {
    const supabase = await createClient();

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    let table = '';
    switch (type) {
        case 'club': table = 'clubs'; break;
        case 'tournament': table = 'tournaments'; break;
        case 'player': table = 'players'; break;
        case 'match': table = 'matches'; break;
    }

    if (!table) throw new Error('Invalid entity type');

    const { error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id);

    if (error) {
        console.error(`Error updating ${type}:`, error);
        throw new Error(error.message);
    }

    // Revalidate the manage page and the public page (rough paths)
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`); // Assumes classic route, handled internally

    return { success: true };
}
