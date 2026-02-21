'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, AlertCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

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
        identity:  { done: boolean; missingFields: string[] };
        divisions: { done: boolean; count: number };
        venues:    { done: boolean; count: number };
    };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3500);
        return () => clearTimeout(t);
    }, [onClose]);
    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
            background: type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}`,
            borderRadius: '10px', padding: '12px 20px',
            display: 'flex', alignItems: 'center', gap: '10px',
            color: 'white', fontSize: '14px', maxWidth: '360px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
            {type === 'success' ? <CheckCircle size={18} color="#10b981" /> : <AlertCircle size={18} color="#ef4444" />}
            {message}
        </div>
    );
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const css = `
:root { --accent:#10b981; --border:rgba(255,255,255,0.08); --glass:rgba(15,15,15,0.7); }
.glass { background:var(--glass); backdrop-filter:blur(16px); border:1px solid var(--border); border-radius:12px; }
.fi { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:white; padding:10px 14px; border-radius:8px; width:100%; font-size:14px; box-sizing:border-box; }
.fi:focus { outline:none; border-color:var(--accent); }
.bp { background:var(--accent); color:black; padding:10px 24px; border-radius:8px; font-weight:700; border:none; cursor:pointer; font-size:14px; }
.bp:disabled { opacity:0.5; cursor:not-allowed; }
.bg { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:white; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:14px; }
.tab-btn { padding:10px 20px; border:none; background:none; cursor:pointer; font-size:14px; font-weight:500; color:#6b7280; border-bottom:2px solid transparent; transition:all 0.2s; }
.tab-btn.active { color:white; border-bottom-color:var(--accent); }
label.fl { display:block; font-size:12px; color:#9ca3af; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; }
.row { display:flex; gap:16px; flex-wrap:wrap; }
.row > * { flex:1; min-width:180px; }
.badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; }
.badge-draft { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#9ca3af; }
.badge-pub { background:rgba(16,185,129,0.12); border:1px solid #10b981; color:#10b981; }
`;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClubManagePage() {
    const params       = useParams();
    const searchParams = useSearchParams();
    const router       = useRouter();
    const clubId       = params?.id as string;

    const initialTab = (searchParams?.get('tab') as Tab) || 'identidad';
    const [activeTab,   setActiveTab]   = useState<Tab>(initialTab);
    const [club,        setClub]        = useState<Club | null>(null);
    const [divisions,   setDivisions]   = useState<Division[]>([]);
    const [venues,      setVenues]      = useState<Venue[]>([]);
    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
    const [loading,     setLoading]     = useState(true);
    const [saving,      setSaving]      = useState(false);
    const [toast,       setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Edit form para Identidad
    const [identityForm, setIdentityForm] = useState({
        name: '', short_name: '', city: '', primary_color: '#10b981',
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
                name:          c.name          || '',
                short_name:    c.short_name    || '',
                city:          c.city          || '',
                primary_color: c.primary_color || '#10b981',
                logo_url:      c.logo_url      || '',
                website:       c.website       || '',
                union_id:      c.union_id      || '',
            });
            setDivisions(divJson.data || []);
            setVenues(venJson.data    || []);
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
            <div style={{ minHeight: '100vh', background: '#050505', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⟳</div>
                    Cargando club...
                </div>
            </div>
        );
    }

    if (!club) return null;

    const tabs: { id: Tab; label: string }[] = [
        { id: 'identidad',  label: 'Identidad'  },
        { id: 'sedes',      label: 'Sedes'       },
        { id: 'divisiones', label: `Divisiones (${divisions.length})` },
        { id: 'config',     label: 'Config'      },
        { id: 'publicar',   label: 'Publicar'    },
    ];

    return (
        <div style={{ minHeight: '100vh', background: '#050505', color: 'white' }}>
            <style>{css}</style>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '20px 32px' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <button
                            onClick={() => router.push('/admin/super/clubes')}
                            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                        >
                            <ArrowLeft size={16} /> Clubes
                        </button>
                        <span style={{ color: '#333' }}>/</span>
                        <span style={{ color: '#9ca3af', fontSize: '13px' }}>{club.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {/* Logo */}
                            <div style={{
                                width: '52px', height: '52px', borderRadius: '10px', border: '2px solid rgba(255,255,255,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                                background: club.primary_color ? `${club.primary_color}18` : 'rgba(16,185,129,0.1)',
                            }}>
                                {club.logo_url
                                    ? <img src={club.logo_url.startsWith('<svg') ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(club.logo_url)))}` : club.logo_url}
                                           alt={club.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    : <span style={{ fontSize: '22px', fontWeight: 700, color: club.primary_color || '#10b981' }}>
                                        {club.name.charAt(0)}
                                      </span>
                                }
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{club.name}</h1>
                                    <span className={`badge ${setupStatus?.isPublished ? 'badge-pub' : 'badge-draft'}`}>
                                        {setupStatus?.isPublished ? 'Publicado' : 'Borrador'}
                                    </span>
                                </div>
                                <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0', fontFamily: 'monospace' }}>
                                    {club.sport} · {club.city || 'Sin ciudad'} · {club.union_id}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            {setupStatus?.isPublished ? (
                                <button className="bg" onClick={handleUnpublish} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                                    <EyeOff size={14} /> Despublicar
                                </button>
                            ) : (
                                <button
                                    className="bp"
                                    onClick={() => setActiveTab('publicar')}
                                    style={{ fontSize: '13px', padding: '8px 20px' }}
                                >
                                    <Eye size={14} style={{ display: 'inline', marginRight: '6px' }} /> Publicar Club
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)', overflow: 'auto' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px' }}>

                {/* ─── TAB: IDENTIDAD ─────────────────────────────────────── */}
                {activeTab === 'identidad' && (
                    <div className="glass" style={{ padding: '32px', maxWidth: '680px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '28px' }}>Identidad del Club</h2>
                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div>
                                <label className="fl">NOMBRE</label>
                                <input className="fi" value={identityForm.name} onChange={e => setIdentityForm(p => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div className="row">
                                <div>
                                    <label className="fl">SIGLA</label>
                                    <input className="fi" value={identityForm.short_name} onChange={e => setIdentityForm(p => ({ ...p, short_name: e.target.value }))} placeholder="SIC" />
                                </div>
                                <div>
                                    <label className="fl">CIUDAD</label>
                                    <input className="fi" value={identityForm.city} onChange={e => setIdentityForm(p => ({ ...p, city: e.target.value }))} />
                                </div>
                            </div>
                            <div className="row">
                                <div>
                                    <label className="fl">COLOR PRIMARIO</label>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <input type="color" value={identityForm.primary_color} onChange={e => setIdentityForm(p => ({ ...p, primary_color: e.target.value }))} style={{ width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer' }} />
                                        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{identityForm.primary_color}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="fl">UNIÓN ID</label>
                                    <input className="fi" value={identityForm.union_id} onChange={e => setIdentityForm(p => ({ ...p, union_id: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="fl">WEBSITE</label>
                                <input className="fi" value={identityForm.website} onChange={e => setIdentityForm(p => ({ ...p, website: e.target.value }))} placeholder="https://..." />
                            </div>
                            <div>
                                <label className="fl">LOGO URL / SVG</label>
                                <textarea className="fi" value={identityForm.logo_url} onChange={e => setIdentityForm(p => ({ ...p, logo_url: e.target.value }))} rows={3} placeholder="URL o SVG del escudo" style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px' }}>
                            <button className="bp" onClick={handleSaveIdentity} disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar Identidad'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── TAB: SEDES ─────────────────────────────────────────── */}
                {activeTab === 'sedes' && (
                    <div style={{ display: 'grid', gap: '16px', maxWidth: '680px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Sedes</h2>
                            <button className="bp" onClick={() => setShowVenueForm(true)} style={{ padding: '8px 16px', fontSize: '13px' }}>
                                <Plus size={14} style={{ display: 'inline', marginRight: '4px' }} /> Agregar Sede
                            </button>
                        </div>

                        {venues.length === 0 && !showVenueForm && (
                            <div className="glass" style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                                <p style={{ marginBottom: '12px' }}>No hay sedes registradas.</p>
                                <button className="bg" onClick={() => setShowVenueForm(true)}>+ Agregar primera sede</button>
                            </div>
                        )}

                        {venues.map(venue => (
                            <div key={venue.id} className="glass" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {venue.name}
                                        {venue.is_primary && <span className="badge badge-pub" style={{ fontSize: '10px' }}>Principal</span>}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
                                        {[venue.address, venue.city].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!confirm('¿Eliminar sede?')) return;
                                        const res = await fetch(`/api/clubs/${clubId}/venues?venue_id=${venue.id}`, { method: 'DELETE' });
                                        if (res.ok) { setVenues(prev => prev.filter(v => v.id !== venue.id)); showToast('Sede eliminada', 'success'); }
                                        else showToast('Error al eliminar', 'error');
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}

                        {showVenueForm && (
                            <div className="glass" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Nueva Sede</h3>
                                <div style={{ display: 'grid', gap: '16px' }}>
                                    <div>
                                        <label className="fl">NOMBRE *</label>
                                        <input className="fi" value={venueForm.name} onChange={e => setVenueForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Cancha Principal" />
                                    </div>
                                    <div className="row">
                                        <div>
                                            <label className="fl">DIRECCIÓN</label>
                                            <input className="fi" value={venueForm.address} onChange={e => setVenueForm(p => ({ ...p, address: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="fl">CIUDAD</label>
                                            <input className="fi" value={venueForm.city} onChange={e => setVenueForm(p => ({ ...p, city: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="fl">LINK MAPS</label>
                                        <input className="fi" value={venueForm.maps_link} onChange={e => setVenueForm(p => ({ ...p, maps_link: e.target.value }))} placeholder="https://goo.gl/maps/..." />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#9ca3af' }}>
                                        <input type="checkbox" checked={venueForm.is_primary} onChange={e => setVenueForm(p => ({ ...p, is_primary: e.target.checked }))} style={{ accentColor: '#10b981' }} />
                                        Marcar como sede principal
                                    </label>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button className="bg" onClick={() => setShowVenueForm(false)}>Cancelar</button>
                                    <button className="bp" onClick={handleCreateVenue} disabled={saving}>{saving ? 'Guardando...' : 'Agregar Sede'}</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB: DIVISIONES ────────────────────────────────────── */}
                {activeTab === 'divisiones' && (
                    <div style={{ display: 'grid', gap: '16px', maxWidth: '900px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Divisiones</h2>
                                <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}>
                                    Categorías y ramas del club. Persisten en base de datos inmediatamente.
                                </p>
                            </div>
                            <button className="bp" onClick={() => setShowDivisionForm(true)} style={{ padding: '8px 16px', fontSize: '13px' }}>
                                <Plus size={14} style={{ display: 'inline', marginRight: '4px' }} /> Nueva División
                            </button>
                        </div>

                        {divisions.length === 0 && !showDivisionForm && (
                            <div className="glass" style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
                                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏆</div>
                                <p style={{ marginBottom: '16px' }}>Sin divisiones aún.</p>
                                <p style={{ fontSize: '13px', marginBottom: '20px', color: '#555' }}>
                                    Creá la primera categoría para empezar a operar.
                                </p>
                                <button className="bp" onClick={() => setShowDivisionForm(true)}>+ Nueva División</button>
                            </div>
                        )}

                        {divisions.length > 0 && (
                            <div className="glass" style={{ overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>
                                            {['Nombre', 'Deporte', 'Rama', 'Categoría', 'Estado', 'Temporada', ''].map(h => (
                                                <th key={h} style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {divisions.map(div => (
                                            <tr key={div.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                                    {div.featured && <span style={{ color: '#10b981', marginRight: '6px' }}>★</span>}
                                                    {div.name}
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#9ca3af', fontSize: '13px' }}>{div.sport || club?.sport || '—'}</td>
                                                <td style={{ padding: '14px 16px', color: '#9ca3af', fontSize: '13px' }}>{div.gender || '—'}</td>
                                                <td style={{ padding: '14px 16px', color: '#9ca3af', fontSize: '13px' }}>{div.category || '—'}</td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span className={`badge ${div.status === 'active' ? 'badge-pub' : 'badge-draft'}`} style={{ fontSize: '11px' }}>
                                                        {div.status === 'active' ? 'Activa' : div.status || 'Draft'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#9ca3af', fontSize: '13px' }}>{div.season || '—'}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleDeleteDivision(div.id)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {showDivisionForm && (
                            <div className="glass" style={{ padding: '24px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Nueva División</h3>
                                <div style={{ display: 'grid', gap: '16px' }}>
                                    <div>
                                        <label className="fl">NOMBRE *</label>
                                        <input className="fi" value={divForm.name} onChange={e => setDivForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Primera, Reserva, M19" />
                                    </div>
                                    <div className="row">
                                        <div>
                                            <label className="fl">RAMA</label>
                                            <select className="fi" value={divForm.gender} onChange={e => setDivForm(p => ({ ...p, gender: e.target.value }))}>
                                                <option>Masculino</option>
                                                <option>Femenino</option>
                                                <option>Mixto</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="fl">CATEGORÍA</label>
                                            <input className="fi" value={divForm.category} onChange={e => setDivForm(p => ({ ...p, category: e.target.value }))} placeholder="Senior, Juvenil, Infantil..." />
                                        </div>
                                        <div>
                                            <label className="fl">TEMPORADA</label>
                                            <input className="fi" value={divForm.season} onChange={e => setDivForm(p => ({ ...p, season: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                    <button className="bg" onClick={() => setShowDivisionForm(false)}>Cancelar</button>
                                    <button className="bp" onClick={handleCreateDivision} disabled={saving || !divForm.name.trim()}>
                                        {saving ? 'Guardando...' : 'Crear División'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB: CONFIG ─────────────────────────────────────────── */}
                {activeTab === 'config' && (
                    <div className="glass" style={{ padding: '32px', maxWidth: '600px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Configuración General</h2>
                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div>
                                <label className="fl">SLUG / ID</label>
                                <input className="fi" value={club.id} readOnly style={{ color: '#10b981', fontFamily: 'monospace', opacity: 0.7 }} />
                                <p style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>El ID no se puede cambiar una vez creado.</p>
                            </div>
                            <div>
                                <label className="fl">ESTADO</label>
                                <input className="fi" value={club.status || 'draft'} readOnly style={{ opacity: 0.7 }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── TAB: PUBLICAR ───────────────────────────────────────── */}
                {activeTab === 'publicar' && (
                    <div className="glass" style={{ padding: '40px', maxWidth: '600px', textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                            {setupStatus?.isPublished ? '✅' : '📋'}
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>
                            {setupStatus?.isPublished ? 'Club Publicado' : 'Publicar Club'}
                        </h2>
                        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
                            {setupStatus?.isPublished
                                ? 'Este club es visible públicamente.'
                                : 'Revisá los requisitos antes de publicar.'}
                        </p>

                        {/* Checklist */}
                        <div style={{ textAlign: 'left', display: 'grid', gap: '12px', marginBottom: '32px' }}>
                            {[
                                { label: 'Nombre completado',       done: setupStatus?.steps.identity.done ?? false },
                                { label: 'Al menos 1 división',     done: (setupStatus?.steps.divisions.count ?? 0) > 0 },
                                { label: 'Sede registrada',         done: (setupStatus?.steps.venues.count ?? 0) > 0 },
                            ].map(item => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: `1px solid ${item.done ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                                    {item.done
                                        ? <CheckCircle size={18} color="#10b981" />
                                        : <AlertCircle size={18} color="#6b7280" />}
                                    <span style={{ fontSize: '14px', color: item.done ? 'white' : '#6b7280' }}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {setupStatus?.isPublished ? (
                            <button className="bg" onClick={handleUnpublish}>
                                <EyeOff size={14} style={{ display: 'inline', marginRight: '6px' }} /> Despublicar
                            </button>
                        ) : (
                            <button
                                className="bp"
                                onClick={handlePublish}
                                disabled={saving || !setupStatus?.canPublish}
                                style={{ padding: '14px 40px', fontSize: '15px' }}
                            >
                                {saving ? 'Publicando...' : 'Publicar Club'}
                            </button>
                        )}

                        {!setupStatus?.canPublish && !setupStatus?.isPublished && (
                            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '12px' }}>
                                Completá los requisitos marcados para poder publicar.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
