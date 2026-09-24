/**
 * El lado del navegador de la imagen de un sponsor: leerla, adaptarla a la
 * proporción del formato, achicarla y codificarla para subir.
 *
 * Por qué se procesa acá y no sólo en el servidor: Vercel corta el cuerpo del
 * pedido en 4,5 MB, y la vista previa tiene que mostrar EXACTAMENTE lo que se
 * va a guardar. El servidor igual vuelve a validar y re-codifica
 * (api/sponsors/upload), con la misma regla de formats.ts.
 */

import {
    SPONSOR_ACCEPTED_LABEL,
    SPONSOR_ACCEPTED_MIME,
    SPONSOR_FORMATS,
    SPONSOR_MAX_UPLOAD_BYTES,
    SPONSOR_MAX_UPLOAD_LABEL,
    checkSponsorImage,
    type SponsorFormat,
    type SponsorImageCheck,
} from '@/lib/sponsors/formats';

/** as-is: tal cual · crop: recorta al centro · fit: la encaja entera, con márgenes transparentes */
export type SponsorAdaptMode = 'as-is' | 'crop' | 'fit';

export interface LoadedSponsorSource {
    bitmap: ImageBitmap | HTMLImageElement;
    width: number;
    height: number;
    fileName: string;
    fileBytes: number;
}

export interface RenderedSponsorImage {
    blob: Blob;
    width: number;
    height: number;
    previewUrl: string;
}

export function validateSponsorFile(file: File): string | null {
    if (!(SPONSOR_ACCEPTED_MIME as readonly string[]).includes(file.type.toLowerCase())) {
        return `Ese archivo no es una imagen que podamos usar. Subí ${SPONSOR_ACCEPTED_LABEL}.`;
    }
    if (file.size > SPONSOR_MAX_UPLOAD_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
        return `La imagen pesa ${mb} MB y el máximo es ${SPONSOR_MAX_UPLOAD_LABEL}.`;
    }
    return null;
}

export async function loadSponsorSource(file: File): Promise<LoadedSponsorSource> {
    // createImageBitmap endereza las fotos de celular giradas por EXIF.
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            return { bitmap, width: bitmap.width, height: bitmap.height, fileName: file.name, fileBytes: file.size };
        } catch {
            // Safari viejo: cae al <img>.
        }
    }

    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('No pudimos abrir la imagen.'));
            element.src = url;
        });
        return {
            bitmap: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            fileName: file.name,
            fileBytes: file.size,
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

interface Geometry {
    /** Recorte de la imagen original. */
    sx: number; sy: number; sw: number; sh: number;
    /** Lienzo a tamaño real (antes de achicar): de acá sale el control de calidad mínima. */
    canvasW: number; canvasH: number;
    /** Dónde cae el recorte dentro del lienzo a tamaño real. */
    dx: number; dy: number;
}

function geometryFor(format: SponsorFormat, mode: SponsorAdaptMode, width: number, height: number): Geometry {
    const ratio = SPONSOR_FORMATS[format].ratio;
    const sourceRatio = width / height;

    if (mode === 'crop') {
        if (sourceRatio > ratio) {
            const sw = Math.round(height * ratio);
            return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height, canvasW: sw, canvasH: height, dx: 0, dy: 0 };
        }
        const sh = Math.round(width / ratio);
        return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh, canvasW: width, canvasH: sh, dx: 0, dy: 0 };
    }

    if (mode === 'fit') {
        if (sourceRatio > ratio) {
            const canvasH = Math.round(width / ratio);
            return { sx: 0, sy: 0, sw: width, sh: height, canvasW: width, canvasH, dx: 0, dy: Math.round((canvasH - height) / 2) };
        }
        const canvasW = Math.round(height * ratio);
        return { sx: 0, sy: 0, sw: width, sh: height, canvasW, canvasH: height, dx: Math.round((canvasW - width) / 2), dy: 0 };
    }

    return { sx: 0, sy: 0, sw: width, sh: height, canvasW: width, canvasH: height, dx: 0, dy: 0 };
}

/** El control de proporción y calidad sobre lo que REALMENTE se va a guardar. */
export function checkAdaptedSource(
    format: SponsorFormat,
    mode: SponsorAdaptMode,
    width: number,
    height: number,
): SponsorImageCheck {
    const geometry = geometryFor(format, mode, width, height);
    return checkSponsorImage(format, geometry.canvasW, geometry.canvasH);
}

function makeCanvas(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Tu navegador no deja procesar la imagen.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    return { canvas, context };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function renderSponsorImage(
    source: LoadedSponsorSource,
    format: SponsorFormat,
    mode: SponsorAdaptMode,
): Promise<RenderedSponsorImage> {
    const spec = SPONSOR_FORMATS[format];
    const geometry = geometryFor(format, mode, source.width, source.height);

    // Primero el lienzo a tamaño real, con el recorte o los márgenes.
    const base = makeCanvas(geometry.canvasW, geometry.canvasH);
    base.context.drawImage(
        source.bitmap,
        geometry.sx, geometry.sy, geometry.sw, geometry.sh,
        geometry.dx, geometry.dy, geometry.sw, geometry.sh,
    );
    let canvas = base.canvas;

    // Después se achica al tamaño guardado. De a mitades: un solo salto de
    // 4000 a 1080 px deja la imagen con serrucho.
    const scale = Math.min(1, spec.stored.width / geometry.canvasW, spec.stored.height / geometry.canvasH);
    const targetW = Math.max(1, Math.round(geometry.canvasW * scale));
    const targetH = mode === 'as-is'
        ? Math.max(1, Math.round(geometry.canvasH * scale))
        : Math.max(1, Math.round(targetW / spec.ratio));

    while (canvas.width / 2 >= targetW && canvas.height / 2 >= targetH) {
        const half = makeCanvas(Math.round(canvas.width / 2), Math.round(canvas.height / 2));
        half.context.drawImage(canvas, 0, 0, half.canvas.width, half.canvas.height);
        canvas = half.canvas;
    }
    if (canvas.width !== targetW || canvas.height !== targetH) {
        const final = makeCanvas(targetW, targetH);
        final.context.drawImage(canvas, 0, 0, targetW, targetH);
        canvas = final.canvas;
    }

    // WebP conserva la transparencia de un logo y pesa poco. Si el navegador no
    // lo codifica, PNG donde puede haber transparencia y JPG para una foto.
    let blob = await toBlob(canvas, 'image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') {
        const needsAlpha = format === 'logo' || mode === 'fit';
        blob = needsAlpha ? await toBlob(canvas, 'image/png') : await toBlob(canvas, 'image/jpeg', 0.9);
    }
    if (!blob) throw new Error('No pudimos preparar la imagen.');

    return { blob, width: targetW, height: targetH, previewUrl: URL.createObjectURL(blob) };
}

export function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
