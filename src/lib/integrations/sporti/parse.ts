/**
 * Lectura del HTML de SporTI. Puro: entra un string, sale un objeto, sin red.
 *
 * SporTI tiene rutas JSON para el CATÁLOGO (campeonatos de un año, fases de un
 * campeonato) y HTML para todo lo demás:
 *
 *   /api/campeonatos/obterdadosetapacampeonato?idCampeonato=&etapa={fase}-1   tarjetas de partido
 *   /api/campeonatos/obterdadosetapacampeonato?idCampeonato=&etapa={fase}-3   tabla oficial
 *   /{org}/campeonatos/{slug}/sumula/{id}                                     la planilla
 *
 * El sufijo de `etapa` es la VISTA, no la fase: `-1` dibuja los partidos en
 * columnas y `-3` la tabla. Una fase de grupos sirve las dos; una de llaves o
 * un hexagonal solo la `-1` (la `-3` vuelve sin tablas). Por eso el catálogo
 * publica la fase como `1367-3` o `1365-1`: el número es el tipo de fase.
 *
 * ## Las columnas
 *
 * La vista `-1` agrupa las tarjetas en columnas con un título: la letra del
 * grupo ("A", "B", "C") en una fase de grupos, "Rodada 3" en una liga, "SEMI
 * FINAL" / "FINAL" en llaves. La columna viaja con cada partido y el plan
 * decide qué significa según la fase.
 *
 * ## Por qué se confía en la súmula
 *
 * Medido el 2026-10-02 sobre el Super 12 2026 (Primeira y Segunda, 51
 * partidos jugados): en 49 los eventos suman el marcador con try 5, penal try
 * 7, conversión 2, penal y drop 3. Los otros dos son W.O. (24-0 sin eventos o
 * con los eventos al revés). Una súmula que no suma no aporta ni un try.
 */

export interface PartidoSporti {
  /** Título de la columna: letra de grupo, "Rodada 3", "SEMI FINAL"… */
  columna: string | null;
  /** El id de la súmula: existe desde que el partido está en el fixture. */
  sumulaId: string;
  localSlug: string;
  visitanteSlug: string;
  localSigla: string | null;
  visitanteSigla: string | null;
  localNombre: string | null;
  visitanteNombre: string | null;
  /** `null` mientras no hay marcador. */
  puntosLocal: number | null;
  puntosVisitante: number | null;
  /** `dd/mm/yyyy` */
  fecha: string | null;
  /** `HH:MM`, o `null` si la tarjeta no la trae. */
  hora: string | null;
  /** `null` cuando SporTI dice "INDEFINIDO". */
  cancha: string | null;
}

export interface FilaTablaSporti {
  grupo: string | null;
  posicion: number;
  slug: string;
  nombre: string;
  pts: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  pf: number;
  pc: number;
  wo: number;
}

export interface EventoSumula {
  etapa: string;
  minuto: string;
  tipo: string;
  equipo: string;
  atleta: string;
}

export interface SumulaSporti {
  local: string | null;
  visitante: string | null;
  puntosLocal: number | null;
  puntosVisitante: number | null;
  /** La planilla dibuja "W.O." en el lado que no se presentó. */
  wo: boolean;
  eventos: EventoSumula[];
}

export interface ResumenSumula {
  puntosLocal: number;
  puntosVisitante: number;
  triesLocal: number;
  triesVisitante: number;
  /** Lo que suman los eventos; si no da el marcador, los tries no valen. */
  sumaLocal: number;
  sumaVisitante: number;
  wo: boolean;
}

const ENTIDADES: Record<string, string> = { amp: '&', nbsp: ' ', quot: '"', lt: '<', gt: '>', apos: "'" };

export function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

const texto = (html: string) => decodificar(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const numero = (s: string | undefined): number | null => {
  const t = (s ?? '').trim();
  return /^-?\d+$/.test(t) ? Number(t) : null;
};

const RE_CABECERA = /box-pesquisa-matamata-header">\s*<h3>([\s\S]*?)<\/h3>/g;
const MARCA_TARJETA = '<div class="box-pesquisa-matamata-in">';

/** Un lado de la tarjeta: arranca en el link al equipo y termina donde arranca el otro. */
function leerLado(trozo: string) {
  const slug = trozo.slice(0, trozo.indexOf('"'));
  const h3 = /nomeEquipeSegundaFase"[^>]*>([\s\S]*?)<\/h3>/.exec(trozo)?.[1] ?? '';
  const sigla = texto(h3.replace(/<font[\s\S]*?<\/font>/g, '')) || null;
  const puntos = numero(/<font[^>]*>([\s\S]*?)<\/font>/.exec(h3)?.[1]);
  const nombre = /nomeComplementoEquipe">([^<]*)</.exec(trozo)?.[1];
  return { slug: decodeURIComponent(slug), sigla, puntos, nombre: nombre ? texto(nombre) || null : null };
}

/** Las tarjetas de la vista `-1`, en el orden de la página. */
export function parsePartidos(html: string): PartidoSporti[] {
  const marcas: { pos: number; columna?: string }[] = [];
  for (const m of html.matchAll(RE_CABECERA)) marcas.push({ pos: m.index ?? 0, columna: texto(m[1]) });
  for (let i = html.indexOf(MARCA_TARJETA); i >= 0; i = html.indexOf(MARCA_TARJETA, i + 1)) marcas.push({ pos: i });
  marcas.sort((a, b) => a.pos - b.pos);

  const out: PartidoSporti[] = [];
  let columna: string | null = null;
  marcas.forEach((m, k) => {
    if (m.columna !== undefined) { columna = m.columna || null; return; }
    const tarjeta = html.slice(m.pos, marcas[k + 1]?.pos ?? html.length);
    const sumulaId = /\/sumula\/(\d+)/.exec(tarjeta)?.[1];
    // Cada lado arranca en su link al equipo. La imagen repetida del visitante
    // para el celular no lleva <a>, así que son exactamente dos.
    const lados = tarjeta.split(/<a href="[^"]*\/equipe\//).slice(1);
    if (!sumulaId || lados.length < 2) return;
    const local = leerLado(lados[0]);
    const visitante = leerLado(lados[1]);
    const info = texto(/<p class="partida-info">([\s\S]*?)<\/p>/.exec(tarjeta)?.[1] ?? '');
    const fh = /^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{1,2}:\d{2}))?\s*(?:-\s*(.*))?$/.exec(info);
    const cancha = fh?.[3]?.trim() || null;
    out.push({
      columna,
      sumulaId,
      localSlug: local.slug,
      visitanteSlug: visitante.slug,
      localSigla: local.sigla,
      visitanteSigla: visitante.sigla,
      localNombre: local.nombre,
      visitanteNombre: visitante.nombre,
      puntosLocal: local.puntos,
      puntosVisitante: visitante.puntos,
      fecha: fh?.[1] ?? null,
      hora: fh?.[2] ?? null,
      cancha: cancha && cancha.toUpperCase() !== 'INDEFINIDO' ? cancha : null,
    });
  });
  return out;
}

/** "Grupo A" → "A"; cualquier otro título queda como está. */
export const letraDeGrupo = (titulo: string | null): string | null => {
  if (!titulo) return null;
  const m = /^grupo\s+(.+)$/i.exec(titulo.trim());
  return (m ? m[1] : titulo).trim() || null;
};

/** La tabla oficial de la vista `-3`: una tabla por grupo. Las columnas se leen por su título. */
export function parseTabla(html: string): FilaTablaSporti[] {
  const out: FilaTablaSporti[] = [];
  for (const tabla of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const titulos = [...(/<thead[\s\S]*?<\/thead>/.exec(tabla)?.[0] ?? '').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => texto(m[1]));
    if (!titulos.length) continue;
    const col = (nombre: string) => titulos.indexOf(nombre);
    const grupo = letraDeGrupo(titulos[0]);
    for (const fila of tabla.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (celdas.length < titulos.length) continue;
      const slug = /\/equipe\/([^"]+)"/.exec(celdas[0])?.[1];
      if (!slug) continue;
      const v = (nombre: string) => numero(texto(celdas[col(nombre)] ?? '')) ?? 0;
      out.push({
        grupo,
        posicion: numero(texto(/NumRanking">([\s\S]*?)<\/div>/.exec(celdas[0])?.[1] ?? '')) ?? out.length + 1,
        slug: decodeURIComponent(slug),
        nombre: texto(/nomeEquipeTabelaDesktop">([\s\S]*?)<\/span>/.exec(celdas[0])?.[1] ?? ''),
        pts: v('P'), pj: v('J'), pg: v('V'), pe: v('E'), pp: v('D'), pf: v('PP'), pc: v('PC'), wo: v('WO'),
      });
    }
  }
  return out;
}

/** La planilla de un partido. */
export function parseSumula(html: string): SumulaSporti {
  const nombres = [...html.matchAll(/<h2 class="inline Esconder0 nomesEquipes">([\s\S]*?)<\/h2>/g)].map((m) => texto(m[1]));
  const tabla = /id="tabelaEventos"[\s\S]*?<\/table>/.exec(html)?.[0] ?? '';
  const eventos = [...tabla.matchAll(/<tr[^>]*trEventosPartida[\s\S]*?<\/tr>/g)].map((r) => {
    const c = [...r[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => texto(m[1]));
    return { etapa: c[1] ?? '', minuto: c[2] ?? '', tipo: c[3] ?? '', equipo: c[4] ?? '', atleta: c[5] ?? '' };
  });
  return {
    local: nombres[0] ?? null,
    visitante: nombres[1] ?? null,
    puntosLocal: numero(texto(/id="headerGolsCasa"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')),
    puntosVisitante: numero(texto(/id="headerGolsVisitante"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '')),
    wo: /<h1[^>]*>\s*W\.O\.\s*<\/h1>/.test(html),
    eventos,
  };
}

/**
 * Lo que vale cada evento. Se reconocen por el nombre ENTERO, en minúsculas y
 * sin tildes: "Penal Try" no es un "Try" (vale 7 y ya trae la conversión).
 */
const VALOR: Record<string, { puntos: number; try: boolean }> = {
  try: { puntos: 5, try: true },
  'penal try': { puntos: 7, try: true },
  conversao: { puntos: 2, try: false },
  penalidade: { puntos: 3, try: false },
  'drop goal': { puntos: 3, try: false },
};

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Tries y puntos que suman los eventos, por lado. `null` si la planilla no tiene marcador. */
export function resumirSumula(s: SumulaSporti): ResumenSumula | null {
  if (s.puntosLocal === null || s.puntosVisitante === null || !s.local || !s.visitante) return null;
  const local = normalizar(s.local);
  const visitante = normalizar(s.visitante);
  const r: ResumenSumula = {
    puntosLocal: s.puntosLocal, puntosVisitante: s.puntosVisitante,
    triesLocal: 0, triesVisitante: 0, sumaLocal: 0, sumaVisitante: 0, wo: s.wo,
  };
  for (const e of s.eventos) {
    const valor = VALOR[normalizar(e.tipo)];
    if (!valor) continue;
    const equipo = normalizar(e.equipo);
    if (equipo === local) {
      r.sumaLocal += valor.puntos;
      if (valor.try) r.triesLocal++;
    } else if (equipo === visitante) {
      r.sumaVisitante += valor.puntos;
      if (valor.try) r.triesVisitante++;
    }
  }
  return r;
}

/** ¿Los eventos dan el marcador? Si no, la súmula no aporta tries. */
export const sumulaCierra = (r: ResumenSumula) => r.sumaLocal === r.puntosLocal && r.sumaVisitante === r.puntosVisitante;
