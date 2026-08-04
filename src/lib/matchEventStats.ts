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

/**
 * Vocabulario de tiro ERRADO en el detalle libre.
 *
 * Se amplio porque el original solo entendia "fallada/errada/erro/fallo/no
 * convertida/missed": un detalle que dijera "desviada", "afuera", "al palo" o
 * "erro" sin tilde pasaba como convertida y SUMABA PUNTOS. Se normalizan los
 * acentos antes de testear, asi que aca va todo sin tilde.
 *
 * Ojo con los limites de palabra: "palo" tiene que matchear "al palo" pero no
 * "a los palos", que es como se llama la jugada entera.
 */
const RE_KICK_MISSED = new RegExp(
  [
    'fallad[ao]', 'fall[oa]\\b', 'errad[ao]', 'err[oa]\\b',
    'no convert', 'sin convert', 'no entro', 'no paso',
    '\\bmissed\\b', '\\bmiss\\b', '\\bwide\\b', '\\bno good\\b',
    'desviad[ao]', '\\bdesvia', '\\bafuera\\b', '\\bfuera\\b',
    '\\bal palo\\b', '\\bpalo izquierdo\\b', '\\bpalo derecho\\b',
    '\\bposte\\b', '\\btravesa', '\\bhorizontal\\b',
    '\\bcorta\\b',
  ].join('|'),
);

const RE_KICK_MADE = /convertid|acertad|\bmade\b|\bok\b|\bbuena\b|\badentro\b|\bgood\b/;

/** Marcas diacriticas combinantes, por codepoint: el rango literal es ilegible. */
const RE_COMBINING_MARKS = /[̀-ͯ]/g;

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(RE_COMBINING_MARKS, '');
}

export function isGoalKickMade(eventType: string, detail: string | null | undefined) {
  if (!isGoalKickEventType(eventType)) return true;

  const raw = String(detail || '');
  if (RE_PALOS_NO.test(raw)) return false;
  if (RE_PALOS_OK.test(raw)) return true;

  // Sin acentos: "erró" y "erro" tienen que resolver igual. Quien carga en la
  // cancha desde el celular no pone tildes.
  const normalized = stripDiacritics(raw.toLowerCase());
  if (RE_KICK_MISSED.test(normalized)) return false;
  if (RE_KICK_MADE.test(normalized)) return true;

  // `penalty` es el unico que, ante un texto que no reconoce, asume errado.
  // Se conserva ASI a proposito: es el que menos informacion trae (no hay un
  // tipo aparte para el penal fallado) y equivocarse hacia no-suma es mucho
  // mas barato que inventar tres puntos. Los demas mantienen su default
  // historico para no bajarle el marcador a partidos ya cargados.
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
  secondaryPlayerName?: string | null;
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
    const incoming = normalizeSubstitutionPlayerName(
      e.secondaryPlayerName || parseSubstitutionIncomingPlayer(e.detail),
    );
    if (incoming && incoming === outName) {
      const onMin = parseTimelineMinute(e.minute);
      return Math.max(0, offMin - onMin);
    }
  }

  return Math.max(0, offMin - kickoffMin);
}

/** Detecta si un evento de cambio es temporal (marcado con `[temporal]`). */
export function isTemporarySubstitution(detail: string | null | undefined): boolean {
  return /\[temporal\]/i.test(String(detail || ''));
}

/** Texto de línea de timeline para cambios: sale, minutos jugados, detalle (Entra: …). */
export function formatSubstitutionTimelineDescription(
  event: Pick<SubstitutionMinuteEvent, 'playerName' | 'secondaryPlayerName' | 'detail'>,
  minutesPlayed: number | null,
): string {
  const parts: string[] = [];
  const isTemporal = isTemporarySubstitution(event.detail);
  if (isTemporal) parts.push('Cambio temporal');
  const name = String(event.playerName || '').trim();
  if (name) parts.push(`Sale: ${name}`);
  if (minutesPlayed != null) parts.push(`${minutesPlayed} min jugados`);
  const rawDetail = String(
    event.detail || (event.secondaryPlayerName ? `Entra: ${event.secondaryPlayerName}` : ''),
  ).trim();
  const entr = rawDetail.replace(/\[temporal\]\s*/gi, '');
  if (entr) parts.push(entr);
  return parts.join(' · ');
}

/** Detalle de fila de timeline genérico; en cambios incluye minutos del jugador que sale. */
export function formatMatchTimelineEventDescription(
  event: Pick<SubstitutionMinuteEvent, 'type' | 'playerName' | 'secondaryPlayerName' | 'detail'>,
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
