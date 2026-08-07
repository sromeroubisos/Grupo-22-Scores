import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { buildPhaseSettingsWithSyncedLabels } from '@/lib/server/phaseLabels';

/**
 * Persiste la normalización de etiquetas de las fases del torneo.
 *
 * Esto vivía adentro del GET de `/standings/context`: abrir Posiciones hacía un
 * UPDATE por fase, en serie, sin que nadie lo pidiera. Un GET tiene que poder
 * repetirse sin consecuencias —y este ni siquiera era atómico: si fallaba en la
 * tercera fase dejaba dos escritas y el resto no—, así que la escritura se mudó
 * acá, detrás de un verbo que declara que va a cambiar algo y del permiso de
 * mutación del torneo.
 *
 * Es idempotente: sólo escribe las fases cuya lista de etiquetas cambió de
 * verdad, y volver a llamarlo sobre un torneo ya normalizado no toca ninguna
 * fila.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id: tournamentId } = await params;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);

        const { data: phases, error: phasesError } = await supabase
            .from('tournament_phases')
            .select('id, settings')
            .eq('tournament_id', tournamentId)
            .order('order_index', { ascending: true });

        if (phasesError) {
            console.error('[standings/context/sync] Error leyendo fases', phasesError);
            return NextResponse.json({ error: 'No se pudieron leer las fases.' }, { status: 500 });
        }

        let updated = 0;
        const failed: string[] = [];

        for (const phase of phases ?? []) {
            try {
                const nextSettings = await buildPhaseSettingsWithSyncedLabels(supabase, phase.settings);
                const nextLabels = JSON.stringify(nextSettings.groupLabels || []);
                const prevLabels = JSON.stringify(
                    (phase.settings as { groupLabels?: unknown[] } | null)?.groupLabels || [],
                );

                if (nextLabels === prevLabels) continue;

                const { error: updateError } = await supabase
                    .from('tournament_phases')
                    .update({ settings: nextSettings })
                    .eq('id', phase.id);

                if (updateError) {
                    console.error('[standings/context/sync] Error escribiendo fase', phase.id, updateError);
                    failed.push(phase.id);
                    continue;
                }

                updated += 1;
            } catch (error) {
                console.error('[standings/context/sync] Excepción preparando fase', phase.id, error);
                failed.push(phase.id);
            }
        }

        // Se informa lo que NO se pudo hacer en vez de reportar un éxito redondo:
        // una sincronización parcial silenciosa es lo que hacía el GET.
        return NextResponse.json({ ok: failed.length === 0, updated, failed });
    } catch (e: unknown) {
        console.error('Exception syncing standings context:', e);
        return tournamentApiErrorResponse(e);
    }
}
