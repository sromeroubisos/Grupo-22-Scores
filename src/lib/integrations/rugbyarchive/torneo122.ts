/**
 * Adaptador del Torneo Cordobés / Región Centro (competición 122 de
 * rugbyarchive.net) al import histórico de temporadas de G22.
 *
 * La estrategia es NO tocar `HistoricalTournamentImportService`: este módulo
 * convierte el JSON de rugbyarchive al MISMO texto que el wizard acepta pegado
 * (`Match Schedule` + tabla `Pos. ...`), y el servicio hace el resto —
 * participantes, fases, jornadas, partidos, tabla, campeón, aliases, rollback.
 *
 * Dos límites conocidos de ese formato, aceptados a propósito:
 *  - El wizard modela DOS fases (liga + playoffs). Las zonas y liguillas entran
 *    como rondas de la fase liga con su etiqueta original en `notes`.
 *  - Persiste UNA tabla de posiciones por temporada: acá se elige la más
 *    representativa (la de más equipos; a igualdad, la fase más temprana).
 */

export const RA_COMP_ID = 122;

/** Réplica exacta de `normalizeKey` del servicio (es privado). Si aquel cambia, esto también. */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Mapeo club de rugbyarchive → `clubs.id` de G22. Es la fuente de los
 * `overrides` que se le pasan al wizard: con esto no depende del fuzzy matching.
 *
 * Ojo con tres decisiones editoriales (verificadas contra la ficha del club en
 * rugbyarchive — `localita` y unión):
 *  - 1379 "Los Charabones" (San Francisco, 1987) se mapea al San Francisco R.C.
 *    actual: mismo deporte, misma ciudad chica. REVISABLE.
 *  - 1387 "Los Zorros" (Río Tercero) se mapea a Río Tercero R.C. por el mismo
 *    criterio. REVISABLE.
 *  - 1346 "Cordoba R.C." (campeón 1937-38) NO es el Córdoba Rugby actual (1343):
 *    rugbyarchive los tiene como entidades distintas, así que acá también.
 */
export const CLUB_MAP: Record<number, string> = {
  1204: 'san-martin-de-villa-maria',
  1226: 'cordoba-athletic-club',
  1227: 'jockey-club-cordoba',
  1245: 'club-la-tablada',
  1263: 'tala-rugby-club',
  1278: 'club-palermo-bajo',
  1287: 'jockey-club-de-villa-maria',
  1293: 'club-universitario-de-cordoba',
  1299: 'club-social-la-rioja',
  1340: 'uru-cure-rugby-club',
  1341: 'los-cuervos-r-c',
  1342: 'carlos-paz-rugby-club',
  1343: 'cordoba-rugby-club',
  1344: 'escuela-de-aviacion',
  1345: 'gimnasia-y-esgrima-cordoba',
  1346: 'cordoba-r-c',
  1347: 'universidad-nacional-de-cordoba',
  1379: 'san-francisco-r-c',
  1380: 'universidad-tecnologica-cordoba',
  1381: 'universidad-catolica-de-cordoba',
  1382: 'jockey-club-rio-cuarto',
  1383: 'villa-general-belgrano-r-c',
  1384: 'alta-gracia-r-c',
  1385: 'conas-r-c',
  1386: 'los-hurones',
  1387: 'rio-tercero-r-c',
  1865: 'fusion-r-c',
  1866: 'aero-club-rio-iv',
  5967: 'santa-rosa-r-c-c',
  5976: 'catamarca-r-c',
  5977: 'los-chelcos',
};

const UNION_CORDOBESA = '0c515ac1-af49-4699-b3c5-7273bc424357';

/**
 * Clubes que el catálogo de G22 todavía no tiene. Se crean tal cual antes de
 * importar (la fila calca la forma de un club existente de la misma unión).
 * Tres son clubes desaparecidos que solo aparecen como campeones históricos.
 */
export const CLUBES_NUEVOS: Array<Record<string, unknown>> = [
  { id: 'escuela-de-aviacion', name: 'Escuela de Aviación', short_name: 'Escuela de Aviación', city: 'Córdoba' },
  { id: 'gimnasia-y-esgrima-cordoba', name: 'Gimnasia y Esgrima de Córdoba', short_name: 'GyE Córdoba', city: 'Córdoba' },
  { id: 'cordoba-r-c', name: 'Córdoba R.C.', short_name: 'Córdoba R.C.', city: 'Córdoba' },
  { id: 'universidad-nacional-de-cordoba', name: 'Universidad Nacional de Córdoba', short_name: 'U.N.C.', city: 'Córdoba' },
  { id: 'universidad-tecnologica-cordoba', name: 'Universidad Tecnológica Córdoba', short_name: 'UTN Córdoba', city: 'Córdoba' },
  { id: 'universidad-catolica-de-cordoba', name: 'Universidad Católica de Córdoba', short_name: 'U.C.C.', city: 'Córdoba' },
  { id: 'jockey-club-rio-cuarto', name: 'Jockey Club Río Cuarto', short_name: 'Jockey Río Cuarto', city: 'Río Cuarto' },
  { id: 'villa-general-belgrano-r-c', name: 'Villa General Belgrano', short_name: 'V. Gral. Belgrano', city: 'Villa General Belgrano' },
  { id: 'conas-r-c', name: 'Conas', short_name: 'Conas', city: 'La Falda' },
  { id: 'fusion-r-c', name: 'Fusión R.C.', short_name: 'Fusión', city: 'Oliva' },
].map((c) => ({
  ...c,
  slug: c.id,
  union_id: UNION_CORDOBESA,
  region: 'Córdoba',
  country: 'ARG',
  sport: 'rugby',
  sport_id: 'rugby',
  entity_type: 'club',
  status: 'active',
  visibility: 'visible',
  is_visible: true,
  categories: [],
}));

/** Nombre por época a partir del `nomeCompetizione` de cada temporada. */
const ERAS: Record<string, string> = {
  'Argentina - Torneo de Cordoba': 'Torneo de Córdoba',
  'Argentina - Torneo Cordobes': 'Torneo Cordobés',
  'Argentina - Cordoba - Copa Kadicard': 'Copa Kadicard',
  'Argentina - Cordoba - Copa Citi': 'Copa Citi',
  'Argentina - Copa Glooday': 'Copa Glooday',
  'Argentina - Torneo Region Centro': 'Torneo Región Centro',
};

export function eraDeNombre(nomeCompetizione: string): string {
  return ERAS[nomeCompetizione]
    || nomeCompetizione.replace(/^Argentina - /, '').replace(/^Cordoba - /, '');
}

/**
 * Rondas eliminatorias → fase playoff del wizard, con su etiqueta tal cual
 * (así "Final" sigue siendo exactamente "Final" y el podio se infiere solo).
 * Todo lo demás (zonas, liguillas, Super 8) → fase liga, con el prefijo
 * "Regular season - " que el wizard usa para clasificarla.
 */
const KNOCKOUT_REGEX = /\b(final|finals|semifinal|semifinals|quarter|playout|qualifier|qualifiers)\b/i;

function esEliminatoria(turno: string): boolean {
  return KNOCKOUT_REGEX.test(turno);
}

function etiquetaDeTurno(turno: string): string {
  if (esEliminatoria(turno)) return turno;
  const norm = normalizeKey(turno);
  if (norm.includes('regular season') || norm.includes('league')) return turno;
  return `Regular season - ${turno}`;
}

// ── Tipos mínimos del JSON de rugbyarchive ──────────────────────────────────

interface RaSquadra { id: number; nome: string }
interface RaPartita {
  dataPartita: string | null;
  squadraCasa: RaSquadra;
  squadraTrasferta: RaSquadra;
  risultato: string | null;
}
interface RaClassificaRow {
  posizione: string | null;
  squadra: RaSquadra;
  partiteGiocate: number | null;
  vinte: number | null;
  pareggiate: number | null;
  perse: number | null;
  puntiFatti: number | null;
  puntiSubiti: number | null;
  differenzaPunti: number | null;
  bonusOffensivo: number | null;
  bonusDifensivo: number | null;
  puntiClassifica: string | null;
  descrizione: string | null;
}
interface RaGruppo { gruppo: number; nomeGruppo: string | null; classifiche: RaClassificaRow[] | null }
interface RaSottoFase { gruppi: RaGruppo[] | null }
interface RaFase { progressivo: number; nomeFase: string | null; tipoFase: number; sottoFasi: RaSottoFase[] | null }
export interface RaStagione {
  competizioneStagione: { idCompetizione: number; nomeCompetizione: string };
  vincitori: Array<{ competizione: string | null; squadre: RaSquadra[] | null }> | null;
  partiteGiocate: Array<{ data: string | null; turno: string | null; partita: RaPartita | null }> | null;
  fasi: RaFase[] | null;
}

// ── Resultado del adaptador ─────────────────────────────────────────────────

export interface PlanDeTemporada {
  year: string;
  eraName: string;
  nombre: string;                       // "Copa Kadicard 2005"
  tipo: 'completa' | 'solo-campeon' | 'vacia';
  rawText: string | null;
  /** Año de la primera fecha: es el `season_code` que el wizard va a detectar. */
  anioDetectado: string | null;
  partidos: number;
  descartados: string[];
  campeonRA: RaSquadra | null;          // lo que dice rugbyarchive
  campeonClubId: string | null;         // mapeado a G22
  /** Co-campeones de un título compartido, ya mapeados (null = sin mapeo). */
  coCampeonesClubIds: Array<string | null>;
  campeonInferido: string | null;       // lo que va a inferir el wizard
  campeonCoincide: boolean;
  clubesRA: RaSquadra[];
  sinMapa: RaSquadra[];
  tabla: { fase: string; filas: number } | null;
  overrides: Record<string, string>;
}

const FECHA_REGEX = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const RESULTADO_REGEX = /^(\d+)-(\d+)$/;

function aIso(fecha: string): string {
  const [d, m, y] = fecha.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function entero(v: unknown): number {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function limpiarNombre(nombre: string): string {
  // El nombre viaja en un formato de texto por líneas: nada de tabs ni saltos,
  // y el separador ` - ` del renglón de partido no puede aparecer adentro.
  return nombre.replace(/\s+/g, ' ').replace(/ - /g, ' – ').trim();
}

export function construirPlanDeTemporada(year: string, data: RaStagione): PlanDeTemporada {
  const eraName = eraDeNombre(data.competizioneStagione.nomeCompetizione);
  const nombre = `${eraName} ${year}`;
  const descartados: string[] = [];

  const vincitori = data.vincitori || [];
  const campeonRA = vincitori.length && vincitori[0].squadre?.length ? vincitori[0].squadre[0] : null;
  // Títulos compartidos: `squadre` trae más de un club (pasó 7 veces, incluida
  // una triple corona en 2011). `champion_club_id` es un solo club, así que los
  // demás van a `settings.co_champions`.
  const coCampeones = (vincitori[0]?.squadre || []).slice(1).map((s) => ({ id: s.id, nome: limpiarNombre(s.nome) }));

  // ── Partidos importables ──────────────────────────────────────────────────
  type Renglon = { iso: string; fecha: string; etiqueta: string; etiquetaOriginal: string; linea: string; home: RaSquadra; away: RaSquadra; hs: number; as: number };
  const renglones: Renglon[] = [];
  for (const entrada of data.partiteGiocate || []) {
    const pa = entrada.partita;
    if (!pa) continue;
    const turno = (entrada.turno || '').trim();
    const fecha = (pa.dataPartita || '').trim();
    const resultado = (pa.risultato || '').trim();
    const rotulo = `${fecha || 'sin fecha'} ${pa.squadraCasa?.nome || '?'} vs ${pa.squadraTrasferta?.nome || '?'}`;
    if (!turno) { descartados.push(`${rotulo}: sin turno`); continue; }
    if (!FECHA_REGEX.test(fecha)) { descartados.push(`${rotulo}: fecha inválida`); continue; }
    const m = resultado.match(RESULTADO_REGEX);
    if (!m) { descartados.push(`${rotulo}: resultado "${resultado}" no importable`); continue; }
    if (pa.squadraCasa.id === pa.squadraTrasferta.id) { descartados.push(`${rotulo}: mismo club en ambos lados`); continue; }
    const home = { id: pa.squadraCasa.id, nome: limpiarNombre(pa.squadraCasa.nome) };
    const away = { id: pa.squadraTrasferta.id, nome: limpiarNombre(pa.squadraTrasferta.nome) };
    renglones.push({
      iso: aIso(fecha),
      fecha,
      etiqueta: etiquetaDeTurno(turno),
      etiquetaOriginal: turno,
      linea: `${home.nome} -  ${away.nome}\t${m[1]}-${m[2]}`,
      home,
      away,
      hs: Number(m[1]),
      as: Number(m[2]),
    });
  }

  // ── Tabla principal: la de más equipos; a igualdad, la fase más temprana ──
  let tablaElegida: { fase: string; filas: RaClassificaRow[]; progressivo: number } | null = null;
  for (const fase of data.fasi || []) {
    for (const sf of fase.sottoFasi || []) {
      for (const g of sf.gruppi || []) {
        const filas = (g.classifiche || []).filter((r) => r.squadra);
        if (!filas.length) continue;
        const mejor = !tablaElegida
          || filas.length > tablaElegida.filas.length
          || (filas.length === tablaElegida.filas.length && fase.progressivo < tablaElegida.progressivo);
        if (mejor) {
          tablaElegida = {
            fase: [fase.nomeFase, g.nomeGruppo].filter(Boolean).join(' — ') || `Fase ${fase.progressivo}`,
            filas,
            progressivo: fase.progressivo,
          };
        }
      }
    }
  }

  // ── Clubes que participan y su mapeo ──────────────────────────────────────
  const clubesVistos = new Map<number, RaSquadra>();
  for (const r of renglones) {
    clubesVistos.set(r.home.id, r.home);
    clubesVistos.set(r.away.id, r.away);
  }
  for (const fila of tablaElegida?.filas || []) {
    if (!clubesVistos.has(fila.squadra.id)) {
      clubesVistos.set(fila.squadra.id, { id: fila.squadra.id, nome: limpiarNombre(fila.squadra.nome) });
    }
  }
  if (campeonRA) {
    clubesVistos.set(campeonRA.id, { id: campeonRA.id, nome: limpiarNombre(campeonRA.nome) });
  }
  for (const co of coCampeones) {
    if (!clubesVistos.has(co.id)) clubesVistos.set(co.id, co);
  }

  const clubesRA = Array.from(clubesVistos.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  const sinMapa = clubesRA.filter((c) => !CLUB_MAP[c.id]);
  const overrides: Record<string, string> = {};
  for (const c of clubesRA) {
    if (CLUB_MAP[c.id]) overrides[normalizeKey(c.nome)] = CLUB_MAP[c.id];
  }

  const campeonClubId = campeonRA ? CLUB_MAP[campeonRA.id] || null : null;

  if (!renglones.length) {
    return {
      year, eraName, nombre,
      tipo: campeonRA ? 'solo-campeon' : 'vacia',
      rawText: null,
      anioDetectado: null,
      partidos: 0,
      descartados,
      campeonRA, campeonClubId,
      coCampeonesClubIds: coCampeones.map((c) => CLUB_MAP[c.id] || null),
      campeonInferido: null,
      campeonCoincide: Boolean(campeonRA && campeonClubId),
      clubesRA, sinMapa,
      tabla: null,
      overrides,
    };
  }

  // ── El texto que el wizard parsea ─────────────────────────────────────────
  // Bloques por (fecha, etiqueta) en orden cronológico; cada bloque es un
  // encabezado `dd/mm/yyyy - Etiqueta` seguido de sus renglones.
  const bloques = new Map<string, { fecha: string; etiqueta: string; lineas: string[] }>();
  const ordenados = [...renglones].sort((a, b) => a.iso.localeCompare(b.iso) || a.etiqueta.localeCompare(b.etiqueta));
  for (const r of ordenados) {
    const clave = `${r.iso}|${r.etiqueta}`;
    if (!bloques.has(clave)) bloques.set(clave, { fecha: r.fecha, etiqueta: r.etiqueta, lineas: [] });
    bloques.get(clave)!.lineas.push(r.linea);
  }

  const partes: string[] = ['Match Schedule'];
  for (const b of bloques.values()) {
    partes.push(`${b.fecha} - ${b.etiqueta}`, ...b.lineas);
  }

  if (tablaElegida) {
    partes.push('Pos.\tTeam\tPts\tPld\tW\tD\tL\tF\tA\tDiff\tTB\tLB');
    for (const fila of tablaElegida.filas) {
      const f = entero(fila.puntiFatti);
      const a = entero(fila.puntiSubiti);
      const diff = fila.differenzaPunti === null || fila.differenzaPunti === undefined ? f - a : entero(fila.differenzaPunti);
      const nota = (fila.descrizione || '').replace(/\s+/g, ' ').trim();
      partes.push([
        entero(fila.posizione),
        limpiarNombre(fila.squadra.nome),
        entero(fila.puntiClassifica),
        entero(fila.partiteGiocate),
        entero(fila.vinte),
        entero(fila.pareggiate),
        entero(fila.perse),
        f, a, diff,
        entero(fila.bonusOffensivo),
        entero(fila.bonusDifensivo),
        nota,
      ].join(' ').trim());
    }
  }

  // ── Qué campeón va a inferir el wizard (réplica de inferPodium) ───────────
  // Ordena como el servicio: fecha ISO y, a igualdad, roundKey.
  const comoElServicio = [...renglones].sort((a, b) => {
    if (a.iso !== b.iso) return a.iso.localeCompare(b.iso);
    const rkA = esEliminatoria(a.etiquetaOriginal) ? `playoff:${a.iso}:${normalizeKey(a.etiqueta)}` : `league:${a.iso}`;
    const rkB = esEliminatoria(b.etiquetaOriginal) ? `playoff:${b.iso}:${normalizeKey(b.etiqueta)}` : `league:${b.iso}`;
    return rkA.localeCompare(rkB);
  });
  const partidoFinal = comoElServicio.find((r) => normalizeKey(r.etiqueta) === 'final');
  const campeonInferido = partidoFinal
    ? (partidoFinal.hs > partidoFinal.as ? partidoFinal.home.nome : partidoFinal.away.nome)
    : (tablaElegida ? limpiarNombre(tablaElegida.filas[0]?.squadra.nome || '') || null : null);

  const campeonCoincide = Boolean(
    campeonRA && campeonInferido && normalizeKey(campeonInferido) === normalizeKey(limpiarNombre(campeonRA.nome))
  );

  return {
    year, eraName, nombre,
    tipo: 'completa',
    rawText: partes.join('\n'),
    anioDetectado: ordenados[0]?.iso.slice(0, 4) || null,
    partidos: renglones.length,
    descartados,
    campeonRA, campeonClubId,
    coCampeonesClubIds: coCampeones.map((c) => CLUB_MAP[c.id] || null),
    campeonInferido,
    campeonCoincide,
    clubesRA, sinMapa,
    tabla: tablaElegida ? { fase: tablaElegida.fase, filas: tablaElegida.filas.length } : null,
    overrides,
  };
}
