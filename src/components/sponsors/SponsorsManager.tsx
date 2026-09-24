'use client';

/**
 * Gestión de sponsors de un club o de un torneo. La misma pieza vive en la
 * pestaña Sponsors de los dos gestores; sólo cambia el dueño.
 *
 * La imagen se valida en el momento (proporción y calidad mínima, con la regla
 * de lib/sponsors/formats.ts) y la vista previa es el archivo que se va a
 * subir, no el original: si hubo que recortar o encajar, se ve el resultado.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Crop,
    ImagePlus,
    Loader2,
    Maximize,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';

import {
    SPONSOR_ACCEPTED_LABEL,
    SPONSOR_ACCEPTED_MIME,
    SPONSOR_FORMATS,
    SPONSOR_FORMAT_ORDER,
    SPONSOR_MAX_UPLOAD_LABEL,
    SPONSOR_NAME_MAX,
    checkSponsorImage,
    type Sponsor,
    type SponsorFormat,
    type SponsorImageCheck,
    type SponsorOwnerType,
} from '@/lib/sponsors/formats';
import {
    checkAdaptedSource,
    formatBytes,
    loadSponsorSource,
    renderSponsorImage,
    validateSponsorFile,
    type LoadedSponsorSource,
    type RenderedSponsorImage,
    type SponsorAdaptMode,
} from './sponsorImage';
import styles from './SponsorsManager.module.css';

type Notify = (text: string, kind?: 'ok' | 'error') => void;
type AdaptChoice = Exclude<SponsorAdaptMode, 'as-is'>;

export interface SponsorsManagerProps {
    ownerType: SponsorOwnerType;
    ownerId: string;
    /** El toast del gestor que lo contiene. Sin él, el aviso sale dentro de la sección. */
    notify?: Notify;
}

interface EditorState {
    mode: 'create' | 'edit';
    sponsor: Sponsor | null;
    name: string;
    format: SponsorFormat;
    isActive: boolean;
    source: LoadedSponsorSource | null;
    fileError: string | null;
    adapt: AdaptChoice | null;
}

/** Cómo quedó la imagen elegida frente al formato. */
type ImageStatus =
    | { kind: 'ready'; mode: SponsorAdaptMode }
    | { kind: 'too-small'; message: string }
    | { kind: 'needs-adapt'; message: string; crop: SponsorImageCheck; fit: SponsorImageCheck; chosen: AdaptChoice | null };

const OWNER_LABEL: Record<SponsorOwnerType, string> = { club: 'del club', tournament: 'del torneo' };

function emptyEditor(): EditorState {
    return { mode: 'create', sponsor: null, name: '', format: 'logo', isActive: true, source: null, fileError: null, adapt: null };
}

function editorFor(sponsor: Sponsor): EditorState {
    return {
        mode: 'edit',
        sponsor,
        name: sponsor.name,
        format: sponsor.format,
        isActive: sponsor.isActive,
        source: null,
        fileError: null,
        adapt: null,
    };
}

async function readJson(response: Response) {
    return response.json().catch(() => null) as Promise<{ data?: unknown; error?: string } | null>;
}

function imageStatusFor(source: LoadedSponsorSource, format: SponsorFormat, adapt: AdaptChoice | null): ImageStatus {
    const direct = checkSponsorImage(format, source.width, source.height);
    if (direct.ok) return { kind: 'ready', mode: 'as-is' };
    if (direct.reason === 'small') return { kind: 'too-small', message: direct.message };

    const crop = checkAdaptedSource(format, 'crop', source.width, source.height);
    const fit = checkAdaptedSource(format, 'fit', source.width, source.height);
    const chosenCheck = adapt === 'crop' ? crop : adapt === 'fit' ? fit : null;
    if (adapt && chosenCheck?.ok) return { kind: 'ready', mode: adapt };
    return { kind: 'needs-adapt', message: direct.message, crop, fit, chosen: adapt };
}

export function SponsorsManager({ ownerType, ownerId, notify }: SponsorsManagerProps) {
    const [sponsors, setSponsors] = useState<Sponsor[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [rendered, setRendered] = useState<RenderedSponsorImage | null>(null);
    const [rendering, setRendering] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [localMessage, setLocalMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
    const editorRef = useRef<HTMLElement | null>(null);
    const fieldId = useId();

    const say = useCallback<Notify>((text, kind = 'ok') => {
        if (notify) notify(text, kind);
        else setLocalMessage({ text, kind });
    }, [notify]);

    const query = useMemo(
        () => new URLSearchParams({ ownerType, ownerId, scope: 'manage' }).toString(),
        [ownerType, ownerId],
    );

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetch(`/api/sponsors?${query}`, { cache: 'no-store' });
            const payload = await readJson(response);
            if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los sponsors.');
            setSponsors(Array.isArray(payload?.data) ? (payload.data as Sponsor[]) : []);
        } catch (caught) {
            setLoadError(caught instanceof Error ? caught.message : 'No se pudieron cargar los sponsors.');
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => { void load(); }, [load]);

    // ── Imagen: validar y preparar la vista previa ─────────────────────────

    const source = editor?.source ?? null;
    const format = editor?.format ?? 'logo';
    const adapt = editor?.adapt ?? null;

    const status = useMemo(
        () => (source ? imageStatusFor(source, format, adapt) : null),
        [source, format, adapt],
    );
    const renderMode = status?.kind === 'ready' ? status.mode : null;

    useEffect(() => {
        if (!source || !renderMode) {
            setRendered(null);
            return;
        }
        let cancelled = false;
        setRendering(true);
        renderSponsorImage(source, format, renderMode)
            .then((result) => {
                if (cancelled) {
                    URL.revokeObjectURL(result.previewUrl);
                    return;
                }
                setRendered(result);
            })
            .catch((caught) => {
                if (cancelled) return;
                setRendered(null);
                setEditor((prev) => prev && {
                    ...prev,
                    fileError: caught instanceof Error ? caught.message : 'No pudimos preparar la imagen.',
                });
            })
            .finally(() => { if (!cancelled) setRendering(false); });
        return () => { cancelled = true; };
    }, [source, format, renderMode]);

    // Cada vista previa es un object URL: se libera al reemplazarla.
    useEffect(() => () => { if (rendered) URL.revokeObjectURL(rendered.previewUrl); }, [rendered]);

    const pickFile = async (file: File | null | undefined) => {
        if (!file || !editor) return;
        const problem = validateSponsorFile(file);
        if (problem) {
            setEditor((prev) => prev && { ...prev, source: null, fileError: problem, adapt: null });
            return;
        }
        try {
            const loaded = await loadSponsorSource(file);
            setEditor((prev) => prev && { ...prev, source: loaded, fileError: null, adapt: null });
        } catch {
            setEditor((prev) => prev && {
                ...prev,
                source: null,
                fileError: 'No pudimos abrir la imagen. Probá exportarla de nuevo como PNG o JPG.',
                adapt: null,
            });
        }
    };

    // ── Qué falta para poder guardar ───────────────────────────────────────

    const existing = editor?.sponsor ?? null;
    const formatChangedWithoutImage = Boolean(editor && existing && !source && editor.format !== existing.format);
    const existingFitsFormat = !editor || !existing || !existing.imageWidth || !existing.imageHeight
        ? true
        : checkSponsorImage(editor.format, existing.imageWidth, existing.imageHeight).ok;

    const blocker = (() => {
        if (!editor) return null;
        const spec = SPONSOR_FORMATS[editor.format];
        if (!editor.name.trim()) return 'Escribí el nombre de la marca para guardar.';
        if (editor.fileError) return 'Elegí otra imagen para guardar.';
        if (editor.mode === 'create' && !source) return 'Elegí la imagen del sponsor para guardar.';
        if (status?.kind === 'too-small') return 'La imagen no llega a la calidad mínima: elegí otra.';
        if (status?.kind === 'needs-adapt') return `Elegí cómo adaptar la imagen a ${spec.ratioLabel} para guardar.`;
        if (source && (rendering || !rendered)) return 'Preparando la vista previa…';
        if (formatChangedWithoutImage && !existingFitsFormat) {
            return `Subí una imagen ${spec.ratioLabel} para pasarlo a ${spec.label.toLowerCase()}.`;
        }
        if (editor.mode === 'edit' && existing && !source
            && editor.name.trim() === existing.name
            && editor.format === existing.format
            && editor.isActive === existing.isActive) {
            return 'No hay cambios para guardar.';
        }
        return null;
    })();

    const previewSrc = rendered?.previewUrl
        ?? (!source && existing && existingFitsFormat ? existing.imageUrl : undefined);

    // ── Acciones ───────────────────────────────────────────────────────────

    const openEditor = (next: EditorState) => {
        setEditor(next);
        setLocalMessage(null);
        requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const closeEditor = () => {
        setEditor(null);
        setRendered(null);
    };

    const uploadRendered = async (image: RenderedSponsorImage, targetFormat: SponsorFormat) => {
        const extension = image.blob.type === 'image/webp' ? 'webp' : image.blob.type === 'image/png' ? 'png' : 'jpg';
        const form = new FormData();
        form.set('ownerType', ownerType);
        form.set('ownerId', ownerId);
        form.set('format', targetFormat);
        form.set('file', new File([image.blob], `sponsor.${extension}`, { type: image.blob.type }));
        const response = await fetch('/api/sponsors/upload', { method: 'POST', body: form });
        const payload = await readJson(response);
        if (!response.ok) throw new Error(payload?.error || 'No se pudo subir la imagen.');
        return payload?.data as { url: string; width: number; height: number };
    };

    const save = async () => {
        if (!editor || blocker) return;
        setSaving(true);
        try {
            const uploaded = rendered ? await uploadRendered(rendered, editor.format) : null;
            const name = editor.name.trim();

            if (editor.mode === 'create') {
                const response = await fetch('/api/sponsors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ownerType,
                        ownerId,
                        name,
                        format: editor.format,
                        isActive: editor.isActive,
                        imageUrl: uploaded?.url,
                        imageWidth: uploaded?.width,
                        imageHeight: uploaded?.height,
                    }),
                });
                const payload = await readJson(response);
                if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar el sponsor.');
                say(`${name} quedó cargado`);
            } else if (existing) {
                const changes: Record<string, unknown> = {};
                if (name !== existing.name) changes.name = name;
                if (editor.isActive !== existing.isActive) changes.isActive = editor.isActive;
                if (editor.format !== existing.format) changes.format = editor.format;
                if (uploaded) {
                    changes.format = editor.format;
                    changes.imageUrl = uploaded.url;
                    changes.imageWidth = uploaded.width;
                    changes.imageHeight = uploaded.height;
                }
                const response = await fetch(`/api/sponsors/${encodeURIComponent(existing.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(changes),
                });
                const payload = await readJson(response);
                if (!response.ok) throw new Error(payload?.error || 'No se pudo actualizar el sponsor.');
                say('Cambios guardados');
            }

            closeEditor();
            await load();
        } catch (caught) {
            say(caught instanceof Error ? caught.message : 'No se pudo guardar el sponsor.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (sponsor: Sponsor) => {
        setBusyId(sponsor.id);
        try {
            const response = await fetch(`/api/sponsors/${encodeURIComponent(sponsor.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !sponsor.isActive }),
            });
            const payload = await readJson(response);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo cambiar el estado.');
            setSponsors((prev) => prev.map((item) => (item.id === sponsor.id ? { ...item, isActive: !item.isActive } : item)));
            say(sponsor.isActive ? `${sponsor.name} ya no se muestra` : `${sponsor.name} vuelve a mostrarse`);
        } catch (caught) {
            say(caught instanceof Error ? caught.message : 'No se pudo cambiar el estado.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (sponsor: Sponsor) => {
        if (!window.confirm(`¿Borrar a ${sponsor.name}? Si sólo querés sacarlo un tiempo, desactivalo.`)) return;
        setBusyId(sponsor.id);
        try {
            const response = await fetch(`/api/sponsors/${encodeURIComponent(sponsor.id)}`, { method: 'DELETE' });
            const payload = await readJson(response);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo borrar el sponsor.');
            if (editor?.sponsor?.id === sponsor.id) closeEditor();
            setSponsors((prev) => prev.filter((item) => item.id !== sponsor.id));
            say(`${sponsor.name} fue borrado`);
        } catch (caught) {
            say(caught instanceof Error ? caught.message : 'No se pudo borrar el sponsor.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const grouped = useMemo(() => {
        const byFormat: Record<SponsorFormat, Sponsor[]> = { banner: [], logo: [] };
        for (const sponsor of sponsors) byFormat[sponsor.format].push(sponsor);
        return byFormat;
    }, [sponsors]);

    const move = async (sponsor: Sponsor, direction: -1 | 1) => {
        const group = [...grouped[sponsor.format]];
        const index = group.findIndex((item) => item.id === sponsor.id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= group.length) return;
        [group[index], group[target]] = [group[target], group[index]];

        const nextGroups = { ...grouped, [sponsor.format]: group };
        const ordered = SPONSOR_FORMAT_ORDER.flatMap((key) => nextGroups[key]);
        const previous = sponsors;
        setSponsors(ordered);
        setBusyId(sponsor.id);
        try {
            const response = await fetch('/api/sponsors/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ownerType, ownerId, ids: ordered.map((item) => item.id) }),
            });
            const payload = await readJson(response);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar el orden.');
            if (Array.isArray(payload?.data)) setSponsors(payload.data as Sponsor[]);
        } catch (caught) {
            setSponsors(previous);
            say(caught instanceof Error ? caught.message : 'No se pudo guardar el orden.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className={styles.loading} role="status">
                <Loader2 size={16} className={styles.spin} aria-hidden="true" />
                Cargando sponsors…
            </div>
        );
    }

    const activeCount = sponsors.filter((sponsor) => sponsor.isActive).length;
    const spec = editor ? SPONSOR_FORMATS[editor.format] : null;

    return (
        <div className={styles.root}>
            <section className={styles.card} aria-labelledby={`${fieldId}-title`}>
                <div className={styles.head}>
                    <div>
                        <h2 id={`${fieldId}-title`} className={styles.title}>Sponsors</h2>
                        <p className={styles.subtitle}>
                            {sponsors.length === 0
                                ? `Las marcas que acompañan. Aparecen solas en la página pública ${OWNER_LABEL[ownerType]}.`
                                : `${activeCount} de ${sponsors.length} ${activeCount === 1 ? 'se muestra' : 'se muestran'} en la página pública ${OWNER_LABEL[ownerType]}.`}
                        </p>
                    </div>
                    {!editor && (
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => openEditor(emptyEditor())}>
                            <Plus size={15} aria-hidden="true" />
                            Agregar sponsor
                        </button>
                    )}
                </div>

                {loadError && <div className={styles.alert} role="alert">{loadError}</div>}
                {localMessage && (
                    <div
                        className={localMessage.kind === 'error' ? styles.alert : styles.notice}
                        role={localMessage.kind === 'error' ? 'alert' : 'status'}
                    >
                        {localMessage.text}
                    </div>
                )}
            </section>

            {editor && spec && (
                <section
                    ref={editorRef}
                    className={`${styles.card} ${styles.editor}`}
                    aria-labelledby={`${fieldId}-editor-title`}
                >
                    <div className={styles.head}>
                        <div>
                            <h3 id={`${fieldId}-editor-title`} className={styles.title}>
                                {editor.mode === 'create' ? 'Nuevo sponsor' : `Editar ${editor.sponsor?.name ?? 'sponsor'}`}
                            </h3>
                            <p className={styles.subtitle}>
                                La imagen se achica y se optimiza sola. Lo que ves en la vista previa es lo que se guarda.
                            </p>
                        </div>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnIcon}`}
                            onClick={closeEditor}
                            aria-label="Cerrar sin guardar"
                            disabled={saving}
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>

                    <div className={styles.editorGrid}>
                        <div className={styles.editorFields}>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor={`${fieldId}-name`}>Nombre de la marca</label>
                                <input
                                    id={`${fieldId}-name`}
                                    className={styles.input}
                                    placeholder="Banco Macro"
                                    maxLength={SPONSOR_NAME_MAX}
                                    value={editor.name}
                                    onChange={(event) => setEditor((prev) => prev && { ...prev, name: event.target.value })}
                                />
                                <span className={styles.hint}>Es también el texto alternativo de la imagen.</span>
                            </div>

                            <div className={styles.field}>
                                <span className={styles.label} id={`${fieldId}-format`}>Tipo de sponsor</span>
                                <div className={styles.formatOptions} role="radiogroup" aria-labelledby={`${fieldId}-format`}>
                                    {SPONSOR_FORMAT_ORDER.map((key) => {
                                        const option = SPONSOR_FORMATS[key];
                                        const checked = editor.format === key;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                role="radio"
                                                aria-checked={checked}
                                                className={`${styles.option}${checked ? ` ${styles.optionOn}` : ''}`}
                                                onClick={() => setEditor((prev) => prev && { ...prev, format: key, adapt: null })}
                                            >
                                                <span
                                                    className={`${styles.glyph} ${key === 'banner' ? styles.glyphBanner : styles.glyphLogo}`}
                                                    aria-hidden="true"
                                                />
                                                <span className={styles.optionText}>
                                                    <strong>{option.label} {option.ratioLabel}</strong>
                                                    <span>{option.usage}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <dl className={styles.specs}>
                                    <div><dt>Recomendado</dt><dd>{spec.recommended.width} × {spec.recommended.height} px</dd></div>
                                    <div><dt>Mínimo</dt><dd>{spec.minimum.width} × {spec.minimum.height} px</dd></div>
                                    <div><dt>Archivo</dt><dd>{SPONSOR_ACCEPTED_LABEL}, hasta {SPONSOR_MAX_UPLOAD_LABEL}</dd></div>
                                </dl>
                            </div>

                            <div className={styles.field}>
                                <span className={styles.label}>Imagen</span>
                                <label
                                    className={styles.drop}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        void pickFile(event.dataTransfer.files?.[0]);
                                    }}
                                >
                                    <input
                                        type="file"
                                        className={styles.fileInput}
                                        accept={SPONSOR_ACCEPTED_MIME.join(',')}
                                        onChange={(event) => {
                                            void pickFile(event.target.files?.[0]);
                                            event.target.value = '';
                                        }}
                                    />
                                    <ImagePlus size={20} aria-hidden="true" />
                                    <span>
                                        <strong>{source || existing ? 'Cambiar imagen' : 'Elegir imagen'}</strong>
                                        {' '}o arrastrala acá
                                    </span>
                                    {source && (
                                        <span className={styles.hint}>
                                            {source.fileName} · {source.width} × {source.height} · {formatBytes(source.fileBytes)}
                                        </span>
                                    )}
                                </label>

                                {editor.fileError && <div className={styles.alert} role="alert">{editor.fileError}</div>}

                                {status?.kind === 'too-small' && (
                                    <div className={styles.alert} role="alert">{status.message}</div>
                                )}

                                {status?.kind === 'needs-adapt' && (
                                    <div className={styles.alert} role="alert">
                                        {status.message} Podés adaptarla acá o subir otra.
                                    </div>
                                )}

                                {source && status?.kind !== 'too-small' && renderModeIsAdapted(status, adapt) && (
                                    <div className={styles.adapt} role="radiogroup" aria-label="Cómo adaptar la imagen">
                                        <AdaptButton
                                            label="Recortar al centro"
                                            hint="Llena el formato. Se pierden los bordes."
                                            icon={<Crop size={15} aria-hidden="true" />}
                                            checked={adapt === 'crop'}
                                            problem={adaptProblem(source, editor.format, 'crop')}
                                            onSelect={() => setEditor((prev) => prev && { ...prev, adapt: 'crop' })}
                                        />
                                        <AdaptButton
                                            label="Encajar sin recortar"
                                            hint="Entra entera. Suma márgenes transparentes."
                                            icon={<Maximize size={15} aria-hidden="true" />}
                                            checked={adapt === 'fit'}
                                            problem={adaptProblem(source, editor.format, 'fit')}
                                            onSelect={() => setEditor((prev) => prev && { ...prev, adapt: 'fit' })}
                                        />
                                    </div>
                                )}

                                {formatChangedWithoutImage && !existingFitsFormat && (
                                    <div className={styles.alert} role="alert">
                                        La imagen actual no es {spec.ratioLabel}. Para pasarlo a {spec.label.toLowerCase()}, subí una imagen nueva.
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                className={styles.switch}
                                role="switch"
                                aria-checked={editor.isActive}
                                onClick={() => setEditor((prev) => prev && { ...prev, isActive: !prev.isActive })}
                            >
                                <span className={styles.switchTrack}><span className={styles.switchThumb} /></span>
                                {editor.isActive ? 'Se muestra en la página pública' : 'Guardado, pero oculto'}
                            </button>
                        </div>

                        <div className={styles.previewCol}>
                            <span className={styles.label}>Vista previa</span>
                            <PreviewFrame format={editor.format} name={editor.name} src={previewSrc} busy={rendering} />
                            {rendered && (
                                <span className={styles.hint}>
                                    Se guarda a {rendered.width} × {rendered.height} · {formatBytes(rendered.blob.size)} aprox.
                                </span>
                            )}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        {blocker && <span className={styles.blocker}>{blocker}</span>}
                        <button type="button" className={styles.btn} onClick={closeEditor} disabled={saving}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            onClick={save}
                            disabled={saving || Boolean(blocker)}
                        >
                            {saving && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}
                            {editor.mode === 'create' ? 'Guardar sponsor' : 'Guardar cambios'}
                        </button>
                    </div>
                </section>
            )}

            {sponsors.length === 0 && !loadError && !editor && (
                <section className={`${styles.card} ${styles.empty}`}>
                    <strong>Todavía no hay sponsors</strong>
                    <span>Cargá el primero con “Agregar sponsor”. Mientras no haya ninguno activo, la sección no aparece en la página pública.</span>
                </section>
            )}

            {SPONSOR_FORMAT_ORDER.map((key) => {
                const list = grouped[key];
                if (list.length === 0) return null;
                const option = SPONSOR_FORMATS[key];
                return (
                    <section key={key} className={styles.card} aria-labelledby={`${fieldId}-${key}`}>
                        <div className={styles.head}>
                            <div>
                                <h3 id={`${fieldId}-${key}`} className={styles.title}>
                                    {key === 'banner' ? 'Banners' : 'Logos'} {option.ratioLabel}
                                </h3>
                                <p className={styles.subtitle}>
                                    Se muestran en este orden. {key === 'banner' ? 'Van arriba de la grilla de logos.' : 'Van en grilla, debajo de los banners.'}
                                </p>
                            </div>
                        </div>
                        <ol className={styles.list}>
                            {list.map((sponsor, index) => {
                                const busy = busyId === sponsor.id;
                                return (
                                    <li key={sponsor.id} className={`${styles.row}${sponsor.isActive ? '' : ` ${styles.rowOff}`}`}>
                                        <span className={`${styles.thumb} ${key === 'banner' ? styles.thumbBanner : styles.thumbLogo}`}>
                                            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de nuestro bucket, ya optimizada. */}
                                            <img src={sponsor.imageUrl} alt="" loading="lazy" />
                                        </span>
                                        <div className={styles.rowMain}>
                                            <span className={styles.rowTitle}>{sponsor.name}</span>
                                            <span className={styles.rowSub}>
                                                <span className={sponsor.isActive ? styles.badgeOn : styles.badgeOff}>
                                                    {sponsor.isActive ? 'Visible' : 'Oculto'}
                                                </span>
                                                {sponsor.imageWidth && sponsor.imageHeight
                                                    ? `${sponsor.imageWidth} × ${sponsor.imageHeight}`
                                                    : null}
                                            </span>
                                        </div>
                                        <div className={styles.rowActions}>
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.btnIcon}`}
                                                onClick={() => move(sponsor, -1)}
                                                disabled={busy || index === 0}
                                                aria-label={`Subir a ${sponsor.name}`}
                                            >
                                                <ArrowUp size={15} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.btnIcon}`}
                                                onClick={() => move(sponsor, 1)}
                                                disabled={busy || index === list.length - 1}
                                                aria-label={`Bajar a ${sponsor.name}`}
                                            >
                                                <ArrowDown size={15} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.switch}
                                                role="switch"
                                                aria-checked={sponsor.isActive}
                                                aria-label={`Mostrar a ${sponsor.name} en la página pública`}
                                                onClick={() => toggleActive(sponsor)}
                                                disabled={busy}
                                            >
                                                <span className={styles.switchTrack}><span className={styles.switchThumb} /></span>
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.btnIcon}`}
                                                onClick={() => openEditor(editorFor(sponsor))}
                                                disabled={busy || saving}
                                                aria-label={`Editar a ${sponsor.name}`}
                                            >
                                                <Pencil size={15} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.btn} ${styles.btnIcon} ${styles.btnDanger}`}
                                                onClick={() => remove(sponsor)}
                                                disabled={busy}
                                                aria-label={`Borrar a ${sponsor.name}`}
                                            >
                                                {busy
                                                    ? <Loader2 size={15} className={styles.spin} aria-hidden="true" />
                                                    : <Trash2 size={15} aria-hidden="true" />}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                );
            })}
        </div>
    );
}

/**
 * Las opciones de adaptación se ven mientras la imagen no tenga la proporción,
 * también DESPUÉS de elegir una: así se puede cambiar de idea mirando la vista
 * previa.
 */
function renderModeIsAdapted(status: ImageStatus | null, adapt: AdaptChoice | null) {
    if (!status) return false;
    if (status.kind === 'needs-adapt') return true;
    return status.kind === 'ready' && status.mode !== 'as-is' && adapt !== null;
}

function adaptProblem(source: LoadedSponsorSource, format: SponsorFormat, mode: AdaptChoice) {
    const check = checkAdaptedSource(format, mode, source.width, source.height);
    return check.ok ? null : check.message;
}

function AdaptButton({
    label,
    hint,
    icon,
    checked,
    problem,
    onSelect,
}: {
    label: string;
    hint: string;
    icon: ReactNode;
    checked: boolean;
    problem: string | null;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            className={`${styles.option}${checked ? ` ${styles.optionOn}` : ''}`}
            onClick={onSelect}
            disabled={Boolean(problem)}
            title={problem ?? undefined}
        >
            <span className={styles.optionIcon}>{icon}</span>
            <span className={styles.optionText}>
                <strong>{label}</strong>
                <span>{problem ? 'Así no llega a la calidad mínima.' : hint}</span>
            </span>
        </button>
    );
}

function PreviewFrame({
    format,
    name,
    src,
    busy,
}: {
    format: SponsorFormat;
    name: string;
    src: string | undefined;
    busy: boolean;
}) {
    return (
        <div className={`${styles.preview} ${format === 'banner' ? styles.previewBanner : styles.previewLogo}`}>
            {busy ? (
                <span className={styles.previewEmpty} role="status">
                    <Loader2 size={18} className={styles.spin} aria-hidden="true" />
                    Preparando…
                </span>
            ) : src ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: local de la vista previa, next/image no lo sirve.
                <img src={src} alt={name.trim() ? `Vista previa de ${name.trim()}` : 'Vista previa del sponsor'} />
            ) : (
                <span className={styles.previewEmpty}>
                    {SPONSOR_FORMATS[format].label} {SPONSOR_FORMATS[format].ratioLabel}
                </span>
            )}
        </div>
    );
}
