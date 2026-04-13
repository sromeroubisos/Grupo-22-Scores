import type { MembershipLike } from '@/lib/auth/roles';

interface ClubScopedUserLike {
    clubId?: string | null;
    memberships?: MembershipLike[] | null;
}

export function resolveManagedClubId(user?: ClubScopedUserLike | null): string | null {
    if (!user) {
        return null;
    }

    const scopedMembership = user.memberships?.find(
        (membership) =>
            (membership.scopeType === 'club' || membership.scopeType === 'club_family') &&
            membership.scopeId
    );

    return scopedMembership?.scopeId ?? user.clubId ?? null;
}
