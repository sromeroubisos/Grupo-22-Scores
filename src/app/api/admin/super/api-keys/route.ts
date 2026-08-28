import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import {
  API_KEY_SCOPES,
  createApiKey,
  isApiKeyScope,
  isMissingApiKeysTableError,
  listApiKeys,
  type ApiKeyScope,
} from '@/lib/server/apiKeys';
import { getEnvFallbackStatus } from '@/lib/server/apiKeyFallbacks';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MISSING_TABLE_MESSAGE =
  'Falta correr la migracion 20260828120000_api_keys_system.sql para administrar las API keys.';

function jsonError(message: string, status = 500, details: unknown = null) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

async function writeAudit(actorUserId: string, entityId: string, changes: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    await admin.from('admin_audit_log').insert({
      actor_user_id: actorUserId,
      entity_type: 'system',
      entity_id: entityId,
      action: 'update',
      changes,
      source: 'super-admin-api-keys',
    });
  } catch {
    // La auditoria no puede bloquear el alta ni la revocacion de una key.
  }
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch {
    return jsonError('Unauthorized', 401);
  }

  try {
    const keys = await listApiKeys();

    return NextResponse.json({
      ok: true,
      data: {
        keys,
        scopes: API_KEY_SCOPES,
        envFallbacks: getEnvFallbackStatus(),
        storageReady: true,
        storageMessage: null,
      },
    });
  } catch (error) {
    if (isMissingApiKeysTableError(error)) {
      // No es un error del usuario: el panel tiene que poder mostrar los
      // fallbacks por entorno aunque la tabla todavia no exista.
      return NextResponse.json({
        ok: true,
        data: {
          keys: [],
          scopes: API_KEY_SCOPES,
          envFallbacks: getEnvFallbackStatus(),
          storageReady: false,
          storageMessage: MISSING_TABLE_MESSAGE,
        },
      });
    }

    return jsonError(
      error instanceof Error ? error.message : 'No se pudieron cargar las API keys.',
    );
  }
}

export async function POST(request: Request) {
  let userId = '';

  try {
    const user = await requireSuperAdmin();
    userId = user.id;
  } catch {
    return jsonError('Unauthorized', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('El cuerpo del pedido no es JSON valido.', 400);
  }

  const payload = (body ?? {}) as { name?: unknown; description?: unknown; scopes?: unknown };
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : null;

  if (!name) {
    return jsonError('Poner un nombre: es lo unico que despues dice quien usa esa key.', 400);
  }

  if (!Array.isArray(payload.scopes)) {
    return jsonError('Falta la lista de permisos.', 400);
  }

  const unknownScopes = payload.scopes.filter((scope) => !isApiKeyScope(scope));
  if (unknownScopes.length > 0) {
    return jsonError('Hay permisos que no existen en el catalogo.', 400, { unknownScopes });
  }

  const scopes = payload.scopes as ApiKeyScope[];
  if (scopes.length === 0) {
    return jsonError('Elegi al menos un permiso para la key.', 400);
  }

  try {
    const { record, secret } = await createApiKey({
      name,
      description,
      scopes,
      actorUserId: userId,
    });

    await writeAudit(userId, record.id, {
      scope: 'api_key',
      action: 'create',
      name: record.name,
      scopes: record.scopes,
      preview: record.preview,
    });

    // El secreto sale de aca una sola vez en toda su vida.
    return NextResponse.json({ ok: true, data: { key: record, secret } }, { status: 201 });
  } catch (error) {
    if (isMissingApiKeysTableError(error)) {
      return jsonError(MISSING_TABLE_MESSAGE, 503);
    }

    return jsonError(error instanceof Error ? error.message : 'No se pudo crear la API key.');
  }
}
