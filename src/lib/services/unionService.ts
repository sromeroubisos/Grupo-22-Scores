'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { UnionRow } from '@/lib/cache/superAdminCache';
import { slugifyUnion } from '@/lib/unions';

export interface CreateUnionInput {
    name: string;
    slug?: string | null;
    country?: string | null;
    sport?: string | null;
    union_level?: string | null;
    parent_union_id?: string | null;
    branding?: Record<string, any> | null;
}

export async function createUnion(input: CreateUnionInput): Promise<{ success: boolean; union?: UnionRow; error?: string }> {
    try {
        const supabase = await createServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        const unionName = input.name.trim();
        if (!unionName) {
            return { success: false, error: 'El nombre es obligatorio' };
        }

        const normalizedSlug = slugifyUnion(input.slug || unionName);
        if (!normalizedSlug) {
            return { success: false, error: 'El slug es obligatorio' };
        }

        const { data: existingByName } = await supabase
            .from('unions')
            .select('id')
            .ilike('name', unionName)
            .limit(1);

        if (existingByName && existingByName.length > 0) {
            return { success: false, error: 'Ya existe una union con un nombre similar' };
        }

        const { data: existingSlug } = await supabase
            .from('unions')
            .select('id')
            .eq('id', normalizedSlug)
            .maybeSingle();

        if (existingSlug) {
            return { success: false, error: 'El slug ya esta en uso' };
        }

        const insertData: Record<string, any> = {
            id: normalizedSlug,
            name: unionName,
            country: input.country || null,
            sport: input.sport || null,
            union_level: input.union_level || null,
            parent_union_id: input.parent_union_id || null,
            branding: input.branding || null,
        };

        const result = await insertUnionWithFallback(supabase, insertData);
        if (result.error) throw result.error;

        if (user?.id) {
            await writeUnionAuditLog(user.id, normalizedSlug, 'create', {
                initial: {
                    name: unionName,
                    slug: normalizedSlug,
                    country: input.country || null,
                    sport: input.sport || null,
                    union_level: input.union_level || null,
                    parent_union_id: input.parent_union_id || null,
                },
            });
        }

        revalidatePath('/admin/super/uniones');
        revalidatePath(`/admin/super/uniones/${normalizedSlug}`);

        return { success: true, union: result.data as UnionRow };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}

export async function updateUnion(id: string, input: Partial<CreateUnionInput>): Promise<{ success: boolean; union?: UnionRow; error?: string }> {
    try {
        const supabase = await createServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        const { data: previous } = await supabase
            .from('unions')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        const updateData: Record<string, any> = { ...input };
        const result = await updateUnionWithFallback(supabase, id, updateData);

        if (result.error) throw result.error;

        if (user?.id && previous && result.data) {
            const changes: Record<string, { old: any; new: any }> = {};
            for (const key of ['name', 'country', 'sport', 'union_level', 'parent_union_id', 'branding']) {
                if (JSON.stringify((previous as any)[key]) !== JSON.stringify((result.data as any)[key])) {
                    changes[key] = {
                        old: (previous as any)[key],
                        new: (result.data as any)[key],
                    };
                }
            }

            if (Object.keys(changes).length > 0) {
                await writeUnionAuditLog(user.id, id, 'update', changes);
            }
        }

        revalidatePath('/admin/super/uniones');
        revalidatePath(`/admin/super/uniones/${id}`);

        return { success: true, union: result.data as UnionRow };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}

export async function deleteUnion(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createServerClient();
        const { error } = await supabase.from('unions').delete().eq('id', id);
        if (error) throw error;

        revalidatePath('/admin/super/uniones');

        return { success: true };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar. Asegurate que no haya clubes vinculados.' };
    }
}

async function insertUnionWithFallback(supabase: any, payload: Record<string, any>) {
    let { data, error } = await supabase
        .from('unions')
        .insert(payload)
        .select('*')
        .single();

    if (error && isSchemaFallbackError(error)) {
        delete payload.sport;
        delete payload.union_level;
        delete payload.parent_union_id;

        const retry = await supabase
            .from('unions')
            .insert(payload)
            .select('*')
            .single();

        data = retry.data;
        error = retry.error;
    }

    return { data, error };
}

async function updateUnionWithFallback(supabase: any, id: string, payload: Record<string, any>) {
    let { data, error } = await supabase
        .from('unions')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

    if (error && isSchemaFallbackError(error)) {
        delete payload.sport;
        delete payload.union_level;
        delete payload.parent_union_id;

        const retry = await supabase
            .from('unions')
            .update(payload)
            .eq('id', id)
            .select('*')
            .single();

        data = retry.data;
        error = retry.error;
    }

    return { data, error };
}

function isSchemaFallbackError(error: { code?: string; message?: string }) {
    return error.code === 'PGRST204'
        || error.message?.includes('column')
        || error.message?.includes('schema cache');
}

async function writeUnionAuditLog(
    userId: string,
    entityId: string,
    action: 'create' | 'update',
    changes: Record<string, any>,
) {
    try {
        const admin = createAdminClient();
        await admin.from('admin_audit_log').insert({
            actor_user_id: userId,
            entity_type: 'union',
            entity_id: entityId,
            action,
            changes,
            source: 'union-service',
        });
    } catch (error) {
        console.error('[unionService] No se pudo escribir auditoria', error);
    }
}
