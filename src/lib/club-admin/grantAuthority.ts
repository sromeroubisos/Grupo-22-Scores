// Quién puede repartir accesos a un club (memberships e invitaciones).
//
// Antes alcanzaba con ser editor del club: un editor se invitaba a sí mismo
// como admin, o se pasaba a `club_family` y quedaba sobre toda la familia. La
// regla ahora es una sola y la usan las tres puertas (users, invites y el
// accept de la invitación, que la vuelve a correr con el creador de HOY):
//
//  - Solo otorga quien es ADMIN del club (membresía admin sobre el club, la
//    familia, su unión o su deporte) o admin global.
//  - Nadie otorga un rol mayor que el suyo.
//  - El alcance `club_family` solo lo da quien es admin de ESA familia (la
//    raíz) o admin global: un admin de una filial no se agranda a la familia.
//  - Nadie toca su propia membership (eso lo resuelve la ruta, que sabe de
//    quién es la fila).

import {
    canManageClubContext,
    hasScopedMembershipAccess,
    type ClubManagementTarget,
    type UserAccessContext,
} from '@/lib/auth/permissions';
import {
    ADMIN_ONLY_MEMBERSHIP_ROLES,
    isGlobalAdminRole,
    type MembershipRole,
} from '@/lib/auth/roles';

export type GrantScopeType = 'club' | 'club_family';

const ROLE_RANK: Record<MembershipRole, number> = {
    viewer: 1,
    operator: 2,
    editor: 3,
    admin: 4,
};

function rankOf(role: string | null | undefined): number {
    return role && role in ROLE_RANK ? ROLE_RANK[role as MembershipRole] : 0;
}

/** El rol más alto que este usuario tiene sobre el club (o su familia, unión, deporte). */
export function highestClubRole(context: UserAccessContext, target: ClubManagementTarget): number {
    if (isGlobalAdminRole(context.role)) return ROLE_RANK.admin;
    let best = 0;
    for (const membership of context.memberships) {
        const applies =
            (membership.scopeType === 'club' && membership.scopeId === target.clubId) ||
            (membership.scopeType === 'club_family' && target.familyClubIds.includes(membership.scopeId)) ||
            (membership.scopeType === 'union' && membership.scopeId === target.unionId) ||
            (membership.scopeType === 'sport' && membership.scopeId === target.sportId);
        if (applies) best = Math.max(best, rankOf(membership.role));
    }
    return best;
}

/** ¿Puede este usuario administrar accesos del club? (ver la lista no; repartir sí). */
export function canAdministerClubAccess(context: UserAccessContext, target: ClubManagementTarget): boolean {
    // Un invitado por cookie nunca reparte accesos: no es una cuenta real.
    if (context.userId.startsWith('guest:')) return false;
    return canManageClubContext(context, target, ADMIN_ONLY_MEMBERSHIP_ROLES);
}

/**
 * ¿Puede otorgar (o dejar) `role` en ese alcance? null si sí; si no, el motivo
 * para el 403.
 */
export function explainGrantDenial(
    context: UserAccessContext,
    target: ClubManagementTarget,
    scopeType: GrantScopeType,
    scopeId: string,
    role: string,
): string | null {
    if (!canAdministerClubAccess(context, target)) {
        return 'Solo un admin del club puede gestionar accesos.';
    }

    const validScope =
        (scopeType === 'club' && scopeId === target.clubId) ||
        (scopeType === 'club_family' && scopeId === target.familyRootId);
    if (!validScope) {
        return 'El alcance elegido no corresponde al club activo.';
    }

    if (scopeType === 'club_family' && !isGlobalAdminRole(context.role) &&
        !hasScopedMembershipAccess(context, 'club_family', target.familyRootId, ADMIN_ONLY_MEMBERSHIP_ROLES)) {
        return 'Solo un admin de la familia del club puede dar acceso a toda la familia.';
    }

    if (rankOf(role) === 0) {
        return 'Rol inválido.';
    }
    if (rankOf(role) > highestClubRole(context, target)) {
        return 'No podés otorgar un rol mayor que el tuyo.';
    }

    return null;
}
