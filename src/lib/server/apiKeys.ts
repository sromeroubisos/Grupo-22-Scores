import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Sistema de API keys por consumidor.
 *
 * Una key = una fila en `api_keys`, con nombre, permisos y revocacion. De la
 * key solo se guarda el sha256 y un preview parcial: el secreto se muestra una
 * unica vez, cuando se crea.
 *
 * La verificacion NO recorre la tabla: hashea el candidato y busca por
 * `secret_hash`, que tiene indice unico. Por eso no hace falta comparacion en
 * tiempo constante — no hay comparacion, hay lookup.
 */

const KEY_PREFIX = 'g22_';
const LAST_USED_THROTTLE_MS = 60_000;

export const API_KEY_SCOPES = [
  {
    id: 'results:read',
    label: 'Leer resultados',
    description: 'Buscar partidos, torneos, piezas publicables y la agenda por fecha.',
  },
  {
    id: 'results:write',
    label: 'Actualizar resultados',
    description: 'Cargar marcadores y observaciones. Escribe en la base.',
  },
  {
    id: 'lineups:write',
    label: 'Cargar formaciones',
    description: 'Titulares y suplentes de un partido, con numero, puesto y capitan.',
  },
  {
    id: 'matches:create',
    label: 'Dar de alta partidos',
    description: 'Crear un partido en un torneo. Va en dos pasos: primero muestra que entendio, despues crea.',
  },
  {
    id: 'matches:ingest',
    label: 'Ingesta de partidos',
    description: 'Webhook de WhatsApp y n8n para dar de alta o corregir partidos.',
  },
  {
    id: 'cron:run',
    label: 'Disparar sincronizaciones',
    description: 'Ejecutar a mano las rutas de /api/cron/* que hoy piden CRON_SECRET.',
  },
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]['id'];

const VALID_SCOPES = new Set<string>(API_KEY_SCOPES.map((scope) => scope.id));

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === 'string' && VALID_SCOPES.has(value);
}

export type ApiKeyRecord = {
  id: string;
  name: string;
  description: string | null;
  preview: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  createdByUserId: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revoked: boolean;
};

export type ApiKeyVerificationFailure =
  | 'missing_credentials'
  | 'unauthorized'
  | 'revoked'
  | 'forbidden_scope';

export type ApiKeyVerification =
  | {
      ok: true;
      source: 'database';
      keyId: string;
      keyName: string;
      scopes: ApiKeyScope[];
      reason?: undefined;
    }
  | {
      ok: true;
      source: 'environment';
      keyId: null;
      keyName: string;
      scopes: ApiKeyScope[];
      reason?: undefined;
    }
  | { ok: false; reason: ApiKeyVerificationFailure };

type ApiKeyRow = {
  id: string;
  name: string;
  description: string | null;
  secret_preview: string;
  scopes: string[] | null;
  created_by_user_id: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const SELECT_COLUMNS =
  'id, name, description, secret_preview, scopes, created_by_user_id, created_at, last_used_at, revoked_at';

/**
 * La tabla todavia no existe (migracion sin correr).
 *
 * Mira SOLO el codigo de error. El detector viejo de `resultsApiKeys.ts`
 * tambien daba por "falta la migracion" cualquier mensaje que mencionara el
 * nombre de la tabla — una violacion de constraint incluida—, asi que el panel
 * pedia correr una migracion que ya estaba corrida.
 */
export function isMissingApiKeysTableError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  // 42P01: la tabla no existe. PGRST205: PostgREST no la tiene en el cache de
  // esquema, que desde el lado del cliente es lo mismo.
  return code === '42P01' || code === 'PGRST205';
}

function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

function buildPreview(secret: string) {
  return secret.length <= 16 ? secret : `${secret.slice(0, 12)}...${secret.slice(-4)}`;
}

function normalizeCandidate(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function normalizeScopes(scopes: string[] | null): ApiKeyScope[] {
  return (scopes ?? []).filter(isApiKeyScope);
}

function serializeRow(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preview: row.secret_preview,
    scopes: normalizeScopes(row.scopes),
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    revoked: Boolean(row.revoked_at),
  };
}

/** Los tres headers que aceptan las integraciones ya en produccion. */
export function extractApiKeyCandidates(headers: Headers) {
  const authorization = headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  return Array.from(
    new Set(
      [bearer, headers.get('x-api-key'), headers.get('x-webhook-secret')]
        .map(normalizeCandidate)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Administracion
// ---------------------------------------------------------------------------

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('api_keys')
    .select(SELECT_COLUMNS)
    .order('revoked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ApiKeyRow[]).map(serializeRow);
}

export async function createApiKey(input: {
  name: string;
  description?: string | null;
  scopes: ApiKeyScope[];
  actorUserId: string;
}): Promise<{ record: ApiKeyRecord; secret: string }> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('La key necesita un nombre para saber quien la usa.');
  }

  const scopes = Array.from(new Set(input.scopes.filter(isApiKeyScope)));
  if (scopes.length === 0) {
    throw new Error('Elegi al menos un permiso para la key.');
  }

  const secret = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('api_keys')
    .insert({
      name,
      description: input.description?.trim() || null,
      secret_hash: hashSecret(secret),
      secret_preview: buildPreview(secret),
      scopes,
      created_by_user_id: input.actorUserId,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return { record: serializeRow(data as ApiKeyRow), secret };
}

/**
 * Revocar no borra: la fila queda para que el historial de uso siga siendo
 * legible y para que ese hash no se pueda reutilizar.
 */
export async function revokeApiKey(id: string, actorUserId: string): Promise<ApiKeyRecord> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('api_keys')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: actorUserId,
    })
    .eq('id', id)
    .is('revoked_at', null)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('La key no existe o ya estaba revocada.');
  }

  return serializeRow(data as ApiKeyRow);
}

// ---------------------------------------------------------------------------
// Verificacion
// ---------------------------------------------------------------------------

async function touchLastUsed(id: string, lastUsedAt: string | null) {
  // Una escritura por request seria una fila caliente en cada llamada de la
  // integracion. Con un minuto de gracia alcanza para saber si una key quedo
  // huerfana, que es la pregunta que el panel tiene que poder contestar.
  if (lastUsedAt && Date.now() - new Date(lastUsedAt).getTime() < LAST_USED_THROTTLE_MS) {
    return;
  }

  try {
    const admin = createAdminClient();
    await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // Marcar el uso nunca puede tumbar el request que se estaba autenticando.
  }
}

async function findKeyBySecret(secret: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('api_keys')
    .select(SELECT_COLUMNS)
    .eq('secret_hash', hashSecret(secret))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as ApiKeyRow | null;
}

export type ApiKeyFallback = {
  /** Nombre legible, para el log y para el panel. */
  name: string;
  /** Secretos aceptados en texto plano (variables de entorno). */
  secrets: Array<string | null | undefined>;
  /** Permisos que se le conceden a ese fallback. */
  scopes: ApiKeyScope[];
};

/**
 * Autentica un request contra el sistema de keys.
 *
 * `fallbacks` mantiene vivos los secrets por entorno que ya estan configurados
 * en Vercel (CRON_SECRET, WHATSAPP_MATCH_WEBHOOK_SECRET, etc.). Son un puente,
 * no el sistema: no se pueden revocar desde el panel, y por eso el panel los
 * muestra aparte y avisa.
 */
export async function verifyApiKeyRequest(
  headers: Headers,
  requiredScope: ApiKeyScope,
  fallbacks: ApiKeyFallback[] = [],
): Promise<ApiKeyVerification> {
  const candidates = extractApiKeyCandidates(headers);

  if (candidates.length === 0) {
    return { ok: false, reason: 'missing_credentials' };
  }

  let sawRevoked = false;
  let sawWrongScope = false;

  for (const candidate of candidates) {
    let row: ApiKeyRow | null = null;

    try {
      row = await findKeyBySecret(candidate);
    } catch (error) {
      // Sin tabla todavia, o con la base caida: queda el camino de los
      // fallbacks por entorno. Que Postgres no conteste no puede dejar sin
      // autenticar a los crons de Vercel, que van con CRON_SECRET.
      if (!isMissingApiKeysTableError(error)) {
        console.error('[apiKeys] no se pudo consultar api_keys, se sigue con los secrets por entorno', error);
      }
      break;
    }

    if (!row) {
      continue;
    }

    if (row.revoked_at) {
      sawRevoked = true;
      continue;
    }

    const scopes = normalizeScopes(row.scopes);
    if (!scopes.includes(requiredScope)) {
      sawWrongScope = true;
      continue;
    }

    void touchLastUsed(row.id, row.last_used_at);

    return { ok: true, source: 'database', keyId: row.id, keyName: row.name, scopes };
  }

  for (const fallback of fallbacks) {
    if (!fallback.scopes.includes(requiredScope)) {
      continue;
    }

    for (const secret of fallback.secrets) {
      const normalized = normalizeCandidate(secret);
      if (!normalized) {
        continue;
      }

      // Comparacion por hash: dos digests de 32 bytes, sin filtrar longitud ni
      // prefijo del secreto real por timing.
      const secretHash = hashSecret(normalized);
      if (candidates.some((candidate) => hashSecret(candidate) === secretHash)) {
        return {
          ok: true,
          source: 'environment',
          keyId: null,
          keyName: fallback.name,
          scopes: fallback.scopes,
        };
      }
    }
  }

  if (sawRevoked) {
    return { ok: false, reason: 'revoked' };
  }

  if (sawWrongScope) {
    return { ok: false, reason: 'forbidden_scope' };
  }

  return { ok: false, reason: 'unauthorized' };
}

/**
 * Hay alguna credencial viva para ese permiso? Sirve para distinguir "la key
 * esta mal" de "todavia no configuraste ninguna", que es la diferencia entre
 * un 401 y un 500 con instrucciones.
 */
export async function hasAnyCredentialFor(
  requiredScope: ApiKeyScope,
  fallbacks: ApiKeyFallback[] = [],
): Promise<boolean> {
  const envConfigured = fallbacks.some(
    (fallback) =>
      fallback.scopes.includes(requiredScope) &&
      fallback.secrets.some((secret) => Boolean(normalizeCandidate(secret))),
  );

  if (envConfigured) {
    return true;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('api_keys')
      .select('id')
      .is('revoked_at', null)
      .contains('scopes', [requiredScope])
      .limit(1);

    if (error) {
      throw error;
    }

    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
