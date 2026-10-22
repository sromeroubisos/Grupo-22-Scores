/**
 * Entrega de un PNG ya dibujado: en el celular y la tablet, hoja de compartir
 * del sistema; en la compu, descarga directa.
 *
 * `navigator.share` existe TAMBIEN en Chrome/Edge/Safari de escritorio (abre la
 * hoja de Windows o de macOS) y ahi lo que se espera es el archivo en
 * Descargas. Se decide por el puntero principal y por el user agent, que cubre
 * al iPad que se presenta como Mac. Es la misma regla del "mano a mano"
 * (`rivalHeadToHeadExport.ts`).
 */

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('No se pudo generar la imagen.'));
        }, 'image/png');
    });
}

export function slugify(value: string, fallback = 'archivo'): string {
    // Sin rango de combinantes en regex: se filtran por code point (0x300-0x36f).
    const stripped = Array.from(value.normalize('NFD'))
        .filter((ch) => {
            const code = ch.codePointAt(0) ?? 0;
            return code < 0x300 || code > 0x36f;
        })
        .join('');
    return stripped.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || fallback;
}

export function prefersShareSheet(): boolean {
    if (typeof window === 'undefined') return false;
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const mobileAgent =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    return coarsePointer || mobileAgent;
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Entrega uno o varios PNG. En el celular, UNA hoja de compartir con todos los
 * archivos si el navegador puede; si no, o en la compu, una descarga por
 * archivo.
 */
export async function deliverPngs(files: Array<{ blob: Blob; fileName: string }>): Promise<'shared' | 'downloaded'> {
    const nav = navigator as Navigator & { canShare?: (payload: ShareData) => boolean };
    const payload = files.map(({ blob, fileName }) => new File([blob], fileName, { type: 'image/png' }));

    if (prefersShareSheet() && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: payload })) {
        try {
            await nav.share({ files: payload });
            return 'shared';
        } catch (error) {
            // Cancelar la hoja no es un error; cualquier otra falla cae a la descarga.
            if ((error as DOMException)?.name === 'AbortError') return 'shared';
        }
    }

    for (const { blob, fileName } of files) {
        downloadBlob(blob, fileName);
        // Un respiro entre descargas: varios navegadores descartan las rafagas.
        await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return 'downloaded';
}
