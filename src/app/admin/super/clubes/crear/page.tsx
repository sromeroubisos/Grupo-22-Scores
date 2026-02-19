'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Trash2, Edit2, Star, Plus, X } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import { getActiveSports } from '@/lib/data/sports';

const activeSports = getActiveSports();

export default function CreateClubSuper() {
    const router = useRouter();
    const supabase = createClient();

    // Upload refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    // Helper functions
    const toBase64 = (value: string) => {
        try {
            return window.btoa(unescape(encodeURIComponent(value)));
        } catch {
            return window.btoa(value);
        }
    };

    const toDataUrl = (logoData: string) => {
        if (!logoData) return '';
        if (logoData.startsWith('data:image/')) return logoData;
        const trimmed = logoData.trim();
        if (trimmed.startsWith('<svg')) {
            return `data:image/svg+xml;base64,${toBase64(trimmed)}`;
        }
        return logoData;
    };

    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        shortName: '',
        sport: 'rugby',
        slug: '',
        country: 'Argentina', // Country Name for UI
        country_id: 'ARG',    // ID for DB
        union_id: 'uar',      // Default Text ID
        city: '',
        website: '',
        instagram: '',
        twitter: '',
        primaryColor: '#10b981',
        secondaryColor: '#000000',
        logo_url: '',
        mainVenue: {
            name: '',
            address: '',
            city: '',
            mapsLink: ''
        },
        visibility: 'public'
    });

    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);

    // Division state (mock for now as DB schema might not support it yet fully)
    const [divisions, setDivisions] = useState([
        { id: 1, name: 'Primera', sport: 'Rugby Union', gender: 'Masculino', category: 'Senior', status: 'active', featured: true },
        { id: 2, name: 'Reserva', sport: 'Rugby Union', gender: 'Masculino', category: 'Senior', status: 'active', featured: false },
    ]);

    const [showDivisionModal, setShowDivisionModal] = useState(false);
    const [newDivision, setNewDivision] = useState({
        name: '',
        sport: 'Rugby Union',
        gender: 'Masculino',
        category: 'Senior',
        status: 'active',
        featured: false
    });

    const updateFormData = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNameChange = (name: string) => {
        const slug = name
            .toLowerCase()
            .replace(/ /g, '-')
            .replace(/[^\w-]+/g, '');
        updateFormData('name', name);
        updateFormData('slug', slug);
    };

    const handleLogoUpload = (logoData: string) => {
        setLogoPreview(toDataUrl(logoData));
        updateFormData('logo_url', logoData); // In a real app we'd upload file to Storage
    };

    const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBannerFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setBannerPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setLoading(true);

        // Prepare payload matching DB schema
        const payload = {
            id: formData.slug, // Using slug as ID for text-based ID compatibility
            name: formData.name,
            short_name: formData.shortName,
            sport: formData.sport,
            city: formData.city || formData.mainVenue.city,
            logo_url: formData.logo_url, // For now storing base64/svg string or URL
            union_id: formData.union_id,
            primary_color: formData.primaryColor,
            external_id: `manual-${Date.now()}` // Unique external ID
        };

        try {
            const { error } = await supabase.from('clubs').insert([payload]);
            if (error) throw error;
            router.push('/admin/super/clubes');
        } catch (error: any) {
            alert('Error creating club: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        { id: 1, name: 'Básico' },
        { id: 2, name: 'Identidad' },
        { id: 3, name: 'Sedes' },
        { id: 4, name: 'Divisiones' },
        { id: 5, name: 'Revisión' },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <style jsx global>{`
                :root {
                    --accent: #10b981;
                    --accent-glow: rgba(16, 185, 129, 0.3);
                    --glass: rgba(15, 15, 15, 0.7);
                    --border: rgba(255, 255, 255, 0.08);
                }
                .bg-vignette {
                    position: fixed;
                    inset: 0;
                    background: 
                        radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
                        radial-gradient(circle at 0% 100%, rgba(16, 185, 129, 0.05) 0%, transparent 40%),
                        radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
                    z-index: -1;
                }
                .glass-card {
                    background: var(--glass);
                    backdrop-filter: blur(16px);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                }
                .form-input {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid var(--border);
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    width: 100%;
                    font-size: 14px;
                }
                .form-input:focus {
                    outline: none;
                    border-color: var(--accent);
                    background: rgba(16, 185, 129, 0.05);
                }
                .btn-primary {
                    background: var(--accent);
                    color: black;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .btn-glass {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid var(--border);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                /* Desktop Stepper */
                .stepper-desktop {
                    display: flex;
                    justify-content: center;
                    gap: 48px;
                    margin-bottom: 48px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 12px;
                }
                .step-underline {
                    font-size: 14px;
                    font-weight: 500;
                    color: #6b7280;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding-bottom: 8px;
                    transition: color 0.3s;
                }
                .step-underline.active {
                    color: var(--accent);
                    border-bottom: 2px solid var(--accent); 
                }

                /* Mobile Optimizations */
                @media (max-width: 768px) {
                    .container-custom {
                        padding: 20px 16px !important;
                    }
                    .glass-card {
                        padding: 20px !important;
                        border: none;
                        background: transparent;
                        box-shadow: none;
                    }
                    .form-grid {
                        grid-template-columns: 1fr !important;
                        gap: 24px !important;
                    }
                    .stepper-desktop {
                        display: none;
                    }
                    .mobile-header {
                        margin-bottom: 24px !important;
                    }
                    .mobile-cta-bar {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background: #0b0b0b;
                        border-top: 1px solid #222;
                        padding: 16px;
                        z-index: 50;
                        display: flex;
                        justify-content: space-between;
                        gap: 12px;
                    }
                    .content-spacer {
                        padding-bottom: 80px; 
                    }
                    .identidad-layout {
                        flex-direction: column !important;
                        align-items: center;
                    }
                    /* Ocultar botones desktop en mobile */
                    .desktop-cta { 
                        display: none !important; 
                    }
                }

                /* Ocultar elementos mobile en desktop */
                @media (min-width: 769px) {
                   .mobile-stepper {
                       display: none !important;
                   }
                   .mobile-cta-bar {
                       display: none !important;
                   }
                }
            `}</style>

            <div className="bg-vignette"></div>

            <div className="container-custom" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>

                {/* HEADER */}
                <header className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
                    <div>
                        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>
                            <button onClick={() => router.push('/admin/super/clubes')} className="hover:text-white">Clubes</button>
                            <span>/</span>
                            <span style={{ color: 'white' }}>Crear Nuevo</span>
                        </nav>
                        <h1 style={{ fontSize: '30px', fontWeight: 'bold' }}>Nuevo Club</h1>
                    </div>
                </header>

                {/* DESKTOP STEPPER */}
                <div className="stepper-desktop">
                    {steps.map(step => (
                        <button
                            key={step.id}
                            onClick={() => setCurrentStep(step.id)}
                            className={`step-underline ${currentStep === step.id ? 'active' : ''}`}
                        >
                            {step.id}. {step.name}
                        </button>
                    ))}
                </div>

                {/* MOBILE STEPPER (Simple breadcrumb style) */}
                <div className="mobile-stepper" style={{ marginBottom: '24px', color: '#888', fontSize: '13px' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Paso {currentStep} de 5</span>
                    <span style={{ margin: '0 8px' }}>•</span>
                    <span style={{ color: 'white' }}>{steps[currentStep - 1].name}</span>
                </div>

                <div className="content-spacer">
                    {/* STEP 1: BASICO */}
                    {currentStep === 1 && (
                        <div className="glass-card" style={{ maxWidth: '800px', margin: '0 auto', padding: '32px' }}>
                            <div style={{ display: 'grid', gap: '32px' }}>
                                <section>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.05em' }}>Información Básica</h3>
                                    <div style={{ display: 'grid', gap: '24px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>NOMBRE DEL CLUB</label>
                                            <input className="form-input" value={formData.name} onChange={e => handleNameChange(e.target.value)} placeholder="Ej: San Isidro Club" />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>DEPORTE</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                                                {activeSports.map(sport => (
                                                    <button
                                                        key={sport.id}
                                                        type="button"
                                                        onClick={() => updateFormData('sport', sport.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                            padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
                                                            border: formData.sport === sport.id ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                                                            background: formData.sport === sport.id ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                                                            color: formData.sport === sport.id ? 'var(--accent)' : '#9ca3af',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <span>{sport.icon}</span><span>{sport.nameEs}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>SIGLA</label>
                                                <input className="form-input" value={formData.shortName} onChange={e => updateFormData('shortName', e.target.value)} placeholder="Ej: SIC" />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>SLUG (ID)</label>
                                                <input className="form-input" value={formData.slug} onChange={e => updateFormData('slug', e.target.value)} style={{ color: 'var(--accent)' }} readOnly />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }}></div>

                                <section>
                                    <h3 style={{ fontSize: '14px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.05em' }}>Ubicación</h3>
                                    <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>UNIÓN ID</label>
                                            <input className="form-input" value={formData.union_id} onChange={e => updateFormData('union_id', e.target.value)} placeholder="uar" />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>CIUDAD</label>
                                            <input className="form-input" value={formData.city} onChange={e => updateFormData('city', e.target.value)} placeholder="San Isidro" />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Desktop CTA */}
                            <div className="desktop-cta" style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn-primary" onClick={() => setCurrentStep(2)}>Siguiente: Identidad</button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: IDENTIDAD */}
                    {currentStep === 2 && (
                        <div className="glass-card" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
                            <div className="identidad-layout" style={{ display: 'flex', gap: '40px' }}>
                                <div style={{ width: '200px', flexShrink: 0 }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '12px' }}>ESCUDO</label>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <LogoUploader onUpload={handleLogoUpload} accentColor="#10b981" />
                                    </div>
                                </div>
                                <div style={{ flex: 1, display: 'grid', gap: '24px', width: '100%' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>COLOR PRIMARIO</label>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                            <input type="color" value={formData.primaryColor} onChange={e => updateFormData('primaryColor', e.target.value)} style={{ width: '40px', height: '40px', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} />
                                            <span style={{ fontFamily: 'monospace', fontSize: '14px' }}>{formData.primaryColor}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>WEBSITE OFICIAL</label>
                                        <input className="form-input" value={formData.website} onChange={e => updateFormData('website', e.target.value)} placeholder="https://..." />
                                    </div>
                                </div>
                            </div>
                            <div className="desktop-cta" style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between' }}>
                                <button className="btn-glass" onClick={() => setCurrentStep(1)}>Atrás</button>
                                <button className="btn-primary" onClick={() => setCurrentStep(3)}>Siguiente: Sedes</button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3 & 4: Placeholder */}
                    {(currentStep === 3 || currentStep === 4) && (
                        <div className="glass-card" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
                            <p style={{ color: '#888', marginBottom: '20px' }}>Configuración avanzada de Sedes y Divisiones disponible tras la creación.</p>
                            <div className="desktop-cta" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <button className="btn-glass" onClick={() => setCurrentStep(prev => prev - 1)}>Atrás</button>
                                <button className="btn-primary" onClick={() => setCurrentStep(5)}>Ir a Revisión</button>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: REVIEW & SAVE */}
                    {currentStep === 5 && (
                        <div className="glass-card" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>Resumen</h2>

                            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#666' }}>NOMBRE</label>
                                    <div style={{ fontSize: '16px' }}>{formData.name}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#666' }}>ID (SLUG)</label>
                                    <div style={{ fontSize: '16px', color: 'var(--accent)' }}>{formData.slug}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#666' }}>CIUDAD</label>
                                    <div style={{ fontSize: '16px' }}>{formData.city || '-'}</div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#666' }}>UNIÓN ID</label>
                                    <div style={{ fontSize: '16px' }}>{formData.union_id}</div>
                                </div>
                            </div>

                            <div className="desktop-cta" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                <button className="btn-glass" onClick={() => setCurrentStep(4)}>Atrás</button>
                                <button className="btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={loading}>
                                    {loading ? 'Creando...' : 'Confirmar y Crear Club'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* MOBILE STICKY CTA */}
                    <div className="mobile-cta-bar">
                        {currentStep > 1 && (
                            <button className="btn-glass" style={{ flex: 1, padding: '12px', fontSize: '14px', justifyContent: 'center' }} onClick={() => setCurrentStep(prev => prev - 1)}>
                                Atrás
                            </button>
                        )}
                        {currentStep < 5 ? (
                            <button className="btn-primary" style={{ flex: 2, padding: '12px', fontSize: '14px' }} onClick={() => setCurrentStep(prev => prev + 1)}>
                                Siguiente
                            </button>
                        ) : (
                            <button className="btn-primary" style={{ flex: 2, padding: '12px', fontSize: '14px' }} onClick={handleSave} disabled={loading}>
                                {loading ? 'Creando...' : 'Crear Club'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
