import 'server-only';

/**
 * Aplica una tanda de modificaciones de la app móvil G22 Gestión.
 *
 * 1. RECLAMA todos los `mutationId` de la tanda en `mobile_sync_mutations` con
 *    UNA consulta. Lo ya aplicado responde `duplicate` sin volver a escribir: un
 *    reintento nunca duplica, aunque se haya perdido la respuesta.
 * 2. Lee de una vez (por entidad) las filas centrales que va a necesitar.
 * 3. Agrupa por partido (ver batchPlan.ts): eventos + marcador + estado + reloj
 *    + alineaciones de un partido salen en UN solo PATCH al Match Center, con
 *    sus permisos (`ensureMatchManagementAccess`) y sus efectos de siempre
 *    (tabla de posiciones, llaves, caché, avisos), UNA vez por partido.
 *    Partidos distintos se procesan en paralelo (de a `GROUP_CONCURRENCY`).
 * 4. Lo demás (altas de partidos, torneos, clubes, jugadores, inscripciones) se
 *    reenvía de a uno a los endpoints existentes de G22 con la sesión del usuario.
 *    La puerta no escribe ninguna tabla de negocio por su cuenta.
 * 5. Deja auditoría (quién, qué, antes → después, dispositivo, cuánto tardó en
 *    llegar desde que se cargó), cierra el registro con métricas y guarda el
 *    informe del dispositivo.
 *
 * Toda actualización pasa por la fusión a tres vías (`mergeRules`, la MISMA copia
 * que corre en el celular): un conflicto real nunca se escribe en silencio.
 *
 * Límite conocido: entre la lectura central y la escritura hay una ventana de
 * milisegundos sin bloqueo (los endpoints de G22 no aceptan If-Match). Es la
 * misma que tiene hoy el Match Center web.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';
import { clockTransitionFor, decideEvent, planBatch, serverHints, toMatchBody, type MatchGroup } from './batchPlan';
import { decideDelete, mergeUpdate, type Row } from './mergeRules';
import {
  PROTOCOL_VERSION,
  type DeviceReport,
  type IdentityCandidate,
  type MutationEnvelope,
  type MutationResult,
  type PushRequest,
  type PushResponse,
  type SyncEntity,
} from './protocol';
import { selectIn, selectOne, type CentralRow } from './rows';
import type { MobileSession } from './session';

export const MAX_MUTATIONS = 50;
const STALE_CLAIM_MS = 2 * 60_000;
const GROUP_CONCURRENCY = 4;
const ENTITIES: ReadonlySet<SyncEntity> = new Set([
  'tournaments',
  'tournament_phases',
  'clubs',
  'tournament_participants',
  'people',
  'matches',
  'match_events',
]);

/** El endpoint reenviado respondió 401: la sesión del celular venció a mitad del envío. */
export class ForwardAuthError extends Error {}
/** Falta correr la migración del registro: sin registro no hay garantía de no duplicar. */
export class LedgerMissingError extends Error {}

const statusRank = (value: unknown): number | null => (value === 'scheduled' ? 0 : value === 'live' ? 1 : value === 'final' ? 2 : null);

interface AuditEntry {
  mutation: MutationEnvelope;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  autoResolved?: MutationResult['autoResolved'];
}

interface Ctx {
  session: MobileSession;
  admin: LooseSupabaseClient;
  origin: string;
  deviceId: string;
  /** Hora del celular al enviar (para el reloj del partido). */
  clientNowMs: number;
  audit: AuditEntry[];
}

interface Forwarded {
  status: number;
  json: any;
}

async function forward(ctx: Ctx, method: string, path: string, body?: unknown): Promise<Forwarded> {
  const response = await fetch(new URL(path, ctx.origin), {
    method,
    cache: 'no-store',
    headers: {
      cookie: ctx.session.cookieHeader,
      accept: 'application/json',
      'content-type': 'application/json',
      'x-g22-mobile-gateway': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.status === 401) throw new ForwardAuthError('La sesión venció.');
  return { status: response.status, json };
}

const ok = (response: Forwarded) => response.status >= 200 && response.status < 300;

function fail(mutationId: string, response: Forwarded, fallback: string): MutationResult {
  const message = String(response.json?.error ?? response.json?.message ?? fallback);
  // 4xx: G22 no lo acepta (permisos, validación) → no se reintenta solo. 5xx: transitorio → se reintenta.
  return { mutationId, status: response.status >= 500 ? 'error' : 'rejected', message };
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function conflictResult(mutationId: string, central: CentralRow | null, conflicts: MutationResult['conflicts'], message: string, autoResolved?: MutationResult['autoResolved']): MutationResult {
  return { mutationId, status: 'conflict', record: central, conflicts, autoResolved, message };
}

function audit(ctx: Ctx, mutation: MutationEnvelope, before: unknown, after: unknown, options: { entityType?: string; entityId?: string; autoResolved?: MutationResult['autoResolved'] } = {}): void {
  ctx.audit.push({
    mutation,
    entityType: options.entityType ?? mutation.entity,
    entityId: options.entityId ?? mutation.recordId,
    before,
    after,
    autoResolved: options.autoResolved,
  });
}

// ─── Registro de modificaciones (idempotencia) ─────────────────────────────

type Claim = { kind: 'claimed' } | { kind: 'answered'; result: MutationResult };

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205';
}

/** Reclama toda la tanda con una consulta; revisa uno por uno solo lo que ya existía. */
async function claimAll(ctx: Ctx, mutations: MutationEnvelope[]): Promise<Map<string, Claim>> {
  const now = new Date().toISOString();
  const claims = new Map<string, Claim>();
  if (!mutations.length) return claims;
  const { data, error } = await ctx.admin
    .from('mobile_sync_mutations')
    .upsert(
      mutations.map((m) => ({
        mutation_id: m.mutationId,
        user_id: ctx.session.userId,
        device_id: ctx.deviceId,
        entity: m.entity,
        op: m.op,
        record_id: m.recordId,
        status: 'processing',
        attempts: Number.isFinite(Number(m.attempts)) ? Number(m.attempts) : 0,
        client_created_at: m.createdAt || null,
        created_at: now,
        updated_at: now,
      })),
      { onConflict: 'mutation_id', ignoreDuplicates: true },
    )
    .select('mutation_id');
  if (error) {
    if (isMissingTable(error)) throw new LedgerMissingError('Falta aplicar la migración mobile_sync_v2.');
    throw error;
  }
  for (const row of (data ?? []) as Array<{ mutation_id: string }>) claims.set(row.mutation_id, { kind: 'claimed' });

  const existing = mutations.filter((m) => !claims.has(m.mutationId));
  if (!existing.length) return claims;
  const { data: rows, error: readError } = await ctx.admin
    .from('mobile_sync_mutations')
    .select('mutation_id, user_id, status, result, updated_at')
    .in('mutation_id', existing.map((m) => m.mutationId));
  if (readError) throw readError;
  const byId = new Map(((rows ?? []) as Array<Record<string, any>>).map((row) => [row.mutation_id as string, row]));

  for (const mutation of existing) {
    const row = byId.get(mutation.mutationId);
    const answer = (result: MutationResult) => claims.set(mutation.mutationId, { kind: 'answered', result });
    if (!row) {
      answer({ mutationId: mutation.mutationId, status: 'error', message: 'Reintentá en un momento.' });
      continue;
    }
    if (row.user_id !== ctx.session.userId) {
      answer({ mutationId: mutation.mutationId, status: 'rejected', message: 'Esa modificación pertenece a otro usuario.' });
      continue;
    }
    if (row.status === 'applied') {
      answer({ ...(row.result as MutationResult), mutationId: mutation.mutationId, status: 'duplicate' });
      continue;
    }
    const stale = Date.now() - Date.parse(row.updated_at as string) >= STALE_CLAIM_MS;
    if (row.status === 'processing' && !stale) {
      answer({ mutationId: mutation.mutationId, status: 'error', message: 'Esta modificación se está procesando en otro envío.' });
      continue;
    }
    // Liberada (falló o quedó en conflicto) o reclamo abandonado: se retoma si nadie la tomó en el medio.
    const { data: retaken } = await ctx.admin
      .from('mobile_sync_mutations')
      .update({ status: 'processing', updated_at: now, attempts: Number(mutation.attempts ?? 0) })
      .eq('mutation_id', mutation.mutationId)
      .eq('status', row.status)
      .eq('updated_at', row.updated_at)
      .select('mutation_id');
    if ((retaken ?? []).length) claims.set(mutation.mutationId, { kind: 'claimed' });
    else answer({ mutationId: mutation.mutationId, status: 'error', message: 'Esta modificación se está procesando en otro envío.' });
  }
  return claims;
}

/** Cierra el registro de toda la tanda con una consulta (con métricas). */
async function settleAll(ctx: Ctx, claimed: MutationEnvelope[], results: Map<string, MutationResult>, startedAt: number): Promise<void> {
  if (!claimed.length) return;
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  const rows = claimed.map((mutation) => {
    const result = results.get(mutation.mutationId) ?? { mutationId: mutation.mutationId, status: 'error' as const };
    const applied = result.status === 'applied' || result.status === 'duplicate';
    return {
      mutation_id: mutation.mutationId,
      user_id: ctx.session.userId,
      device_id: ctx.deviceId,
      entity: mutation.entity,
      op: mutation.op,
      record_id: mutation.recordId,
      server_record_id: result.recordId ?? null,
      // Conflicto, rechazo o error: se libera para que el MISMO mutationId se pueda reintentar.
      status: applied ? 'applied' : 'released',
      result: applied ? result : null,
      result_status: result.status,
      error: applied ? null : (result.message ?? null),
      attempts: Number(mutation.attempts ?? 0),
      client_created_at: mutation.createdAt || null,
      updated_at: finishedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
    };
  });
  const { error } = await ctx.admin.from('mobile_sync_mutations').upsert(rows, { onConflict: 'mutation_id' });
  if (error) console.error('[mobileSync] no se pudo cerrar el registro:', error);
}

async function writeAudit(ctx: Ctx, results: Map<string, MutationResult>): Promise<void> {
  const serverNow = Date.now();
  const rows = ctx.audit
    .filter((entry) => results.get(entry.mutation.mutationId)?.status === 'applied')
    .map((entry) => ({
      actor_user_id: ctx.session.userId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: `mobile.${entry.mutation.entity}.${entry.mutation.op}`,
      request_id: entry.mutation.mutationId,
      source: 'mobile',
      changes: {
        mutationId: entry.mutation.mutationId,
        deviceId: ctx.deviceId,
        entity: entry.mutation.entity,
        recordId: entry.mutation.recordId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        clientCreatedAt: entry.mutation.createdAt,
        // Cuánto tardó en llegar desde que el operador lo cargó (≈ tiempo sin conexión).
        syncLagMs: entry.mutation.createdAt ? Math.max(0, serverNow - Date.parse(entry.mutation.createdAt)) : null,
        attempts: entry.mutation.attempts ?? 0,
        ...(entry.autoResolved?.length ? { autoResolved: entry.autoResolved } : {}),
      },
    }));
  if (!rows.length) return;
  const { error } = await ctx.admin.from('admin_audit_log').insert(rows);
  if (error) console.error('[mobileSync] no se pudo escribir la auditoría:', error);
}

async function reportDevice(ctx: Ctx, device: DeviceReport | undefined, pushMs: number): Promise<void> {
  const row = {
    user_id: ctx.session.userId,
    device_id: ctx.deviceId,
    last_seen_at: new Date().toISOString(),
    last_push_ms: pushMs,
    ...(device
      ? {
          platform: String(device.platform ?? '').slice(0, 40) || null,
          app_version: String(device.appVersion ?? '').slice(0, 40) || null,
          pending: Math.max(0, Number(device.pending) || 0),
          failed: Math.max(0, Number(device.failed) || 0),
          conflicts: Math.max(0, Number(device.conflicts) || 0),
          last_error: device.lastError ? String(device.lastError).slice(0, 500) : null,
          last_sync_at: device.lastSyncAt ?? null,
        }
      : {}),
  };
  const { error } = await ctx.admin.from('mobile_sync_devices').upsert(row, { onConflict: 'user_id,device_id' });
  if (error) console.error('[mobileSync] no se pudo guardar el informe del dispositivo:', error);
}

// ─── Partidos: un PATCH por partido ────────────────────────────────────────

async function applyMatchGroup(
  ctx: Ctx,
  group: MatchGroup,
  centralMatch: CentralRow | null,
  centralEvents: Map<string, CentralRow>,
  results: Map<string, MutationResult>,
): Promise<void> {
  if (!centralMatch) {
    if (group.matchUpdate) results.set(group.matchUpdate.mutationId, conflictResult(group.matchUpdate.mutationId, null, [], 'El partido ya no existe en G22 (alguien lo borró).'));
    for (const event of group.events) results.set(event.mutationId, { mutationId: event.mutationId, status: 'rejected', message: 'El partido del evento ya no existe en G22.' });
    return;
  }

  const body: Record<string, unknown> = {};
  const writers: MutationEnvelope[] = [];
  // Lo que se escribe en el PATCH: se anota como aplicado recién cuando G22 lo confirma.
  const onSuccess = new Map<string, MutationResult>();
  const update = group.matchUpdate;
  if (update) {
    // El reloj no se fusiona campo a campo: gana el último que lo tocó (como en la consola de G22).
    const { clock: localClock, ...fields } = update.payload;
    const { clock: _baseClock, ...baseFields } = update.base;
    const merge = mergeUpdate(fields, baseFields, centralMatch as Row, { statusRank });
    if (merge.conflicts.length) {
      results.set(update.mutationId, conflictResult(update.mutationId, centralMatch, merge.conflicts, 'Otro usuario cambió lo mismo en G22.', merge.autoResolved));
    } else {
      Object.assign(body, toMatchBody(merge.apply));
      if (localClock !== undefined) body.clockTransition = clockTransitionFor(localClock, ctx.clientNowMs);
      writers.push(update);
      onSuccess.set(update.mutationId, { mutationId: update.mutationId, status: 'applied', recordId: centralMatch.id, autoResolved: merge.autoResolved });
      audit(ctx, update, pick(centralMatch, Object.keys(merge.apply)), merge.apply, { entityType: 'matches', entityId: centralMatch.id, autoResolved: merge.autoResolved });
    }
  }

  const upsert: Row[] = [];
  const deleteIds: string[] = [];
  for (const event of group.events) {
    const central = centralEvents.get(event.recordId) ?? null;
    const action = decideEvent(event, central, centralMatch);
    if (action.kind === 'duplicate') {
      results.set(event.mutationId, { mutationId: event.mutationId, status: 'duplicate', recordId: event.recordId, record: central });
      continue;
    }
    if (action.kind === 'gone') {
      results.set(event.mutationId, { mutationId: event.mutationId, status: 'applied', recordId: event.recordId, record: null });
      continue;
    }
    if (action.kind === 'upsert') upsert.push(action.event);
    else deleteIds.push(action.id);
    writers.push(event);
    onSuccess.set(event.mutationId, { mutationId: event.mutationId, status: 'applied', recordId: event.recordId });
    audit(ctx, event, central, action.kind === 'upsert' ? action.event : null, { entityType: 'matches', entityId: centralMatch.id });
  }
  if (upsert.length || deleteIds.length) body.eventPatch = { upsert, deleteIds };
  if (!Object.keys(body).length) return;

  const response = await forward(ctx, 'PATCH', `/api/admin/matches/${encodeURIComponent(centralMatch.id)}?response=compact`, body);
  if (!ok(response)) {
    // Todo lo del partido salió en el mismo pedido: si falló, falló para todos (y se reintenta junto).
    for (const writer of writers) results.set(writer.mutationId, fail(writer.mutationId, response, 'G22 no pudo guardar el partido.'));
    return;
  }
  for (const [mutationId, result] of onSuccess) results.set(mutationId, result);
}

// ─── Sueltos: altas y bajas de partidos, torneos, clubes, jugadores ────────

async function applyMatchSingle(ctx: Ctx, mutation: MutationEnvelope): Promise<MutationResult> {
  const { mutationId, payload } = mutation;
  if (mutation.op === 'insert') {
    const tournamentId = String(payload.tournament_id ?? '');
    const phase = await selectOne(ctx.admin, 'tournament_phases', String(payload.phase_id ?? ''));
    if (!phase || phase.tournament_id !== tournamentId) return { mutationId, status: 'rejected', message: 'La fase seleccionada no existe. Las fases se arman en G22 Scores.' };
    if (!payload.home_club_id || payload.home_club_id === payload.away_club_id) {
      return { mutationId, status: 'rejected', message: 'El local y el visitante tienen que ser equipos distintos.' };
    }
    const body = toMatchBody(payload);
    const response = await forward(ctx, 'POST', '/api/admin/torneo/matches', {
      tournamentId,
      ...pick(body, ['phaseId', 'homeClubId', 'awayClubId', 'dateTime', 'venue', 'status']),
    });
    if (!ok(response)) return fail(mutationId, response, 'G22 no pudo crear el partido.');
    const id = String(response.json?.data?.id ?? response.json?.id ?? '');
    if (!id) return { mutationId, status: 'error', message: 'G22 no devolvió el id del partido.' };
    const extra = pick(body, ['roundLabel', 'notes', 'referee', 'officialSheetNumber', 'score', 'lineups']);
    if (Object.keys(extra).length) await forward(ctx, 'PATCH', `/api/admin/matches/${id}?response=compact`, extra);
    audit(ctx, mutation, null, payload, { entityType: 'matches', entityId: id });
    return { mutationId, status: 'applied', recordId: id, record: await selectOne(ctx.admin, 'matches', id) };
  }

  const central = await selectOne(ctx.admin, 'matches', mutation.recordId);
  if (mutation.op === 'update') {
    // Segundo cambio del mismo partido en una tanda (raro): va solo, con la misma fusión.
    if (!central) return conflictResult(mutationId, null, [], 'El partido ya no existe en G22 (alguien lo borró).');
    const results = new Map<string, MutationResult>();
    await applyMatchGroup(ctx, { matchId: central.id, matchUpdate: mutation, events: [] }, central, new Map(), results);
    const result = results.get(mutationId) ?? { mutationId, status: 'applied' as const, recordId: central.id };
    return result.status === 'applied' ? { ...result, record: await selectOne(ctx.admin, 'matches', central.id) } : result;
  }

  if (!central) return { mutationId, status: 'applied', recordId: mutation.recordId, record: null };
  const decision = decideDelete(mutation.base, central as Row);
  if (decision.kind === 'conflict') return conflictResult(mutationId, central, decision.changedFields, 'Alguien modificó el partido después de que lo viste. No se borró.');
  const response = await forward(ctx, 'DELETE', `/api/admin/matches/${central.id}`);
  if (!ok(response) && response.status !== 404) return fail(mutationId, response, 'G22 no pudo borrar el partido.');
  audit(ctx, mutation, central, null, { entityType: 'matches', entityId: central.id });
  return { mutationId, status: 'applied', recordId: central.id, record: null };
}

const TOURNAMENT_PATCH_KEYS = ['name', 'display_name', 'status', 'is_visible', 'season_id', 'sport_id', 'union_id'];

async function applyTournament(ctx: Ctx, mutation: MutationEnvelope): Promise<MutationResult> {
  const { mutationId, payload } = mutation;
  if (mutation.op === 'insert') {
    const body = pick(payload, ['name', 'display_name', 'sport_id', 'category', 'status', 'season_id', 'is_visible', 'union_id', 'participant_club_ids']);
    const response = await forward(ctx, 'POST', '/api/admin/torneo/tournaments', body);
    if (!ok(response)) return fail(mutationId, response, 'G22 no pudo crear el torneo.');
    const id = String(response.json?.data?.id ?? '');
    if (!id) return { mutationId, status: 'error', message: 'G22 no devolvió el id del torneo.' };
    audit(ctx, mutation, null, body, { entityId: id });
    return { mutationId, status: 'applied', recordId: id, record: (await selectOne(ctx.admin, 'tournaments', id)) ?? { ...payload, id } };
  }
  const central = await selectOne(ctx.admin, 'tournaments', mutation.recordId);
  if (mutation.op === 'update') {
    if (!central) return conflictResult(mutationId, null, [], 'El torneo ya no existe en G22.');
    const merge = mergeUpdate(payload, mutation.base, central as Row, { statusRank });
    if (merge.conflicts.length) return conflictResult(mutationId, central, merge.conflicts, 'Otro usuario cambió lo mismo en G22.', merge.autoResolved);
    const body = pick(merge.apply, TOURNAMENT_PATCH_KEYS);
    if (Object.keys(body).length) {
      const response = await forward(ctx, 'PATCH', `/api/admin/torneo/tournaments/${central.id}`, body);
      if (!ok(response)) return fail(mutationId, response, 'G22 no pudo guardar el torneo.');
      audit(ctx, mutation, pick(central, Object.keys(body)), body, { autoResolved: merge.autoResolved });
    }
    return { mutationId, status: 'applied', recordId: central.id, record: await selectOne(ctx.admin, 'tournaments', central.id), autoResolved: merge.autoResolved };
  }
  if (!central) return { mutationId, status: 'applied', recordId: mutation.recordId, record: null };
  const decision = decideDelete(mutation.base, central as Row);
  if (decision.kind === 'conflict') return conflictResult(mutationId, central, decision.changedFields, 'Alguien modificó el torneo después de que lo viste. No se borró.');
  const response = await forward(ctx, 'DELETE', `/api/admin/torneo/tournaments/${central.id}`);
  if (!ok(response) && response.status !== 404) return fail(mutationId, response, 'G22 no pudo borrar el torneo.');
  audit(ctx, mutation, central, null);
  return { mutationId, status: 'applied', recordId: central.id, record: null };
}

async function findClubsNamed(ctx: Ctx, name: string): Promise<IdentityCandidate[]> {
  const bySlug = await selectOne(ctx.admin, 'clubs', slugify(name));
  const { data } = await ctx.admin.from('clubs').select('id, name').ilike('name', name).limit(5);
  const rows = [...(bySlug ? [bySlug] : []), ...((data ?? []) as CentralRow[])];
  const unique = new Map(rows.map((row) => [row.id, row]));
  return [...unique.values()].map((row) => ({ id: row.id, full_name: String(row.name ?? row.id), club_id: row.id }));
}

async function applyClub(ctx: Ctx, mutation: MutationEnvelope): Promise<MutationResult> {
  const { mutationId, payload } = mutation;
  if (mutation.op === 'insert') {
    if (mutation.identityResolution?.kind === 'use_existing') {
      const existing = await selectOne(ctx.admin, 'clubs', mutation.identityResolution.personId);
      if (!existing) return { mutationId, status: 'rejected', message: 'El club elegido ya no existe.' };
      return { mutationId, status: 'applied', recordId: existing.id, record: existing };
    }
    const body: Record<string, unknown> = pick(payload, ['name', 'short_name', 'sport_id', 'city', 'is_visible', 'union_id']);
    if (mutation.identityResolution?.kind === 'force_new') body.slug = `${slugify(String(payload.name ?? 'club'))}-${Date.now().toString(36).slice(-4)}`;
    const response = await forward(ctx, 'POST', '/api/admin/torneo/clubs', body);
    if (response.status === 409) {
      return {
        mutationId,
        status: 'conflict',
        message: 'Ya existe un club con ese nombre en G22. ¿Es el mismo?',
        identityCandidates: await findClubsNamed(ctx, String(payload.name ?? '')),
      };
    }
    if (!ok(response)) return fail(mutationId, response, 'G22 no pudo crear el club.');
    const id = String(response.json?.data?.id ?? '');
    if (!id) return { mutationId, status: 'error', message: 'G22 no devolvió el id del club.' };
    audit(ctx, mutation, null, body, { entityId: id });
    return { mutationId, status: 'applied', recordId: id, record: (await selectOne(ctx.admin, 'clubs', id)) ?? { ...payload, id } };
  }
  const central = await selectOne(ctx.admin, 'clubs', mutation.recordId);
  if (mutation.op === 'update') {
    if (!central) return conflictResult(mutationId, null, [], 'El club ya no existe en G22.');
    const merge = mergeUpdate(payload, mutation.base, central as Row, { statusRank });
    if (merge.conflicts.length) return conflictResult(mutationId, central, merge.conflicts, 'Otro usuario cambió lo mismo en G22.', merge.autoResolved);
    const body = pick(merge.apply, ['name', 'short_name', 'city', 'is_visible']);
    // En el PATCH de G22 el deporte del club es `sport`, no `sport_id`.
    if (merge.apply.sport_id !== undefined) body.sport = merge.apply.sport_id;
    if (Object.keys(body).length) {
      const response = await forward(ctx, 'PATCH', `/api/clubs/${encodeURIComponent(central.id)}`, body);
      if (!ok(response)) return fail(mutationId, response, 'G22 no pudo guardar el club.');
      audit(ctx, mutation, pick(central, Object.keys(merge.apply)), merge.apply, { autoResolved: merge.autoResolved });
    }
    return { mutationId, status: 'applied', recordId: central.id, record: await selectOne(ctx.admin, 'clubs', central.id), autoResolved: merge.autoResolved };
  }
  if (!central) return { mutationId, status: 'applied', recordId: mutation.recordId, record: null };
  const decision = decideDelete(mutation.base, central as Row);
  if (decision.kind === 'conflict') return conflictResult(mutationId, central, decision.changedFields, 'Alguien modificó el club después de que lo viste. No se borró.');
  const response = await forward(ctx, 'DELETE', `/api/clubs/${encodeURIComponent(central.id)}`);
  if (!ok(response) && response.status !== 404) return fail(mutationId, response, 'G22 no pudo borrar el club.');
  audit(ctx, mutation, central, null);
  return { mutationId, status: 'applied', recordId: central.id, record: null };
}

const PERSON_KEYS = ['first_name', 'last_name', 'position', 'status', 'role'];

async function applyPerson(ctx: Ctx, mutation: MutationEnvelope): Promise<MutationResult> {
  const { mutationId, payload } = mutation;
  if (mutation.op === 'insert') {
    const body: Record<string, unknown> = { clubId: payload.club_id, role: 'player', ...pick(payload, PERSON_KEYS) };
    if (mutation.identityResolution?.kind === 'force_new') body.force_create_new = true;
    if (mutation.identityResolution?.kind === 'use_existing') body.existing_person_id = mutation.identityResolution.personId;
    const response = await forward(ctx, 'POST', '/api/club-admin/roster', body);
    if (response.status === 400 && response.json?.code === 'identity_confirmation_required') {
      const matches = Array.isArray(response.json?.matches) ? response.json.matches : [];
      return {
        mutationId,
        status: 'conflict',
        message: 'Ya hay una persona con ese nombre en G22. ¿Es la misma?',
        identityCandidates: matches.map((candidate: Record<string, unknown>) => ({
          id: String(candidate.id ?? candidate.person_id ?? ''),
          full_name: String(candidate.full_name ?? candidate.name ?? `${candidate.first_name ?? ''} ${candidate.last_name ?? ''}`).trim(),
          club_id: (candidate.club_id as string | null) ?? null,
        })),
      };
    }
    if (!ok(response)) return fail(mutationId, response, 'G22 no pudo crear el jugador.');
    const id = String(response.json?.data?.id ?? '');
    if (!id) return { mutationId, status: 'error', message: 'G22 no devolvió el id del jugador.' };
    audit(ctx, mutation, null, body, { entityId: id });
    return { mutationId, status: 'applied', recordId: id, record: await selectOne(ctx.admin, 'people', id) };
  }
  const central = await selectOne(ctx.admin, 'people', mutation.recordId);
  if (mutation.op === 'update') {
    if (!central) return conflictResult(mutationId, null, [], 'El jugador ya no existe en G22.');
    const merge = mergeUpdate(payload, mutation.base, central as Row, { statusRank });
    if (merge.conflicts.length) return conflictResult(mutationId, central, merge.conflicts, 'Otro usuario cambió lo mismo en G22.', merge.autoResolved);
    if (Object.keys(merge.apply).length) {
      // El PATCH del plantel escribe nombre y apellido siempre: se manda el registro completo.
      const full = { ...central, ...merge.apply };
      const response = await forward(ctx, 'PATCH', '/api/club-admin/roster', { clubId: central.club_id, personId: central.id, role: 'player', ...pick(full, PERSON_KEYS) });
      if (!ok(response)) return fail(mutationId, response, 'G22 no pudo guardar el jugador.');
      audit(ctx, mutation, pick(central, Object.keys(merge.apply)), merge.apply, { autoResolved: merge.autoResolved });
    }
    return { mutationId, status: 'applied', recordId: central.id, record: await selectOne(ctx.admin, 'people', central.id), autoResolved: merge.autoResolved };
  }
  if (!central) return { mutationId, status: 'applied', recordId: mutation.recordId, record: null };
  const params = new URLSearchParams({ clubId: String(central.club_id ?? ''), personId: central.id });
  const response = await forward(ctx, 'DELETE', `/api/club-admin/roster?${params.toString()}`);
  if (!ok(response) && response.status !== 404) return fail(mutationId, response, 'G22 no pudo quitar el jugador del plantel.');
  audit(ctx, mutation, central, null);
  return { mutationId, status: 'applied', recordId: central.id, record: null };
}

async function applyParticipant(ctx: Ctx, mutation: MutationEnvelope): Promise<MutationResult> {
  const { mutationId, payload } = mutation;
  if (mutation.op === 'insert') {
    const tournamentId = String(payload.tournament_id ?? '');
    const clubId = String(payload.club_id ?? '');
    if (!tournamentId || !clubId) return { mutationId, status: 'rejected', message: 'Faltan el torneo o el equipo.' };
    const findExisting = async () => (await selectIn(ctx.admin, 'tournament_participants', 'tournament_id', [tournamentId])).find((row) => row.club_id === clubId) ?? null;
    const existing = await findExisting();
    if (existing) return { mutationId, status: 'duplicate', recordId: existing.id, record: existing };
    // La ruta del panel del gestor: también inscribe al equipo en la fase (tabla de posiciones).
    const response = await forward(ctx, 'POST', `/api/admin/torneo/tournaments/${encodeURIComponent(tournamentId)}/participants`, { club_id: clubId });
    if (response.status === 409) {
      const again = await findExisting();
      if (again) return { mutationId, status: 'duplicate', recordId: again.id, record: again };
    }
    if (!ok(response)) return fail(mutationId, response, 'G22 no pudo sumar el equipo al torneo.');
    const created = await findExisting();
    const id = String(response.json?.data?.id ?? response.json?.id ?? created?.id ?? '');
    if (!id) return { mutationId, status: 'error', message: 'G22 no devolvió el id de la inscripción.' };
    audit(ctx, mutation, null, { tournament_id: tournamentId, club_id: clubId }, { entityId: id });
    return { mutationId, status: 'applied', recordId: id, record: created ?? (await selectOne(ctx.admin, 'tournament_participants', id)) };
  }
  if (mutation.op === 'delete') {
    const central = await selectOne(ctx.admin, 'tournament_participants', mutation.recordId);
    if (!central) return { mutationId, status: 'applied', recordId: mutation.recordId, record: null };
    const response = await forward(
      ctx,
      'DELETE',
      `/api/admin/torneo/tournaments/${encodeURIComponent(String(central.tournament_id))}/participants?participantId=${encodeURIComponent(central.id)}`,
    );
    if (!ok(response) && response.status !== 404) return fail(mutationId, response, 'G22 no pudo quitar el equipo del torneo.');
    audit(ctx, mutation, central, null);
    return { mutationId, status: 'applied', recordId: central.id, record: null };
  }
  return { mutationId, status: 'rejected', message: 'Una inscripción no se edita: quitá el equipo y volvé a agregarlo.' };
}

function applySingle(ctx: Ctx, mutation: MutationEnvelope): Promise<MutationResult> {
  switch (mutation.entity) {
    case 'matches':
      return applyMatchSingle(ctx, mutation);
    case 'match_events':
      return Promise.resolve({ mutationId: mutation.mutationId, status: 'rejected', message: 'El evento no dice de qué partido es.' });
    case 'tournaments':
      return applyTournament(ctx, mutation);
    case 'clubs':
      return applyClub(ctx, mutation);
    case 'people':
      return applyPerson(ctx, mutation);
    case 'tournament_participants':
      return applyParticipant(ctx, mutation);
    default:
      return Promise.resolve({ mutationId: mutation.mutationId, status: 'rejected', message: 'Esto se edita en G22 Scores.' });
  }
}

// ─── Entrada ───────────────────────────────────────────────────────────────

function isValidEnvelope(value: unknown): value is MutationEnvelope {
  const m = value as MutationEnvelope | null;
  return Boolean(
    m &&
      typeof m.mutationId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(m.mutationId) &&
      ENTITIES.has(m.entity) &&
      (m.op === 'insert' || m.op === 'update' || m.op === 'delete') &&
      typeof m.recordId === 'string' &&
      m.payload &&
      typeof m.payload === 'object' &&
      m.base &&
      typeof m.base === 'object',
  );
}

/** Corre `tasks` de a `limit` a la vez. */
async function runLimited(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task!();
    }
  });
  await Promise.all(workers);
}

export async function processPush(session: MobileSession, request: PushRequest, origin: string): Promise<PushResponse> {
  const startedAt = Date.now();
  const sentAt = request.sentAt ? Date.parse(request.sentAt) : NaN;
  const ctx: Ctx = {
    session,
    admin: createAdminClient(),
    origin,
    deviceId: String(request.deviceId ?? '').slice(0, 100) || 'desconocido',
    // Sin hora del celular (app v1) se usa la del servidor, como antes.
    clientNowMs: Number.isFinite(sentAt) ? sentAt : startedAt,
    audit: [],
  };
  const incoming = (request.mutations ?? []).slice(0, MAX_MUTATIONS);
  const results = new Map<string, MutationResult>();
  const valid: MutationEnvelope[] = [];
  for (const mutation of incoming) {
    if (isValidEnvelope(mutation)) valid.push(mutation);
    else {
      const id = String((mutation as { mutationId?: unknown })?.mutationId ?? '');
      results.set(id, { mutationId: id, status: 'rejected', message: 'Modificación mal formada.' });
    }
  }

  const claims = await claimAll(ctx, valid);
  const claimed: MutationEnvelope[] = [];
  for (const mutation of valid) {
    const claim = claims.get(mutation.mutationId);
    if (claim?.kind === 'answered') results.set(mutation.mutationId, claim.result);
    else if (claim?.kind === 'claimed') claimed.push(mutation);
  }

  try {
    // Lectura en bloque: los eventos que se tocan y los partidos de esos eventos.
    const eventIds = claimed.filter((m) => m.entity === 'match_events').map((m) => m.recordId);
    const centralEvents = new Map((await selectIn(ctx.admin, 'match_events', 'id', eventIds)).map((row) => [row.id, row]));
    const plan = planBatch(claimed, (m) => {
      const fromPayload = typeof m.payload.match_id === 'string' ? m.payload.match_id : '';
      return fromPayload || String(centralEvents.get(m.recordId)?.match_id ?? '') || null;
    });
    const centralMatches = new Map((await selectIn(ctx.admin, 'matches', 'id', plan.groups.map((g) => g.matchId))).map((row) => [row.id, row]));

    // Sueltos, en orden.
    for (const mutation of plan.singles) {
      try {
        results.set(mutation.mutationId, await applySingle(ctx, mutation));
      } catch (error) {
        if (error instanceof ForwardAuthError) throw error;
        console.error('[mobileSync] Falló una modificación:', { mutationId: mutation.mutationId, entity: mutation.entity, op: mutation.op, error });
        results.set(mutation.mutationId, { mutationId: mutation.mutationId, status: 'error', message: 'Error interno de G22. Se reintenta solo.' });
      }
    }

    // Un PATCH por partido; partidos distintos en paralelo.
    await runLimited(
      plan.groups.map((group) => async () => {
        try {
          await applyMatchGroup(ctx, group, centralMatches.get(group.matchId) ?? null, centralEvents, results);
        } catch (error) {
          if (error instanceof ForwardAuthError) throw error;
          console.error('[mobileSync] Falló un partido:', { matchId: group.matchId, error });
          for (const m of [...(group.matchUpdate ? [group.matchUpdate] : []), ...group.events]) {
            results.set(m.mutationId, { mutationId: m.mutationId, status: 'error', message: 'Error interno de G22. Se reintenta solo.' });
          }
        }
      }),
      GROUP_CONCURRENCY,
    );

    // La fila central después de escribir, en bloque (la app la guarda como versión conocida).
    const needRecord = (entity: SyncEntity) =>
      claimed.filter((m) => m.entity === entity && m.op !== 'delete' && results.get(m.mutationId)?.status === 'applied' && results.get(m.mutationId)?.record === undefined);
    const eventsNeeding = needRecord('match_events');
    const matchesNeeding = needRecord('matches');
    const eventsAfter = new Map((await selectIn(ctx.admin, 'match_events', 'id', eventsNeeding.map((m) => m.recordId))).map((r) => [r.id, r]));
    const matchesAfter = new Map((await selectIn(ctx.admin, 'matches', 'id', matchesNeeding.map((m) => m.recordId))).map((r) => [r.id, r]));
    for (const m of eventsNeeding) results.set(m.mutationId, { ...results.get(m.mutationId)!, record: eventsAfter.get(m.recordId) ?? null });
    for (const m of matchesNeeding) results.set(m.mutationId, { ...results.get(m.mutationId)!, record: matchesAfter.get(m.recordId) ?? null });
  } catch (error) {
    // Sesión vencida a mitad de la tanda: se libera todo lo tomado para que el celular lo reintente.
    // Lo ya confirmado por G22 queda aplicado (se escribió); lo demás vuelve a la cola del celular.
    for (const m of claimed) if (!results.has(m.mutationId)) results.set(m.mutationId, { mutationId: m.mutationId, status: 'error', message: 'La sesión venció.' });
    await settleAll(ctx, claimed, results, startedAt);
    await writeAudit(ctx, results);
    throw error;
  }

  await settleAll(ctx, claimed, results, startedAt);
  await Promise.all([writeAudit(ctx, results), reportDevice(ctx, request.device, Date.now() - startedAt)]);

  const ordered = incoming.map((m) => {
    const id = String((m as { mutationId?: unknown })?.mutationId ?? '');
    return results.get(id) ?? { mutationId: id, status: 'error' as const, message: 'Sin respuesta.' };
  });
  return { protocolVersion: PROTOCOL_VERSION, serverTime: new Date().toISOString(), results: ordered, ...serverHints(Date.now() - startedAt) };
}
