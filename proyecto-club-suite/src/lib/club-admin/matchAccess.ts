import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/utils/postgrest';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { getManagedClubSummaries, type ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';
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

const DENIED: Omit<ClubMatchAccessResult, 'context'> = {
  allowed: false,
  clubId: null,
  isHome: false,
  isAway: false,
  isCreator: false,
  role: null,
};

export async function checkClubMatchAccess(
  matchId: string,
  expectedClubId?: string | null
): Promise<ClubMatchAccessResult> {
  const supabase = await createClient();
  const context = await requireUserAccessContext(supabase).catch(() => null);
  const resolvedExpectedClubId = await resolveExpectedClubId(supabase, expectedClubId);

  if (!context) {
    console.log('[matchAccess] No auth context');
    return { ...DENIED, context: null };
  }

  // Cheap pre-filter before hitting the DB for the managed-club set.
  const hasClubManagement = context.memberships.some(
    m => (m.scopeType === 'club' || m.scopeType === 'club_family')
      && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as MembershipRole)
  );

  if (!hasClubManagement) {
    console.log('[matchAccess] User has no club management memberships');
    return { ...DENIED, context };
  }

  if (!isUuid(matchId)) {
    return { ...DENIED, context };
  }

  // Load match to check club involvement
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, home_club_id, away_club_id, tournament_id')
    .eq('id', matchId)
    .maybeSingle();

  if (error || !match) {
    console.log('[matchAccess] Match not found:', matchId, error?.message);
    return { ...DENIED, context };
  }

  // La autorizacion se decide contra los clubes que el usuario ADMINISTRA
  // (directos + familia + plantel compartido) — el mismo conjunto que ofrece el
  // panel de club — y nunca contra el `?club=` crudo del request: ese parametro
  // lo elige el cliente y solo sirve para seleccionar entre clubes propios.
  const { clubs: managedClubs } = await getManagedClubSummaries(supabase, context.memberships, {
    includeLogoUrls: false,
  });

  const grant = (club: ManagedClubSummary, isHome: boolean, isAway: boolean): ClubMatchAccessResult => ({
    allowed: true,
    context,
    clubId: club.id,
    isHome,
    isAway,
    isCreator: false,
    role: club.accessRole,
  });

  // If expectedClubId is provided (from the club admin panel), the user must
  // manage THAT club and the match must involve it.
  if (resolvedExpectedClubId) {
    const managed = managedClubs.find((club) => club.id === resolvedExpectedClubId);

    if (!managed) {
      console.log('[matchAccess] DENIED - user does not manage club:', resolvedExpectedClubId);
      return { ...DENIED, context };
    }

    const isHome = match.home_club_id === resolvedExpectedClubId;
    const isAway = match.away_club_id === resolvedExpectedClubId;

    if (!isHome && !isAway) {
      console.log('[matchAccess] DENIED - match does not involve club:', resolvedExpectedClubId);
      return { ...DENIED, context };
    }

    console.log('[matchAccess] ALLOWED for club:', resolvedExpectedClubId);
    return grant(managed, isHome, isAway);
  }

  // Fallback without expectedClubId: first managed club playing this match.
  for (const club of managedClubs) {
    const isHome = match.home_club_id === club.id;
    const isAway = match.away_club_id === club.id;

    if (isHome || isAway) {
      return grant(club, isHome, isAway);
    }
  }

  console.log('[matchAccess] DENIED - no matching club');
  return { ...DENIED, context };
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
