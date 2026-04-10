'use server'

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    canManageSportContext,
    canManageTournamentContext,
    getTournamentManagementTarget,
    hasScopedMembershipAccess,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';
import { EntityType } from '@/lib/services/entityResolver';
import { resolveTournamentCountryLabel } from '@/lib/data/countries';
import { getMissingTournamentPriorityMessage, isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { getClubDashboardOverview } from '@/lib/club-admin/dashboard';
import { getClubFamilySummary } from '@/lib/club-admin/managedClubFamily';
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
        logo_url: z.string().optional().nullable(),
        priority: z.number().int().optional().nullable(),
        format: z.string().optional().nullable(),
        ruleset: z.record(z.string(), z.any()).optional().nullable(),
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

    return result.data;
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
    const tournamentContext = type === 'tournament'
        ? await getTournamentCreateContext(supabase, cleanPayload)
        : null;
    const mutationClient = tournamentContext?.writer ?? supabase;
    const actorUserId = tournamentContext?.actorUserId ?? user.id;

    if (type === 'tournament') {
        await ensureTournamentCountryExists(cleanPayload);
    }

    const { data, error } = await runTournamentWriteWithPriorityFallback(type, cleanPayload, (nextPayload) =>
        mutationClient.from(table).insert(nextPayload).select().single()
    );
    if (error) {
        throw new Error(error.message);
    }

    const id: string = data.id;

    await writeAuditLog(actorUserId, type, id, 'create', { initial: cleanPayload });

    revalidatePath('/admin/entities/new');
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`);

    return { success: true, id };
}

export async function createEntitySafe(
    type: EntityType,
    payload: Record<string, any>
): Promise<{ success: true; id: string } | { success: false; error: string }> {
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
    const tournamentContext = type === 'tournament'
        ? await getTournamentMutationContext(supabase, id)
        : null;
    const mutationClient = tournamentContext?.writer ?? supabase;
    const actorUserId = tournamentContext?.actorUserId ?? user.id;

    if (type === 'tournament') {
        await ensureTournamentCountryExists(cleanUpdates);
    }

    // Pre-state for audit diff
    const { data: oldData } = await mutationClient.from(table as any).select('*').eq('id', id).single();

    const { data, error } = await runTournamentWriteWithPriorityFallback(type, cleanUpdates, (nextPayload) =>
        mutationClient.from(table).update(nextPayload).eq('id', id).select().single()
    );
    if (error) {
        throw new Error(error.message);
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
): Promise<{ success: true; id: string } | { success: false; error: string }> {
    try {
        return await updateEntity(type, id, updates);
    } catch (error) {
        return {
            success: false,
            error: getActionErrorMessage(error, 'No se pudo actualizar la entidad.'),
        };
    }
}

export async function updateMatchLive(
    id: string,
    payload: {
        score?: { home: number; away: number };
        status?: string;
    }
): Promise<{ success: true }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { error } = await supabase
        .from('matches')
        .update({
            ...payload,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) throw new Error(error.message);

    await writeAuditLog(user.id, 'match', id, 'update', { live_update: payload });

    revalidatePath(`/admin/matches/${id}`);
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
