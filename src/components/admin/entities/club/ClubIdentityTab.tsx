'use client';

import { useEffect, useState } from 'react';
import { Database } from '@/lib/database.types';
import { Shield, MapPin, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import LogoUploader from '@/components/LogoUploader';
import { SPORTS } from '@/lib/data/sports';
import { resolveLogoPreviewSrc } from '@/lib/utils/logoUrl';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubIdentityTabProps {
    id: string;
    data: ClubRow;
    unions: { id: string; name: string }[];
}

export function ClubIdentityTab({ data, unions }: ClubIdentityTabProps) {
    const [form, setForm] = useState(data);
    const [logoTab, setLogoTab] = useState<'url' | 'upload'>('url');

    useEffect(() => {
        setForm(data);
    }, [data]);

    const sportOptions = Object.values(SPORTS)
        .slice()
        .sort((left, right) => {
            if (left.isActive !== right.isActive) {
                return left.isActive ? -1 : 1;
            }

            return (left.priority ?? 999) - (right.priority ?? 999);
        });

    const previewLogo = resolveLogoPreviewSrc(form.logo_url);

    const updateField = (field: Partial<ClubRow>) => {
        const newForm = { ...form, ...field };
        setForm(newForm);
        window.dispatchEvent(new CustomEvent('club:form-update', { detail: field }));
    };

    const handleNameChange = (val: string) => {
        const updates: Partial<ClubRow> = { name: val };

        // Keep the slug stable for existing clubs unless the user edits it manually.
        if (!form.id || !form.slug?.trim()) {
            updates.slug = val.toLowerCase()
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '');
        }

        if (!form.short_name || form.short_name === form.name?.slice(0, 3).toUpperCase()) {
            updates.short_name = val.slice(0, 15).toUpperCase();
        }

        updateField(updates);
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
            <div className="manager-card">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1>Escudo / Logo</h1>
                        <p>Actualiza el escudo e identidad grafica del club.</p>
                    </div>
                    <div className="manager-metadata-box" id="status-indicator">
                        STATUS: {form.logo_url ? 'SYNCED' : 'READY'}
                    </div>
                </header>

                <div className="manager-main-layout">
                    <aside className="manager-preview-zone">
                        <div className="manager-preview-frame group">
                            {previewLogo ? (
                                <img src={previewLogo} alt="Logo" />
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-muted text-xs uppercase tracking-widest opacity-50">
                                    <ImageIcon size={48} strokeWidth={1} />
                                    <span>Sin escudo</span>
                                </div>
                            )}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4" style={{ background: 'var(--ca-surface-hover)' }}>
                                    <p className="text-[10px] font-bold uppercase text-center leading-tight" style={{ color: 'var(--ca-text)' }}>Configura a la derecha</p>
                                </div>
                        </div>

                        <div className="manager-metadata-box">
                            ORIGIN: {previewLogo ? (previewLogo.startsWith('data:') ? 'BASE64' : 'CDN/WEB') : 'NULL'}<br />
                            FORMAT: {previewLogo ? (previewLogo.startsWith('data:') ? 'DATA_URI' : previewLogo.split('.').pop()?.substring(0, 4).toUpperCase() || 'IMG') : '--'}<br />
                            COLOR: {form.primary_color?.toUpperCase() || '--'}
                        </div>
                    </aside>

                    <main className="manager-controls-zone">
                        <div className="manager-tabs">
                            <div className="manager-tab-indicator" style={{ transform: `translateX(${logoTab === 'url' ? '0%' : '100%'})` }}></div>
                            <button className={`manager-tab-btn ${logoTab === 'url' ? 'active text-[var(--bg)]' : ''}`} onClick={(e) => { e.preventDefault(); setLogoTab('url'); }}>Pegar URL / Ajustes</button>
                            <button className={`manager-tab-btn ${logoTab === 'upload' ? 'active text-[var(--bg)]' : ''}`} onClick={(e) => { e.preventDefault(); setLogoTab('upload'); }}>Subir archivo</button>
                        </div>

                        {logoTab === 'url' ? (
                            <div className="manager-input-group mb-8">
                                <label className="manager-field-label">URL del escudo (CDN/Web)</label>
                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        className="manager-url-input pr-24"
                                        placeholder="https://.../logo.png o pega el snippet de Flaticon"
                                        value={form.logo_url || ''}
                                        onChange={(e) => updateField({ logo_url: e.target.value })}
                                    />
                                    <div className="absolute right-2 flex gap-2">
                                        <button type="button" className="manager-btn-inline secondary" onClick={(e) => { e.preventDefault(); updateField({ logo_url: '' }); }}>Limpiar</button>
                                    </div>
                                </div>
                                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                    Acepta URLs directas, snippets HTML y enlaces de Flaticon de paises para convertirlos en banderas al guardar.
                                </p>
                            </div>
                        ) : (
                            <div className="manager-input-group mb-8">
                                <label className="manager-field-label">Subir Logo (PNG/SVG/JPG)</label>
                                <div className="p-4 border border-[var(--border)] bg-[var(--ca-surface-hover)] min-h-[140px] flex items-center justify-center">
                                    <LogoUploader
                                        onUpload={(url) => updateField({ logo_url: url })}
                                        accentColor="var(--accent)"
                                        label="Arrastra o clic para subir"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-6">
                            <div className="manager-input-group">
                                <label className="manager-field-label">Color Institucional</label>
                                <div className="flex items-center gap-4 border border-[var(--ca-border-light)] p-2 rounded-lg bg-[var(--ca-surface-hover)]">
                                    <input
                                        type="color"
                                        className="w-10 h-10 rounded-lg bg-transparent border border-[var(--ca-border)] cursor-pointer"
                                        value={form.primary_color || '#3b82f6'}
                                        onChange={(e) => updateField({ primary_color: e.target.value })}
                                    />
                                    <span className="font-mono text-[13px] font-bold" style={{ color: 'var(--text)' }}>{form.primary_color?.toUpperCase() || '#3B82F6'}</span>
                                </div>
                            </div>
                            <div className="manager-input-group">
                                <label className="manager-field-label">Visibilidad Publica</label>
                                <div className="flex items-center gap-3 h-full px-2">
                                    <button
                                        type="button"
                                        onClick={() => updateField({ is_visible: !form.is_visible })}
                                        className={clsx(
                                            'w-12 h-6 rounded-full transition-all relative flex items-center px-1 border',
                                            form.is_visible ? 'bg-[color-mix(in_srgb,var(--ca-success)_10%,transparent)] border-[color-mix(in_srgb,var(--ca-success)_30%,transparent)]' : 'bg-transparent border-[var(--ca-border-light)]'
                                        )}
                                    >
                                        <div className={clsx(
                                            'w-4 h-4 rounded-full transition-all shadow-md',
                                            form.is_visible ? 'translate-x-6 bg-[var(--success)]' : 'translate-x-0 bg-[var(--ca-text-muted)]'
                                        )} />
                                    </button>
                                    <span className="text-[13px] font-bold uppercase tracking-tighter" style={{ color: 'var(--text)' }}>
                                        {form.is_visible ? 'Visible en Website' : 'Oculto / Privado'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            <div className="manager-card mt-10">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Shield className="w-6 h-6 text-[var(--accent)]" /> Identidad Estrategica</h1>
                        <p>Denominaciones y enrutamiento web.</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="manager-input-group">
                        <label className="manager-field-label">Nombre del Club</label>
                        <input
                            type="text"
                            placeholder="Ej. Jockey Club Cordoba"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.name || ''}
                            onChange={(e) => handleNameChange(e.target.value)}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Nombre Abreviado</label>
                        <input
                            type="text"
                            placeholder="Ej. JOCKEY CLUB"
                            className="manager-url-input font-black uppercase text-[var(--accent)]"
                            value={form.short_name || ''}
                            onChange={(e) => updateField({ short_name: e.target.value })}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Ruta URL (Slug)</label>
                        <div className="relative flex items-center">
                            <span className="absolute left-4 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>/clubs/</span>
                            <input
                                type="text"
                                className="manager-url-input pl-20"
                                value={form.slug || ''}
                                onChange={(e) => updateField({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                            />
                        </div>
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Union Perteneciente</label>
                        <select
                            className="manager-url-select"
                            value={form.union_id || ''}
                            onChange={(e) => updateField({ union_id: e.target.value })}
                        >
                            <option value="">Seleccionar Union</option>
                            {unions.map((union) => (
                                <option key={union.id} value={union.id}>{union.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Deporte Vinculado</label>
                        <select
                            className="manager-url-select"
                            value={form.sport || ''}
                            onChange={(e) => updateField({ sport: e.target.value || null })}
                        >
                            <option value="">Seleccionar deporte</option>
                            {sportOptions.map((sport) => (
                                <option key={sport.id} value={sport.id}>
                                    {sport.nameEs || sport.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="manager-card mt-10">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><MapPin className="w-6 h-6 text-[var(--accent)]" /> Localizacion Geografica</h1>
                        <p>Sede principal de la institucion.</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="manager-input-group">
                        <label className="manager-field-label">Ciudad / Localidad</label>
                        <input
                            type="text"
                            placeholder="Cordoba"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.city || ''}
                            onChange={(e) => updateField({ city: e.target.value })}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Provincia / Region</label>
                        <input
                            type="text"
                            placeholder="Cordoba"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.region || ''}
                            onChange={(e) => updateField({ region: e.target.value })}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Pais ISO</label>
                        <input
                            type="text"
                            placeholder="Argentina"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.country || ''}
                            onChange={(e) => updateField({ country: e.target.value })}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
}
