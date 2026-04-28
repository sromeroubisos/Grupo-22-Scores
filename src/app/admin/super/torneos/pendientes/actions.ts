'use server';

import { revalidatePath } from 'next/cache';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import type { Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TOURNAMENT_REVIEW_STATUS } from '@/lib/tournamentReview';

type TournamentUpdate = Database['public']['Tables']['tournaments']['Update'];

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function textValue(formData: FormData, key: string) {
    const value = formData.get(key);
    if (typeof value !== 'string') return '';
    return value.trim();
}

function nullableText(formData: FormData, key: string) {
    const value = textValue(formData, key);
    return value.length > 0 ? value : null;
}

function requireTournamentId(formData: FormData) {
    const id = textValue(formData, 'id');
    if (!UUID_REGEX.test(id)) {
        throw new Error('ID de torneo invalido.');
    }
    return id;
}

function getPendingTournamentMetadata(formData: FormData): TournamentUpdate {
    const name = textValue(formData, 'name');
    if (!name) {
        throw new Error('El nombre del torneo es obligatorio.');
    }

    return {
        name,
        display_name: nullableText(formData, 'displayName') || name,
        season_id: nullableText(formData, 'seasonId'),
        sport_id: nullableText(formData, 'sportId'),
        country_id: nullableText(formData, 'countryId'),
        union_id: nullableText(formData, 'unionId'),
        category: nullableText(formData, 'category'),
        age_grade: nullableText(formData, 'ageGrade'),
        format: nullableText(formData, 'format'),
        review_notes: nullableText(formData, 'reviewNotes'),
    };
}

function revalidatePendingTournamentPaths(tournamentId: string) {
    [
        '/admin/super',
        '/admin/super/torneos',
        '/admin/super/torneos/pendientes',
        '/api/public/tournaments',
        `/tournaments/${tournamentId}`,
    ].forEach((path) => revalidatePath(path));
}

async function getSuperAdminContext() {
    const supabase = await createClient();
    return requireGlobalAdminContext(supabase);
}

async function assertPendingTournament(admin: ReturnType<typeof createAdminClient>, id: string) {
    const { data, error } = await admin
        .from('tournaments')
        .select('id, review_status')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    if (!data) {
        throw new Error('Torneo no encontrado.');
    }

    if (data.review_status !== TOURNAMENT_REVIEW_STATUS.pendingLink) {
        throw new Error('Este torneo ya no esta pendiente de vinculacion.');
    }
}

async function writeReviewAuditLog(
    actorUserId: string,
    tournamentId: string,
    action: string,
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
            source: 'super-admin-pending-tournaments',
        });
    } catch (error) {
        console.error('[super/torneos/pendientes/actions] audit log failed:', error);
    }
}

export async function savePendingTournament(formData: FormData) {
    const id = requireTournamentId(formData);
    const context = await getSuperAdminContext();
    const admin = createAdminClient();

    await assertPendingTournament(admin, id);

    const updates: TournamentUpdate = {
        ...getPendingTournamentMetadata(formData),
        status: 'draft',
        is_visible: false,
        review_status: TOURNAMENT_REVIEW_STATUS.pendingLink,
    };

    const { error } = await admin
        .from('tournaments')
        .update(updates)
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }

    await writeReviewAuditLog(context.userId, id, 'pending_review_update', updates as Record<string, unknown>);
    revalidatePendingTournamentPaths(id);
}

export async function publishPendingTournament(formData: FormData) {
    const id = requireTournamentId(formData);
    const context = await getSuperAdminContext();
    const admin = createAdminClient();

    await assertPendingTournament(admin, id);

    const updates: TournamentUpdate = {
        ...getPendingTournamentMetadata(formData),
        status: 'published',
        is_visible: true,
        review_status: TOURNAMENT_REVIEW_STATUS.approved,
        reviewed_by_user_id: context.userId,
        reviewed_at: new Date().toISOString(),
        linked_official_tournament_id: null,
    };

    const { error } = await admin
        .from('tournaments')
        .update(updates)
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }

    await writeReviewAuditLog(context.userId, id, 'pending_review_publish', updates as Record<string, unknown>);
    revalidatePendingTournamentPaths(id);
}

export async function linkPendingTournament(formData: FormData) {
    const id = requireTournamentId(formData);
    const officialTournamentId = textValue(formData, 'officialTournamentId');

    if (!UUID_REGEX.test(officialTournamentId) || officialTournamentId === id) {
        throw new Error('Selecciona un torneo oficial valido para vincular.');
    }

    const context = await getSuperAdminContext();
    const admin = createAdminClient();

    await assertPendingTournament(admin, id);

    const { data: official, error: officialError } = await admin
        .from('tournaments')
        .select('id, review_status')
        .eq('id', officialTournamentId)
        .maybeSingle();

    if (officialError) {
        throw new Error(officialError.message);
    }

    if (!official || official.review_status === TOURNAMENT_REVIEW_STATUS.pendingLink) {
        throw new Error('El torneo oficial seleccionado no esta disponible.');
    }

    const { error: matchError } = await admin
        .from('matches')
        .update({ tournament_id: officialTournamentId })
        .eq('tournament_id', id);

    if (matchError) {
        throw new Error(matchError.message);
    }

    const updates: TournamentUpdate = {
        review_status: TOURNAMENT_REVIEW_STATUS.linked,
        linked_official_tournament_id: officialTournamentId,
        status: 'archived',
        is_visible: false,
        review_notes: nullableText(formData, 'reviewNotes'),
        reviewed_by_user_id: context.userId,
        reviewed_at: new Date().toISOString(),
    };

    const { error } = await admin
        .from('tournaments')
        .update(updates)
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }

    await writeReviewAuditLog(context.userId, id, 'pending_review_link', {
        ...updates,
        officialTournamentId,
    });
    revalidatePendingTournamentPaths(id);
    revalidatePendingTournamentPaths(officialTournamentId);
}

export async function rejectPendingTournament(formData: FormData) {
    const id = requireTournamentId(formData);
    const context = await getSuperAdminContext();
    const admin = createAdminClient();

    await assertPendingTournament(admin, id);

    const updates: TournamentUpdate = {
        review_status: TOURNAMENT_REVIEW_STATUS.rejected,
        status: 'archived',
        is_visible: false,
        review_notes: nullableText(formData, 'reviewNotes'),
        reviewed_by_user_id: context.userId,
        reviewed_at: new Date().toISOString(),
    };

    const { error } = await admin
        .from('tournaments')
        .update(updates)
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }

    await writeReviewAuditLog(context.userId, id, 'pending_review_reject', updates as Record<string, unknown>);
    revalidatePendingTournamentPaths(id);
}
