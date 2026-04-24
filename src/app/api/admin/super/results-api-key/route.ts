import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import {
  getConfiguredResultsApiEnvNames,
  getStoredResultsApiKeyStatus,
  isMissingSystemApiKeysTableError,
  rotateStoredResultsApiKey,
} from '@/lib/server/resultsApiKeys';
import { createAdminClient } from '@/lib/supabase/admin';

function jsonError(message: string, status = 500, details: unknown = null) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details,
    },
    { status },
  );
}

async function writeAudit(actorUserId: string, preview: string) {
  try {
    const admin = createAdminClient();
    await admin.from('admin_audit_log').insert({
      actor_user_id: actorUserId,
      entity_type: 'system',
      entity_id: 'results_api',
      action: 'update',
      changes: {
        scope: 'results_api_key',
        action: 'rotate',
        preview,
      },
      source: 'super-admin-results-api-key',
    });
  } catch {
    // Audit should not block the key rotation.
  }
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch {
    return jsonError('Unauthorized', 401);
  }

  try {
    const database = await getStoredResultsApiKeyStatus();
    const envNames = getConfiguredResultsApiEnvNames();

    return NextResponse.json({
      ok: true,
      data: {
        keyName: 'results_api',
        environment: {
          configuredNames: envNames,
        },
        database,
        availableSources: [
          ...(envNames.length > 0 ? ['environment'] : []),
          ...(database.configured ? ['database'] : []),
        ],
      },
    });
  } catch (error) {
    if (isMissingSystemApiKeysTableError(error)) {
      return jsonError(
        'Falta correr la migracion de system_api_keys para administrar la API key desde el panel.',
        503,
      );
    }

    return jsonError(
      error instanceof Error ? error.message : 'No se pudo cargar la configuracion de la API key.',
      500,
    );
  }
}

export async function POST() {
  let userId = '';

  try {
    const user = await requireSuperAdmin();
    userId = user.id;
  } catch {
    return jsonError('Unauthorized', 401);
  }

  try {
    const generated = await rotateStoredResultsApiKey(userId);
    await writeAudit(userId, generated.preview);

    return NextResponse.json({
      ok: true,
      data: generated,
    });
  } catch (error) {
    if (isMissingSystemApiKeysTableError(error)) {
      return jsonError(
        'Falta correr la migracion de system_api_keys para guardar la API key en la base local.',
        503,
      );
    }

    return jsonError(
      error instanceof Error ? error.message : 'No se pudo generar la API key.',
      500,
    );
  }
}
