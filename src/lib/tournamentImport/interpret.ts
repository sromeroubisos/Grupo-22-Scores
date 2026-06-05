/**
 * Deterministic tournament interpreter.
 *
 * Pure: takes raw parsed sheets + optional manual column mapping and produces
 * an editable `InterpretedTournament` preview. No DB, no AI. Heuristics are
 * Spanish-first (equipo/zona/local/visitante/fecha/...). A later AI layer can
 * produce the same output shape; the UI/commit don't change.
 */
import type {
  ColumnMapping,
  Confidence,
  ImportField,
  InterpretedMatch,
  InterpretedPlayer,
  InterpretedTeam,
  InterpretedTournament,
  SheetData,
} from './types';

function norm(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function cleanCell(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Header synonyms (normalized, accent-stripped). Order matters: 'round' is
// matched before 'date' so "jornada/fecha n" wins over a plain date column.
const HEADER_SYNONYMS: Array<{ field: ImportField; tokens: string[] }> = [
  { field: 'home', tokens: ['local', 'equipo local', 'home', 'casa'] },
  { field: 'away', tokens: ['visitante', 'equipo visitante', 'visita', 'away'] },
  { field: 'zone', tokens: ['zona', 'grupo', 'group', 'pool'] },
  { field: 'round', tokens: ['jornada', 'ronda', 'round', 'rueda', 'etapa', 'fecha n', 'nro fecha'] },
  { field: 'date', tokens: ['fecha', 'dia', 'date'] },
  { field: 'time', tokens: ['hora', 'horario', 'time'] },
  { field: 'venue', tokens: ['cancha', 'sede', 'estadio', 'lugar', 'venue', 'campo'] },
  { field: 'category', tokens: ['categoria', 'division', 'cat', 'rama'] },
  { field: 'playerFirstName', tokens: ['nombre'] },
  { field: 'playerLastName', tokens: ['apellido'] },
  {
    field: 'playerName',
    tokens: ['jugador', 'jugadora', 'nombre y apellido', 'apellido y nombre', 'nombre completo'],
  },
  { field: 'jersey', tokens: ['dorsal', 'numero', 'n', 'nro', 'camiseta', 'nro camiseta'] },
  { field: 'team', tokens: ['equipo', 'club', 'delegacion', 'plantel', 'institucion'] },
];

function matchHeaderField(cell: string): ImportField | null {
  const n = norm(cell);
  if (!n) return null;
  for (const { field, tokens } of HEADER_SYNONYMS) {
    for (const t of tokens) {
      if (n === t || n.startsWith(t + ' ') || n.includes(t)) return field;
    }
  }
  return null;
}

type ColIndex = Partial<Record<ImportField, number>>;

/** Pick the header row: the first row (within the first 12) with >= 2 known
 *  header tokens. Returns its index + the resolved column map. */
function detectHeader(rows: string[][]): { headerRow: number; cols: ColIndex } {
  let best = { headerRow: -1, cols: {} as ColIndex, score: 0 };
  const limit = Math.min(rows.length, 12);
  for (let r = 0; r < limit; r += 1) {
    const row = rows[r] ?? [];
    const cols: ColIndex = {};
    let score = 0;
    row.forEach((cell, idx) => {
      const field = matchHeaderField(cell);
      if (field && cols[field] === undefined) {
        cols[field] = idx;
        score += 1;
      }
    });
    if (score > best.score) best = { headerRow: r, cols, score };
  }
  return best.score >= 2 ? { headerRow: best.headerRow, cols: best.cols } : { headerRow: -1, cols: {} };
}

function applyMappingOverride(
  sheetName: string,
  cols: ColIndex,
  mapping?: ColumnMapping,
): ColIndex {
  const override = mapping?.[sheetName];
  if (!override) return cols;
  return { ...cols, ...override };
}

const PLAYOFF_HINT_RX = [
  /\b\d\s*[º°]?\s*(?:de\s*)?(?:zona|grupo)\s*[a-h]\b/i,
  /\b\d\s*[a-h]\s*(?:vs|v\.?|-)\s*\d\s*[a-h]\b/i,
  /\b(?:cuartos|semifinal|semi|final|octavos|repechaje|playoff|play-off|cruces?)\b/i,
  /\bmejor\s+\d|\bpeor\s+\d/i,
];

function looksLikePlayoffHint(cell: string): boolean {
  return PLAYOFF_HINT_RX.some((rx) => rx.test(cell));
}

function isProbablyTeamName(value: string): boolean {
  const v = cleanCell(value);
  if (v.length < 2 || v.length > 60) return false;
  if (/^\d+$/.test(v)) return false;
  if (/^(zona|grupo|pool|fecha|jornada|ronda)\b/i.test(norm(v))) return false;
  return true;
}

function zoneFromText(value: string): string | null {
  const m = norm(value).match(/^(?:zona|grupo|pool)\s*([a-h0-9]+)\b/);
  return m ? `Zona ${m[1].toUpperCase()}` : null;
}

export interface InterpretOptions {
  /** Used as the tournament-name fallback (e.g. the uploaded file name). */
  fileName?: string;
  mapping?: ColumnMapping;
}

export function interpretWorkbook(
  sheets: SheetData[],
  options: InterpretOptions = {},
): InterpretedTournament {
  const warnings: string[] = [];
  const teamsByKey = new Map<string, InterpretedTeam>();
  const zones = new Set<string>();
  const categories = new Set<string>();
  const matches: InterpretedMatch[] = [];
  const players: InterpretedPlayer[] = [];
  const playoffHints = new Set<string>();
  const duplicateTeams = new Set<string>();
  let matchSheets = 0;
  let teamSheets = 0;

  const addTeam = (rawName: string, zone: string | null, category: string | null) => {
    const name = cleanCell(rawName);
    if (!isProbablyTeamName(name)) return;
    const key = norm(name);
    const existing = teamsByKey.get(key);
    if (existing) {
      if (!existing.zone && zone) existing.zone = zone;
      if (!existing.category && category) existing.category = category;
      duplicateTeams.add(name);
      return;
    }
    teamsByKey.set(key, { name, zone, category });
  };

  // Tournament name: filename (sans extension) → first non-empty title cell
  // above the first header → first sheet name.
  let name = '';
  let nameConfidence: Confidence = 'low';
  if (options.fileName) {
    name = cleanCell(options.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '));
    nameConfidence = 'medium';
  }

  for (const sheet of sheets) {
    const rows = (sheet.rows ?? []).map((r) => (Array.isArray(r) ? r.map(cleanCell) : []));
    if (rows.length === 0) continue;

    const detected = detectHeader(rows);
    const cols = applyMappingOverride(sheet.name, detected.cols, options.mapping);
    const headerRow = detected.headerRow;

    // Title cell above the header → candidate tournament name.
    if (!options.fileName && !name && headerRow > 0) {
      for (let r = 0; r < headerRow; r += 1) {
        const firstNonEmpty = (rows[r] ?? []).find((c) => c.length > 3);
        if (firstNonEmpty && !zoneFromText(firstNonEmpty)) {
          name = firstNonEmpty;
          nameConfidence = 'medium';
          break;
        }
      }
    }

    // Section-zone tracking for sheets that group rows under "Zona A" lines.
    let sectionZone: string | null = null;
    const dataStart = headerRow >= 0 ? headerRow + 1 : 0;

    const hasFixture = cols.home !== undefined && cols.away !== undefined;
    const hasTeamCol = cols.team !== undefined;
    const hasPlayer =
      cols.playerName !== undefined ||
      (cols.playerFirstName !== undefined && cols.playerLastName !== undefined);

    if (hasFixture) matchSheets += 1;
    if (hasTeamCol || zoneFromText(sheet.name)) teamSheets += 1;

    const sheetZone = zoneFromText(sheet.name);
    if (sheetZone) zones.add(sheetZone);

    for (let r = dataStart; r < rows.length; r += 1) {
      const row = rows[r] ?? [];
      const joined = row.join(' ').trim();
      if (!joined) continue;

      // Section header line like "ZONA A" (single meaningful cell).
      const z = zoneFromText(joined);
      if (z && row.filter((c) => c).length <= 2) {
        sectionZone = z;
        zones.add(z);
        continue;
      }

      for (const c of row) {
        if (c && looksLikePlayoffHint(c)) playoffHints.add(c.slice(0, 120));
      }

      const at = (f: ImportField): string =>
        cols[f] !== undefined ? cleanCell(row[cols[f] as number]) : '';

      const rowZone =
        (cols.zone !== undefined ? zoneFromText(at('zone')) ?? cleanCell(at('zone')) : '') ||
        sectionZone ||
        sheetZone ||
        null;
      if (rowZone) zones.add(rowZone.startsWith('Zona') ? rowZone : `Zona ${rowZone}`);
      const category = cols.category !== undefined ? at('category') || null : null;
      if (category) categories.add(category);

      if (hasFixture) {
        const home = at('home');
        const away = at('away');
        if (isProbablyTeamName(home) && isProbablyTeamName(away)) {
          const mz = rowZone ? (rowZone.startsWith('Zona') ? rowZone : `Zona ${rowZone}`) : null;
          matches.push({
            round: cols.round !== undefined ? at('round') || null : null,
            home,
            away,
            date: cols.date !== undefined ? at('date') || null : null,
            time: cols.time !== undefined ? at('time') || null : null,
            venue: cols.venue !== undefined ? at('venue') || null : null,
            zone: mz,
          });
          addTeam(home, mz, category);
          addTeam(away, mz, category);
        }
        continue;
      }

      if (hasPlayer) {
        const team =
          (cols.team !== undefined ? at('team') : '') || sectionZone || '';
        const fullName =
          cols.playerName !== undefined
            ? at('playerName')
            : `${at('playerFirstName')} ${at('playerLastName')}`.trim();
        if (cleanCell(fullName).length >= 3) {
          const jerseyRaw = cols.jersey !== undefined ? at('jersey') : '';
          const jersey = Number(jerseyRaw);
          players.push({
            team: cleanCell(team) || 'Sin equipo',
            fullName: cleanCell(fullName),
            jersey: Number.isFinite(jersey) && jersey > 0 ? Math.trunc(jersey) : null,
          });
        }
        if (cols.team !== undefined) addTeam(at('team'), rowZone, category);
        continue;
      }

      if (hasTeamCol) {
        addTeam(at('team'), rowZone, category);
        continue;
      }

      // No recognized columns: treat a lone name cell under a zone section
      // as a team (common "Zona A\nClub 1\nClub 2" layout).
      const meaningful = row.filter((c) => c);
      if ((sectionZone || sheetZone) && meaningful.length === 1 && isProbablyTeamName(meaningful[0])) {
        addTeam(meaningful[0], sectionZone || sheetZone, null);
      }
    }
  }

  if (!name) {
    name = cleanCell(sheets[0]?.name) || 'Torneo importado';
    nameConfidence = 'low';
  }

  // De-dupe matches (same home+away+round, normalized).
  const seenMatch = new Set<string>();
  let duplicateMatches = 0;
  const dedupedMatches = matches.filter((m) => {
    const k = `${norm(m.home)}|${norm(m.away)}|${norm(m.round ?? '')}`;
    if (seenMatch.has(k)) {
      duplicateMatches += 1;
      return false;
    }
    seenMatch.add(k);
    return true;
  });

  const teams = Array.from(teamsByKey.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'es'),
  );
  const zoneList = Array.from(zones).sort((a, b) => a.localeCompare(b, 'es'));

  if (teams.length === 0) warnings.push('No se detectaron equipos. Verificá las columnas o usá el mapeo manual.');
  if (dedupedMatches.length === 0) warnings.push('No se detectó un fixture (columnas Local/Visitante).');
  if (duplicateTeams.size > 0) {
    warnings.push(`Equipos repetidos detectados: ${Array.from(duplicateTeams).slice(0, 8).join(', ')}.`);
  }
  if (duplicateMatches > 0) warnings.push(`${duplicateMatches} partido(s) duplicado(s) fueron unificados.`);
  const matchesMissingDate = dedupedMatches.filter((m) => !m.date).length;
  if (matchesMissingDate > 0) {
    warnings.push(`${matchesMissingDate} partido(s) sin fecha — se usará una fecha provisional.`);
  }

  const conf = (ok: boolean, strong: boolean): Confidence =>
    !ok ? 'low' : strong ? 'high' : 'medium';

  return {
    name,
    nameConfidence,
    categories: Array.from(categories),
    zones: zoneList,
    teams,
    matches: dedupedMatches,
    players,
    playoffHints: Array.from(playoffHints).slice(0, 20),
    hasGroups: zoneList.length > 1,
    warnings,
    confidence: {
      teams: conf(teams.length > 0, teamSheets > 0),
      zones: conf(zoneList.length > 0, zoneList.length > 1),
      matches: conf(dedupedMatches.length > 0, matchSheets > 0),
      players: conf(players.length > 0, players.length > 5),
    },
    stats: {
      sheets: sheets.length,
      teamCount: teams.length,
      zoneCount: zoneList.length,
      matchCount: dedupedMatches.length,
      playerCount: players.length,
      duplicateTeams: Array.from(duplicateTeams),
      duplicateMatches,
    },
  };
}
