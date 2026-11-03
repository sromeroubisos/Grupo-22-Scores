/**
 * Etiquetas automáticas de clasificación en la tabla de una fase de zonas.
 *
 * Si una copa toma sus clasificados de esta fase ("pasan 2 a Copa Oro"), los
 * puestos que la alimentan llevan la etiqueta de la copa. El color sale del
 * orden de la copa, que es el orden de los puestos:
 *
 *   clasificación primaria → verde · secundaria → azul · terciaria → amarillo
 *   · la siguiente → naranja · eliminado → rojo
 *
 * La etiqueta que pinta la fila es `team_labels` POR POSICIÓN (con
 * `group_id` null vale para todas las zonas de la fase); `ui_labels` es la
 * definición y `settings.groupLabels` la lista que muestra el gestor. Hacen
 * falta las tres. Antes de asignar un puesto se limpia el puesto entero: dos
 * etiquetas en el mismo puesto se pisan según el orden del heap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhaseLabels } from '@/lib/server/phaseLabels';
import { readPlayoffSeedingConfig } from '@/lib/playoff/seedingFromStandings';

type Supa = SupabaseClient<any, any, any>;

export const QUALIFICATION_COLORS = ['#00a365', '#3b82f6', '#eab308', '#f97316'] as const;
export const ELIMINATED_COLOR = '#ef4444';
export const ELIMINATED_LABEL = 'Eliminado';

type Band = { name: string; color: string; from: number; to: number };

async function ensureLabel(db: Supa, labels: ReturnType<typeof normalizePhaseLabels>, name: string, color: string) {
  const found = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (found?.id) return { id: found.id, labels };
  const { data, error } = await db
    .from('ui_labels')
    .insert({ name, color, scope: 'standings' })
    .select('id, name, color')
    .single();
  if (error) throw error;
  const next = [...labels, { id: data.id as string, name, colorMode: 'manual' as const, color, autoColorIndex: labels.length }];
  return { id: data.id as string, labels: next };
}

/**
 * Pone las etiquetas de las copas que salen de `sourcePhaseId`. Con
 * `eliminatedUpTo`, los puestos que siguen a la última copa hasta ese número
 * quedan marcados "Eliminado" en rojo. Devuelve cuántos puestos etiquetó.
 */
export async function syncQualificationLabels(
  db: Supa,
  params: { tournamentId: string; sourcePhaseId: string; eliminatedUpTo?: number | null },
): Promise<number> {
  const { tournamentId, sourcePhaseId } = params;

  const { data: phases, error } = await db
    .from('tournament_phases')
    .select('id, name, settings, order_index')
    .eq('tournament_id', tournamentId);
  if (error) throw error;
  const source = (phases ?? []).find((p: { id: string }) => p.id === sourcePhaseId) as { id: string; settings: Record<string, unknown> | null } | undefined;
  if (!source) return 0;

  const feeders = ((phases ?? []) as Array<{ id: string; name: string; settings: unknown; order_index: number | null }>)
    .map((p) => ({ phase: p, cfg: readPlayoffSeedingConfig(p.settings) }))
    .filter((f) => f.cfg && f.cfg.sourcePhaseId === sourcePhaseId && f.cfg.perGroup)
    .sort((a, b) => a.cfg!.fromPosition - b.cfg!.fromPosition || Number(a.phase.order_index ?? 0) - Number(b.phase.order_index ?? 0));

  const bands: Band[] = feeders.map((f, i) => ({
    name: f.phase.name,
    color: QUALIFICATION_COLORS[Math.min(i, QUALIFICATION_COLORS.length - 1)],
    from: f.cfg!.fromPosition,
    to: f.cfg!.fromPosition + (f.cfg!.perGroup as number) - 1,
  }));
  const lastQualified = bands.reduce((m, b) => Math.max(m, b.to), 0);
  const eliminatedUpTo = Math.floor(Number(params.eliminatedUpTo ?? 0));
  if (eliminatedUpTo > lastQualified) {
    bands.push({ name: ELIMINATED_LABEL, color: ELIMINATED_COLOR, from: lastQualified + 1, to: eliminatedUpTo });
  }
  if (bands.length === 0) return 0;

  const settings = source.settings && typeof source.settings === 'object' ? { ...source.settings } : {};
  let labels = normalizePhaseLabels((settings as Record<string, unknown>).groupLabels);

  let tagged = 0;
  for (const band of bands) {
    const ensured = await ensureLabel(db, labels, band.name, band.color);
    labels = ensured.labels;
    const positions = Array.from({ length: band.to - band.from + 1 }, (_, i) => band.from + i);

    // El puesto entero, en cualquier zona de la fase: una sola etiqueta por puesto.
    const { error: delError } = await db
      .from('team_labels')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('phase_id', sourcePhaseId)
      .in('position', positions);
    if (delError) throw delError;

    const { error: insError } = await db.from('team_labels').insert(
      positions.map((position) => ({
        label_id: ensured.id,
        club_id: null,
        position,
        tournament_id: tournamentId,
        phase_id: sourcePhaseId,
        group_id: null,
      })),
    );
    if (insError) throw insError;
    tagged += positions.length;
  }

  const { error: updError } = await db
    .from('tournament_phases')
    .update({ settings: { ...settings, groupLabels: labels } })
    .eq('id', sourcePhaseId);
  if (updError) throw updError;
  return tagged;
}
