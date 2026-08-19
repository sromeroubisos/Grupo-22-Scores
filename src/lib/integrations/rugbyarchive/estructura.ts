/**
 * Constructor de estructura FIEL de una temporada de rugbyarchive: N fases con
 * sus grupos (zonas), rondas, partidos y UNA tabla por grupo — lo que el wizard
 * de import histórico no puede modelar (él aplana a liga+playoff y una tabla).
 *
 * Reglas de asignación de cada partido a su fase, en orden:
 *  1. `turno` == `nomeFase` de una fase → esa fase (y su `tipoFase` decide
 *     liga/playoff: la "Final phase" de 2016 se jugó como liguilla de
 *     cuadrangulares, no como llave — el nombre no alcanza).
 *  2. El partido aparece en la llave (`turniFasiFinali`) de una fase, buscado
 *     por (fecha, par de equipos, resultado) → esa fase y esa ronda.
 *  3. Una sola fase tiene una ronda de llave con ese nombre de turno → esa
 *     (cubre segundas ruedas de semis que la llave lista una sola vez).
 *  Si nada aplica, el partido queda en `sinFase` y el script lo trata como
 *  bloqueo: acá no se adivina.
 *
 * Los grupos solo existen si la fase tiene 2+ tablas (las zonas). Un partido
 * lleva `grupo` si ambos equipos están en la misma zona; las fases cruzadas
 * (la Second phase 2022 se jugó toda interzonal) dejan el partido sin grupo,
 * con las tablas por zona intactas.
 */
import { CLUB_MAP, type RaStagione } from './torneo122.ts';

// Los rótulos de rugbyarchive (cultura=en) son un conjunto chico y conocido.
// Se traducen acá; lo que no esté en la tabla pasa tal cual.
const NOMBRES_ES: Record<string, string> = {
  'First phase': 'Primera fase',
  'Second phase': 'Segunda fase',
  'Regular season': 'Fase regular',
  'Final phase': 'Fase final',
  'Zona Reubicacion': 'Zona Reubicación',
  'Reubicacion': 'Reubicación',
  'Liguilla Clasificacion al Torneo de l\'Interior': 'Liguilla Clasificación al Torneo del Interior',
  'Torneo del Interior qualifiers': 'Clasificación al Torneo del Interior',
  'Torneo del Interior B qualifier': 'Clasificación al Torneo del Interior B',
  'Reclasificatorio - 5th place': 'Reclasificatorio por el 5º puesto',
  'Reclasificatorio - 7th place': 'Reclasificatorio por el 7º puesto',
  'Final Four Posicionamento': 'Final Four Posicionamiento',
  'Quarter finals': 'Cuartos de final',
  'Semifinals': 'Semifinales',
  'Final': 'Final',
  '3rd place final': 'Final por el 3er puesto',
  '5th place final': 'Final por el 5º puesto',
  '7th place final': 'Final por el 7º puesto',
  '9th place final': 'Final por el 9º puesto',
  '11th place final': 'Final por el 11º puesto',
  '5th place semifinals': 'Semifinales por el 5º puesto',
  '5th place quarter finals': 'Cuartos por el 5º puesto',
  'Regional Super 8 Final': 'Final del Regional Super 8',
  // Rótulos del Torneo del Interior y el Nacional de Clubes
  'Group phase': 'Fase de grupos',
  'Tie breaker': 'Desempate',
  'Qualifiers': 'Clasificación',
  'Playout': 'Permanencia',
  'Zona Campeonato': 'Zona Campeonato',
  'Zona Descenso': 'Zona Descenso',
  'Zona Media': 'Zona Media',
  'Repechage': 'Repechaje',
  'Round of 16': 'Octavos de final',
  '5th place': 'Por el 5º puesto',
  '9th place': 'Por el 9º puesto',
  '13th place final': 'Final por el 13º puesto',
  '15th place final': 'Final por el 15º puesto',
  'Semifinal': 'Semifinal',
  'Preliminary round': 'Ronda preliminar',
  'Promotion final': 'Final por el ascenso',
  'Relegation final': 'Final por la permanencia',
  'Group A': 'Zona A',
  'Group B': 'Zona B',
  'Group C': 'Zona C',
  'Group D': 'Zona D',
  'Group 1': 'Zona 1',
  'Group 2': 'Zona 2',
  'Group 3': 'Zona 3',
  'Group 4': 'Zona 4',
  'Group 5': 'Zona 5',
  'Group 6': 'Zona 6',
  'Group 7': 'Zona 7',
  'Group 8': 'Zona 8',
};

export function traducir(rotulo: string): string {
  return NOMBRES_ES[rotulo] || rotulo;
}

/**
 * La ronda "Final" a secas es la que define al campeón. Se conserva EXACTA
 * para poder derivar el subcampeón; las demás finales llevan su puesto en el
 * nombre y no se confunden.
 */
const FECHA_REGEX = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const RESULTADO_REGEX = /^(\d+)-(\d+)$/;

/**
 * dd/mm/yyyy plausible. El archivo viejo de la URBA trae fechas de llave
 * incompletas o basura ("1934", "00/00/1957"): todo lo que no sea una fecha
 * real se descarta antes de tocar `aIso`.
 */
function fechaValida(fecha: string): boolean {
  if (!FECHA_REGEX.test(fecha)) return false;
  const [d, m] = fecha.split('/').map(Number);
  return d >= 1 && d <= 31 && m >= 1 && m <= 12;
}

function aIso(fecha: string): string {
  const [d, m, y] = fecha.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function entero(v: unknown): number {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export interface FilaTabla {
  posicion: number;
  raId: number;
  clubId: string | null;
  nombreRA: string;
  puntos: number;
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  aFavor: number;
  enContra: number;
  diferencia: number;
  bonusOfensivo: number;
  bonusDefensivo: number;
  nota: string | null;
}

export interface GrupoEstructura {
  nombre: string;
  orden: number;
  tabla: FilaTabla[];
  /** ids de rugbyarchive de los clubes del grupo, para asignar partidos */
  miembros: Set<number>;
}

export interface PartidoEstructura {
  iso: string;
  ronda: string;          // clave interna de ronda dentro de la fase
  grupoNombre: string | null;
  homeRaId: number;
  awayRaId: number;
  homeClubId: string | null;
  awayClubId: string | null;
  homeScore: number;
  awayScore: number;
  etiquetaFuente: string; // turno original, para notes
}

export interface RondaEstructura {
  clave: string;
  nombre: string;         // "Fecha 3" o "Semifinales"
  orden: number;
  desde: string;
  hasta: string;
}

export interface FaseEstructura {
  nombre: string;         // ya traducido
  nombreFuente: string;
  tipo: 'league' | 'playoff';
  orden: number;
  conTabla: boolean;
  grupos: GrupoEstructura[];   // vacío si la fase tiene 0 o 1 tabla
  tablaUnica: FilaTabla[];     // la tabla cuando NO hay zonas (grupo único)
  rondas: RondaEstructura[];
  partidos: PartidoEstructura[];
}

export interface EstructuraDeTemporada {
  year: string;
  fases: FaseEstructura[];
  partidos: number;
  descartados: string[];
  sinFase: string[];
  /** Correcciones aplicadas con evidencia (typos de año de la fuente). No frenan. */
  avisos: string[];
  campeonClubId: string | null;
  subcampeonClubId: string | null;
  terceroClubId: string | null;
  coCampeonesClubIds: string[];
  clubesRaIds: Set<number>;
  sinMapa: Array<{ id: number; nome: string }>;
  desde: string | null;
  hasta: string | null;
}

export function construirEstructuraDeTemporada(
  year: string,
  data: RaStagione,
  clubMap: Record<number, string> = CLUB_MAP,
): EstructuraDeTemporada {
  const descartados: string[] = [];
  const sinFase: string[] = [];
  const avisos: string[] = [];

  // Typos de año de la fuente: el NEA 2006 lista fechas "2004" entremezcladas
  // con las rondas de 2006, sin duplicar nada del archivo de 2004 (verificado
  // contra el año vecino). Estas competiciones son de año calendario: una
  // fecha de otro año se corrige al de la temporada y queda avisada.
  const alAnio = (iso: string, rotulo: string): string => {
    if (iso.slice(0, 4) === year) return iso;
    avisos.push(`${rotulo}: fecha ${iso} corregida a ${year}${iso.slice(4)} (typo de año de la fuente)`);
    return `${year}${iso.slice(4)}`;
  };

  // ── Catálogo de fases de la fuente ────────────────────────────────────────
  type FaseFuente = {
    nombreFuente: string;
    tipo: 'league' | 'playoff';
    progressivo: number;
    /** Solo para fases sintéticas: nombre a mostrar cuando `nombreFuente` no existe en la fuente. */
    nombreMostrar?: string;
    tablas: Array<{ nombre: string; filas: FilaTabla[]; miembros: Set<number> }>;
    llavePorClave: Map<string, string>;   // (iso|equipos|resultado) → nomeTurno
    turnosDeLlave: Set<string>;
    /**
     * Partidos de la llave con su detalle completo. En temporadas donde
     * rugbyarchive no publica `partiteGiocate` (el Nacional de Clubes 1993-2002
     * y 2022-2025 solo trae la fase final), la llave ES la fuente de los
     * partidos: los que no aparezcan jugados se sintetizan desde acá.
     */
    llavePartidos: Array<{
      iso: string; turno: string;
      homeId: number; awayId: number;
      homeNome: string; awayNome: string;
      hs: number; as: number;
    }>;
  };
  const fasesFuente: FaseFuente[] = [];

  for (const fa of (data.fasi || [])) {
    const fase: FaseFuente = {
      nombreFuente: (fa.nomeFase || `Fase ${fa.progressivo}`).trim(),
      tipo: fa.tipoFase === 1 ? 'playoff' : 'league',
      progressivo: fa.progressivo,
      tablas: [],
      llavePorClave: new Map(),
      turnosDeLlave: new Set(),
      llavePartidos: [],
    };
    for (const sf of (fa.sottoFasi || [])) {
      for (const g of (sf.gruppi || [])) {
        const filas = (g.classifiche || []).filter((r) => r.squadra);
        if (!filas.length) continue;
        fase.tablas.push({
          nombre: (g.nomeGruppo || fase.nombreFuente).trim(),
          miembros: new Set(filas.map((r) => r.squadra.id)),
          filas: filas.map((r) => ({
            posicion: entero(r.posizione),
            raId: r.squadra.id,
            clubId: clubMap[r.squadra.id] || null,
            nombreRA: r.squadra.nome,
            puntos: entero(r.puntiClassifica),
            jugados: entero(r.partiteGiocate),
            ganados: entero(r.vinte),
            empatados: entero(r.pareggiate),
            perdidos: entero(r.perse),
            aFavor: entero(r.puntiFatti),
            enContra: entero(r.puntiSubiti),
            diferencia: r.differenzaPunti === null || r.differenzaPunti === undefined
              ? entero(r.puntiFatti) - entero(r.puntiSubiti)
              : entero(r.differenzaPunti),
            bonusOfensivo: entero(r.bonusOffensivo),
            bonusDefensivo: entero(r.bonusDifensivo),
            nota: (r.descrizione || '').replace(/\s+/g, ' ').trim() || null,
          })),
        });
      }
      // Las llaves vienen tipadas laxas en RaStagione: se leen a mano.
      const turni = (sf as unknown as { turniFasiFinali?: Array<{
        nomeTurno: string | null;
        partite: Array<{
          primaSquadra: { id: number; nome?: string | null } | null;
          secondaSquadra: { id: number; nome?: string | null } | null;
          partite: Array<{ risultato: string | null; data: string | null }> | null;
        } | null> | null;
      }> }).turniFasiFinali;
      for (const t of turni || []) {
        const nomeTurno = (t.nomeTurno || '').trim();
        if (!nomeTurno) continue;
        fase.turnosDeLlave.add(nomeTurno);
        for (const slot of t.partite || []) {
          if (!slot) continue;
          const a = slot.primaSquadra?.id, b = slot.secondaSquadra?.id;
          if (!a || !b) continue;
          for (const leg of slot.partite || []) {
            if (!leg?.data || !leg.risultato || !fechaValida(leg.data.trim())) continue;
            const par = [a, b].sort((x, y) => x - y).join('v');
            const isoLeg = alAnio(aIso(leg.data.trim()), `${nomeTurno} ${slot.primaSquadra?.nome || a} vs ${slot.secondaSquadra?.nome || b}`);
            fase.llavePorClave.set(`${isoLeg}|${par}|${leg.risultato}`, nomeTurno);
            const m = leg.risultato.trim().match(RESULTADO_REGEX);
            if (m && a !== b) {
              fase.llavePartidos.push({
                iso: isoLeg,
                turno: nomeTurno,
                homeId: a,
                awayId: b,
                homeNome: slot.primaSquadra?.nome || String(a),
                awayNome: slot.secondaSquadra?.nome || String(b),
                hs: Number(m[1]),
                as: Number(m[2]),
              });
            }
          }
        }
      }
    }
    fasesFuente.push(fase);
  }
  fasesFuente.sort((a, b) => a.progressivo - b.progressivo);
  const fasePorNombre = new Map(fasesFuente.map((f) => [f.nombreFuente, f]));

  // ── Partidos: filtrar importables y asignar fase/ronda/grupo ──────────────
  type Asignado = { fase: FaseFuente; turnoRonda: string | null; p: PartidoEstructura };
  const asignados: Asignado[] = [];
  const sinTurnoPend: Array<{ rotulo: string; iso: string; homeId: number; awayId: number; hs: number; as: number }> = [];
  const TURNO_ELIMINATORIO_REGEX = /\b(final|finals|semifinal|semifinals|quarter|round of|playout|qualifier)\b/i;
  const sinFaseEliminatoria: Array<{ turno: string; p: PartidoEstructura }> = [];
  // Dedup global de partidos por (fecha | par | puntajes ordenados): ignora la
  // orientación porque la fuente repite partidos con local y visitante
  // invertidos (entre `partiteGiocate` y la llave, y a veces dentro de
  // `partiteGiocate` mismo).
  const claveDedup = (iso: string, a: number, b: number, s1: number, s2: number) =>
    `${iso}|${[a, b].sort((x, y) => x - y).join('v')}|${[s1, s2].sort((x, y) => x - y).join('-')}`;
  const clavesVistas = new Set<string>();

  for (const entrada of (data.partiteGiocate || [])) {
    const pa = entrada.partita;
    if (!pa) continue;
    const turno = (entrada.turno || '').trim();
    const fecha = (pa.dataPartita || '').trim();
    const resultado = (pa.risultato || '').trim();
    const rotulo = `${fecha || 'sin fecha'} ${pa.squadraCasa?.nome || '?'} vs ${pa.squadraTrasferta?.nome || '?'}`;
    if (!fechaValida(fecha)) { descartados.push(`${rotulo}: fecha inválida`); continue; }
    const m = resultado.match(RESULTADO_REGEX);
    if (!m) { descartados.push(`${rotulo}: resultado "${resultado}" no importable`); continue; }
    if (pa.squadraCasa.id === pa.squadraTrasferta.id) { descartados.push(`${rotulo}: mismo club en ambos lados`); continue; }
    if (!turno) {
      // Sin rótulo de fase: se resuelve después, con las fases ya catalogadas.
      sinTurnoPend.push({
        rotulo,
        iso: alAnio(aIso(fecha), rotulo),
        homeId: pa.squadraCasa.id,
        awayId: pa.squadraTrasferta.id,
        hs: Number(m[1]),
        as: Number(m[2]),
      });
      continue;
    }

    const iso = alAnio(aIso(fecha), rotulo);
    const cl = claveDedup(iso, pa.squadraCasa.id, pa.squadraTrasferta.id, Number(m[1]), Number(m[2]));
    if (clavesVistas.has(cl)) { descartados.push(`${rotulo}: repetido en la fuente`); continue; }
    clavesVistas.add(cl);
    const par = [pa.squadraCasa.id, pa.squadraTrasferta.id].sort((x, y) => x - y).join('v');
    const claveLlave = `${iso}|${par}|${resultado}`;

    let fase = fasePorNombre.get(turno) || null;
    let turnoRonda: string | null = null;
    if (!fase) {
      fase = fasesFuente.find((f) => f.llavePorClave.has(claveLlave)) || null;
      if (fase) turnoRonda = fase.llavePorClave.get(claveLlave)!;
    }
    if (!fase) {
      const candidatas = fasesFuente.filter((f) => f.turnosDeLlave.has(turno));
      if (candidatas.length === 1) { fase = candidatas[0]; turnoRonda = turno; }
    }
    if (!fase && TURNO_ELIMINATORIO_REGEX.test(turno)) {
      // El turno declara la etapa (Final, Semifinals…) pero la fuente no
      // catalogó una fase de llave (el Litoral 2000/2001/2015 publica esas
      // finales sueltas). Van a una fase final sintética, marcada como tal.
      sinFaseEliminatoria.push({
        turno,
        p: {
          iso, ronda: '', grupoNombre: null,
          homeRaId: pa.squadraCasa.id, awayRaId: pa.squadraTrasferta.id,
          homeClubId: clubMap[pa.squadraCasa.id] || null,
          awayClubId: clubMap[pa.squadraTrasferta.id] || null,
          homeScore: Number(m[1]), awayScore: Number(m[2]),
          etiquetaFuente: turno,
        },
      });
      continue;
    }
    if (!fase) { sinFase.push(`${rotulo} (turno "${turno}")`); continue; }
    if (fase.tipo === 'playoff' && !turnoRonda) turnoRonda = turno;

    asignados.push({
      fase,
      turnoRonda,
      p: {
        iso,
        ronda: '',            // se completa abajo
        grupoNombre: null,    // idem
        homeRaId: pa.squadraCasa.id,
        awayRaId: pa.squadraTrasferta.id,
        homeClubId: clubMap[pa.squadraCasa.id] || null,
        awayClubId: clubMap[pa.squadraTrasferta.id] || null,
        homeScore: Number(m[1]),
        awayScore: Number(m[2]),
        etiquetaFuente: turno,
      },
    });
  }

  // ── Fase final sintética para llaves sin fase catalogada ──────────────────
  if (sinFaseEliminatoria.length) {
    const faseFinal: FaseFuente = {
      nombreFuente: '(sin fase en la fuente)',
      nombreMostrar: 'Fase final',
      tipo: 'playoff',
      progressivo: 9999,
      tablas: [],
      llavePorClave: new Map(),
      turnosDeLlave: new Set(),
      llavePartidos: [],
    };
    fasesFuente.push(faseFinal);
    for (const s of sinFaseEliminatoria) {
      asignados.push({ fase: faseFinal, turnoRonda: s.turno, p: s.p });
    }
  }

  // ── Partidos que SOLO viven en la llave ───────────────────────────────────
  // El Nacional de Clubes 1993-2002 y 2022-2025 no publica `partiteGiocate`:
  // toda la fase final (octavos → final) está únicamente en `turniFasiFinali`.
  // Se sintetizan los que no hayan entrado ya por la vía normal, contra el
  // dedup global (que ya vio todo lo de `partiteGiocate` y las fases
  // sintéticas).
  for (const a of asignados) {
    clavesVistas.add(claveDedup(a.p.iso, a.p.homeRaId, a.p.awayRaId, a.p.homeScore, a.p.awayScore));
  }
  for (const ff of fasesFuente) {
    for (const lp of ff.llavePartidos) {
      const clave = claveDedup(lp.iso, lp.homeId, lp.awayId, lp.hs, lp.as);
      if (clavesVistas.has(clave)) continue;
      clavesVistas.add(clave);
      asignados.push({
        fase: ff,
        turnoRonda: lp.turno,
        p: {
          iso: lp.iso,
          ronda: '',
          grupoNombre: null,
          homeRaId: lp.homeId,
          awayRaId: lp.awayId,
          homeClubId: clubMap[lp.homeId] || null,
          awayClubId: clubMap[lp.awayId] || null,
          homeScore: lp.hs,
          awayScore: lp.as,
          etiquetaFuente: lp.turno,
        },
      });
    }
  }

  // ── Resolver los partidos sin rótulo de fase ──────────────────────────────
  // Dos vías con evidencia, en orden; lo que no cae en ninguna se descarta:
  //  1. Zona única: exactamente una fase liga tiene una zona con los DOS
  //     equipos → el partido es de esa fase (la Segunda fase del Interior B
  //     2010 vino entera así).
  //  2. Clasificación previa: no hay zona candidata y TODOS los sin-turno son
  //     anteriores al primer partido clasificado → son la eliminatoria de
  //     entrada (el Nacional 2005 la jugó en abril-mayo; la fase regular
  //     arranca en junio). Va como fase sintética, marcada como tal.
  if (sinTurnoPend.length) {
    const ETIQUETA_SIN_ROTULO = '(sin rótulo en la fuente)';
    const armarPartido = (st: typeof sinTurnoPend[number]): PartidoEstructura => ({
      iso: st.iso,
      ronda: '',
      grupoNombre: null,
      homeRaId: st.homeId,
      awayRaId: st.awayId,
      homeClubId: clubMap[st.homeId] || null,
      awayClubId: clubMap[st.awayId] || null,
      homeScore: st.hs,
      awayScore: st.as,
      etiquetaFuente: ETIQUETA_SIN_ROTULO,
    });
    const sinZona: typeof sinTurnoPend = [];
    for (const st of sinTurnoPend) {
      // Si la llave ya sintetizó este partido (misma fecha, par y resultado),
      // el renglón sin turno es un duplicado y no suma nada.
      const clave = claveDedup(st.iso, st.homeId, st.awayId, st.hs, st.as);
      if (clavesVistas.has(clave)) continue;
      clavesVistas.add(clave);
      const candidatas = fasesFuente.filter((ff) =>
        ff.tipo === 'league' && ff.tablas.some((t) => t.miembros.has(st.homeId) && t.miembros.has(st.awayId)));
      if (candidatas.length === 1) {
        asignados.push({ fase: candidatas[0], turnoRonda: null, p: armarPartido(st) });
      } else {
        sinZona.push(st);
      }
    }
    if (sinZona.length) {
      const primeraClasificada = asignados.map((a) => a.p.iso).sort()[0] || null;
      if (primeraClasificada && sinZona.every((st) => st.iso < primeraClasificada)) {
        const previa: FaseFuente = {
          nombreFuente: ETIQUETA_SIN_ROTULO,
          nombreMostrar: 'Clasificación previa',
          tipo: 'league',
          progressivo: -1,
          tablas: [],
          llavePorClave: new Map(),
          turnosDeLlave: new Set(),
          llavePartidos: [],
        };
        fasesFuente.unshift(previa);
        for (const st of sinZona) asignados.push({ fase: previa, turnoRonda: null, p: armarPartido(st) });
      } else {
        for (const st of sinZona) descartados.push(`${st.rotulo}: sin turno`);
      }
    }
  }

  // ── Armar cada fase: grupos, rondas, partidos ─────────────────────────────
  const fases: FaseEstructura[] = [];
  let orden = 0;
  for (const ff of fasesFuente) {
    const propios = asignados.filter((a) => a.fase === ff);
    if (!propios.length && !ff.tablas.length) continue;
    orden += 1;

    const conZonas = ff.tablas.length >= 2;
    const grupos: GrupoEstructura[] = conZonas
      ? ff.tablas.map((t, i) => ({ nombre: traducir(t.nombre), orden: i + 1, tabla: t.filas, miembros: t.miembros }))
      : [];

    const rondas: RondaEstructura[] = [];
    if (ff.tipo === 'league') {
      const fechas = Array.from(new Set(propios.map((a) => a.p.iso))).sort();
      fechas.forEach((f, i) => rondas.push({ clave: f, nombre: `Fecha ${i + 1}`, orden: i + 1, desde: f, hasta: f }));
      for (const a of propios) a.p.ronda = a.p.iso;
    } else {
      const porTurno = new Map<string, { desde: string; hasta: string }>();
      for (const a of propios) {
        const t = a.turnoRonda || a.p.etiquetaFuente;
        const actual = porTurno.get(t);
        porTurno.set(t, {
          desde: actual && actual.desde < a.p.iso ? actual.desde : a.p.iso,
          hasta: actual && actual.hasta > a.p.iso ? actual.hasta : a.p.iso,
        });
        a.p.ronda = t;
      }
      Array.from(porTurno.entries())
        .sort((x, y) => x[1].desde.localeCompare(y[1].desde) || x[0].localeCompare(y[0]))
        .forEach(([t, rango], i) => rondas.push({ clave: t, nombre: traducir(t), orden: i + 1, desde: rango.desde, hasta: rango.hasta }));
    }

    for (const a of propios) {
      if (conZonas) {
        const zona = grupos.find((g) => g.miembros.has(a.p.homeRaId) && g.miembros.has(a.p.awayRaId));
        a.p.grupoNombre = zona ? zona.nombre : null;
      }
    }

    fases.push({
      nombre: ff.nombreMostrar || traducir(ff.nombreFuente),
      nombreFuente: ff.nombreFuente,
      tipo: ff.tipo,
      orden,
      conTabla: ff.tablas.length > 0,
      grupos,
      tablaUnica: !conZonas && ff.tablas.length === 1 ? ff.tablas[0].filas : [],
      rondas,
      partidos: propios.map((a) => a.p),
    });
  }

  // ── Podio: campeón declarado; subcampeón y tercero desde la llave ─────────
  const vincitori = data.vincitori || [];
  const squadreCampeonas = vincitori[0]?.squadre || [];
  const campeonRaId = squadreCampeonas[0]?.id ?? null;
  const campeonClubId = campeonRaId != null ? clubMap[campeonRaId] || null : null;
  const coCampeonesClubIds = squadreCampeonas.slice(1)
    .map((s) => clubMap[s.id])
    .filter((c): c is string => Boolean(c));

  let subcampeonClubId: string | null = null;
  let terceroClubId: string | null = null;
  for (const fase of fases) {
    if (fase.tipo !== 'playoff') continue;
    for (const p of fase.partidos) {
      if (p.ronda !== 'Final') continue;
      const ganador = p.homeScore > p.awayScore ? p.homeRaId : p.awayRaId;
      if (ganador === campeonRaId) {
        subcampeonClubId = (p.homeScore > p.awayScore ? p.awayClubId : p.homeClubId) || null;
        const tercerPuesto = fase.partidos.find((x) => x.ronda === '3rd place final');
        if (tercerPuesto) {
          terceroClubId = (tercerPuesto.homeScore > tercerPuesto.awayScore
            ? tercerPuesto.homeClubId
            : tercerPuesto.awayClubId) || null;
        }
      }
    }
  }

  // ── Clubes y fechas ───────────────────────────────────────────────────────
  const clubesRaIds = new Set<number>();
  const nombresRa = new Map<number, string>();
  for (const f of fases) {
    for (const p of f.partidos) {
      clubesRaIds.add(p.homeRaId); clubesRaIds.add(p.awayRaId);
    }
    for (const fila of [...f.tablaUnica, ...f.grupos.flatMap((g) => g.tabla)]) {
      clubesRaIds.add(fila.raId);
      nombresRa.set(fila.raId, fila.nombreRA);
    }
  }
  if (campeonRaId != null) clubesRaIds.add(campeonRaId);
  for (const s of squadreCampeonas) nombresRa.set(s.id, s.nome);
  for (const e of (data.partiteGiocate || [])) {
    if (e.partita) {
      nombresRa.set(e.partita.squadraCasa.id, e.partita.squadraCasa.nome);
      nombresRa.set(e.partita.squadraTrasferta.id, e.partita.squadraTrasferta.nome);
    }
  }
  for (const ff of fasesFuente) {
    for (const lp of ff.llavePartidos) {
      if (!nombresRa.has(lp.homeId)) nombresRa.set(lp.homeId, lp.homeNome);
      if (!nombresRa.has(lp.awayId)) nombresRa.set(lp.awayId, lp.awayNome);
    }
  }
  const sinMapa = Array.from(clubesRaIds)
    .filter((id) => !clubMap[id])
    .map((id) => ({ id, nome: nombresRa.get(id) || String(id) }));

  const isos = fases.flatMap((f) => f.partidos.map((p) => p.iso)).sort();
  return {
    year,
    fases,
    partidos: fases.reduce((s, f) => s + f.partidos.length, 0),
    descartados,
    sinFase,
    avisos,
    campeonClubId,
    subcampeonClubId,
    terceroClubId,
    coCampeonesClubIds,
    clubesRaIds,
    sinMapa,
    desde: isos[0] || null,
    hasta: isos[isos.length - 1] || null,
  };
}
