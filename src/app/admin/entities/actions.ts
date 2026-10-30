'use server'

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    canManageClubContext,
    canManageSportContext,
    canManageTournamentContext,
    getClubManagementTarget,
    getTournamentManagementTarget,
    hasScopedMembershipAccess,
    requireUserAccessContext,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import { ensureMatchManagementAccess } from '@/lib/server/matchCenterAdmin';
import { revalidatePath } from 'next/cache';
import { EntityType } from '@/lib/services/entityResolver';
import { resolveTournamentCountryLabel } from '@/lib/data/countries';
import { getMissingTournamentPriorityMessage, isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { getClubDashboardOverview } from '@/lib/club-admin/dashboard';
import { getClubFamilySummary } from '@/lib/club-admin/managedClubFamily';
import {
    autoDetectPreviousSeasonTournamentId,
    ensureChronologicalSeasonEdgesForCluster,
    upsertPreviousSeasonEdge,
} from '@/lib/tournamentSeasonChain';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const SCHEMAS: Record<EntityType, z.ZodObject<any>> = {
    tournament: z.object({
        name: z.string().min(3, 'El nombre requiere al menos 3 caracteres'),
        display_name: z.string().optional().nullable(),
        slug: z.string().regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones').optional().nullable(),
        season_id: z.string().optional().nullable(),
        union_id: z.string().optional().nullable(), // unions use TEXT IDs
        sport_id: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        age_grade: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        country_id: z.string().optional().nullable(),
        region: z.string().optional().nullable(),
        status: z.enum(['draft', 'published', 'active', 'archived']).optional().nullable(),
        is_visible: z.boolean().optional().nullable(),
        is_popular: z.boolean().optional().nullable(),
        sync_locked: z.boolean().optional().nullable(),
        logo_url: z.string().optional().nullable(),
        /** Color del banner de la pantalla pública (#RRGGBB). Vacío = el color sale del escudo. */
        primary_color: z
            .string()
            .optional()
            .nullable()
            .refine((v) => v == null || v === '' || /^#[0-9a-fA-F]{6}$/.test(v), 'El color del banner debe ser #RRGGBB'),
        priority: z.number().int().optional().nullable(),
        format: z.string().optional().nullable(),
        ruleset: z.record(z.string(), z.any()).optional().nullable(),
        /** Opcional: UUID del torneo edicion anterior (misma competencia). Si no se envia, se intenta detectar por slug `nombre-AAAA`. */
        link_previous_season_tournament_id: z
            .string()
            .optional()
            .nullable()
            .refine((v) => v == null || v === '' || UUID_REGEX.test(v), 'UUID de temporada anterior invalido'),
    }),
    club: z.object({
        id: z.string().optional(), // clubs use TEXT IDs (slugs)
        name: z.string().min(1, 'El nombre es requerido'),
        short_name: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        region: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        union_id: z.string().optional().nullable(), // unions use TEXT IDs
        logo_url: z.string().optional().nullable(),
        primary_color: z.string().optional().nullable(),
        slug: z.string().optional().nullable(),
        is_visible: z.boolean().optional().nullable(),
        categories: z.array(z.string()).optional().nullable(),
    }),
    match: z.object({
        date_time: z.string().min(1, 'Fecha y hora requerida'),
        tournament_id: z.string().uuid('Torneo inválido').optional().nullable(),
        home_club_id: z.string().optional().nullable(), // clubs use TEXT IDs
        away_club_id: z.string().optional().nullable(), // clubs use TEXT IDs
        venue: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        round_id: z.string().optional().nullable(),
        score: z.record(z.string(), z.any()).optional().nullable(),
        clock: z.record(z.string(), z.any()).optional().nullable(),
    }),
    player: z.object({
        name: z.string().min(1, 'El nombre es requerido'),
        club_id: z.string().optional().nullable(), // clubs use TEXT IDs
        position: z.string().optional().nullable(),
        nationality: z.string().optional().nullable()
    }),
    union: z.object({
        id: z.string().optional(), // unions use TEXT IDs
        name: z.string().min(3, 'El nombre requiere al menos 3 caracteres'),
        country: z.string().optional().nullable(),
        branding: z.record(z.string(), z.any()).optional().nullable(),
    })
};

const TABLE: Record<EntityType, string> = {
    club: 'clubs',
    tournament: 'tournaments',
    player: 'players',
    match: 'matches',
    union: 'unions',
};

function getActionErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        if (error.message === 'Unauthorized') {
            return 'Tu sesion expiro. Volve a iniciar sesion e intenta de nuevo.';
        }

        if (error.message === 'Forbidden') {
            return 'No tenes permisos para crear o editar este torneo con el alcance seleccionado.';
        }

        return error.message;
    }

    if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
    ) {
        return (error as { message: string }).message;
    }

    return fallback;
}

async function runTournamentWriteWithPriorityFallback(
    type: EntityType,
    payload: Record<string, any>,
    mutate: (nextPayload: Record<string, any>) => PromiseLike<{ data: any; error: any }>
): Promise<{ data: any; error: any }> {
    const firstAttempt = await mutate(payload);

    if (
        type !== 'tournament'
        || firstAttempt.error == null
        || payload.priority === undefined
        || !isMissingColumnError(firstAttempt.error, 'priority')
    ) {
        return firstAttempt;
    }

    const { priority: _ignoredPriority, ...payloadWithoutPriority } = payload;

    if (Object.keys(payloadWithoutPriority).length === 0) {
        return {
            data: null,
            error: {
                message: getMissingTournamentPriorityMessage(),
            },
        };
    }

    console.warn('[admin/entities/actions] priority column missing. Retrying tournament write without priority.');
    return mutate(payloadWithoutPriority);
}

function sanitizeFields(
    type: EntityType,
    updates: Record<string, any>,
    mode: 'create' | 'update' = 'create',
): Record<string, any> {
    const baseSchema = SCHEMAS[type];
    if (!baseSchema) throw new Error(`Invalid entity type: ${type}`);
    const schema = mode === 'update' ? baseSchema.partial() : baseSchema;

    const result = schema.safeParse(updates);
    if (!result.success) {
        const firstError = result.error.issues[0];
        throw new Error(`Validation Error: ${firstError.path.join('.')} - ${firstError.message}`);
    }

    if (mode === 'update' && Object.keys(result.data).length === 0) {
        throw new Error('Validation Error: no hay campos validos para actualizar');
    }

    if (type === 'tournament') {
        return normalizeTournamentLifecyclePayload(result.data);
    }

    return result.data;
}

function getDefaultTournamentVisibilityForStatus(status: unknown): boolean | null {
    if (typeof status !== 'string') return null;

    const normalizedStatus = status.trim().toLowerCase();
    if (normalizedStatus === 'published' || normalizedStatus === 'active') return true;
    if (normalizedStatus === 'draft' || normalizedStatus === 'archived') return false;

    return null;
}

function normalizeTournamentLifecyclePayload<T extends Record<string, any>>(payload: T): T {
    if (Object.prototype.hasOwnProperty.call(payload, 'is_visible')) {
        return payload;
    }

    const defaultVisibility = getDefaultTournamentVisibilityForStatus(payload.status);
    if (defaultVisibility === null) {
        return payload;
    }

    return {
        ...payload,
        is_visible: defaultVisibility,
    } as T;
}

async function writeAuditLog(
    userId: string,
    type: EntityType,
    entityId: string,
    action: 'create' | 'update' | 'delete',
    changes: Record<string, any>
) {
    try {
        const admin = createAdminClient();
        await admin.from('admin_audit_log').insert({
            actor_user_id: userId,
            entity_type: type,
            entity_id: entityId,
            action,
            changes,
            source: 'unified-admin',
        });
    } catch (err) {
        console.error('[audit] Failed to write audit log:', err);
    }
}

function readOptionalScopedId(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

async function ensureTournamentCountryExists(payload: Record<string, any>) {
    const countryId = readOptionalScopedId(payload.country_id);
    if (!countryId) return;

    const rawCountry = typeof payload.country === 'string' ? payload.country.trim() : '';
    const countryName = rawCountry || resolveTournamentCountryLabel(countryId) || countryId;
    const admin = createAdminClient() as any;

    const { error } = await admin
        .from('countries')
        .upsert(
            {
                id: countryId,
                name: countryName,
            },
            { onConflict: 'id' },
        );

    if (error && !error.message?.includes('Could not find the table')) {
        throw new Error(error.message || 'No se pudo asegurar el país del torneo.');
    }
}

async function getTournamentMutationContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    tournamentId: string
) {
    const context = await requireUserAccessContext(supabase);
    const target = await getTournamentManagementTarget(supabase, tournamentId);

    if (!target) {
        throw new Error(`Tournament not found (${tournamentId})`);
    }

    if (!canManageTournamentContext(context, target)) {
        throw new Error('Forbidden');
    }

    return {
        actorUserId: context.userId,
        writer: createAdminClient(),
    };
}

async function getTournamentCreateContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    payload: Record<string, any>
) {
    const context = await requireUserAccessContext(supabase);
    const sportId = readOptionalScopedId(payload.sport_id);
    const unionId = readOptionalScopedId(payload.union_id);
    const canCreate =
        canManageSportContext(context, sportId) ||
        hasScopedMembershipAccess(context, 'union', unionId);

    if (!canCreate) {
        throw new Error('Forbidden');
    }

    return {
        actorUserId: context.userId,
        writer: createAdminClient(),
    };
}

// ── ALCANCE (defensa en profundidad) ───────────────────────────────────────
/*
 * Club, unión, jugador y partido se escriben con el cliente del usuario, así
 * que RLS es la primera barrera. Pero una server action se puede invocar con
 * cualquier payload, sin pasar por el editor, y el RLS de estas tablas ya tuvo
 * agujeros: el alcance se chequea también acá, con la misma regla que usa el
 * resto del panel.
 */
async function canManageClubId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    context: UserAccessContext,
    clubId: unknown,
): Promise<boolean> {
    if (typeof clubId !== 'string' || !clubId) return false;
    const target = await getClubManagementTarget(supabase, clubId).catch(() => null);
    return Boolean(target && canManageClubContext(context, target));
}

async function canManageTournamentId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    context: UserAccessContext,
    tournamentId: unknown,
): Promise<boolean> {
    if (typeof tournamentId !== 'string' || !UUID_REGEX.test(tournamentId)) return false;
    const target = await getTournamentManagementTarget(supabase, tournamentId);
    return Boolean(target && canManageTournamentContext(context, target));
}

async function assertEntityScope(
    supabase: Awaited<ReturnType<typeof createClient>>,
    type: EntityType,
    mode: 'create' | 'update' | 'delete',
    id: string | null,
    payload: Record<string, any>,
): Promise<void> {
    if (type === 'tournament') return; // tiene su propio contexto (getTournament*Context)

    const context = await requireUserAccessContext(supabase);
    if (isGlobalAdminRole(context.role)) return;

    let allowed = false;

    if (type === 'union') {
        // Crear una unión es de admin global; editarla, de quien la gestiona.
        allowed = mode !== 'create' && hasScopedMembershipAccess(context, 'union', id);
    } else if (type === 'club') {
        if (mode === 'create') {
            allowed = hasScopedMembershipAccess(context, 'union', readOptionalScopedId(payload.union_id));
        } else {
            allowed = await canManageClubId(supabase, context, id);
        }
    } else if (type === 'player') {
        let clubId: unknown = payload.club_id;
        if (mode !== 'create' && id) {
            const { data: current } = await supabase.from('players').select('club_id').eq('id', id).maybeSingle();
            clubId = (current as { club_id?: string | null } | null)?.club_id ?? null;
        }
        allowed = await canManageClubId(supabase, context, clubId);
        // Mover el jugador a otro club exige poder gestionar también el destino.
        if (allowed && mode === 'update' && payload.club_id && payload.club_id !== clubId) {
            allowed = await canManageClubId(supabase, context, payload.club_id);
        }
    } else if (type === 'match') {
        if (mode === 'create') {
            allowed = payload.tournament_id
                ? await canManageTournamentId(supabase, context, payload.tournament_id)
                : (await canManageClubId(supabase, context, payload.home_club_id)) ||
                  (await canManageClubId(supabase, context, payload.away_club_id));
        } else if (id) {
            allowed = await ensureMatchManagementAccess(id).then(() => true, () => false);
            // Pasar el partido a otro torneo exige poder gestionar el destino.
            if (allowed && mode === 'update' && payload.tournament_id) {
                allowed = await canManageTournamentId(supabase, context, payload.tournament_id);
            }
        }
    }

    if (!allowed) {
        throw new Error('Forbidden');
    }
}

// ── CREATE (INSERT) ─────────────────────────────────────────────────────────
export async function createEntity(
    type: EntityType,
    payload: Record<string, any>
): Promise<{ success: true; id: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // For unions and clubs, we allow custom string IDs or generate UUIDs
    // If payload already has an ID (e.g. 'urba'), we use it.
    const payloadWithId = {
        ...payload,
        id: payload.id || (type === 'union' || type === 'club' ? crypto.randomUUID() : undefined)
    };

    const cleanPayload = sanitizeFields(type, payloadWithId, 'create');

    // Manually push ID back if it was generated/provided and stripped by Zod 
    // (Wait, I added 'id' to the schema for union/club now, so it shouldn't be stripped if provided).
    if (payloadWithId.id && !cleanPayload.id && (type === 'union' || type === 'club')) {
        (cleanPayload as any).id = payloadWithId.id;
    }

    const table = TABLE[type];
    await assertEntityScope(supabase, type, 'create', null, cleanPayload);
    const tournamentContext = type === 'tournament'
        ? await getTournamentCreateContext(supabase, cleanPayload)
        : null;
    const mutationClient = tournamentContext?.writer ?? supabase;
    const actorUserId = tournamentContext?.actorUserId ?? user.id;

    if (type === 'tournament') {
        await ensureTournamentCountryExists(cleanPayload);
    }

    let insertPayload: Record<string, any> = cleanPayload;
    let explicitPreviousSeasonId: string | null = null;
    if (type === 'tournament') {
        explicitPreviousSeasonId = readOptionalScopedId(cleanPayload.link_previous_season_tournament_id);
        const { link_previous_season_tournament_id: _omitLink, ...rest } = cleanPayload as Record<string, any>;
        insertPayload = rest;
    }

    const { data, error } = await runTournamentWriteWithPriorityFallback(type, insertPayload, (nextPayload) =>
        mutationClient.from(table).insert(nextPayload).select().single()
    );
    if (error) {
        throw new Error(error.message);
    }

    const id: string = data.id;

    if (type === 'tournament') {
        try {
            const writer = mutationClient as any;
            let prev = explicitPreviousSeasonId;
            if (!prev) {
                prev = await autoDetectPreviousSeasonTournamentId(writer, {
                    id: data.id,
                    sport_id: data.sport_id,
                    country_id: data.country_id,
                    slug: data.slug,
                    season_id: data.season_id,
                    display_name: data.display_name,
                    name: data.name,
                });
            }
            if (prev) {
                await upsertPreviousSeasonEdge(writer, prev, data.id);
            }
            await ensureChronologicalSeasonEdgesForCluster(writer, data.id);
        } catch (chainErr) {
            console.warn('[admin/entities/createEntity] season chain', chainErr);
        }
    }

    await writeAuditLog(actorUserId, type, id, 'create', { initial: cleanPayload });

    revalidatePath('/admin/super');
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`);

    return { success: true, id };
}

export async function createEntitySafe(
    type: EntityType,
    payload: Record<string, any>
): Promise<{ success: true; id: string; error?: undefined } | { success: false; error: string; id?: undefined }> {
    try {
        return await createEntity(type, payload);
    } catch (error) {
        return {
            success: false,
            error: getActionErrorMessage(error, 'No se pudo crear la entidad.'),
        };
    }
}

// ── UPDATE ─────────────────────────────────────────────────────────────────
export async function updateEntity(
    type: EntityType,
    id: string,
    updates: Record<string, any>
): Promise<{ success: true; id: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Guard: disallow sentinel IDs in update path
    if (id === 'new' || id === 'crear') {
        throw new Error(`Invalid id '${id}' for updateEntity — use createEntity instead.`);
    }

    // Validate ID format based on entity type
    const textBasedIds: EntityType[] = ['club', 'union'];
    if (!textBasedIds.includes(type) && !UUID_REGEX.test(id)) {
        throw new Error(`Invalid ID format: ${type} requires a UUID.`);
    }

    const cleanUpdates = sanitizeFields(type, updates, 'update');
    const table = TABLE[type];
    await assertEntityScope(supabase, type, 'update', id, cleanUpdates);
    const tournamentContext = type === 'tournament'
        ? await getTournamentMutationContext(supabase, id)
        : null;
    const mutationClient = tournamentContext?.writer ?? supabase;
    const actorUserId = tournamentContext?.actorUserId ?? user.id;

    let updatePayload: Record<string, any> = cleanUpdates;
    let explicitPreviousSeasonOnUpdate: string | null = null;
    if (type === 'tournament') {
        explicitPreviousSeasonOnUpdate = readOptionalScopedId(cleanUpdates.link_previous_season_tournament_id);
        const { link_previous_season_tournament_id: _omitLinkUpd, ...restUpd } = cleanUpdates as Record<string, any>;
        updatePayload = restUpd;
    }

    if (type === 'tournament') {
        await ensureTournamentCountryExists(updatePayload);
    }

    // Pre-state for audit diff
    const { data: oldData } = await mutationClient.from(table as any).select('*').eq('id', id).single();

    let data: any = oldData;
    if (Object.keys(updatePayload).length > 0) {
        const up = await runTournamentWriteWithPriorityFallback(type, updatePayload, (nextPayload) =>
            mutationClient.from(table).update(nextPayload).eq('id', id).select().single()
        );
        if (up.error) {
            throw new Error(up.error.message);
        }
        data = up.data;
    } else if (type !== 'tournament') {
        throw new Error('Validation Error: no hay campos validos para actualizar');
    }

    if (type === 'tournament') {
        try {
            const writer = mutationClient as any;
            if (explicitPreviousSeasonOnUpdate) {
                await upsertPreviousSeasonEdge(writer, explicitPreviousSeasonOnUpdate, id);
            }
            await ensureChronologicalSeasonEdgesForCluster(writer, id);
        } catch (chainErr) {
            console.warn('[admin/entities/updateEntity] season chain', chainErr);
        }
    }

    // Build diff for audit
    const schemaShape = SCHEMAS[type].shape;
    const allowed = Object.keys(schemaShape);
    const changes: Record<string, any> = {};
    if (oldData) {
        for (const key of allowed) {
            if (JSON.stringify(oldData[key]) !== JSON.stringify(data[key])) {
                changes[key] = { old: oldData[key], new: data[key] };
            }
        }
    }

    if (Object.keys(changes).length > 0) {
        await writeAuditLog(actorUserId, type, id, 'update', changes);
    }

    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`);

    return { success: true, id };
}

export async function updateEntitySafe(
    type: EntityType,
    id: string,
    updates: Record<string, any>
): Promise<{ success: true; id: string; error?: undefined } | { success: false; error: string; id?: undefined }> {
    try {
        return await updateEntity(type, id, updates);
    } catch (error) {
        return {
            success: false,
            error: getActionErrorMessage(error, 'No se pudo actualizar la entidad.'),
        };
    }
}

/**
 * Lo único que acepta la carga en vivo. Antes era `.update({ ...payload })`:
 * una server action recibe lo que el cliente quiera mandar, así que cualquier
 * columna de `matches` (torneo, clubes, visibilidad) se podía pisar desde acá.
 */
const MATCH_LIVE_SCHEMA = z.object({
    score: z.object({
        home: z.number().int().min(0).max(999),
        away: z.number().int().min(0).max(999),
    }).strict().optional(),
    status: z.enum(['scheduled', 'live', 'final', 'finished', 'postponed', 'suspended', 'cancelled', 'abandoned']).optional(),
}).strict();

export async function updateMatchLive(
    id: string,
    payload: {
        score?: { home: number; away: number };
        status?: string;
    }
): Promise<{ success: true }> {
    if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
        throw new Error('Invalid ID format: match requires a UUID.');
    }

    const parsed = MATCH_LIVE_SCHEMA.safeParse(payload ?? {});
    if (!parsed.success) {
        throw new Error('Validation Error: marcador o estado invalido');
    }

    // Mismo guard que el resto de la carga de partidos: global, o alcance
    // sobre el torneo / el club autor de ESTE partido.
    const context = await ensureMatchManagementAccess(id);

    const supabase = await createClient();
    const { error } = await supabase
        .from('matches')
        .update({
            ...parsed.data,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) throw new Error(error.message);

    await writeAuditLog(context.userId, 'match', id, 'update', { live_update: parsed.data });

    revalidatePath(`/admin/super/partidos/${id}`);
    revalidatePath(`/admin/entities/${id}/manage`);
    return { success: true };
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function deleteEntity(
    type: EntityType,
    id: string
): Promise<{ success: true }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const table = TABLE[type];
    await assertEntityScope(supabase, type, 'delete', id, {});
    const tournamentContext = type === 'tournament'
        ? await getTournamentMutationContext(supabase, id)
        : null;
    const mutationClient = tournamentContext?.writer ?? supabase;
    const actorUserId = tournamentContext?.actorUserId ?? user.id;
    const { error } = await mutationClient.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);

    await writeAuditLog(actorUserId, type, id, 'delete', { deleted: true });

    revalidatePath(`/admin/entities`);
    return { success: true };
}

// ── DUPLICATE TOURNAMENT ──────────────────────────────────────────────────
export async function duplicateTournament(
    id: string
): Promise<{ success: true; id: string }> {
    const supabase = await createClient();
    const { actorUserId, writer } = await getTournamentMutationContext(supabase, id);

    const { data: original, error: fetchError } = await writer
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !original) throw new Error('Could not find original tournament');

    const newId = crypto.randomUUID();
    const copy = {
        ...original,
        id: newId,
        name: `${original.name} (Copy)`,
        slug: `${original.slug}-copy-${Math.floor(Math.random() * 1000)}`,
        status: 'draft',
        is_visible: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Remove ID if zod strips it, or just use it since it's a new insert
    const { error } = await runTournamentWriteWithPriorityFallback('tournament', copy, (nextPayload) =>
        writer.from('tournaments').insert(nextPayload).select().single()
    );
    if (error) throw new Error(error.message);

    await writeAuditLog(actorUserId, 'tournament', newId, 'create', { duplicated_from: id });

    revalidatePath('/admin/super/torneos');
    return { success: true, id: newId };
}

// ── DASHBOARD HELPERS ──────────────────────────────────────────────────────
export async function getClubDashboardData(clubId: string) {
    const supabase = await createClient();
    const overview = await getClubDashboardOverview(supabase, clubId);

    return {
        ...overview,
        matches: overview.upcomingMatches.map((match) => ({
            id: match.id,
            date_time: match.dateTime ?? '',
            status: match.status,
            venue: match.venue,
            home: {
                name: match.home.name,
                short_name: match.home.shortName ?? match.home.name,
                logo_url: match.home.logoUrl ?? '',
            },
            away: {
                name: match.away.name,
                short_name: match.away.shortName ?? match.away.name,
                logo_url: match.away.logoUrl ?? '',
            },
            tournament: match.tournament ? { name: match.tournament.name } : null,
        })),
    };
}

export async function getClubRelatedClubsData(clubId: string) {
    const supabase = await createClient();
    try {
        return await getClubFamilySummary(supabase, clubId);
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string')
                ? (error as { message: string }).message
                : 'No se pudo cargar la familia de clubes';
        throw new Error(message);
    }
}

/**
 * Fetch a "Rich" tournament view with participating clubs and recent results
 */
export async function getTournamentRichData(tournamentId: string) {
    const supabase = await createClient();

    // Parallel fetch for speed
    const [matchesRes, standingsRes] = await Promise.all([
        supabase.from('matches')
            .select(`
                id, date_time, status, score,
                home:clubs!matches_home_club_id_fkey(id, name, logo_url, slug),
                away:clubs!matches_away_club_id_fkey(id, name, logo_url, slug)
            `)
            .eq('tournament_id', tournamentId)
            .order('date_time', { ascending: false })
            .limit(10),

        // This assumes a view or a separate service for standings
        // For now, let's just get the tournament details
        supabase.from('tournaments').select('*').eq('id', tournamentId).single()
    ]);

    return {
        tournament: standingsRes.data,
        recentMatches: matchesRes.data || []
    };
}

/**
 * Global match fetcher with all relations
 */
export async function getMatchFull(matchId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            home:clubs!matches_home_club_id_fkey(*),
            away:clubs!matches_away_club_id_fkey(*),
            tournament:tournaments(*)
        `)
        .eq('id', matchId)
        .single();

    if (error) throw error;
    return data;
}
