import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const RESULTS_API_KEY_NAME = 'results_api';
const RESULTS_API_KEY_PREFIX = 'g22r_';
const CACHE_TTL_MS = 30_000;

type StoredResultsApiKeyRow = {
  key_name: string;
  secret_hash: string;
  secret_preview: string;
  rotated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type StoredResultsApiKeyCache = {
  row: StoredResultsApiKeyRow | null;
  storageReady: boolean;
  expiresAt: number;
};

export type StoredResultsApiKeyStatus = {
  storageReady: boolean;
  configured: boolean;
  preview: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

let storedResultsApiKeyCache: StoredResultsApiKeyCache | null = null;

function normalizeSecret(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function hashSecretBuffer(value: string) {
  return createHash('sha256').update(value).digest();
}

function hashSecretHex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safePlainSecretEquals(candidate: string | null, secret: string) {
  const normalizedCandidate = normalizeSecret(candidate);
  const normalizedSecret = normalizeSecret(secret);

  if (!normalizedCandidate || !normalizedSecret) {
    return false;
  }

  return timingSafeEqual(
    hashSecretBuffer(normalizedCandidate),
    hashSecretBuffer(normalizedSecret),
  );
}

function safeHashSecretEquals(candidate: string | null, secretHash: string) {
  const normalizedCandidate = normalizeSecret(candidate);
  if (!normalizedCandidate || !/^[a-f0-9]{64}$/i.test(secretHash)) {
    return false;
  }

  const candidateHash = hashSecretBuffer(normalizedCandidate);
  const storedHash = Buffer.from(secretHash.toLowerCase(), 'hex');

  if (candidateHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, storedHash);
}

function buildSecretPreview(secret: string) {
  if (secret.length <= 16) {
    return secret;
  }

  return `${secret.slice(0, 12)}...${secret.slice(-4)}`;
}

function getResultsApiEnvEntries() {
  return [
    ['RESULTS_API_KEY', process.env.RESULTS_API_KEY],
    ['MATCH_RESULTS_API_KEY', process.env.MATCH_RESULTS_API_KEY],
    ['WHATSAPP_MATCH_WEBHOOK_SECRET', process.env.WHATSAPP_MATCH_WEBHOOK_SECRET],
    ['N8N_MATCH_WEBHOOK_SECRET', process.env.N8N_MATCH_WEBHOOK_SECRET],
  ] as const;
}

export function getConfiguredResultsApiEnvNames() {
  return getResultsApiEnvEntries()
    .filter(([, value]) => Boolean(normalizeSecret(value)))
    .map(([name]) => name);
}

function getConfiguredResultsApiEnvSecrets() {
  return Array.from(
    new Set(
      getResultsApiEnvEntries()
        .map(([, value]) => normalizeSecret(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

/**
 * La tabla no existe todavia.
 *
 * Mira SOLO el codigo de error. Antes tambien daba por "falta la migracion"
 * cualquier mensaje que mencionara `system_api_keys` — el nombre de la tabla
 * aparece en el texto de toda violacion de constraint—, asi que el panel
 * mandaba a correr una migracion que ya estaba corrida y tapaba el error real.
 */
function isMissingSystemApiKeysTableError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';

  // PGRST205: PostgREST no tiene la tabla en su cache de esquema.
  return code === '42P01' || code === 'PGRST205';
}

function clearStoredResultsApiKeyCache() {
  storedResultsApiKeyCache = null;
}

async function readStoredResultsApiKeyRecord(forceRefresh = false) {
  if (!forceRefresh && storedResultsApiKeyCache && storedResultsApiKeyCache.expiresAt > Date.now()) {
    return {
      row: storedResultsApiKeyCache.row,
      storageReady: storedResultsApiKeyCache.storageReady,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('system_api_keys')
    .select('key_name, secret_hash, secret_preview, rotated_by_user_id, created_at, updated_at')
    .eq('key_name', RESULTS_API_KEY_NAME)
    .maybeSingle();

  if (error) {
    if (isMissingSystemApiKeysTableError(error)) {
      storedResultsApiKeyCache = {
        row: null,
        storageReady: false,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };

      return {
        row: null,
        storageReady: false,
      };
    }

    throw new Error(error.message);
  }

  const row = (data ?? null) as StoredResultsApiKeyRow | null;
  storedResultsApiKeyCache = {
    row,
    storageReady: true,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return {
    row,
    storageReady: true,
  };
}

export async function getStoredResultsApiKeyStatus(): Promise<StoredResultsApiKeyStatus> {
  const { row, storageReady } = await readStoredResultsApiKeyRecord();

  return {
    storageReady,
    configured: Boolean(row?.secret_hash),
    preview: row?.secret_preview ?? null,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function hasAnyResultsApiSecretConfigured() {
  if (getConfiguredResultsApiEnvSecrets().length > 0) {
    return true;
  }

  try {
    const { row } = await readStoredResultsApiKeyRecord();
    return Boolean(row?.secret_hash);
  } catch {
    return false;
  }
}

export async function matchesResultsApiSecretCandidates(candidates: Array<string | null | undefined>) {
  const normalizedCandidates = Array.from(
    new Set(candidates.map((value) => normalizeSecret(value)).filter((value): value is string => Boolean(value))),
  );

  if (normalizedCandidates.length === 0) {
    return false;
  }

  const envSecrets = getConfiguredResultsApiEnvSecrets();
  for (const candidate of normalizedCandidates) {
    for (const secret of envSecrets) {
      if (safePlainSecretEquals(candidate, secret)) {
        return true;
      }
    }
  }

  try {
    const { row } = await readStoredResultsApiKeyRecord();
    if (!row?.secret_hash) {
      return false;
    }

    return normalizedCandidates.some((candidate) => safeHashSecretEquals(candidate, row.secret_hash));
  } catch {
    return false;
  }
}

export async function rotateStoredResultsApiKey(actorUserId: string) {
  const admin = createAdminClient();
  const secret = `${RESULTS_API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  const secretPreview = buildSecretPreview(secret);

  const { data, error } = await admin
    .from('system_api_keys')
    .upsert(
      {
        key_name: RESULTS_API_KEY_NAME,
        secret_hash: hashSecretHex(secret),
        secret_preview: secretPreview,
        rotated_by_user_id: actorUserId,
      },
      { onConflict: 'key_name' },
    )
    .select('key_name, secret_preview, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  clearStoredResultsApiKeyCache();

  return {
    keyName: data.key_name as string,
    secret,
    preview: data.secret_preview as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

export { RESULTS_API_KEY_NAME, isMissingSystemApiKeysTableError };
