import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Jugadores de un club para el armado de plantel.
 *
 * Existe porque `SquadManagementShell` hacía `.from('people').select('*')` desde
 * el navegador, y `people` es dato personal: la clave anónima viaja en el
 * frontend, así que ese select exponía DNI, fecha de nacimiento, mail y teléfono
 * de 1.479 personas a cualquiera. Los privilegios de columna
 * (20260804170000_people_column_privileges.sql) cerraron eso, y `birth_date`,
 * `weight` y `height` — que la pantalla necesita para la edad y el peso promedio
 * del plantel — dejaron de ser legibles desde el cliente.
 *
 * La lectura se hace con `service_role`, que no pasa por esos privilegios, PERO
 * sólo después de verificar que quien pregunta administra ese club. El orden
 * importa: primero la autorización con el cliente del usuario, después el dato.
 */
function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
    try {
        const clubId = (request.nextUrl.searchParams.get('club') ?? '').trim();
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);

        if (!context) {
            return err('No autenticado', 401);
        }
        if (!clubId) {
            return err('club param required', 400);
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) {
            return err('Club no encontrado', 404);
        }
        if (!canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)) {
            return err('Sin permisos para administrar este club', 403);
        }

        // Recién acá se usa service_role, y sólo para las columnas que la pantalla
        // necesita. `id_number`, `email` y `phone` NO se devuelven: el armado de
        // plantel no los usa, y lo que no viaja no se filtra.
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('people')
            .select('id, club_id, first_name, last_name, full_name, name, photo_url, avatar_url, position, role, status, birth_date, weight, height')
            .eq('club_id', target.clubId)
            .eq('role', 'player')
            .order('name');

        if (error) {
            return err(error.message || 'No se pudieron cargar los jugadores', 500);
        }

        return NextResponse.json({ ok: true, players: data ?? [] });
    } catch (e) {
        return err(e instanceof Error ? e.message : 'Error inesperado', 500);
    }
}
