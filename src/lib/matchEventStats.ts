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

/** Para textos de UI: sufijo si el evento es tiro a palos con resultado conocido; vacío si no aplica. */
export function goalKickOutcomeSuffixSpanish(
  eventType: string,
  detail: string | null | undefined,
): string {
  const canonical = String(eventType || '').trim().toLowerCase();
  const k: GoalKickishEvent = { type: canonical, detail: String(detail ?? '') };
  if (!isGoalKickAttemptEvent(k)) return '';
  const made = isGoalKickMade(canonical, detail);
  return made ? ' · acertada' : ' · fallada';
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

/** Conteos de tiros a palos por equipo (eventos `conversion`, `penalty`/`penalty_goal` a postes, `drop_goal` en total). */
export type TeamKickAccuracyBreakdown = {
  convAttempts: number;
  convMade: number;
  penPalosAttempts: number;
  penPalosMade: number;
  totalAttempts: number;
  totalMade: number;
};

export function teamKickAccuracyBreakdown(
  events: Array<{ type: string; team?: string | null; detail?: string | null | undefined }>,
  team: 'home' | 'away',
): TeamKickAccuracyBreakdown {
  let convAttempts = 0;
  let convMade = 0;
  let penPalosAttempts = 0;
  let penPalosMade = 0;
  let totalAttempts = 0;
  let totalMade = 0;

  for (const e of events) {
    if (e.team !== team) continue;
    const k: GoalKickishEvent = { type: e.type, detail: String(e.detail ?? '') };
    if (!isGoalKickAttemptEvent(k)) continue;

    const made = isGoalKickMade(e.type, e.detail);
    totalAttempts += 1;
    if (made) totalMade += 1;

    if (e.type === 'conversion') {
      convAttempts += 1;
      if (made) convMade += 1;
    } else if (e.type === 'penalty_goal' || e.type === 'penalty') {
      penPalosAttempts += 1;
      if (made) penPalosMade += 1;
    }
  }

  return {
    convAttempts,
    convMade,
    penPalosAttempts,
    penPalosMade,
    totalAttempts,
    totalMade,
  };
}

/** Fijos / contacto: detalle de evento (Scrum ganado, Line perdido, etc.) */
export function isContestWonDetail(detail: string | null | undefined): boolean {
  return /ganad|won|recuperad|favor/i.test(String(detail || ''));
}

export function isContestLostDetail(detail: string | null | undefined): boolean {
  return /perdid|lost|contra/i.test(String(detail || ''));
}

/** Evento mínimo para calcular minutos jugados al momento de un cambio */
export type SubstitutionMinuteEvent = {
  type: string;
  team?: string | null;
  minute: string | number;
  playerName?: string | null;
  detail?: string | null;
};

function parseTimelineMinute(minute: string | number | null | undefined): number {
  if (typeof minute === 'number' && Number.isFinite(minute)) return minute;
  const n = Number.parseInt(String(minute ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSubstitutionPlayerName(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Nombre del jugador que entra, desde el texto guardado (`Entra: …`). */
export function parseSubstitutionIncomingPlayer(detail: string | null | undefined): string {
  const match = String(detail || '').match(/Entra:\s*(.+)$/i);
  return match?.[1]?.trim() || '';
}

/**
 * Minutos jugados por el jugador que sale, según la timeline ordenada ascendente por minuto.
 * Titular: desde el último `match_start` (o 0) hasta el minuto del cambio.
 * Suplente que ya había ingresado: desde el cambio en el que figuró como "Entra".
 */
export function minutesPlayedWhenSubstitutedOut(
  orderedEventsAsc: SubstitutionMinuteEvent[],
  eventIndex: number,
): number | null {
  const ev = orderedEventsAsc[eventIndex];
  if (!ev || ev.type !== 'substitution') return null;

  const team = ev.team;
  if (team !== 'home' && team !== 'away') return null;

  const outName = normalizeSubstitutionPlayerName(ev.playerName);
  if (!outName) return null;

  const offMin = parseTimelineMinute(ev.minute);

  let kickoffMin = 0;
  for (let i = 0; i < eventIndex; i++) {
    const e = orderedEventsAsc[i];
    if (e.type === 'match_start') {
      kickoffMin = parseTimelineMinute(e.minute);
    }
  }

  for (let i = eventIndex - 1; i >= 0; i--) {
    const e = orderedEventsAsc[i];
    if (e.type !== 'substitution' || e.team !== team) continue;
    const incoming = normalizeSubstitutionPlayerName(parseSubstitutionIncomingPlayer(e.detail));
    if (incoming && incoming === outName) {
      const onMin = parseTimelineMinute(e.minute);
      return Math.max(0, offMin - onMin);
    }
  }

  return Math.max(0, offMin - kickoffMin);
}

/** Texto de línea de timeline para cambios: sale, minutos jugados, detalle (Entra: …). */
export function formatSubstitutionTimelineDescription(
  event: Pick<SubstitutionMinuteEvent, 'playerName' | 'detail'>,
  minutesPlayed: number | null,
): string {
  const parts: string[] = [];
  const name = String(event.playerName || '').trim();
  if (name) parts.push(name);
  if (minutesPlayed != null) parts.push(`${minutesPlayed} min jugados`);
  const entr = String(event.detail || '').trim();
  if (entr) parts.push(entr);
  return parts.join(' · ');
}

/** Detalle de fila de timeline genérico; en cambios incluye minutos del jugador que sale. */
export function formatMatchTimelineEventDescription(
  event: Pick<SubstitutionMinuteEvent, 'type' | 'playerName' | 'detail'>,
  orderedAsc: SubstitutionMinuteEvent[],
  indexInOrdered: number,
  emptyFallback: string,
): string {
  if (event.type === 'substitution') {
    const mins = minutesPlayedWhenSubstitutedOut(orderedAsc, indexInOrdered);
    return formatSubstitutionTimelineDescription(event, mins);
  }
  const line = [event.playerName, event.detail].filter((s) => String(s || '').trim()).join(' · ');
  return line || emptyFallback;
}
