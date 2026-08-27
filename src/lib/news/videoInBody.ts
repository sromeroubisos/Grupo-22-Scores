// Un link de video atrapado adentro de un párrafo.
//
// El lector embebe una dirección de video solo cuando está sola en su
// renglón (`parseEmbedLine` en `richText.ts`). Pegada al final de una frase
// no es ni link ni reproductor: es texto pelado. Acá se detecta y se mueve,
// que es lo que casi siempre se quiso hacer.

import { parseVideoUrl } from '../matches/videoLinks';

const URL_ALONE = /^https?:\/\/\S+$/i;
const BARE_URL = /https?:\/\/[^\s<>]+/g;

/** true si el renglón entero es una dirección: así el lector la embebe. */
export function isUrlAlone(line: string): boolean {
    return URL_ALONE.test(line.trim());
}

/** La primera dirección de video atrapada adentro de un párrafo; null si no hay. */
export function strandedVideoIn(content: string): string | null {
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (isUrlAlone(trimmed)) continue;
        for (const found of trimmed.matchAll(BARE_URL)) {
            // Un `[texto](url)` o un `![Foto](url)` se escribieron a propósito.
            if (trimmed.slice(0, found.index).endsWith('](')) continue;
            const url = found[0].replace(/[).,;:!?]+$/, '');
            if (parseVideoUrl(url)?.embedUrl) return url;
        }
    }
    return null;
}

export interface LiftedVideo {
    content: string;
    /** Dónde queda el cursor: al final de la dirección ya movida. */
    caret: number;
}

/**
 * Saca la dirección de adentro de su párrafo y la deja sola, en el renglón
 * de abajo. null si esa dirección no está en el texto.
 */
export function liftVideoToOwnLine(content: string, url: string): LiftedVideo | null {
    const at = content.indexOf(url);
    if (at < 0) return null;
    const breakBefore = content.lastIndexOf('\n\n', at);
    const blockStart = breakBefore < 0 ? 0 : breakBefore + 2;
    const breakAfter = content.indexOf('\n\n', at);
    const blockEnd = breakAfter < 0 ? content.length : breakAfter;
    const paragraph = `${content.slice(blockStart, at)}${content.slice(at + url.length, blockEnd)}`
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([.,;:!?])/g, '$1')
        .trim();
    const head = content.slice(0, blockStart);
    const kept = paragraph ? `${paragraph}\n\n` : '';
    return {
        content: `${head}${kept}${url}${content.slice(blockEnd)}`,
        caret: head.length + kept.length + url.length,
    };
}
