'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { Database } from '@/lib/database.types';

type MatchRow = Database['public']['Tables']['matches']['Row'];

// Only these fields are permitted in batch updates
const BATCH_MATCH_ALLOWED: Array<keyof Pick<MatchRow, 'status' | 'date_time'>> = ['status', 'date_time'];

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface BatchUpdateResult {
    ok: boolean;
    updated: number;
    errors?: Array<{ id: string; message: string }>;
}

export async function batchUpdateEntities(
    entityType: 'match',
    ids: string[],
    updates: { status?: string; date_time?: string }
): Promise<BatchUpdateResult> {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { ok: false, updated: 0, errors: [{ id: '__auth__', message: 'Unauthorized' }] };
    }

    // Validate ids: dedup + size limit
    if (!Array.isArray(ids) || ids.length === 0) {
        return { ok: false, updated: 0, errors: [{ id: '__ids__', message: 'No IDs provided' }] };
    }
    // Deduplicate
    const uniqueIds = [...new Set(ids)];
    // Enforce max batch size (abuse guard)
    if (uniqueIds.length > 200) {
        return { ok: false, updated: 0, errors: [{ id: '__ids__', message: `Batch too large: max 200, got ${uniqueIds.length}` }] };
    }
    const invalidIds = uniqueIds.filter(id => !UUID_REGEX.test(id));
    if (invalidIds.length > 0) {
        return {
            ok: false,
            updated: 0,
            errors: invalidIds.map(id => ({ id, message: 'Invalid UUID format' }))
        };
    }

    // Build clean updates (allowlisted only, typed per Update schema)
    const cleanUpdates: { status?: string; date_time?: string } = {};
    if ('status' in updates && updates.status !== undefined && updates.status !== null) {
        cleanUpdates.status = updates.status;
    }
    if ('date_time' in updates && updates.date_time !== undefined && updates.date_time !== null && updates.date_time !== '') {
        cleanUpdates.date_time = updates.date_time;
    }

    // Nothing to update — not an error, just a no-op
    if (Object.keys(cleanUpdates).length === 0) {
        return { ok: true, updated: 0 };
    }

    const errors: Array<{ id: string; message: string }> = [];
    let updated = 0;

    // Per-entity loop: pre-fetch → update → post-fetch → diff → audit
    for (const id of uniqueIds) {
        try {
            // 1. Pre-state
            const { data: preData } = await supabase
                .from('matches')
                .select('*')
                .eq('id', id)
                .single();

            // 2. Update (RLS enforced)
            const { error: updateError } = await supabase
                .from('matches')
                .update(cleanUpdates)
                .eq('id', id);

            if (updateError) {
                errors.push({ id, message: updateError.message });
                continue;
            }

            updated++;

            // 3. Post-state
            const { data: postData } = await supabase
                .from('matches')
                .select('*')
                .eq('id', id)
                .single();

            // 4. Diff (only allowlisted fields)
            const changes: Record<string, { old: unknown; new: unknown }> = {};
            if (preData && postData) {
                for (const key of BATCH_MATCH_ALLOWED) {
                    const oldVal = preData[key];
                    const newVal = postData[key];
                    if (oldVal !== newVal) {
                        changes[key] = { old: oldVal, new: newVal };
                    }
                }
            } else {
                for (const key of Object.keys(cleanUpdates) as Array<keyof typeof cleanUpdates>) {
                    changes[key as string] = { old: undefined, new: cleanUpdates[key] };
                }
            }

            // 5. Audit (fail-open, service_role — guaranteed write, no RLS)
            if (Object.keys(changes).length > 0) {
                try {
                    const supabaseAdmin = createAdminClient();
                    const { error: auditError } = await supabaseAdmin
                        .from('admin_audit_log')
                        .insert({
                            actor_user_id: user.id,
                            entity_type: entityType,
                            entity_id: id,
                            action: 'bulk_update',
                            changes,
                            source: 'bulk-admin'
                        });
                    if (auditError) throw auditError;
                } catch (auditErr: unknown) {
                    const msg = auditErr instanceof Error ? auditErr.message : String(auditErr);
                    console.error(`[audit] bulk_update failed for ${id}:`, msg);
                }
            }

            // Revalidate public page (best-effort)
            revalidatePath(`/matches/${id}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ id, message: msg });
        }
    }

    // Revalidate the admin manage pages broadly (no specific id here)
    revalidatePath('/admin/entities');

    return {
        ok: errors.length === 0,
        updated,
        errors: errors.length > 0 ? errors : undefined
    };
}
