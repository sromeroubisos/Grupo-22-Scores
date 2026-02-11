'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Edit2, Star, Plus, X } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';

export default function CreateClub() {
    const params = useParams();
    const router = useRouter();
    const unionId = params?.id as string;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);
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
    const [formData, setFormData] = useState({
        name: '',
        shortName: '',
        sport: 'Rugby Union',
        slug: '',
        country: 'Argentina',
        timezone: 'GMT-3 (Buenos Aires)',
        visibility: 'public',
        primaryColor: '#10b981',
        secondaryColor: '#000000',
        instagram: '',
        twitter: '',
        website: '',
        mainVenue: {
            name: '',
            address: '',
            city: '',
            mapsLink: ''
        },
        allowAdminManagement: false,
    });

    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);

    const [divisions, setDivisions] = useState([
        { id: 1, name: 'Primera', sport: 'Rugby Union', gender: 'Masculino', category: 'Senior', status: 'active', featured: true },
        { id: 2, name: 'Reserva', sport: 'Rugby Union', gender: 'Masculino', category: 'Senior', status: 'active', featured: false },
        { id: 3, name: 'M19', sport: 'Rugby Union', gender: 'Masculino', category: 'Juvenil', status: 'draft', featured: false },
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

    const [venues, setVenues] = useState([
        { id: 1, name: 'Anexo Villa de Mayo', address: '', city: '', mapsLink: '', isPrimary: false }
    ]);

    const updateFormData = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const updateVenueField = (field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            mainVenue: { ...prev.mainVenue, [field]: value }
        }));
    };

    const handleNameChange = (name: string) => {
        const slug = name
            .toLowerCase()
            .replace(/ /g, '-')
            .replace(/[^\w-]+/g, '');
        updateFormData('name', name);
        updateFormData('slug', slug);
    };

    const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
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

    const handleNext = () => {
        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleSaveDraft = () => {
        // Logic to save draft
        alert('Borrador guardado correctamente. Puede continuar la edición más tarde.');
    };

    const handlePublish = () => {
        // Validation logic could go here
        alert(`¡El club ${formData.name} ha sido registrado exitosamente!`);
        router.push(`/admin/union/${unionId}/clubes`);
    };

    const handleAddDivision = () => {
        if (!newDivision.name) return;
        setDivisions(prev => [...prev, { ...newDivision, id: Date.now() }]);
        setNewDivision({
            name: '',
            sport: 'Rugby Union',
            gender: 'Masculino',
            category: 'Senior',
            status: 'active',
            featured: false
        });
        setShowDivisionModal(false);
    };

    const removeDivision = (id: number) => {
        setDivisions(prev => prev.filter(d => d.id !== id));
    };

    const steps = [
        { id: 1, name: 'Básico' },
        { id: 2, name: 'Identidad' },
        { id: 3, name: 'Sedes' },
        { id: 4, name: 'Divisiones' },
        { id: 5, name: 'Revisión' },
    ];

    return (
        <>
            <style jsx global>{`
                :root {
                    --accent: #10b981;
                    --accent-glow: rgba(16, 185, 129, 0.3);
                    --glass: rgba(15, 15, 15, 0.7);
                    --border: rgba(255, 255, 255, 0.08);
                    --bg: #050505;
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
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }

                .step-underline {
                    position: relative;
                }
                .step-underline.active::after {
                    content: '';
                    position: absolute;
                    bottom: -12px;
                    left: 0;
                    width: 100%;
                    height: 2px;
                    background: var(--accent);
                    box-shadow: 0 0 10px var(--accent-glow);
                }

                .btn-glass {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid var(--border);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .btn-glass:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.2);
                }

                .btn-primary {
                    background: var(--accent);
                    color: #000;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
                }
                .btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 0 30px rgba(16, 185, 129, 0.4);
                    filter: brightness(1.1);
                }

                .form-input {
                    background: rgba(255, 255, 255, 0.05) !important;
                    border: 1px solid var(--border) !important;
                    color: white !important;
                    transition: all 0.2s ease;
                    width: 100%;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                }
                .form-input:focus {
                    border-color: var(--accent) !important;
                    outline: none;
                    background: rgba(16, 185, 129, 0.05) !important;
                    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
                }

                select.form-input {
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-opacity='0.6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 14px center;
                    background-size: 16px;
                    padding-right: 44px;
                    cursor: pointer;
                }

                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 24px;
                }

                .mono { font-family: 'JetBrains Mono', monospace; }

                .upload-circle {
                    width: 120px;
                    height: 120px;
                    border: 2px dashed var(--border);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .upload-circle:hover {
                    border-color: var(--accent);
                    background: rgba(16, 185, 129, 0.05);
                }

                .banner-preview {
                    height: 160px;
                    border-radius: 12px;
                    background: linear-gradient(45deg, #111, #222);
                    position: relative;
                    overflow: hidden;
                    border: 1px solid var(--border);
                    cursor: pointer;
                }
                .banner-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.8));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.3s;
                }
                .banner-preview:hover .banner-overlay {
                    opacity: 1;
                }

                .badge-draft {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    padding: 2px 8px;
                    border-radius: 4px;
                }

                .step-content { 
                    display: none; 
                    animation: fadeIn 0.4s ease-out; 
                }
                .step-content.active { 
                    display: block; 
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div className="bg-vignette"></div>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>

                {/* HEADER */}
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
                    <div>
                        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }} className="mono">
                            <button onClick={() => router.push('/admin')} className="hover:text-white transition">Panel</button>
                            <span>/</span>
                            <button onClick={() => router.push('/admin?tab=clubes')} className="hover:text-white transition">Clubes</button>
                            <span>/</span>
                            <span style={{ color: 'white' }}>Crear Club</span>
                        </nav>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <h1 style={{ fontSize: '30px', fontWeight: 'bold' }}>Nuevo Club</h1>
                            <span className="badge-draft">Borrador</span>
                        </div>
                    </div>
                    <button onClick={handleSaveDraft} className="btn-glass" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 500 }}>
                        Guardar borrador
                    </button>
                </header>

                {/* WIZARD TABS */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '48px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', gap: '48px', paddingBottom: '12px' }}>
                        {steps.map(step => (
                            <button
                                key={step.id}
                                onClick={() => setCurrentStep(step.id)}
                                className={`step-underline ${currentStep === step.id ? 'active' : ''}`}
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: currentStep === step.id ? 'white' : '#6b7280',
                                    transition: 'all 0.3s',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                {step.id}. {step.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* STEP 1: BASICO */}
                <div className={`step-content ${currentStep === 1 ? 'active' : ''}`} style={{ maxWidth: '768px', margin: '0 auto' }}>
                    <div className="glass-card" style={{ padding: '32px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px' }}>Datos del club</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    Nombre del club *
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ej: Club Atlético San Isidro"
                                    value={formData.name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    Sigla / Nombre Corto
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ej: CASI"
                                    value={formData.shortName}
                                    onChange={(e) => updateFormData('shortName', e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    Deporte Principal
                                </label>
                                <select className="form-input" value={formData.sport} onChange={(e) => updateFormData('sport', e.target.value)}>
                                    <option>Rugby Union</option>
                                    <option>Football</option>
                                    <option>Hockey</option>
                                    <option>Basketball</option>
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    Slug sugerido (editable)
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: '#6b7280', fontSize: '14px' }} className="mono">app.pro/</span>
                                    <input
                                        type="text"
                                        className="form-input mono"
                                        style={{ color: '#10b981', fontSize: '14px' }}
                                        value={formData.slug}
                                        onChange={(e) => updateFormData('slug', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    País
                                </label>
                                <select className="form-input" value={formData.country} onChange={(e) => updateFormData('country', e.target.value)}>
                                    <option>Argentina</option>
                                    <option>Uruguay</option>
                                    <option>Chile</option>
                                    <option>Paraguay</option>
                                    <option>Brasil</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    Zona Horaria
                                </label>
                                <input type="text" className="form-input" value={formData.timezone} readOnly style={{ opacity: 0.6 }} />
                            </div>
                            <div style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                    Visibilidad
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    {[
                                        { value: 'public', label: 'Público', desc: 'Visible para todos' },
                                        { value: 'private', label: 'Privado', desc: 'Solo administradores' },
                                        { value: 'unlisted', label: 'Oculto', desc: 'Solo con enlace' }
                                    ].map(vis => (
                                        <label
                                            key={vis.value}
                                            className="btn-glass"
                                            style={{
                                                padding: '16px',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                border: formData.visibility === vis.value ? '1px solid var(--accent)' : '1px solid var(--border)'
                                            }}
                                        >
                                            <input
                                                type="radio"
                                                name="visibility"
                                                style={{ display: 'none' }}
                                                checked={formData.visibility === vis.value}
                                                onChange={() => updateFormData('visibility', vis.value)}
                                            />
                                            <div style={{ fontSize: '14px', fontWeight: 500, color: formData.visibility === vis.value ? 'var(--accent)' : 'white' }}>
                                                {vis.label}
                                            </div>
                                            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                                                {vis.desc}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* STEP 2: IDENTIDAD */}
                <div className={`step-content ${currentStep === 2 ? 'active' : ''}`} style={{ maxWidth: '768px', margin: '0 auto' }}>
                    <div className="glass-card" style={{ padding: '32px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '32px' }}>Identidad visual</h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '40px' }}>
                            <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                                <div style={{ width: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase' }} className="mono">
                                        Escudo del Club
                                    </label>
                                    <LogoUploader
                                        onUpload={(logoData) => setLogoPreview(toDataUrl(logoData))}
                                        accentColor="#10b981"
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', gap: '24px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }} className="mono">
                                                Color Primario
                                            </label>
                                            <div className="btn-glass" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px' }}>
                                                <input
                                                    type="color"
                                                    value={formData.primaryColor}
                                                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                                                    style={{ width: '40px', height: '40px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '14px' }} className="mono">{formData.primaryColor}</span>
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }} className="mono">
                                                Color Secundario
                                            </label>
                                            <div className="btn-glass" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px' }}>
                                                <input
                                                    type="color"
                                                    value={formData.secondaryColor}
                                                    onChange={(e) => updateFormData('secondaryColor', e.target.value)}
                                                    style={{ width: '40px', height: '40px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '14px' }} className="mono">{formData.secondaryColor}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '24px', lineHeight: 1.5 }}>
                                        Recomendado: Usar el LogoUploader para vectorizar escudo en JPG/PNG.
                                        Los colores se usarán para personalizar el perfil del club y las transmisiones.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '40px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                Imagen de Portada (Banner)
                            </label>
                            <input
                                ref={bannerInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleBannerSelect}
                                style={{ display: 'none' }}
                            />
                            <div
                                className="banner-preview"
                                onClick={() => bannerInputRef.current?.click()}
                                style={{
                                    backgroundImage: bannerPreview ? `url(${bannerPreview})` : 'linear-gradient(45deg, #111, #222)',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center'
                                }}
                            >
                                <div className="banner-overlay">
                                    <span style={{ fontSize: '12px', fontWeight: 500 }}>
                                        {bannerPreview ? 'Cambiar Banner' : 'Subir Banner'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '16px' }} className="mono">
                                    Redes Sociales
                                </h3>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Instagram</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="@club"
                                    style={{ fontSize: '14px' }}
                                    value={formData.instagram}
                                    onChange={(e) => updateFormData('instagram', e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>X (Twitter)</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="@club"
                                    style={{ fontSize: '14px' }}
                                    value={formData.twitter}
                                    onChange={(e) => updateFormData('twitter', e.target.value)}
                                />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Sitio Web Oficial</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="https://www.club.com"
                                    style={{ fontSize: '14px' }}
                                    value={formData.website}
                                    onChange={(e) => updateFormData('website', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* STEP 3: SEDES */}
                <div className={`step-content ${currentStep === 3 ? 'active' : ''}`} style={{ maxWidth: '768px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div className="glass-card" style={{ padding: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Sede Principal</h2>
                                <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '4px' }} className="mono">
                                    Primary Venue
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Nombre de la Sede</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Ej: La Boya"
                                        value={formData.mainVenue.name}
                                        onChange={(e) => updateVenueField('name', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Dirección</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Roque Sáenz Peña 499"
                                        value={formData.mainVenue.address}
                                        onChange={(e) => updateVenueField('address', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Ciudad</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="San Isidro"
                                        value={formData.mainVenue.city}
                                        onChange={(e) => updateVenueField('city', e.target.value)}
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>Link de Google Maps (Opcional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="https://goo.gl/maps/..."
                                        style={{ fontSize: '14px' }}
                                        value={formData.mainVenue.mapsLink}
                                        onChange={(e) => updateVenueField('mapsLink', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {venues.map(venue => (
                            <div key={venue.id} className="glass-card" style={{ padding: '24px', border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg style={{ width: '20px', height: '20px', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 4v16m8-8H4" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 500 }}>{venue.name}</p>
                                        <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="mono">
                                            Sede Secundaria
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn-glass" style={{ padding: '8px', borderRadius: '6px' }}>
                                        <svg style={{ width: '16px', height: '16px', color: '#9ca3af' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" />
                                        </svg>
                                    </button>
                                    <button className="btn-glass hover:text-red-400" style={{ padding: '8px', borderRadius: '6px' }}>
                                        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}

                        <button
                            className="btn-glass"
                            style={{
                                width: '100%',
                                padding: '16px',
                                border: '1px dashed rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#9ca3af',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path d="M12 4v16m8-8H4" strokeWidth="2" />
                            </svg>
                            Añadir otra sede
                        </button>
                    </div>
                </div>

                {/* STEP 4: DIVISIONES */}
                <div className={`step-content ${currentStep === 4 ? 'active' : ''}`} style={{ maxWidth: '1024px', margin: '0 auto' }}>
                    <div className="glass-card" style={{ padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                            <div>
                                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Divisiones y Equipos</h2>
                                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                    Define las categorías que compiten bajo tu club.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn-glass" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px' }}>
                                    Cargar Plantilla Rugby
                                </button>
                                <button className="btn-primary" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '12px' }} onClick={() => setShowDivisionModal(true)}>
                                    + Crear División
                                </button>
                            </div>
                        </div>

                        {showDivisionModal && (
                            <div className="modal-overlay">
                                <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nueva División</h3>
                                        <button onClick={() => setShowDivisionModal(false)} className="btn-glass" style={{ padding: '4px', borderRadius: '6px' }}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        <div>
                                            <label className="mono" style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Nombre</label>
                                            <input
                                                className="form-input"
                                                value={newDivision.name}
                                                onChange={e => setNewDivision(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="Ej: Primera"
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div>
                                                <label className="mono" style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Rama</label>
                                                <select
                                                    className="form-input"
                                                    value={newDivision.gender}
                                                    onChange={e => setNewDivision(prev => ({ ...prev, gender: e.target.value }))}
                                                >
                                                    <option>Masculino</option>
                                                    <option>Femenino</option>
                                                    <option>Mixto</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mono" style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Categoría</label>
                                                <select
                                                    className="form-input"
                                                    value={newDivision.category}
                                                    onChange={e => setNewDivision(prev => ({ ...prev, category: e.target.value }))}
                                                >
                                                    <option>Senior</option>
                                                    <option>Juvenil</option>
                                                    <option>Infantil</option>
                                                    <option>Seven</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                            <button onClick={() => setShowDivisionModal(false)} className="btn-glass" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '14px' }}>
                                                Cancelar
                                            </button>
                                            <button onClick={handleAddDivision} className="btn-primary" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '14px' }}>
                                                Agregar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }} className="mono">
                                        <th style={{ paddingBottom: '16px', fontWeight: 'normal' }}>Nombre</th>
                                        <th style={{ paddingBottom: '16px', fontWeight: 'normal' }}>Deporte</th>
                                        <th style={{ paddingBottom: '16px', fontWeight: 'normal' }}>Rama</th>
                                        <th style={{ paddingBottom: '16px', fontWeight: 'normal' }}>Categoría</th>
                                        <th style={{ paddingBottom: '16px', fontWeight: 'normal' }}>Estado</th>
                                        <th style={{ paddingBottom: '16px', fontWeight: 'normal', textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody style={{ fontSize: '14px' }}>
                                    {divisions.map(division => (
                                        <tr key={division.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                                            <td style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                                                {division.featured && <span style={{ color: '#10b981' }}>★</span>}
                                                {division.name}
                                            </td>
                                            <td style={{ paddingRight: '16px', color: '#9ca3af' }}>{division.sport}</td>
                                            <td style={{ paddingRight: '16px', color: '#9ca3af' }}>{division.gender}</td>
                                            <td style={{ paddingRight: '16px', color: '#9ca3af' }}>{division.category}</td>
                                            <td style={{ paddingRight: '16px' }}>
                                                <span style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    background: division.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                                                    color: division.status === 'active' ? '#10b981' : '#6b7280',
                                                    fontSize: '10px'
                                                }}>
                                                    {division.status === 'active' ? 'Activa' : 'Draft'}
                                                </span>
                                            </td>
                                            <td style={{ paddingRight: '0', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    <button style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} onClick={() => removeDivision(division.id)}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                    <button style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                                        <Edit2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* STEP 5: REVIEW */}
                <div className={`step-content ${currentStep === 5 ? 'active' : ''}`} style={{ maxWidth: '640px', margin: '0 auto' }}>
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        <div
                            style={{
                                height: '128px',
                                background: bannerPreview ? `url(${bannerPreview})` : 'linear-gradient(to right, #059669, #000)',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                position: 'relative'
                            }}
                        >
                            <div style={{ position: 'absolute', bottom: '-40px', left: '32px' }}>
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    background: '#000',
                                    border: '4px solid #0a0a0a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden'
                                }}>
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: '24px', fontWeight: 'bold', fontStyle: 'italic', color: '#10b981' }}>
                                            {formData.name.charAt(0) || 'C'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '32px', paddingTop: '56px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>{formData.name || 'Nombre del Club'}</h2>
                                    <p style={{ fontSize: '14px', color: '#6b7280' }}>
                                        {formData.mainVenue.city || 'Ciudad'}, {formData.country}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: formData.primaryColor }}></div>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: formData.secondaryColor, border: '1px solid rgba(255,255,255,0.2)' }}></div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', padding: '24px 0', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                    <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }} className="mono">Sedes</p>
                                    <p style={{ fontSize: '14px', fontWeight: 500 }}>{formData.mainVenue.name || 'Sede Principal'}</p>
                                    {venues.length > 0 && (
                                        <p style={{ fontSize: '10px', color: '#9ca3af' }}>{venues[0].name}</p>
                                    )}
                                </div>
                                <div>
                                    <p style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }} className="mono">Divisiones</p>
                                    <p style={{ fontSize: '14px', fontWeight: 500 }}>{divisions.filter(d => d.status === 'active').length} Categorías activas</p>
                                    <p style={{ fontSize: '10px', color: '#9ca3af' }}>{formData.sport}</p>
                                </div>
                            </div>

                            <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.allowAdminManagement}
                                        onChange={(e) => updateFormData('allowAdminManagement', e.target.checked)}
                                        style={{ width: '16px', height: '16px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', accentColor: '#10b981' }}
                                    />
                                    <span style={{ fontSize: '14px', color: '#9ca3af' }}>
                                        Permitir que otros administradores gestionen este club
                                    </span>
                                </label>
                                <p style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.6' }}>
                                    Al publicar el club, el slug <span style={{ color: '#10b981' }} className="mono">{formData.slug || 'club-slug'}</span> quedará reservado. Podrás cambiar la visibilidad en cualquier momento desde los ajustes.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* NAVIGATION FOOTER */}
                <footer style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={handlePrev}
                        className="btn-glass"
                        style={{
                            padding: '12px 32px',
                            borderRadius: '12px',
                            fontSize: '14px',
                            fontWeight: 500,
                            opacity: currentStep === 1 ? 0 : 1,
                            pointerEvents: currentStep === 1 ? 'none' : 'auto',
                            transition: 'opacity 0.3s'
                        }}
                    >
                        Atrás
                    </button>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        {currentStep < 5 ? (
                            <button
                                onClick={handleNext}
                                className="btn-primary"
                                style={{ padding: '12px 40px', borderRadius: '12px', fontSize: '14px' }}
                            >
                                Siguiente
                            </button>
                        ) : (
                            <button
                                onClick={handlePublish}
                                className="btn-primary"
                                style={{ padding: '12px 40px', borderRadius: '12px', fontSize: '14px' }}
                            >
                                Publicar Club
                            </button>
                        )}
                    </div>
                </footer>
            </div>
        </>
    );
}
