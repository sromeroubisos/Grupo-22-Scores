import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { normalizePersistedBoardState, normalizeSavedPresets } from '@/lib/club-pizarra/persistence';
import { normalizeSport } from '@/lib/club-pizarra/utils';
import { createClient } from '@/lib/supabase/server';

type PizarraWorkspaceRow = {
    board_state?: unknown;
    saved_presets: unknown;
    updated_at: string | null;
};

type UntypedQueryBuilder = {
    select: (columns: string) => UntypedQueryBuilder;
    eq: (column: string, value: string) => UntypedQueryBuilder;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    upsert: (values: unknown, options?: { onConflict?: string }) => UntypedQueryBuilder;
    single: () => Promise<{ data: unknown; error: unknown }>;
};

type UntypedSupabaseClient = {
    from: (table: string) => UntypedQueryBuilder;
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

function isMissingTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

async function resolveClubAccess(clubId: string, allowedRoles: ReadonlySet<string>) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return { error: err('No autenticado', 401) };

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) return { error: err('Club no encontrado', 404) };

    if (!canManageClubContext(context, target, allowedRoles)) {
        return { error: err('Sin permisos para este club', 403) };
    }

    return { supabase, context, target };
}

export async function GET(request: NextRequest) {
    try {
        const clubId = normalizeText(request.nextUrl.searchParams.get('club'));
        if (!clubId) return err('club param required', 400);

        const sport = normalizeSport(request.nextUrl.searchParams.get('sport'));
        const view = normalizeText(request.nextUrl.searchParams.get('view'));
        const presetsOnly = view === 'presets';
        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if ('error' in access) return access.error;

        const table = (access.supabase as unknown as UntypedSupabaseClient).from('club_pizarra_workspaces');
        const selectColumns = presetsOnly
            ? 'saved_presets, updated_at'
            : 'board_state, saved_presets, updated_at';
        const { data, error } = await table
            .select(selectColumns)
            .eq('club_id', clubId)
            .eq('sport', sport)
            .maybeSingle();

        if (error) {
            const canEdit = canManageClubContext(access.context, access.target, EDIT_MEMBERSHIP_ROLES);
            if (isMissingTableError(error)) {
                return NextResponse.json({
                    ok: true,
                    data: {
                        boardState: null,
                        savedPresets: [],
                        storageMode: 'local',
                        available: false,
                        workspaceFound: false,
                        updatedAt: null,
                        canEdit,
                    },
                });
            }
            throw error;
        }

        const row = data as PizarraWorkspaceRow | null;
        const canEdit = canManageClubContext(access.context, access.target, EDIT_MEMBERSHIP_ROLES);

        return NextResponse.json({
            ok: true,
            data: {
                boardState: !presetsOnly && row ? normalizePersistedBoardState(row.board_state, sport) : null,
                savedPresets: row ? normalizeSavedPresets(row.saved_presets, sport) : [],
                storageMode: 'club',
                available: true,
                workspaceFound: Boolean(row),
                updatedAt: row?.updated_at ?? null,
                canEdit,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo cargar la pizarra del club';
        return err(message, 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const clubId = normalizeText(body.clubId);
        if (!clubId) return err('clubId required', 400);

        const sport = normalizeSport(normalizeText(body.sport));
        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if ('error' in access) return access.error;

        const payload = {
            club_id: clubId,
            sport,
            board_state: normalizePersistedBoardState(body.boardState, sport),
            saved_presets: normalizeSavedPresets(body.savedPresets, sport),
        };

        const table = (access.supabase as unknown as UntypedSupabaseClient).from('club_pizarra_workspaces');
        const { data, error } = await table
            .upsert(payload, { onConflict: 'club_id,sport' })
            .select('updated_at')
            .single();

        if (error) {
            if (isMissingTableError(error)) {
                return err(
                    'Falta la tabla club_pizarra_workspaces. Ejecuta la migracion 20260422180000_club_pizarra_workspaces.sql para habilitar el espacio privado del club.',
                    503
                );
            }
            throw error;
        }

        return NextResponse.json({
            ok: true,
            data: {
                storageMode: 'club',
                available: true,
                workspaceFound: true,
                updatedAt: (data as { updated_at?: string | null } | null)?.updated_at ?? null,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar la pizarra del club';
        return err(message, 500);
    }
}
