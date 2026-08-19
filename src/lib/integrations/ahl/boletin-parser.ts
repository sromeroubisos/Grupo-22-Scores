/**
 * Parser del Boletín Competencia de la AHL (el PDF semanal con la
 * programación). Emite el MISMO `SeccionDeFixture` que el parser de
 * fedhockeycba, así el planificador compartido no distingue federaciones.
 *
 * La forma del documento (tal como la deja `lineasDelPdf`):
 *
 *   CLAUSURA LITORAL "A"                 ← torneo (rige hasta el próximo)
 *   FECHA N°4 | PRIMERA | 15/08/2026     ← fecha, categoría inicial y día
 *   Equipo | Equipo | Arbitro n° 1 | …   ← encabezado de tabla (se saltea)
 *   OLD RESIAN A | vs. | ATL DEL ROSARIO A | RIOS | GERBOTTO | 20.00H-ESTADIO
 *   RESERVA                              ← cambia la categoría, mismo día
 *   SUB 19 / SUB 16 / SUB 14             ← ídem
 *
 * - La categoría se normaliza al código de división del planificador:
 *   PRIMERA → '1' (lo único que alimenta a los torneos hoy), RESERVA → 'RES',
 *   SUB 19 → 'S19', etc.
 * - La hora viaja adentro de Observaciones ("20.00H-ESTADIO", "16.15H",
 *   "DIFERIDO 18.30h"): se levanta de ahí, con punto o dos puntos.
 * - Un partido con "REPROGRAMADO"/"RECUPERO" en observaciones se descarta
 *   (va a `ignoradas`): su día real no es el del bloque, y escribirlo con la
 *   fecha equivocada es peor que esperarlo en el próximo boletín.
 */
import { SEPARADOR_DE_CELDA } from '../fedhockeycba/pdf-text.ts';
import { slugDeTorneo } from './nombres.ts';
import type { SeccionDeFixture } from '../fedhockeycba/fixture-parser.ts';

const RE_TORNEO = /^(CLAUSURA|APERTURA|TORNEO|CUARTA|MAMIS|SUB\s?12)/i;
const RE_FECHA = /FECHA\s*N\s*[°º]?\s*(\d+)/i;
const RE_DIA = /(\d{2})\/(\d{2})\/(\d{4})/;
const RE_HORA = /(\d{1,2})[.:](\d{2})\s*H/i;
const RE_POSPUESTO = /REPROGRAMAD|RECUPERO|SUSPENDID/i;

const CATEGORIAS: Record<string, string> = {
  'PRIMERA': '1',
  'RESERVA': 'RES',
  'SUB 19': 'S19',
  'SUB 16': 'S16',
  'SUB 14': 'S14',
  'SUB 12': 'S12',
};

function categoriaDe(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/\s+/g, ' ').trim();
  return CATEGORIAS[limpio] ?? null;
}

export function parseBoletinCompetencia(lineas: string[]): { secciones: SeccionDeFixture[]; ignoradas: string[] } {
  const secciones: SeccionDeFixture[] = [];
  const ignoradas: string[] = [];

  let torneo: string | null = null;
  let seccion: SeccionDeFixture | null = null;
  let division: string | null = null;

  for (const linea of lineas) {
    const celdas = linea.split(SEPARADOR_DE_CELDA).map((c) => c.trim()).filter((c) => c !== '');
    if (!celdas.length) continue;
    const plana = celdas.join(' ').replace(/\s+/g, ' ').trim();

    // ── encabezado de FECHA: abre una sección nueva del torneo vigente ────
    const conFecha = plana.match(RE_FECHA);
    if (conFecha && torneo) {
      const conDia = plana.match(RE_DIA);
      const dia = conDia ? `${conDia[3]}-${conDia[2]}-${conDia[1]}` : null;
      if (!dia) { ignoradas.push(plana); continue; }
      seccion = {
        torneo,
        slug: slugDeTorneo(torneo),
        fase: null,
        fechaNro: Number(conFecha[1]),
        dia,
        partidos: [],
      };
      secciones.push(seccion);
      division = celdas.map(categoriaDe).find((c) => c !== null) ?? '1';
      continue;
    }

    // ── fila de partido: la celda "vs." parte local de visitante ──────────
    const vs = celdas.findIndex((c) => /^vs\.?$/i.test(c));
    if (vs > 0 && seccion && division && celdas.length > vs + 1) {
      const resto = celdas.slice(vs + 2);
      if (resto.some((c) => RE_POSPUESTO.test(c))) { ignoradas.push(plana); continue; }
      const conHora = resto.map((c) => c.match(RE_HORA)).find(Boolean);
      seccion.partidos.push({
        division,
        local: celdas.slice(0, vs).join(' '),
        visitante: celdas[vs + 1],
        hora: conHora ? `${conHora[1].padStart(2, '0')}:${conHora[2]}` : null,
        cancha: null,
        arbitros: resto.filter((c) => !RE_HORA.test(c)),
      });
      continue;
    }

    // ── cambio de categoría dentro de la misma fecha ──────────────────────
    const categoria = categoriaDe(plana);
    if (categoria) { division = categoria; continue; }

    // ── encabezado de torneo ───────────────────────────────────────────────
    if (RE_TORNEO.test(plana) && !RE_DIA.test(plana)) {
      torneo = plana;
      seccion = null;
      division = null;
      continue;
    }

    // encabezados de tabla, membrete, notas
    if (!/^Equipo\b/i.test(plana)) ignoradas.push(plana);
  }

  return { secciones, ignoradas };
}
