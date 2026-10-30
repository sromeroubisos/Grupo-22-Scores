// COPIA de la app G22 Gestión (mobile/src/sync) generada por scripts/vendor-g22.mjs. NO EDITAR A MANO.
/**
 * Contrato interno entre el motor de sincronización y sus transportes
 * (`G22DirectTransport`, que habla con G22 Scores tal como es, y `DemoServer`).
 * Archivo PURO y propio de la app: G22 no tiene una copia.
 */
import type { FieldConflict } from './mergeRules';

/**
 * v2 (2026-09-25): informe del dispositivo, pistas de ritmo del servidor
 * (`maxBatch`, `retryAfterMs`) y descarga incremental (`since` + borrados).
 * Todo lo nuevo es opcional: un servidor v1 lo ignora y la app sigue andando.
 */
export const PROTOCOL_VERSION = 2;

export type SyncEntity =
  | 'tournaments'
  | 'tournament_phases'
  | 'clubs'
  | 'tournament_participants'
  | 'people'
  | 'matches'
  | 'match_events';

export type MutationOp = 'insert' | 'update' | 'delete';

/** Una modificación hecha en el celular. `mutationId` la identifica para siempre. */
export interface MutationEnvelope {
  mutationId: string;
  entity: SyncEntity;
  op: MutationOp;
  /** Id del registro. En un alta es el id provisorio que generó el celular. */
  recordId: string;
  /** insert: fila completa · update: solo los campos cambiados · delete: {} */
  payload: Record<string, unknown>;
  /**
   * Lo que el operador VIO antes de modificar: update → valor previo de cada
   * campo cambiado; delete → la fila central tal como la conocía. Es la base de
   * la fusión a tres vías (ver mergeRules.ts).
   */
  base: Record<string, unknown>;
  createdAt: string;
  /**
   * Resolución de un conflicto de identidad al dar de alta un jugador:
   * 'force_new' (es otra persona) o el id de una persona existente.
   */
  identityResolution?: { kind: 'force_new' } | { kind: 'use_existing'; personId: string };
  /** El operador eligió "mantener lo mío" en un conflicto: se aplica sobre la versión central indicada. */
  overrideCentral?: boolean;
  /** v2: intentos previos de esta modificación (métricas de reintentos). */
  attempts?: number;
}

/** v2: cómo está el celular. El servidor lo guarda para detectar cuellos de botella por dispositivo. */
export interface DeviceReport {
  platform: string;
  appVersion: string;
  pending: number;
  failed: number;
  conflicts: number;
  lastError: string | null;
  lastSyncAt: string | null;
}

export interface PushRequest {
  protocolVersion: number;
  deviceId: string;
  mutations: MutationEnvelope[];
  /** v2: hora del celular al enviar. El reloj del partido se resuelve con ella (el ancla es del celular). */
  sentAt?: string;
  device?: DeviceReport;
}

export type MutationStatus =
  /** Se escribió en la base central. */
  | 'applied'
  /** Ya se había aplicado antes (reintento): no se duplicó nada. */
  | 'duplicate'
  /** Choca con un cambio hecho en la base central. No se escribió nada. */
  | 'conflict'
  /** G22 no lo permite (permisos, validación). No se va a reintentar solo. */
  | 'rejected'
  /** Falla transitoria (red, base caída). Se reintenta. */
  | 'error';

export interface IdentityCandidate {
  id: string;
  full_name: string;
  club_id: string | null;
}

export interface MutationResult {
  mutationId: string;
  status: MutationStatus;
  /** Id definitivo en la base central (puede diferir del provisorio en las altas). */
  recordId?: string;
  /** Fila central después de aplicar (o la fila central actual, si hubo conflicto). */
  record?: Record<string, unknown> | null;
  conflicts?: FieldConflict[];
  /** Conflictos resueltos por regla, para el historial. */
  autoResolved?: Array<FieldConflict & { rule: string; winner: 'local' | 'central' }>;
  /** Alta de jugador con nombre repetido: posibles personas existentes. */
  identityCandidates?: IdentityCandidate[];
  message?: string;
}

export interface PushResponse {
  protocolVersion: number;
  serverTime: string;
  results: MutationResult[];
  /** v2: tamaño de tanda que el servidor aguanta ahora. La app no lo supera. */
  maxBatch?: number;
  /** v2: el servidor pide esperar antes de la próxima tanda (carga alta). */
  retryAfterMs?: number;
}

export interface AccessPayload {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  memberships: Array<{ scopeType: string; scopeId?: string; role: string }>;
  tournamentScope: { unlimited: boolean; tournamentIds: string[]; clubIds: string[] };
  clubFamilies: Record<string, string[]>;
}

/** v2: pedido de descarga. Sin `since` es la foto completa. */
export interface SnapshotRequest {
  /** `cursor` de la descarga anterior: se baja solo lo que cambió después. */
  since?: string | null;
  /** `scopeHash` de la descarga anterior: si el alcance del usuario cambió, el servidor manda la foto completa. */
  scopeHash?: string | null;
}

export interface Tombstone {
  entity: SyncEntity;
  id: string;
}

/**
 * Foto de todo lo que el usuario puede gestionar, dentro de la ventana de fechas.
 * v2: con `mode: 'delta'` trae SOLO lo cambiado desde `since` más los borrados
 * (`tombstones`); lo que no viene no se toca.
 */
export interface SnapshotResponse {
  protocolVersion: number;
  serverTime: string;
  access: AccessPayload;
  window: { from: string; to: string };
  data: Record<SyncEntity, Array<Record<string, unknown> & { id: string }>>;
  mode?: 'full' | 'delta';
  tombstones?: Tombstone[];
  /** Lo que hay que mandar como `since` la próxima vez. */
  cursor?: string;
  scopeHash?: string;
}
