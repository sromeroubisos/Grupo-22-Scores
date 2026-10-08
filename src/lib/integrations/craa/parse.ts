/**
 * Lectura de las planillas de la CRAA (CSV de Google Sheets). Puro.
 *
 * Dos formas de exportar la misma planilla, las dos en uso:
 *
 * - `gviz/tq?tqx=out:csv` (la D1A): TODAS las celdas entre comillas, y la hora
 *   con un espacio angosto (U+202F) antes de "AM"/"PM".
 * - `pub?output=csv` (las demás): comillas solo donde hace falta ("Sat, Nov 7,
 *   2026" lleva coma).
 *
 * La hora puede venir vacía o "TBA": el partido existe, sin horario.
 */

export interface FilaCraa {
  /** `yyyy-mm-dd`, o null si la celda no se entiende */
  fecha: string | null;
  /** `HH:MM` en 24 h, hora del lugar; null = a confirmar */
  hora: string | null;
  local: string;
  visitante: string;
  puntosLocal: number | null;
  puntosVisitante: number | null;
  /** una celda de tanteo con algo que no es un número ("W", "FF") */
  marcadorRaro: boolean;
  competencia: string;
  /** la fila tal cual, para los reportes */
  texto: string;
}

export interface FilaTablaCraa {
  posicion: number;
  nombre: string;
  pj: number;
  pg: number;
  pp: number;
  pe: number;
  pf: number;
  pc: number;
}

/** CSV con comillas dobles (RFC 4180): comillas escapadas, comas y saltos adentro. */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else entreComillas = false;
      } else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim()));
}

const limpiar = (s: string | undefined) => (s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

const MESES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Sat, Sep 26, 2026" o "9/26/2026" → `2026-09-26`. */
export function leerFecha(crudo: string): string | null {
  const s = limpiar(crudo);
  const dos = (n: number) => String(n).padStart(2, '0');
  const larga = /^(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (larga) {
    const mes = MESES[larga[1].toLowerCase().slice(0, 3)];
    const dia = Number(larga[2]);
    if (!mes || dia < 1 || dia > 31) return null;
    return `${larga[3]}-${dos(mes)}-${dos(dia)}`;
  }
  const corta = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (corta) {
    const [mes, dia] = [Number(corta[1]), Number(corta[2])];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${corta[3]}-${dos(mes)}-${dos(dia)}`;
  }
  return null;
}

/** "11:00 AM" / "7:30 PM" / "12 PM" → `11:00` / `19:30` / `12:00`; "TBA" o vacío → null. */
export function leerHora(crudo: string): string | null {
  const s = limpiar(crudo).toUpperCase().replace(/\./g, '');
  if (s === 'NOON') return '12:00';
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/.exec(s);
  if (!m) {
    const veinticuatro = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (veinticuatro && Number(veinticuatro[1]) < 24) return `${veinticuatro[1].padStart(2, '0')}:${veinticuatro[2]}`;
    return null;
  }
  let h = Number(m[1]);
  if (h < 1 || h > 12) return null;
  if (m[3] === 'AM' && h === 12) h = 0;
  if (m[3] === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

const leerTanteo = (crudo: string | undefined): number | null | 'raro' => {
  const s = limpiar(crudo);
  if (!s) return null;
  return /^\d{1,3}$/.test(s) ? Number(s) : 'raro';
};

/**
 * Las filas de partido de una pestaña. `null` si la cabecera no es la
 * esperada: una planilla con otra forma no se lee como "no hay partidos".
 */
export function parseFixture(csv: string): FilaCraa[] | null {
  const filas = leerCsv(csv);
  if (!filas.length) return null;
  const cabecera = filas[0].map((c) => limpiar(c).toUpperCase());
  const col = (nombre: string) => cabecera.indexOf(nombre);
  const [iFecha, iHora, iLocal, iVisitante, iComp] = [col('DATE'), col('TIME'), col('HOME'), col('AWAY'), col('COMPETITION')];
  if (iFecha < 0 || iLocal < 0 || iVisitante < 0) return null;
  // Las dos columnas de tanteo se llaman igual: van pegadas a cada equipo.
  const [iTanteoLocal, iTanteoVisitante] = [iLocal + 1, iVisitante + 1];

  return filas.slice(1).map((f) => {
    const tl = leerTanteo(f[iTanteoLocal]);
    const tv = leerTanteo(f[iTanteoVisitante]);
    const raro = tl === 'raro' || tv === 'raro';
    const jugado = !raro && tl !== null && tv !== null;
    return {
      fecha: leerFecha(f[iFecha]),
      hora: iHora >= 0 ? leerHora(f[iHora]) : null,
      local: limpiar(f[iLocal]),
      visitante: limpiar(f[iVisitante]),
      puntosLocal: jugado ? (tl as number) : null,
      puntosVisitante: jugado ? (tv as number) : null,
      marcadorRaro: raro,
      competencia: iComp >= 0 ? limpiar(f[iComp]) : '',
      texto: f.map(limpiar).join(' | '),
    };
  });
}

/**
 * La tabla general de la D1A ("D1A Overall"): `# | School | MP | Win | Loss |
 * Tie | For | Against | Differential | Winning %`. `null` si la forma cambió.
 */
export function parseTabla(csv: string): FilaTablaCraa[] | null {
  const filas = leerCsv(csv);
  if (!filas.length) return null;
  const cabecera = filas[0].map((c) => limpiar(c).toUpperCase());
  const col = (nombre: string) => cabecera.indexOf(nombre);
  const idx = { nombre: col('SCHOOL'), pj: col('MP'), pg: col('WIN'), pp: col('LOSS'), pe: col('TIE'), pf: col('FOR'), pc: col('AGAINST') };
  if (Object.values(idx).some((i) => i < 0)) return null;
  const n = (s: string | undefined) => {
    const t = limpiar(s);
    return t === '' ? NaN : Number(t);
  };
  const out: FilaTablaCraa[] = [];
  for (const f of filas.slice(1)) {
    const nombre = limpiar(f[idx.nombre]);
    if (!nombre) continue;
    const fila = {
      posicion: n(f[0]), nombre, pj: n(f[idx.pj]), pg: n(f[idx.pg]), pp: n(f[idx.pp]), pe: n(f[idx.pe]), pf: n(f[idx.pf]), pc: n(f[idx.pc]),
    };
    if ([fila.posicion, fila.pj, fila.pg, fila.pp, fila.pe, fila.pf, fila.pc].some((v) => !Number.isFinite(v))) return null;
    out.push(fila);
  }
  return out;
}
