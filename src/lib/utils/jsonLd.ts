// JSON-LD para meter en un <script type="application/ld+json"> con
// dangerouslySetInnerHTML.
//
// `JSON.stringify` NO alcanza: deja `</script>` tal cual, y el parser de HTML
// cierra el script ahí sin importar que esté dentro de un string JSON. Un
// titular de noticia con `</script><img onerror=...>` era XSS almacenado. Se
// escapan como \uXXXX —JSON válido, mismo valor al parsearlo— los caracteres
// que el HTML puede leer como marcado (<, >, &) y los separadores de línea
// U+2028/U+2029, que rompen el JS si alguien alguna vez lo evalúa como tal.
//
// Los separadores se arman con fromCharCode y no se escriben literales: un
// U+2028 pegado en el fuente es un salto de línea invisible para el editor y
// rompe la regex.

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

const UNSAFE_CHARACTERS = new RegExp(`[<>&${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, 'g');

function toUnicodeEscape(character: string): string {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

export function serializeJsonLd(value: unknown): string {
    const json = JSON.stringify(value) ?? 'null';
    return json.replace(UNSAFE_CHARACTERS, toUnicodeEscape);
}
