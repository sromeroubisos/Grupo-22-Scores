'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';

type ExternalTeamPayload = {
    id: string;
    source?: string | null;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    country?: string | null;
    team_url?: string | null;
};

export default function ExternalClubLogoPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const teamId = String(params?.id || '').trim();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [form, setForm] = useState<ExternalTeamPayload>({
        id: teamId,
        source: searchParams.get('source') || 'flashscore',
        name: searchParams.get('name') || '',
        logo_url: searchParams.get('logo_url') || '',
        sport: searchParams.get('sport') || 'rugby',
        team_url: searchParams.get('team_url') || '',
    });

    const returnTo = searchParams.get('returnTo') || `/clubs/fs-team-${teamId}`;

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!teamId) {
                setError('No se encontro el team id externo.');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/admin/super/external-teams/${encodeURIComponent(teamId)}`, {
                    cache: 'no-store',
                });

                if (!cancelled && response.ok) {
                    const payload = await response.json();
                    const externalTeam = payload?.data as ExternalTeamPayload | undefined;
                    if (externalTeam) {
                        setForm((prev) => ({
                            ...prev,
                            ...externalTeam,
                            id: teamId,
                            name: externalTeam.name || prev.name,
                            logo_url: externalTeam.logo_url || prev.logo_url,
                            sport: externalTeam.sport || prev.sport,
                            source: externalTeam.source || prev.source,
                            team_url: externalTeam.team_url || prev.team_url,
                        }));
                    }
                }
            } catch {
                // Keep query-string prefill if fetch fails.
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [teamId]);

    const previewLogo = useMemo(() => form.logo_url || searchParams.get('logo_url') || '', [form.logo_url, searchParams]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#06070a', color: '#f5f7fb', display: 'grid', placeItems: 'center' }}>
                Cargando editor de logo...
            </div>
        );
    }

    async function handleSave() {
        if (!teamId) return;

        setSaving(true);
        setError(null);
        setSaved(false);

        try {
            const response = await fetch(`/api/admin/super/external-teams/${encodeURIComponent(teamId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: form.source || 'flashscore',
                    name: form.name || `External team ${teamId}`,
                    logo_url: form.logo_url || null,
                    sport: form.sport || 'rugby',
                    team_url: form.team_url || null,
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo guardar el logo externo.');
            }

            setSaved(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo guardar el logo externo.';
            setError(message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: '#06070a', color: '#f5f7fb', padding: '32px 20px 60px' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                    <div>
                        <Link
                            href={returnTo}
                            prefetch={false}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#9aa4b2', marginBottom: 16 }}
                        >
                            <ArrowLeft size={16} />
                            Volver al club
                        </Link>
                        <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: 8 }}>Editar logo externo</h1>
                        <p style={{ color: '#9aa4b2', maxWidth: 620 }}>
                            Este panel guarda un override persistente para el club API y el frontend lo prioriza al renderizar el escudo.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.push(returnTo)}
                        style={{
                            alignSelf: 'flex-start',
                            background: 'transparent',
                            color: '#9aa4b2',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 999,
                            padding: '10px 16px',
                            cursor: 'pointer',
                        }}
                    >
                        Cerrar
                    </button>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
                    gap: 24,
                }}>
                    <section style={{
                        background: 'rgba(18,20,26,0.94)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 24,
                        padding: 24,
                    }}>
                        <div style={{ display: 'grid', gap: 16 }}>
                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Nombre</span>
                                <input
                                    value={form.name || ''}
                                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                    style={{
                                        height: 44,
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#0d1016',
                                        color: '#fff',
                                        padding: '0 14px',
                                    }}
                                />
                            </label>

                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Logo URL / Data URL</span>
                                <textarea
                                    value={form.logo_url || ''}
                                    onChange={(event) => setForm((prev) => ({ ...prev, logo_url: event.target.value }))}
                                    rows={5}
                                    placeholder="https://... o data:image/..."
                                    style={{
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#0d1016',
                                        color: '#fff',
                                        padding: 14,
                                        resize: 'vertical',
                                    }}
                                />
                            </label>

                            <LogoUploader
                                currentLogo={previewLogo}
                                onUpload={(logoData) => setForm((prev) => ({ ...prev, logo_url: logoData }))}
                                accentColor="#00a365"
                                label="Subir logo"
                            />

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        border: 'none',
                                        borderRadius: 999,
                                        padding: '12px 18px',
                                        background: '#00a365',
                                        color: '#04110a',
                                        fontWeight: 800,
                                        cursor: saving ? 'wait' : 'pointer',
                                    }}
                                >
                                    <Save size={16} />
                                    {saving ? 'Guardando...' : 'Guardar logo'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm((prev) => ({ ...prev, logo_url: '' }))}
                                    style={{
                                        borderRadius: 999,
                                        padding: '12px 18px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: '#fff',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Limpiar override
                                </button>
                            </div>

                            {saved ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6ee7b7', fontWeight: 700 }}>
                                    <CheckCircle2 size={18} />
                                    Logo externo guardado. Al volver al perfil deberia verse el cambio.
                                </div>
                            ) : null}
                            {error ? <div style={{ color: '#fca5a5', fontWeight: 700 }}>{error}</div> : null}
                        </div>
                    </section>

                    <aside style={{
                        background: 'rgba(18,20,26,0.94)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 24,
                        padding: 24,
                        height: 'fit-content',
                    }}>
                        <div style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Equipo API</div>
                        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>{form.name || 'Club externo'}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 4 }}>Team ID: {teamId}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 20 }}>Source: {form.source || 'flashscore'}</div>

                        <div style={{
                            width: 112,
                            height: 112,
                            borderRadius: 20,
                            background: '#0d1016',
                            border: '1px solid rgba(255,255,255,0.08)',
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                            marginBottom: 18,
                        }}>
                            {previewLogo
                                ? <img src={previewLogo} alt={form.name || teamId} style={{ width: '76%', height: '76%', objectFit: 'contain' }} />
                                : <span style={{ color: '#6b7280', fontWeight: 800 }}>SIN LOGO</span>}
                        </div>

                        <div style={{ color: '#cdd6e1', lineHeight: 1.5 }}>
                            El override queda asociado al `team_id` externo y se usa antes del logo original.
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
