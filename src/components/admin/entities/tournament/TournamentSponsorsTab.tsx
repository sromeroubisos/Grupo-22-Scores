'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Eye,
    EyeOff,
    Handshake,
    ImageIcon,
    Lock,
    Pencil,
    Plus,
    Trash2,
    Upload,
} from 'lucide-react';
import { Database } from '@/lib/database.types';
import {
    SPONSOR_DEFAULT_CURRENCY,
    SPONSOR_LOGO_MAX_BYTES,
    SPONSOR_NAME_MAX_LENGTH,
    formatSponsorAmount,
    summarizeSponsors,
    validateSponsorInput,
    validateSponsorLogoDataUrl,
    validateSponsorLogoFile,
    type TournamentSponsor,
    type TournamentSponsorStatus,
} from '@/lib/tournament/sponsors';
import './basalt.css';
import './sponsors-console.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface SponsorsTabProps {
    data: TournamentRow;
    id: string;
}

type FormState = {
    name: string;
    amount: string;
    status: TournamentSponsorStatus;
    website_url: string;
    /** URL guardada o data: URL recién elegida; '' = sin logo. */
    logo_url: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

type Feedback = { tone: 'success' | 'error' | 'warning'; text: string };

const EMPTY_FORM: FormState = {
    name: '',
    amount: '',
    status: 'active',
    website_url: '',
    logo_url: '',
};

const LOGO_MAX_EDGE = 1200;

function sponsorToForm(sponsor: TournamentSponsor): FormState {
    return {
        name: sponsor.name,
        amount: sponsor.amount === null ? '' : String(sponsor.amount),
        status: sponsor.status,
        website_url: sponsor.website_url ?? '',
        logo_url: sponsor.logo_url ?? '',
    };
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Reduce un bitmap grande antes de subirlo. Mantiene el formato original
 * cuando el navegador lo soporta (jpeg/webp) y cae a PNG si no. Un SVG no se
 * toca: se sube tal cual, validado por tamaño.
 */
async function prepareLogoDataUrl(file: File): Promise<string> {
    const raw = await readFileAsDataUrl(file);
    const mime = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    if (mime === 'image/svg+xml' || (!mime && file.name.toLowerCase().endsWith('.svg'))) {
        return raw;
    }

    const image = new Image();
    image.src = raw;
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('La imagen no se pudo procesar.'));
    });

    const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(image.width, image.height));
    if (scale >= 1) return raw;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const outputMime = mime === 'image/jpeg' || mime === 'image/webp' ? mime : 'image/png';
    return canvas.toDataURL(outputMime, 0.92);
}

export function TournamentSponsorsTab({ id }: SponsorsTabProps) {
    const [sponsors, setSponsors] = useState<TournamentSponsor[]>([]);
    const [loading, setLoading] = useState(true);
    const [schemaMissing, setSchemaMissing] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<FormErrors>({});
    const [saving, setSaving] = useState(false);
    const [logoBusy, setLogoBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const editorRef = useRef<HTMLElement | null>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);

    const summary = useMemo(() => summarizeSponsors(sponsors), [sponsors]);
    const currency = summary.currency || SPONSOR_DEFAULT_CURRENCY;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/tournaments/${id}/sponsors`, { cache: 'no-store', credentials: 'include' });
            const payload = await res.json().catch(() => ({}));
            if (res.status === 503 && payload?.code === 'sponsors_schema_missing') {
                setSchemaMissing(true);
                setSponsors([]);
                return;
            }
            if (!res.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudieron cargar los sponsors.');
            }
            setSchemaMissing(false);
            setSponsors(Array.isArray(payload?.data) ? payload.data : []);
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar los sponsors.' });
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!feedback || feedback.tone === 'error') return;
        const timeout = window.setTimeout(() => setFeedback(null), 5000);
        return () => window.clearTimeout(timeout);
    }, [feedback]);

    useEffect(() => {
        if (!editorOpen) return;
        editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        nameInputRef.current?.focus();
    }, [editorOpen, editingId]);

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setErrors({});
        setFeedback(null);
        setEditorOpen(true);
    };

    const openEdit = (sponsor: TournamentSponsor) => {
        setEditingId(sponsor.id);
        setForm(sponsorToForm(sponsor));
        setErrors({});
        setFeedback(null);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        if (saving) return;
        setEditorOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        setErrors({});
    };

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    };

    const handleLogoFile = async (file: File | null | undefined) => {
        if (!file) return;
        const fileError = validateSponsorLogoFile(file);
        if (fileError) {
            setErrors((current) => ({ ...current, logo_url: fileError }));
            return;
        }
        setLogoBusy(true);
        try {
            const dataUrl = await prepareLogoDataUrl(file);
            const dataError = validateSponsorLogoDataUrl(dataUrl);
            if (dataError) {
                setErrors((current) => ({ ...current, logo_url: dataError }));
                return;
            }
            update('logo_url', dataUrl);
        } catch (error) {
            setErrors((current) => ({
                ...current,
                logo_url: error instanceof Error ? error.message : 'No se pudo procesar la imagen.',
            }));
        } finally {
            setLogoBusy(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const validation = validateSponsorInput({
            name: form.name,
            amount: form.amount,
            status: form.status,
            website_url: form.website_url,
            logo_url: form.logo_url,
        });
        if (validation.ok === false) {
            setErrors(validation.errors);
            return;
        }

        setSaving(true);
        setFeedback(null);
        try {
            const payload = {
                name: validation.value.name,
                amount: validation.value.amount,
                status: validation.value.status,
                website_url: validation.value.website_url,
                logo_url: validation.value.logo_url ?? '',
            };
            const url = editingId
                ? `/api/admin/tournaments/${id}/sponsors/${editingId}`
                : `/api/admin/tournaments/${id}/sponsors`;
            const res = await fetch(url, {
                method: editingId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (body?.fieldErrors && typeof body.fieldErrors === 'object') {
                    setErrors(body.fieldErrors as FormErrors);
                }
                throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo guardar el sponsor.');
            }

            const saved = body.data as TournamentSponsor;
            setSponsors((current) => {
                const exists = current.some((sponsor) => sponsor.id === saved.id);
                return exists
                    ? current.map((sponsor) => (sponsor.id === saved.id ? saved : sponsor))
                    : [...current, saved];
            });
            setEditorOpen(false);
            setEditingId(null);
            setForm(EMPTY_FORM);
            setErrors({});
            if (typeof body?.warning === 'string' && body.warning) {
                setFeedback({ tone: 'warning', text: `${editingId ? 'Sponsor actualizado' : 'Sponsor creado'}, pero el logo no se pudo subir: ${body.warning}` });
            } else {
                setFeedback({ tone: 'success', text: editingId ? 'Sponsor actualizado.' : 'Sponsor agregado al torneo.' });
            }
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar el sponsor.' });
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (sponsor: TournamentSponsor) => {
        const nextStatus: TournamentSponsorStatus = sponsor.status === 'active' ? 'inactive' : 'active';
        setBusyId(sponsor.id);
        setFeedback(null);
        try {
            const res = await fetch(`/api/admin/tournaments/${id}/sponsors/${sponsor.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status: nextStatus }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo cambiar el estado.');
            }
            const saved = body.data as TournamentSponsor;
            setSponsors((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            setFeedback({
                tone: 'success',
                text: nextStatus === 'active'
                    ? `${saved.name} vuelve a mostrarse en la página del torneo.`
                    : `${saved.name} queda oculto de la página del torneo.`,
            });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo cambiar el estado.' });
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (sponsor: TournamentSponsor) => {
        if (!window.confirm(`Eliminar a ${sponsor.name} de los sponsors del torneo? Esta acción no se puede deshacer.`)) return;
        setBusyId(sponsor.id);
        setFeedback(null);
        try {
            const res = await fetch(`/api/admin/tournaments/${id}/sponsors/${sponsor.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo eliminar el sponsor.');
            }
            setSponsors((current) => current.filter((item) => item.id !== sponsor.id));
            if (editingId === sponsor.id) closeEditor();
            setFeedback({ tone: 'success', text: 'Sponsor eliminado.' });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo eliminar el sponsor.' });
        } finally {
            setBusyId(null);
        }
    };

    const logoMaxMb = Math.round(SPONSOR_LOGO_MAX_BYTES / 1024 / 1024);
    const editorTitle = editingId ? 'Editar sponsor' : 'Nuevo sponsor';

    return (
        <div className="sponsors-console">
            <section className="basalt-card sponsors-panel" aria-labelledby="sponsors-title">
                <div className="sponsors-head">
                    <div className="sponsors-head-copy">
                        <h2 id="sponsors-title">
                            <Handshake size={18} aria-hidden="true" />
                            Sponsors
                        </h2>
                        <p>
                            Marcas que acompañan este torneo. Los activos se muestran en la página pública
                            con su logo y su nombre.
                        </p>
                    </div>
                    {!schemaMissing && (
                        <button type="button" className="basalt-btn basalt-btn-primary" onClick={openCreate} disabled={loading}>
                            <Plus size={15} aria-hidden="true" />
                            Agregar sponsor
                        </button>
                    )}
                </div>

                {schemaMissing ? (
                    <p className="sponsors-feedback is-warning" role="status">
                        El módulo de sponsors todavía no está habilitado en la base de datos. Falta aplicar la
                        migración <code>tournament_sponsors</code>.
                    </p>
                ) : (
                    <>
                        <dl className="sponsors-summary">
                            <div>
                                <dt>Sponsors activos</dt>
                                <dd>
                                    {summary.active}
                                    {summary.inactive > 0 && <small>{summary.inactive} inactivo{summary.inactive === 1 ? '' : 's'}</small>}
                                </dd>
                            </div>
                            <div>
                                <dt>Valor total de sponsors</dt>
                                <dd>
                                    {formatSponsorAmount(summary.activeAmount, currency)}
                                    {summary.activeWithoutAmount > 0 && (
                                        <small>
                                            {summary.activeWithoutAmount === 1
                                                ? '1 activo sin monto definido'
                                                : `${summary.activeWithoutAmount} activos sin monto definido`}
                                        </small>
                                    )}
                                    {summary.active > 0 && summary.activeWithoutAmount === 0 && (
                                        <small>Solo sponsors activos</small>
                                    )}
                                </dd>
                            </div>
                        </dl>
                        <p className="sponsors-private-note">
                            <Lock size={12} aria-hidden="true" />
                            El monto es un dato administrativo: nunca se muestra en la página pública.
                        </p>
                    </>
                )}
            </section>

            {feedback && (
                <p
                    className={`sponsors-feedback is-${feedback.tone}`}
                    role={feedback.tone === 'error' ? 'alert' : 'status'}
                    aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
                >
                    {feedback.text}
                </p>
            )}

            {editorOpen && !schemaMissing && (
                <section
                    ref={editorRef}
                    className="basalt-card sponsors-panel"
                    aria-labelledby="sponsors-editor-title"
                >
                    <div className="sponsors-head">
                        <div className="sponsors-head-copy">
                            <h2 id="sponsors-editor-title">
                                {editingId ? <Pencil size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
                                {editorTitle}
                            </h2>
                            <p>
                                El sponsor queda asociado solo a este torneo. El monto puede quedar vacío y
                                definirse más adelante.
                            </p>
                        </div>
                        <span className="details-panel-flag">{form.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                    </div>

                    <form className="sponsors-form" onSubmit={handleSubmit} noValidate>
                        <div className="sponsors-logo-slot">
                            <span className="basalt-field-label">Logo</span>
                            <div
                                className={`sponsors-logo-drop ${dragging ? 'is-dragging' : ''}`}
                                role="button"
                                tabIndex={0}
                                aria-label={form.logo_url ? 'Cambiar el logo del sponsor' : 'Subir el logo del sponsor'}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        fileInputRef.current?.click();
                                    }
                                }}
                                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setDragging(false);
                                    void handleLogoFile(event.dataTransfer.files?.[0]);
                                }}
                            >
                                {logoBusy ? (
                                    <div className="sponsors-logo-empty">
                                        <span>Procesando...</span>
                                    </div>
                                ) : form.logo_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- preview local (data:) o URL de Storage
                                    <img src={form.logo_url} alt="Vista previa del logo del sponsor" />
                                ) : (
                                    <div className="sponsors-logo-empty">
                                        <ImageIcon size={34} strokeWidth={1} aria-hidden="true" />
                                        <span>Arrastrá o elegí una imagen</span>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                style={{ display: 'none' }}
                                onChange={(event) => void handleLogoFile(event.target.files?.[0])}
                            />
                            <div className="sponsors-logo-actions">
                                <button type="button" className="basalt-btn" onClick={() => fileInputRef.current?.click()} disabled={logoBusy}>
                                    <Upload size={13} aria-hidden="true" />
                                    {form.logo_url ? 'Cambiar' : 'Subir'}
                                </button>
                                {form.logo_url && (
                                    <button type="button" className="basalt-btn basalt-btn-ghost" onClick={() => update('logo_url', '')} disabled={logoBusy}>
                                        Quitar
                                    </button>
                                )}
                            </div>
                            <p className="basalt-field-hint">PNG, JPG, WEBP o SVG. Hasta {logoMaxMb} MB.</p>
                            {errors.logo_url && <p className="sponsors-field-error" role="alert">{errors.logo_url}</p>}
                        </div>

                        <div className="sponsors-form-fields">
                            <div className="basalt-field is-wide">
                                <label className="basalt-field-label" htmlFor="sponsor-name">Nombre del sponsor</label>
                                <input
                                    ref={nameInputRef}
                                    id="sponsor-name"
                                    className="basalt-input"
                                    type="text"
                                    value={form.name}
                                    maxLength={SPONSOR_NAME_MAX_LENGTH}
                                    placeholder="Marca o empresa"
                                    required
                                    aria-invalid={Boolean(errors.name)}
                                    onChange={(event) => update('name', event.target.value)}
                                />
                                {errors.name && <p className="sponsors-field-error" role="alert">{errors.name}</p>}
                            </div>

                            <div className="basalt-field">
                                <label className="basalt-field-label" htmlFor="sponsor-amount">Monto</label>
                                <div className="sponsors-amount-wrap">
                                    <span className="sponsors-amount-prefix" aria-hidden="true">{currency}</span>
                                    <input
                                        id="sponsor-amount"
                                        className="basalt-input"
                                        type="text"
                                        inputMode="decimal"
                                        value={form.amount}
                                        placeholder="Sin definir"
                                        aria-invalid={Boolean(errors.amount)}
                                        onChange={(event) => update('amount', event.target.value)}
                                    />
                                </div>
                                <p className="basalt-field-hint">Lo que representa este espacio para el sponsor. Se puede dejar vacío y cargar después.</p>
                                {errors.amount && <p className="sponsors-field-error" role="alert">{errors.amount}</p>}
                            </div>

                            <div className="basalt-field">
                                <span className="basalt-field-label" id="sponsor-status-label">Estado</span>
                                <div className="sponsors-segment" role="radiogroup" aria-labelledby="sponsor-status-label">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={form.status === 'active'}
                                        className="sponsors-segment-btn"
                                        onClick={() => update('status', 'active')}
                                    >
                                        Activo
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={form.status === 'inactive'}
                                        className="sponsors-segment-btn"
                                        onClick={() => update('status', 'inactive')}
                                    >
                                        Inactivo
                                    </button>
                                </div>
                                <p className="basalt-field-hint">Solo los activos aparecen en la página pública.</p>
                            </div>

                            <div className="basalt-field is-wide">
                                <label className="basalt-field-label" htmlFor="sponsor-website">Sitio web (opcional)</label>
                                <input
                                    id="sponsor-website"
                                    className="basalt-input"
                                    type="url"
                                    value={form.website_url}
                                    placeholder="https://..."
                                    aria-invalid={Boolean(errors.website_url)}
                                    onChange={(event) => update('website_url', event.target.value)}
                                />
                                {errors.website_url && <p className="sponsors-field-error" role="alert">{errors.website_url}</p>}
                            </div>
                        </div>

                        <div className="sponsors-form-footer">
                            <button type="button" className="basalt-btn" onClick={closeEditor} disabled={saving}>
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="basalt-btn basalt-btn-primary"
                                disabled={saving || logoBusy || !form.name.trim()}
                                title={!form.name.trim() ? 'Escribí el nombre del sponsor para guardar.' : undefined}
                            >
                                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar sponsor'}
                            </button>
                        </div>
                        {!form.name.trim() && (
                            <p className="basalt-field-hint" style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                                Escribí el nombre del sponsor para guardar.
                            </p>
                        )}
                    </form>
                </section>
            )}

            {!schemaMissing && (
                <section className="basalt-card sponsors-panel" aria-labelledby="sponsors-list-title">
                    <div className="sponsors-head">
                        <div className="sponsors-head-copy">
                            <h2 id="sponsors-list-title" className="summary-panel-title" style={{ fontSize: 11 }}>
                                Sponsors del torneo
                            </h2>
                        </div>
                        <span className="details-panel-flag">
                            {loading ? 'Cargando' : `${summary.total} en total`}
                        </span>
                    </div>

                    {loading ? (
                        <div className="sponsors-loading" role="status">Cargando sponsors...</div>
                    ) : sponsors.length === 0 ? (
                        <div className="sponsors-empty">
                            <Handshake size={28} strokeWidth={1.2} aria-hidden="true" />
                            <strong>Este torneo todavía no tiene sponsors.</strong>
                            <p>Agregá la primera marca con su logo y, si ya está definido, el monto del espacio.</p>
                            <button type="button" className="basalt-btn basalt-btn-primary" onClick={openCreate}>
                                <Plus size={15} aria-hidden="true" />
                                Agregar sponsor
                            </button>
                        </div>
                    ) : (
                        <div className="sponsors-grid">
                            {sponsors.map((sponsor) => {
                                const isActive = sponsor.status === 'active';
                                const busy = busyId === sponsor.id;
                                return (
                                    <article
                                        key={sponsor.id}
                                        className={`sponsors-card ${isActive ? '' : 'is-inactive'}`}
                                        aria-label={`${sponsor.name}, ${isActive ? 'activo' : 'inactivo'}`}
                                    >
                                        <div className="sponsors-card-top">
                                            <div className="sponsors-card-logo">
                                                {sponsor.logo_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element -- logo en Storage o URL externa
                                                    <img src={sponsor.logo_url} alt="" loading="lazy" />
                                                ) : (
                                                    <ImageIcon size={22} strokeWidth={1.2} aria-hidden="true" />
                                                )}
                                            </div>
                                            <div className="sponsors-card-copy">
                                                <strong title={sponsor.name}>{sponsor.name}</strong>
                                                {sponsor.website_url && (
                                                    <a href={sponsor.website_url} target="_blank" rel="noopener noreferrer">
                                                        {sponsor.website_url.replace(/^https?:\/\//, '')}
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div className="sponsors-card-meta">
                                            <div className="sponsors-card-amount">
                                                <span>Monto</span>
                                                <strong className={sponsor.amount === null ? 'is-undefined' : ''}>
                                                    {formatSponsorAmount(sponsor.amount, sponsor.currency || currency)}
                                                </strong>
                                            </div>
                                            <span className={`basalt-badge ${isActive ? 'badge-active' : 'badge-hidden'}`}>
                                                {isActive ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>

                                        <div className="sponsors-card-actions">
                                            <button type="button" className="basalt-btn" onClick={() => openEdit(sponsor)} disabled={busy}>
                                                <Pencil size={13} aria-hidden="true" />
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                className="basalt-btn"
                                                onClick={() => void toggleStatus(sponsor)}
                                                disabled={busy}
                                                title={isActive ? 'Dejar de mostrar en la página pública' : 'Volver a mostrar en la página pública'}
                                            >
                                                {isActive ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                                                {busy ? '...' : isActive ? 'Desactivar' : 'Activar'}
                                            </button>
                                            <button
                                                type="button"
                                                className="basalt-btn basalt-btn-danger"
                                                onClick={() => void remove(sponsor)}
                                                disabled={busy}
                                                aria-label={`Eliminar a ${sponsor.name}`}
                                                title="Eliminar"
                                            >
                                                <Trash2 size={13} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
