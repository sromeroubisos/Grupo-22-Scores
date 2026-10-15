import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import type { PostgrestError } from '@supabase/supabase-js';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    APP_ROLES,
    getAllowedScopesForRole,
    isAppRole,
    type MembershipRole,
    type MembershipScope,
} from '@/lib/auth/roles';
import { getReservedAdminRole } from '@/lib/types/user';
import { isGlobalAdminRole } from '@/lib/auth/roles';

// Why this endpoint exists: there was NO way for an admin to onboard a
// worker. A staff member had to (1) self-register at /register, (2) click
// the Supabase confirmation email, and (3) wait for a super admin to assign
// their role by hand. Any of the three steps failing (confirmation mail in
// spam, OAuth-only account with no password, never promoted) left the
// worker permanently locked out — exactly the Tucumán case. This creates
// the account already CONFIRMED, with a password and the role/scope set in
// one shot, with zero dependency on email delivery or Google OAuth.
//
// Lo que NO hace, a proposito: tocar una cuenta que ya existe. Antes, si el
// email ya tenia cuenta, le pisaba la contraseña, la forzaba confirmada y
// devolvia la contraseña nueva en el JSON: cualquier admin global podia
// quedarse con la cuenta de cualquiera (incluida la de otro super admin)
// tipeando su email. Ahora a una cuenta existente solo se le asigna rol y
// alcance; la contraseña la recupera su dueño con "Olvidé mi contraseña".

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// No ambiguous chars (0/O, 1/I/l) so the password can be dictated by phone.
const PWD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function jsonError(message: string, status = 400, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function serializePostgrestError(error: PostgrestError) {
    return {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
    };
}

function generateTempPassword(): string {
    const segment = () =>
        Array.from({ length: 4 }, () => PWD_ALPHABET[randomInt(PWD_ALPHABET.length)]).join('');
    return `${segment()}-${segment()}-${segment()}`;
}

/** Los roles que pueden tocar todo: solo un super_admin exacto los reparte. */
const GLOBAL_ROLES = new Set(['super_admin', 'admin_general']);

export async function POST(request: NextRequest) {
    let actor: Awaited<ReturnType<typeof requireGlobalAdminContext>>;
    try {
        const supabase = await createClient();
        actor = await requireGlobalAdminContext(supabase);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized';
        return jsonError(message, message === 'Forbidden' ? 403 : 401);
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return jsonError('Body JSON inválido', 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
    const role = typeof body.role === 'string' ? body.role : '';
    const customPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const scopeType = typeof body.scopeType === 'string' ? body.scopeType : null;
    const membershipRole = typeof body.membershipRole === 'string' ? body.membershipRole : 'admin';
    const scopeIds = Array.isArray(body.scopeIds)
        ? Array.from(
              new Set(
                  body.scopeIds
                      .filter((value): value is string => typeof value === 'string')
                      .map((value) => value.trim())
                      .filter(Boolean),
              ),
          )
        : [];

    if (!EMAIL_RE.test(email)) {
        return jsonError('Email inválido', 400);
    }
    if (!isAppRole(role) || !(APP_ROLES as string[]).includes(role)) {
        return jsonError(`Rol inválido. Valores permitidos: ${APP_ROLES.join(', ')}`, 400);
    }
    if (customPassword && customPassword.length < 8) {
        return jsonError('La contraseña debe tener al menos 8 caracteres.', 400);
    }

    // Las cuentas con rol reservado por email (SUPER_ADMIN_ROLE_EMAILS) no se
    // crean ni se tocan desde acá, con ningun rol: son las llaves maestras y
    // su rol ya sale del allowlist, no de esta pantalla.
    const reservedRole = getReservedAdminRole(email);
    if (reservedRole) {
        return jsonError(
            `Este email tiene un rol reservado (${reservedRole}) y no se gestiona desde esta pantalla.`,
            403,
        );
    }

    // Jerarquia: un admin_general no fabrica admins globales. Si pudiera, el
    // escalon de abajo se clonaria a si mismo (o a un super_admin) sin que
    // nadie de arriba lo apruebe.
    if (GLOBAL_ROLES.has(role) && actor.role !== 'super_admin') {
        return jsonError('Solo un super admin puede asignar roles globales.', 403);
    }

    // Validate scope coherence when the role is club/tournament-scoped.
    const allowedScopes = getAllowedScopesForRole(role);
    let effectiveScopeType: MembershipScope | null = null;
    if (scopeType) {
        if (!allowedScopes || !allowedScopes.includes(scopeType as MembershipScope)) {
            return jsonError('El rol elegido no admite el alcance seleccionado.', 400, {
                role,
                allowedScopeTypes: allowedScopes,
                receivedScopeType: scopeType,
            });
        }
        if (scopeIds.length === 0) {
            return jsonError('Seleccioná al menos un club/torneo para este rol.', 400);
        }
        effectiveScopeType = scopeType as MembershipScope;
    }

    // Solo se usa si la cuenta es NUEVA. Para una existente no se genera ni se
    // devuelve nada.
    const password = customPassword || generateTempPassword();

    try {
        const admin = createAdminClient();
        // The admin client has no generated typing for the auth schema; the
        // rest of the codebase casts to `any` for these calls (see
        // /api/setup and personas-roles/[userId]).
        const authAdmin = (admin as any).auth.admin;

        // Does an auth user already exist for this email? Service role can
        // read the auth schema directly (same approach as /api/setup).
        const existingLookup = await (admin as any)
            .schema('auth')
            .from('users')
            .select('id, email')
            .eq('email', email)
            .maybeSingle();

        if (existingLookup.error) {
            return jsonError(
                'No se pudo verificar si el email ya existe.',
                500,
                existingLookup.error.message,
            );
        }

        let userId: string | null = existingLookup.data?.id ?? null;
        const alreadyExisted = Boolean(userId);

        // Nadie se cambia el rol a si mismo por esta puerta.
        if (userId && userId === actor.userId) {
            return jsonError('No podés cambiar tu propio rol.', 403);
        }

        let existingName: string | null = null;

        if (userId) {
            // Cuenta existente: NO se toca contraseña, confirmacion ni
            // metadata de auth. Solo rol y alcance, mas abajo. Si el dueño no
            // puede entrar, que use "Olvidé mi contraseña" (el mail le llega a
            // EL, no a quien la esta dando de alta).
            const { data: profileRow } = await (admin.from('users') as any)
                .select('name, role')
                .eq('id', userId)
                .maybeSingle();

            // Jerarquia, del lado del DESTINO: la regla de arriba mira solo el
            // rol nuevo, y por esta puerta un admin_general podia pasarle el
            // email de un super_admin y degradarlo. Misma regla que
            // personas-roles/[userId] y users/[id]/access.
            if (isGlobalAdminRole(profileRow?.role) && actor.role !== 'super_admin') {
                return jsonError('Solo un super admin puede asignar o quitar roles globales.', 403);
            }
            existingName = typeof profileRow?.name === 'string' && profileRow.name.trim()
                ? profileRow.name
                : null;
        } else {
            const { data: created, error: createError } = await authAdmin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: name ? { full_name: name } : {},
            });
            if (createError) {
                return jsonError('No se pudo crear la cuenta de autenticación.', 500, createError.message);
            }
            userId = created?.user?.id ?? null;
        }

        if (!userId) {
            return jsonError('No se obtuvo el identificador de la cuenta creada.', 500);
        }

        // Upsert the public profile row with the chosen role so the worker
        // has their role from the very first login (we don't depend on the
        // first-login trigger / syncUserProfile to set it).
        const usersTable = admin.from('users') as any;
        const { error: profileError } = await usersTable.upsert(
            {
                id: userId,
                email,
                // A una cuenta existente no se le pisa el nombre que ya tenia.
                name: name ?? existingName ?? email.split('@')[0],
                role,
            },
            { onConflict: 'id' },
        );
        if (profileError) {
            return NextResponse.json(
                {
                    error: 'La cuenta se creó pero no se pudo guardar el perfil/rol.',
                    details: serializePostgrestError(profileError as PostgrestError),
                },
                { status: 500 },
            );
        }

        // Attach club/tournament scope (same semantics as the
        // /api/admin/users/[id]/access PUT: replace the scope_type bucket).
        if (effectiveScopeType) {
            const membershipsTable = admin.from('memberships') as any;

            let deleteQuery = membershipsTable.delete().eq('user_id', userId);
            if (effectiveScopeType === 'club' || effectiveScopeType === 'club_family') {
                deleteQuery = deleteQuery.in('scope_type', ['club', 'club_family']);
            } else {
                deleteQuery = deleteQuery.eq('scope_type', effectiveScopeType);
            }
            const { error: deleteError } = await deleteQuery;
            if (deleteError) {
                return NextResponse.json(
                    {
                        error: 'La cuenta se creó pero no se pudieron limpiar accesos previos.',
                        details: serializePostgrestError(deleteError as PostgrestError),
                    },
                    { status: 500 },
                );
            }

            const inserts = scopeIds.map((scopeId) => ({
                user_id: userId as string,
                scope_type: effectiveScopeType as MembershipScope,
                scope_id: scopeId,
                role: membershipRole as MembershipRole,
            }));
            const { error: insertError } = await membershipsTable.insert(inserts);
            if (insertError) {
                return NextResponse.json(
                    {
                        error: 'La cuenta se creó pero no se pudieron asignar los accesos.',
                        details: serializePostgrestError(insertError as PostgrestError),
                    },
                    { status: 500 },
                );
            }
        }

        return NextResponse.json({
            data: {
                userId,
                email,
                role,
                // La contraseña viaja SOLO en el alta: es la que el admin le
                // dicta al trabajador nuevo. De una cuenta existente no se
                // devuelve nada porque no se cambio nada.
                password: alreadyExisted ? null : password,
                created: !alreadyExisted,
                updated: alreadyExisted,
                ...(alreadyExisted
                    ? {
                        passwordUnchanged: true,
                        message: 'La cuenta ya existía: se asignó el rol sin tocar la contraseña. Si no puede entrar, que use "Olvidé mi contraseña" en /login.',
                    }
                    : {}),
            },
        });
    } catch (error) {
        return jsonError(error instanceof Error ? error.message : 'Error interno', 500);
    }
}
