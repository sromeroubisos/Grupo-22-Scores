import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    MEMBERSHIP_ROLE_OPTIONS,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type MembershipRow = {
    id: string;
    user_id: string;
    scope_type: string;
    scope_id: string;
    role: string;
    created_at: string;
};

type UserRow = {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    last_login_at: string | null;
    role: string;
};

type ClubScopeRow = {
    id: string;
    name: string;
};

type AvailableScope = {
    scopeType: 'club' | 'club_family';
    scopeId: string;
    scopeLabel: string;
};

const createMembershipSchema = z.object({
    clubId: z.string().min(1),
    email: z.string().email(),
    scopeType: z.enum(['club', 'club_family']),
    scopeId: z.string().min(1),
    membershipRole: z.enum(['admin', 'editor', 'operator', 'viewer']),
});

const updateMembershipSchema = z.object({
    clubId: z.string().min(1),
    membershipId: z.string().min(1),
    membershipRole: z.enum(['admin', 'editor', 'operator', 'viewer']),
});

const deleteMembershipSchema = z.object({
    clubId: z.string().min(1),
    membershipId: z.string().min(1),
});

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function membershipScopeLabel(membership: MembershipRow, clubNameById: Map<string, string>) {
    const baseLabel = clubNameById.get(membership.scope_id) || membership.scope_id;
    return membership.scope_type === 'club_family' ? `Familia ${baseLabel}` : baseLabel;
}

function isRelevantMembership(
    membership: Pick<MembershipRow, 'scope_type' | 'scope_id'>,
    target: NonNullable<Awaited<ReturnType<typeof getClubManagementTarget>>>
) {
    return (
        (membership.scope_type === 'club' && membership.scope_id === target.clubId) ||
        (membership.scope_type === 'club_family' && membership.scope_id === target.familyRootId)
    );
}

async function resolveClubAccess(clubId: string, allowedRoles = ACCESS_VIEW_ROLE_SET) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) {
        return { error: err('No autenticado', 401), target: null };
    }

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) {
        return { error: err('Club no encontrado', 404), target: null };
    }

    if (!canManageClubContext(context, target, allowedRoles)) {
        return { error: err('Sin permisos para administrar este club', 403), target: null };
    }

    return { error: null, target };
}

async function buildUsersPayload(target: NonNullable<Awaited<ReturnType<typeof getClubManagementTarget>>>) {
    const admin = createAdminClient();
    const [{ data: clubMemberships, error: clubMembershipsError }, { data: familyMemberships, error: familyMembershipsError }, { data: clubs, error: clubsError }] = await Promise.all([
        admin
            .from('memberships')
            .select('id, user_id, scope_type, scope_id, role, created_at')
            .eq('scope_type', 'club')
            .eq('scope_id', target.clubId)
            .order('created_at', { ascending: false }),
        target.familyRootId === target.clubId
            ? Promise.resolve({ data: [], error: null })
            : admin
                .from('memberships')
                .select('id, user_id, scope_type, scope_id, role, created_at')
                .eq('scope_type', 'club_family')
                .eq('scope_id', target.familyRootId)
                .order('created_at', { ascending: false }),
        admin
            .from('clubs')
            .select('id, name')
            .in('id', Array.from(new Set([target.clubId, target.familyRootId]))),
    ]);

    if (clubMembershipsError) throw clubMembershipsError;
    if (familyMembershipsError) throw familyMembershipsError;
    if (clubsError) throw clubsError;

    const membershipRows = [
        ...((clubMemberships ?? []) as MembershipRow[]),
        ...((familyMemberships ?? []) as MembershipRow[]),
    ].filter((membership) => isRelevantMembership(membership, target));
    const clubRows = (clubs ?? []) as ClubScopeRow[];
    const userIds = Array.from(new Set(membershipRows.map((membership) => membership.user_id)));
    const clubNameById = new Map(clubRows.map((club) => [club.id, club.name]));
    const scopes: AvailableScope[] = [
        {
            scopeType: 'club',
            scopeId: target.clubId,
            scopeLabel: clubNameById.get(target.clubId) || target.clubId,
        },
    ];

    if (target.familyRootId !== target.clubId) {
        scopes.push({
            scopeType: 'club_family',
            scopeId: target.familyRootId,
            scopeLabel: `Familia ${clubNameById.get(target.familyRootId) || target.familyRootId}`,
        });
    }

    if (userIds.length === 0) {
        return {
            users: [],
            meta: {
                scopes,
                membershipRoles: MEMBERSHIP_ROLE_OPTIONS,
            },
        };
    }

    const { data: users, error: usersError } = await admin
        .from('users')
        .select('id, email, name, avatar_url, last_login_at, role')
        .in('id', userIds);

    if (usersError) throw usersError;

    const usersById = new Map(((users ?? []) as UserRow[]).map((user) => [user.id, user]));
    const grouped = userIds.map((userId) => {
        const user = usersById.get(userId);
        const membershipsForUser = membershipRows
            .filter((membership) => membership.user_id === userId)
            .map((membership) => ({
                id: membership.id,
                scopeType: membership.scope_type,
                scopeId: membership.scope_id,
                scopeLabel: membershipScopeLabel(membership, clubNameById),
                membershipRole: membership.role,
                createdAt: membership.created_at,
            }));

        return {
            id: userId,
            email: user?.email || '',
            name: user?.name || null,
            avatarUrl: user?.avatar_url || null,
            lastLoginAt: user?.last_login_at || null,
            role: user?.role || 'fan',
            memberships: membershipsForUser,
        };
    }).sort((left, right) => {
        const leftDate = left.lastLoginAt ? new Date(left.lastLoginAt).getTime() : 0;
        const rightDate = right.lastLoginAt ? new Date(right.lastLoginAt).getTime() : 0;
        return rightDate - leftDate;
    });

    return {
        users: grouped,
        meta: {
            scopes,
            membershipRoles: MEMBERSHIP_ROLE_OPTIONS,
        },
    };
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        if (!clubId) {
            return err('club param required', 400);
        }

        const access = await resolveClubAccess(clubId, ACCESS_VIEW_ROLE_SET);
        if (access.error || !access.target) {
            return access.error!;
        }

        const payload = await buildUsersPayload(access.target);
        return NextResponse.json({ ok: true, data: payload.users, meta: payload.meta });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo cargar el equipo de usuarios';
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const parsed = createMembershipSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return err('Payload invalido para crear acceso', 400);
        }

        const { clubId, email, scopeId, scopeType, membershipRole } = parsed.data;
        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if (access.error || !access.target) {
            return access.error!;
        }

        const validScope =
            (scopeType === 'club' && scopeId === access.target.clubId) ||
            (scopeType === 'club_family' && scopeId === access.target.familyRootId);

        if (!validScope) {
            return err('El alcance elegido no corresponde al club activo', 400);
        }

        const admin = createAdminClient();
        const { data: user, error: userError } = await admin
            .from('users')
            .select('id, email')
            .ilike('email', email.trim())
            .maybeSingle();

        if (userError) throw userError;
        if (!user) {
            return err('Ese email todavia no existe en users. El colaborador debe registrarse o iniciar sesion al menos una vez.', 404);
        }

        const { data: existingMembership, error: existingError } = await admin
            .from('memberships')
            .select('id')
            .eq('user_id', user.id)
            .eq('scope_type', scopeType)
            .eq('scope_id', scopeId)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existingMembership) {
            const { error: updateError } = await admin
                .from('memberships')
                .update({ role: membershipRole })
                .eq('id', existingMembership.id);

            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await admin
                .from('memberships')
                .insert({
                    user_id: user.id,
                    scope_type: scopeType,
                    scope_id: scopeId,
                    role: membershipRole,
                });

            if (insertError) throw insertError;
        }

        const payload = await buildUsersPayload(access.target);
        return NextResponse.json({ ok: true, data: payload.users, meta: payload.meta, targetUserId: user.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear el acceso';
        return err(message, 500);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const parsed = updateMembershipSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return err('Payload invalido para actualizar acceso', 400);
        }

        const { clubId, membershipId, membershipRole } = parsed.data;
        const access = await resolveClubAccess(clubId, EDIT_MEMBERSHIP_ROLES);
        if (access.error || !access.target) {
            return access.error!;
        }

        const admin = createAdminClient();
        const { data: membership, error: membershipError } = await admin
            .from('memberships')
            .select('id, scope_type, scope_id')
            .eq('id', membershipId)
            .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membership) {
            return err('Membership no encontrada', 404);
        }

        if (!isRelevantMembership(membership as MembershipRow, access.target)) {
            return err('No puedes editar una membership fuera del alcance del club actual', 403);
        }

        const { error: updateError } = await admin
            .from('memberships')
            .update({ role: membershipRole })
            .eq('id', membershipId);

        if (updateError) throw updateError;

        const payload = await buildUsersPayload(access.target);
        return NextResponse.json({ ok: true, data: payload.users, meta: payload.meta });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar el acceso';
        return err(message, 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const parsed = deleteMembershipSchema.safeParse({
            clubId: request.nextUrl.searchParams.get('clubId'),
            membershipId: request.nextUrl.searchParams.get('membershipId'),
        });

        if (!parsed.success) {
            return err('Payload invalido para revocar acceso', 400);
        }

        const access = await resolveClubAccess(parsed.data.clubId, EDIT_MEMBERSHIP_ROLES);
        if (access.error || !access.target) {
            return access.error!;
        }

        const admin = createAdminClient();
        const { data: membership, error: membershipError } = await admin
            .from('memberships')
            .select('id, scope_type, scope_id')
            .eq('id', parsed.data.membershipId)
            .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membership) {
            return err('Membership no encontrada', 404);
        }

        if (!isRelevantMembership(membership as MembershipRow, access.target)) {
            return err('No puedes revocar una membership fuera del alcance del club actual', 403);
        }

        const { error: deleteError } = await admin
            .from('memberships')
            .delete()
            .eq('id', parsed.data.membershipId);

        if (deleteError) throw deleteError;

        const payload = await buildUsersPayload(access.target);
        return NextResponse.json({ ok: true, data: payload.users, meta: payload.meta });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo revocar el acceso';
        return err(message, 500);
    }
}
