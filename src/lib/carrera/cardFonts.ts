// LA TIPOGRAFÍA DE LA TARJETA, para Satori.
//
// Articulat CF, SIEMPRE en oblicua: Heavy para los títulos y pesos menores para
// lo de abajo. Es la tipografía de la casa, y sin pasársela a `ImageResponse` la
// imagen sale con la genérica del renderer —no hay `font-family` que valga: el
// servidor no tiene las fuentes del navegador que la pidió.
//
// Los .otf viven en `public/fonts/articulat/` y no en una copia acá al lado: son
// los MISMOS archivos que el navegador carga por `@font-face` para la vista
// previa, así que lo que se mira y lo que se baja no pueden separarse.
//
// Se leen con `readFile` sobre `process.cwd()`. Las dos alternativas fallan:
// `fetch` no soporta URLs `file:` en Node ("not implemented... yet...") y
// `new URL('./x.otf', import.meta.url)` hace que Turbopack le arme al módulo un
// chunk de CLIENTE —donde `node:fs` no existe— y la ruta devuelve 500.
// `next.config.ts` los incluye en el trace del build para que también estén en
// el servidor de producción.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CARD_FONT_FAMILY } from '@/app/juegos/minijuegos/carrera-rugby/cardTypography';

export type CardFontWeight = 500 | 600 | 900;

/** Carpeta de los .otf, relativa a la raíz del proyecto. */
export const CARD_FONTS_DIR = 'public/fonts/articulat';

const ARCHIVOS: readonly [CardFontWeight, string][] = [
    [900, 'ArticulatCF-HeavyOblique.otf'],
    [600, 'ArticulatCF-DemiBoldOblique.otf'],
    [500, 'ArticulatCF-MediumOblique.otf'],
];

export interface SatoriFont {
    name: string;
    data: ArrayBuffer;
    weight: CardFontWeight;
    style: 'italic';
}

// Una sola lectura por proceso: la imagen se genera por request y releer 190 KB
// de disco en cada una no aporta nada — los archivos no cambian en caliente.
let cache: Promise<SatoriFont[]> | null = null;

export function cardFonts(): Promise<SatoriFont[]> {
    cache ??= Promise.all(
        ARCHIVOS.map(async ([weight, archivo]) => {
            const bytes = await readFile(join(process.cwd(), CARD_FONTS_DIR, archivo));
            return {
                name: CARD_FONT_FAMILY,
                // De `Uint8Array` al ArrayBuffer EXACTO de esos bytes: pasar
                // `bytes.buffer` a secas entrega el pool interno de Node, que
                // trae bytes de otras lecturas y Satori no lo puede parsear.
                data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
                weight,
                style: 'italic' as const,
            };
        }),
    );
    return cache;
}

