'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, EyeOff, Globe, Loader2 } from 'lucide-react';

interface PublishTabProps {
    clubId: string;
    notify: (text: string, kind?: 'ok' | 'error') => void;
    onPublishedChange?: (isPublished: boolean) => void;
}

type SetupStatus = {
    isPublished: boolean;
    status: string | null;
    canPublish: boolean;
    steps: {
        identity: { done: boolean; missingFields: string[] };
        divisions: { done: boolean; count: number };
        venues: { done: boolean; count: number };
    };
};

const FIELD_LABEL: Record<string, string> = {
    name: 'el nombre',
    logo_url: 'el escudo',
    primary_color: 'el color',
};

export function PublishTab({ clubId, notify, onPublishedChange }: PublishTabProps) {
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [working, setWorking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/setup-status`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo leer el estado del club.');
            setStatus(payload?.data ?? null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudo leer el estado del club.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    const toggle = async (publish: boolean) => {
        setWorking(true);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/publish`, {
                method: publish ? 'POST' : 'DELETE',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo cambiar la publicación.');
            await load();
            onPublishedChange?.(publish);
            notify(publish ? 'Club publicado' : 'Club despublicado');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo cambiar la publicación.', 'error');
        } finally {
            setWorking(false);
        }
    };

    if (loading) {
        return <div className="cm-loading">Leyendo el estado del club...</div>;
    }

    if (error || !status) {
        return <div className="cm-alert">{error || 'No se pudo leer el estado del club.'}</div>;
    }

    const missing = status.steps.identity.missingFields
        .map((field) => FIELD_LABEL[field] || field)
        .join(', ');

    // Las sedes suman pero no bloquean: el endpoint deja publicar con identidad y
    // divisiones. Se muestra igual para que se vea qué falta completar.
    const checklist = [
        {
            label: 'Identidad',
            done: status.steps.identity.done,
            detail: status.steps.identity.done ? 'Nombre, escudo y color cargados' : `Falta ${missing}`,
            required: true,
        },
        {
            label: 'Planteles',
            done: status.steps.divisions.done,
            detail: status.steps.divisions.count === 1
                ? 'Un plantel creado'
                : `${status.steps.divisions.count} planteles creados`,
            required: true,
        },
        {
            label: 'Sedes',
            done: status.steps.venues.done,
            detail: status.steps.venues.count === 1
                ? 'Una sede cargada'
                : `${status.steps.venues.count} sedes cargadas`,
            required: false,
        },
    ];

    return (
        <section className="cm-card">
            <div className="cm-card-head">
                <div>
                    <h2>{status.isPublished ? 'El club está publicado' : 'Publicar el club'}</h2>
                    <p>
                        {status.isPublished
                            ? 'Cualquiera puede encontrarlo y ver su ficha.'
                            : 'Hasta que se publique, el club no aparece en búsquedas ni en las tablas.'}
                    </p>
                </div>
                <span className={`cm-badge${status.isPublished ? ' cm-badge-accent' : ''}`}>
                    {(status.status || 'draft').toUpperCase()}
                </span>
            </div>

            <div className="cm-list" style={{ marginBottom: 20 }}>
                {checklist.map((item) => (
                    <div key={item.label} className="cm-row">
                        <span
                            className="cm-avatar"
                            aria-hidden="true"
                            style={{ color: item.done ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                        >
                            {item.done ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        </span>
                        <div className="cm-row-main">
                            <div className="cm-row-title">{item.label}</div>
                            <div className="cm-row-sub">{item.detail}</div>
                        </div>
                        {!item.required && <span className="cm-badge">Opcional</span>}
                    </div>
                ))}
            </div>

            {status.isPublished ? (
                <button
                    type="button"
                    className="cm-btn cm-btn-danger"
                    onClick={() => toggle(false)}
                    disabled={working}
                >
                    {working
                        ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        : <EyeOff size={14} aria-hidden="true" />}
                    Despublicar
                </button>
            ) : (
                <>
                    <button
                        type="button"
                        className="cm-btn cm-btn-primary"
                        onClick={() => toggle(true)}
                        disabled={working || !status.canPublish}
                        title={!status.canPublish
                            ? 'Completá la identidad y creá al menos un plantel para poder publicar.'
                            : undefined}
                    >
                        {working
                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            : <Globe size={14} aria-hidden="true" />}
                        Publicar
                    </button>
                    {!status.canPublish && (
                        <p className="cm-hint" style={{ marginTop: 10 }}>
                            Para publicar hacen falta la identidad completa y al menos un plantel.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
