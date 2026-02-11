'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/mock-db';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';
import LogoUploader from '@/components/LogoUploader';

export default function ClubIdentidadPage() {
    const { user } = useAuth();
    const club = db.clubs.find((c) => c.id === user?.clubId);

    const [form, setForm] = useState({
        name: club?.name || '',
        shortName: club?.shortName || '',
        city: club?.city || '',
        country: 'Argentina',
        founded: '1902',
        email: 'secretaria@sic.com.ar',
        phone: '+54 11 4747-0001',
        web: 'www.sanisidroclub.com.ar',
        instagram: '@sanisidroclub',
        twitter: '@SICRugby',
        shieldUrl: club?.logoUrl || '',
        primaryColor: club?.primaryColor || '#00ccff',
        secondaryColor: '#ffffff',
    });

    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [initializedForClubId, setInitializedForClubId] = useState<string | null>(null);

    const toBase64 = (value: string) => {
        try {
            return window.btoa(unescape(encodeURIComponent(value)));
        } catch {
            return window.btoa(value);
        }
    };

    const normalizeShieldUrl = (value: string) => {
        const trimmed = value.trim();
        if (trimmed.startsWith('<svg')) {
            return `data:image/svg+xml;base64,${toBase64(trimmed)}`;
        }
        return value;
    };

    useEffect(() => {
        if (!club?.id || initializedForClubId === club.id) return;

        const storageKey = `g22_club_identity_${club.id}`;
        let next = {
            name: club?.name || '',
            shortName: club?.shortName || '',
            city: club?.city || '',
            country: 'Argentina',
            founded: '1902',
            email: 'secretaria@sic.com.ar',
            phone: '+54 11 4747-0001',
            web: 'www.sanisidroclub.com.ar',
            instagram: '@sanisidroclub',
            twitter: '@SICRugby',
            shieldUrl: club?.logoUrl || '',
            primaryColor: club?.primaryColor || '#00ccff',
            secondaryColor: '#ffffff',
        };

        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                try {
                    next = { ...next, ...JSON.parse(stored) };
                } catch {
                    // ignore malformed storage
                }
            }
        }

        next.shieldUrl = normalizeShieldUrl(next.shieldUrl || '');
        setForm(next);
        setInitializedForClubId(club.id);
    }, [club?.id, initializedForClubId]);

    const handleChange = (field: string, value: string) => {
        const nextValue = field === 'shieldUrl' ? normalizeShieldUrl(value) : value;
        setForm((prev) => ({ ...prev, [field]: nextValue }));
        setSaved(false);
    };

    const handleSave = () => {
        if (!club?.id) return;
        setIsSaving(true);

        const normalizedShield = normalizeShieldUrl(form.shieldUrl);
        const storageKey = `g22_club_identity_${club.id}`;

        const clubIndex = db.clubs.findIndex((c) => c.id === club.id);
        if (clubIndex >= 0) {
            db.clubs[clubIndex] = {
                ...db.clubs[clubIndex],
                name: form.name,
                shortName: form.shortName,
                city: form.city,
                logoUrl: normalizedShield,
                primaryColor: form.primaryColor
            };
        }

        if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify({ ...form, shieldUrl: normalizedShield }));
        }

        setForm((prev) => ({ ...prev, shieldUrl: normalizedShield }));
        setSaved(true);
        setTimeout(() => {
            setSaved(false);
            setIsSaving(false);
        }, 1500);
    };

    return (
        <SectionShell
            title="Identidad del Club"
            subtitle="Datos institucionales, branding y presencia digital."
            actions={
                <button className={styles.btn} type="button" onClick={handleSave}>
                    {isSaving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar cambios'}
                </button>
            }
        >
            <div className={styles.sectionGrid}>
                <div className={styles.glassCard}>
                    <div className={styles.sectionHeader}>
                        <h2>Datos institucionales</h2>
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Nombre oficial</label>
                            <input className={styles.formInput} value={form.name} onChange={(e) => handleChange('name', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Nombre corto</label>
                            <input className={styles.formInput} value={form.shortName} onChange={(e) => handleChange('shortName', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Ciudad</label>
                            <input className={styles.formInput} value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Pa&iacute;s</label>
                            <input className={styles.formInput} value={form.country} onChange={(e) => handleChange('country', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Fundado</label>
                            <input className={styles.formInput} value={form.founded} onChange={(e) => handleChange('founded', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Email institucional</label>
                            <input className={styles.formInput} value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Tel&eacute;fono</label>
                            <input className={styles.formInput} value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Sitio web</label>
                            <input className={styles.formInput} value={form.web} onChange={(e) => handleChange('web', e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className={styles.glassCard}>
                    <div className={styles.sectionHeader}>
                        <h2>Branding y assets</h2>
                    </div>
                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                        <label className={styles.formLabel}>Escudo (URL)</label>
                        <input
                            className={styles.formInput}
                            type="url"
                            placeholder="https://"
                            value={form.shieldUrl}
                            onChange={(e) => handleChange('shieldUrl', e.target.value)}
                        />
                    </div>
                    <div className={styles.formGroup} style={{ marginBottom: 16 }}>
                        <label className={styles.formLabel}>Identidad Visual</label>
                        <LogoUploader
                            currentLogo={form.shieldUrl}
                            onUpload={(logoData: string) => handleChange('shieldUrl', logoData)}
                            accentColor={form.primaryColor}
                        />
                    </div>

                    <div style={{ marginTop: 24 }}>
                        <div className={styles.formLabel} style={{ marginBottom: 12 }}>Colores oficiales</div>
                        <div className={styles.colorRow}>
                            <input type="color" className={styles.colorSwatch} value={form.primaryColor} onChange={(e) => handleChange('primaryColor', e.target.value)} />
                            <div>
                                <div className={styles.formLabel}>Primario</div>
                                <span className={styles.colorLabel}>{form.primaryColor}</span>
                            </div>
                        </div>
                        <div className={styles.colorRow} style={{ marginTop: 12 }}>
                            <input type="color" className={styles.colorSwatch} value={form.secondaryColor} onChange={(e) => handleChange('secondaryColor', e.target.value)} />
                            <div>
                                <div className={styles.formLabel}>Secundario</div>
                                <span className={styles.colorLabel}>{form.secondaryColor}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: 24 }}>
                        <div className={styles.formLabel} style={{ marginBottom: 12 }}>Redes sociales</div>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Instagram</label>
                                <input className={styles.formInput} value={form.instagram} onChange={(e) => handleChange('instagram', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Twitter / X</label>
                                <input className={styles.formInput} value={form.twitter} onChange={(e) => handleChange('twitter', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </SectionShell>
    );
}
