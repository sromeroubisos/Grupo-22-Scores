'use server'

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { EntityType } from '@/lib/services/entityResolver';
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

function sanitizeFields(type: EntityType, updates: Record<string, any>): Record<string, any> {
    const schema = SCHEMAS[type];
    if (!schema) throw new Error(`Invalid entity type: ${type}`);

    const result = schema.safeParse(updates);
    if (!result.success) {
        const firstError = result.error.issues[0];
        throw new Error(`Validation Error: ${firstError.path.join('.')} - ${firstError.message}`);
    }
    return result.data;
}

async function writeAuditLog(
    userId: string,
    type: EntityType,
    entityId: string,
    action: 'create' | 'update',
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

    const cleanPayload = sanitizeFields(type, payloadWithId);

    // Manually push ID back if it was generated/provided and stripped by Zod 
    // (Wait, I added 'id' to the schema for union/club now, so it shouldn't be stripped if provided).
    if (payloadWithId.id && !cleanPayload.id && (type === 'union' || type === 'club')) {
        (cleanPayload as any).id = payloadWithId.id;
    }

    const table = TABLE[type];

    const { data, error } = await supabase.from(table).insert(cleanPayload).select().single();
    if (error) {
        throw new Error(error.message);
    }

    const id: string = data.id;

    await writeAuditLog(user.id, type, id, 'create', { initial: cleanPayload });

    revalidatePath('/admin/entities/new');
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`);

    return { success: true, id };
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

    const cleanUpdates = sanitizeFields(type, updates);
    const table = TABLE[type];

    // Pre-state for audit diff
    const { data: oldData } = await supabase.from(table as any).select('*').eq('id', id).single();

    const { data, error } = await supabase.from(table).update(cleanUpdates).eq('id', id).select().single();
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
        await writeAuditLog(user.id, type, id, 'update', changes);
    }

    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath(`/${type}s/${id}`);

    return { success: true, id };
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
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);

    await writeAuditLog(user.id, type, id, 'update', { deleted: true });

    revalidatePath(`/admin/entities`);
    return { success: true };
}

// ── DUPLICATE TOURNAMENT ──────────────────────────────────────────────────
export async function duplicateTournament(
    id: string
): Promise<{ success: true; id: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { data: original, error: fetchError } = await supabase
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
    const { data, error } = await supabase.from('tournaments').insert(copy).select().single();
    if (error) throw new Error(error.message);

    await writeAuditLog(user.id, 'tournament', newId, 'create', { duplicated_from: id });

    revalidatePath('/admin/super/torneos');
    return { success: true, id: newId };
}

// ── DASHBOARD HELPERS ──────────────────────────────────────────────────────
export async function getClubDashboardData(clubId: string) {
    const supabase = await createClient();

    // 1. Get upcoming matches
    const { data: matches } = await supabase
        .from('matches')
        .select(`
            id, date_time, status, home_club_id, away_club_id, venue, score,
            home:clubs!matches_home_club_id_fkey(name, short_name, logo_url, slug),
            away:clubs!matches_away_club_id_fkey(name, short_name, logo_url, slug),
            tournament:tournaments(id, name, slug)
        `)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .gte('date_time', new Date().toISOString())
        .order('date_time', { ascending: true })
        .limit(3);

    return {
        matches: (matches as any[]) || []
    };
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
