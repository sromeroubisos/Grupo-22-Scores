/**
 * Extracción de texto para el importador de fixture.
 *
 * Hasta acá `parseFile` sólo sabía leer Excel y CSV: un PDF o una imagen caían
 * en un `return` que devolvía CERO filas y el aviso «quedan en revisión
 * obligatoria hasta integrar OCR». Este módulo es ese OCR.
 *
 * Dos caminos, y la distinción importa porque el barato es el que sirve casi
 * siempre:
 *
 *   · **PDF con texto embebido** (el 90% de los fixtures de federación: se
 *     exportan desde Word, Excel o un sistema de gestión). El texto YA está
 *     adentro del archivo, sólo hay que sacarlo. `pdfjs-dist` lo hace sin
 *     reconocer nada: es rápido, exacto y no cuesta nada. No es OCR.
 *
 *   · **Imagen, o PDF que es un escaneo** (una foto del papel pegado en el
 *     club, una captura de pantalla de WhatsApp). Acá no hay texto: hay
 *     píxeles, y hay que reconocerlos. Eso es OCR de verdad, y lo hace
 *     `tesseract.js`.
 *
 * Se intenta SIEMPRE el camino barato primero. Un PDF sólo cae al OCR si de
 * verdad no tiene texto que sacar.
 *
 * El worker de Tesseract se cachea por proceso: levantarlo cuesta segundos
 * (descarga el modelo del idioma), y sin caché cada importación pagaría ese
 * precio de nuevo.
 */

import type { Worker } from 'tesseract.js';

/** Idiomas del OCR. Español primero; el inglés ayuda con «vs», «Round» y los
 *  nombres de club en inglés, que abundan en el rugby argentino. */
const OCR_LANGS = 'spa+eng';

/**
 * Debajo de esto, el "texto" que sacamos de un PDF no es texto: son las
 * cuatro etiquetas sueltas que un escaneo deja embebidas (el nombre del
 * software, un número de página). Si un PDF de fixture rinde menos que esto,
 * es un escaneo y va al OCR.
 */
const MIN_PDF_TEXT_CHARS = 40;

/** Techo de seguridad: un archivo enorme no puede colgar el request. */
const MAX_OCR_BYTES = 12 * 1024 * 1024;
const OCR_TIMEOUT_MS = 60_000;

export type ExtractionMethod = 'pdf_text' | 'ocr' | 'none';

export interface TextExtractionResult {
  text: string;
  method: ExtractionMethod;
  /** Páginas leídas, cuando la fuente las tiene. */
  pages: number;
  /** 0-100 que reporta Tesseract. `null` cuando no hubo OCR. */
  ocrConfidence: number | null;
  /** Para el usuario, en el idioma del gestor. */
  warnings: string[];
}

const EMPTY: TextExtractionResult = {
  text: '',
  method: 'none',
  pages: 0,
  ocrConfidence: null,
  warnings: [],
};

// ─── PDF ───────────────────────────────────────────────────────────────────

/**
 * Saca el texto embebido de un PDF, página por página.
 *
 * Se usa el build `legacy` de pdfjs: el moderno asume APIs de browser
 * (`DOMMatrix`, `Path2D`) que en el runtime de Node no existen y explota al
 * importar. `standardFontDataUrl` apunta a los archivos del paquete para que no
 * salga a buscarlos por red.
 *
 * Las líneas se reconstruyen por posición vertical: pdfjs entrega los items de
 * texto sueltos, y sin reagruparlos por su coordenada `y` una tabla de fixture
 * llega como una sopa de celdas sin filas — justamente lo que el parser de
 * líneas necesita para funcionar.
 */
async function extractPdfText(buffer: Buffer): Promise<TextExtractionResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Sin worker: en Node el worker separado no aporta y complica el bundle.
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      // Agrupar por renglón: cada item trae su matriz de transformación, y
      // transform[5] es la Y. Se redondea porque dos celdas de la misma fila
      // rara vez comparten el decimal exacto.
      const lines = new Map<number, Array<{ x: number; text: string }>>();

      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        const bucket = lines.get(y);
        if (bucket) bucket.push({ x, text: item.str });
        else lines.set(y, [{ x, text: item.str }]);
      }

      const ordered = Array.from(lines.entries())
        // Y crece hacia arriba en PDF, así que de mayor a menor es de arriba
        // hacia abajo — el orden en que se lee.
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) =>
          items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s{2,}/g, ' ')
            .trim(),
        )
        .filter(Boolean);

      pageTexts.push(ordered.join('\n'));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  const text = pageTexts.join('\n').trim();

  return {
    text,
    method: 'pdf_text',
    pages: doc.numPages,
    ocrConfidence: null,
    warnings: [],
  };
}

// ─── OCR ───────────────────────────────────────────────────────────────────

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(OCR_LANGS);
    })().catch((error) => {
      // Sin esto, un fallo al levantar el worker deja la promesa rechazada
      // cacheada para siempre y TODA importación posterior falla igual.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/**
 * Reconoce el texto de una imagen.
 *
 * El resultado viene con una confianza 0-100. No se corta por confianza baja:
 * el asistente ya manda todo a preview fila por fila, así que un reconocimiento
 * dudoso se corrige a mano en vez de perderse. La confianza sólo se informa.
 */
async function extractImageText(buffer: Buffer): Promise<TextExtractionResult> {
  const worker = await getWorker();

  const recognition = await Promise.race([
    worker.recognize(buffer),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS),
    ),
  ]);

  const text = (recognition.data.text || '').trim();
  const confidence = typeof recognition.data.confidence === 'number'
    ? Math.round(recognition.data.confidence)
    : null;

  const warnings: string[] = [];
  if (confidence !== null && confidence < 65) {
    warnings.push(
      `El reconocimiento quedó con confianza baja (${confidence}%). Revisá fila por fila antes de confirmar: una foto derecha y con buena luz mejora bastante el resultado.`,
    );
  }

  return { text, method: 'ocr', pages: 1, ocrConfidence: confidence, warnings };
}

// ─── Despachador ───────────────────────────────────────────────────────────

/**
 * Devuelve el texto plano de un PDF o una imagen, listo para el parser de
 * líneas. Nunca lanza por un archivo malo: los problemas vuelven como
 * `warnings` para que el asistente los muestre y el usuario pueda decidir.
 */
export async function extractDocumentText(
  buffer: Buffer,
  kind: 'pdf' | 'image',
): Promise<TextExtractionResult> {
  if (!buffer?.length) return EMPTY;

  if (buffer.length > MAX_OCR_BYTES) {
    return {
      ...EMPTY,
      warnings: [
        `El archivo pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB y el límite para leerlo acá es ${MAX_OCR_BYTES / 1024 / 1024} MB. Subilo como Excel o CSV, o recortá la imagen a la parte del fixture.`,
      ],
    };
  }

  if (kind === 'pdf') {
    let pdfResult: TextExtractionResult | null = null;
    try {
      pdfResult = await extractPdfText(buffer);
    } catch (error) {
      console.error('[fixtureTextExtraction] PDF ilegible:', error);
      return {
        ...EMPTY,
        warnings: ['No se pudo abrir el PDF. Puede estar dañado o protegido con contraseña.'],
      };
    }

    if (pdfResult.text.length >= MIN_PDF_TEXT_CHARS) return pdfResult;

    // PDF sin texto = escaneo. pdfjs no rasteriza en Node sin `canvas` (una
    // dependencia nativa que no vale la pena arrastrar por este caso), así que
    // acá se corta y se dice qué hacer, en vez de devolver cero filas sin
    // explicación como hacía antes.
    return {
      ...pdfResult,
      text: '',
      method: 'none',
      warnings: [
        'Este PDF no tiene texto: es un escaneo o una imagen adentro de un PDF. Sacale una captura o una foto y subila como imagen (.png o .jpg) — esas sí pasan por reconocimiento.',
      ],
    };
  }

  try {
    return await extractImageText(buffer);
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'OCR_TIMEOUT';
    console.error('[fixtureTextExtraction] OCR falló:', error);
    return {
      ...EMPTY,
      warnings: [
        timedOut
          ? 'El reconocimiento tardó demasiado y se cortó. Probá con una imagen más chica o recortada al fixture.'
          : 'No se pudo reconocer el texto de la imagen. Probá con otra captura, o pegá el texto a mano.',
      ],
    };
  }
}
