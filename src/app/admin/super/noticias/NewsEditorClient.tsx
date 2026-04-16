'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type NewsEditorClientProps = {
    newsId?: string;
};

type NewsPayload = {
    id?: string;
    title: string;
    summary: string;
    content: string;
    image_url: string;
    status: 'draft' | 'published' | 'archived';
    sport: string;
    scope: string;
};

const initialState: NewsPayload = {
    title: '',
    summary: '',
    content: '',
    image_url: '',
    status: 'draft',
    sport: 'rugby',
    scope: 'global',
};

export default function NewsEditorClient({ newsId }: NewsEditorClientProps) {
    const router = useRouter();
    const [form, setForm] = useState<NewsPayload>(initialState);
    const [loading, setLoading] = useState(Boolean(newsId));
    const [savingAction, setSavingAction] = useState<'draft' | 'published' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (!newsId) {
            return;
        }

        let cancelled = false;

        const loadNews = async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/news?id=${encodeURIComponent(newsId)}`, {
                    cache: 'no-store',
                    credentials: 'same-origin',
                });
                const payload = await response.json();

                if (!response.ok) {
                    throw new Error(payload?.error || 'No se pudo cargar la noticia.');
                }

                if (cancelled) {
                    return;
                }

                setForm({
                    id: payload.data.id,
                    title: payload.data.title || '',
                    summary: payload.data.summary || '',
                    content: payload.data.content || '',
                    image_url: payload.data.image_url || '',
                    status: payload.data.status || 'draft',
                    sport: payload.data.sport || 'rugby',
                    scope: payload.data.scope || 'global',
                });
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la noticia.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadNews();

        return () => {
            cancelled = true;
        };
    }, [newsId]);

    const updateField = <K extends keyof NewsPayload>(field: K, value: NewsPayload[K]) => {
        setSuccess(null);
        setForm((current) => ({ ...current, [field]: value }));
    };

    const persistNews = async (targetStatus: 'draft' | 'published') => {
        setSavingAction(targetStatus);
        setError(null);
        setSuccess(null);

        try {
            const method = newsId ? 'PUT' : 'POST';
            const response = await fetch('/api/news', {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    id: newsId,
                    title: form.title.trim(),
                    summary: form.summary.trim(),
                    content: form.content.trim(),
                    image_url: form.image_url.trim(),
                    status: targetStatus,
                    sport: form.sport.trim() || null,
                    scope: form.scope.trim() || 'global',
                }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo guardar la noticia.');
            }

            const nextId = payload?.data?.id || newsId;
            const nextStatus = payload?.data?.status || targetStatus;
            setForm((current) => ({
                ...current,
                id: nextId || current.id,
                status: nextStatus,
            }));
            setSuccess(
                nextStatus === 'published'
                    ? 'Noticia publicada. Ya puede verse en publico.'
                    : 'Borrador guardado. Solo el super admin puede verlo hasta publicarlo.'
            );

            if (nextId && nextId !== newsId) {
                router.replace(`/admin/super/noticias/editar/${nextId}`);
            }

            router.refresh();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la noticia.');
        } finally {
            setSavingAction(null);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await persistNews('draft');
    };

    const currentStatusLabel =
        form.status === 'published' ? 'Publicado' : form.status === 'archived' ? 'Archivado' : 'Borrador';

    return (
        <div style={{ padding: '32px 24px 48px', maxWidth: 960, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
                <p style={{ margin: 0, color: 'var(--basalt-400)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Super Admin
                </p>
                <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>
                    {newsId ? 'Editar noticia' : 'Nueva noticia'}
                </h1>
                <p style={{ margin: '10px 0 0', color: 'var(--basalt-400)', fontSize: 14 }}>
                    Los borradores no se muestran al publico. Solo un super admin puede editarlos y publicarlos.
                </p>
            </div>

            {loading ? (
                <div style={{ color: 'var(--basalt-400)' }}>Cargando noticia...</div>
            ) : (
                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
                    <input
                        value={form.title}
                        onChange={(event) => updateField('title', event.target.value)}
                        placeholder="Titulo"
                        style={inputStyle}
                        required
                    />
                    <input
                        value={form.summary}
                        onChange={(event) => updateField('summary', event.target.value)}
                        placeholder="Resumen corto"
                        style={inputStyle}
                    />
                    <input
                        value={form.image_url}
                        onChange={(event) => updateField('image_url', event.target.value)}
                        placeholder="URL de imagen"
                        style={inputStyle}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                        <input
                            value={form.sport}
                            onChange={(event) => updateField('sport', event.target.value)}
                            placeholder="Deporte"
                            style={inputStyle}
                        />
                        <select
                            value={form.scope}
                            onChange={(event) => updateField('scope', event.target.value)}
                            style={inputStyle}
                        >
                            <option value="global">Global</option>
                            <option value="tournament">Torneo</option>
                            <option value="club">Club</option>
                            <option value="union">Union</option>
                        </select>
                        <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                            Estado actual: {currentStatusLabel}
                        </div>
                    </div>
                    <textarea
                        value={form.content}
                        onChange={(event) => updateField('content', event.target.value)}
                        placeholder="Contenido de la noticia"
                        style={{ ...inputStyle, minHeight: 320, resize: 'vertical' }}
                    />

                    {error ? (
                        <div style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                            {error}
                        </div>
                    ) : null}

                    {success ? (
                        <div style={{ color: '#86efac', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 12, padding: '12px 14px' }}>
                            {success}
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => router.push('/noticias')} style={secondaryButtonStyle}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={savingAction !== null}
                            style={secondaryButtonStyle}
                            onClick={() => void persistNews('draft')}
                        >
                            {savingAction === 'draft'
                                ? 'Guardando borrador...'
                                : form.status === 'published'
                                    ? 'Guardar como borrador'
                                    : 'Guardar borrador'}
                        </button>
                        <button
                            type="button"
                            disabled={savingAction !== null}
                            style={primaryButtonStyle}
                            onClick={() => void persistNews('published')}
                        >
                            {savingAction === 'published' ? 'Publicando...' : 'Publicar'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

const inputStyle: CSSProperties = {
    width: '100%',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(10,13,16,0.9)',
    color: '#fff',
    padding: '14px 16px',
    fontSize: 14,
};

const primaryButtonStyle: CSSProperties = {
    borderRadius: 12,
    border: 'none',
    background: 'var(--color-accent)',
    color: '#000',
    padding: '12px 18px',
    fontWeight: 700,
    cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: '#fff',
    padding: '12px 18px',
    fontWeight: 600,
    cursor: 'pointer',
};
