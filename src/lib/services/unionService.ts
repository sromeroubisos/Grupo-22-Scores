'use server';

import { createClient as createServerClient } from '@/lib/supabase/server';
import { UnionRow } from '@/lib/cache/superAdminCache';

export interface CreateUnionInput {
    name: string;
    country?: string | null;
    sport?: string | null;
    union_level?: string | null;
    parent_union_id?: string | null;
}

export async function createUnion(input: CreateUnionInput): Promise<{ success: boolean; union?: UnionRow; error?: string }> {
    try {
        const supabase = await createServerClient();

        const unionName = input.name.trim();
        if (!unionName) {
            return { success: false, error: 'El nombre es obligatorio' };
        }

        // Check if it already exists case-insensitive
        const { data: existing } = await supabase
            .from('unions')
            .select('id')
            .ilike('name', unionName)
            .limit(1);

        if (existing && existing.length > 0) {
            return { success: false, error: 'Ya existe una unión con un nombre similar' };
        }

        const id = unionName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');

        const insertData: any = {
            id,
            name: unionName,
            country: input.country || null,
            sport: input.sport || null,
            union_level: input.union_level || null,
            parent_union_id: input.parent_union_id || null
        };

        let { data, error } = await supabase
            .from('unions')
            .insert(insertData)
            .select('*')
            .single();

        if (error && (error.code === 'PGRST204' || error.message.includes('column') || error.message.includes('schema cache'))) {
            // Eliminar columnas nuevas y reintentar
            delete insertData.sport;
            delete insertData.union_level;
            delete insertData.parent_union_id;

            const retry = await supabase
                .from('unions')
                .insert(insertData)
                .select('*')
                .single();

            data = retry.data;
            error = retry.error;
        }

        if (error) {
            throw error;
        }

        return { success: true, union: data as UnionRow };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}

export async function updateUnion(id: string, input: Partial<CreateUnionInput>): Promise<{ success: boolean; union?: UnionRow; error?: string }> {
    try {
        const supabase = await createServerClient();

        let updateData = { ...input };
        let { data, error } = await supabase
            .from('unions')
            .update(updateData)
            .eq('id', id)
            .select('*')
            .single();

        if (error && (error.code === 'PGRST204' || error.message.includes('column') || error.message.includes('schema cache'))) {
            delete updateData.sport;
            delete updateData.union_level;
            delete updateData.parent_union_id;

            const retry = await supabase
                .from('unions')
                .update(updateData)
                .eq('id', id)
                .select('*')
                .single();

            data = retry.data;
            error = retry.error;
        }

        if (error) {
            throw error;
        }

        return { success: true, union: data as UnionRow };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}

export async function deleteUnion(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createServerClient();
        const { error } = await supabase.from('unions').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar. Asegúrate que no haya clubes vinculados.' };
    }
}
