// El cuerpo de una noticia: texto plano con marcas, guardado tal cual en
// `news.content` y convertido acá a un árbol que el lector dibuja.
//
// Por qué marcas y no HTML: el HTML guardado en la base obliga a sanear en
// cada lectura y a confiar en que nadie coló un <script> por la API. Un árbol
// que sale de un parser propio y se dibuja con React no puede ejecutar nada:
// lo único que decide es qué etiqueta va y qué texto lleva adentro.
//
// Lo que se entiende (un subconjunto de Markdown, el que un redactor usa):
//
//   ## Título          → subtítulo (h2)      ### Otro    → h3
//   **negrita**  _cursiva_ / *cursiva*  [texto](https://…)
//   ![alt](https://…/foto.jpg "epígrafe")   sola en su renglón → figura
//   > cita             - ítem / 1. ítem     ---   → separador
//
// Una nota vieja (párrafos separados por una línea en blanco, sin marcas)
// pasa por acá y se ve exactamente igual que antes.

export type InlineNode =
    | { type: 'text'; text: string }
    | { type: 'strong'; children: InlineNode[] }
    | { type: 'em'; children: InlineNode[] }
    | { type: 'link'; href: string; children: InlineNode[] }
    | { type: 'break' };

export type BlockNode =
    | { type: 'paragraph'; children: InlineNode[] }
    | { type: 'heading'; level: 2 | 3; children: InlineNode[] }
    | { type: 'quote'; paragraphs: InlineNode[][] }
    | { type: 'list'; ordered: boolean; items: InlineNode[][] }
    | { type: 'image'; src: string; alt: string; caption: string | null }
    | { type: 'rule' };

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)\s*$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*•]\s+(.+)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.+)$/;
const LINK = /^\[([^\]]+)\]\(\s*(\S+?)(?:\s+"[^"]*")?\s*\)/;
const ESCAPABLE = '\\*_[]()#>!-';

/** Un link que el navegador puede seguir sin correr nada: http(s), una ruta del sitio, un mail o un ancla. */
export function isSafeHref(href: string): boolean {
    return /^(https?:\/\/|\/(?!\/)|mailto:|#)/i.test(href.trim());
}

/** Una imagen que se puede pedir desde cualquier navegador: http(s) o una ruta del sitio. */
export function isSafeImageSrc(src: string): boolean {
    return /^(https?:\/\/|\/(?!\/))/i.test(src.trim());
}

// ── Inline ────────────────────────────────────────────────────────────────

function isWordChar(ch: string | undefined): boolean {
    return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

function isSpace(ch: string | undefined): boolean {
    return ch === undefined || /\s/.test(ch);
}

/** El cierre de `**` a partir de `from`: el primero cuyo contenido no termina en espacio. */
function findStrongClose(text: string, from: number): number {
    let j = from;
    while (j < text.length - 1) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '*' && text[j + 1] === '*' && j > from && !isSpace(text[j - 1])) return j;
        j += 1;
    }
    return -1;
}

/** El cierre de `*` o `_`: saltea los `**` (negrita adentro de la cursiva) y pide que no lo preceda un espacio. */
function findEmClose(text: string, mark: string, from: number): number {
    let j = from;
    while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '*' && text[j + 1] === '*') { j += 2; continue; }
        if (text[j] === mark && j > from && !isSpace(text[j - 1])) {
            // El guion bajo cierra solo al borde de una palabra: `un_nombre_así` queda como está.
            if (mark === '_' && isWordChar(text[j + 1])) { j += 1; continue; }
            return j;
        }
        j += 1;
    }
    return -1;
}

export function parseInline(text: string): InlineNode[] {
    const nodes: InlineNode[] = [];
    let buffer = '';
    const flush = () => {
        if (buffer) nodes.push({ type: 'text', text: buffer });
        buffer = '';
    };

    let i = 0;
    while (i < text.length) {
        const ch = text[i];

        if (ch === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
            buffer += text[i + 1];
            i += 2;
            continue;
        }

        if (ch === '*' && text[i + 1] === '*' && !isSpace(text[i + 2])) {
            const close = findStrongClose(text, i + 2);
            if (close > -1) {
                flush();
                nodes.push({ type: 'strong', children: parseInline(text.slice(i + 2, close)) });
                i = close + 2;
                continue;
            }
        }

        if ((ch === '*' || ch === '_') && !isSpace(text[i + 1]) && text[i + 1] !== ch) {
            const opensAtWordEdge = ch === '*' || !isWordChar(text[i - 1]);
            if (opensAtWordEdge) {
                const close = findEmClose(text, ch, i + 1);
                if (close > -1) {
                    flush();
                    nodes.push({ type: 'em', children: parseInline(text.slice(i + 1, close)) });
                    i = close + 1;
                    continue;
                }
            }
        }

        if (ch === '[') {
            const match = LINK.exec(text.slice(i));
            if (match && isSafeHref(match[2])) {
                flush();
                nodes.push({ type: 'link', href: match[2].trim(), children: parseInline(match[1]) });
                i += match[0].length;
                continue;
            }
        }

        buffer += ch;
        i += 1;
    }

    flush();
    return nodes;
}

/** Varios renglones de un mismo párrafo: cada salto de línea es un `<br>`. */
function parseLines(lines: string[]): InlineNode[] {
    const out: InlineNode[] = [];
    lines.forEach((line, index) => {
        if (index > 0) out.push({ type: 'break' });
        out.push(...parseInline(line.trim()));
    });
    return out;
}

// ── Bloques ───────────────────────────────────────────────────────────────

function startsBlock(line: string, next: string): boolean {
    return HEADING.test(line) || RULE.test(line) || IMAGE_LINE.test(line) || QUOTE.test(line) || BULLET.test(line)
        || (NUMBERED.test(line) && NUMBERED.test(next));
}

export function parseRichText(content: string | null | undefined): BlockNode[] {
    const lines = (content ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks: BlockNode[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { i += 1; continue; }

        const heading = HEADING.exec(trimmed);
        if (heading) {
            // `#` y `##` son el subtítulo de la nota: el único h1 de la página es el título.
            blocks.push({ type: 'heading', level: heading[1].length === 3 ? 3 : 2, children: parseInline(heading[2]) });
            i += 1;
            continue;
        }

        if (RULE.test(trimmed)) {
            blocks.push({ type: 'rule' });
            i += 1;
            continue;
        }

        const image = IMAGE_LINE.exec(trimmed);
        if (image) {
            if (isSafeImageSrc(image[2])) {
                const alt = image[1].trim();
                const caption = (image[3] ?? '').trim() || null;
                blocks.push({ type: 'image', src: image[2].trim(), alt, caption });
            }
            // Una imagen con una ruta que nadie puede pedir (file:///…) no se dibuja ni deja rastro.
            i += 1;
            continue;
        }

        if (QUOTE.test(trimmed)) {
            const paragraphs: string[][] = [[]];
            while (i < lines.length && QUOTE.test(lines[i].trim())) {
                const inner = (QUOTE.exec(lines[i].trim()) as RegExpExecArray)[1].trim();
                if (!inner) {
                    if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
                } else {
                    paragraphs[paragraphs.length - 1].push(inner);
                }
                i += 1;
            }
            blocks.push({ type: 'quote', paragraphs: paragraphs.filter((p) => p.length > 0).map(parseLines) });
            continue;
        }

        const bullet = BULLET.test(trimmed);
        // Una lista numerada pide al menos dos renglones seguidos: las notas
        // viejas titulan secciones con "1. Tal cosa" sueltas, y eso es un párrafo.
        if (bullet || (NUMBERED.test(trimmed) && NUMBERED.test((lines[i + 1] ?? '').trim()))) {
            const pattern = bullet ? BULLET : NUMBERED;
            const items: InlineNode[][] = [];
            while (i < lines.length) {
                const current = lines[i].trim();
                const match = pattern.exec(current);
                if (!match) break;
                items.push(parseInline(match[1]));
                i += 1;
            }
            blocks.push({ type: 'list', ordered: !bullet, items });
            continue;
        }

        // Párrafo: los renglones seguidos hasta la línea en blanco o el próximo bloque.
        const paragraphLines: string[] = [];
        while (i < lines.length) {
            const current = lines[i].trim();
            if (!current || (paragraphLines.length > 0 && startsBlock(current, (lines[i + 1] ?? '').trim()))) break;
            paragraphLines.push(current);
            i += 1;
        }
        blocks.push({ type: 'paragraph', children: parseLines(paragraphLines) });
    }

    return blocks;
}

// ── Texto plano ───────────────────────────────────────────────────────────

function inlineText(nodes: InlineNode[]): string {
    return nodes.map((node) => {
        switch (node.type) {
            case 'text': return node.text;
            case 'break': return ' ';
            default: return inlineText(node.children);
        }
    }).join('');
}

/**
 * El cuerpo sin marcas, para la tarjeta, la descripción de los buscadores y
 * el conteo de palabras. Las imágenes y los separadores no dicen nada.
 */
export function plainTextOf(content: string | null | undefined): string {
    return parseRichText(content)
        .map((block) => {
            switch (block.type) {
                case 'paragraph':
                case 'heading':
                    return inlineText(block.children);
                case 'quote':
                    return block.paragraphs.map(inlineText).join(' ');
                case 'list':
                    return block.items.map(inlineText).join(' ');
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

export function wordCountOf(content: string | null | undefined): number {
    const text = plainTextOf(content);
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** Cuántas imágenes intermedias lleva el cuerpo (para el resumen del editor). */
export function imageCountOf(content: string | null | undefined): number {
    return parseRichText(content).filter((block) => block.type === 'image').length;
}
