'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, AlertCircle, Plus, Trash2, Eye, EyeOff, Shield, MapPin, Trophy, Settings, Globe, ChevronLeft } from 'lucide-react';
import '../../../creation-forms.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'identidad' | 'sedes' | 'divisiones' | 'config' | 'publicar';

interface Club {
    id: string; name: string; short_name?: string; sport?: string;
    city?: string; logo_url?: string; primary_color?: string;
    union_id?: string; status?: string; is_visible?: boolean; slug?: string;
    website?: string;
}

interface Division {
    id: string; name: string; sport?: string; gender?: string;
    category?: string; status?: string; featured?: boolean; season?: string;
}

interface Venue {
    id: string; name: string; address?: string; city?: string;
    maps_link?: string; is_primary?: boolean;
}

interface SetupStatus {
    isPublished: boolean; status: string; canPublish: boolean;
    steps: {
        identity: { done: boolean; missingFields: string[] };
        divisions: { done: boolean; count: number };
        venues: { done: boolean; count: number };
    };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3500);
        return () => clearTimeout(t);
    }, [onClose]);
    return (
        <div className={`toast-notification ${type}`}>
            {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            {message}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClubManagePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const clubId = params?.id as string;

    const initialTab = (searchParams?.get('tab') as Tab) || 'identidad';
    const [activeTab, setActiveTab] = useState<Tab>(initialTab);
    const [club, setClub] = useState<Club | null>(null);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Edit form para Identidad
    const [identityForm, setIdentityForm] = useState({
        name: '', short_name: '', city: '', primary_color: '#00a365',
        logo_url: '', website: '', union_id: '',
    });

    // Form para nueva división
    const [showDivisionForm, setShowDivisionForm] = useState(false);
    const [divForm, setDivForm] = useState({ name: '', sport: '', gender: 'Masculino', category: '', season: '2026' });

    // Form para nueva sede
    const [showVenueForm, setShowVenueForm] = useState(false);
    const [venueForm, setVenueForm] = useState({ name: '', address: '', city: '', maps_link: '', is_primary: false });

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    // ── Load inicial ─────────────────────────────────────────────────────────

    const loadAll = useCallback(async () => {
        if (!clubId) return;
        setLoading(true);
        try {
            const [clubRes, divRes, venRes, statusRes] = await Promise.all([
                fetch(`/api/clubs/${clubId}`),
                fetch(`/api/clubs/${clubId}/divisions`),
                fetch(`/api/clubs/${clubId}/venues`),
                fetch(`/api/clubs/${clubId}/setup-status`),
            ]);

            if (!clubRes.ok) {
                showToast('Club no encontrado', 'error');
                return;
            }

            const [clubJson, divJson, venJson, statusJson] = await Promise.all([
                clubRes.json(), divRes.json(), venRes.json(), statusRes.json(),
            ]);

            const c = clubJson.data;
            setClub(c);
            setIdentityForm({
                name: c.name || '',
                short_name: c.short_name || '',
                city: c.city || '',
                primary_color: c.primary_color || '#00a365',
                logo_url: c.logo_url || '',
                website: c.website || '',
                union_id: c.union_id || '',
            });
            setDivisions(divJson.data || []);
            setVenues(venJson.data || []);
            setSetupStatus(statusJson.data || null);
        } catch {
            showToast('Error cargando datos del club', 'error');
        } finally {
            setLoading(false);
        }
    }, [clubId, showToast]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Guardar identidad ────────────────────────────────────────────────────

    const handleSaveIdentity = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/clubs/${clubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(identityForm),
            });
            const j = await res.json();
            if (!res.ok) { showToast(j.error || 'Error al guardar', 'error'); return; }
            setClub(j.data);
            showToast('Identidad guardada', 'success');
            loadAll(); // refresh setup status
        } catch {
            showToast('Error de red', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Crear división ────────────────────────────────────────────────────────

    const handleCreateDivision = async () => {
        if (!divForm.name.trim()) { showToast('El nombre es requerido', 'error'); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/clubs/${clubId}/divisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...divForm, sport: divForm.sport || club?.sport }),
            });
            const j = await res.json();
            if (res.status === 409) { showToast('Ya existe una división con ese nombre', 'error'); return; }
            if (!res.ok) { showToast(j.error || 'Error al crear división', 'error'); return; }
            setDivisions(prev => [...prev, j.data]);
            setDivForm({ name: '', sport: '', gender: 'Masculino', category: '', season: '2026' });
            setShowDivisionForm(false);
            showToast('División creada', 'success');
            loadAll();
        } catch {
            showToast('Error de red', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Eliminar división ─────────────────────────────────────────────────────

    const handleDeleteDivision = async (divId: string) => {
        if (!confirm('¿Eliminar esta división?')) return;
        const res = await fetch(`/api/clubs/${clubId}/divisions?division_id=${divId}`, { method: 'DELETE' });
        if (!res.ok) { showToast('Error al eliminar', 'error'); return; }
        setDivisions(prev => prev.filter(d => d.id !== divId));
        showToast('División eliminada', 'success');
        loadAll();
    };

    // ── Crear sede ────────────────────────────────────────────────────────────

    const handleCreateVenue = async () => {
        if (!venueForm.name.trim()) { showToast('El nombre es requerido', 'error'); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/clubs/${clubId}/venues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(venueForm),
            });
            const j = await res.json();
            if (!res.ok) { showToast(j.error || 'Error al crear sede', 'error'); return; }
            setVenues(prev => [...prev, j.data]);
            setVenueForm({ name: '', address: '', city: '', maps_link: '', is_primary: false });
            setShowVenueForm(false);
            showToast('Sede agregada', 'success');
        } catch {
            showToast('Error de red', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Publicar ──────────────────────────────────────────────────────────────

    const handlePublish = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/clubs/${clubId}/publish`, { method: 'POST' });
            const j = await res.json();
            if (res.status === 422) { showToast(j.error, 'error'); return; }
            if (!res.ok) { showToast(j.error || 'Error al publicar', 'error'); return; }
            showToast('¡Club publicado exitosamente!', 'success');
            loadAll();
        } catch {
            showToast('Error de red', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Despublicar ───────────────────────────────────────────────────────────

    const handleUnpublish = async () => {
        if (!confirm('¿Despublicar este club? Dejará de ser visible.')) return;
        const res = await fetch(`/api/clubs/${clubId}/publish`, { method: 'DELETE' });
        if (!res.ok) { showToast('Error al despublicar', 'error'); return; }
        showToast('Club despublicado', 'success');
        loadAll();
    };

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="creation-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⟳</div>
                    Cargando club...
                </div>
            </div>
        );
    }

    if (!club) return null;

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'identidad', label: 'Identidad', icon: <Shield size={14} /> },
        { id: 'sedes', label: 'Sedes', icon: <MapPin size={14} /> },
        { id: 'divisiones', label: `Divisiones (${divisions.length})`, icon: <Trophy size={14} /> },
        { id: 'config', label: 'Config', icon: <Settings size={14} /> },
        { id: 'publicar', label: 'Publicar', icon: <Globe size={14} /> },
    ];

    return (
        <div className="creation-body">
            <div className="creation-container">
                {/* Header */}
                <header className="creation-header">
                    <button
                        onClick={() => router.push('/admin/super/clubes')}
                        className="btn btn-outline"
                        style={{ padding: '8px 16px', marginBottom: '24px', height: 'auto', width: 'auto' }}
                    >
                        <ChevronLeft size={16} /> Volver a Clubes
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                        <div style={{
                            width: '48px', height: '48px', borderRadius: '12px', border: '2px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                            background: club.primary_color ? `${club.primary_color}18` : 'rgba(16,185,129,0.1)',
                        }}>
                            {club.logo_url
                                ? <img src={club.logo_url.startsWith('<svg') ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(club.logo_url)))}` : club.logo_url}
                                    alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                : <span style={{ fontSize: '20px', fontWeight: 800, color: club.primary_color || 'var(--accent)' }}>
                                    {club.name.charAt(0)}
                                </span>
                            }
                        </div>
                        <div>
                            <h1>{club.name}</h1>
                            <p className="meta-text" style={{ margin: 0 }}>
                                {club.sport} · {club.city || 'Sin ciudad'} · {club.union_id}
                            </p>
                        </div>
                    </div>
                </header>

                {/* Stepper / Tabs */}
                <nav className="stepper-nav">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`step-pill ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                {tab.icon}
                                {tab.label}
                            </span>
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <main className="creation-content" style={{ marginTop: '32px' }}>
                    {/* TAB: IDENTIDAD */}
                    {activeTab === 'identidad' && (
                        <article className="partition">
                            <div className="partition-header">
                                <h2>Identidad del Club</h2>
                                <p>Configura la información oficial y visual del club.</p>
                            </div>
                            <div className="partition-body">
                                <div className="form-grid">
                                    <div className="field-group">
                                        <label>NOMBRE OFICIAL</label>
                                        <input
                                            className="form-input"
                                            value={identityForm.name}
                                            onChange={e => setIdentityForm(p => ({ ...p, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>SIGLA</label>
                                            <input
                                                className="form-input"
                                                value={identityForm.short_name}
                                                onChange={e => setIdentityForm(p => ({ ...p, short_name: e.target.value }))}
                                                placeholder="Ej: SIC"
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label>CIUDAD / LOCALIDAD</label>
                                            <input
                                                className="form-input"
                                                value={identityForm.city}
                                                onChange={e => setIdentityForm(p => ({ ...p, city: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>COLOR CORPORATIVO</label>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--surface-light)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                <input
                                                    type="color"
                                                    value={identityForm.primary_color}
                                                    onChange={e => setIdentityForm(p => ({ ...p, primary_color: e.target.value }))}
                                                    style={{ width: '32px', height: '32px', border: 'none', background: 'none', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600 }}>{identityForm.primary_color.toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div className="field-group">
                                            <label>VÍNCULO UNIÓN (ID)</label>
                                            <input
                                                className="form-input"
                                                value={identityForm.union_id}
                                                onChange={e => setIdentityForm(p => ({ ...p, union_id: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="field-group">
                                        <label>SITIO WEB</label>
                                        <input
                                            className="form-input"
                                            value={identityForm.website}
                                            onChange={e => setIdentityForm(p => ({ ...p, website: e.target.value }))}
                                            placeholder="https://www.club.com"
                                        />
                                    </div>
                                    <div className="field-group">
                                        <label>LOGO / ESCUDO (URL o SVG)</label>
                                        <textarea
                                            className="form-input"
                                            value={identityForm.logo_url}
                                            onChange={e => setIdentityForm(p => ({ ...p, logo_url: e.target.value }))}
                                            rows={3}
                                            placeholder="URL de imagen o código SVG..."
                                            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                                    <button className="btn btn-primary" onClick={handleSaveIdentity} disabled={saving}>
                                        {saving ? 'Guardando...' : 'Guardar Identidad'}
                                    </button>
                                </div>
                            </div>
                        </article>
                    )}

                    {/* TAB: SEDES */}
                    {activeTab === 'sedes' && (
                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Gestión de Canchas</h2>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '4px' }}>Define los lugares donde el club hace de local.</p>
                                </div>
                                <button className="btn btn-primary" onClick={() => setShowVenueForm(true)}>
                                    <Plus size={16} /> Agregar Sede
                                </button>
                            </div>

                            {venues.length === 0 && !showVenueForm && (
                                <div className="partition" style={{ padding: '48px', textAlign: 'center' }}>
                                    <MapPin size={40} style={{ color: 'var(--text-dim)', opacity: 0.3, marginBottom: '16px' }} />
                                    <p style={{ color: 'var(--text-dim)' }}>No hay sedes registradas todavía.</p>
                                    <button className="btn btn-outline" style={{ marginTop: '16px' }} onClick={() => setShowVenueForm(true)}>+ Crear primera sede</button>
                                </div>
                            )}

                            {venues.map(venue => (
                                <div key={venue.id} className="partition" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '40px', height: '40px', background: 'var(--surface-light)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                                            <MapPin size={20} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {venue.name}
                                                {venue.is_primary && <span className="status-chip active green" style={{ fontSize: '9px', padding: '2px 8px' }}>Principal</span>}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                                {[venue.address, venue.city].filter(Boolean).join(' · ')}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (!confirm('¿Eliminar sede?')) return;
                                            const res = await fetch(`/api/clubs/${clubId}/venues?venue_id=${venue.id}`, { method: 'DELETE' });
                                            if (res.ok) { setVenues(prev => prev.filter(v => v.id !== venue.id)); showToast('Sede eliminada', 'success'); }
                                            else showToast('Error al eliminar', 'error');
                                        }}
                                        className="btn-icon"
                                        style={{ color: 'var(--accent-red)', opacity: 0.6 }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}

                            {showVenueForm && (
                                <article className="partition">
                                    <div className="partition-header">
                                        <h2>Nueva Sede / Cancha</h2>
                                    </div>
                                    <div className="partition-body">
                                        <div className="form-grid">
                                            <div className="field-group">
                                                <label>NOMBRE DEL LUGAR *</label>
                                                <input className="form-input" value={venueForm.name} onChange={e => setVenueForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Cancha Principal" />
                                            </div>
                                            <div className="grid-2">
                                                <div className="field-group">
                                                    <label>DIRECCIÓN</label>
                                                    <input className="form-input" value={venueForm.address} onChange={e => setVenueForm(p => ({ ...p, address: e.target.value }))} />
                                                </div>
                                                <div className="field-group">
                                                    <label>CIUDAD</label>
                                                    <input className="form-input" value={venueForm.city} onChange={e => setVenueForm(p => ({ ...p, city: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div className="field-group">
                                                <label>LINK GOOGLE MAPS</label>
                                                <input className="form-input" value={venueForm.maps_link} onChange={e => setVenueForm(p => ({ ...p, maps_link: e.target.value }))} placeholder="https://goo.gl/maps/..." />
                                            </div>
                                            <label className="checkbox-field" style={{ background: 'var(--surface-light)', padding: '12px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={venueForm.is_primary} onChange={e => setVenueForm(p => ({ ...p, is_primary: e.target.checked }))} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                                                <span style={{ fontSize: '13px', fontWeight: 600 }}>Cancha principal / Sede central</span>
                                            </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                                            <button className="btn btn-outline" onClick={() => setShowVenueForm(false)}>Cancelar</button>
                                            <button className="btn btn-primary" onClick={handleCreateVenue} disabled={saving}>{saving ? 'Guardando...' : 'Agregar Sede'}</button>
                                        </div>
                                    </div>
                                </article>
                            )}
                        </div>
                    )}

                    {/* TAB: DIVISIONES */}
                    {activeTab === 'divisiones' && (
                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Divisiones</h2>
                                    <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginTop: '4px' }}>Estructura competitiva del club.</p>
                                </div>
                                <button className="btn btn-primary" onClick={() => setShowDivisionForm(true)}>
                                    <Plus size={16} /> Nueva División
                                </button>
                            </div>

                            <article className="partition" style={{ padding: 0, overflow: 'hidden' }}>
                                <table className="form-table">
                                    <thead>
                                        <tr>
                                            <th>NOMBRE</th>
                                            <th>DEPORTE</th>
                                            <th>RAMA</th>
                                            <th>CAT.</th>
                                            <th>ESTADO</th>
                                            <th style={{ textAlign: 'right' }}>ACCIONES</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {divisions.map(div => (
                                            <tr key={div.id}>
                                                <td style={{ fontWeight: 700 }}>
                                                    {div.featured && <span style={{ color: 'var(--accent)', marginRight: '6px' }}>★</span>}
                                                    {div.name}
                                                </td>
                                                <td>{div.sport || club?.sport || '—'}</td>
                                                <td>{div.gender || '—'}</td>
                                                <td>{div.category || '—'}</td>
                                                <td>
                                                    <span className={`status-chip active ${div.status === 'active' ? 'green' : ''}`} style={{ fontSize: '10px' }}>
                                                        {div.status === 'active' ? 'Activa' : (div.status || 'Draft')}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button onClick={() => handleDeleteDivision(div.id)} className="btn-icon" style={{ color: 'var(--accent-red)', opacity: 0.6 }}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {divisions.length === 0 && !showDivisionForm && (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                                                    Sin divisiones registradas.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </article>

                            {showDivisionForm && (
                                <article className="partition">
                                    <div className="partition-header">
                                        <h2>Crear Nueva División</h2>
                                    </div>
                                    <div className="partition-body">
                                        <div className="form-grid">
                                            <div className="field-group">
                                                <label>NOMBRE DE LA DIVISIÓN *</label>
                                                <input className="form-input" value={divForm.name} onChange={e => setDivForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Primera, M19, Reserva" />
                                            </div>
                                            <div className="grid-2">
                                                <div className="field-group">
                                                    <label>RAMA / GÉNERO</label>
                                                    <select className="form-select" value={divForm.gender} onChange={e => setDivForm(p => ({ ...p, gender: e.target.value }))}>
                                                        <option>Masculino</option>
                                                        <option>Femenino</option>
                                                        <option>Mixto</option>
                                                    </select>
                                                </div>
                                                <div className="field-group">
                                                    <label>TEMPORADA</label>
                                                    <input className="form-input" value={divForm.season} onChange={e => setDivForm(p => ({ ...p, season: e.target.value }))} />
                                                </div>
                                            </div>
                                            <div className="field-group">
                                                <label>CATEGORÍA ESPECÍFICA</label>
                                                <input className="form-input" value={divForm.category} onChange={e => setDivForm(p => ({ ...p, category: e.target.value }))} placeholder="Ej: Elite, Juvenil, Infantil..." />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                                            <button className="btn btn-outline" onClick={() => setShowDivisionForm(false)}>Cancelar</button>
                                            <button className="btn btn-primary" onClick={handleCreateDivision} disabled={saving || !divForm.name.trim()}>
                                                {saving ? 'Creando...' : 'Crear División'}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            )}
                        </div>
                    )}

                    {/* TAB: CONFIG */}
                    {activeTab === 'config' && (
                        <article className="partition" style={{ maxWidth: '600px' }}>
                            <div className="partition-header">
                                <h2>Configuración Técnica</h2>
                            </div>
                            <div className="partition-body">
                                <div className="form-grid">
                                    <div className="field-group">
                                        <label>ID DEL CLUB (SLUG)</label>
                                        <input className="form-input" value={club.id} readOnly style={{ color: 'var(--accent)', fontFamily: 'monospace', opacity: 0.8 }} />
                                        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>Identificador permanente utilizado para rutas y API.</p>
                                    </div>
                                    <div className="field-group">
                                        <label>ESTADO DEL REGISTRO</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className={`status-chip active ${club.status === 'published' ? 'green' : ''}`}>
                                                {(club.status || 'draft').toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>
                    )}

                    {/* TAB: PUBLICAR */}
                    {activeTab === 'publicar' && (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <article className="partition" style={{ maxWidth: '580px', width: '100%', textAlign: 'center', padding: '40px' }}>
                                <div style={{
                                    width: '64px', height: '64px', borderRadius: '50%', background: 'var(--surface-light)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
                                    color: setupStatus?.isPublished ? 'var(--accent)' : 'var(--text-dim)'
                                }}>
                                    {setupStatus?.isPublished ? <CheckCircle size={32} /> : <Globe size={32} />}
                                </div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px' }}>
                                    {setupStatus?.isPublished ? '¡Club en Vivo!' : 'Lanzamiento del Club'}
                                </h2>
                                <p style={{ color: 'var(--text-dim)', fontSize: '14px', marginBottom: '32px' }}>
                                    {setupStatus?.isPublished
                                        ? 'Toda la información del club es visible para los usuarios en la aplicación.'
                                        : 'Asegúrate de cumplir con los requisitos mínimos para que el club pueda ser descubierto.'}
                                </p>

                                <div style={{ textAlign: 'left', display: 'grid', gap: '12px', marginBottom: '40px' }}>
                                    {[
                                        { label: 'Identidad completada', done: setupStatus?.steps.identity.done ?? false },
                                        { label: 'Estructura de divisiones (N)', done: (setupStatus?.steps.divisions.count ?? 0) > 0 },
                                        { label: 'Sedes y ubicación', done: (setupStatus?.steps.venues.count ?? 0) > 0 },
                                    ].map(item => (
                                        <div key={item.label} style={{
                                            display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                                            background: 'var(--surface-light)', borderRadius: '12px', border: `1px solid ${item.done ? 'var(--accent-o20)' : 'var(--border)'}`
                                        }}>
                                            {item.done ? <CheckCircle size={18} color="var(--accent)" /> : <AlertCircle size={18} color="var(--text-dim)" />}
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: item.done ? 'var(--text)' : 'var(--text-dim)' }}>{item.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {setupStatus?.isPublished ? (
                                    <button className="btn btn-outline" onClick={handleUnpublish} style={{ color: 'var(--accent-red)' }}>
                                        <EyeOff size={16} /> Despublicar Club
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-primary"
                                        onClick={handlePublish}
                                        disabled={saving || !setupStatus?.canPublish}
                                        style={{ width: '100%', padding: '16px', fontSize: '16px' }}
                                    >
                                        {saving ? 'Publicando...' : 'Publicar Club Ahora'}
                                    </button>
                                )}

                                {!setupStatus?.canPublish && !setupStatus?.isPublished && (
                                    <p style={{ color: 'var(--accent-red)', fontSize: '12px', marginTop: '16px', fontWeight: 600 }}>
                                        No se puede publicar hasta completar los requisitos.
                                    </p>
                                )}
                            </article>
                        </div>
                    )}
                </main>

                {/* Footer Actions Overlay for Identity */}
                {activeTab === 'identidad' && (
                    <footer className="actions-footer">
                        <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Los cambios en identidad afectan el SEO y rutas.</p>
                        <button className="btn btn-primary" onClick={handleSaveIdentity} disabled={saving}>
                            {saving ? 'Guardando...' : 'Actualizar Club'}
                        </button>
                    </footer>
                )}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <style jsx>{`
                .form-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .form-table th {
                    padding: 12px 20px;
                    background: var(--surface-light);
                    text-align: left;
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--text-dim);
                    border-bottom: 1px solid var(--border);
                }
                .form-table td {
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border);
                    font-size: 13px;
                }
                .btn-icon {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .btn-icon:hover {
                    background: var(--surface-light);
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
