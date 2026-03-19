import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { GroupLabel } from '@/types/phase-settings';

const DEFAULT_LABEL_COLOR = '#00a365';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LabelRow = Database['public']['Tables']['ui_labels']['Row'];
type PhaseSettingsRecord = Record<string, unknown>;

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function normalizePhaseLabels(input: unknown): GroupLabel[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const candidate = item as Partial<GroupLabel>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      if (!name) return null;

      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : undefined,
        name,
        colorMode: candidate.colorMode === 'manual' ? 'manual' : 'auto',
        color: typeof candidate.color === 'string' && candidate.color.trim()
          ? candidate.color.trim()
          : DEFAULT_LABEL_COLOR,
        autoColorIndex: typeof candidate.autoColorIndex === 'number' ? candidate.autoColorIndex : index,
      } satisfies GroupLabel;
    })
    .filter((label): label is GroupLabel => Boolean(label));
}

export async function syncPhaseLabels(
  supabase: SupabaseClient<Database>,
  input: unknown,
): Promise<GroupLabel[]> {
  const normalized = normalizePhaseLabels(input);
  if (normalized.length === 0) return [];

  const existingIds = normalized
    .map((label) => label.id)
    .filter(isUuid);

  const existingById = new Map<string, LabelRow>();

  if (existingIds.length > 0) {
    const { data, error } = await supabase
      .from('ui_labels')
      .select('*')
      .in('id', existingIds);

    if (error) throw error;
    (data || []).forEach((label) => existingById.set(label.id, label));
  }

  const synced: GroupLabel[] = [];

  for (const label of normalized) {
    if (isUuid(label.id) && existingById.has(label.id)) {
      const existing = existingById.get(label.id)!;
      if (existing.name !== label.name || existing.color !== label.color || existing.scope !== 'standings') {
        const { data, error } = await supabase
          .from('ui_labels')
          .update({ name: label.name, color: label.color, scope: 'standings' })
          .eq('id', label.id)
          .select('*')
          .single();

        if (error) throw error;
        synced.push({ ...label, id: data.id, color: data.color, name: data.name });
      } else {
        synced.push({ ...label, id: existing.id, color: existing.color, name: existing.name });
      }
      continue;
    }

    const { data, error } = await supabase
      .from('ui_labels')
      .insert({ name: label.name, color: label.color, scope: 'standings' })
      .select('*')
      .single();

    if (error) throw error;
    synced.push({ ...label, id: data.id, color: data.color, name: data.name });
  }

  return synced;
}

export async function buildPhaseSettingsWithSyncedLabels(
  supabase: SupabaseClient<Database>,
  settings: unknown,
): Promise<PhaseSettingsRecord> {
  const safeSettings =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? { ...(settings as PhaseSettingsRecord) }
      : {};

  const groupLabels = await syncPhaseLabels(supabase, safeSettings.groupLabels);

  return {
    ...safeSettings,
    groupLabels,
  };
}
