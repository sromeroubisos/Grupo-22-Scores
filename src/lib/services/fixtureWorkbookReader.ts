/**
 * Lee cualquier planilla a grillas de celdas crudas, una por hoja.
 *
 * Es la puerta de entrada de `fixtureSheetDetection`: todo lo que llega acá
 * sale como `SheetGrid` (números de serie para las fechas, fracciones para las
 * horas, texto para lo demás), venga de un Excel moderno, uno de 1997, un
 * LibreOffice, un Numbers de Mac o un CSV exportado con la configuración
 * regional de un Excel en castellano.
 *
 * Lo que resuelve, en orden:
 *   - formatos: .xlsx .xlsm .xlsb .xls .xlt(x/m) .ods .fods .numbers y los
 *     delimitados .csv .tsv .txt .tab;
 *   - codificación de los delimitados: UTF-8 si es válido, si no Windows-1252
 *     (lo que guarda un Excel en castellano: «Córdoba» llegaba como «C�rdoba»);
 *   - separador: `,` `;` tab o `|`, por conteo — el Excel rioplatense exporta
 *     con `;` porque la coma es el separador decimal;
 *   - hojas ocultas: se saltean (suelen ser listas auxiliares o borradores),
 *     salvo que estén todas ocultas;
 *   - celdas combinadas: el valor baja a todas las filas del rango.
 */
import * as XLSX from 'xlsx';
import { applyMerges, type MergeRange, type SheetGrid } from './fixtureSheetDetection.ts';

export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.xlt', '.xltx', '.xltm', '.ods', '.fods', '.numbers'];
export const DELIMITED_EXTENSIONS = ['.csv', '.tsv', '.txt', '.tab', '.dsv'];

export type WorkbookKind = 'spreadsheet' | 'delimited';

export interface ReadWorkbookResult {
  sheets: Array<{ name: string; grid: SheetGrid }>;
  hiddenSheets: string[];
  /** Sólo en los delimitados. */
  encoding: 'utf-8' | 'windows-1252' | null;
  delimiter: string | null;
  /** Motivo legible cuando el archivo no se pudo abrir. */
  error: string | null;
}

/** UTF-8 si los bytes lo son; si no, Windows-1252. Sin BOM. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

const DELIMITERS = [';', '\t', ',', '|'];

/**
 * El separador que se repite con la misma cantidad en más renglones. Contar en
 * un solo renglón engaña: «Tala R.C., Córdoba» tiene una coma y ningún `;`.
 */
export function guessDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 30);
  let best = ',';
  let bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => line.split(delimiter).length - 1).filter((count) => count > 0);
    if (!counts.length) continue;
    // Renglones con la cantidad más frecuente: una tabla es pareja.
    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    const consistent = Math.max(...frequency.values());
    const score = consistent * 10 + counts.length;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function sheetToGrid(sheet: XLSX.WorkSheet): SheetGrid {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) as SheetGrid;
  const ref = sheet['!ref'];
  const merges = sheet['!merges'] as MergeRange[] | undefined;
  if (!ref || !merges?.length) return grid;
  // `sheet_to_json` arranca en la esquina del rango usado, no en A1: las
  // combinaciones se corren al mismo origen.
  const origin = XLSX.utils.decode_range(ref).s;
  return applyMerges(grid, merges.map((merge) => ({
    s: { r: merge.s.r - origin.r, c: merge.s.c - origin.c },
    e: { r: merge.e.r - origin.r, c: merge.e.c - origin.c },
  })));
}

export function readWorkbook(bytes: Uint8Array, kind: WorkbookKind): ReadWorkbookResult {
  let workbook: XLSX.WorkBook;
  let encoding: ReadWorkbookResult['encoding'] = null;
  let delimiter: string | null = null;

  try {
    if (kind === 'delimited') {
      const decoded = decodeText(bytes);
      encoding = decoded.encoding;
      delimiter = guessDelimiter(decoded.text);
      // `raw`: todo como texto. Sin eso SheetJS lee «19/03/2026» a la
      // americana y «16:30» como un número.
      workbook = XLSX.read(decoded.text, { type: 'string', raw: true, FS: delimiter });
    } else {
      workbook = XLSX.read(bytes, { type: 'array' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      sheets: [],
      hiddenSheets: [],
      encoding,
      delimiter,
      error: /password|encrypt/i.test(message)
        ? 'El archivo está protegido con contraseña. Guardalo sin contraseña y volvé a subirlo.'
        : 'No se pudo abrir la planilla: el archivo está dañado o no es una planilla.',
    };
  }

  const meta = workbook.Workbook?.Sheets ?? [];
  const all = workbook.SheetNames.map((name, index) => ({
    name,
    hidden: Boolean(meta[index]?.Hidden),
  }));
  const visible = all.filter((sheet) => !sheet.hidden);
  const chosen = visible.length ? visible : all;

  return {
    sheets: chosen.map(({ name }) => ({ name, grid: sheetToGrid(workbook.Sheets[name]) })),
    hiddenSheets: visible.length ? all.filter((sheet) => sheet.hidden).map((sheet) => sheet.name) : [],
    encoding,
    delimiter,
    error: null,
  };
}
