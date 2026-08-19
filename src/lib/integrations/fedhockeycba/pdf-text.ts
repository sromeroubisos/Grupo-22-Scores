/**
 * Texto de un PDF de la federación, como líneas en orden de lectura.
 *
 * Los PDFs del fixture salen de un Excel: cada celda es un item de texto con
 * su posición. El orden interno del archivo NO es el orden visual (las canchas
 * pueden venir todas al final), así que acá se reordena por página → fila (y,
 * de arriba hacia abajo) → columna (x). Los items de una misma fila se unen
 * con " | " para que el parser pueda distinguir columnas de una celda con
 * espacios.
 *
 * Es el único módulo del conector que toca pdfjs; el parser de fixtures es
 * puro y se prueba con el texto ya extraído (__fixtures__/*.txt).
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Dos items con menos de esta diferencia de `y` son la misma fila visual. */
const TOLERANCIA_FILA = 3;
/** Hueco horizontal (en unidades de página) a partir del cual empieza otra celda.
 * Los PDFs que salen de Word parten una palabra en varios items pegados
 * ("PROV|INCIAL A", "15|/|08"): con menos hueco que esto se pegan sin separador. */
const HUECO_DE_CELDA = 4;

export const SEPARADOR_DE_CELDA = ' | ';

export async function lineasDelPdf(data: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
  const lineas: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const contenido = await page.getTextContent();
      const items = contenido.items
        .map((it) => {
          const t = it as { str?: string; transform?: number[]; width?: number };
          return {
            texto: String(t.str ?? '').trim(),
            x: t.transform?.[4] ?? 0,
            y: t.transform?.[5] ?? 0,
            ancho: t.width ?? 0,
          };
        })
        .filter((it) => it.texto !== '');

      // Filas por cercanía en y (el y de PDF crece hacia ARRIBA: se lee de mayor a menor).
      items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      let fila: typeof items = [];
      const cerrarFila = () => {
        if (!fila.length) return;
        fila.sort((a, b) => a.x - b.x);
        // Fragmentos contiguos = la misma celda; un hueco real = columna nueva.
        let texto = fila[0].texto;
        let fin = fila[0].x + fila[0].ancho;
        for (const it of fila.slice(1)) {
          const hueco = it.x - fin;
          texto += hueco > HUECO_DE_CELDA ? `${SEPARADOR_DE_CELDA}${it.texto}` : (hueco > 0.7 ? ` ${it.texto}` : it.texto);
          fin = Math.max(fin, it.x + it.ancho);
        }
        lineas.push(texto);
        fila = [];
      };
      for (const it of items) {
        if (fila.length && Math.abs(fila[0].y - it.y) > TOLERANCIA_FILA) cerrarFila();
        fila.push(it);
      }
      cerrarFila();
    }
  } finally {
    await doc.destroy();
  }
  return lineas;
}
