'use client';

import { useState } from 'react';
import { Database } from '@/lib/database.types';
import { Shield, MapPin, Palette, Check, Plus, X, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import LogoUploader from '@/components/LogoUploader';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubIdentityTabProps {
    id: string;
    data: ClubRow;
    unions: { id: string, name: string }[];
}

export function ClubIdentityTab({ data, unions }: ClubIdentityTabProps) {
    const [form, setForm] = useState(data);
    const [tagInput, setTagInput] = useState('');
    const [logoTab, setLogoTab] = useState<'url' | 'upload'>('url');

    const updateField = (field: Partial<ClubRow>) => {
        const newForm = { ...form, ...field };
        setForm(newForm);
        window.dispatchEvent(new CustomEvent('club:form-update', { detail: field }));
    };

    const handleNameChange = (val: string) => {
        const updates: Partial<ClubRow> = { name: val };

        if (!form.id || form.slug === form.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')) {
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

    const addTag = () => {
        const val = tagInput.trim().toUpperCase();
        if (val && !form.categories?.includes(val)) {
            const newCats = [...(form.categories || []), val];
            updateField({ categories: newCats });
            setTagInput('');
        }
    };

    const removeTag = (tag: string) => {
        const newCats = (form.categories || []).filter(c => c !== tag);
        updateField({ categories: newCats });
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">

            {/* Logo & Public Status (Kinetic Structuralism) */}
            <div className="manager-card">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1>Escudo / Logo</h1>
                        <p>Actualizá el escudo e identidad gráfica del club.</p>
                    </div>
                    <div className="manager-metadata-box" id="status-indicator">
                        STATUS: {form.logo_url ? 'SYNCED' : 'READY'}
                    </div>
                </header>

                <div className="manager-main-layout">
                    {/* Left: Preview & Data */}
                    <aside className="manager-preview-zone">
                        <div className="manager-preview-frame group">
                            {form.logo_url ? (
                                <img src={form.logo_url} alt="Logo" />
                            ) : (
                                <div className="flex flex-col items-center gap-3 text-muted text-xs uppercase tracking-widest opacity-50">
                                    <ImageIcon size={48} strokeWidth={1} />
                                    <span>Sin escudo</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                                <p className="text-[10px] text-white font-bold uppercase text-center leading-tight">Configurá a la derecha</p>
                            </div>
                        </div>

                        <div className="manager-metadata-box">
                            ORIGIN: {form.logo_url ? (form.logo_url.startsWith('data:') ? 'BASE64' : 'CDN/WEB') : 'NULL'}<br />
                            FORMAT: {form.logo_url ? (form.logo_url.startsWith('data:') ? 'DATA_URI' : form.logo_url.split('.').pop()?.substring(0, 4).toUpperCase() || 'IMG') : '--'}<br />
                            COLOR: {form.primary_color?.toUpperCase() || '--'}
                        </div>
                    </aside>

                    {/* Right: Controls */}
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
                                        placeholder="https://.../logo.png"
                                        value={form.logo_url || ''}
                                        onChange={e => updateField({ logo_url: e.target.value })}
                                    />
                                    <div className="absolute right-2 flex gap-2">
                                        <button type="button" className="manager-btn-inline secondary" onClick={(e) => { e.preventDefault(); updateField({ logo_url: '' }); }}>Limpiar</button>
                                    </div>
                                </div>
                                <p className="text-xs text-[#888] mt-2 leading-relaxed">
                                    Acepta: <strong>HTTPS</strong> (png, jpg, webp, svg).
                                </p>
                            </div>
                        ) : (
                            <div className="manager-input-group mb-8">
                                <label className="manager-field-label">Subir Logo (PNG/SVG/JPG)</label>
                                <div className="p-4 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] min-h-[140px] flex items-center justify-center">
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
                                <div className="flex items-center gap-4 border border-[rgba(255,255,255,0.2)] p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
                                    <input
                                        type="color"
                                        className="w-10 h-10 rounded-lg bg-transparent border border-[rgba(255,255,255,0.1)] cursor-pointer"
                                        value={form.primary_color || '#3b82f6'}
                                        onChange={e => updateField({ primary_color: e.target.value })}
                                    />
                                    <span className="font-mono text-[13px] text-[#e2e2e2] font-bold">{form.primary_color?.toUpperCase() || '#3B82F6'}</span>
                                </div>
                            </div>
                            <div className="manager-input-group">
                                <label className="manager-field-label">Visibilidad Pública</label>
                                <div className="flex items-center gap-3 h-full px-2">
                                    <button
                                        onClick={() => updateField({ is_visible: !form.is_visible })}
                                        className={clsx(
                                            "w-12 h-6 rounded-full transition-all relative flex items-center px-1 border",
                                            form.is_visible ? "bg-[rgba(0,255,133,0.1)] border-[rgba(0,255,133,0.3)]" : "bg-transparent border-[rgba(255,255,255,0.2)]"
                                        )}
                                    >
                                        <div className={clsx(
                                            "w-4 h-4 rounded-full transition-all shadow-md",
                                            form.is_visible ? "translate-x-6 bg-[var(--success)]" : "translate-x-0 bg-[#52525b]"
                                        )} />
                                    </button>
                                    <span className="text-[13px] font-bold text-[#e2e2e2] uppercase tracking-tighter">
                                        {form.is_visible ? 'Visible en Website' : 'Oculto / Privado'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>


            {/* Informacion Basica */}
            <div className="manager-card mt-10">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Shield className="w-6 h-6 text-[var(--accent)]" /> Identidad Estratégica</h1>
                        <p>Denominaciones y enrutamiento web.</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="manager-input-group">
                        <label className="manager-field-label">Nombre del Club</label>
                        <input
                            type="text"
                            placeholder="Ej. Jockey Club Córdoba"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.name || ''}
                            onChange={e => handleNameChange(e.target.value)}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Nombre Abreviado</label>
                        <input
                            type="text"
                            placeholder="Ej. JOCKEY CLUB"
                            className="manager-url-input font-black uppercase text-[var(--accent)]"
                            value={form.short_name || ''}
                            onChange={e => updateField({ short_name: e.target.value })}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Ruta URL (Slug)</label>
                        <div className="relative flex items-center">
                            <span className="absolute left-4 text-[#888] font-mono text-xs">/clubs/</span>
                            <input
                                type="text"
                                className="manager-url-input pl-20"
                                value={form.slug || ''}
                                onChange={e => updateField({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                            />
                        </div>
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Unión Perteneciente</label>
                        <select
                            className="manager-url-select"
                            value={form.union_id || ''}
                            onChange={e => updateField({ union_id: e.target.value })}
                        >
                            <option value="">Seleccionar Unión</option>
                            {unions.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Ubicacion */}
            <div className="manager-card mt-10">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><MapPin className="w-6 h-6 text-[var(--accent)]" /> Localización Geográfica</h1>
                        <p>Sede principal de la institución.</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="manager-input-group">
                        <label className="manager-field-label">Ciudad / Localidad</label>
                        <input
                            type="text"
                            placeholder="Córdoba"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.city || ''}
                            onChange={e => updateField({ city: e.target.value })}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">Provincia / Región</label>
                        <input
                            type="text"
                            placeholder="Córdoba"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.region || ''}
                            onChange={e => updateField({ region: e.target.value })}
                        />
                    </div>
                    <div className="manager-input-group">
                        <label className="manager-field-label">País ISO</label>
                        <input
                            type="text"
                            placeholder="Argentina"
                            className="manager-url-input font-sans text-[14px]"
                            value={form.country || ''}
                            onChange={e => updateField({ country: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Clasificación (Tags) */}
            <div className="manager-card mt-10">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Palette className="w-6 h-6 text-[var(--accent)]" /> Segmentación</h1>
                        <p>Planteles y categorías oficiales asociadas.</p>
                    </div>
                </header>

                <div className="manager-input-group">
                    <label className="manager-field-label">Categorías Existentes</label>
                    <div className="flex flex-wrap gap-2 p-6 bg-[#0a0a0c] border border-[rgba(255,255,255,0.1)] min-h-[100px] mb-4">
                        {form.categories?.map(tag => (
                            <div key={tag} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-elevated)] border border-[rgba(255,255,255,0.2)] group hover:border-[var(--accent)] transition-all">
                                <span className="text-[12px] font-black text-[#e2e2e2] uppercase tracking-tighter">{tag}</span>
                                <button onClick={() => removeTag(tag)} className="text-[#888] hover:text-[var(--error)] transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {(!form.categories || form.categories.length === 0) && (
                            <p className="text-[#888] text-[12px] uppercase tracking-widest self-center italic w-full text-center">Sin categorías</p>
                        )}
                    </div>

                    <div className="flex gap-4 max-w-md">
                        <input
                            type="text"
                            placeholder="ESCRIBE CATEGORÍA (M16...)"
                            className="manager-url-input uppercase font-bold text-sm"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addTag()}
                        />
                        <button
                            onClick={addTag}
                            className="bg-[var(--accent)] text-[var(--bg)] px-6 font-bold uppercase tracking-widest text-xs border border-[var(--accent)] hover:opacity-80 transition-opacity"
                        >
                            <Plus className="w-5 h-5 mx-auto" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

