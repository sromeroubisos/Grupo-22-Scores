'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateEntity } from '@/app/admin/entities/actions';
import { Database } from '@/lib/database.types';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { useTournamentDirty } from './TournamentContext';
import { Shield, Globe, Image as ImageIcon } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import { FlashScoreIntegrationSection } from './FlashScoreIntegrationSection';
import '../club/vitreous-club.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentDetailsRow = TournamentRow & {
    display_name?: string | null;
    is_api_managed?: boolean | null;
    ruleset?: Record<string, unknown> | null;
};

const COUNTRIES = ['Argentina', 'Brasil', 'Chile', 'Colombia', 'Uruguay', 'Paraguay', 'Bolivia', 'Perú', 'Ecuador', 'Venezuela', 'United Kingdom', 'France', 'Spain', 'Italy', 'New Zealand', 'South Africa', 'Australia'];
const REGIONS = ['Sudamérica', 'Norteamérica', 'Europa Occidental', 'Europa del Este', 'Oceanía', 'África', 'Asia'];
const AGE_GRADES = ['Mayores', 'M23 (Sub-23)', 'M19 (Sub-19)', 'M17 (Sub-17)', 'M16 (Sub-16)', 'Femenino', 'Veteranos'];

function slugify(s: string) {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

interface TournamentDetailsTabProps {
    data: TournamentRow;
    id: string;
    unions: Array<{ id: string; name: string }>;
}

export function TournamentDetailsTab({ data, id, unions }: TournamentDetailsTabProps) {
    const tournament = data as TournamentDetailsRow;
    const router = useRouter();
    const { setDirty: setGlobalDirty } = useTournamentDirty();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [slugEdited, setSlugEdited] = useState(false);
    const [logoTab, setLogoTab] = useState<'url' | 'upload'>('url');

    const isApiManaged = tournament.is_api_managed || false;
    const [form, setForm] = useState({
        name: isApiManaged ? (tournament.display_name || tournament.name) : (tournament.name ?? ''),
        display_name: tournament.display_name || '',
        slug: tournament.slug ?? '',
        season_id: tournament.season_id ?? '2026',
        union_id: tournament.union_id ?? '',
        country: tournament.country ?? '',
        region: tournament.region ?? '',
        category: tournament.category ?? '',
        age_grade: tournament.age_grade ?? '',
        logo_url: tournament.logo_url ?? '',
        ruleset: tournament.ruleset ?? {},
    });

    useEffect(() => { setGlobalDirty(isDirty); }, [isDirty, setGlobalDirty]);
    useLeaveConfirm(isDirty);

    const update = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        setIsDirty(true);
        setMessage(null);
    }, []);

    useEffect(() => {
        if (!slugEdited && form.name && !form.slug) {
            setForm(prev => ({ ...prev, slug: slugify(form.name) }));
        }
    }, [form.name, slugEdited, form.slug]);

    const handleSaveRef = useRef<() => void>(() => { });
    useEffect(() => {
        const handler = () => { if (isDirty) handleSaveRef.current(); };
        window.addEventListener('tournament:save', handler);
        return () => window.removeEventListener('tournament:save', handler);
    }, [isDirty]);

    async function handleSave() {
        if (form.name.trim().length < 3) {
            setMessage({ type: 'error', text: 'El nombre requiere al menos 3 caracteres' });
            return;
        }
        setIsSaving(true);
        setMessage(null);
        try {
            await updateEntity('tournament', id, {
                ...(isApiManaged ? {
                    display_name: form.name.trim(),
                    logo_url: form.logo_url || null,
                } : {
                    name: form.name.trim(),
                    slug: form.slug || null,
                    season_id: form.season_id || null,
                    union_id: form.union_id || null,
                    country: form.country || null,
                    region: form.region || null,
                    category: form.category || null,
                    age_grade: form.age_grade || null,
                    logo_url: form.logo_url || null,
                    ruleset: form.ruleset,
                })
            });
            setIsDirty(false);
            setMessage({ type: 'success', text: 'Cambios guardados.' });
            router.refresh();
        } catch (err: unknown) {
            setMessage({ type: 'error', text: 'Error: ' + (err instanceof Error ? err.message : String(err)) });
        } finally {
            setIsSaving(false);
        }
    }

    handleSaveRef.current = handleSave;

    return (
        <div className="flash-ui-container dark bg-transparent" style={{ '--accent': '#3b82f6', minHeight: 'auto' } as React.CSSProperties}>
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-28 md:pb-20">
                {message && (
                    <div className={`p-4 mb-6 text-sm border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                        {message.text}
                    </div>
                )}

                {isApiManaged && (
                    <div className="p-4 mb-10 bg-blue-500/10 border border-blue-500/20 rounded flex items-start gap-4 animate-in fade-in duration-700">
                        <div className="w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center shrink-0 text-blue-400">
                            <Globe size={20} />
                        </div>
                        <div>
                            <h3 className="text-blue-400 font-bold text-sm uppercase tracking-wider mb-1">Torneo Gestionado por API</h3>
                            <p className="text-blue-100/70 text-xs leading-relaxed">
                                Este torneo se sincroniza automáticamente. Solo puedes editar el <strong>nombre para mostrar</strong> y el <strong>logo</strong>. 
                                La estructura competitiva y los datos de origen están protegidos para evitar conflictos de sincronización.
                            </p>
                        </div>
                    </div>
                )}

                {/* Logo & Public Status (Kinetic Structuralism) */}
                <div className="manager-card">
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1>Escudo / Logo</h1>
                            <p>Actualizá el logo e identidad gráfica del torneo.</p>
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
                                FORMAT: {form.logo_url ? (form.logo_url.startsWith('data:') ? 'DATA_URI' : form.logo_url.split('.').pop()?.substring(0, 4).toUpperCase() || 'IMG') : '--'}
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
                                            onChange={e => update('logo_url', e.target.value)}
                                        />
                                        <div className="absolute right-2 flex gap-2">
                                            <button type="button" className="manager-btn-inline secondary" onClick={(e) => { e.preventDefault(); update('logo_url', ''); }}>Limpiar</button>
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
                                            onUpload={(url) => update('logo_url', url)}
                                            accentColor="var(--accent)"
                                            label="Arrastra o clic para subir"
                                        />
                                    </div>
                                </div>
                            )}
                        </main>
                    </div>
                </div>

                <div className="manager-card mt-10">
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1 className="flex items-center gap-3"><Shield className="w-6 h-6 text-[var(--accent)]" /> Identidad Estratégica</h1>
                            <p>Denominaciones y enrutamiento web del torneo.</p>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="manager-input-group">
                            <label className="manager-field-label">{isApiManaged ? 'Nombre Público (Visible)' : 'Nombre del Torneo'}</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Top 10 Primera División"
                                    className="manager-url-input font-sans text-[14px]"
                                    value={form.name}
                                    onChange={e => update('name', e.target.value)}
                                />
                                {isApiManaged && (
                                    <p className="text-[10px] text-blue-400/60 mt-2 uppercase tracking-tighter">Este es el nombre que verán los usuarios finales.</p>
                                )}
                        </div>
                        {isApiManaged && (
                            <div className="manager-input-group">
                                <label className="manager-field-label opacity-50">Nombre Original (API)</label>
                                <input
                                    type="text"
                                    className="manager-url-input font-sans text-[14px] opacity-40 cursor-not-allowed bg-transparent"
                                    value={data.name || ''}
                                    disabled
                                />
                                <p className="text-[10px] text-[#555] mt-2 uppercase tracking-tighter">Protegido por el sistema de sincronización.</p>
                            </div>
                        )}
                        <div className="manager-input-group">
                            <label className="manager-field-label">Temporada</label>
                            <input
                                type="text"
                                placeholder="2026"
                                className={`manager-url-input font-black uppercase ${isApiManaged ? 'opacity-50 cursor-not-allowed' : 'text-[var(--accent)]'}`}
                                value={form.season_id}
                                onChange={e => update('season_id', e.target.value)}
                                disabled={isApiManaged}
                            />
                        </div>
                        <div className="manager-input-group">
                            <label className="manager-field-label">Ruta URL (Slug)</label>
                            <div className="relative flex items-center">
                                <span className={`absolute left-4 font-mono text-xs ${isApiManaged ? 'text-[#555]' : 'text-[#888]'}`}>/torneos/</span>
                                <input
                                    type="text"
                                    className={`manager-url-input pl-24 ${isApiManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    value={form.slug}
                                    onChange={e => { setSlugEdited(true); update('slug', e.target.value); }}
                                    disabled={isApiManaged}
                                />
                            </div>
                        </div>
                        <div className="manager-input-group">
                            <label className="manager-field-label">Organizador (Unión/Liga)</label>
                            <select
                                className={`manager-url-select ${isApiManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={form.union_id}
                                onChange={e => update('union_id', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">Seleccionar Unión</option>
                                {unions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="manager-card mt-10">
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1 className="flex items-center gap-3"><Globe className="w-6 h-6 text-[var(--accent)]" /> Ubicación y Alcance</h1>
                            <p>Alcance geográfico y demográfico del campeonato.</p>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="manager-input-group">
                            <label className="manager-field-label">País</label>
                            <select
                                className={`manager-url-select ${isApiManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={form.country}
                                onChange={e => update('country', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">No especificado</option>
                                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="manager-input-group">
                            <label className="manager-field-label">Región</label>
                            <select
                                className={`manager-url-select ${isApiManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={form.region}
                                onChange={e => update('region', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">No especificada</option>
                                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="manager-input-group">
                            <label className="manager-field-label">Clasificación de Edad</label>
                            <select
                                className={`manager-url-select ${isApiManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
                                value={form.age_grade}
                                onChange={e => update('age_grade', e.target.value)}
                                disabled={isApiManaged}
                            >
                                <option value="">No especificada</option>
                                {AGE_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className={`manager-card mt-10 ${isApiManaged ? 'opacity-50 pointer-events-none grayscale-[0.5]' : ''}`}>
                    <header className="manager-header">
                        <div className="manager-header-titles">
                            <h1 className="flex items-center gap-3">🏆 Políticas del Torneo (Puntos Bonus)</h1>
                            <p>Configura las reglas generales de puntuación bonus para todo el campeonato.</p>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-4 border border-[var(--border)] rounded bg-[rgba(255,255,255,0.02)]">
                            <label className="checkbox-container !border-none !p-0 !bg-transparent mb-2">
                                <input type="checkbox" checked={form.ruleset?.bonusRules?.offensiveBonus?.enabled || false} onChange={e => {
                                    update('ruleset', { ...form.ruleset, bonusRules: { ...form.ruleset?.bonusRules, offensiveBonus: { enabled: e.target.checked, type: 'tries', threshold: 4 } } });
                                }} disabled={isApiManaged} />
                                <div className="checkmark"></div>
                                <span className="text-white font-semibold flex items-center gap-2">Bonus Ofensivo <span className="text-xs bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded font-mono">4+ TRIES</span></span>
                            </label>
                            <p className="text-xs text-[#888] ml-8 mt-2">Otorga 1 punto extra al equipo que anote 4 o más tries en un partido, siempre que la fase tenga activados los puntos bonus.</p>
                        </div>

                        <div className="p-4 border border-[var(--border)] rounded bg-[rgba(255,255,255,0.02)]">
                            <label className="checkbox-container !border-none !p-0 !bg-transparent mb-2">
                                <input type="checkbox" checked={form.ruleset?.bonusRules?.defensiveBonus?.enabled || false} onChange={e => {
                                    update('ruleset', { ...form.ruleset, bonusRules: { ...form.ruleset?.bonusRules, defensiveBonus: { enabled: e.target.checked, type: 'point_diff', threshold: 7 } } });
                                }} disabled={isApiManaged} />
                                <div className="checkmark"></div>
                                <span className="text-white font-semibold flex items-center gap-2">Bonus Defensivo <span className="text-xs text-orange-400 bg-orange-400/20 px-2 py-0.5 rounded font-mono">≤ 7 PTS DIFF</span></span>
                            </label>
                            <p className="text-xs text-[#888] ml-8 mt-2">Otorga 1 punto extra al equipo que pierda por 7 puntos o menos de diferencia, siempre que la fase tenga activados los puntos bonus.</p>
                        </div>
                    </div>
                </div>

                {!isApiManaged && (
                    <FlashScoreIntegrationSection
                        tournamentId={id}
                        ruleset={form.ruleset}
                        onRulesetChange={(newRuleset) => update('ruleset', newRuleset)}
                    />
                )}

                <div className="basalt-mobile-savebar">
                    <button
                        className="manager-btn-inline"
                        style={{ padding: '12px 24px', fontSize: '14px', borderRadius: '4px' }}
                        onClick={handleSave}
                        disabled={isSaving || !isDirty}
                    >
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
}
