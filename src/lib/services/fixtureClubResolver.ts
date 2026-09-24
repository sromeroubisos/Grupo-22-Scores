/**
 * Encuentra los clubes del torneo dentro de una línea de texto corrido.
 *
 * El fixture de la Unión Cordobesa (TOP-10-A-2026.pdf) exportado a PDF deja
 * cada fila como «10 9 10 Jockey Club Cba Tala R.C. 9»: los números de los
 * cruces, el local y el visitante pegados con un espacio, y a veces la lista
 * del sorteo en la misma línea. Sin separador («vs», tab, guion) no hay forma
 * de saber dónde termina el local… salvo conociendo los clubes. El importador
 * los conoce: son los participantes del torneo.
 *
 * La comparación es por palabras canónicas: sin tildes, sin «Club / de / RC /
 * R.C. / Rugby», con «Cba» → «córdoba». Así «Jockey Club Cba» es Jockey Club
 * Córdoba, «Uru Cure RC» es Urú Curé Rugby Club y «Jockey Villa María» es
 * Jockey Club de Villa María. Un nombre parcial («Universitario») vale sólo si
 * apunta a UN club; «Jockey» solo no vale nada.
 *
 * Puro: sin Supabase ni React.
 */

export interface ResolvableClub {
  id: string;
  name: string;
  /** Nombre corto, nombre del participante, alias aprendidos. */
  variants: string[];
}

export interface ClubMention {
  clubId: string;
  label: string;
  /** Índices de token [start, end) dentro de la línea. */
  start: number;
  end: number;
  exact: boolean;
}

const FILLER = new Set(['club', 'de', 'del', 'rugby', 'rc', 'r', 'c', 'the', 'y']);
const ABBREVIATIONS: Record<string, string> = {
  cba: 'cordoba',
  univ: 'universitario',
  gral: 'general',
  sta: 'santa',
  sto: 'santo',
};
/** Lo que puede ir entre local y visitante sin romper el «pegados». */
const MATCHUP_GLUE = new Set(['vs', 'v', 'x', 'contra', 'versus']);
const MAX_SPAN = 8;

function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function canonical(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    if (FILLER.has(token)) continue;
    out.push(ABBREVIATIONS[token] ?? token);
  }
  return out;
}

export type IndexedClub = { id: string; label: string; forms: string[][] };

export interface ClubIndex {
  clubs: IndexedClub[];
  /** forma canónica exacta → ids (más de uno = ambiguo). */
  exact: Map<string, Set<string>>;
}

export function buildClubIndex(clubs: ResolvableClub[]): ClubIndex {
  const byId = new Map<string, IndexedClub>();
  const exact = new Map<string, Set<string>>();
  // Orden estable: el mismo archivo resuelve igual siempre.
  for (const club of [...clubs].sort((a, b) => a.id.localeCompare(b.id))) {
    const entry = byId.get(club.id) ?? { id: club.id, label: club.name, forms: [] };
    for (const variant of [club.name, ...club.variants]) {
      const form = canonical(tokenize(variant || ''));
      if (!form.length) continue;
      entry.forms.push(form);
      const key = form.join(' ');
      const ids = exact.get(key) ?? new Set<string>();
      ids.add(club.id);
      exact.set(key, ids);
    }
    byId.set(club.id, entry);
  }
  return { clubs: [...byId.values()], exact };
}

/** El club al que apuntan estas palabras, si es uno solo. */
function matchSpan(tokens: string[], index: ClubIndex): { club: IndexedClub; exact: boolean } | null {
  const form = canonical(tokens);
  if (!form.length) return null;
  const exactIds = index.exact.get(form.join(' '));
  if (exactIds?.size === 1) {
    const id = [...exactIds][0];
    return { club: index.clubs.find((club) => club.id === id)!, exact: true };
  }
  if (exactIds && exactIds.size > 1) return null;

  // Parcial: todas las palabras están en alguna forma del club, y sólo un club
  // cumple. Una sola palabra tiene que ser distintiva (4+ letras).
  if (form.length === 1 && form[0].length < 4) return null;
  const hits = index.clubs.filter((club) =>
    club.forms.some((clubForm) => form.every((token) => clubForm.includes(token))));
  return hits.length === 1 ? { club: hits[0], exact: false } : null;
}

/**
 * Los clubes nombrados en la línea, de izquierda a derecha. En cada posición
 * gana el tramo exacto más largo; si no hay exacto, el parcial más largo.
 */
export function findClubMentions(text: string, index: ClubIndex): ClubMention[] {
  const tokens = tokenize(text);
  const mentions: ClubMention[] = [];
  let position = 0;
  while (position < tokens.length) {
    if (/^\d+$/.test(tokens[position]) || FILLER.has(tokens[position]) || MATCHUP_GLUE.has(tokens[position])) {
      position += 1;
      continue;
    }
    let best: { length: number; club: IndexedClub; exact: boolean } | null = null;
    for (let length = Math.min(MAX_SPAN, tokens.length - position); length >= 1; length -= 1) {
      const span = tokens.slice(position, position + length);
      // Un tramo no cruza números: son cruces, puestos o resultados.
      if (span.some((token) => /^\d+$/.test(token))) continue;
      const hit = matchSpan(span, index);
      if (!hit) continue;
      if (hit.exact) {
        best = { length, ...hit };
        break;
      }
      if (!best) best = { length, ...hit };
    }
    if (best) {
      mentions.push({
        clubId: best.club.id,
        label: best.club.label,
        start: position,
        end: position + best.length,
        exact: best.exact,
      });
      position += best.length;
    } else {
      position += 1;
    }
  }
  return mentions;
}

/**
 * Local y visitante de una línea: el ÚLTIMO par de clubes pegados (sólo «vs»,
 * «v», «x» o nada entre ellos). El último porque lo que viene antes en la misma
 * línea suele ser la lista del sorteo o de posiciones.
 */
export function resolveMatchupFromLine(
  text: string,
  index: ClubIndex,
): { home: ClubMention; away: ClubMention } | null {
  const tokens = tokenize(text);
  const mentions = findClubMentions(text, index);
  for (let i = mentions.length - 2; i >= 0; i -= 1) {
    const home = mentions[i];
    const away = mentions[i + 1];
    if (home.clubId === away.clubId) continue;
    const gap = tokens.slice(home.end, away.start);
    if (gap.every((token) => MATCHUP_GLUE.has(token) || FILLER.has(token))) return { home, away };
  }
  return null;
}

/**
 * Resuelve local y visitante de filas que vienen de texto (pegado, PDF o una
 * planilla leída fila por fila) buscando los clubes del torneo en la línea
 * (`_line`). Es lo que hace que «10 9 10 Jockey Club Cba Tala R.C. 9» sea un
 * partido.
 *
 * - Si la línea tiene un par de clubes pegados, ese par manda.
 * - Si no, la fila queda como la separó el parser («vs», tab) sólo si los dos
 *   lados son clubes del torneo según `isKnownSide` (el servicio le suma su
 *   parecido difuso, para que un error de tipeo entre y se corrija en la fila).
 * - Lo demás —«Fecha TDI», el sorteo, notas, «1ro vs 4to»— queda afuera y se
 *   devuelve para avisar.
 */
export function resolveRowsByClubs(
  rows: Array<Record<string, unknown>>,
  index: ClubIndex,
  isKnownSide: (text: string) => boolean = (text) => findClubMentions(text, index).length > 0,
): { rows: Array<Record<string, unknown>>; dropped: string[] } {
  const kept: Array<Record<string, unknown>> = [];
  const dropped: string[] = [];
  const known = (value: unknown) => typeof value === 'string' && value.trim() !== '' && isKnownSide(value);
  for (const row of rows) {
    const matchup = resolveMatchupFromLine(String(row._line ?? ''), index);
    if (matchup) {
      kept.push({ ...row, home_team: matchup.home.label, away_team: matchup.away.label });
    } else if (known(row.home_team) && known(row.away_team)) {
      kept.push(row);
    } else {
      dropped.push(String(row._line ?? '').replace(/\t/g, ' ').trim());
    }
  }
  return { rows: kept, dropped };
}
