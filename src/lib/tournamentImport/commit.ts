/**
 * Persists an (edited) `InterpretedTournament` preview into real entities.
 *
 * Server-only. Uses a service-role writer (scope already enforced by the API
 * route) and reuses `FixtureService.createMatch` + the season-roster service.
 * Partial import is honored via `selection`. Nothing here runs unless the user
 * explicitly confirmed the preview. The import is recorded in
 * `tournaments.ruleset.imports` (JSONB log — no migration).
 */
import { FixtureService } from '@/lib/services/fixtureService';
import {
  ensureRostersForSeasonEntries,
  addPlayerToSeasonRoster,
} from '@/lib/services/tournamentSeasonService';
import type {
  CommitResult,
  ImportSelection,
  InterpretedTournament,
} from './types';

type Writer = any;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function normKey(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * M14b: true when two club names plausibly refer to the same club — normalized
 * equality, containment, or high token overlap. Used to avoid silently adopting
 * an existing club whose slug collides but whose name is a different club.
 */
function clubNamesLookAlike(a: string, b: string | null | undefined): boolean {
  if (!b) return false;
  const na = normKey(a);
  const nb = normKey(String(b));
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(' ').filter(Boolean);
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (ta.length === 0 || tb.size === 0) return false;
  const shared = ta.filter((token) => tb.has(token)).length;
  return shared / Math.max(ta.length, tb.size) >= 0.6;
}

/** Parse "dd/mm/yyyy" | "yyyy-mm-dd" (+ optional "HH:mm") → ISO, else null. */
function toIso(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const d = date.trim();
  let y: number, m: number, day: number;
  let mm = d.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (mm) {
    y = Number(mm[1]); m = Number(mm[2]); day = Number(mm[3]);
  } else {
    mm = d.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (!mm) return null;
    day = Number(mm[1]); m = Number(mm[2]);
    y = Number(mm[3].length === 2 ? `20${mm[3]}` : mm[3]);
  }
  if (!y || !m || !day) return null;
  let hh = 12, min = 0;
  const t = (time || '').match(/(\d{1,2}):(\d{2})/);
  if (t) { hh = Number(t[1]); min = Number(t[2]); }
  const dt = new Date(Date.UTC(y, m - 1, day, hh, min));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export async function commitInterpretedTournament(
  writer: Writer,
  params: {
    interpreted: InterpretedTournament;
    selection: ImportSelection;
    userId: string;
    fileName?: string | null;
  },
): Promise<CommitResult> {
  const { interpreted, selection, userId } = params;
  const warnings: string[] = [...(interpreted.warnings ?? [])];
  const created = { clubs: 0, participants: 0, phases: 0, zones: 0, matches: 0, rosters: 0, players: 0 };

  const tName = (interpreted.name || 'Torneo importado').trim();
  if (tName.length < 3) {
    return { ok: false, error: 'El nombre del torneo es demasiado corto.', created, warnings };
  }

  const seasonCode = String(new Date().getFullYear());
  const baseRuleset: Record<string, unknown> = {
    sport: 'rugby',
    points: { win: 4, draw: 2, loss: 0 },
    pointsSystem: { win: 4, draw: 2, loss: 0 },
  };

  // ── 1. Tournament row (unique slug, retry with suffix on 23505) ────────
  let tournamentId = '';
  let slug = slugify(`${tName}-${seasonCode}`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const { data, error } = await writer
      .from('tournaments')
      .insert([{
        name: tName,
        display_name: tName,
        slug: candidate,
        sport_id: 'rugby',
        season_id: seasonCode,
        format: interpreted.hasGroups ? 'groups_playoff' : 'league',
        status: 'draft',
        is_visible: false,
        ruleset: baseRuleset,
        created_by_user_id: userId,
      }])
      .select('id')
      .single();
    if (!error && data) { tournamentId = data.id; slug = candidate; break; }
    if (error && error.code !== '23505') {
      return { ok: false, error: `No se pudo crear el torneo: ${error.message}`, created, warnings };
    }
  }
  if (!tournamentId) {
    return { ok: false, error: 'No se pudo generar un slug único para el torneo.', created, warnings };
  }

  // Creator owns it (resolveTournamentAdminScope reads created_by_user_id);
  // an explicit membership is best-effort.
  await writer
    .from('memberships')
    .insert([{ user_id: userId, scope_type: 'tournament', scope_id: tournamentId, role: 'admin' }])
    .then((r: any) => {
      if (r.error && r.error.code !== '23505') {
        warnings.push('El torneo es tuyo, pero no se registró la membership explícita.');
      }
    });

  // ── 2. Season ──────────────────────────────────────────────────────────
  let seasonId: string | null = null;
  {
    const { data, error } = await writer
      .from('tournament_seasons')
      .insert([{
        tournament_id: tournamentId,
        legacy_tournament_id: tournamentId,
        season_code: seasonCode,
        name: `${tName} ${seasonCode}`,
        display_name: `${tName} ${seasonCode}`,
        slug: slugify(`${tName}-${seasonCode}`),
        status: 'draft',
        is_active: true,
        format: interpreted.hasGroups ? 'groups_playoff' : 'league',
        ruleset: baseRuleset,
        settings: { source: 'admin_torneo_import' },
        created_by_user_id: userId,
      }])
      .select('id')
      .single();
    if (!error && data) {
      seasonId = data.id;
      await writer.from('tournaments').update({ current_season_id: seasonId }).eq('id', tournamentId);
    } else if (error) {
      warnings.push('No se pudo crear la edición/temporada; el torneo se creó igualmente.');
    }
  }

  // ── 3. Group/league phase + zones ──────────────────────────────────────
  const zones = selection.zones ? interpreted.zones : [];
  const zoneToGroupId = new Map<string, string>();
  let phaseId = '';
  {
    const isGroups = zones.length > 0;
    const phasePayload: Record<string, unknown> = {
      tournament_id: tournamentId,
      season_id: seasonId,
      name: isGroups ? 'Fase de grupos' : 'Tabla general',
      phase_type: isGroups ? 'group_stage' : 'league',
      order_index: 0,
      is_active: true,
      settings: {
        source: 'admin_torneo_import',
        points: baseRuleset.points,
        pointsSystem: baseRuleset.pointsSystem,
        group_names: zones,
        advanceCount: 2,
        phaseMode: isGroups ? 'groups' : 'league',
      },
    };
    let pRes = await writer.from('tournament_phases').insert([phasePayload]).select('id').single();
    if (pRes.error && /season_id/.test(pRes.error.message || '')) {
      const fb = { ...phasePayload }; delete (fb as any).season_id;
      pRes = await writer.from('tournament_phases').insert([fb]).select('id').single();
    }
    if (pRes.error || !pRes.data) {
      warnings.push('No se pudo crear la fase principal del torneo.');
    } else {
      phaseId = pRes.data.id;
      created.phases += 1;
      for (let i = 0; i < zones.length; i += 1) {
        const { data: g } = await writer
          .from('tournament_groups')
          .insert([{ phase_id: phaseId, season_id: seasonId, name: zones[i], order_index: i }])
          .select('id')
          .single();
        if (g) { zoneToGroupId.set(normKey(zones[i]), g.id); created.zones += 1; }
      }
    }
  }

  // ── 4. Clubs + participants ────────────────────────────────────────────
  const teamToClubId = new Map<string, string>();
  const ensureClub = async (rawName: string): Promise<string | null> => {
    const name = rawName.trim();
    const key = normKey(name);
    if (teamToClubId.has(key)) return teamToClubId.get(key)!;
    const baseId = slugify(name);
    if (!baseId) return null;
    // M14b: if the slug is taken by a club with a substantially different name,
    // do NOT adopt it silently — try suffixed slugs to create a distinct club.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = attempt === 0 ? baseId : `${baseId}-${attempt + 1}`;
      const { data: existing } = await writer.from('clubs').select('id, name').eq('id', id).maybeSingle();
      if (existing) {
        if (clubNamesLookAlike(name, existing.name)) {
          teamToClubId.set(key, id);
          return id;
        }
        continue; // slug collision with a different club → try next suffix
      }
      const { error } = await writer.from('clubs').insert([{
        id, slug: id, name, sport: 'rugby', status: 'active', is_visible: false,
      }]);
      if (error && error.code === '23505') continue; // raced with another writer → try next suffix
      if (error) { warnings.push(`No se pudo crear el club "${name}".`); return null; }
      created.clubs += 1;
      teamToClubId.set(key, id);
      return id;
    }
    warnings.push(`No se pudo crear el club "${name}": el slug "${baseId}" ya pertenece a otro club distinto.`);
    return null;
  };

  const clubIdToParticipantId = new Map<string, string>();
  if (selection.teams) {
    let seed = 1;
    for (const team of interpreted.teams) {
      const clubId = await ensureClub(team.name);
      if (!clubId) continue;
      const { data: part, error } = await writer
        .from('tournament_participants')
        .insert([{
          tournament_id: tournamentId,
          season_id: seasonId,
          club_id: clubId,
          name: team.name,
          type: 'club',
          status: 'active',
          seed: seed++,
        }])
        .select('id')
        .single();
      if (error && /season_id/.test(error.message || '')) {
        const retry = await writer
          .from('tournament_participants')
          .insert([{
            tournament_id: tournamentId, club_id: clubId, name: team.name,
            type: 'club', status: 'active', seed: seed - 1,
          }])
          .select('id')
          .single();
        if (retry.data) { clubIdToParticipantId.set(clubId, retry.data.id); created.participants += 1; }
        continue;
      }
      if (part) {
        clubIdToParticipantId.set(clubId, part.id);
        created.participants += 1;
        const gid = team.zone ? zoneToGroupId.get(normKey(team.zone)) : null;
        if (phaseId) {
          await writer.from('tournament_phase_participants').insert([{
            tournament_id: tournamentId,
            season_id: seasonId,
            phase_id: phaseId,
            participant_id: part.id,
            group_id: gid ?? null,
            status: 'active',
            seed: seed - 1,
          }]).then((r: any) => {
            if (r.error && /season_id/.test(r.error.message || '')) {
              return writer.from('tournament_phase_participants').insert([{
                tournament_id: tournamentId, phase_id: phaseId, participant_id: part.id,
                group_id: gid ?? null, status: 'active', seed: seed - 1,
              }]);
            }
            return r;
          });
        }
      }
    }
  }

  // ── 5. Fixture ─────────────────────────────────────────────────────────
  if (selection.matches && phaseId && interpreted.matches.length > 0) {
    const fallbackDate = new Date();
    fallbackDate.setUTCHours(12, 0, 0, 0);
    for (const m of interpreted.matches) {
      const homeId = await ensureClub(m.home);
      const awayId = await ensureClub(m.away);
      if (!homeId || !awayId || homeId === awayId) {
        warnings.push(`Partido omitido (equipo inválido): ${m.home} vs ${m.away}.`);
        continue;
      }
      const gid = m.zone ? zoneToGroupId.get(normKey(m.zone)) ?? null : null;
      const iso = toIso(m.date, m.time) ?? fallbackDate.toISOString();
      try {
        await FixtureService.createMatch({
          tournamentId,
          phaseId,
          roundId: null,
          roundLabel: m.round ? `Fecha ${m.round}` : undefined,
          groupId: gid,
          homeClubId: homeId,
          awayClubId: awayId,
          dateTime: iso,
          venue: m.venue || '',
          status: 'scheduled',
        });
        created.matches += 1;
      } catch (e) {
        warnings.push(`No se pudo crear el partido ${m.home} vs ${m.away}: ${(e as Error)?.message ?? 'error'}.`);
      }
    }
  }

  // ── 6. Players → season rosters (Fase 1 infra) ─────────────────────────
  if (selection.players && seasonId && interpreted.players.length > 0) {
    try {
      await ensureRostersForSeasonEntries(writer, seasonId);
      const { data: rosters } = await writer
        .from('season_rosters')
        .select('id, club_id')
        .eq('season_id', seasonId);
      const clubToRoster = new Map<string, string>(
        (rosters ?? []).map((r: any) => [String(r.club_id), String(r.id)]),
      );
      created.rosters = clubToRoster.size;
      for (const p of interpreted.players) {
        const clubId = teamToClubId.get(normKey(p.team));
        const rosterId = clubId ? clubToRoster.get(clubId) : null;
        if (!rosterId) continue;
        const { first, last } = splitName(p.fullName);
        try {
          await addPlayerToSeasonRoster(writer, rosterId, {
            firstName: first,
            lastName: last,
            jerseyNumber: p.jersey,
            status: 'active',
          });
          created.players += 1;
        } catch {
          /* duplicate / locked — skip silently */
        }
      }
    } catch (e) {
      warnings.push(`No se pudieron importar los jugadores: ${(e as Error)?.message ?? 'error'}.`);
    }
  }

  // ── 7. Import log on tournaments.ruleset.imports ───────────────────────
  try {
    const { data: trow } = await writer
      .from('tournaments')
      .select('ruleset')
      .eq('id', tournamentId)
      .maybeSingle();
    const rs = trow?.ruleset && typeof trow.ruleset === 'object' ? trow.ruleset : baseRuleset;
    const log = Array.isArray((rs as any).imports) ? (rs as any).imports : [];
    log.push({
      at: new Date().toISOString(),
      fileName: params.fileName ?? null,
      by: userId,
      detected: interpreted.stats,
      created,
      warnings: warnings.slice(0, 30),
    });
    await writer
      .from('tournaments')
      .update({ ruleset: { ...rs, imports: log } })
      .eq('id', tournamentId);
  } catch {
    /* logging is best-effort */
  }

  return { ok: true, tournamentId, seasonId, created, warnings };
}
