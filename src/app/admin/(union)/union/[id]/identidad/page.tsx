'use client';

import { useState } from 'react';
import LogoUploader from '@/components/LogoUploader';

export default function UnionIdentity() {
    const [identity, setIdentity] = useState({
        name: 'Unión Argentina de Rugby',
        short: 'UAR',
        color: '#00a365',
        logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/82/UAR_logo_2023.svg/1200px-UAR_logo_2023.svg.png'
    });

    const [logoMethod, setLogoMethod] = useState<'url' | 'file'>('url');
    const [logoFile, setLogoFile] = useState<File | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const previewUrl = URL.createObjectURL(file);
            handleChange('logoUrl', previewUrl);
        }
    };

    const handleChange = (field: string, value: string) => {
        setIdentity(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Identidad de la Unión</h1>
                <p style={{ color: '#6b7280' }}>Personaliza cómo se ve tu unión en la aplicación pública.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '32px' }}>

                {/* Form */}
                <div style={{ background: 'white', padding: '32px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#111827', marginBottom: '24px' }}>Configuración General</h3>

                    <div style={{ display: 'grid', gap: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Nombre de la Unión</label>
                            <input
                                type="text"
                                value={identity.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Sigla / Abreviatura</label>
                            <input
                                type="text"
                                value={identity.short}
                                onChange={(e) => handleChange('short', e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Color Principal (Hex)</label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={identity.color}
                                    onChange={(e) => handleChange('color', e.target.value)}
                                    style={{ padding: '0', width: '40px', height: '40px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                />
                                <input
                                    type="text"
                                    value={identity.color}
                                    onChange={(e) => handleChange('color', e.target.value)}
                                    style={{ flex: 1, padding: '10px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Recomendado: #00a365</p>
                        </div>

                        <div>
                            <LogoUploader
                                currentLogo={identity.logoUrl}
                                onUpload={(logoData: string) => handleChange('logoUrl', logoData)}
                                accentColor={identity.color}
                                label="Logo de la Unión"
                            />
                            {logoMethod === 'url' && (
                                <div style={{ marginTop: '16px' }}>
                                    <input
                                        type="text"
                                        value={identity.logoUrl}
                                        onChange={(e) => handleChange('logoUrl', e.target.value)}
                                        placeholder="https://example.com/logo.png"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    />
                                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
                                        Pega la URL directa de la imagen (png, jpg, svg).
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn" style={{
                            padding: '10px 24px',
                            borderRadius: '6px',
                            background: 'var(--color-accent)',
                            color: 'white',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer'
                        }}>
                            Guardar Cambios
                        </button>
                    </div>
                </div>

                {/* Preview */}
                <div style={{ background: '#f9fafb', padding: '32px', borderRadius: '12px', border: '1px dashed #d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', marginBottom: '24px', textTransform: 'uppercase' }}>Vista Previa Tarjeta</h3>

                    <div style={{ width: '100%', maxWidth: '280px', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ height: '80px', background: `linear-gradient(135deg, ${identity.color} 0%, #000 150%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <div style={{
                                width: '64px',
                                height: '64px',
                                background: 'white',
                                borderRadius: '50%',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'absolute',
                                bottom: '-32px',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                            }}>
                                {identity.logoUrl ? (
                                    <img
                                        src={identity.logoUrl}
                                        alt="Logo Preview"
                                        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style'); // Show fallback
                                        }}
                                    />
                                ) : null}
                                <span style={{ fontSize: '1.5rem', display: identity.logoUrl ? 'none' : 'block' }}>🏉</span>
                            </div>
                        </div>
                        <div style={{ padding: '40px 20px 20px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, color: '#111827', fontSize: '1.2rem', marginBottom: '4px' }}>{identity.short || 'SIGLA'}</div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{identity.name || 'Nombre Completo'}</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
