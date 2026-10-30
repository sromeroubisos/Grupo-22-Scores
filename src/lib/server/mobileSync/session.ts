import 'server-only';

/**
 * Identidad de la app móvil G22 Gestión en la puerta de sincronización.
 *
 * El celular manda el access token de Supabase del usuario (`Authorization:
 * Bearer`). Acá se valida contra Supabase Auth y se arma el MISMO tipo de
 * cliente de servidor que usa la web (createServerClient + cookie de sesión),
 * pero con la cookie en memoria. Con ese cliente se llama a las funciones de
 * siempre —`getUserAccessContext`, `resolveTournamentAdminScope`— sin tocarlas:
 * el celular tiene exactamente el rol y el alcance que tiene en la web.
 *
 * La misma cookie se usa para reenviar las escrituras a los endpoints
 * existentes (ver push.ts), así corren sus permisos y efectos de siempre.
 *
 * El refresh token NUNCA viaja: la cookie lleva refresh_token vacío. Si la
 * puerta renovara la sesión, quemaría el refresh token del celular. El celular
 * renueva su token antes de llamar.
 */
import { createServerClient } from '@supabase/ssr';
import { getUserAccessContext, type UserAccessContext } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  SUPABASE_AUTH_COOKIE_BASE64_PREFIX,
  createSupabaseAuthCookieChunks,
  getSupabaseAuthStorageKey,
} from '@/lib/supabase/auth-cookie';
import type { LooseSupabaseClient } from '@/lib/supabase/loose';

export class MobileAuthError extends Error {
  constructor(message: string, readonly status: 401 | 403 = 401) {
    super(message);
    this.name = 'MobileAuthError';
  }
}

export interface MobileSession {
  userId: string;
  email: string;
  displayName: string;
  context: UserAccessContext;
  /** Cliente con la sesión del usuario (RLS del usuario), igual al de la web. */
  userClient: LooseSupabaseClient;
  /** Header `Cookie` para reenviar a los endpoints existentes de G22. */
  cookieHeader: string;
}

function readBearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new MobileAuthError('Falta el token de sesión.');
  return match[1].trim();
}

function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf-8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export async function resolveMobileSession(request: Request): Promise<MobileSession> {
  const accessToken = readBearer(request);
  const expiresAt = jwtExpiry(accessToken);
  if (!expiresAt || expiresAt * 1000 <= Date.now()) throw new MobileAuthError('La sesión venció.');

  // Validación real contra Supabase Auth (firma, revocación, usuario borrado).
  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user) throw new MobileAuthError('La sesión no es válida.');

  const storageKey = getSupabaseAuthStorageKey();
  if (!storageKey) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL.');
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    refresh_token: '',
    user,
  };
  const value = `${SUPABASE_AUTH_COOKIE_BASE64_PREFIX}${Buffer.from(JSON.stringify(session), 'utf-8').toString('base64url')}`;
  const cookies = createSupabaseAuthCookieChunks(storageKey, value);

  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, flowType: 'pkce' },
      cookies: {
        getAll: () => cookies,
        setAll: () => {
          // Sesión de solo lectura: nunca se renueva ni se reescribe desde la puerta.
        },
      },
    },
  ) as LooseSupabaseClient;

  const context = await getUserAccessContext(userClient);
  if (!context || context.userId !== user.id) throw new MobileAuthError('La sesión no es válida.');

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof metadata.full_name === 'string' && metadata.full_name) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    user.email ||
    user.id;

  return {
    userId: user.id,
    email: user.email ?? '',
    displayName,
    context,
    userClient,
    cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
  };
}
