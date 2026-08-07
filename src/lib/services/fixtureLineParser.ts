/**
 * Parser de líneas del importador de fixture.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El importador leía cada línea SOLA: para que un partido quedara en una
 * jornada, esa línea tenía que decir «Jornada 3» adentro. Pero nadie escribe un
 * fixture así. Se escribe con encabezados:
 *
 *     Fecha 1
 *     19/03/2026 - Jockey Club vs Tala RC - 16:30 - Cancha 1
 *     19/03/2026 - CRAI vs Estudiantes - 18:00 - Cancha 2
 *
 *     Fecha 2
 *     26/03/2026 - Tala RC vs CRAI - 16:30 - Cancha 1
 *
 * Contra ese texto el parser viejo hacía dos cosas mal a la vez: convertía
 * «Fecha 1» en un partido fantasma (club local «Fecha 1», visitante vacío, fila
 * en rojo) y dejaba los cuatro partidos de verdad SIN jornada, porque ninguna de
 * sus líneas la nombra.
 *
 * Por eso este parser tiene ESTADO. Recorre las líneas en orden y se acuerda de
 * en qué sección está: un encabezado de jornada no produce un partido, produce
 * un contexto que heredan las líneas que siguen, hasta el próximo encabezado.
 * Lo mismo con una fecha suelta a modo de título («Sábado 19/03/2026»).
 *
 * Una línea que trae su propia jornada gana sobre la sección: el dato explícito
 * siempre le gana al heredado, y no cambia el contexto de las demás.
 */

export interface ParsedFixtureLine {
  /** 1-based sobre el texto original, para poder señalar la línea en el preview. */
  lineNumber: number;
  raw: string;
  homeTeam: string | null;
  awayTeam: string | null;
  matchDate: string | null;
  matchTime: string | null;
  venue: string | null;
  round: string | null;
  group: string | null;
  score: string | null;
  status: string;
  /** `true` cuando la jornada no estaba en la línea y se heredó del encabezado. */
  roundInherited: boolean;
  /** Ídem para la fecha. */
  dateInherited: boolean;
}

export interface ParsedFixtureText {
  rows: ParsedFixtureLine[];
  /** Jornadas detectadas como encabezado, en orden de aparición. */
  detectedRounds: string[];
  /** Zonas detectadas como encabezado. */
  detectedGroups: string[];
  /** Líneas que no se pudieron interpretar como partido ni como encabezado. */
  skippedLines: Array<{ lineNumber: number; raw: string; reason: string }>;
}

// ─── Piezas reconocibles ───────────────────────────────────────────────────

/** `19/03/2026`, `19-03-26`, `19.03.2026`, `19/03`. */
const DATE_RE = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/;

/** `16:30`, `16.30`, `16h30`, `16 hs`, `16hs`. */
const TIME_RE = /\b(\d{1,2})(?:[:.h]| ?hs?\b)(\d{2})?\b/i;

/** `25-13`, `25 - 13`, `25:13`. Sólo con AMBOS lados numéricos. */
const SCORE_RE = /\b(\d{1,3})\s*[-:]\s*(\d{1,3})\b/;

/** `vs`, `v`, `x` como separador de equipos. */
const VERSUS_RE = /\s+(?:vs?\.?|versus|x)\s+/i;

/**
 * El mismo separador, tolerante a lo que el OCR hace con «vs».
 *
 * Es la palabra más corta y más importante de la línea, y el reconocimiento la
 * arruina todo el tiempo: `US`, `U5`, `V5`, `WS`, `VS.`. Cuando falla, los dos
 * clubes quedan pegados en un solo nombre («Jockey Club US Tala RC») y la fila
 * llega al preview irreparable — medido con una imagen de prueba al 87% de
 * confianza, donde TODAS las líneas cayeron por esto.
 *
 * Va aparte a propósito: sólo se usa cuando sabemos que el texto salió de un
 * OCR. En texto tipeado, «US» puede ser parte de un nombre de club de verdad
 * (Union Sportive), y aflojar el separador ahí partiría clubes al medio.
 */
const VERSUS_OCR_RE = /\s+(?:vs?\.?|versus|x|us|u5|v5|ws|w5)\s+/i;

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

const WEEKDAYS = /\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i;

/**
 * Palabras de encabezado de tabla. Una línea hecha sólo de estas es el título
 * de las columnas de una planilla pegada, no un partido.
 */
const TABLE_HEADER_WORDS = new Set([
  'local', 'visitante', 'hora', 'horario', 'cancha', 'sede', 'estadio', 'fecha',
  'jornada', 'zona', 'grupo', 'equipo', 'equipos', 'partido', 'partidos', 'dia',
  'resultado', 'arbitro', 'categoria', 'division', 'home', 'away', 'time',
  'venue', 'date', 'round',
]);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Saca adornos de encabezado: `--- Fecha 2 ---`, `## Fecha 2`, `**Fecha 2**`, `Fecha 2:`. */
function stripDecoration(line: string): string {
  return line
    .replace(/^[\s\-=*#_·•▪>]+/, '')
    .replace(/[\s\-=*#_·•▪:]+$/, '')
    .trim();
}

// ─── Detección de jornada ──────────────────────────────────────────────────

/**
 * Devuelve la jornada canónica (`Fecha N`) si el texto la nombra.
 *
 * Acepta las dos formas en que se escribe en la práctica:
 *   · con la palabra adelante — `Fecha 3`, `Jornada 3`, `Round 3`, `Fecha N° 3`
 *   · con el ordinal adelante — `3ª fecha`, `3° Fecha`, `3ra fecha`
 *
 * Se normaliza siempre a `Fecha N` porque `buildRoundAliases` en
 * `fixtureImportService` ya hace coincidir esa forma con una jornada llamada
 * «Jornada 3» o «Round 3». Una sola forma adentro, todos los sinónimos afuera.
 */
export function extractRoundLabel(text: string): string | null {
  const normalized = normalize(text);

  const prefixed = normalized.match(
    /\b(?:fecha|jornada|round|matchday|etapa)\s*(?:n|no|nro|numero)?\s*(\d{1,2})\b/,
  );
  if (prefixed) return `Fecha ${Number(prefixed[1])}`;

  const ordinal = normalized.match(
    /\b(\d{1,2})\s*(?:a|ª|o|º|ra|da|ta|va|era)?\s*(?:fecha|jornada|round|matchday)\b/,
  );
  if (ordinal) return `Fecha ${Number(ordinal[1])}`;

  return null;
}

/** `Zona A`, `Grupo B`, `Zona Campeonato`. */
export function extractGroupLabel(text: string): string | null {
  const match = text.match(/\b(?:zona|grupo|pool|group)\s+([A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]{1,20})\b/i);
  if (!match) return null;
  const value = match[1].trim();
  // «Grupo de partidos» y similares no son una zona.
  if (/^(de|del|con|para|los|las)$/i.test(value)) return null;
  return `${/zona/i.test(match[0]) ? 'Zona' : 'Grupo'} ${value.toUpperCase()}`;
}

// ─── Normalización de fecha y hora ─────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Lleva una fecha suelta a ISO `yyyy-mm-dd`.
 *
 * Día primero SIEMPRE: es un gestor rioplatense y `19/03` es 19 de marzo, no el
 * 3 de julio. Sin año, se asume el corriente.
 */
export function normalizeDateToken(text: string, fallbackYear?: number): string | null {
  const numeric = text.match(DATE_RE);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    let year = numeric[3] ? Number(numeric[3]) : (fallbackYear ?? new Date().getFullYear());
    if (year < 100) year += 2000;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // `19 de marzo`, `19 de marzo de 2026`, `19 mar 2026`
  const textual = normalize(text).match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})(?:\s*(?:de\s+)?(\d{4}))?\b/);
  if (textual) {
    const month = MONTHS[textual[2]];
    if (!month) return null;
    const day = Number(textual[1]);
    if (day < 1 || day > 31) return null;
    const year = textual[3] ? Number(textual[3]) : (fallbackYear ?? new Date().getFullYear());
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
}

/**
 * Borra del texto las fechas, y SÓLO las fechas.
 *
 * `16.30` cae dentro de `DATE_RE` —día 16, mes 30— igual que `19.03`. Borrarlo
 * a ciegas, como se hacía, tenía dos consecuencias en un pegado de WhatsApp
 * («Duendes vs Old Resian 16.30 hs»): la hora desaparecía antes de poder
 * leerla, y el `hs` huérfano quedaba pegado al nombre del club.
 *
 * Dos reglas para desambiguar, en orden:
 *   1. Si viene seguido de `hs` o `h`, es una hora. No se toca.
 *   2. Si no, es fecha sólo cuando el mes existe. El mes 30 no existe, así que
 *      `16.30` sobrevive y `normalizeTimeToken` lo lee después.
 */
function stripDates(text: string): string {
  const global = new RegExp(DATE_RE.source, 'g');
  return text.replace(global, (match, _day, _month, _year, offset, full) => {
    const after = String(full).slice(Number(offset) + match.length);
    if (/^\s*hs?\b/i.test(after)) return match;
    return normalizeDateToken(match) ? ' ' : match;
  });
}

/** Lleva una hora suelta a `HH:mm`. `16hs` → `16:00`. */
export function normalizeTimeToken(text: string): string | null {
  const match = text.match(TIME_RE);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

// ─── Clasificación de una línea ────────────────────────────────────────────

type LineKind =
  | { kind: 'blank' }
  | { kind: 'round_header'; round: string; group: string | null; date: string | null }
  | { kind: 'group_header'; group: string }
  | { kind: 'date_header'; date: string }
  | { kind: 'table_header' }
  | { kind: 'match' };

/** Separadores de celda que usan las fuentes reales: tab, pipe o guión suelto. */
const CELL_SPLIT_RE = /\t|\s*\|\s*|\s+-\s+/;

/**
 * ¿Esta celda puede ser el nombre de un club?
 *
 * Se le sacan los datos que tienen forma propia —jornada, zona, fecha, hora— y
 * se mira si queda algo con letras. Sin esto, `Fecha 3 - Zona A` cuenta como
 * dos nombres y una línea que sólo abre una sección se lee como un partido.
 */
function looksLikeTeamCell(cell: string): boolean {
  const rest = cell
    .replace(/\b(?:fecha|jornada|round|matchday|etapa)\s*(?:n|n°|nº|no|nro|numero)?\s*\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:a|ª|o|º|ra|da|ta|va|era)\s*(?:fecha|jornada|round|matchday)\b/gi, ' ')
    .replace(/\b(?:zona|grupo|pool|group)\s+[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]{1,20}\b/gi, ' ')
    .replace(DATE_RE, ' ')
    .replace(TIME_RE, ' ')
    .replace(WEEKDAYS, ' ');
  return /[a-záéíóúñ]{3,}/i.test(rest);
}

function hasTeamPair(line: string, versus: RegExp): boolean {
  if (versus.test(line)) return true;
  const cells = line.split(CELL_SPLIT_RE).map((cell) => cell.trim()).filter(Boolean);
  return cells.filter(looksLikeTeamCell).length >= 2;
}

function classifyLine(line: string, versus: RegExp): LineKind {
  const clean = stripDecoration(line);
  if (!clean) return { kind: 'blank' };

  // El encabezado de columnas se descarta ANTES de buscar equipos: una fila
  // «Local | Visitante | Hora | Cancha» tiene cuatro celdas con letras, así que
  // para cualquier detector de pares parece un partido. Lo que la delata es que
  // TODAS sus palabras son nombres de columna.
  const words = normalize(clean).split(' ').filter(Boolean);
  if (words.length >= 2 && words.every((word) => TABLE_HEADER_WORDS.has(word))) {
    return { kind: 'table_header' };
  }

  const teams = hasTeamPair(clean, versus);
  const round = extractRoundLabel(clean);
  const group = extractGroupLabel(clean);

  // Un encabezado NO nombra equipos. «Fecha 1» es sección; «Fecha 1 - A vs B»
  // es un partido que además dice su jornada.
  if (!teams) {
    if (round) {
      return {
        kind: 'round_header',
        round,
        group,
        date: normalizeDateToken(clean),
      };
    }
    if (group) return { kind: 'group_header', group };

    // Fecha sola, con o sin día de la semana: «Sábado 19/03/2026».
    const date = normalizeDateToken(clean);
    if (date) {
      const withoutDate = clean.replace(DATE_RE, '').replace(WEEKDAYS, '').trim();
      // Si sobra texto con sustancia, no es un título de fecha.
      if (normalize(withoutDate).replace(/\b(de|del)\b/g, '').trim().length <= 3) {
        return { kind: 'date_header', date };
      }
    }
  }

  return { kind: 'match' };
}

// ─── Parseo de una línea de partido ────────────────────────────────────────

interface MatchParts {
  homeTeam: string | null;
  awayTeam: string | null;
  matchDate: string | null;
  matchTime: string | null;
  venue: string | null;
  round: string | null;
  group: string | null;
  score: string | null;
}

/**
 * Rompe una línea de partido en sus partes.
 *
 * Estrategia: primero se sacan los datos que tienen forma reconocible sin
 * ambigüedad —jornada, zona, fecha, hora, resultado—, y recién después se
 * buscan los equipos en LO QUE QUEDA. Al revés no funciona: «Tala RC» tiene un
 * número adentro tan seguido como una cancha, y hacer el reparto por posición
 * de segmento (lo que hacía el parser viejo) se rompe apenas la fuente pone las
 * columnas en otro orden.
 */
function parseMatchLine(line: string, versus: RegExp, fallbackYear?: number): MatchParts {
  const clean = stripDecoration(line);

  const round = extractRoundLabel(clean);
  const group = extractGroupLabel(clean);

  // El resultado se busca ANTES que la hora: `25-13` y `16.30` se parecen
  // demasiado, y un resultado siempre tiene guión o dos puntos entre enteros.
  let score: string | null = null;
  let working = clean;

  // Sólo se lee como resultado si no es la fecha ni la hora que ya vamos a
  // consumir: se prueba contra el texto sin fecha ni hora.
  const withoutDateTime = stripDates(clean).replace(TIME_RE, ' ');
  const scoreMatch = withoutDateTime.match(SCORE_RE);
  if (scoreMatch) {
    score = `${scoreMatch[1]}-${scoreMatch[2]}`;
  }

  const matchDate = normalizeDateToken(clean, fallbackYear);
  const matchTime = normalizeTimeToken(stripDates(clean));

  // Se saca todo lo ya interpretado para dejar los nombres solos. El `hs` que
  // acompaña a la hora se limpia aparte: `TIME_RE` consume el número pero deja
  // el sufijo suelto, y terminaba anexado al club («Old Resian hs»).
  working = stripDates(
    clean
      .replace(/\b(?:fecha|jornada|round|matchday|etapa)\s*(?:n|n°|nº|no|nro|numero)?\s*\d{1,2}\b/gi, ' ')
      .replace(/\b\d{1,2}\s*(?:a|ª|o|º|ra|da|ta|va|era)\s*(?:fecha|jornada|round|matchday)\b/gi, ' ')
      .replace(/\b(?:zona|grupo|pool|group)\s+[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]{1,20}\b/gi, ' '),
  )
    .replace(TIME_RE, ' ')
    .replace(/\bhs?\b/gi, ' ')
    .replace(WEEKDAYS, ' ');

  // El marcador se reemplaza por un separador de celda, NO se borra: en
  // «Jockey Club 25 - 13 Tala RC» es lo único que separa a los dos clubes, y
  // borrándolo los nombres quedaban pegados en uno solo («Jockey Club Tala RC»).
  if (score) working = working.replace(SCORE_RE, ' | ');

  // La sede va detrás de una palabra que la anuncia, o es la última celda.
  let venue: string | null = null;
  const venueMatch = working.match(/\b(?:cancha|sede|estadio|campo|field)\s*:?\s*([^|\t]{1,40})/i);
  if (venueMatch) {
    venue = `${venueMatch[0].trim().replace(/\s*:\s*/, ' ')}`.replace(/\s{2,}/g, ' ').trim();
    working = working.replace(venueMatch[0], ' ');
  }

  // Ahora sí, los equipos.
  const cells = working
    .split(CELL_SPLIT_RE)
    .map((cell) => cell.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  let homeTeam: string | null = null;
  let awayTeam: string | null = null;

  const versusCell = cells.find((cell) => versus.test(cell));
  if (versusCell) {
    const [home, ...rest] = versusCell.split(versus);
    homeTeam = home?.trim() || null;
    awayTeam = rest.join(' ').trim() || null;
    const leftovers = cells.filter((cell) => cell !== versusCell);
    if (!venue && leftovers.length) venue = leftovers[leftovers.length - 1] || null;
  } else {
    const named = cells.filter((cell) => /[a-záéíóúñ]{3,}/i.test(cell));
    homeTeam = named[0] || null;
    awayTeam = named[1] || null;
    if (!venue && named.length > 2) venue = named[named.length - 1];
  }

  const tidy = (value: string | null) => {
    const trimmed = value?.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').trim();
    return trimmed || null;
  };

  return {
    homeTeam: tidy(homeTeam),
    awayTeam: tidy(awayTeam),
    matchDate,
    matchTime,
    venue: tidy(venue),
    round,
    group,
    score,
  };
}

// ─── El recorrido con estado ───────────────────────────────────────────────

/**
 * Convierte un texto de fixture en filas, arrastrando el contexto de sección.
 *
 * @param text     Texto pegado, o el que salió del PDF / del OCR.
 * @param options  `defaultYear` completa las fechas que vienen sin año.
 */
export function parseFixtureText(
  text: string,
  options: { defaultYear?: number; ocrTolerant?: boolean } = {},
): ParsedFixtureText {
  const lines = text.split(/\r?\n/);

  // Un texto reconocido por OCR se lee con el separador tolerante; uno tipeado,
  // con el estricto. La decisión se toma una vez, acá, y no adentro del bucle.
  const versus = options.ocrTolerant ? VERSUS_OCR_RE : VERSUS_RE;

  const rows: ParsedFixtureLine[] = [];
  const skippedLines: ParsedFixtureText['skippedLines'] = [];
  const detectedRounds: string[] = [];
  const detectedGroups: string[] = [];

  let currentRound: string | null = null;
  let currentGroup: string | null = null;
  let currentDate: string | null = null;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const classified = classifyLine(raw, versus);

    switch (classified.kind) {
      case 'blank':
        return;

      case 'round_header':
        currentRound = classified.round;
        if (classified.group) {
          currentGroup = classified.group;
          if (!detectedGroups.includes(classified.group)) detectedGroups.push(classified.group);
        }
        // Un encabezado «Fecha 2 - 26/03/2026» fija también el día de toda la
        // sección: es lo habitual en un fixture por jornadas.
        if (classified.date) currentDate = classified.date;
        if (!detectedRounds.includes(classified.round)) detectedRounds.push(classified.round);
        return;

      case 'group_header':
        currentGroup = classified.group;
        if (!detectedGroups.includes(classified.group)) detectedGroups.push(classified.group);
        return;

      case 'date_header':
        currentDate = classified.date;
        return;

      case 'table_header':
        return;

      case 'match':
      default:
        break;
    }

    const parts = parseMatchLine(raw, versus, options.defaultYear);

    // Sin ningún equipo no hay partido que armar. Se guarda como salteada con
    // su número de línea, así el asistente puede decir QUÉ ignoró en vez de
    // tragárselo en silencio.
    if (!parts.homeTeam && !parts.awayTeam) {
      skippedLines.push({
        lineNumber,
        raw: raw.trim(),
        reason: 'No se reconocieron equipos en la línea.',
      });
      return;
    }

    const roundInherited = !parts.round && Boolean(currentRound);
    const dateInherited = !parts.matchDate && Boolean(currentDate);

    rows.push({
      lineNumber,
      raw: raw.trim(),
      homeTeam: parts.homeTeam,
      awayTeam: parts.awayTeam,
      matchDate: parts.matchDate || currentDate,
      matchTime: parts.matchTime,
      venue: parts.venue,
      round: parts.round || currentRound,
      group: parts.group || currentGroup,
      score: parts.score,
      status: parts.score ? 'final' : 'scheduled',
      roundInherited,
      dateInherited,
    });
  });

  return { rows, detectedRounds, detectedGroups, skippedLines };
}
