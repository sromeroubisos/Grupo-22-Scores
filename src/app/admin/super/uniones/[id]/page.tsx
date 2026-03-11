'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, AlertCircle, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// --- Shared CSS (matching ClubManagePage) ---
const css = `
:root { --accent:#10b981; --border:rgba(255,255,255,0.08); --glass:rgba(15,15,15,0.7); }
.glass { background:var(--glass); backdrop-filter:blur(16px); border:1px solid var(--border); border-radius:12px; }
.fi { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:white; padding:10px 14px; border-radius:8px; width:100%; font-size:14px; box-sizing:border-box; }
.fi:focus { outline:none; border-color:var(--accent); }
.bp { background:var(--accent); color:black; padding:10px 24px; border-radius:8px; font-weight:700; border:none; cursor:pointer; font-size:14px; display:flex; alignItems:center; gap:8px; }
.bp:disabled { opacity:0.5; cursor:not-allowed; }
.bg { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:white; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:14px; }
label.fl { display:block; font-size:12px; color:#9ca3af; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; }
.row { display:flex; gap:16px; flex-wrap:wrap; }
.row > * { flex:1; min-width:180px; }
`;

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

export default function UnionDetailPage() {
    const params = useParams();
    const router = useRouter();
    const unionId = params?.id as string;
    const supabase = createClient();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        name_es: '',
        country_id: '',
        sport_id: 'rugby',
        level: 'national',
        status: 'active',
        logo_url: '',
        primary_color: '#10b981',
        website: '',
    });

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    }, []);

    useEffect(() => {
        if (!unionId) return;
        setLoading(true);
        (supabase.from('unions') as any).select('*').eq('id', unionId).single()
            .then(({ data, error }: any) => {
                if (error) {
                    showToast('Error al cargar la unión', 'error');
                } else if (data) {
                    setFormData({
                        name: data.name || '',
                        name_es: data.name_es || (data.branding as any)?.name_es || '',
                        country_id: data.country_id || data.country || '',
                        sport_id: data.sport_id || (data.branding as any)?.sport_id || 'rugby',
                        level: data.level || (data.branding as any)?.level || 'national',
                        status: data.status || (data.branding as any)?.status || 'active',
                        logo_url: data.logo_url || (data.branding as any)?.logo_url || '',
                        primary_color: data.primary_color || (data.branding as any)?.primary_color || '#10b981',
                        website: data.website || (data.branding as any)?.website || '',
                    });
                }
                setLoading(false);
            });
    }, [unionId, supabase, showToast]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await (supabase.from('unions') as any)
                .update({
                    ...formData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', unionId);

            if (error) throw error;
            showToast('Unión actualizada correctamente', 'success');
        } catch (err: any) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#050505', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⟳</div>
                    Cargando unión...
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#050505', color: 'white', padding: '32px' }}>
            <style>{css}</style>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                    >
                        <ArrowLeft size={16} /> Volver
                    </button>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Gestionar Unión</h1>
                </div>

                <div className="glass" style={{ padding: '32px' }}>
                    <div style={{ display: 'grid', gap: '24px' }}>
                        <div className="row">
                            <div>
                                <label className="fl">NOMBRE (Inglés/Primario)</label>
                                <input className="fi" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="fl">NOMBRE (Español)</label>
                                <input className="fi" value={formData.name_es} onChange={e => setFormData({ ...formData, name_es: e.target.value })} />
                            </div>
                        </div>

                        <div className="row">
                            <div>
                                <label className="fl">DEPORTE</label>
                                <select className="fi" value={formData.sport_id} onChange={e => setFormData({ ...formData, sport_id: e.target.value })}>
                                    <option value="rugby">Rugby</option>
                                    <option value="football">Fútbol</option>
                                    <option value="hockey">Hockey</option>
                                    <option value="basketball">Básquetbol</option>
                                </select>
                            </div>
                            <div>
                                <label className="fl">NIVEL</label>
                                <select className="fi" value={formData.level} onChange={e => setFormData({ ...formData, level: e.target.value })}>
                                    <option value="national">Nacional</option>
                                    <option value="regional">Regional</option>
                                    <option value="sub_union">Sub-Unión / Local</option>
                                </select>
                            </div>
                        </div>

                        <div className="row">
                            <div>
                                <label className="fl">PAÍS (ID)</label>
                                <input className="fi" value={formData.country_id} onChange={e => setFormData({ ...formData, country_id: e.target.value })} placeholder="AR, UY, CL..." />
                            </div>
                            <div>
                                <label className="fl">ESTADO</label>
                                <select className="fi" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                    <option value="active">Activa</option>
                                    <option value="archived">Archivada</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="fl">WEBSITE</label>
                            <input className="fi" value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." />
                        </div>

                        <div className="row">
                            <div>
                                <label className="fl">COLOR PRIMARIO</label>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <input type="color" value={formData.primary_color} onChange={e => setFormData({ ...formData, primary_color: e.target.value })} style={{ width: '36px', height: '36px', border: 'none', background: 'none', cursor: 'pointer' }} />
                                    <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formData.primary_color}</span>
                                </div>
                            </div>
                            <div>
                                <label className="fl">LOGO URL</label>
                                <input className="fi" value={formData.logo_url} onChange={e => setFormData({ ...formData, logo_url: e.target.value })} placeholder="URL de la imagen" />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px', gap: '16px' }}>
                        <button className="bg" onClick={() => router.back()}>Cancelar</button>
                        <button className="bp" onClick={handleSave} disabled={saving}>
                            <Save size={18} />
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
