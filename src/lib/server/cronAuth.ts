import { hasAnyCredentialFor, verifyApiKeyRequest } from '@/lib/server/apiKeys';
import { cronEnvFallback } from '@/lib/server/apiKeyFallbacks';

/**
 * Autenticacion de las rutas de `/api/cron/*`.
 *
 * Reemplaza a las once copias de `isAuthorized` que cada cron tenia adentro.
 * Acepta dos credenciales:
 *
 *  1. Una API key del panel con el permiso `cron:run`, que se puede revocar
 *     sin tocar Vercel — util para disparar una sincronizacion a mano.
 *  2. `CRON_SECRET`, que es con lo que Vercel llama a los crons agendados.
 *
 * Se conserva el bypass de desarrollo: sin `CRON_SECRET` y fuera de
 * produccion, la ruta pasa. Las once copias lo tenian; tres lo escribian como
 * `NODE_ENV !== 'production'` y ocho como `=== 'development'`. Queda la
 * primera forma, que es la que ademas deja correr los tests.
 */
export async function authorizeCronRequest(request: Request, routeName: string): Promise<boolean> {
  const verification = await verifyApiKeyRequest(request.headers, 'cron:run', [cronEnvFallback()]);

  if (verification.ok) {
    return true;
  }

  if (verification.reason === 'revoked' || verification.reason === 'forbidden_scope') {
    return false;
  }

  const hasCredential = await hasAnyCredentialFor('cron:run', [cronEnvFallback()]);

  if (!hasCredential && process.env.NODE_ENV !== 'production') {
    console.warn(`[${routeName}] sin CRON_SECRET ni API key: se permite el pedido fuera de produccion`);
    return true;
  }

  return false;
}
