import type { MatchRow } from './planMatches.ts';

/**
 * Qué se le permite tocar al cron de sincronización, y qué no.
 *
 * La lista blanca no es una precaución genérica: `matches` tiene columnas que un
 * humano edita a mano y que URBA no conoce. Si el cron escribiera la fila entera
 * —como hizo la carga inicial, que era un INSERT— borraría el trabajo de la
 * gente en cada pasada.
 */
export const CAMPOS_SINCRONIZABLES = [
  'date_time',
  'status',
  'score',
  'round_label',
  'home_base_points',
  'away_base_points',
  'home_bonus_points',
  'away_bonus_points',
  'points_autocalculated',
] as const;

export type CampoSincronizable = (typeof CAMPOS_SINCRONIZABLES)[number];

/**
 * Lo que el cron NO toca nunca, con el motivo. Está declarado —y testeado— para
 * que agregar una columna a `MatchRow` obligue a decidir de qué lado cae.
 *
 *  · `venue`      URBA no publica sede. La fila del conector lleva `null`, y
 *                 escribirlo borraría la cancha que cargó una persona.
 *  · `is_visible` la publicación la decide un humano, no el proveedor.
 *  · `phase_id`   se asigna una vez, al crear. Reasignarlo mueve el partido de
 *                 tabla de posiciones.
 *  · `tournament_id`, `home_club_id`, `away_club_id`  la identidad del partido.
 *                 Si cambian, no es el mismo partido: es uno nuevo.
 *  · `external_id` la identidad ante URBA.
 */
export const CAMPOS_INTOCABLES = [
  'venue',
  'is_visible',
  'phase_id',
  'tournament_id',
  'home_club_id',
  'away_club_id',
  'external_id',
] as const;

export interface PatchDeSync {
  external_id: string;
  patch: Partial<Record<CampoSincronizable, unknown>>;
  cambios: CampoSincronizable[];
  /** true si el partido pasa a 'final' en esta pasada */
  seFinaliza: boolean;
}

/**
 * Traduce el `actualizar` del conector a un PATCH acotado a la lista blanca.
 *
 * Devuelve `null` cuando no queda nada que escribir: un partido cuyo único
 * "cambio" cae fuera de la lista no se toca, y sobre todo no se le mueve el
 * `updated_at` — que es lo que dispara el trigger de notificaciones.
 */
export function construirPatch(
  entrada: { fila: MatchRow; cambios: string[] },
  statusActual: string | null | undefined,
): PatchDeSync | null {
  const permitidos = new Set<string>(CAMPOS_SINCRONIZABLES);
  const cambios = entrada.cambios.filter((c): c is CampoSincronizable => permitidos.has(c));
  if (cambios.length === 0) return null;

  const patch: Partial<Record<CampoSincronizable, unknown>> = {};
  for (const campo of cambios) patch[campo] = entrada.fila[campo as keyof MatchRow];

  const eraFinal = String(statusActual ?? '').toLowerCase() === 'final';
  return {
    external_id: entrada.fila.external_id,
    patch,
    cambios,
    seFinaliza: !eraFinal && entrada.fila.status === 'final',
  };
}

/**
 * El orden en que se recorren los torneos, y el corte por presupuesto de tiempo.
 *
 * No hay cursor persistido: la rotación sale del reloj. Con tandas de ~50 y
 * corridas cada 20 minutos, dos pasadas consecutivas cubren los 85 torneos de un
 * domingo sin guardar estado en ninguna parte. Si se guardara, habría que
 * migrarlo y mantenerlo sincronizado con una lista que cambia sola.
 */
export function rotarPorReloj<T>(items: T[], porTanda: number, ahoraMs: number): T[] {
  if (items.length <= porTanda) return items;
  const tandas = Math.ceil(items.length / porTanda);
  const indice = Math.floor(ahoraMs / (20 * 60 * 1000)) % tandas;
  const desde = indice * porTanda;
  return [...items.slice(desde), ...items.slice(0, desde)].slice(0, porTanda);
}
