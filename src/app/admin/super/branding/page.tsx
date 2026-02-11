'use client';

import React, { useState } from 'react';
import styles from '../page.module.css';
import LogoUploader from '@/components/LogoUploader';

export default function BrandingPage() {
    const [colors, setColors] = useState({
        primary: '#1d4ed8',
        secondary: '#1e293b',
        accent: '#f59e0b',
        background: '#0f172a'
    });

    const [logo, setLogo] = useState('https://placehold.co/150x50/white/black?text=Logo');
    const [font, setFont] = useState('Inter');

    const handleColorChange = (key: keyof typeof colors, value: string) => {
        setColors(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        alert('Configuración de branding guardada globalmente.');
        // Here we would sync with CSS variables or DB
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Branding y Plantillas</h1>
                        <p className={styles.pageSubtitle}>Identidad visual de la plataforma</p>
                    </div>
                    <div className={styles.headerRight}>
                        <button className={styles.viewSiteBtn} onClick={handleSave} style={{ background: 'var(--color-accent)', color: 'white' }}>
                            Guardar Cambios
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.grid}>
                        {/* Colors */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>Colores del Tema</h2>
                            </div>
                            <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                                {Object.entries(colors).map(([key, value]) => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <input
                                            type="color"
                                            value={value}
                                            onChange={(e) => handleColorChange(key as any, e.target.value)}
                                            style={{ width: '50px', height: '50px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{key}</div>
                                            <input
                                                type="text"
                                                value={value}
                                                onChange={(e) => handleColorChange(key as any, e.target.value)}
                                                style={{ background: 'transparent', border: '1px solid #374151', color: 'inherit', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Assets */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>Assets Globales</h2>
                            </div>
                            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <LogoUploader
                                        currentLogo={logo}
                                        onUpload={(logoData: string) => setLogo(logoData)}
                                        accentColor={colors.accent}
                                        label="Logo de la Aplicación"
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Fuente Principal</label>
                                    <select
                                        value={font}
                                        onChange={(e) => setFont(e.target.value)}
                                        style={{ width: '100%', padding: '8px', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'white' }}
                                    >
                                        <option value="Inter">Inter</option>
                                        <option value="Roboto">Roboto</option>
                                        <option value="Montserrat">Montserrat</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
