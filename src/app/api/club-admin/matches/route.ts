import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClubContext,
  getClubManagementTarget,
  requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { combineLocalDateTimeToUtcIso } from '@/lib/timezone';
import { TOURNAMENT_REVIEW_STATUS, isTournamentVisibleToPublic } from '@/lib/tournamentReview';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function getCurrentSeason() {
  return String(new Date().getFullYear());
}

async function resolveClubReference(admin: ReturnType<typeof createAdminClient>, value: unknown) {
  const token = normalizeText(value);
  if (!token) return null;

  const { data, error } = await admin
    .from('clubs')
    .select('id')
    .or(`id.eq.${token},slug.eq.${token}`)
    .maybeSingle();

  if (error) {
    console.warn('[ClubAdmin CREATE match] club lookup failed:', error.message);
    return null;
  }

  return data?.id ? String(data.id) : null;
}

function normalizeRivalName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function ensureClubRival(
  admin: ReturnType<typeof createAdminClient>,
  args: { clubId: string; name: string; userId: string }
) {
  const normalized = normalizeRivalName(args.name);
  if (!normalized) return null;

  const { data: existing } = await admin
    .from('club_rivals')
    .select('id, name, normalized_name, review_status')
    .eq('club_id', args.clubId)
    .eq('normalized_name', normalized)
    .maybeSingle();

  if (existing) return existing as { id: string; name: string; normalized_name: string; review_status: string };

  const { data, error } = await admin
    .from('club_rivals')
    .insert({
      club_id: args.clubId,
      name: args.name,
      normalized_name: normalized,
      created_by_user_id: args.userId,
      review_status: 'pending',
    })
    .select('id, name, normalized_name, review_status')
    .single();

  if (error) {
    console.warn('[ClubAdmin CREATE match] could not ensure rival:', error.message);
    return null;
  }

  return data as { id: string; name: string; normalized_name: string; review_status: string };
}

async function resolveRequestedTournament(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: unknown,
  userId: string,
  isGlobalAdmin: boolean
) {
  const id = normalizeText(tournamentId);
  if (!id) return null;

  if (!UUID_RE.test(id)) {
    throw new Error('El torneo seleccionado no tiene un ID valido.');
  }

  const { data, error } = await admin
    .from('tournaments')
    .select('id, status, is_visible, review_status, created_by_user_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'No se pudo validar el torneo seleccionado.');
  }

  if (!data) {
    throw new Error('El torneo seleccionado no existe.');
  }

  const reviewStatus = normalizeText((data as any).review_status);
  const isOwnPending =
    reviewStatus === TOURNAMENT_REVIEW_STATUS.pendingLink &&
    (data as any).created_by_user_id === userId;

  if (!isGlobalAdmin && !isOwnPending && !isTournamentVisibleToPublic(data as any)) {
    throw new Error('El torneo seleccionado no esta disponible para este club.');
  }

  return String(data.id);
}

async function createPendingTournamentForClub(args: {
  admin: ReturnType<typeof createAdminClient>;
  name: string;
  clubId: string;
  userId: string;
  sportId: string | null;
  unionId: string | null;
  seasonId: string | null;
}) {
  const baseSlug = slugify(args.name) || 'torneo-club';
  const seasonId = args.seasonId || getCurrentSeason();

  const payload = {
    name: args.name,
    display_name: args.name,
    slug: `${baseSlug}-${Date.now().toString(36)}`,
    season_id: seasonId,
    sport_id: args.sportId,
    union_id: args.unionId,
    status: 'draft',
    is_visible: false,
    is_popular: false,
    review_status: TOURNAMENT_REVIEW_STATUS.pendingLink,
    created_by_user_id: args.userId,
    created_by_club_id: args.clubId,
    review_notes: 'Creado desde el flujo de Club Admin para organizar partidos internos.',
  };

  const { data, error } = await args.admin
    .from('tournaments')
    .insert(payload)
    .select('id, name, display_name, review_status')
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo crear el torneo pendiente.');
  }

  return data as { id: string; name: string; display_name?: string | null; review_status?: string | null };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      awayClubId,
      rivalName,
      date,
      time,
      venue,
      isHome: isHomeMatch,
      matchType,
      tournamentId,
      newTournament,
      newTournamentName,
      newTournamentSeasonId,
      divisionId,
      sport,
      clubId,
      notes,
    } = body;

    let originClubId: string | null = null;
    let target = null;

    if (normalizeText(clubId)) {
      target = await getClubManagementTarget(supabase, normalizeText(clubId));
      if (!target || !canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
        return NextResponse.json({ error: 'No club access' }, { status: 403 });
      }
      originClubId = target.clubId;
    } else {
      const clubMembership = context.memberships.find(
        m => (m.scopeType === 'club' || m.scopeType === 'club_family')
          && MANAGEMENT_MEMBERSHIP_ROLES.has(m.role as any)
      );
      originClubId = clubMembership?.scopeId || null;
      target = originClubId ? await getClubManagementTarget(supabase, originClubId) : null;
    }

    if (!originClubId) {
      return NextResponse.json({ error: 'No club access' }, { status: 403 });
    }

    const opponentClubId = await resolveClubReference(admin, awayClubId);
    const opponentLabel = normalizeText(rivalName) || normalizeText(awayClubId);

    // Persist rival for club reuse and super-admin review (fire-and-forget; frontend already saves it)
    if (opponentLabel && !opponentClubId) {
      void ensureClubRival(admin, {
        clubId: originClubId,
        name: opponentLabel,
        userId: context.userId,
      });
    }

    // Determine home/away based on isHome flag
    const resolvedHomeClubId = isHomeMatch ? originClubId : opponentClubId;
    const resolvedAwayClubId = isHomeMatch ? opponentClubId : originClubId;

    // Build date_time
    let dateTime = null;
    if (date && time) {
      dateTime = combineLocalDateTimeToUtcIso(date, time, 'America/Argentina/Buenos_Aires');
    }

    const requestedNewTournamentName =
      normalizeText(newTournament?.name) || normalizeText(newTournamentName);
    const requestedTournamentId = await resolveRequestedTournament(
      admin,
      tournamentId,
      context.userId,
      isGlobalAdminRole(context.role)
    );
    let createdTournament: { id: string; name: string; display_name?: string | null; review_status?: string | null } | null = null;

    if (!requestedTournamentId && requestedNewTournamentName) {
      createdTournament = await createPendingTournamentForClub({
        admin,
        name: requestedNewTournamentName,
        clubId: originClubId,
        userId: context.userId,
        sportId: normalizeText(sport) || target?.sportId || null,
        unionId: target?.unionId || null,
        seasonId: normalizeText(newTournament?.seasonId) || normalizeText(newTournamentSeasonId) || null,
      });
    }

    const finalTournamentId = requestedTournamentId || createdTournament?.id || null;
    const unresolvedOpponentNote = opponentLabel && !opponentClubId
      ? `Rival externo: ${opponentLabel}`
      : null;
    const matchTypeNote = normalizeText(matchType) ? `Tipo: ${normalizeText(matchType)}` : null;
    const mergedNotes = [normalizeText(notes), unresolvedOpponentNote, matchTypeNote]
      .filter(Boolean)
      .join('\n') || null;

    const insertData: Record<string, unknown> = {
      home_club_id: resolvedHomeClubId,
      away_club_id: resolvedAwayClubId,
      home_division_id: isHomeMatch ? divisionId : null,
      away_division_id: isHomeMatch ? null : divisionId,
      date_time: dateTime,
      venue: venue || null,
      status: 'scheduled',
      sport: normalizeText(sport) || target?.sportId || null,
      sport_id: normalizeText(sport) || target?.sportId || null,
      notes: mergedNotes,
      tournament_id: finalTournamentId,
      score: { home: null, away: null },
    };

    const { data, error } = await admin
      .from('matches')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[ClubAdmin CREATE match]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        tournament: createdTournament,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[ClubAdmin CREATE match]', error);
    const status = message.includes('seleccionado') || message.includes('disponible') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
