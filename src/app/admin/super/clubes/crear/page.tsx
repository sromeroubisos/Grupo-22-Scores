'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LogoUploader from '@/components/LogoUploader';
import { getActiveSports } from '@/lib/data/sports';
import { ChevronLeft, CheckCircle, AlertCircle, Save, Share2, Globe, MapPin, Trophy } from 'lucide-react';
import '../../creation-forms.css';

const activeSports = getActiveSports();

type StepId = 1 | 2 | 3;

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

// ─── Toast mínimo (Usando clases compartidas o inline simple) ──────────────────
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
    return (
        <div style={{
            position: 'fixed', bottom: '100px', right: '24px', zIndex: 9999,
            background: type === 'success' ? 'rgba(0,163,101,0.2)' : 'rgba(239,68,68,0.2)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${type === 'success' ? '#00a365' : '#ef4444'}`,
            borderRadius: '12px', padding: '16px 24px',
            display: 'flex', alignItems: 'center', gap: '12px',
            color: 'white', fontSize: '14px', maxWidth: '400px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            fontWeight: 700
        }}>
            {type === 'success'
                ? <CheckCircle size={20} color="#00a365" />
                : <AlertCircle size={20} color="#ef4444" />}
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
        name: '',
        shortName: '',
        sport: 'rugby',
        slug: '',
        union_id: 'uar',
        city: '',
        website: '',
        primaryColor: '#00a365',
        logo_url: '',
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
                    name: form.name.trim(),
                    slug: form.slug,
                    sport: form.sport,
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
            showToast('Club registrado. Completá la identidad visual.', 'success');
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
        setCreating(true);
        try {
            const res = await fetch(`/api/clubs/${createdClubId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    short_name: form.shortName,
                    city: form.city,
                    primary_color: form.primaryColor,
                    logo_url: form.logo_url,
                    website: form.website,
                }),
            });

            if (!res.ok) {
                const j = await res.json();
                showToast(j.error || 'Error al guardar identidad', 'error');
                return;
            }

            showToast('Identidad visual actualizada', 'success');
            setCurrentStep(3);
        } catch {
            showToast('Error de red', 'error');
        } finally {
            setCreating(false);
        }
    };

    const handleGoToManage = () => {
        if (createdClubId) {
            router.push(`/admin/entities/${createdClubId}/manage?type=club`);
        }
    };

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
                    <h1>{currentStep === 3 ? '¡Todo listo!' : 'Nuevo Club Profesional'}</h1>
                    <p>Configura la identidad y parámetros globales de la institución.</p>
                </header>

                {/* Stepper */}
                <nav className="stepper-nav">
                    {steps.map(step => (
                        <button
                            key={step.id}
                            className={`step-pill ${currentStep === step.id ? 'active' : ''} ${createdClubId && step.id < currentStep ? 'done' : ''}`}
                            onClick={() => {
                                if (step.id < currentStep || (step.id === 2 && createdClubId)) {
                                    setCurrentStep(step.id);
                                }
                            }}
                        >
                            {createdClubId && step.id < currentStep ? '✓ ' : `${step.id}. `}
                            {step.name}
                        </button>
                    ))}
                </nav>

                {/* ── STEP 1: Básico ──────────────────────────────────────── */}
                {currentStep === 1 && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Datos Generales</h2>
                            <p>Información básica para identificar al club en el sistema.</p>
                        </div>
                        <div className="partition-body">
                            <div className="form-grid">
                                <div className="field-group">
                                    <label>NOMBRE DEL CLUB *</label>
                                    <input
                                        className="form-input"
                                        value={form.name}
                                        onChange={e => handleNameChange(e.target.value)}
                                        placeholder="Ej: San Isidro Club"
                                    />
                                </div>

                                <div className="field-group">
                                    <label>SLUG (IDENTIFICADOR) *</label>
                                    <input
                                        className="form-input"
                                        value={form.slug}
                                        onChange={e => update('slug', e.target.value)}
                                        style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono' }}
                                    />
                                    <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                                        URL amigable. Solo minúsculas, números y guiones.
                                    </p>
                                </div>

                                <div className="field-group" style={{ gap: 16 }}>
                                    <label>DEPORTE PRINCIPAL</label>
                                    <div className="choice-grid">
                                        {activeSports.map(sport => (
                                            <button
                                                key={sport.id}
                                                type="button"
                                                onClick={() => update('sport', sport.id)}
                                                className={`choice-btn ${form.sport === sport.id ? 'selected' : ''}`}
                                            >
                                                <span className="choice-icon">{sport.icon}</span>
                                                <span className="choice-label">{sport.nameEs}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid-2">
                                    <div className="field-group">
                                        <label>UNIÓN / ORGANISMO</label>
                                        <input
                                            className="form-input"
                                            value={form.union_id}
                                            onChange={e => update('union_id', e.target.value)}
                                            placeholder="Ej: UAR, URBA..."
                                        />
                                    </div>
                                    <div className="field-group">
                                        <label>CIUDAD / REGIÓN</label>
                                        <input
                                            className="form-input"
                                            value={form.city}
                                            onChange={e => update('city', e.target.value)}
                                            placeholder="Buenos Aires"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* ── STEP 2: Identidad ────────────────────────────────────── */}
                {currentStep === 2 && createdClubId && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Identidad Visual</h2>
                            <p>Establece los colores y el escudo oficial del club.</p>
                        </div>
                        <div className="partition-body">
                            <div className="form-grid">
                                <section style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <div className="field-group">
                                        <label>ESCUDO OFICIAL</label>
                                        <LogoUploader onUpload={handleLogoUpload} accentColor="var(--accent)" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: '280px', display: 'grid', gap: '20px' }}>
                                        <div className="field-group">
                                            <label>SIGLA / NOMBRE CORTO</label>
                                            <input
                                                className="form-input"
                                                value={form.shortName}
                                                onChange={e => update('shortName', e.target.value)}
                                                placeholder="Ej: SIC, CASI, CUBA..."
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label>COLOR IDENTITARIO</label>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                <input
                                                    type="color"
                                                    value={form.primaryColor}
                                                    onChange={e => update('primaryColor', e.target.value)}
                                                    style={{ width: '44px', height: '44px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                                                />
                                                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '14px', fontWeight: 800 }}>{form.primaryColor.toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div className="field-group">
                                            <label>SITIO WEB OFICIAL</label>
                                            <input
                                                className="form-input"
                                                value={form.website}
                                                onChange={e => update('website', e.target.value)}
                                                placeholder="https://www.misitio.com"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </article>
                )}

                {/* ── STEP 3: Revisión / Éxito ─────────────────────────────── */}
                {currentStep === 3 && createdClubId && (
                    <article className="partition" style={{ textAlign: 'center' }}>
                        <div className="partition-body" style={{ padding: '60px 40px' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '24px' }}>🏆</div>
                            <h2 style={{ fontSize: '2rem', fontWeight: 950, textTransform: 'uppercase', marginBottom: '12px' }}>
                                Club Creado con Éxito
                            </h2>
                            <div style={{
                                display: 'inline-block',
                                background: 'var(--accent-glow)',
                                border: '1px solid var(--accent)',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                marginBottom: '24px'
                            }}>
                                <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontWeight: 800 }}>{form.slug}</span>
                            </div>
                            <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto 40px' }}>
                                La institución ya forma parte del ecosistema. Ahora puedes configurar planteles, sedes y competencias.
                            </p>

                            <div className="grid-2" style={{ maxWidth: 500, margin: '0 auto' }}>
                                <button className="btn btn-outline" onClick={() => router.push('/admin/super/clubes')}>
                                    LISTADO GENERAL
                                </button>
                                <button className="btn btn-primary" onClick={handleGoToManage}>
                                    IR A GESTIÓN <ChevronLeft size={16} style={{ transform: 'rotate(180deg)' }} />
                                </button>
                            </div>
                        </div>
                    </article>
                )}

                {/* Footer Actions */}
                <footer className="actions-footer">
                    {currentStep === 1 && (
                        <button
                            className="btn btn-primary"
                            onClick={handleCreateClub}
                            disabled={creating || !form.name.trim() || !form.slug}
                        >
                            {creating ? 'PROCESANDO...' : 'REGISTRAR CLUB Y CONTINUAR'}
                        </button>
                    )}
                    {currentStep === 2 && (
                        <>
                            <button className="btn btn-outline" onClick={() => setCurrentStep(1)}>
                                VOLVER
                            </button>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        showToast('Identidad pendiente - Puedes editarla luego', 'success');
                                        router.push(`/admin/entities/${createdClubId}/manage?type=club`);
                                    }}
                                >
                                    OMITIR
                                </button>
                                <button className="btn btn-primary" onClick={handleSaveIdentity} disabled={creating}>
                                    {creating ? 'GUARDANDO...' : 'GUARDAR IDENTIDAD'}
                                </button>
                            </div>
                        </>
                    )}
                </footer>
            </div>

            {toast && <Toast message={toast.message} type={toast.type} />}
        </div>
    );
}

