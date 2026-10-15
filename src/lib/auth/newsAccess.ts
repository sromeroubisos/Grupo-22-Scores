import type { Session } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import {
    CLUB_MEMBERSHIP_SCOPE_TYPES,
    EDIT_MEMBERSHIP_ROLES,
    hasEditorialAccess,
    normalizeRole,
    resolveBestUserRole,
    type MembershipLike,
    type MembershipRole,
    type MembershipScope,
} from '@/lib/auth/roles';
import {
    canManageClubContext,
    getClubManagementTarget,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import { resolveClubFamilyIds } from '@/lib/club-admin/managedClubFamily';
import { createAdminClient } from '@/lib/supabase/admin';
import { getReservedAdminRole } from '@/lib/types/user';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ServerAuthContext = {
    role: string | null;
    session: Session | null;
    supabase: LooseSupabaseClient;
};

export async function getServerAuthRole(): Promise<ServerAuthContext> {
    const authClient = await createClient();
    const fallbackToAnonymous = async (error?: unknown): Promise<ServerAuthContext> => {
        if (error) {
            console.warn('[newsAccess] Treating auth lookup as anonymous:', error);
        }
        return {
            supabase: await getReadClient(),
            session: null,
            role: null,
        };
    };

    let session: Session | null = null;

    try {
        const { data, error } = await authClient.auth.getSession();
        if (error) {
            return fallbackToAnonymous(error);
        }
        session = data.session;
    } catch (error) {
        return fallbackToAnonymous(error);
    }

    if (!session?.user?.id) {
        return fallbackToAnonymous();
    }

    // getSession() decodifica la cookie sin verificar la firma, y de este rol
    // cuelga requireNewsSuperAdminServer(). Se conserva el `session` porque los
    // llamadores lo usan, pero el rol se resuelve sobre el usuario que Supabase
    // valida en getUser(). Si no coinciden, la cookie es fabricada.
    const { data: { user: verifiedUser }, error: verifyError } = await authClient.auth.getUser();

    if (verifyError || !verifiedUser || verifiedUser.id !== session.user.id) {
        return fallbackToAnonymous(verifyError);
    }

    const { data: userData } = await authClient
        .from('users')
        .select('role')
        .eq('id', verifiedUser.id)
        .maybeSingle();

    return {
        supabase: authClient,
        session,
        role: resolveBestUserRole({
            reservedRole: getReservedAdminRole(verifiedUser.email),
            profileRole: userData?.role ?? null,
            appMetadata: verifiedUser.app_metadata,
        }),
    };
}

export async function canManageNewsServer(): Promise<boolean> {
    return (await getNewsEditorScope()) !== null;
}

/**
 * Exige sesión verificada y ALGÚN permiso de noticias (editorial global o de
 * club). El nombre viene de cuando era solo el super admin. Sirve como puerta
 * para subir imágenes; QUÉ noticia se puede tocar lo decide la ruta con
 * `canEditClubNews`, no esta función.
 */
export async function requireNewsSuperAdminServer() {
    return requireNewsEditorScope();
}

// ── Alcance editorial ─────────────────────────────────────────────────────
//
// Hay DOS permisos distintos y no se mezclan:
//  - editorial GLOBAL (super_admin, admin_general, redactor): toda noticia,
//    cualquier alcance.
//  - de CLUB (membresía admin/editor sobre un club o una familia de clubes):
//    solo noticias con scope='club' y scope_id dentro de lo que administra.
// Antes `hasNewsManagementAccess` metía a los dos en la misma bolsa y PUT/DELETE
// operaban con service_role sobre cualquier id: un editor de club podía
// despublicar una nota de portada.

export interface NewsEditorScope {
    userId: string;
    role: string | null;
    session: Session;
    supabase: LooseSupabaseClient;
    isGlobalEditor: boolean;
    access: UserAccessContext;
}

async function loadMemberships(supabase: LooseSupabaseClient, userId: string): Promise<MembershipLike[]> {
    const { data, error } = await supabase
        .from('memberships')
        .select('scope_type, scope_id, role')
        .eq('user_id', userId);
    if (error) {
        // Sin membresías legibles no se concede nada de club: fail-closed.
        console.warn('[newsAccess] No se pudieron leer las membresías:', error);
        return [];
    }
    return ((data ?? []) as Array<{ scope_type: string; scope_id: string; role: string }>).map((row) => ({
        scopeType: row.scope_type as MembershipScope,
        scopeId: row.scope_id,
        role: row.role,
    }));
}

/** El contexto editorial del que pide, o null si no tiene ningún permiso de noticias. */
export async function getNewsEditorScope(): Promise<NewsEditorScope | null> {
    const context = await getServerAuthRole();
    const session = context.session;
    if (!session?.user?.id) return null;

    const memberships = await loadMemberships(context.supabase, session.user.id);
    const isGlobalEditor = hasEditorialAccess(context.role);
    const hasClubMembership = memberships.some((membership) =>
        CLUB_MEMBERSHIP_SCOPE_TYPES.has(membership.scopeType) && EDIT_MEMBERSHIP_ROLES.has(membership.role as MembershipRole)
    );
    // La unión o el deporte también administran sus clubes (canManageClubContext).
    const hasParentMembership = memberships.some((membership) =>
        (membership.scopeType === 'union' || membership.scopeType === 'sport') &&
        EDIT_MEMBERSHIP_ROLES.has(membership.role as MembershipRole)
    );

    if (!isGlobalEditor && !hasClubMembership && !hasParentMembership) return null;

    return {
        userId: session.user.id,
        role: context.role,
        session,
        supabase: context.supabase,
        isGlobalEditor,
        access: {
            userId: session.user.id,
            rawRole: context.role,
            role: normalizeRole(context.role),
            memberships,
        },
    };
}

/** Como getNewsEditorScope, pero corta con 'Unauthorized' (lo traduce la ruta a 403). */
export async function requireNewsEditorScope(): Promise<NewsEditorScope> {
    const scope = await getNewsEditorScope();
    if (!scope) throw new Error('Unauthorized');
    return scope;
}

/**
 * ¿Puede este editor escribir una noticia de club con este scope_id? El club se
 * resuelve con el cliente de servicio: un club oculto sigue siendo del que lo
 * administra, y la RLS de `clubs` lo escondería.
 */
export async function canEditClubNews(scope: NewsEditorScope, clubId: string | null | undefined): Promise<boolean> {
    if (scope.isGlobalEditor) return true;
    if (!clubId) return false;
    const admin = createAdminClient() as unknown as SupabaseServerClient;
    const target = await getClubManagementTarget(admin, clubId).catch(() => null);
    if (!target) return false;
    return canManageClubContext(scope.access, target, EDIT_MEMBERSHIP_ROLES);
}

/**
 * Los clubes cuyos borradores puede VER en el listado. Sale solo de las
 * membresías de club/familia (una unión con 200 clubes no se expande acá: esos
 * borradores los ve desde el panel de cada club).
 */
export async function listEditableClubIds(scope: NewsEditorScope): Promise<string[]> {
    const admin = createAdminClient() as unknown as SupabaseServerClient;
    const ids = new Set<string>();
    for (const membership of scope.access.memberships) {
        if (!EDIT_MEMBERSHIP_ROLES.has(membership.role as MembershipRole)) continue;
        if (membership.scopeType === 'club') {
            ids.add(membership.scopeId);
        } else if (membership.scopeType === 'club_family') {
            const family = await resolveClubFamilyIds(admin, membership.scopeId).catch(() => ({
                rootClubId: membership.scopeId,
                clubIds: [membership.scopeId],
            }));
            for (const clubId of family.clubIds) ids.add(clubId);
        }
    }
    return Array.from(ids).filter((id) => UUID_RE.test(id)).sort();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
