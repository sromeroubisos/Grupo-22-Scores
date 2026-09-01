import { NextRequest, NextResponse } from 'next/server';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { ensureMatchManagementAccess } from '@/lib/server/matchCenterAdmin';
import { fetchPeopleByClub, type PersonWithRole } from '@/lib/services/personService';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/utils/postgrest';

/**
 * Datos que la planilla oficial necesita y que NO viajan con el partido:
 * documento de cada jugador (con su país), la marca ① de primeras líneas y el
 * entrenador de cada club, más el N° de partido del sistema de la unión.
 *
 * Va en un endpoint aparte y autenticado a propósito: `people.id_number` está
 * cerrado por privilegios de columna (20260804170000) y el pipeline de rosters
 * del Match Center alimenta vistas públicas — los DNI no pueden viajar por ahí.
 * Acá sólo entra quien puede gestionar el partido, con service_role.
 */

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

type PlanillaPlayer = {
  personId: string;
  name: string;
  idNumber: string | null;
  docCountry: string | null;
  frontRow: boolean;
  position: string | null;
};

type PlanillaCoach = {
  name: string;
  idNumber: string | null;
  docCountry: string | null;
};

type PlanillaSide = {
  players: PlanillaPlayer[];
  coach: PlanillaCoach | null;
};

const COACH_ROLE_PRIORITY = ['head_coach', 'coach', 'assistant_coach', 'entrenador'];

function buildSide(people: PersonWithRole[]): PlanillaSide {
  // Una persona puede aparecer una vez por membresía (plantel base + división):
  // se pliega por id quedándose con la variante que más datos aporta.
  const players = new Map<string, PlanillaPlayer>();
  let coach: { person: PersonWithRole; priority: number } | null = null;

  for (const person of people) {
    const role = String(person.role || '').toLowerCase();

    const coachPriority = COACH_ROLE_PRIORITY.indexOf(role);
    if (coachPriority >= 0) {
      if (!coach || coachPriority < coach.priority) {
        coach = { person, priority: coachPriority };
      }
      continue;
    }

    if (role && role !== 'player') continue;

    const existing = players.get(person.id);
    players.set(person.id, {
      personId: person.id,
      name: person.full_name || `${person.first_name} ${person.last_name}`.trim(),
      idNumber: person.id_number || existing?.idNumber || null,
      docCountry: person.doc_country || existing?.docCountry || null,
      frontRow: person.front_row_certified === true || existing?.frontRow === true,
      position: person.position || existing?.position || null,
    });
  }

  return {
    players: Array.from(players.values()),
    coach: coach
      ? {
        name: coach.person.full_name || `${coach.person.first_name} ${coach.person.last_name}`.trim(),
        idNumber: coach.person.id_number || null,
        docCountry: coach.person.doc_country || null,
      }
      : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;

  try {
    const matchId = (await params).id;
    if (!isUuid(matchId)) {
      return jsonError('Invalid match id', 400);
    }
    await ensureMatchManagementAccess(matchId, MANAGEMENT_MEMBERSHIP_ROLES);

    const admin = createAdminClient();

    // Lectura tolerante del N° oficial: si la migración 20260901190000 no
    // corrió todavía, el select con la columna falla y se reintenta sin ella.
    // El flag le dice a la UI que deshabilite el campo explicando qué falta.
    let officialSheetNumber: string | null = null;
    let officialSheetNumberSupported = true;
    let matchRow: { home_club_id: string | null; away_club_id: string | null } | null = null;

    const withColumn = await admin
      .from('matches')
      .select('home_club_id, away_club_id, official_sheet_number')
      .eq('id', matchId)
      .maybeSingle();

    if (!withColumn.error && withColumn.data) {
      matchRow = withColumn.data;
      officialSheetNumber = (withColumn.data as { official_sheet_number?: string | null }).official_sheet_number ?? null;
    } else {
      officialSheetNumberSupported = false;
      const withoutColumn = await admin
        .from('matches')
        .select('home_club_id, away_club_id')
        .eq('id', matchId)
        .maybeSingle();
      if (withoutColumn.error || !withoutColumn.data) {
        return jsonError('Match not found', 404);
      }
      matchRow = withoutColumn.data;
    }

    if (!matchRow) {
      return jsonError('Match not found', 404);
    }

    const emptySide: PlanillaSide = { players: [], coach: null };
    const [homePeople, awayPeople] = await Promise.all([
      matchRow.home_club_id ? fetchPeopleByClub(matchRow.home_club_id, admin).catch(() => []) : Promise.resolve([]),
      matchRow.away_club_id ? fetchPeopleByClub(matchRow.away_club_id, admin).catch(() => []) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      officialSheetNumber,
      officialSheetNumberSupported,
      home: matchRow.home_club_id ? buildSide(homePeople) : emptySide,
      away: matchRow.away_club_id ? buildSide(awayPeople) : emptySide,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(
      message,
      message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500,
    );
  }
}
