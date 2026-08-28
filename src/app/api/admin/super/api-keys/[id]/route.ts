import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import { isMissingApiKeysTableError, revokeApiKey } from '@/lib/server/apiKeys';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status = 500, details: unknown = null) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/**
 * Revoca una key. No la borra: la fila queda como registro de que existio y de
 * cuando se uso por ultima vez.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  let userId = '';

  try {
    const user = await requireSuperAdmin();
    userId = user.id;
  } catch {
    return jsonError('Unauthorized', 401);
  }

  const { id } = await context.params;
  if (!id) {
    return jsonError('Falta el id de la key.', 400);
  }

  try {
    const record = await revokeApiKey(id, userId);

    try {
      const admin = createAdminClient();
      await admin.from('admin_audit_log').insert({
        actor_user_id: userId,
        entity_type: 'system',
        entity_id: record.id,
        action: 'update',
        changes: {
          scope: 'api_key',
          action: 'revoke',
          name: record.name,
          scopes: record.scopes,
          preview: record.preview,
        },
        source: 'super-admin-api-keys',
      });
    } catch {
      // La auditoria no puede dejar una key sin revocar.
    }

    return NextResponse.json({ ok: true, data: { key: record } });
  } catch (error) {
    if (isMissingApiKeysTableError(error)) {
      return jsonError(
        'Falta correr la migracion 20260828120000_api_keys_system.sql para administrar las API keys.',
        503,
      );
    }

    const message = error instanceof Error ? error.message : 'No se pudo revocar la API key.';
    // "no existe o ya estaba revocada" es un pedido invalido, no una falla del
    // servidor: el panel lo muestra como aviso y refresca la lista.
    const status = message.includes('ya estaba revocada') ? 409 : 500;

    return jsonError(message, status);
  }
}
