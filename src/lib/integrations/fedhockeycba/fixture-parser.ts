/**
 * Parser del fixture semanal de la federación (el PDF "FIXTURE Nº NN").
 *
 * Entrada: las líneas que devuelve `lineasDelPdf` (celdas unidas con " | ").
 * Es PURO: nada de red, reloj ni entorno; se prueba con el texto real de un
 * fixture guardado en `__fixtures__/`.
 *
 * La forma del documento, tal como la publica la federación:
 *
 *   TORNEO OFICIAL DAMAS 'D' 2026 - Fase Campeonato - 8º FECHA - 14/08/2026
 *   Cancha: JOCKEY CLUB
 *   S14 | JOCKEY CLUB "BLANCO" | LA TABLADA "AZUL" | 18:45 | FREDES G | BERRONDO M
 *
 * - El encabezado siempre termina en la fecha del día; la fase y el número de
 *   fecha son opcionales (la Copa lleva "Fase 2" y ningún número).
 * - "Cancha: X" rige para las filas que le siguen, hasta la próxima cancha o
 *   el próximo encabezado.
 * - Una fila arranca con la división (1º, INT, S14…). La hora puede faltar
 *   (aparece "ACOMPAÑANTES" en su lugar) y el tercer árbitro puede caer solo
 *   en la línea siguiente.
 *
 * Lo que no se entiende no se tira en silencio: sale en `ignoradas`, y el
 * route decide si es ruido esperado (el membrete) o algo para revisar.
 */
import { SEPARADOR_DE_CELDA } from './pdf-text.ts';
import { slugDeTorneo } from './nombres.ts';

export interface PartidoDeFixture {
  /** normalizada: '1', '8', 'INT', 'S14'… (sin el ordinal º/°/ª) */
  division: string;
  local: string;
  visitante: string;
  /** HH:MM en hora de Córdoba, o null cuando el PDF no la trae */
  hora: string | null;
  cancha: string | null;
  arbitros: string[];
}

export interface SeccionDeFixture {
  /** el encabezado sin fase ni fecha: "TORNEO OFICIAL DAMAS 'D' 2026" */
  torneo: string;
  /** `slugDeTorneo(torneo)`: la mitad derecha del `external_id` del torneo */
  slug: string;
  fase: string | null;
  fechaNro: number | null;
  /** día de la jornada, ISO yyyy-mm-dd */
  dia: string;
  partidos: PartidoDeFixture[];
}

const RE_DIVISION = /^(?:(\d{1,2})\s*[ºª°]|(INT|PRE|RES)|(S\d{2}))$/i;
const RE_HORA = /^\d{1,2}:\d{2}$/;
const RE_FECHA_FINAL = /(\d{2})\/(\d{2})\/(\d{4})\s*$/;
/** Apellido y una inicial o dos, todo en mayúsculas: "FERREIROS G", "RODRIGUEZ JP". */
const RE_ARBITRO_SUELTO = /^[A-ZÁÉÍÓÚÑÜ]{2,}(?:\s+[A-ZÁÉÍÓÚÑÜ]{2,})?\s+[A-Z]{1,3}$/;

function divisionNormalizada(celda: string): string | null {
  const m = celda.trim().match(RE_DIVISION);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3]).toUpperCase();
}

/**
 * Una celda con comillas sin cerrar es una celda que el PDF partió en dos
 * columnas: `TALA RC "BLANCO Y | NEGRO"` es UN equipo, no dos. Se pega con
 * la siguiente hasta que las comillas balancean; sin esto, el visitante de
 * esa fila sería `NEGRO"` y el equipo real no existiría.
 */
function repararCeldasPartidas(celdas: string[]): string[] {
  const out: string[] = [];
  for (const c of celdas) {
    const anterior = out[out.length - 1];
    const abierta = anterior !== undefined && anterior.split('"').length % 2 === 0;
    if (abierta) out[out.length - 1] = `${anterior} ${c}`;
    else out.push(c);
  }
  return out;
}

export function parseFixture(lineas: string[]): { secciones: SeccionDeFixture[]; ignoradas: string[] } {
  const secciones: SeccionDeFixture[] = [];
  const ignoradas: string[] = [];
  let seccion: SeccionDeFixture | null = null;
  let cancha: string | null = null;

  for (const linea of lineas) {
    const celdas = repararCeldasPartidas(linea.split(SEPARADOR_DE_CELDA).map((c) => c.trim()).filter((c) => c !== ''));
    if (!celdas.length) continue;
    const plana = celdas.join(' ').replace(/\s+/g, ' ').trim();

    // ── encabezado de sección: termina en la fecha del día ──────────────
    const conFecha = plana.match(RE_FECHA_FINAL);
    if (conFecha && divisionNormalizada(celdas[0]) === null && !plana.startsWith('Cancha:')) {
      const [, dd, mm, yyyy] = conFecha;
      let resto = plana.slice(0, conFecha.index).replace(/[-\s]+$/, '');

      let fechaNro: number | null = null;
      const conNro = resto.match(/(\d{1,2})\s*[ºª°]\s*FECHA\s*$/i);
      if (conNro) {
        fechaNro = Number(conNro[1]);
        resto = resto.slice(0, conNro.index).replace(/[-\s]+$/, '');
      }

      let fase: string | null = null;
      const conFase = resto.match(/\s-\s*(Fase\s+.+)$/i);
      if (conFase) {
        fase = conFase[1].trim();
        resto = resto.slice(0, conFase.index).replace(/[-\s]+$/, '');
      }

      seccion = { torneo: resto, slug: slugDeTorneo(resto), fase, fechaNro, dia: `${yyyy}-${mm}-${dd}`, partidos: [] };
      secciones.push(seccion);
      cancha = null;
      continue;
    }

    // ── cancha: rige hasta la próxima cancha o el próximo encabezado ─────
    const conCancha = plana.match(/^Cancha:\s*(.+)$/i);
    if (conCancha) { cancha = conCancha[1].trim().replace(/\.+$/, ''); continue; }

    // ── fila de partido: división | local | visitante | hora? | árbitros ─
    const division = divisionNormalizada(celdas[0]);
    if (division !== null && seccion && celdas.length >= 3) {
      const resto = celdas.slice(3);
      const hora = resto.find((c) => RE_HORA.test(c)) ?? null;
      const arbitros = resto.filter((c) => !RE_HORA.test(c) && !/^ACOMPAÑANTES$/i.test(c));
      seccion.partidos.push({ division, local: celdas[1], visitante: celdas[2], hora, cancha, arbitros });
      continue;
    }

    // ── tercer árbitro que cayó solo en la línea de abajo ────────────────
    const ultimo = seccion?.partidos[seccion.partidos.length - 1];
    if (ultimo && celdas.length === 1 && RE_ARBITRO_SUELTO.test(plana)) {
      ultimo.arbitros.push(plana);
      continue;
    }

    ignoradas.push(plana);
  }

  return { secciones, ignoradas };
}
