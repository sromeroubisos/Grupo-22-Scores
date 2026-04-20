'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Database } from '@/lib/database.types';
import { Shield, MapPin, Palette, Plus, X, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import LogoUploader from '@/components/LogoUploader';
import { SPORTS } from '@/lib/data/sports';
import { fetchDivisions, type Division } from '@/lib/services/divisionService';
import { resolveLogoPreviewSrc } from '@/lib/utils/logoUrl';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubIdentityTabProps {
    id: string;
    data: ClubRow;
    unions: { id: string; name: string }[];
}

function normalizeSegmentValue(value?: string | null) {
    return value?.trim().toUpperCase() || '';
}

function formatDivisionStatus(status?: Division['status']) {
    switch (status) {
        case 'active':
            return 'ACTIVO';
        case 'draft':
            return 'BORRADOR';
        case 'archived':
            return 'ARCHIVADO';
        default:
            return 'PENDIENTE';
    }
}

function formatDivisionMeta(division: Division) {
    const parts = [division.sport, division.gender, division.category]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' / ') : 'Segmento sin clasificar';
}

export function ClubIdentityTab({ id, data, unions }: ClubIdentityTabProps) {
    const [form, setForm] = useState(data);
    const [tagInput, setTagInput] = useState('');
    const [logoTab, setLogoTab] = useState<'url' | 'upload'>('url');
    const [linkedDivisions, setLinkedDivisions] = useState<Division[]>([]);
    const [loadingDivisions, setLoadingDivisions] = useState(true);

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

    const linkedDivisionCategoryKeys = new Set(
        linkedDivisions.map((division) => normalizeSegmentValue(division.category || division.name))
    );
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

    const addTag = () => {
        const val = tagInput.trim().toUpperCase();
        if (!val) return;
        if (form.categories?.includes(val)) return;
        if (linkedDivisionCategoryKeys.has(val)) return;

        const newCats = [...(form.categories || []), val];
        updateField({ categories: newCats });
        setTagInput('');
    };

    const removeTag = (tag: string) => {
        const newCats = (form.categories || []).filter((category) => category !== tag);
        updateField({ categories: newCats });
    };

    useEffect(() => {
        let isMounted = true;

        const loadLinkedDivisions = async () => {
            if (!id || id === 'new') {
                if (isMounted) {
                    setLinkedDivisions([]);
                    setLoadingDivisions(false);
                }
                return;
            }

            if (isMounted) {
                setLoadingDivisions(true);
            }

            try {
                const divisions = await fetchDivisions(id);
                if (isMounted) {
                    setLinkedDivisions(divisions);
                }
            } catch (error) {
                console.error('Error loading club divisions for identity tab:', error);
                if (isMounted) {
                    setLinkedDivisions([]);
                }
            } finally {
                if (isMounted) {
                    setLoadingDivisions(false);
                }
            }
        };

        void loadLinkedDivisions();

        const refreshDivisions = () => {
            void loadLinkedDivisions();
        };

        window.addEventListener('club:divisions-updated', refreshDivisions);

        return () => {
            isMounted = false;
            window.removeEventListener('club:divisions-updated', refreshDivisions);
        };
    }, [id]);

    const legacyCategories = (form.categories || []).filter((category) => {
        const normalizedCategory = normalizeSegmentValue(category);
        return normalizedCategory && !linkedDivisionCategoryKeys.has(normalizedCategory);
    });

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
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.68)' }}>
                                    <p className="text-[10px] font-bold uppercase text-center leading-tight" style={{ color: '#fff' }}>Configura a la derecha</p>
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
                                            form.is_visible ? 'bg-[rgba(0,255,133,0.1)] border-[rgba(0,255,133,0.3)]' : 'bg-transparent border-[rgba(255,255,255,0.2)]'
                                        )}
                                    >
                                        <div className={clsx(
                                            'w-4 h-4 rounded-full transition-all shadow-md',
                                            form.is_visible ? 'translate-x-6 bg-[var(--success)]' : 'translate-x-0 bg-[#52525b]'
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

            <div className="manager-card mt-10">
                <header className="manager-header">
                    <div className="manager-header-titles">
                        <h1 className="flex items-center gap-3"><Palette className="w-6 h-6 text-[var(--accent)]" /> Segmentacion</h1>
                        <p>Planteles, equipos y categorias oficiales asociadas.</p>
                    </div>
                </header>

                <div className="manager-input-group">
                    <label className="manager-field-label">Divisiones vinculadas al club</label>
                    <div className="p-6 min-h-[100px] mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {loadingDivisions ? (
                            <div className="flex items-center justify-center min-h-[88px]">
                                <p className="text-[12px] uppercase tracking-widest self-center italic text-center" style={{ color: 'var(--text-muted)' }}>
                                    Cargando divisiones...
                                </p>
                            </div>
                        ) : linkedDivisions.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {linkedDivisions.map((division) => {
                                    const divisionName = division.name?.trim() || division.category?.trim() || 'Sin nombre';
                                    const divisionMeta = formatDivisionMeta(division);
                                    const canOpenDivision = !division.id.startsWith('legacy-');
                                    const content = (
                                        <>
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[13px] font-black uppercase tracking-tight" style={{ color: 'var(--text)' }}>
                                                        {divisionName}
                                                    </p>
                                                    <p className="text-[11px] uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                        {divisionMeta}
                                                    </p>
                                                </div>
                                                <span className={clsx(
                                                    'text-[10px] px-2 py-1 border font-black uppercase tracking-[0.18em] whitespace-nowrap',
                                                    division.status === 'active'
                                                        ? 'text-[var(--success)] border-[rgba(0,255,133,0.25)] bg-[rgba(0,255,133,0.08)]'
                                                        : division.status === 'draft'
                                                            ? 'text-[var(--accent)] border-[rgba(255,145,0,0.25)] bg-[rgba(255,145,0,0.08)]'
                                                            : 'text-[#999] border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.03)]'
                                                )}>
                                                    {formatDivisionStatus(division.status)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
                                                <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                                                    Temporada {division.season || '--'}
                                                </span>
                                                {canOpenDivision ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] font-black uppercase tracking-[0.14em]">
                                                        Ver plantel
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-[#777] font-black uppercase tracking-[0.14em]">
                                                        Legacy
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    );

                                    if (canOpenDivision) {
                                        return (
                                            <Link
                                                key={division.id}
                                                href={`/admin/super/clubes/${id}/planteles/${division.id}`}
                                                className="block p-4 bg-[var(--surface-elevated)] border border-[rgba(255,255,255,0.12)] hover:border-[var(--accent)] transition-all"
                                            >
                                                {content}
                                            </Link>
                                        );
                                    }

                                    return (
                                        <div
                                            key={division.id}
                                            className="p-4 bg-[var(--surface-elevated)] border border-[rgba(255,255,255,0.12)]"
                                        >
                                            {content}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center min-h-[88px]">
                                <p className="text-[12px] uppercase tracking-widest self-center italic text-center" style={{ color: 'var(--text-muted)' }}>
                                    Sin divisiones vinculadas
                                </p>
                            </div>
                        )}
                    </div>

                    <p className="text-xs uppercase tracking-[0.16em] mb-6" style={{ color: 'var(--text-muted)' }}>
                        Esta seccion se sincroniza automaticamente con los planteles creados para este club.
                    </p>

                    {legacyCategories.length > 0 && (
                        <>
                            <label className="manager-field-label">Categorias manuales legacy</label>
                            <div className="flex flex-wrap gap-2 p-6 min-h-[76px] mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                {legacyCategories.map((tag) => (
                                    <div key={tag} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-elevated)] border border-[rgba(255,255,255,0.2)] group hover:border-[var(--accent)] transition-all">
                                        <span className="text-[12px] font-black uppercase tracking-tighter" style={{ color: 'var(--text)' }}>{tag}</span>
                                        <button type="button" onClick={() => removeTag(tag)} className="transition-colors" style={{ color: 'var(--text-muted)' }}>
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    <label className="manager-field-label">Agregar categoria manual</label>
                    <div className="flex gap-4 max-w-md">
                        <input
                            type="text"
                            placeholder="ESCRIBE CATEGORIA LEGACY (M16...)"
                            className="manager-url-input uppercase font-bold text-sm"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        />
                        <button
                            type="button"
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
