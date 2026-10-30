import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { canAdministerClubAccess, explainGrantDenial } from '@/lib/club-admin/grantAuthority';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

const INVITE_TOKEN_BYTES = 24;

function generateToken(): string {
    return randomBytes(INVITE_TOKEN_BYTES).toString('hex');
}

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

/** El detalle de Supabase va al log; a la pantalla, un mensaje fijo. */
function failure(scope: string, error: unknown, fallback: string) {
    console.error(`[api/club-admin/invites][${scope}]`, error);
    return err(fallback, 500);
}

const createInviteSchema = z.object({
    clubId: z.string().min(1),
    scopeType: z.enum(['club', 'club_family']),
    scopeId: z.string().min(1),
    role: z.enum(['admin', 'editor', 'operator', 'viewer']),
    expiresInDays: z.number().min(1).max(365).optional(),
    maxUses: z.number().min(1).max(1000).optional(),
});

const deleteInviteSchema = z.object({
    clubId: z.string().min(1),
    inviteId: z.string().min(1),
});

/**
 * Las invitaciones son accesos en potencia (y el GET devuelve los tokens): las
 * ve, crea y revoca SOLO el admin del club o un admin global. Antes alcanzaba
 * con ser editor, y un editor se mandaba un link de admin a sí mismo.
 */
async function resolveClubAccess(clubId: string) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) {
        return { error: err('No autenticado', 401), target: null, context: null };
    }

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) {
        return { error: err('Club no encontrado', 404), target: null, context: null };
    }

    if (!canAdministerClubAccess(context, target)) {
        return { error: err('Solo un admin del club puede gestionar invitaciones', 403), target: null, context: null };
    }

    return { error: null, target, context, userId: context.userId };
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        if (!clubId) {
            return err('club param required', 400);
        }

        const access = await resolveClubAccess(clubId);
        if (access.error || !access.target) {
            return access.error!;
        }

        const admin = createAdminClient();
        const { data: invites, error: invitesError } = await admin
            .from('club_invite_links')
            .select('id, club_id, scope_type, scope_id, role, token, created_at, expires_at, max_uses, use_count, used_by, used_at')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false });

        if (invitesError) throw invitesError;

        const { data: clubs, error: clubsError } = await admin
            .from('clubs')
            .select('id, name')
            .in('id', Array.from(new Set((invites ?? []).map((i) => i.scope_id))));

        if (clubsError) throw clubsError;

        const clubNameById = new Map((clubs ?? []).map((c) => [c.id, c.name]));

        const payload = (invites ?? []).map((invite) => ({
            id: invite.id,
            clubId: invite.club_id,
            scopeType: invite.scope_type,
            scopeId: invite.scope_id,
            scopeLabel: invite.scope_type === 'club_family'
                ? `Familia ${clubNameById.get(invite.scope_id) || invite.scope_id}`
                : (clubNameById.get(invite.scope_id) || invite.scope_id),
            role: invite.role,
            token: invite.token,
            createdAt: invite.created_at,
            expiresAt: invite.expires_at,
            maxUses: invite.max_uses,
            useCount: invite.use_count,
            usedBy: invite.used_by,
            usedAt: invite.used_at,
            url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/invitacion-club?token=${invite.token}`,
        }));

        return NextResponse.json({ ok: true, data: payload });
    } catch (error) {
        return failure('GET', error, 'No se pudieron cargar las invitaciones');
    }
}

export async function POST(request: NextRequest) {
    try {
        const parsed = createInviteSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return err('Payload invalido para crear invitacion', 400);
        }

        const { clubId, scopeType, scopeId, role, expiresInDays, maxUses } = parsed.data;
        const access = await resolveClubAccess(clubId);
        if (access.error || !access.target || !access.context) {
            return access.error!;
        }

        // Alcance del club activo, club_family solo si es admin de la familia,
        // y nunca un rol mayor que el propio.
        const denial = explainGrantDenial(access.context, access.target, scopeType, scopeId, role);
        if (denial) {
            return err(denial, 403);
        }

        const token = generateToken();
        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : null;

        const admin = createAdminClient();
        const { data: invite, error: insertError } = await admin
            .from('club_invite_links')
            .insert({
                club_id: clubId,
                scope_type: scopeType,
                scope_id: scopeId,
                role,
                token,
                created_by: access.userId,
                expires_at: expiresAt,
                max_uses: maxUses ?? null,
            })
            .select('id, token, created_at, expires_at, scope_type, scope_id, role, max_uses')
            .single();

        if (insertError) throw insertError;

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${new URL(request.url).origin}`;
        const url = `${baseUrl}/invitacion-club?token=${invite.token}`;

        return NextResponse.json({
            ok: true,
            data: {
                ...invite,
                url,
            },
        });
    } catch (error) {
        return failure('POST', error, 'No se pudo crear la invitacion');
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const parsed = deleteInviteSchema.safeParse({
            clubId: request.nextUrl.searchParams.get('clubId'),
            inviteId: request.nextUrl.searchParams.get('inviteId'),
        });

        if (!parsed.success) {
            return err('Payload invalido para revocar invitacion', 400);
        }

        const access = await resolveClubAccess(parsed.data.clubId);
        if (access.error || !access.target) {
            return access.error!;
        }

        const admin = createAdminClient();
        const { error: deleteError } = await admin
            .from('club_invite_links')
            .delete()
            .eq('id', parsed.data.inviteId)
            .eq('club_id', parsed.data.clubId);

        if (deleteError) throw deleteError;

        return NextResponse.json({ ok: true });
    } catch (error) {
        return failure('DELETE', error, 'No se pudo revocar la invitacion');
    }
}
