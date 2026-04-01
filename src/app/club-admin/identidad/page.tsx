'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';
import LogoUploader from '@/components/LogoUploader';
import { useManagedClubData } from '@/hooks/useManagedClubData';
import type { ClubFull, ClubUpdateInput } from '@/lib/types/clubs';

interface IdentityFormState {
    name: string;
    shortName: string;
    city: string;
    country: string;
    email: string;
    phone: string;
    web: string;
    instagram: string;
    twitter: string;
    shieldUrl: string;
    primaryColor: string;
}

function buildIdentityForm(club: ClubFull): IdentityFormState {
    return {
        name: club.core.name || '',
        shortName: club.core.short_name || '',
        city: club.core.city || '',
        country: club.core.country || 'Argentina',
        email: club.profile?.admin_contact_email || '',
        phone: club.profile?.admin_contact_phone || '',
        web: club.profile?.website || '',
        instagram: club.profile?.instagram || '',
        twitter: club.profile?.x_url || '',
        shieldUrl: club.core.logo_url || '',
        primaryColor: club.core.primary_color || '#00ccff',
    };
}

function normalizeShieldUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('<svg')) {
        return value;
    }

    try {
        return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(trimmed)))}`;
    } catch {
        return `data:image/svg+xml;base64,${window.btoa(trimmed)}`;
    }
}

interface ClubIdentityEditorProps {
    club: ClubFull;
    saving: boolean;
    error: string | null;
    saveClub: (input: ClubUpdateInput) => Promise<ClubFull | null>;
}

function ClubIdentityEditor({ club, saving, error, saveClub }: ClubIdentityEditorProps) {
    const [form, setForm] = useState<IdentityFormState>(() => {
        const next = buildIdentityForm(club);
        next.shieldUrl = normalizeShieldUrl(next.shieldUrl || '');
        return next;
    });
    const [saved, setSaved] = useState(false);

    const saveLabel = useMemo(() => {
        if (saving) return 'Guardando...';
        if (saved) return 'Guardado';
        return 'Guardar cambios';
    }, [saved, saving]);

    const handleChange = (field: keyof IdentityFormState, value: string) => {
        const nextValue = field === 'shieldUrl' ? normalizeShieldUrl(value) : value;
        setForm((prev) => ({ ...prev, [field]: nextValue }));
        setSaved(false);
    };

    const handleSave = async () => {
        const normalizedShield = normalizeShieldUrl(form.shieldUrl);
        const payload: ClubUpdateInput = {
            core: {
                name: form.name,
                short_name: form.shortName || null,
                city: form.city || null,
                country: form.country || undefined,
                logo_url: normalizedShield || null,
                primary_color: form.primaryColor || null,
            },
            profile: {
                admin_contact_email: form.email || null,
                admin_contact_phone: form.phone || null,
                website: form.web || null,
                instagram: form.instagram || null,
                x_url: form.twitter || null,
            },
        };

        const updatedClub = await saveClub(payload);
        if (!updatedClub) {
            return;
        }

        const next = buildIdentityForm(updatedClub);
        next.shieldUrl = normalizeShieldUrl(next.shieldUrl || '');
        setForm(next);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
    };

    return (
        <SectionShell
            title="Identidad del Club"
            subtitle="Datos institucionales, branding y presencia digital sincronizados con la ficha real del club."
            actions={
                <button className={styles.btn} type="button" onClick={handleSave} disabled={saving}>
                    {saveLabel}
                </button>
            }
        >
            {error && (
                <div className={styles.callout} style={{ marginBottom: 24 }}>
                    <span className={styles.calloutTitle}>Estado de sincronización</span>
                    <p>{error}</p>
                </div>
            )}

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
                            <label className={styles.formLabel}>País</label>
                            <input className={styles.formInput} value={form.country} onChange={(e) => handleChange('country', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Email institucional</label>
                            <input className={styles.formInput} value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Teléfono</label>
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
                        <label className={styles.formLabel}>Identidad visual</label>
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

export default function ClubIdentidadPage() {
    const { user } = useAuth();
    const { club, clubId, loading, saving, error, saveClub } = useManagedClubData(user);

    if (!loading && !clubId) {
        return (
            <SectionShell
                title="Identidad del Club"
                subtitle="Datos institucionales, branding y presencia digital sincronizados con la ficha real del club."
            >
                <div className={styles.emptyPlaceholder}>
                    <p>No se encontró un club asociado a tu usuario.</p>
                </div>
            </SectionShell>
        );
    }

    if (loading) {
        return (
            <SectionShell
                title="Identidad del Club"
                subtitle="Datos institucionales, branding y presencia digital sincronizados con la ficha real del club."
            >
                <div className={styles.emptyPlaceholder}>
                    <p>Cargando identidad institucional...</p>
                </div>
            </SectionShell>
        );
    }

    if (!club) {
        return (
            <SectionShell
                title="Identidad del Club"
                subtitle="Datos institucionales, branding y presencia digital sincronizados con la ficha real del club."
            >
                <div className={styles.callout}>
                    <span className={styles.calloutTitle}>Estado de sincronización</span>
                    <p>{error || 'No se pudo cargar la ficha del club.'}</p>
                </div>
            </SectionShell>
        );
    }

    return (
        <ClubIdentityEditor
            club={club}
            saving={saving}
            error={error}
            saveClub={saveClub}
        />
    );
}
