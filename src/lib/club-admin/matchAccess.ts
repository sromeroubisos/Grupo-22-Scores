import { createClient } from '@/lib/supabase/server';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import type { UserAccessContext } from '@/lib/auth/permissions';
import type { MembershipRole } from '@/lib/auth/roles';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClubMatchAccessResult {
  allowed: boolean;
  context: UserAccessContext | null;
  clubId: string | null;
  isHome: boolean;
  isAway: boolean;
  isCreator: boolean;
  role: string | null;
}

async function resolveExpectedClubId(supabase: Awaited<ReturnType<typeof createClient>>, expectedClubId?: string | null) {
  const normalized = expectedClubId?.trim();
  if (!normalized) return null;

  if (UUID_PATTERN.test(normalized)) {
    return normalized;
  }

  const { data } = await supabase
    .from('clubs')
    .select('id')
    .eq('slug', normalized)
    .maybeSingle();

  return data?.id ?? normalized;
}

export async function checkClubMatchAccess(
  matchId: string,
  expectedClubId?: string | null
): Promise<ClubMatchAccessResult> {
  const supabase = await createClient();
  const context = await requireUserAccessContext(supabase).catch(() => null);
  const resolvedExpectedClubId = await resolveExpectedClubId(supabase, expectedClubId);

  if (!context) {
    console.log('[matchAccess] No auth context');
    return { allowed: false, context: null, clubId: null, isHome: false, isAway: false, isCreator: false, role: null };
  }

  // User must have at least one club or club_family management membership
  const hasClubManagement = context.memberships.some(
    m => (m.scopeType === 'club' || m.scopeType === 'club_family')
      && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as MembershipRole)
  );

  if (!hasClubManagement) {
    console.log('[matchAccess] User has no club management memberships');
    return { allowed: false, context, clubId: null, isHome: false, isAway: false, isCreator: false, role: null };
  }

  // Load match to check club involvement
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, tournament_id')
    .eq('id', matchId)
    .maybeSingle();

  if (error || !match) {
    console.log('[matchAccess] Match not found:', matchId, error?.message);
    return { allowed: false, context, clubId: null, isHome: false, isAway: false, isCreator: false, role: null };
  }

  // If expectedClubId is provided (from the club admin panel), validate the match involves that club
  if (resolvedExpectedClubId) {
    const isHome = match.home_club_id === resolvedExpectedClubId;
    const isAway = match.away_club_id === resolvedExpectedClubId;

    console.log('[matchAccess] Checking club:', resolvedExpectedClubId, { isHome, isAway });

    if (isHome || isAway) {
      // Find the user's best role for display purposes
      const membership = context.memberships.find(
        m => (m.scopeType === 'club' || m.scopeType === 'club_family')
          && (m.scopeId === resolvedExpectedClubId || m.scopeType === 'club_family')
          && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as MembershipRole)
      );

      console.log('[matchAccess] ALLOWED for club:', resolvedExpectedClubId);
      return {
        allowed: true,
        context,
        clubId: resolvedExpectedClubId,
        isHome,
        isAway,
        isCreator: false,
        role: membership?.role || null,
      };
    }

    console.log('[matchAccess] DENIED - match does not involve club:', resolvedExpectedClubId);
    return { allowed: false, context, clubId: null, isHome: false, isAway: false, isCreator: false, role: null };
  }

  // Fallback without expectedClubId: check all user club memberships
  const userClubIds = context.memberships
    .filter(m =>
      (m.scopeType === 'club' || m.scopeType === 'club_family')
      && m.scopeId
      && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as MembershipRole)
    )
    .map(m => m.scopeId!);

  for (const clubId of userClubIds) {
    const isHome = match.home_club_id === clubId;
    const isAway = match.away_club_id === clubId;

    if (isHome || isAway) {
      const membership = context.memberships.find(
        m => (m.scopeType === 'club' || m.scopeType === 'club_family') && m.scopeId === clubId
      );
      return { allowed: true, context, clubId, isHome, isAway, isCreator: false, role: membership?.role || null };
    }
  }

  console.log('[matchAccess] DENIED - no matching club');
  return { allowed: false, context, clubId: null, isHome: false, isAway: false, isCreator: false, role: null };
}

export async function getUserManagedClubId(): Promise<string | null> {
  const supabase = await createClient();
  const context = await requireUserAccessContext(supabase).catch(() => null);

  if (!context) return null;

  const clubMembership = context.memberships.find(
    m => (m.scopeType === 'club' || m.scopeType === 'club_family') && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as MembershipRole)
  );

  return clubMembership?.scopeId || null;
}
