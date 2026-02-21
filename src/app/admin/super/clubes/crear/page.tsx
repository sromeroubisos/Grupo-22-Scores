'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LogoUploader from '@/components/LogoUploader';
import { getActiveSports } from '@/lib/data/sports';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

const activeSports = getActiveSports();

type StepId = 1 | 2 | 3 | 4 | 5;

const steps = [
    { id: 1, name: 'Básico' },
    { id: 2, name: 'Identidad' },
    { id: 3, name: 'Revisión' },
] as const;

function slugify(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

// ─── Toast mínimo ─────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
            background: type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${type === 'success' ? '#10b981' : '#ef4444'}`,
            borderRadius: '10px', padding: '12px 20px',
            display: 'flex', alignItems: 'center', gap: '10px',
            color: 'white', fontSize: '14px', maxWidth: '360px',
        }}>
            {type === 'success'
                ? <CheckCircle size={18} color="#10b981" />
                : <AlertCircle size={18} color="#ef4444" />}
            {message}
        </div>
    );
}

export default function CreateClubSuper() {
    const router = useRouter();

    const [currentStep, setCurrentStep] = useState<number>(1);
    const [createdClubId, setCreatedClubId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [form, setForm] = useState({
        name:         '',
        shortName:    '',
        sport:        'rugby',
        slug:         '',
        union_id:     'uar',
        city:         '',
        website:      '',
        primaryColor: '#10b981',
        logo_url:     '',
    });

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const update = (field: string, value: string) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const handleNameChange = (name: string) => {
        setForm(prev => ({ ...prev, name, slug: slugify(name) }));
    };

    const handleLogoUpload = useCallback((logoData: string) => {
        update('logo_url', logoData);
    }, []);

    // ── PASO 1 → Crea el club en DB inmediatamente ──────────────────────────
    const handleCreateClub = async () => {
        if (!form.name.trim()) {
            showToast('El nombre del club es requerido', 'error');
            return;
        }
        if (!form.slug) {
            showToast('El slug es inválido', 'error');
            return;
        }

        setCreating(true);
        try {
            const res = await fetch('/api/clubs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name:     form.name.trim(),
                    slug:     form.slug,
                    sport:    form.sport,
                    union_id: form.union_id,
                }),
            });

            const json = await res.json();

            if (res.status === 409) {
                showToast('El slug ya está en uso. Modificá el nombre o el slug.', 'error');
                return;
            }

            if (!res.ok) {
                showToast(json.error || 'Error al crear el club', 'error');
                return;
            }

            const clubId = json.data.id;
            setCreatedClubId(clubId);
            showToast('Club creado. Completá los datos de identidad.', 'success');
            setCurrentStep(2);
        } catch {
            showToast('Error de red al crear el club', 'error');
        } finally {
            setCreating(false);
        }
    };

    // ── PASO 2 → Guarda identidad vía PATCH ────────────────────────────────
    const handleSaveIdentity = async () => {
        if (!createdClubId) return;
        try {
            const res = await fetch(`/api/clubs/${createdClubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    short_name:    form.shortName,
                    city:          form.city,
                    primary_color: form.primaryColor,
                    logo_url:      form.logo_url,
                    website:       form.website,
                }),
            });

            if (!res.ok) {
                const j = await res.json();
                showToast(j.error || 'Error al guardar identidad', 'error');
                return;
            }

            showToast('Identidad guardada', 'success');
            setCurrentStep(3);
        } catch {
            showToast('Error de red', 'error');
        }
    };

    // ── PASO 3 → Ir a manage ───────────────────────────────────────────────
    const handleGoToManage = () => {
        if (createdClubId) {
            router.push(`/admin/super/clubes/${createdClubId}/manage`);
        }
    };

    const css = `
        :root { --accent:#10b981; --border:rgba(255,255,255,0.08); --glass:rgba(15,15,15,0.7); }
        .glass-card { background:var(--glass); backdrop-filter:blur(16px); border:1px solid var(--border); border-radius:12px; }
        .form-input { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:white; padding:12px 16px; border-radius:8px; width:100%; font-size:14px; box-sizing:border-box; }
        .form-input:focus { outline:none; border-color:var(--accent); }
        .btn-primary { background:var(--accent); color:black; padding:12px 28px; border-radius:8px; font-weight:700; border:none; cursor:pointer; font-size:14px; }
        .btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .btn-glass { background:rgba(255,255,255,0.05); border:1px solid var(--border); color:white; padding:12px 24px; border-radius:8px; cursor:pointer; font-size:14px; }
        .step-pill { padding:6px 16px; border-radius:999px; font-size:12px; font-weight:600; border:1px solid var(--border); background:transparent; color:#6b7280; cursor:pointer; }
        .step-pill.active { border-color:var(--accent); color:var(--accent); background:rgba(16,185,129,0.08); }
        .step-pill.done { border-color:#10b981; color:#10b981; }
        @media(max-width:768px) { .form-grid-2 { grid-template-columns:1fr !important; } }
    `;

    return (
        <div style={{ minHeight: '100vh', background: '#050505', color: 'white' }}>
            <style>{css}</style>

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
                    <button
                        onClick={() => router.push('/admin/super/clubes')}
                        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <ArrowLeft size={18} /> Clubes
                    </button>
                    <span style={{ color: '#333' }}>/</span>
                    <span style={{ color: 'white', fontWeight: 600 }}>Nuevo Club</span>
                </div>

                {/* Stepper */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '40px', flexWrap: 'wrap' }}>
                    {steps.map(step => (
                        <button
                            key={step.id}
                            className={`step-pill ${currentStep === step.id ? 'active' : ''} ${createdClubId && step.id < currentStep ? 'done' : ''}`}
                            onClick={() => {
                                // Solo retroceder, no saltar adelante sin crear
                                if (step.id < currentStep || (step.id === 2 && createdClubId)) {
                                    setCurrentStep(step.id);
                                }
                            }}
                        >
                            {createdClubId && step.id < currentStep ? '✓ ' : `${step.id}. `}
                            {step.name}
                        </button>
                    ))}
                </div>

                {/* ── STEP 1: Básico ──────────────────────────────────────── */}
                {currentStep === 1 && (
                    <div className="glass-card" style={{ padding: '32px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Datos del Club</h2>
                        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
                            Al confirmar, el club se crea en la base de datos. Podés agregar divisiones inmediatamente.
                        </p>

                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                    NOMBRE DEL CLUB *
                                </label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={e => handleNameChange(e.target.value)}
                                    placeholder="Ej: San Isidro Club"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                    SLUG (ID en sistema) *
                                </label>
                                <input
                                    className="form-input"
                                    value={form.slug}
                                    onChange={e => update('slug', e.target.value)}
                                    style={{ color: '#10b981', fontFamily: 'monospace' }}
                                />
                                <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                                    Solo minúsculas, números y guiones. Ej: san-isidro-club
                                </p>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '12px', textTransform: 'uppercase' }}>
                                    DEPORTE
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                                    {activeSports.map(sport => (
                                        <button
                                            key={sport.id}
                                            type="button"
                                            onClick={() => update('sport', sport.id)}
                                            style={{
                                                padding: '10px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                                                border: form.sport === sport.id ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                                                background: form.sport === sport.id ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                                                color: form.sport === sport.id ? '#10b981' : '#9ca3af',
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                            }}
                                        >
                                            <span>{sport.icon}</span><span>{sport.nameEs}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                        UNIÓN ID
                                    </label>
                                    <input
                                        className="form-input"
                                        value={form.union_id}
                                        onChange={e => update('union_id', e.target.value)}
                                        placeholder="uar"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                        CIUDAD
                                    </label>
                                    <input
                                        className="form-input"
                                        value={form.city}
                                        onChange={e => update('city', e.target.value)}
                                        placeholder="Buenos Aires"
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px' }}>
                            <button
                                className="btn-primary"
                                onClick={handleCreateClub}
                                disabled={creating || !form.name.trim() || !form.slug}
                            >
                                {creating ? 'Creando club...' : 'Crear Club y Continuar →'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 2: Identidad ────────────────────────────────────── */}
                {currentStep === 2 && createdClubId && (
                    <div className="glass-card" style={{ padding: '32px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Identidad Visual</h2>
                        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
                            Podés completar esto ahora o más tarde desde el panel de gestión.
                        </p>

                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '12px', textTransform: 'uppercase' }}>
                                        ESCUDO
                                    </label>
                                    <LogoUploader onUpload={handleLogoUpload} accentColor="#10b981" />
                                </div>
                                <div style={{ flex: 1, minWidth: '200px', display: 'grid', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                            SIGLA / NOMBRE CORTO
                                        </label>
                                        <input
                                            className="form-input"
                                            value={form.shortName}
                                            onChange={e => update('shortName', e.target.value)}
                                            placeholder="SIC"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                            COLOR PRIMARIO
                                        </label>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <input
                                                type="color"
                                                value={form.primaryColor}
                                                onChange={e => update('primaryColor', e.target.value)}
                                                style={{ width: '40px', height: '40px', border: 'none', background: 'none', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>{form.primaryColor}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>
                                            WEBSITE
                                        </label>
                                        <input
                                            className="form-input"
                                            value={form.website}
                                            onChange={e => update('website', e.target.value)}
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', gap: '16px' }}>
                            <button className="btn-glass" onClick={() => setCurrentStep(1)}>← Atrás</button>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    className="btn-glass"
                                    onClick={() => {
                                        showToast('Podés completar la identidad desde el panel de gestión', 'success');
                                        router.push(`/admin/super/clubes/${createdClubId}/manage`);
                                    }}
                                >
                                    Saltar por ahora
                                </button>
                                <button className="btn-primary" onClick={handleSaveIdentity}>
                                    Guardar Identidad →
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STEP 3: Confirmación / Ir a Manage ───────────────────── */}
                {currentStep === 3 && createdClubId && (
                    <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
                        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
                            ¡Club creado exitosamente!
                        </h2>
                        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
                            <span style={{ color: '#10b981', fontFamily: 'monospace' }}>{createdClubId}</span>
                        </p>
                        <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '32px' }}>
                            Ahora podés agregar divisiones, sedes y configurar permisos directamente desde el panel de gestión.
                        </p>
                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button className="btn-glass" onClick={() => router.push('/admin/super/clubes')}>
                                Volver a la lista
                            </button>
                            <button className="btn-primary" onClick={handleGoToManage}>
                                Ir al Panel de Gestión →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {toast && <Toast message={toast.message} type={toast.type} />}
        </div>
    );
}
