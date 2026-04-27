/**
 * Lógica compartida para estadísticas de eventos de partido (rugby y similares):
 * - Intentos a palos (conversión, penal a postes, drop): éxito / fallo según `detail`
 * - Metros de patada in-game parseados desde el texto de detalle
 */

export type GoalKickishEvent = Pick<{ type: string; detail: string }, 'type' | 'detail'>;

export function isGoalKickEventType(eventType: string) {
  return eventType === 'conversion'
    || eventType === 'penalty'
    || eventType === 'penalty_goal'
    || eventType === 'drop_goal';
}

/** Penal a touch/tap/rápido no cuenta como tiro a palos */
export function isGoalKickAttemptEvent(event: GoalKickishEvent) {
  if (!isGoalKickEventType(event.type)) return false;

  const normalized = String(event.detail || '').toLowerCase();
  if (event.type === 'penalty' && /touch|scrum|tap|rapido|quick|ganad|concedid/.test(normalized)) {
    return false;
  }

  return true;
}

/** Prefijo que guarda el asistente de partido; tiene prioridad sobre el resto del texto. */
const RE_PALOS_NO = /\[palos:miss\]/i;
const RE_PALOS_OK = /\[palos:ok\]/i;

export function isGoalKickMade(eventType: string, detail: string | null | undefined) {
  if (!isGoalKickEventType(eventType)) return true;

  const raw = String(detail || '');
  if (RE_PALOS_NO.test(raw)) return false;
  if (RE_PALOS_OK.test(raw)) return true;

  const normalized = raw.toLowerCase();
  if (/fallad[ao]|errad[ao]|erró|falló|no convert|\bmissed\b/.test(normalized)) return false;
  if (/convertid|acertad|made|\bok\b/.test(normalized)) return true;
  if (eventType === 'penalty' && normalized.trim()) return false;

  return true;
}

/** Para construir el detalle al guardar convertida / fallada desde el Match Center. */
export function formatGoalKickDetailPrefix(made: boolean) {
  return made ? '[palos:ok]' : '[palos:miss]';
}

/**
 * Suma de metros declarados en patadas in-game. Formatos: `Dist: 40m` (club composer),
 * `40m`, `40 m`, `25 metros`, etc.
 */
export function parseKickMetersFromDetail(detail: string | null | undefined): number {
  const s = String(detail || '');
  const dist = s.match(/Dist:\s*(\d+(?:[.,]\d+)?)\s*m?/i);
  if (dist) {
    const v = parseFloat(dist[1].replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  }
  const generic = s.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|mts\.?|metros?)\b/i);
  if (generic) {
    const v = parseFloat(generic[1].replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  }
  return 0;
}

export function goalKickEffectivenessPercent(made: number, attempts: number): number {
  if (attempts <= 0) return -1;
  return (made / attempts) * 100;
}

/** Fijos / contacto: detalle de evento (Scrum ganado, Line perdido, etc.) */
export function isContestWonDetail(detail: string | null | undefined): boolean {
  return /ganad|won|recuperad|favor/i.test(String(detail || ''));
}

export function isContestLostDetail(detail: string | null | undefined): boolean {
  return /perdid|lost|contra/i.test(String(detail || ''));
}
