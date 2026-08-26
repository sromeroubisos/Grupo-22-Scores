'use client';

// El editor de noticias del super admin: crear, editar, publicar, despublicar
// y eliminar. Vive en el shell oscuro del admin.
//
// Lo que cuida: etiquetas visibles, validación en línea (al salir del campo
// y al guardar) que dice qué falta, subida de la imagen al bucket `news` (o
// una URL), deporte y alcance elegidos de una lista (no texto libre: la
// portada filtra por esos ids), vista previa de la tarjeta tal como se ve en
// /noticias, y aviso al irse con cambios sin guardar.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Circle, Eye, EyeOff, ImagePlus, Newspaper, Trash2 } from 'lucide-react';

import styles from './NewsEditor.module.css';

type NewsStatus = 'draft' | 'published' | 'archived';

interface NewsForm {
    title: string;
    summary: string;
    content: string;
    image_url: string;
    sport: string;
    scope: string;
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
}

type NewsEditorClientProps = {
    newsId?: string;
};

const EMPTY: NewsForm = { title: '', summary: '', content: '', image_url: '', sport: 'rugby', scope: 'global' };

// Los mismos topes que valida la API.
const TITLE_MAX = 140;
const SUMMARY_MAX = 280;
const CONTENT_MAX = 20000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

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
    return errors;
}

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function paragraphCount(text: string): number {
    return text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).length;
}

function excerptOf(form: NewsForm): string {
    const summary = form.summary.trim();
    if (summary) return summary;
    const content = form.content.trim();
    if (!content) return 'Abrir para leer la noticia completa.';
    return content.length > 160 ? `${content.slice(0, 157)}...` : content;
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
    const titleRef = useRef<HTMLInputElement | null>(null);

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

    // ── La imagen ──

    async function uploadImage(file: File) {
        setImageError(null);
        if (!IMAGE_TYPES.includes(file.type)) {
            setImageError('Formato no soportado: usá JPG, PNG, WebP, GIF o AVIF.');
            return;
        }
        if (file.size > IMAGE_MAX_BYTES) {
            setImageError('La imagen pesa más de 5 MB. Achicala antes de subirla.');
            return;
        }
        setUploading(true);
        try {
            const body = new FormData();
            body.append('file', file);
            const response = await fetch('/api/news/image', { method: 'POST', body, credentials: 'same-origin' });
            const payload = await response.json().catch(() => null);
            if (!response.ok || typeof payload?.url !== 'string') {
                setImageError(typeof payload?.error === 'string' ? payload.error : 'No se pudo subir la imagen. Probá de nuevo.');
                return;
            }
            update('image_url', payload.url);
            touch('image_url');
        } catch {
            setImageError('No se pudo subir la imagen. Revisá la conexión y probá de nuevo.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    function onFilePicked(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) void uploadImage(file);
    }

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
            const response = await fetch('/api/news', {
                method: recordId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    id: recordId ?? undefined,
                    title: form.title.trim(),
                    summary: form.summary.trim(),
                    content: form.content.trim(),
                    image_url: image || null,
                    sport: form.sport.trim() || null,
                    scope: form.scope,
                    ...(nextStatus ? { status: nextStatus } : {}),
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo guardar la noticia.');

            const record = (payload?.data ?? null) as NewsRecord | null;
            const id = record?.id ?? recordId;
            const finalStatus: NewsStatus = record?.status ?? nextStatus ?? status;
            const snapshot: NewsForm = record ? toForm(record) : { ...form };

            setSaved(snapshot);
            setForm(snapshot);
            setStatus(finalStatus);
            setPublishedAt(record?.published_at ?? publishedAt);
            setSavedAt(new Date());
            setSuccess(
                finalStatus === 'published'
                    ? (mode === 'publish' ? 'Noticia publicada. Ya se ve en la portada.' : 'Cambios guardados. La nota sigue publicada.')
                    : (mode === 'unpublish' ? 'La nota volvió a borrador: ya no se ve en público.' : 'Borrador guardado. Solo el super admin lo ve hasta publicarlo.'),
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
            const response = await fetch(`/api/news?id=${encodeURIComponent(recordId)}`, { method: 'DELETE', credentials: 'same-origin' });
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

    const sportOptions = SPORTS.some((sport) => sport.id === form.sport)
        ? SPORTS
        : [...SPORTS, { id: form.sport, label: form.sport || 'Sin deporte' }];
    const words = wordCount(`${form.summary} ${form.content}`);
    const minutes = Math.max(1, Math.ceil(words / 220));
    const paragraphs = paragraphCount(form.content);
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
                    <p className={styles.eyebrow}>Super admin · Noticias</p>
                    <h1 className={styles.title}>{recordId ? 'Editar noticia' : 'Nueva noticia'}</h1>
                    <p className={styles.lede}>
                        Un borrador lo ve solo el super admin. Al publicar, la nota sale en la portada de noticias.
                    </p>
                </div>
                <div className={styles.statusCluster}>
                    <span className={`${styles.statusPill} ${isPublished ? styles.statusPublished : styles.statusDraft}`}>
                        <span className={styles.statusDot} aria-hidden="true" />
                        {STATUS_LABELS[status]}
                    </span>
                    {recordId && (
                        <Link href={`/noticias/${recordId}`} className={styles.viewLink} target="_blank" rel="noopener noreferrer">
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
                            <textarea
                                id="news-content"
                                className={`${styles.textarea} ${showError('content') ? styles.inputInvalid : ''}`}
                                value={form.content}
                                placeholder={'El texto de la nota.\n\nSepará los párrafos con una línea en blanco: así se muestran en la página.'}
                                onChange={(event) => update('content', event.target.value)}
                                onBlur={() => touch('content')}
                                aria-invalid={Boolean(showError('content'))}
                                aria-describedby="news-content-hint"
                            />
                            <p id="news-content-hint" className={`${styles.hint} ${showError('content') ? styles.hintError : ''}`}>
                                {showError('content') ?? 'Separá los párrafos con una línea en blanco. El primero sale destacado.'}
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
                                <select id="news-sport" className={styles.select} value={form.sport} onChange={(event) => update('sport', event.target.value)}>
                                    {sportOptions.map((sport) => <option key={sport.id} value={sport.id}>{sport.label}</option>)}
                                </select>
                                <p className={styles.hint}>La portada filtra por deporte.</p>
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="news-scope" className={styles.label}>Alcance</label>
                                <select id="news-scope" className={styles.select} value={form.scope} onChange={(event) => update('scope', event.target.value)}>
                                    {SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
                                </select>
                                <p className={styles.hint}>General, o de un torneo, un club o una unión.</p>
                            </div>
                        </div>
                    </section>

                    {error && (
                        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                            <AlertCircle size={18} aria-hidden="true" />
                            <span>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
                            <CheckCircle2 size={18} aria-hidden="true" />
                            <span>
                                {success}
                                {recordId && <> <Link href={`/noticias/${recordId}`} target="_blank" rel="noopener noreferrer">Ver la nota</Link></>}
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
                        <h2 className={styles.cardTitle}>Así se ve en la portada</h2>
                        <span className={styles.counter}>Vista previa</span>
                    </div>

                    <div className={styles.previewCard}>
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
                            <span className={styles.previewCta}>Leer la nota →</span>
                        </div>
                    </div>

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
