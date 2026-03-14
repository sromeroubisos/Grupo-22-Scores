import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function serializeError(err: any): Record<string, any> {
    try {
        return JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)));
    } catch {
        return { string: String(err) };
    }
}

export async function GET(_req: NextRequest) {
    // Auth guard
    try {
        await requireAdminApiUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: Record<string, any> = {};

    // ── Step 1: Environment variables ────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    results.env = {
        url_exists: !!supabaseUrl,
        url_value: supabaseUrl ? supabaseUrl.replace(/^(https:\/\/[^.]+).*/, '$1…') : null,
        anon_key_exists: !!anonKey,
        anon_key_prefix: anonKey ? anonKey.slice(0, 10) + '…' : null,
        service_role_key_exists: !!serviceKey,
        service_role_key_prefix: serviceKey ? serviceKey.slice(0, 10) + '…' : null,
    };

    // ── Step 2: Session via server client (mirrors what the browser sees) ────
    try {
        const serverClient = await createClient();
        const { data: sessionData, error: sessionError } = await serverClient.auth.getSession();
        const { data: userData, error: userError } = await serverClient.auth.getUser();

        results.session = {
            has_session: !!sessionData?.session,
            user_id: sessionData?.session?.user?.id ?? null,
            user_email: sessionData?.session?.user?.email ?? null,
            expires_at: sessionData?.session?.expires_at ?? null,
            session_error: sessionError ? serializeError(sessionError) : null,
            getUser_id: userData?.user?.id ?? null,
            getUser_error: userError ? serializeError(userError) : null,
        };

        // Step 2b: User role from DB
        if (userData?.user?.id) {
            const { data: profile, error: profileError } = await serverClient
                .from('users')
                .select('role')
                .eq('id', userData.user.id)
                .single();

            results.user_role = {
                role: profile?.role ?? null,
                error: profileError ? serializeError(profileError) : null,
            };
        }
    } catch (err: any) {
        results.session = { thrown: true, error: serializeError(err) };
    }

    // ── Step 3: Simple select via server client (anon/session key + RLS) ─────
    try {
        const serverClient = await createClient();
        const { data, error } = await serverClient
            .from('tournaments')
            .select('id, name')
            .limit(2);

        results.simple_select_server_client = error
            ? { success: false, error: serializeError(error) }
            : { success: true, count: data?.length ?? 0, sample: data };
    } catch (err: any) {
        results.simple_select_server_client = { success: false, thrown: true, error: serializeError(err) };
    }

    // ── Step 4: Simple select via admin client (service role, bypasses RLS) ──
    try {
        const adminClient = createAdminClient();
        const { data, error } = await adminClient
            .from('tournaments')
            .select('id, name, is_active')
            .limit(3);

        results.simple_select_admin_client = error
            ? { success: false, error: serializeError(error) }
            : { success: true, count: data?.length ?? 0, sample: data };
    } catch (err: any) {
        results.simple_select_admin_client = { success: false, thrown: true, error: serializeError(err) };
    }

    // ── Step 5: RPC via admin client (service role) ───────────────────────────
    try {
        const adminClient = createAdminClient();
        const { data, error } = await adminClient.rpc('get_all_tournaments', {
            p_include_hidden: true,
            p_viewer_user_id: null,
        });

        if (error) {
            results.rpc_admin_client = { success: false, error: serializeError(error) };
        } else {
            results.rpc_admin_client = {
                success: true,
                count: Array.isArray(data) ? data.length : 0,
                sample: Array.isArray(data) ? (data as any[]).slice(0, 2) : data,
            };
        }
    } catch (err: any) {
        results.rpc_admin_client = { success: false, thrown: true, error: serializeError(err) };
    }

    // ── Step 6: RPC via server client (anon/session key + RLS) ───────────────
    try {
        const serverClient = await createClient();
        const { data, error } = await serverClient.rpc('get_all_tournaments', {
            p_include_hidden: true,
            p_viewer_user_id: null,
        });

        if (error) {
            results.rpc_server_client = { success: false, error: serializeError(error) };
        } else {
            results.rpc_server_client = {
                success: true,
                count: Array.isArray(data) ? data.length : 0,
                sample: Array.isArray(data) ? (data as any[]).slice(0, 2) : data,
            };
        }
    } catch (err: any) {
        results.rpc_server_client = { success: false, thrown: true, error: serializeError(err) };
    }

    // ── Diagnosis summary ─────────────────────────────────────────────────────
    const DIAGNOSIS_GUIDE: Record<string, { layer: string; meaning: string; likely_causes: string[]; actions: string[]; priority: string }> = {
        MISSING_ENV_VARS: {
            layer: 'infra',
            priority: 'critical',
            meaning: 'Faltan variables de entorno necesarias para inicializar Supabase.',
            likely_causes: [
                'NEXT_PUBLIC_SUPABASE_URL no existe',
                'NEXT_PUBLIC_SUPABASE_ANON_KEY no existe',
                'El archivo .env.local no fue recargado después de cambios',
            ],
            actions: [
                'Verificar que las variables estén definidas en .env.local o en el entorno de deploy',
                'Reiniciar el servidor de desarrollo (npm run dev)',
                'Confirmar que los nombres sean exactos (sin espacios, sin comillas)',
            ],
        },
        TABLE_INACCESSIBLE_EVEN_WITH_SERVICE_ROLE: {
            layer: 'infra',
            priority: 'critical',
            meaning: 'Ni siquiera con service role se puede acceder a la tabla. Problema en la conexión, key inválida o proyecto incorrecto.',
            likely_causes: [
                'SUPABASE_SERVICE_ROLE_KEY incorrecta o de otro proyecto',
                'NEXT_PUBLIC_SUPABASE_URL apunta a otro proyecto',
                'Credenciales mezcladas entre proyectos',
                'La tabla tournaments no existe en este proyecto',
            ],
            actions: [
                'Verificar URL del proyecto en Supabase dashboard → Settings → API',
                'Confirmar que service role key corresponde al mismo proyecto que la URL',
                'Verificar que la tabla tournaments exista: SELECT * FROM pg_tables WHERE tablename = \'tournaments\'',
            ],
        },
        RPC_NOT_FOUND: {
            layer: 'database_function',
            priority: 'high',
            meaning: 'La función RPC no existe en la base de datos o la migración no fue aplicada.',
            likely_causes: [
                'La migración 20260312000008_fix_rpc_signature.sql no se ejecutó en producción',
                'La función fue creada en otro schema (no public)',
                'El nombre llamado desde código no coincide exactamente',
            ],
            actions: [
                'Ejecutar en SQL Editor: SELECT proname FROM pg_proc JOIN pg_namespace n ON pronamespace=n.oid WHERE n.nspname=\'public\' AND proname=\'get_all_tournaments\'',
                'Si no aparece: aplicar la migración manualmente en Supabase dashboard → SQL Editor',
                'Si aparece con diferente firma: DROP la vieja y recrear',
            ],
        },
        RPC_BODY_ERROR: {
            layer: 'database_function',
            priority: 'high',
            meaning: 'La función existe pero falla internamente al ejecutarse.',
            likely_causes: [
                'Columnas eliminadas o renombradas que la función aún referencia',
                'JOIN inválido (tabla sports, countries o tournament_followers inexistente)',
                'RETURNS TABLE no coincide con el SELECT interno',
                'Error de casting de tipos (UUID vs TEXT)',
            ],
            actions: [
                'Ejecutar directamente en SQL Editor: SELECT * FROM public.get_all_tournaments(true, NULL) LIMIT 5',
                'El error SQL será visible ahí — buscar la columna o tabla que falta',
                'Comparar RETURNS TABLE de la migración con las columnas reales de la tabla',
                'Verificar que sports, countries, tournament_followers existen: SELECT tablename FROM pg_tables WHERE schemaname=\'public\'',
            ],
        },
        RPC_MISSING_EXECUTE_GRANT: {
            layer: 'database_function',
            priority: 'high',
            meaning: 'La función RPC existe pero el rol authenticated no tiene permiso para ejecutarla.',
            likely_causes: [
                'La función fue recreada con CREATE OR REPLACE y perdió los grants previos',
                'Nunca se ejecutó GRANT EXECUTE para el rol authenticated',
            ],
            actions: [
                'Ejecutar en SQL Editor: GRANT EXECUTE ON FUNCTION public.get_all_tournaments(boolean, text) TO authenticated',
                'Opcionalmente también: GRANT EXECUTE ON FUNCTION public.get_all_tournaments(boolean, text) TO anon',
                'Volver a probar desde cliente autenticado',
            ],
        },
        NO_SESSION: {
            layer: 'auth_and_rls',
            priority: 'critical',
            meaning: 'El usuario no está autenticado en el cliente actual.',
            likely_causes: [
                'Sesión expirada o cookie perdida',
                'Middleware de Next.js roto o ausente (no refresca la sesión)',
                'Cliente browser sin restaurar sesión (hidratación tardía)',
                'httpOnly: true en las cookies impide que el browser las lea',
            ],
            actions: [
                'Verificar en DevTools → Application → Cookies: que exista sb-…-auth-token',
                'Revisar el middleware de Next.js: debe llamar supabase.auth.getSession() para refrescar',
                'Forzar login nuevamente y volver a probar',
                'Verificar que el servidor esté usando createServerClient con cookies correctas',
            ],
        },
        RLS_BLOCKING_TABLE: {
            layer: 'auth_and_rls',
            priority: 'high',
            meaning: 'La tabla existe y responde con service role, pero las políticas RLS bloquean al usuario autenticado.',
            likely_causes: [
                'Policy de SELECT inexistente o muy restrictiva para el rol authenticated',
                'El usuario autenticado no cumple la condición de la policy (ej. no es admin)',
                'Conflicto entre múltiples policies (una permite, otra deniega)',
            ],
            actions: [
                'Ejecutar en SQL Editor: SELECT policyname, cmd, roles FROM pg_policies WHERE tablename=\'tournaments\'',
                'Agregar policy permisiva si falta: CREATE POLICY "Allow authenticated read" ON tournaments FOR SELECT TO authenticated USING (true)',
                'Si ya existe, verificar la condición USING() — no debe requerir rol que el usuario no tenga',
            ],
        },
        ALL_OK_SERVER_SIDE: {
            layer: 'frontend_only',
            priority: 'high',
            meaning: 'Todo funciona desde el servidor. El problema está exclusivamente en el cliente browser.',
            likely_causes: [
                'Sesión no disponible en el browser (cookie no accesible por httpOnly)',
                'El cliente browser usa ANON_KEY y la RPC requiere authenticated',
                'RLS afecta al cliente browser pero no al servidor con service role',
                'Error de hidratación o timing: la sesión llega después de la primera llamada',
            ],
            actions: [
                'Abrir DevTools → Network → filtrar por "rpc" → ver la request que falla',
                'Verificar el status code HTTP y el body del error en la request',
                'Revisar AuthContext: la sesión debe estar disponible antes de llamar fetchTournaments()',
                'Comparar: ¿el superAdminCache usa createBrowserClient (bien) o createServerClient (mal en browser)?',
                'Si el timing es el problema, asegurar que SuperConsoleContext espere a que AuthContext cargue',
            ],
        },
    };

    const rpcAdminOk = results.rpc_admin_client?.success === true;
    const rpcServerOk = results.rpc_server_client?.success === true;
    const tableAdminOk = results.simple_select_admin_client?.success === true;
    const tableServerOk = results.simple_select_server_client?.success === true;
    const hasSession = results.session?.has_session === true;

    let diagnosisCode = 'unknown';
    if (!results.env.url_exists || !results.env.anon_key_exists) {
        diagnosisCode = 'MISSING_ENV_VARS';
    } else if (!tableAdminOk) {
        diagnosisCode = 'TABLE_INACCESSIBLE_EVEN_WITH_SERVICE_ROLE';
    } else if (tableAdminOk && rpcAdminOk && !rpcServerOk) {
        diagnosisCode = hasSession ? 'RPC_MISSING_EXECUTE_GRANT' : 'NO_SESSION';
    } else if (tableAdminOk && !rpcAdminOk) {
        const code = results.rpc_admin_client?.error?.code;
        diagnosisCode = code === 'PGRST202' ? 'RPC_NOT_FOUND' : 'RPC_BODY_ERROR';
    } else if (tableAdminOk && rpcAdminOk && rpcServerOk && !tableServerOk) {
        diagnosisCode = 'RLS_BLOCKING_TABLE';
    } else if (rpcAdminOk && rpcServerOk) {
        diagnosisCode = 'ALL_OK_SERVER_SIDE';
    }

    results.diagnosis = {
        code: diagnosisCode,
        rpc_error_code: results.rpc_admin_client?.error?.code ?? results.rpc_server_client?.error?.code ?? null,
        ...(DIAGNOSIS_GUIDE[diagnosisCode] ?? { meaning: 'No se pudo determinar la causa.', actions: [] }),
    };

    return NextResponse.json(results, { status: 200 });
}
