import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveEntity } from '@/lib/services/entityResolver';
import { requireTournamentAdminContext } from '@/lib/auth/permissions';
import { resolveTournamentAdminScope } from '@/lib/auth/tournamentAdminScope';
import { getServiceWriter } from '@/lib/supabase/serviceWriter';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { MobileTournamentManager } from '@/components/admin/entities/tournament/mobile/MobileTournamentManager';
import type { Database } from '@/lib/database.types';

/**
 * El gestor de torneo en mobile.
 *
 * Ruta aparte de `../page.tsx` a proposito: la consola de escritorio y esta
 * pantalla no comparten un solo selector de CSS ni un componente de layout, asi
 * que montarlas juntas y esconder una con `display: none` dejaria las dos en el
 * DOM — que es el "doble-DOM" que ya senala
 * `GESTOR_TORNEOS_DIAGNOSTICO_FASE1.md`. Siendo rutas distintas, el telefono
 * baja SOLO esta: ni basalt.css, ni operation-console.css, ni los 185 KB de
 * `TournamentStructureTab`.
 *
 * Las guardas son las mismas que las del gestor completo, incluida la
 * re-resolucion por `resolveTournamentAdminScope`: sin ella, un gestor de club
 * —que ve sus torneos por service-role y no por RLS— caeria en `not_found` en
 * su propio torneo.
 */

export const dynamic = 'force-dynamic';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

export default async function MobileTournamentManagePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    let tournament: TournamentRow | null = null;

    const resolved = await resolveEntity({ id, type: 'tournament' });
    if (resolved.kind === 'ok' && resolved.entityType === 'tournament') {
        tournament = resolved.data as TournamentRow;
    } else {
        try {
            const context = await requireTournamentAdminContext(supabase);
            const scope = await resolveTournamentAdminScope(supabase, context);
            if (scope.isUnlimited || scope.tournamentIds.has(id)) {
                const reader = getServiceWriter(supabase, 'admin/entities/manage/movil');
                const { data } = await reader
                    .from('tournaments')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (data) tournament = data as unknown as TournamentRow;
            }
        } catch {
            // No es gestor de torneos: queda `tournament` en null y abajo se
            // manda al gestor completo, que ya sabe explicar por que no entra.
        }
    }

    const fullManagerHref = `/admin/entities/${encodeURIComponent(id)}/manage?type=tournament&desktop=1`;

    if (!tournament) redirect(fullManagerHref);

    // Un `logo_url` puede ser un data URI de casi un mega: mandarlo crudo infla
    // el payload RSC de la pantalla entera. El proxy sirve la misma imagen por
    // una URL corta.
    const crestSrc = resolveSerializableLogoUrl(tournament.logo_url, {
        key: tournament.id,
        name: tournament.display_name || tournament.name || 'Torneo',
    });

    return (
        <MobileTournamentManager
            id={id}
            data={tournament}
            crestSrc={crestSrc}
            fullManagerHref={fullManagerHref}
        />
    );
}
