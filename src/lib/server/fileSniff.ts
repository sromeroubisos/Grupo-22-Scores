// El tipo REAL de un archivo subido, leído de sus primeros bytes.
//
// Las rutas de subida confiaban en `file.type` y en la extensión del nombre,
// que los pone el cliente: un HTML con `type: image/png` y nombre `x.html`
// quedaba servido desde nuestro Storage público como text/html. Acá el tipo
// sale del contenido, la extensión sale del tipo, y lo que no se reconoce
// (SVG, HTML, ejecutables, lo que sea) no pasa.
//
// Sin dependencias: las firmas son pocas y fijas.

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export type SniffedKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'pdf' | 'docx' | 'xlsx';

export interface SniffedFile {
    kind: SniffedKind;
    mime: string;
    ext: string;
}

const BY_KIND: Record<SniffedKind, SniffedFile> = {
    png: { kind: 'png', mime: 'image/png', ext: 'png' },
    jpeg: { kind: 'jpeg', mime: 'image/jpeg', ext: 'jpg' },
    gif: { kind: 'gif', mime: 'image/gif', ext: 'gif' },
    webp: { kind: 'webp', mime: 'image/webp', ext: 'webp' },
    avif: { kind: 'avif', mime: 'image/avif', ext: 'avif' },
    pdf: { kind: 'pdf', mime: 'application/pdf', ext: 'pdf' },
    docx: {
        kind: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
    },
    xlsx: {
        kind: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: 'xlsx',
    },
};

export const RASTER_IMAGE_KINDS: ReadonlySet<SniffedKind> = new Set(['png', 'jpeg', 'gif', 'webp', 'avif']);
export const DOCUMENT_KINDS: ReadonlySet<SniffedKind> = new Set(['pdf', 'docx', 'xlsx', 'png', 'jpeg']);

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
    if (bytes.length < offset + signature.length) return false;
    return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
    return Buffer.from(bytes.subarray(start, Math.min(end, bytes.length))).toString('latin1');
}

/** null si el contenido no es ninguno de los tipos que aceptamos. */
export function sniffFile(input: Uint8Array): SniffedFile | null {
    const bytes = input;
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return BY_KIND.png;
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return BY_KIND.jpeg;
    if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return BY_KIND.gif;
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return BY_KIND.webp;
    if (ascii(bytes, 4, 8) === 'ftyp') {
        const brand = ascii(bytes, 8, 12);
        if (brand === 'avif' || brand === 'avis') return BY_KIND.avif;
    }
    if (ascii(bytes, 0, 5) === '%PDF-') return BY_KIND.pdf;

    // docx y xlsx son ZIP (OOXML). Los nombres de las entradas viajan sin
    // comprimir, así que alcanza con buscar la parte que define cada formato.
    if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
        const buffer = Buffer.from(bytes);
        if (!buffer.includes('[Content_Types].xml')) return null;
        if (buffer.includes('word/document.xml')) return BY_KIND.docx;
        if (buffer.includes('xl/workbook.xml')) return BY_KIND.xlsx;
        return null;
    }

    return null;
}
