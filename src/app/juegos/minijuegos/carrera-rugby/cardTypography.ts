/**
 * El nombre de la familia de la tarjeta, SOLO. Sin imports.
 *
 * Existe como archivo aparte porque lo necesitan los dos lados de la tarjeta y
 * cada uno arrastra cosas que el otro no puede cargar: `cardFonts.ts` lee el
 * disco con `node:fs` para dárselas a Satori, y `CareerCard.tsx` lo dibuja
 * también en el navegador. Cuando el nombre vivía en cualquiera de los dos, el
 * otro lo importaba y se llevaba puesto lo que había alrededor — con `node:fs`
 * en el bundle del cliente, Turbopack corta la compilación ("the chunking
 * context does not support external modules: node:fs/promises") y la imagen
 * responde 500.
 *
 * Un archivo de una línea es más barato que ese acoplamiento.
 */
export const CARD_FONT_FAMILY = 'Articulat CF';
