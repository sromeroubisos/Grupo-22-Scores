'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2, Save } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import type { Database } from '@/lib/database.types';
import { SPORTS } from '@/lib/data/sports';
import { isTeamLogoProxyUrl, resolveLogoPreviewSrc, resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface GeneralTabProps {
    id: string;
    club: ClubRow;
    unions: { id: string; name: string }[];
    onSaved: (club: ClubRow) => void;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

/** Los campos que esta pantalla escribe. El resto de `clubs` no se toca acá. */
const EDITABLE_KEYS = [
    'name',
    'short_name',
    'slug',
    'city',
    'region',
    'country',
    'primary_color',
    'union_id',
    'sport',
    'is_visible',
] as const;

type EditableKey = typeof EDITABLE_KEYS[number];
type FormState = Pick<ClubRow, EditableKey> & { logo_url: string | null };

function toForm(club: ClubRow): FormState {
    return {
        name: club.name ?? '',
        short_name: club.short_name ?? '',
        slug: club.slug ?? '',
        city: club.city ?? '',
        region: club.region ?? '',
        country: club.country ?? '',
        primary_color: club.primary_color ?? '',
        union_id: club.union_id ?? '',
        sport: club.sport ?? '',
        is_visible: club.is_visible !== false,
        logo_url: club.logo_url ?? null,
    };
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function GeneralTab({ id, club, unions, onSaved, notify }: GeneralTabProps) {
    const [form, setForm] = useState<FormState>(() => toForm(club));
    const [baseline, setBaseline] = useState<FormState>(() => toForm(club));
    const [logoMode, setLogoMode] = useState<'url' | 'upload'>('url');
    const [replacingLogo, setReplacingLogo] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const next = toForm(club);
        setForm(next);
        setBaseline(next);
    }, [club]);

    const sportOptions = useMemo(
        () => Object.values(SPORTS)
            .slice()
            .sort((left, right) => {
                if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
                return (left.priority ?? 999) - (right.priority ?? 999);
            }),
        [],
    );

    const dirtyKeys = useMemo(
        () => (Object.keys(form) as Array<keyof FormState>).filter((key) => form[key] !== baseline[key]),
        [form, baseline],
    );
    const isDirty = dirtyKeys.length > 0;

    const preview = resolveLogoPreviewSrc(form.logo_url);
    const storedAsFile = !replacingLogo && isTeamLogoProxyUrl(form.logo_url);
    const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleName = (value: string) => {
        setForm((prev) => ({
            ...prev,
            name: value,
            // El slug es la URL pública del club: solo se autogenera si todavía
            // no tiene una. Cambiarlo solo rompe los links que ya circulan.
            slug: prev.slug?.trim() ? prev.slug : slugify(value),
        }));
    };

    const nameError = form.name.trim().length < 2 ? 'El nombre necesita al menos dos letras.' : null;
    const slugError = !form.slug?.trim() ? 'La ruta pública no puede quedar vacía.' : null;
    // "Reemplazar" vació el campo a propósito: guardar así borraría el escudo
    // sin que nadie lo haya pedido. O pega una dirección, o descarta.
    const logoError = replacingLogo && !(form.logo_url ?? '').trim()
        ? 'Pegá la dirección del escudo nuevo o descartá el cambio.'
        : null;
    const blocking = nameError || slugError || logoError;

    const save = async () => {
        if (blocking || !isDirty) return;
        setSaving(true);
        setError(null);

        const core: Record<string, unknown> = {};
        for (const key of dirtyKeys) {
            if (key === 'logo_url') {
                core.logo_url = form.logo_url || null;
            } else if (key === 'union_id') {
                core.union_id = form.union_id || null;
            } else if (key === 'is_visible') {
                core.is_visible = form.is_visible;
            } else {
                const value = form[key];
                core[key] = typeof value === 'string' ? (value.trim() || null) : value;
            }
        }
        // El nombre y el slug son obligatorios: nunca viajan como null.
        if ('name' in core) core.name = form.name.trim();
        if ('slug' in core) core.slug = form.slug!.trim();

        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(id)}/manage`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ core }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                const detail = Array.isArray(payload?.details)
                    ? payload.details.map((item: { message?: string }) => item?.message).filter(Boolean).join(' · ')
                    : null;
                throw new Error(detail || payload?.error || 'No se pudo guardar el club.');
            }

            const savedCore = payload?.data?.core as ClubRow | undefined;
            if (savedCore) {
                // El PATCH devuelve el club entero, y ahí `logo_url` viene crudo:
                // puede ser un data URI de 870 KB. Guardarlo tal cual en el estado
                // deja el base64 en memoria y lo escupe dentro del input. Se
                // normaliza igual que en el servidor.
                onSaved({
                    ...savedCore,
                    logo_url: resolveSerializableLogoUrl(savedCore.logo_url, {
                        key: id,
                        name: savedCore.name || savedCore.short_name || 'Club',
                    }),
                });
            } else {
                setBaseline(form);
            }
            setReplacingLogo(false);
            notify('Club guardado');
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : 'No se pudo guardar el club.';
            setError(message);
            notify(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Escudo</h2>
                        <p>El escudo se muestra en partidos, tablas y en la ficha pública del club.</p>
                    </div>
                </div>

                <div className="cm-logo-layout">
                    <div className="cm-logo-preview">
                        {preview
                            ? <img src={preview} alt="" />
                            : (
                                <div className="cm-logo-empty">
                                    <ImageIcon size={34} strokeWidth={1.2} aria-hidden="true" />
                                    Sin escudo
                                </div>
                            )}
                    </div>

                    <div>
                        <div className="cm-segmented" role="group" aria-label="Origen del escudo">
                            <button type="button" aria-pressed={logoMode === 'url'} onClick={() => setLogoMode('url')}>
                                Pegar URL
                            </button>
                            <button type="button" aria-pressed={logoMode === 'upload'} onClick={() => setLogoMode('upload')}>
                                Subir archivo
                            </button>
                        </div>

                        {logoMode === 'url' ? (
                            storedAsFile ? (
                                <div className="cm-field">
                                    <span className="cm-label">Escudo guardado</span>
                                    <div className="cm-notice">
                                        Este escudo está guardado como archivo dentro del club, no como
                                        dirección. Se sirve por el proxy de imágenes.
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            className="cm-btn"
                                            onClick={() => { setReplacingLogo(true); set('logo_url', ''); }}
                                        >
                                            Reemplazar por una dirección
                                        </button>
                                        <button
                                            type="button"
                                            className="cm-btn cm-btn-danger"
                                            onClick={() => set('logo_url', null)}
                                        >
                                            Quitar el escudo
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="cm-field">
                                    <label className="cm-label" htmlFor="cm-logo-url">Dirección del escudo</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <input
                                            id="cm-logo-url"
                                            className="cm-input"
                                            style={{ flex: '1 1 240px' }}
                                            placeholder="https://.../escudo.png"
                                            value={form.logo_url ?? ''}
                                            onChange={(event) => set('logo_url', event.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="cm-btn"
                                            onClick={() => { setReplacingLogo(false); set('logo_url', null); }}
                                            disabled={!form.logo_url}
                                        >
                                            Quitar
                                        </button>
                                    </div>
                                    <p className="cm-hint">
                                        Acepta URLs directas y snippets de Flaticon. Al guardar, el escudo se
                                        propaga a los partidos y a las tablas de posiciones.
                                    </p>
                                </div>
                            )
                        ) : (
                            <div className="cm-field">
                                <span className="cm-label">Archivo (PNG, SVG o JPG)</span>
                                <LogoUploader
                                    onUpload={(url) => set('logo_url', url)}
                                    accentColor="var(--color-accent)"
                                    label="Arrastrá el escudo o hacé clic para elegirlo"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Identidad</h2>
                        <p>Cómo se llama el club y por dónde se lo encuentra.</p>
                    </div>
                </div>

                <div className="cm-grid cm-grid-2">
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-name">Nombre</label>
                        <input
                            id="cm-name"
                            className="cm-input"
                            value={form.name}
                            onChange={(event) => handleName(event.target.value)}
                            aria-invalid={Boolean(nameError)}
                        />
                        {nameError && <span className="cm-hint" style={{ color: 'var(--color-error)' }}>{nameError}</span>}
                    </div>

                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-short">Nombre corto</label>
                        <input
                            id="cm-short"
                            className="cm-input"
                            placeholder="El que entra en una tabla de posiciones"
                            value={form.short_name ?? ''}
                            onChange={(event) => set('short_name', event.target.value)}
                        />
                    </div>

                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-slug">Ruta pública</label>
                        <div className="cm-input-prefixed">
                            <span className="cm-input-prefix">/clubs/</span>
                            <input
                                id="cm-slug"
                                className="cm-input"
                                style={{ paddingLeft: 62 }}
                                value={form.slug ?? ''}
                                onChange={(event) => set('slug', slugify(event.target.value))}
                                aria-invalid={Boolean(slugError)}
                            />
                        </div>
                        {slugError
                            ? <span className="cm-hint" style={{ color: 'var(--color-error)' }}>{slugError}</span>
                            : <span className="cm-hint">Cambiarla rompe los links que ya circulan.</span>}
                    </div>

                    <div className="cm-field">
                        <span className="cm-label">Color</span>
                        <div className="cm-color-row">
                            <input
                                type="color"
                                aria-label="Color institucional del club"
                                value={form.primary_color || '#3b82f6'}
                                onChange={(event) => set('primary_color', event.target.value)}
                            />
                            <code>{(form.primary_color || '').toUpperCase() || 'Sin definir'}</code>
                            {form.primary_color && (
                                <button
                                    type="button"
                                    className="cm-btn cm-btn-sm"
                                    style={{ marginLeft: 'auto' }}
                                    onClick={() => set('primary_color', null)}
                                >
                                    Quitar
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-union">Unión</label>
                        <select
                            id="cm-union"
                            className="cm-select"
                            value={form.union_id ?? ''}
                            onChange={(event) => set('union_id', event.target.value || null)}
                        >
                            <option value="">Sin unión</option>
                            {unions.map((union) => (
                                <option key={union.id} value={union.id}>{union.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-sport">Deporte</label>
                        <select
                            id="cm-sport"
                            className="cm-select"
                            value={form.sport ?? ''}
                            onChange={(event) => set('sport', event.target.value || null)}
                        >
                            <option value="">Sin deporte</option>
                            {sportOptions.map((sport) => (
                                <option key={sport.id} value={sport.id}>{sport.nameEs || sport.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Sede</h2>
                        <p>Dónde juega el club.</p>
                    </div>
                </div>

                <div className="cm-grid cm-grid-3">
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-city">Ciudad</label>
                        <input
                            id="cm-city"
                            className="cm-input"
                            placeholder="Córdoba"
                            value={form.city ?? ''}
                            onChange={(event) => set('city', event.target.value)}
                        />
                    </div>
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-region">Provincia</label>
                        <input
                            id="cm-region"
                            className="cm-input"
                            placeholder="Córdoba"
                            value={form.region ?? ''}
                            onChange={(event) => set('region', event.target.value)}
                        />
                    </div>
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-country">País</label>
                        <input
                            id="cm-country"
                            className="cm-input"
                            placeholder="ARG"
                            value={form.country ?? ''}
                            onChange={(event) => set('country', event.target.value)}
                        />
                    </div>
                </div>

                <div className="cm-field" style={{ marginTop: 16 }}>
                    <span className="cm-label">Visibilidad</span>
                    <button
                        type="button"
                        className="cm-switch"
                        role="switch"
                        aria-checked={form.is_visible}
                        onClick={() => set('is_visible', !form.is_visible)}
                    >
                        <span className="cm-switch-track"><span className="cm-switch-thumb" /></span>
                        {form.is_visible ? 'Visible en el sitio' : 'Oculto'}
                    </button>
                </div>
            </section>

            {error && <div className="cm-alert" style={{ marginTop: 16 }}>{error}</div>}

            {isDirty && (
                <div className="cm-savebar">
                    <span className="cm-savebar-text">
                        {dirtyKeys.length === 1 ? '1 cambio sin guardar' : `${dirtyKeys.length} cambios sin guardar`}
                    </span>
                    <div className="cm-savebar-actions">
                        <button
                            type="button"
                            className="cm-btn"
                            onClick={() => { setReplacingLogo(false); setForm(baseline); }}
                            disabled={saving}
                        >
                            Descartar
                        </button>
                        <button
                            type="button"
                            className="cm-btn cm-btn-primary"
                            onClick={save}
                            disabled={saving || Boolean(blocking)}
                            title={blocking || undefined}
                        >
                            {saving
                                ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Guardando</>
                                : <><Save size={14} aria-hidden="true" /> Guardar</>}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
