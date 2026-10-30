import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClubManagementTarget, type UserAccessContext } from '@/lib/auth/permissions';
import { resolveBestUserRole, type MembershipLike, type MembershipScope } from '@/lib/auth/roles';
import { explainGrantDenial, type GrantScopeType } from '@/lib/club-admin/grantAuthority';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getReservedAdminRole } from '@/lib/types/user';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

const ROLE_RANK: Record<string, number> = { viewer: 1, operator: 2, editor: 3, admin: 4 };
const MAX_CLAIM_ATTEMPTS = 3;

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * El contexto de acceso de quien CREÓ la invitación, leído hoy. Un link vive
 * semanas: si a su autor le sacaron el admin (o nunca debió poder darlo), el
 * link no puede seguir repartiendo lo que él ya no tiene.
 */
async function loadCreatorContext(admin: AdminClient, createdBy: string | null): Promise<UserAccessContext | null> {
    if (!createdBy) return null;

    const [authResult, profileResult, membershipsResult] = await Promise.all([
        admin.auth.admin.getUserById(createdBy),
        admin.from('users').select('role').eq('id', createdBy).maybeSingle(),
        admin.from('memberships').select('scope_type, scope_id, role').eq('user_id', createdBy),
    ]);

    const authUser = authResult.data?.user;
    if (authResult.error || !authUser) return null;
    if (membershipsResult.error) throw membershipsResult.error;

    const role = resolveBestUserRole({
        reservedRole: getReservedAdminRole(authUser.email),
        profileRole: (profileResult.data as { role?: string | null } | null)?.role ?? null,
        appMetadata: authUser.app_metadata,
    });
    const memberships: MembershipLike[] = ((membershipsResult.data ?? []) as Array<{ scope_type: string; scope_id: string; role: string }>)
        .map((row) => ({ scopeType: row.scope_type as MembershipScope, scopeId: row.scope_id, role: row.role }));

    return { userId: createdBy, rawRole: role, role, memberships };
}

type InviteRow = {
    id: string;
    club_id: string;
    scope_type: string;
    scope_id: string;
    role: string;
    expires_at: string | null;
    max_uses: number | null;
    use_count: number | null;
    created_by: string | null;
};

/**
 * Reserva un uso del link con un update condicional sobre el `use_count` que
 * leímos: si otro aceptó en el medio, el update no toca filas y se relee.
 * Antes eran leer-sumar-escribir sueltos: dos aceptaciones simultáneas de un
 * link de 1 uso creaban dos memberships.
 */
async function claimInviteUse(admin: AdminClient, initial: InviteRow, userId: string): Promise<'ok' | 'exhausted' | 'gone'> {
    let invite: InviteRow | null = initial;

    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS && invite; attempt += 1) {
        const current = invite.use_count ?? 0;
        if (invite.max_uses !== null && invite.max_uses !== undefined && current >= invite.max_uses) {
            return 'exhausted';
        }

        const updates: Record<string, unknown> = { use_count: current + 1 };
        if (current === 0) {
            updates.used_by = userId;
            updates.used_at = new Date().toISOString();
        }

        let query = admin.from('club_invite_links').update(updates).eq('id', invite.id);
        query = invite.use_count === null || invite.use_count === undefined
            ? query.is('use_count', null)
            : query.eq('use_count', current);
        const { data, error } = await query.select('id');
        if (error) throw error;
        if (Array.isArray(data) && data.length > 0) return 'ok';

        const { data: fresh, error: freshError } = await admin
            .from('club_invite_links')
            .select('id, club_id, scope_type, scope_id, role, expires_at, max_uses, use_count, created_by')
            .eq('id', invite.id)
            .maybeSingle();
        if (freshError) throw freshError;
        invite = (fresh as InviteRow | null) ?? null;
    }

    return invite ? 'exhausted' : 'gone';
}

const acceptSchema = z.object({
    token: z.string().min(1),
});

export async function POST(request: NextRequest) {
    try {
        const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return err('Token requerido', 400);
        }

        const { token } = parsed.data;

        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return err('No autenticado', 401);
        }

        const admin = createAdminClient();

        // Buscar el link de invitación
        const { data: inviteData, error: inviteError } = await admin
            .from('club_invite_links')
            .select('id, club_id, scope_type, scope_id, role, expires_at, max_uses, use_count, created_by')
            .eq('token', token)
            .maybeSingle();

        if (inviteError) throw inviteError;
        const invite = inviteData as InviteRow | null;
        if (!invite) {
            return err('El link de invitacion no existe o fue revocado', 404);
        }

        // Verificar expiración
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return err('El link de invitacion expiro', 410);
        }

        // Verificar usos máximos
        if (invite.max_uses !== null && invite.max_uses !== undefined && (invite.use_count ?? 0) >= invite.max_uses) {
            return err('El link de invitacion ya alcanzo el limite de usos', 410);
        }

        // Quien creó el link tiene que poder dar HOY ese rol en ese alcance.
        const target = await getClubManagementTarget(admin as unknown as SupabaseServerClient, invite.club_id);
        const creator = await loadCreatorContext(admin, invite.created_by);
        const creatorDenial = target && creator
            ? explainGrantDenial(creator, target, invite.scope_type as GrantScopeType, invite.scope_id, invite.role)
            : 'missing';
        if (creatorDenial) {
            console.warn('[club-admin/invites/accept] invitacion sin respaldo vigente:', {
                inviteId: invite.id,
                createdBy: invite.created_by,
                reason: creatorDenial,
            });
            return err('La invitacion ya no es valida: pedile un link nuevo a un admin del club', 410);
        }

        if (invite.created_by === user.id) {
            return err('No podés aceptar una invitacion que creaste vos', 400);
        }

        // Primero se reserva el uso; recién después se da el acceso.
        const claim = await claimInviteUse(admin, invite, user.id);
        if (claim === 'gone') {
            return err('El link de invitacion no existe o fue revocado', 404);
        }
        if (claim === 'exhausted') {
            return err('El link de invitacion ya alcanzo el limite de usos', 410);
        }

        // Verificar si el usuario ya tiene membership en este scope
        const { data: existingMembership, error: existingError } = await admin
            .from('memberships')
            .select('id, role')
            .eq('user_id', user.id)
            .eq('scope_type', invite.scope_type)
            .eq('scope_id', invite.scope_id)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existingMembership) {
            // Solo sube: un link de "viewer" no le baja el rol a un admin.
            if ((ROLE_RANK[invite.role] ?? 0) > (ROLE_RANK[String(existingMembership.role)] ?? 0)) {
                const { error: updateError } = await admin
                    .from('memberships')
                    .update({ role: invite.role })
                    .eq('id', existingMembership.id);

                if (updateError) throw updateError;
            }
        } else {
            // Crear nueva membership
            const { error: insertError } = await admin
                .from('memberships')
                .insert({
                    user_id: user.id,
                    scope_type: invite.scope_type,
                    scope_id: invite.scope_id,
                    role: invite.role,
                });

            if (insertError) throw insertError;
        }

        return NextResponse.json({
            ok: true,
            data: {
                scopeType: invite.scope_type,
                scopeId: invite.scope_id,
                role: invite.role,
            },
        });
    } catch (error) {
        // El detalle (Supabase, Postgres) al log; a la pantalla, un mensaje fijo.
        console.error('[club-admin/invites/accept]', error);
        return err('No se pudo aceptar la invitacion. Probá de nuevo en unos segundos.', 500);
    }
}
