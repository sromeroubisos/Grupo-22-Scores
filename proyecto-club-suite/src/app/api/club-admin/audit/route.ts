import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type AuditRow = {
    id: string;
    created_at: string;
    actor_user_id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    changes: unknown;
    source: string | null;
};

type NewsRow = {
    id: string;
    created_at: string;
    published_at: string | null;
    author_id: string | null;
    title: string;
    status: string;
    scope_id: string | null;
};

type MembershipRow = {
    id: string;
    created_at: string;
    user_id: string;
    scope_type: string;
    scope_id: string;
    role: string;
};

type UserRow = {
    id: string;
    email: string;
    name: string | null;
};

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function formatUserLabel(user?: UserRow | null) {
    if (!user) return 'Sistema';
    return user.name || user.email || user.id;
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
        if (!clubId) {
            return err('club param required', 400);
        }

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) {
            return err('No autenticado', 401);
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) {
            return err('Club no encontrado', 404);
        }

        if (!canManageClubContext(context, target, ACCESS_VIEW_ROLE_SET)) {
            return err('Sin permisos para ver este club', 403);
        }

        const admin = createAdminClient();
        const [
            { data: auditLogs, error: auditError },
            { data: news, error: newsError },
            { data: clubMemberships, error: clubMembershipsError },
            { data: familyMemberships, error: familyMembershipsError },
            { data: clubs, error: clubsError },
        ] = await Promise.all([
            admin
                .from('admin_audit_log')
                .select('id, created_at, actor_user_id, entity_type, entity_id, action, changes, source')
                .eq('entity_type', 'club')
                .eq('entity_id', clubId)
                .order('created_at', { ascending: false })
                .limit(50),
            admin
                .from('news')
                .select('id, created_at, published_at, author_id, title, status, scope_id')
                .eq('scope', 'club')
                .eq('scope_id', clubId)
                .order('created_at', { ascending: false })
                .limit(30),
            admin
                .from('memberships')
                .select('id, created_at, user_id, scope_type, scope_id, role')
                .eq('scope_type', 'club')
                .eq('scope_id', clubId)
                .order('created_at', { ascending: false })
                .limit(30),
            target.familyRootId === clubId
                ? Promise.resolve({ data: [], error: null })
                : admin
                    .from('memberships')
                    .select('id, created_at, user_id, scope_type, scope_id, role')
                    .eq('scope_type', 'club_family')
                    .eq('scope_id', target.familyRootId)
                    .order('created_at', { ascending: false })
                    .limit(30),
            admin
                .from('clubs')
                .select('id, name')
                .in('id', Array.from(new Set([clubId, target.familyRootId]))),
        ]);

        if (auditError) throw auditError;
        if (newsError) throw newsError;
        if (clubMembershipsError) throw clubMembershipsError;
        if (familyMembershipsError) throw familyMembershipsError;
        if (clubsError) throw clubsError;

        const memberships = [
            ...((clubMemberships ?? []) as MembershipRow[]),
            ...((familyMemberships ?? []) as MembershipRow[]),
        ];

        const actorIds = Array.from(new Set([
            ...((auditLogs ?? []) as AuditRow[]).map((row) => row.actor_user_id),
            ...((news ?? []) as NewsRow[]).map((row) => row.author_id).filter(Boolean) as string[],
            ...memberships.map((row) => row.user_id),
        ]));

        const { data: users, error: usersError } = actorIds.length === 0
            ? { data: [], error: null }
            : await admin
                .from('users')
                .select('id, email, name')
                .in('id', actorIds);

        if (usersError) throw usersError;

        const usersById = new Map(((users ?? []) as UserRow[]).map((user) => [user.id, user]));
        const clubsById = new Map((clubs ?? []).map((club) => [club.id, club.name]));

        const items = [
            ...((auditLogs ?? []) as AuditRow[]).map((log) => ({
                id: `audit-${log.id}`,
                createdAt: log.created_at,
                actor: formatUserLabel(usersById.get(log.actor_user_id)),
                module: 'Auditoria',
                severity: 'info',
                action: log.action || 'actualizacion',
                detail: `${log.entity_type} ${clubsById.get(log.entity_id) || log.entity_id}`,
                source: log.source || 'admin_audit_log',
            })),
            ...((news ?? []) as NewsRow[]).map((item) => ({
                id: `news-${item.id}`,
                createdAt: item.published_at || item.created_at,
                actor: formatUserLabel(usersById.get(item.author_id || '')),
                module: 'Comunicaciones',
                severity: item.status === 'published' ? 'info' : 'warning',
                action: item.status === 'published' ? 'publico noticia' : 'guardo noticia',
                detail: item.title,
                source: 'news',
            })),
            ...memberships.map((membership) => ({
                id: `membership-${membership.id}`,
                createdAt: membership.created_at,
                actor: formatUserLabel(usersById.get(membership.user_id)),
                module: 'Usuarios',
                severity: 'info',
                action: 'asigno acceso',
                detail: `${membership.role} sobre ${clubsById.get(membership.scope_id) || membership.scope_id}`,
                source: 'memberships',
            })),
        ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

        return NextResponse.json({ ok: true, data: items.slice(0, 80) });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo cargar la auditoria del club';
        return err(message, 500);
    }
}
