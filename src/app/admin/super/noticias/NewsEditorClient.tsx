'use client';

// El editor de noticias (cualquier rol de administración o de redacción):
// crear, editar, publicar, despublicar y eliminar. Vive en /admin/noticias,
// con el tono oscuro del admin.
//
// Lo que cuida: etiquetas visibles, validación en línea (al salir del campo
// y al guardar) que dice qué falta, subida de la imagen al bucket `news` (o
// una URL), deporte y alcance elegidos de una lista (no texto libre: la
// portada filtra por esos ids), vista previa de la tarjeta tal como se ve en
// /noticias, y aviso al irse con cambios sin guardar.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowLeft, AtSign, Bold, CheckCircle2, Circle, Eye, EyeOff, Heading2, Heading3,
    Image as ImageIcon, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Newspaper, Quote, Trash2, X,
} from 'lucide-react';

import NewsBody from '@/components/news/NewsBody';
import { formatMention, isSiteVideoRef, mentionKey, type ResolvedMention } from '@/lib/news/mentions';
import { collectMentions, imageCountOf, mentionCountOf, parseRichText, plainTextOf, wordCountOf } from '@/lib/news/richText';
import { isUrlAlone, liftVideoToOwnLine, strandedVideoIn } from '@/lib/news/videoInBody';
import { newsPath } from '@/lib/news/newsUrl';
import { sessionFetch } from '@/lib/supabase/freshSession';

import LinkInserter, { type InsertMode } from './LinkInserter';
import MentionPicker, { type MentionPickerHandle } from './MentionPicker';
import styles from './NewsEditor.module.css';

type NewsStatus = 'draft' | 'published' | 'archived';

interface NewsForm {
    title: string;
    summary: string;
    content: string;
    image_url: string;
    sport: string;
    scope: string;
    tags: string[];
}

type FormField = keyof NewsForm;

interface NewsRecord {
    id: string;
    status: NewsStatus;
    published_at: string | null;
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    image_url?: string | null;
    sport?: string | null;
    scope?: string | null;
    tags?: string[] | null;
}

type NewsEditorClientProps = {
    newsId?: string;
};

const EMPTY: NewsForm = { title: '', summary: '', content: '', image_url: '', sport: 'rugby', scope: 'global', tags: [] };

// Los mismos topes que valida la API.
const TITLE_MAX = 140;
const SUMMARY_MAX = 280;
const CONTENT_MAX = 20000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const SPORT_MAX = 40;
const TAG_MAX = 30;
const TAGS_MAX = 10;
/** El valor del select que abre el campo de deporte propio. */
const CUSTOM_SPORT = '__custom';
const NEWS_COLUMNS_MIGRATION = '20260826150000_news_sport_scope_tags.sql';
/** Las columnas que la base puede no tener todavía, con su nombre para el aviso. */
const DROPPABLE_FIELDS: Partial<Record<FormField, string>> = { sport: 'el deporte', scope: 'el alcance', tags: 'las etiquetas' };

/** Los ids que entiende la portada (sus carpetas por deporte). */
const SPORTS = [
    { id: 'rugby', label: 'Rugby' },
    { id: 'field-hockey', label: 'Hockey' },
    { id: 'football', label: 'Fútbol' },
    { id: 'basketball', label: 'Básquet' },
    { id: 'volleyball', label: 'Vóley' },
    { id: 'handball', label: 'Handball' },
    { id: 'tennis', label: 'Tenis' },
];
const SCOPES = [
    { id: 'global', label: 'General' },
    { id: 'tournament', label: 'Torneo' },
    { id: 'club', label: 'Club' },
    { id: 'union', label: 'Unión' },
];
const STATUS_LABELS: Record<NewsStatus, string> = { draft: 'Borrador', published: 'Publicada', archived: 'Archivada' };

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "22 abr 2026", en hora argentina y con partes numéricas: servidor y navegador escriben lo mismo. */
function formatDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const day = get('day');
    const month = Number(get('month'));
    const year = get('year');
    return day && month && year ? `${day} ${MONTHS[month - 1]} ${year}` : null;
}

function formatClock(date: Date): string {
    return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\/\S+$/i.test(value);
}

function toForm(record: NewsRecord): NewsForm {
    return {
        title: record.title ?? '',
        summary: record.summary ?? '',
        content: record.content ?? '',
        image_url: record.image_url ?? '',
        sport: record.sport ?? 'rugby',
        scope: record.scope ?? 'global',
        tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '') : [],
    };
}

function validate(form: NewsForm): Partial<Record<FormField, string>> {
    const errors: Partial<Record<FormField, string>> = {};
    const title = form.title.trim();
    if (!title) errors.title = 'El título es obligatorio.';
    else if (title.length > TITLE_MAX) errors.title = `El título no puede pasar los ${TITLE_MAX} caracteres.`;
    if (form.summary.length > SUMMARY_MAX) errors.summary = `El resumen no puede pasar los ${SUMMARY_MAX} caracteres.`;
    if (form.content.length > CONTENT_MAX) errors.content = `El contenido no puede pasar los ${CONTENT_MAX} caracteres.`;
    const image = form.image_url.trim();
    if (image && !isHttpUrl(image)) errors.image_url = 'Tiene que ser un link que empiece con https://, o subí el archivo desde acá.';
    if (form.sport.trim().length > SPORT_MAX) errors.sport = `El deporte no puede pasar los ${SPORT_MAX} caracteres.`;
    return errors;
}

function paragraphCount(text: string): number {
    return parseRichText(text).filter((block) => block.type === 'paragraph').length;
}

/** El extracto de la tarjeta: el resumen, o el principio del cuerpo sin las marcas. */
function excerptOf(form: NewsForm): string {
    const summary = form.summary.trim();
    if (summary) return summary;
    const content = plainTextOf(form.content);
    if (!content) return 'Abrir para leer la noticia completa.';
    return content.length > 160 ? `${content.slice(0, 157)}...` : content;
}

// ── El formato del cuerpo ─────────────────────────────────────────────────
// Las marcas que entiende el lector (lib/news/richText.ts). La barra las
// escribe en el textarea alrededor de lo seleccionado; el texto guardado
// sigue siendo texto, y quien prefiera teclearlas a mano puede.

type FormatKind = 'bold' | 'italic' | 'h2' | 'h3' | 'quote' | 'ul' | 'ol' | 'link' | 'mention' | 'rule';

type FormatTool = {
    kind: FormatKind;
    label: string;
    shortcut?: string;
    Icon: typeof Bold;
};

const FORMAT_TOOLS: FormatTool[][] = [
    [
        { kind: 'bold', label: 'Negrita', shortcut: 'Ctrl+B', Icon: Bold },
        { kind: 'italic', label: 'Cursiva', shortcut: 'Ctrl+I', Icon: Italic },
        { kind: 'link', label: 'Link o video', shortcut: 'Ctrl+K', Icon: Link2 },
        { kind: 'mention', label: 'Etiquetar un club, jugador, torneo, partido o video', shortcut: '@', Icon: AtSign },
    ],
    [
        { kind: 'h2', label: 'Subtítulo', Icon: Heading2 },
        { kind: 'h3', label: 'Subtítulo menor', Icon: Heading3 },
        { kind: 'quote', label: 'Cita', Icon: Quote },
    ],
    [
        { kind: 'ul', label: 'Lista', Icon: List },
        { kind: 'ol', label: 'Lista numerada', Icon: ListOrdered },
        { kind: 'rule', label: 'Separador', Icon: Minus },
    ],
];

type Edit = { text: string; selectionStart: number; selectionEnd: number };

/** Envuelve la selección (o un texto de muestra, que queda seleccionado para pisarlo). */
function wrapSelection(value: string, start: number, end: number, before: string, after: string, sample: string): Edit {
    const selected = value.slice(start, end);
    const inner = selected || sample;
    const text = `${value.slice(0, start)}${before}${inner}${after}${value.slice(end)}`;
    return { text, selectionStart: start + before.length, selectionEnd: start + before.length + inner.length };
}

/** Cualquier marca de bloque al principio de un renglón: un renglón lleva una sola. */
const ANY_LINE_PREFIX = /^(?:#{1,3}\s+|>\s?|[-*•]\s+|\d{1,3}[.)]\s+)/;

/** Antepone una marca a cada renglón seleccionado (pisando la que tuviera); si todos ya llevan ésta, la saca. */
function prefixLines(value: string, start: number, end: number, prefix: (index: number) => string, detect: RegExp, sample: string): Edit {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndRaw = value.indexOf('\n', Math.max(end - (end > start ? 1 : 0), lineStart));
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
    const block = value.slice(lineStart, lineEnd);
    const lines = block ? block.split('\n') : [sample];
    const allMarked = block !== '' && lines.every((line) => detect.test(line));
    const next = lines
        .map((line, index) => (allMarked ? line.replace(detect, '') : `${prefix(index)}${line.replace(ANY_LINE_PREFIX, '')}`))
        .join('\n');
    const text = `${value.slice(0, lineStart)}${next}${value.slice(lineEnd)}`;
    return { text, selectionStart: lineStart, selectionEnd: lineStart + next.length };
}

/** Inserta un bloque en su propio párrafo, con línea en blanco antes y después. */
function insertBlock(value: string, start: number, end: number, block: string): Edit {
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trail = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const text = `${before}${lead}${block}${trail}${after}`;
    const caret = before.length + lead.length + block.length + trail.length;
    return { text, selectionStart: caret, selectionEnd: caret };
}

function applyFormatTo(value: string, start: number, end: number, kind: FormatKind): Edit {
    switch (kind) {
        case 'bold': return wrapSelection(value, start, end, '**', '**', 'texto en negrita');
        case 'italic': return wrapSelection(value, start, end, '_', '_', 'texto en cursiva');
        // 'link' no escribe nada acá: abre el panel de "Link o video", que es
        // el que sabe si esa dirección se muestra adentro de la nota.
        case 'mention': {
            // Un @ delante de lo seleccionado (o del cursor): el panel de menciones se abre solo.
            const selected = value.slice(start, end);
            const text = `${value.slice(0, start)}@${selected}${value.slice(end)}`;
            const caret = start + 1 + selected.length;
            return { text, selectionStart: caret, selectionEnd: caret };
        }
        case 'h2': return prefixLines(value, start, end, () => '## ', /^#{1,3}\s+/, 'Subtítulo');
        case 'h3': return prefixLines(value, start, end, () => '### ', /^#{1,3}\s+/, 'Subtítulo');
        case 'quote': return prefixLines(value, start, end, () => '> ', /^>\s?/, 'La cita');
        case 'ul': return prefixLines(value, start, end, () => '- ', /^(?:[-*•]|\d{1,3}[.)])\s+/, 'Primer punto');
        case 'ol': return prefixLines(value, start, end, (index) => `${index + 1}. `, /^(?:[-*•]|\d{1,3}[.)])\s+/, 'Primer punto');
        case 'rule': return insertBlock(value, start, end, '---');
        default: return { text: value, selectionStart: start, selectionEnd: end };
    }
}

const IMAGE_CAPTION_SAMPLE = 'Epígrafe de la foto';

/** La línea de una imagen intermedia; el epígrafe queda seleccionado para escribirlo. */
function imageBlock(url: string): string {
    return `![Foto](${url} "${IMAGE_CAPTION_SAMPLE}")`;
}

// ── Menciones (@) ─────────────────────────────────────────────────────────

/** Hasta dónde se busca para atrás un @ que abra el panel. */
const MENTION_LOOKBACK = 60;

interface MentionTrigger {
    /** Dónde está el @. */
    at: number;
    /** Lo escrito después del @, hasta el cursor. */
    query: string;
}

/**
 * Si el cursor viene escribiendo una mención: un @ al principio de una
 * palabra, en el mismo renglón, sin otra marca en el medio. Un @ adentro de
 * un mail o de un usuario de X (pegado a letras) no cuenta, y una mención ya
 * escrita tampoco: sus corchetes y paréntesis cortan la búsqueda.
 */
function detectMentionTrigger(value: string, caret: number): MentionTrigger | null {
    const from = Math.max(0, caret - MENTION_LOOKBACK);
    for (let i = caret - 1; i >= from; i -= 1) {
        const ch = value[i];
        if (ch === '\n' || ch === '[' || ch === ']' || ch === '(' || ch === ')') return null;
        if (ch === '@') {
            const before = value[i - 1];
            const opensWord = i === 0 || /[\s(¿"'«>—-]/.test(before);
            return opensWord ? { at: i, query: value.slice(i + 1, caret) } : null;
        }
    }
    return null;
}

const MIRRORED_STYLES = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'tabSize',
] as const;

/**
 * Dónde está un carácter del textarea, relativo a su contenedor posicionado:
 * un espejo invisible con el mismo texto y las mismas medidas, hasta ese
 * carácter, y se mide el siguiente. El panel de menciones se cuelga de ahí.
 */
function caretAnchor(textarea: HTMLTextAreaElement, index: number): { top: number; left: number } {
    const computed = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    for (const property of MIRRORED_STYLES) mirror.style[property] = computed[property];
    Object.assign(mirror.style, {
        position: 'absolute', top: '0', left: '0', visibility: 'hidden', whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word', overflow: 'hidden', height: '0', pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    mirror.textContent = textarea.value.slice(0, index);
    const marker = document.createElement('span');
    marker.textContent = textarea.value[index] || '.';
    mirror.appendChild(marker);
    (textarea.parentElement ?? document.body).appendChild(mirror);
    const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.5;
    const top = textarea.offsetTop + marker.offsetTop - textarea.scrollTop + lineHeight + 6;
    const left = textarea.offsetLeft + marker.offsetLeft - textarea.scrollLeft;
    mirror.remove();
    // Que el panel no se salga por la derecha del contenedor.
    const maxLeft = Math.max(0, textarea.offsetLeft + textarea.offsetWidth - 440);
    return { top, left: Math.min(Math.max(0, left), maxLeft) };
}

// ── El editor ─────────────────────────────────────────────────────────────

export default function NewsEditorClient({ newsId }: NewsEditorClientProps) {
    const router = useRouter();
    const [recordId, setRecordId] = useState<string | null>(newsId ?? null);
    const [status, setStatus] = useState<NewsStatus>('draft');
    const [publishedAt, setPublishedAt] = useState<string | null>(null);
    const [form, setForm] = useState<NewsForm>(EMPTY);
    /** Lo último guardado: contra esto se mide "cambios sin guardar". */
    const [saved, setSaved] = useState<NewsForm>(EMPTY);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [loading, setLoading] = useState(Boolean(newsId));
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'publish' | 'unpublish' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
    const [attempted, setAttempted] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [imageBroken, setImageBroken] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const bodyFileInputRef = useRef<HTMLInputElement | null>(null);
    const contentRef = useRef<HTMLTextAreaElement | null>(null);
    /** Dónde poner el cursor después de aplicar un formato (se resuelve al renderizar el nuevo texto). */
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const titleRef = useRef<HTMLInputElement | null>(null);
    const tagInputRef = useRef<HTMLInputElement | null>(null);
    /** Subiendo una foto intermedia del cuerpo (distinta de la de portada). */
    const [bodyUploading, setBodyUploading] = useState(false);
    const [bodyImageError, setBodyImageError] = useState<string | null>(null);
    /** Qué muestra la columna de vista previa: la tarjeta de la portada o la nota como se lee. */
    const [previewTab, setPreviewTab] = useState<'card' | 'article'>('card');
    /** Lo que se está escribiendo en el campo de etiquetas, antes de convertirse en chip. */
    const [tagDraft, setTagDraft] = useState('');
    /** true = quien edita eligió "Otro deporte" y escribe el suyo. */
    const [sportCustom, setSportCustom] = useState(false);
    /** Se guardó, pero con una advertencia (por ejemplo, la columna de etiquetas no existe todavía). */
    const [warning, setWarning] = useState<string | null>(null);
    /** Etiquetas que no entraron al pegar una lista (tope o repetidas). */
    const [tagNotice, setTagNotice] = useState<string | null>(null);
    /** Dónde está el cursor en el cuerpo: de acá sale si hay un @ abierto. */
    const [caret, setCaret] = useState(0);
    /** El @ que se cerró con Esc: no se vuelve a abrir hasta que el cursor cambie de @. */
    const [dismissedAt, setDismissedAt] = useState<number | null>(null);
    const [mentionAnchor, setMentionAnchor] = useState<{ top: number; left: number } | null>(null);
    const pickerRef = useRef<MentionPickerHandle | null>(null);
    /** Lo etiquetado, resuelto contra la web para la vista previa. null = se preguntó y no existe. */
    const [resolvedMentions, setResolvedMentions] = useState<Record<string, ResolvedMention | null>>({});
    /** El panel de "Link o video" abierto, con el tramo del cuerpo que va a reemplazar. */
    const [inserter, setInserter] = useState<{ url: string; text: string; start: number; end: number } | null>(null);

    /** Un link de video que quedó adentro de un párrafo: ahí no se ve el reproductor. */
    const strandedVideo = useMemo(() => strandedVideoIn(form.content), [form.content]);

    const mentionTrigger = useMemo(() => detectMentionTrigger(form.content, caret), [form.content, caret]);
    const mentionOpen = mentionTrigger !== null && mentionTrigger.at !== dismissedAt;

    // El panel se cuelga del @: se mide cuando abre y cada vez que el texto cambia.
    useEffect(() => {
        const textarea = contentRef.current;
        if (!mentionOpen || !textarea || !mentionTrigger) {
            setMentionAnchor(null);
            return;
        }
        setMentionAnchor(caretAnchor(textarea, mentionTrigger.at));
    }, [mentionOpen, mentionTrigger, form.content]);

    // Las menciones del cuerpo, resueltas para que la vista previa dibuje escudos, tarjetas y reproductores.
    const mentionRefs = useMemo(() => collectMentions(form.content), [form.content]);
    const pendingMentionKeys = useMemo(
        () => mentionRefs
            .filter((mention) => (mention.kind !== 'video' || isSiteVideoRef(mention.ref)) && !(mentionKey(mention) in resolvedMentions))
            .map(mentionKey)
            .join('\n'),
        [mentionRefs, resolvedMentions],
    );
    useEffect(() => {
        if (!pendingMentionKeys) return;
        const keys = pendingMentionKeys.split('\n');
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                const params = new URLSearchParams();
                keys.forEach((key) => params.append('key', key));
                const response = await fetch(`/api/news/mentions/resolve?${params.toString()}`, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
                const payload = await response.json().catch(() => null);
                if (!response.ok || controller.signal.aborted) return;
                const data = (payload?.data ?? {}) as Record<string, ResolvedMention>;
                setResolvedMentions((current) => {
                    const next = { ...current };
                    for (const key of keys) next[key] = data[key] ?? null;
                    return next;
                });
            } catch {
                // Sin resolver, la vista previa muestra la mención como link con su etiqueta.
            }
        }, 400);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [pendingMentionKeys]);
    const previewMentions = useMemo(() => {
        const out: Record<string, ResolvedMention> = {};
        for (const [key, value] of Object.entries(resolvedMentions)) if (value) out[key] = value;
        return out;
    }, [resolvedMentions]);

    const errors = useMemo(() => validate(form), [form]);
    const invalid = Object.keys(errors).length > 0;
    const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
    const image = form.image_url.trim();
    const imageOk = Boolean(image) && isHttpUrl(image);

    // La nota existente se carga una vez.
    useEffect(() => {
        if (!newsId) return;
        let cancelled = false;

        (async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/news?id=${encodeURIComponent(newsId)}`, { cache: 'no-store', credentials: 'same-origin' });
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la noticia.');
                if (!payload?.data) throw new Error('Esa noticia no existe o fue eliminada.');
                if (cancelled) return;
                const record = payload.data as NewsRecord;
                const next = toForm(record);
                setForm(next);
                setSaved(next);
                setStatus(record.status ?? 'draft');
                setPublishedAt(record.published_at ?? null);
                setRecordId(record.id);
            } catch (loadFailure) {
                if (!cancelled) setLoadError(loadFailure instanceof Error ? loadFailure.message : 'No se pudo cargar la noticia.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [newsId]);

    // Irse con cambios sin guardar pide confirmación del navegador.
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    function update<K extends FormField>(field: K, value: NewsForm[K]) {
        setSuccess(null);
        setForm((current) => ({ ...current, [field]: value }));
        if (field === 'image_url') {
            setImageError(null);
            setImageBroken(false);
        }
    }

    function touch(field: FormField) {
        setTouched((current) => ({ ...current, [field]: true }));
    }

    function showError(field: FormField): string | null {
        return (touched[field] || attempted) ? errors[field] ?? null : null;
    }

    // ── Las imágenes ──

    /** Sube un archivo al bucket `news` y devuelve su URL pública, o el error para mostrar. */
    async function uploadToBucket(file: File): Promise<{ url: string } | { error: string }> {
        if (!IMAGE_TYPES.includes(file.type)) return { error: 'Formato no soportado: usá JPG, PNG, WebP, GIF o AVIF.' };
        if (file.size > IMAGE_MAX_BYTES) return { error: 'La imagen pesa más de 5 MB. Achicala antes de subirla.' };
        try {
            const body = new FormData();
            body.append('file', file);
            const response = await sessionFetch('/api/news/image', { method: 'POST', body });
            const payload = await response.json().catch(() => null);
            if (!response.ok || typeof payload?.url !== 'string') {
                return { error: typeof payload?.error === 'string' ? payload.error : 'No se pudo subir la imagen. Probá de nuevo.' };
            }
            return { url: payload.url };
        } catch {
            return { error: 'No se pudo subir la imagen. Revisá la conexión y probá de nuevo.' };
        }
    }

    /** La imagen de portada. */
    async function uploadImage(file: File) {
        setImageError(null);
        setUploading(true);
        try {
            const result = await uploadToBucket(file);
            if ('error' in result) {
                setImageError(result.error);
                return;
            }
            update('image_url', result.url);
            touch('image_url');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    function onFilePicked(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) void uploadImage(file);
    }

    // ── El formato del cuerpo ──

    /** Aplica el resultado al textarea y deja el cursor donde corresponde. */
    function commitEdit(edit: Edit) {
        pendingSelectionRef.current = { start: edit.selectionStart, end: edit.selectionEnd };
        update('content', edit.text);
    }

    function applyFormat(kind: FormatKind) {
        const textarea = contentRef.current;
        if (!textarea) return;
        const { selectionStart, selectionEnd } = textarea;
        if (kind === 'link') {
            openInserter(selectionStart, selectionEnd);
            return;
        }
        if (kind === 'mention') setDismissedAt(null);
        commitEdit(applyFormatTo(form.content, selectionStart, selectionEnd, kind));
    }

    /** Abre "Link o video" sobre lo seleccionado: una URL entra como dirección, cualquier otra cosa como texto. */
    function openInserter(start: number, end: number) {
        const selected = form.content.slice(start, end).trim();
        const isUrl = isUrlAlone(selected);
        setInserter({ url: isUrl ? selected : '', text: isUrl ? '' : selected, start, end });
    }

    /** Lo elegido en el panel: la dirección sola en su renglón, o `[texto](url)` donde estaba el cursor. */
    function insertFromPanel(mode: InsertMode, url: string, label: string) {
        const target = inserter;
        setInserter(null);
        if (!target) return;
        if (mode === 'video') {
            commitEdit(insertBlock(form.content, target.start, target.end, url));
            return;
        }
        const written = `[${label}](${url})`;
        const position = target.start + written.length;
        commitEdit({
            text: `${form.content.slice(0, target.start)}${written}${form.content.slice(target.end)}`,
            selectionStart: position,
            selectionEnd: position,
        });
    }

    /** El cursor del cuerpo, para saber si hay un @ abierto. */
    function syncCaret() {
        const textarea = contentRef.current;
        if (textarea) setCaret(textarea.selectionStart);
    }

    /** Lo elegido en el panel reemplaza el @ y lo escrito después. */
    function pickMention(mention: ResolvedMention) {
        if (!mentionTrigger) return;
        const before = form.content.slice(0, mentionTrigger.at);
        const after = form.content.slice(caret);
        // Un partido o un video solos en su renglón salen como tarjeta o reproductor: sin espacio de más.
        const aloneInLine = (before === '' || before.endsWith('\n')) && (after === '' || after.startsWith('\n'));
        const written = formatMention({ kind: mention.kind, ref: mention.ref, label: mention.label });
        const insert = aloneInLine && (mention.kind === 'match' || mention.kind === 'video') ? written : `${written} `;
        const position = before.length + insert.length;
        setDismissedAt(null);
        setResolvedMentions((current) => ({ ...current, [mentionKey(mention)]: mention }));
        commitEdit({ text: `${before}${insert}${after}`, selectionStart: position, selectionEnd: position });
    }

    /** Una foto intermedia: se sube al bucket y su línea entra donde está el cursor. */
    async function insertBodyImage(file: File) {
        setBodyImageError(null);
        setBodyUploading(true);
        try {
            const result = await uploadToBucket(file);
            if ('error' in result) {
                setBodyImageError(result.error);
                return;
            }
            const textarea = contentRef.current;
            const start = textarea?.selectionStart ?? form.content.length;
            const end = textarea?.selectionEnd ?? start;
            const block = imageBlock(result.url);
            const edit = insertBlock(form.content, start, end, block);
            // Queda seleccionado el epígrafe de muestra, para escribir el de verdad.
            const blockStart = edit.text.indexOf(block, start);
            const captionFrom = blockStart + block.indexOf('"') + 1;
            commitEdit({ text: edit.text, selectionStart: captionFrom, selectionEnd: captionFrom + IMAGE_CAPTION_SAMPLE.length });
        } finally {
            setBodyUploading(false);
            if (bodyFileInputRef.current) bodyFileInputRef.current.value = '';
        }
    }

    function onBodyFilePicked(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) void insertBodyImage(file);
    }

    function onContentKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
        if (mentionOpen && pickerRef.current?.handleKey(event)) {
            event.preventDefault();
            return;
        }
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        const kind: FormatKind | null = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'k' ? 'link' : null;
        if (!kind) return;
        event.preventDefault();
        applyFormat(kind);
    }

    // Después de un formato, el textarea recibe el texto nuevo: recién ahí se puede mover el cursor.
    useEffect(() => {
        const pending = pendingSelectionRef.current;
        const textarea = contentRef.current;
        if (!pending || !textarea) return;
        pendingSelectionRef.current = null;
        textarea.focus();
        textarea.setSelectionRange(pending.start, pending.end);
        setCaret(pending.end);
    }, [form.content]);

    function onDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void uploadImage(file);
    }

    // ── Guardar ──

    async function persist(mode: 'save' | 'publish' | 'unpublish') {
        setAttempted(true);
        setError(null);
        setSuccess(null);
        if (invalid) {
            setError('Revisá los campos marcados antes de guardar.');
            if (errors.title) titleRef.current?.focus();
            return;
        }

        // Sin `status`, la API no toca el estado ni su fecha: "Guardar cambios"
        // en una nota publicada no la vuelve a fechar.
        const nextStatus: NewsStatus | undefined = mode === 'publish'
            ? 'published'
            : mode === 'unpublish'
                ? 'draft'
                : recordId ? undefined : 'draft';

        setBusy(mode);
        try {
            const response = await sessionFetch('/api/news', {
                method: recordId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: recordId ?? undefined,
                    title: form.title.trim(),
                    summary: form.summary.trim(),
                    content: form.content.trim(),
                    image_url: image || null,
                    sport: form.sport.trim() || null,
                    scope: form.scope,
                    tags: form.tags,
                    ...(nextStatus ? { status: nextStatus } : {}),
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo guardar la noticia.');

            const record = (payload?.data ?? null) as NewsRecord | null;
            const id = record?.id ?? recordId;
            const finalStatus: NewsStatus = record?.status ?? nextStatus ?? status;
            // La base puede no tener todavía alguna columna (deporte, alcance,
            // etiquetas): la API la descarta y lo avisa. Lo escrito se conserva
            // en el formulario y se advierte qué faltó.
            const dropped: string[] = Array.isArray(payload?.dropped) ? payload.dropped.filter((column: unknown): column is string => typeof column === 'string') : [];
            const lost = (Object.keys(DROPPABLE_FIELDS) as FormField[]).filter((field) => dropped.includes(field));
            const kept = Object.fromEntries(lost.map((field) => [field, form[field]])) as Partial<NewsForm>;
            const snapshot: NewsForm = record ? { ...toForm(record), ...kept } : { ...form };
            setWarning(lost.length > 0
                ? `No se guardaron ${lost.map((field) => DROPPABLE_FIELDS[field]).join(', ')}: falta correr la migración ${NEWS_COLUMNS_MIGRATION} en Supabase. El resto de la nota sí se guardó.`
                : null);

            setSaved(snapshot);
            setForm(snapshot);
            setStatus(finalStatus);
            setPublishedAt(record?.published_at ?? publishedAt);
            setSavedAt(new Date());
            setSuccess(
                finalStatus === 'published'
                    ? (mode === 'publish' ? 'Noticia publicada. Ya se ve en la portada.' : 'Cambios guardados. La nota sigue publicada.')
                    : (mode === 'unpublish' ? 'La nota volvió a borrador: ya no se ve en público.' : 'Borrador guardado. Solo quienes administran noticias lo ven hasta publicarlo.'),
            );

            // Recién creada: la URL pasa a la de edición sin recargar (la
            // página de edición carga lo mismo si se vuelve a entrar).
            if (id && !recordId) {
                setRecordId(id);
                window.history.replaceState(null, '', `/admin/super/noticias/editar/${id}`);
            }
        } catch (saveFailure) {
            setError(saveFailure instanceof Error ? saveFailure.message : 'No se pudo guardar la noticia.');
        } finally {
            setBusy(null);
        }
    }

    async function remove() {
        if (!recordId) return;
        if (!window.confirm('¿Eliminar esta noticia? No se puede deshacer.')) return;
        setBusy('delete');
        setError(null);
        try {
            const response = await sessionFetch(`/api/news?id=${encodeURIComponent(recordId)}`, { method: 'DELETE' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo eliminar la noticia.');
            setSaved(form); // sin aviso de cambios sin guardar al salir
            router.push('/noticias');
        } catch (deleteFailure) {
            setError(deleteFailure instanceof Error ? deleteFailure.message : 'No se pudo eliminar la noticia.');
            setBusy(null);
        }
    }

    function cancel() {
        if (dirty && !window.confirm('Tenés cambios sin guardar. ¿Salir igual?')) return;
        setSaved(form);
        router.push('/noticias');
    }

    // Ctrl/Cmd + S guarda.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (!busy && !loading) void persist('save');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // ── Textos derivados ──

    // Deporte: uno de la lista o uno propio. Un valor viejo que no está en la
    // lista se muestra como propio, sin perderse.
    const knownSport = SPORTS.some((sport) => sport.id === form.sport);
    const customSport = sportCustom || (form.sport.trim() !== '' && !knownSport);

    /**
     * Agrega lo escrito como etiquetas. Una lista pegada ("Mundial de Hockey
     * 2026, hockey femenino, Selección Argentina") entra partida por comas,
     * puntos y coma o saltos de línea; lo que no entra por el tope se avisa
     * debajo del campo en vez de perderse en silencio.
     */
    function addTag(raw: string) {
        const parts = raw.split(/[,;\n]+/).map((part) => part.replace(/\s+/g, ' ').trim().slice(0, TAG_MAX)).filter(Boolean);
        setTagDraft('');
        if (parts.length === 0) return;
        setSuccess(null);
        setForm((current) => {
            const tags = [...current.tags];
            const skipped: string[] = [];
            for (const tag of parts) {
                if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
                if (tags.length >= TAGS_MAX) { skipped.push(tag); continue; }
                tags.push(tag);
            }
            setTagNotice(skipped.length > 0
                ? `Quedaron afuera por el tope de ${TAGS_MAX}: ${skipped.join(', ')}.`
                : null);
            return tags.length === current.tags.length ? current : { ...current, tags };
        });
    }

    /** Pegar una lista separada por comas la convierte en chips de una. */
    function onTagPaste(event: ClipboardEvent<HTMLInputElement>) {
        const pasted = event.clipboardData.getData('text');
        if (!/[,;\n]/.test(pasted)) return;
        event.preventDefault();
        addTag(`${tagDraft}${pasted}`);
    }

    function removeTag(tag: string) {
        setSuccess(null);
        setTagNotice(null);
        setForm((current) => ({ ...current, tags: current.tags.filter((existing) => existing !== tag) }));
    }

    function onTagKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addTag(tagDraft);
        } else if (event.key === 'Backspace' && tagDraft === '' && form.tags.length > 0) {
            removeTag(form.tags[form.tags.length - 1]);
        }
    }
    const words = wordCountOf(`${form.summary}\n\n${form.content}`);
    const minutes = Math.max(1, Math.ceil(words / 220));
    const paragraphs = paragraphCount(form.content);
    const bodyImages = imageCountOf(form.content);
    const bodyMentions = mentionCountOf(form.content);
    const scopeLabel = SCOPES.find((scope) => scope.id === form.scope)?.label ?? 'General';
    const previewDate = formatDate(publishedAt) ?? 'Hoy';
    const isPublished = status === 'published';
    const actionHint = invalid
        ? (errors.title ? 'Falta el título.' : 'Hay un campo con un dato que no sirve.')
        : dirty
            ? 'Cambios sin guardar.'
            : savedAt
                ? `Guardado a las ${formatClock(savedAt)}.`
                : recordId ? 'Sin cambios.' : 'Todavía no se guardó.';

    const checklist = [
        { label: 'Título', done: Boolean(form.title.trim()) },
        { label: 'Resumen para la tarjeta', done: Boolean(form.summary.trim()) },
        { label: 'Imagen', done: imageOk },
        { label: 'Contenido', done: Boolean(form.content.trim()) },
        { label: 'Etiquetas (SEO)', done: form.tags.length > 0 },
    ];

    if (loading) {
        return (
            <div className={styles.page}>
                <p className={styles.loading}>Cargando la noticia…</p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className={styles.page}>
                <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>{loadError} <Link href="/noticias" className={styles.viewLink}>Volver a noticias</Link></span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.topBar}>
                <Link href="/noticias" className={styles.backLink}>
                    <ArrowLeft size={14} aria-hidden="true" /> Noticias
                </Link>
                <button type="button" className={`${styles.btn} ${styles.btnSm} ${styles.previewToggle}`} onClick={() => setPreviewOpen((open) => !open)} aria-expanded={previewOpen}>
                    {previewOpen ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                    {previewOpen ? 'Ocultar la vista previa' : 'Ver la vista previa'}
                </button>
            </div>

            <header className={styles.masthead}>
                <div>
                    <p className={styles.eyebrow}>Editorial · Noticias</p>
                    <h1 className={styles.title}>{recordId ? 'Editar noticia' : 'Nueva noticia'}</h1>
                    <p className={styles.lede}>
                        Un borrador lo ven solo quienes administran noticias. Al publicar, la nota sale en la portada.
                    </p>
                </div>
                <div className={styles.statusCluster}>
                    <span className={`${styles.statusPill} ${isPublished ? styles.statusPublished : styles.statusDraft}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {STATUS_LABELS[status]}
                    </span>
                    {recordId && (
                        <Link href={newsPath({ id: recordId, title: form.title })} className={styles.viewLink} target="_blank" rel="noopener noreferrer">
                            <Eye size={14} aria-hidden="true" /> Ver la nota
                        </Link>
                    )}
                </div>
            </header>

            <div className={styles.grid}>
                <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void persist('save'); }} noValidate>
                    <section className={styles.card} aria-labelledby="sec-texto">
                        <h2 id="sec-texto" className={styles.cardTitle}>La nota</h2>

                        <div className={styles.field}>
                            <div className={styles.labelRow}>
                                <label htmlFor="news-title" className={styles.label}>Título</label>
                                <span className={`${styles.counter} ${form.title.length > TITLE_MAX ? styles.counterOver : ''}`}>{form.title.length}/{TITLE_MAX}</span>
                            </div>
                            <input
                                id="news-title"
                                ref={titleRef}
                                className={`${styles.input} ${styles.titleInput} ${showError('title') ? styles.inputInvalid : ''}`}
                                type="text"
                                value={form.title}
                                placeholder="Alumni se quedó con el clásico y es único líder"
                                maxLength={TITLE_MAX + 20}
                                onChange={(event) => update('title', event.target.value)}
                                onBlur={() => touch('title')}
                                aria-invalid={Boolean(showError('title'))}
                                aria-describedby="news-title-hint"
                                required
                            />
                            <p id="news-title-hint" className={`${styles.hint} ${showError('title') ? styles.hintError : ''}`}>
                                {showError('title') ?? 'Corto y concreto: es lo que se lee en la tarjeta y en el buscador.'}
                            </p>
                        </div>

                        <div className={styles.field}>
                            <div className={styles.labelRow}>
                                <label htmlFor="news-summary" className={styles.label}>Resumen <span className={styles.labelSoft}>(opcional)</span></label>
                                <span className={`${styles.counter} ${form.summary.length > SUMMARY_MAX ? styles.counterOver : ''}`}>{form.summary.length}/{SUMMARY_MAX}</span>
                            </div>
                            <input
                                id="news-summary"
                                className={`${styles.input} ${showError('summary') ? styles.inputInvalid : ''}`}
                                type="text"
                                value={form.summary}
                                placeholder="Dos líneas que cuenten la nota. Sin resumen, la tarjeta usa el principio del contenido."
                                maxLength={SUMMARY_MAX + 20}
                                onChange={(event) => update('summary', event.target.value)}
                                onBlur={() => touch('summary')}
                                aria-invalid={Boolean(showError('summary'))}
                                aria-describedby="news-summary-hint"
                            />
                            <p id="news-summary-hint" className={`${styles.hint} ${showError('summary') ? styles.hintError : ''}`}>
                                {showError('summary') ?? 'Lo que se lee debajo del título en la portada.'}
                            </p>
                        </div>

                        <div className={styles.field}>
                            <div className={styles.labelRow}>
                                <label htmlFor="news-content" className={styles.label}>Contenido</label>
                                <span className={styles.counter}>{words} palabras · {minutes} min</span>
                            </div>
                            <div className={styles.contentWrap}>
                            <div className={styles.toolbar} role="toolbar" aria-label="Formato del contenido" aria-controls="news-content">
                                {FORMAT_TOOLS.map((group, groupIndex) => (
                                    <div key={groupIndex} className={styles.toolGroup}>
                                        {group.map(({ kind, label, shortcut, Icon }) => (
                                            <button
                                                key={kind}
                                                type="button"
                                                className={styles.toolBtn}
                                                onMouseDown={(event) => event.preventDefault() /* que el textarea no pierda la selección */}
                                                onClick={() => applyFormat(kind)}
                                                aria-label={shortcut ? `${label} (${shortcut})` : label}
                                                title={shortcut ? `${label} · ${shortcut}` : label}
                                            >
                                                <Icon size={16} aria-hidden="true" />
                                            </button>
                                        ))}
                                    </div>
                                ))}
                                <div className={styles.toolGroup}>
                                    <input
                                        ref={bodyFileInputRef}
                                        type="file"
                                        accept={IMAGE_TYPES.join(',')}
                                        onChange={onBodyFilePicked}
                                        disabled={bodyUploading}
                                        className={styles.srOnly}
                                        tabIndex={-1}
                                        aria-hidden="true"
                                    />
                                    <button
                                        type="button"
                                        className={`${styles.toolBtn} ${styles.toolBtnLabeled}`}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => bodyFileInputRef.current?.click()}
                                        disabled={bodyUploading}
                                        aria-label="Insertar una foto en el texto"
                                        title="Insertar una foto donde está el cursor"
                                    >
                                        <ImageIcon size={16} aria-hidden="true" />
                                        <span>{bodyUploading ? 'Subiendo…' : 'Foto'}</span>
                                    </button>
                                </div>
                            </div>
                            <textarea
                                id="news-content"
                                ref={contentRef}
                                className={`${styles.textarea} ${showError('content') ? styles.inputInvalid : ''}`}
                                value={form.content}
                                placeholder={'El texto de la nota.\n\nSepará los párrafos con una línea en blanco: así se muestran en la página. Con la barra de arriba van la negrita, la cursiva, los subtítulos y las fotos intermedias.'}
                                onChange={(event) => { update('content', event.target.value); setCaret(event.target.selectionStart); }}
                                onKeyDown={onContentKeyDown}
                                onKeyUp={syncCaret}
                                onClick={syncCaret}
                                onSelect={syncCaret}
                                onBlur={() => touch('content')}
                                aria-invalid={Boolean(showError('content'))}
                                aria-describedby="news-content-hint"
                                spellCheck
                            />
                            {inserter && (
                                <LinkInserter
                                    initialUrl={inserter.url}
                                    initialText={inserter.text}
                                    onInsert={insertFromPanel}
                                    onClose={() => setInserter(null)}
                                />
                            )}
                            {mentionOpen && mentionAnchor && mentionTrigger && (
                                <MentionPicker
                                    ref={pickerRef}
                                    query={mentionTrigger.query}
                                    anchor={mentionAnchor}
                                    onPick={pickMention}
                                    onClose={() => setDismissedAt(mentionTrigger.at)}
                                />
                            )}
                            </div>
                            {bodyImageError && <p className={`${styles.hint} ${styles.hintError}`} role="alert">{bodyImageError}</p>}
                            {strandedVideo && (
                                <p className={`${styles.hint} ${styles.hintWarn}`}>
                                    Hay un link de video en medio de un párrafo: ahí no se ve el reproductor, se lee como texto.{' '}
                                    <button
                                        type="button"
                                        className={styles.inlineAction}
                                        onClick={() => {
                                            const lifted = liftVideoToOwnLine(form.content, strandedVideo);
                                            if (lifted) commitEdit({ text: lifted.content, selectionStart: lifted.caret, selectionEnd: lifted.caret });
                                        }}
                                    >
                                        Ponerlo en su renglón
                                    </button>
                                </p>
                            )}
                            <p id="news-content-hint" className={`${styles.hint} ${showError('content') ? styles.hintError : ''}`}>
                                {showError('content') ?? 'Separá los párrafos con una línea en blanco; el primero sale destacado. Seleccioná un texto y tocá un botón para darle formato: **negrita**, _cursiva_, ## subtítulo. Con el botón de link (Ctrl+K) se pega una dirección y se elige qué se ve: el video adentro de la nota o solo el link. Escribí @ y un nombre para etiquetar un club, un jugador, un torneo, un partido o un video de la web; un partido o un video solos en su renglón salen como tarjeta o reproductor.'}
                            </p>
                        </div>
                    </section>

                    <section className={styles.card} aria-labelledby="sec-imagen">
                        <h2 id="sec-imagen" className={styles.cardTitle}>Imagen</h2>
                        <p className={styles.cardHint}>Va arriba de la nota y en la tarjeta de la portada, recortada a 16:9.</p>

                        {imageOk && !imageBroken ? (
                            <>
                                <div className={styles.imagePreview}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen remota elegida por quien edita. */}
                                    <img src={image} alt="" onError={() => setImageBroken(true)} />
                                </div>
                                <div className={styles.imageActions}>
                                    <span className={styles.imageSource} title={image}>{image}</span>
                                    <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => update('image_url', '')} disabled={uploading}>
                                        Quitar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div
                                className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ''}`}
                                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={IMAGE_TYPES.join(',')}
                                    onChange={onFilePicked}
                                    disabled={uploading}
                                    aria-label="Subir una imagen"
                                />
                                <ImagePlus size={26} aria-hidden="true" />
                                <span className={styles.dropTitle}>{uploading ? 'Subiendo la imagen…' : 'Arrastrá una imagen o hacé clic para elegirla'}</span>
                                <span className={styles.dropMeta}>JPG, PNG, WebP, GIF o AVIF · hasta 5 MB</span>
                            </div>
                        )}
                        {uploading && <div className={styles.progress} aria-hidden="true"><span className={styles.progressBar} /></div>}
                        {imageBroken && imageOk && (
                            <p className={`${styles.hint} ${styles.hintError}`} role="alert">Ese link no carga como imagen. Probá con otro o subí el archivo.</p>
                        )}
                        {imageError && <p className={`${styles.hint} ${styles.hintError}`} role="alert">{imageError}</p>}

                        <div className={styles.orRow}>o pegá un link</div>
                        <div className={styles.field}>
                            <label htmlFor="news-image" className={styles.label}>Link de la imagen</label>
                            <input
                                id="news-image"
                                className={`${styles.input} ${showError('image_url') ? styles.inputInvalid : ''}`}
                                type="url"
                                inputMode="url"
                                value={form.image_url}
                                placeholder="https://…/foto.jpg"
                                onChange={(event) => update('image_url', event.target.value)}
                                onBlur={() => touch('image_url')}
                                aria-invalid={Boolean(showError('image_url'))}
                                aria-describedby="news-image-hint"
                            />
                            <p id="news-image-hint" className={`${styles.hint} ${showError('image_url') ? styles.hintError : ''}`}>
                                {showError('image_url') ?? 'Un link público (https://). Una ruta de tu compu no sirve: nadie más la ve.'}
                            </p>
                        </div>
                    </section>

                    <section className={styles.card} aria-labelledby="sec-clas">
                        <h2 id="sec-clas" className={styles.cardTitle}>Dónde se muestra</h2>
                        <div className={styles.fieldRow}>
                            <div className={styles.field}>
                                <label htmlFor="news-sport" className={styles.label}>Deporte</label>
                                <select
                                    id="news-sport"
                                    className={styles.select}
                                    value={customSport ? CUSTOM_SPORT : form.sport}
                                    onChange={(event) => {
                                        if (event.target.value === CUSTOM_SPORT) {
                                            setSportCustom(true);
                                            update('sport', '');
                                        } else {
                                            setSportCustom(false);
                                            update('sport', event.target.value);
                                        }
                                    }}
                                >
                                    {SPORTS.map((sport) => <option key={sport.id} value={sport.id}>{sport.label}</option>)}
                                    <option value={CUSTOM_SPORT}>Otro (escribirlo)</option>
                                </select>
                                {customSport ? (
                                    <>
                                        <label htmlFor="news-sport-custom" className={styles.srOnly}>Deporte propio</label>
                                        <input
                                            id="news-sport-custom"
                                            className={`${styles.input} ${showError('sport') ? styles.inputInvalid : ''}`}
                                            type="text"
                                            value={form.sport}
                                            placeholder="Rugby femenino, Seven, Fútbol 5…"
                                            maxLength={SPORT_MAX + 10}
                                            autoFocus={sportCustom}
                                            onChange={(event) => update('sport', event.target.value)}
                                            onBlur={() => touch('sport')}
                                            aria-invalid={Boolean(showError('sport'))}
                                        />
                                        <p className={`${styles.hint} ${showError('sport') ? styles.hintError : ''}`}>
                                            {showError('sport') ?? 'Una etiqueta propia. La portada no la filtra como deporte, pero sale en la nota y en las palabras clave.'}
                                        </p>
                                    </>
                                ) : (
                                    <p className={styles.hint}>La portada filtra por deporte.</p>
                                )}
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="news-scope" className={styles.label}>Alcance</label>
                                <select id="news-scope" className={styles.select} value={form.scope} onChange={(event) => update('scope', event.target.value)}>
                                    {SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
                                </select>
                                <p className={styles.hint}>General, o de un torneo, un club o una unión.</p>
                            </div>
                        </div>

                        <div className={styles.field}>
                            <div className={styles.labelRow}>
                                <label htmlFor="news-tags" className={styles.label}>Etiquetas <span className={styles.labelSoft}>(SEO)</span></label>
                                <span className={styles.counter}>{form.tags.length}/{TAGS_MAX}</span>
                            </div>
                            <div className={styles.tagBox} onClick={() => tagInputRef.current?.focus()}>
                                {form.tags.map((tag) => (
                                    <span key={tag} className={styles.tagChip}>
                                        {tag}
                                        <button type="button" className={styles.tagRemove} onClick={() => removeTag(tag)} aria-label={`Quitar la etiqueta ${tag}`}>
                                            <X size={13} aria-hidden="true" />
                                        </button>
                                    </span>
                                ))}
                                <input
                                    id="news-tags"
                                    ref={tagInputRef}
                                    className={styles.tagInput}
                                    type="text"
                                    value={tagDraft}
                                    placeholder={form.tags.length === 0 ? 'urba, top 14, final, alumni…' : ''}
                                    maxLength={TAG_MAX}
                                    autoComplete="off"
                                    disabled={form.tags.length >= TAGS_MAX}
                                    onChange={(event) => setTagDraft(event.target.value)}
                                    onKeyDown={onTagKeyDown}
                                    onPaste={onTagPaste}
                                    onBlur={() => addTag(tagDraft)}
                                    aria-describedby="news-tags-hint"
                                />
                            </div>
                            {tagNotice && <p className={`${styles.hint} ${styles.hintError}`} role="status">{tagNotice}</p>}
                            <p id="news-tags-hint" className={styles.hint}>
                                {form.tags.length >= TAGS_MAX
                                    ? `Tope de ${TAGS_MAX} etiquetas. Quitá una para agregar otra.`
                                    : 'Enter o coma para agregar; también podés pegar una lista separada por comas. Van a las palabras clave y al Open Graph de la nota, y a la búsqueda de la portada.'}
                            </p>
                        </div>
                    </section>

                    {error && (
                        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                            <AlertCircle size={18} aria-hidden="true" />
                            <span>{error}</span>
                        </div>
                    )}
                    {warning && (
                        <div className={`${styles.notice} ${styles.noticeWarning}`} role="status">
                            <AlertTriangle size={18} aria-hidden="true" />
                            <span>{warning}</span>
                        </div>
                    )}
                    {success && (
                        <div className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
                            <CheckCircle2 size={18} aria-hidden="true" />
                            <span>
                                {success}
                                {recordId && <> <Link href={newsPath({ id: recordId, title: form.title })} target="_blank" rel="noopener noreferrer">Ver la nota</Link></>}
                            </span>
                        </div>
                    )}

                    <div className={styles.actionBar}>
                        <p className={styles.actionStatus} aria-live="polite">
                            <strong>{STATUS_LABELS[status]}</strong> · {actionHint}
                        </p>
                        <div className={styles.actionButtons}>
                            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={cancel} disabled={busy !== null}>
                                Cancelar
                            </button>
                            {isPublished ? (
                                <>
                                    <button type="button" className={styles.btn} onClick={() => void persist('unpublish')} disabled={busy !== null}>
                                        {busy === 'unpublish' ? 'Despublicando…' : 'Despublicar'}
                                    </button>
                                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy !== null}>
                                        {busy === 'save' ? 'Guardando…' : 'Guardar cambios'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button type="submit" className={styles.btn} disabled={busy !== null}>
                                        {busy === 'save' ? 'Guardando…' : 'Guardar borrador'}
                                    </button>
                                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void persist('publish')} disabled={busy !== null}>
                                        {busy === 'publish' ? 'Publicando…' : 'Publicar'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {recordId && (
                        <section className={`${styles.card} ${styles.dangerZone}`} aria-labelledby="sec-borrar">
                            <div className={styles.dangerRow}>
                                <div>
                                    <h2 id="sec-borrar" className={styles.cardTitle}>Eliminar la noticia</h2>
                                    <p className={styles.hint}>Desaparece de la portada y del buscador. No se puede deshacer.</p>
                                </div>
                                <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => void remove()} disabled={busy !== null}>
                                    <Trash2 size={16} aria-hidden="true" /> {busy === 'delete' ? 'Eliminando…' : 'Eliminar'}
                                </button>
                            </div>
                        </section>
                    )}
                </form>

                <aside className={`${styles.preview} ${previewOpen ? '' : styles.previewHidden}`} aria-label="Vista previa">
                    <div className={styles.previewHead}>
                        <h2 className={styles.cardTitle}>{previewTab === 'card' ? 'Así se ve en la portada' : 'Así se lee la nota'}</h2>
                        <div className={styles.previewTabs} role="tablist" aria-label="Qué vista previa mostrar">
                            <button
                                type="button"
                                role="tab"
                                id="preview-tab-card"
                                aria-selected={previewTab === 'card'}
                                aria-controls="preview-panel"
                                className={`${styles.previewTab} ${previewTab === 'card' ? styles.previewTabActive : ''}`}
                                onClick={() => setPreviewTab('card')}
                            >
                                Tarjeta
                            </button>
                            <button
                                type="button"
                                role="tab"
                                id="preview-tab-article"
                                aria-selected={previewTab === 'article'}
                                aria-controls="preview-panel"
                                className={`${styles.previewTab} ${previewTab === 'article' ? styles.previewTabActive : ''}`}
                                onClick={() => setPreviewTab('article')}
                            >
                                Nota
                            </button>
                        </div>
                    </div>

                    {previewTab === 'article' ? (
                        <div id="preview-panel" role="tabpanel" aria-labelledby="preview-tab-article" className={styles.articlePreview}>
                            {form.title.trim() && <h3 className={styles.articlePreviewTitle}>{form.title.trim()}</h3>}
                            {form.summary.trim() && <p className={styles.articlePreviewSummary}>{form.summary.trim()}</p>}
                            <NewsBody
                                content={form.content}
                                mentions={previewMentions}
                                title={form.title.trim() || undefined}
                                empty={<p className={styles.articlePreviewEmpty}>Escribí el contenido y acá se ve cómo queda.</p>}
                            />
                        </div>
                    ) : (
                    <div id="preview-panel" role="tabpanel" aria-labelledby="preview-tab-card" className={styles.previewCard}>
                        <div className={styles.previewMedia}>
                            {imageOk && !imageBroken ? (
                                // eslint-disable-next-line @next/next/no-img-element -- la misma imagen de la nota.
                                <img src={image} alt="" />
                            ) : (
                                <span className={styles.previewNoImage} aria-hidden="true"><Newspaper size={28} /></span>
                            )}
                        </div>
                        <div className={styles.previewBody}>
                            <div className={styles.previewMeta}>
                                <span className={styles.previewScope}>{scopeLabel}</span>
                                <span>{previewDate}</span>
                            </div>
                            <h3 className={`${styles.previewTitle} ${form.title.trim() ? '' : styles.previewTitleEmpty}`}>
                                {form.title.trim() || 'El título de la nota'}
                            </h3>
                            <p className={styles.previewExcerpt}>{excerptOf(form)}</p>
                            {form.tags.length > 0 && (
                                <div className={styles.previewTags} aria-label="Etiquetas">
                                    {form.tags.map((tag) => <span key={tag} className={styles.previewTag}>{tag}</span>)}
                                </div>
                            )}
                            <span className={styles.previewCta}>Leer la nota →</span>
                        </div>
                    </div>
                    )}

                    <ul className={styles.previewStats} aria-label="Medidas de la nota">
                        <li className={styles.previewStat}>
                            <span className={styles.previewStatValue}>{words}</span>
                            <span className={styles.previewStatLabel}>palabras</span>
                        </li>
                        <li className={styles.previewStat}>
                            <span className={styles.previewStatValue}>{minutes}</span>
                            <span className={styles.previewStatLabel}>min de lectura</span>
                        </li>
                        <li className={styles.previewStat}>
                            <span className={styles.previewStatValue}>{paragraphs}</span>
                            <span className={styles.previewStatLabel}>{paragraphs === 1 ? 'párrafo' : 'párrafos'}</span>
                        </li>
                        {bodyImages > 0 && (
                            <li className={styles.previewStat}>
                                <span className={styles.previewStatValue}>{bodyImages}</span>
                                <span className={styles.previewStatLabel}>{bodyImages === 1 ? 'foto en el texto' : 'fotos en el texto'}</span>
                            </li>
                        )}
                        {bodyMentions > 0 && (
                            <li className={styles.previewStat}>
                                <span className={styles.previewStatValue}>{bodyMentions}</span>
                                <span className={styles.previewStatLabel}>{bodyMentions === 1 ? 'etiqueta en el texto' : 'etiquetas en el texto'}</span>
                            </li>
                        )}
                    </ul>

                    <ul className={styles.checklist} aria-label="Qué le falta a la nota">
                        {checklist.map((item) => (
                            <li key={item.label} className={`${styles.checkItem} ${item.done ? styles.checkDone : ''}`}>
                                {item.done ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
                                {item.label}
                            </li>
                        ))}
                    </ul>
                </aside>
            </div>
        </div>
    );
}
