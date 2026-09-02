import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { isDefaultRoleValue } from '@/lib/auth/roles';
import { getReservedAdminRole } from '@/lib/types/user';

type LooseAdmin = ReturnType<typeof createAdminClient> & {
    schema: (name: string) => any;
    auth: { admin: any };
};

/** Service-role client con error claro si falta la key (en vez de un 500 opaco). */
function getAdmin(): { admin: LooseAdmin } | { error: string } {
    try {
        return { admin: createAdminClient() as unknown as LooseAdmin };
    } catch (e) {
        return { error: e instanceof Error ? e.message : 'Service role no configurado' };
    }
}

/** Busca el id de un usuario de auth por email paginando listUsers. */
async function findAuthUserIdByEmail(admin: LooseAdmin, email: string): Promise<string | null> {
    const target = email.toLowerCase();
    for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return null;
        const users: Array<{ id: string; email?: string | null }> = data?.users ?? [];
        const match = users.find((u) => (u.email || '').toLowerCase() === target);
        if (match) return match.id;
        if (users.length < 1000) break;
    }
    return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PWD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// El rol que reciben los usuarios creados desde este panel: acceso al panel de
// torneos pero LIMITADO por memberships a los torneos que el admin le asigna.
const ASSIGNED_USER_ROLE = 'gestor_torneos';

function err(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function generateTempPassword(): string {
    const segment = () =>
        Array.from({ length: 4 }, () => PWD_ALPHABET[randomInt(PWD_ALPHABET.length)]).join('');
    return `${segment()}-${segment()}-${segment()}`;
}

function readIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean),
    ));
}

type ScopeResult = Awaited<ReturnType<typeof resolveTournamentAdminScope>>;

/** IDs de torneos a los que el caller puede asignar acceso (su propio alcance). */
function filterToScope(scope: ScopeResult, ids: string[]): { allowed: string[]; rejected: string[] } {
    if (scope.isUnlimited) return { allowed: ids, rejected: [] };
    const allowed: string[] = [];
    const rejected: string[] = [];
    for (const id of ids) {
        if (scope.tournamentIds.has(id)) allowed.push(id);
        else rejected.push(id);
    }
    return { allowed, rejected };
}

// ── GET: lista de usuarios que el admin gestiona (con acceso a SUS torneos) ──
export async function GET() {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);
    const adminResult = getAdmin();
    if ('error' in adminResult) {
        return err('No se pudo inicializar el cliente admin (falta SUPABASE_SERVICE_ROLE_KEY).', 500, adminResult.error);
    }
    const admin = adminResult.admin;

    // Universo de torneos del caller (para filtrar y mostrar nombres).
    let scopeTournamentIds: string[];
    if (scope.isUnlimited) {
        // Sin tope: PostgREST corta en 1000 por respuesta, así que se pagina
        // hasta que una tanda vuelva incompleta. Con un limit fijo los torneos
        // más viejos quedaban afuera de la lista para asignar.
        const PAGE = 1000;
        scopeTournamentIds = [];
        for (let from = 0; ; from += PAGE) {
            const { data: batch } = await admin
                .from('tournaments')
                .select('id')
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, from + PAGE - 1);
            const ids = (batch ?? []).map((t: { id: string }) => t.id);
            scopeTournamentIds.push(...ids);
            if (ids.length < PAGE) break;
        }
    } else {
        scopeTournamentIds = Array.from(scope.tournamentIds);
    }

    if (scopeTournamentIds.length === 0) {
        return NextResponse.json({ data: [], tournaments: [] });
    }

    const { data: tournamentRows } = await admin
        .from('tournaments')
        .select('id, name, display_name')
        .in('id', scopeTournamentIds);

    const tournamentById = new Map<string, { id: string; name: string }>(
        (tournamentRows ?? []).map((t: { id: string; name: string; display_name: string | null }) => [
            t.id,
            { id: t.id, name: t.display_name || t.name },
        ]),
    );

    const { data: membershipRows, error: membershipError } = await admin
        .from('memberships')
        .select('user_id, scope_id, role')
        .eq('scope_type', 'tournament')
        .in('scope_id', scopeTournamentIds);

    if (membershipError) {
        return err('No se pudieron cargar los accesos', 500, membershipError.message);
    }

    const byUser = new Map<string, Array<{ tournamentId: string; tournamentName: string; role: string }>>();
    for (const row of membershipRows ?? []) {
        if (row.user_id === context.userId) continue; // no listarse a sí mismo
        const tournament = tournamentById.get(row.scope_id);
        if (!tournament) continue;
        const list = byUser.get(row.user_id) ?? [];
        list.push({ tournamentId: row.scope_id, tournamentName: tournament.name, role: row.role });
        byUser.set(row.user_id, list);
    }

    const userIds = Array.from(byUser.keys());
    let users: Array<{ id: string; email: string; name: string | null; role: string | null }> = [];
    if (userIds.length > 0) {
        const { data: userRows } = await admin
            .from('users')
            .select('id, email, name, role')
            .in('id', userIds);
        users = userRows ?? [];
    }
    const userById = new Map(users.map((u) => [u.id, u]));

    const data = userIds.map((userId) => {
        const u = userById.get(userId);
        return {
            userId,
            email: u?.email ?? '(sin email)',
            name: u?.name ?? null,
            role: u?.role ?? null,
            assignments: byUser.get(userId) ?? [],
        };
    }).sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({
        data,
        tournaments: Array.from(tournamentById.values()).sort((a, b) => a.name.localeCompare(b.name)),
    });
}

// ── POST: agregar un usuario y asignarle torneos del caller ──
export async function POST(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
    const customPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const membershipRole = body.membershipRole === 'editor' ? 'editor' : 'admin';
    const requestedTournamentIds = readIds(body.tournamentIds);

    if (!EMAIL_RE.test(email)) {
        return err('Email inválido', 400);
    }
    if (requestedTournamentIds.length === 0) {
        return err('Seleccioná al menos un torneo para asignar.', 400);
    }
    if (customPassword && customPassword.length < 8) {
        return err('La contraseña debe tener al menos 8 caracteres.', 400);
    }

    // Un admin de torneos no puede gestionar cuentas con rol reservado.
    if (getReservedAdminRole(email)) {
        return err('Ese email pertenece a una cuenta administrativa reservada.', 400);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);
    const { allowed, rejected } = filterToScope(scope, requestedTournamentIds);
    if (rejected.length > 0) {
        return err('Solo podés asignar torneos a los que tenés acceso.', 403, { rejected });
    }
    if (allowed.length === 0) {
        return err('No hay torneos válidos para asignar.', 400);
    }

    const adminResult = getAdmin();
    if ('error' in adminResult) {
        return err('No se pudo inicializar el cliente admin (falta SUPABASE_SERVICE_ROLE_KEY).', 500, adminResult.error);
    }
    const admin = adminResult.admin;
    const authAdmin = admin.auth.admin;
    const usersTable = admin.from('users') as any;

    // ¿Ya existe? Primero por la tabla pública `users` (siempre accesible, sin
    // depender de exponer el esquema auth). Si falta, cae a listUsers.
    let userId: string | null = null;
    let existingRole: string | null = null;

    const { data: existingByEmail, error: lookupError } = await usersTable
        .select('id, role')
        .eq('email', email)
        .maybeSingle();
    if (lookupError) {
        return err('No se pudo verificar si el email ya existe.', 500, lookupError.message);
    }
    if (existingByEmail?.id) {
        userId = existingByEmail.id as string;
        existingRole = (existingByEmail.role as string | null) ?? null;
    }

    const alreadyExisted = Boolean(userId);
    let generatedPassword: string | null = null;

    if (!userId) {
        // Cuenta nueva: se crea CONFIRMADA con contraseña. NUNCA reseteamos la
        // de una cuenta existente desde este panel (evita secuestro de cuentas).
        const password = customPassword || generateTempPassword();
        const { data: created, error: createError } = await authAdmin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: name ? { full_name: name } : {},
        });
        if (createError) {
            // El auth user puede existir aunque no haya fila en public.users.
            const alreadyRegistered = /already (been )?registered|already exists|duplicate/i
                .test(createError.message || '');
            if (alreadyRegistered) {
                userId = await findAuthUserIdByEmail(admin, email);
                if (!userId) {
                    return err('La cuenta ya existe pero no se pudo resolver su identificador.', 500);
                }
            } else {
                return err('No se pudo crear la cuenta de autenticación.', 500, createError.message);
            }
        } else {
            userId = created?.user?.id ?? null;
            generatedPassword = password;
        }
    }

    if (!userId) {
        return err('No se obtuvo el identificador de la cuenta.', 500);
    }

    // Perfil público: asignamos gestor_torneos a cuentas nuevas o sin rol real
    // (fan / vacío). Nunca degradamos ni cambiamos un rol existente con sentido.
    if (existingRole === null) {
        const { data: profileRow } = await usersTable
            .select('role')
            .eq('id', userId)
            .maybeSingle();
        existingRole = (profileRow?.role as string | null) ?? null;
    }

    // Una cuenta que ya existía conserva su nombre salvo que se mande uno:
    // el fallback al prefijo del email es solo para la fila nueva, si no
    // "asignar torneos" a alguien le pisaba el nombre real.
    const profilePayload: Record<string, unknown> = { id: userId, email };
    if (name) profilePayload.name = name;
    else if (!alreadyExisted) profilePayload.name = email.split('@')[0];
    if (!existingRole || isDefaultRoleValue(existingRole)) {
        profilePayload.role = ASSIGNED_USER_ROLE;
    }

    let { error: profileError } = await usersTable.upsert(profilePayload, { onConflict: 'id' });
    if (profileError?.code === '23505') {
        // Carrera con el trigger de auth que inserta la fila de public.users al
        // crear la cuenta: la fila ya existe, el reintento toma el camino UPDATE.
        ({ error: profileError } = await usersTable.upsert(profilePayload, { onConflict: 'id' }));
    }
    if (profileError) {
        return err('La cuenta existe pero no se pudo guardar el perfil.', 500, profileError.message);
    }

    // Memberships: solo AGREGAMOS las que faltan (idempotente). Nunca borramos
    // otros accesos del usuario ni degradamos un rol de membership superior.
    const { data: existingMemberships } = await admin
        .from('memberships')
        .select('scope_id')
        .eq('user_id', userId)
        .eq('scope_type', 'tournament')
        .in('scope_id', allowed);

    const alreadyAssigned = new Set(
        (existingMemberships ?? []).map((m: { scope_id: string }) => m.scope_id),
    );
    const toInsert = allowed
        .filter((id) => !alreadyAssigned.has(id))
        .map((scopeId) => ({
            user_id: userId as string,
            scope_type: 'tournament',
            scope_id: scopeId,
            role: membershipRole,
        }));

    if (toInsert.length > 0) {
        const { error: insertError } = await admin.from('memberships').insert(toInsert);
        if (insertError && insertError.code !== '23505') {
            return err('La cuenta existe pero no se pudieron asignar los torneos.', 500, insertError.message);
        }
    }

    return NextResponse.json({
        data: {
            userId,
            email,
            created: !alreadyExisted,
            alreadyExisted,
            assignedCount: allowed.length,
            password: generatedPassword,
        },
    });
}

// ── DELETE: quitar el acceso de un usuario a un torneo del caller ──
export async function DELETE(request: NextRequest) {
    const supabase = await createClient();

    let context;
    try {
        context = await requireTournamentAdminContext(supabase);
    } catch {
        return err('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get('userId') || '').trim();
    const tournamentId = (searchParams.get('tournamentId') || '').trim();

    if (!userId || !tournamentId) {
        return err('Faltan parámetros (userId, tournamentId).', 400);
    }

    const scope = await resolveTournamentAdminScope(supabase, context);
    const { allowed } = filterToScope(scope, [tournamentId]);
    if (allowed.length === 0) {
        return err('No podés modificar el acceso a ese torneo.', 403);
    }

    const adminResult = getAdmin();
    if ('error' in adminResult) {
        return err('No se pudo inicializar el cliente admin.', 500, adminResult.error);
    }
    const { error: deleteError } = await adminResult.admin
        .from('memberships')
        .delete()
        .eq('user_id', userId)
        .eq('scope_type', 'tournament')
        .eq('scope_id', tournamentId);

    if (deleteError) {
        return err('No se pudo quitar el acceso.', 500, deleteError.message);
    }

    return NextResponse.json({ ok: true });
}
