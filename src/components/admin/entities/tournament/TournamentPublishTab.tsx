'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, LockOpen, Radio, Star, StarOff } from 'lucide-react';
import { updateEntity } from '@/app/admin/entities/actions';
import { useLeaveConfirm } from '@/hooks/useLeaveConfirm';
import { Database } from '@/lib/database.types';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type TournamentStatus = 'draft' | 'published' | 'active' | 'archived';
type PublicationState = {
    status: TournamentStatus;
    is_visible: boolean;
    is_popular: boolean;
    sync_locked: boolean;
};

const STATUS_OPTIONS: Array<{
    value: TournamentStatus;
    label: string;
    hint: string;
}> = [
    {
        value: 'draft',
        label: 'Borrador',
        hint: 'Oculto del catalogo publico mientras se configura.',
    },
    {
        value: 'published',
        label: 'Publicado',
        hint: 'Disponible para consulta publica sin marcarlo como competencia en curso.',
    },
    {
        value: 'active',
        label: 'Activo',
        hint: 'Competencia vigente. Aparece en catalogo, busqueda y flujos operativos.',
    },
    {
        value: 'archived',
        label: 'Archivado',
        hint: 'Retirado de la salida publica y conservado como historico interno.',
    },
];

function normalizeStatus(value: unknown): TournamentStatus {
    if (value === 'published' || value === 'active' || value === 'archived') {
        return value;
    }

    return 'draft';
}

function isPublicStatus(status: TournamentStatus) {
    return status === 'published' || status === 'active';
}

function getInitialState(data: TournamentRow): PublicationState {
    const status = normalizeStatus(data.status);

    return {
        status,
        is_visible: typeof data.is_visible === 'boolean' ? data.is_visible : isPublicStatus(status),
        is_popular: data.is_popular === true,
        sync_locked: data.sync_locked === true,
    };
}

function statusLabel(status: TournamentStatus) {
    return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function TournamentPublishTab({ data, id }: { data: TournamentRow; id: string; matchCount?: number }) {
    const router = useRouter();
    const dataStatus = normalizeStatus(data.status);
    const dataIsVisible = typeof data.is_visible === 'boolean' ? data.is_visible : isPublicStatus(dataStatus);
    const dataIsPopular = data.is_popular === true;
    const dataSyncLocked = data.sync_locked === true;
    const [savedState, setSavedState] = useState<PublicationState>(() => getInitialState(data));
    const [form, setForm] = useState<PublicationState>(() => getInitialState(data));
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const initialState = {
            status: dataStatus,
            is_visible: dataIsVisible,
            is_popular: dataIsPopular,
            sync_locked: dataSyncLocked,
        };
        setSavedState(initialState);
        setForm(initialState);
    }, [dataStatus, dataIsVisible, dataIsPopular, dataSyncLocked]);

    const isDirty =
        form.status !== savedState.status ||
        form.is_visible !== savedState.is_visible ||
        form.is_popular !== savedState.is_popular ||
        form.sync_locked !== savedState.sync_locked;

    useLeaveConfirm(isDirty);

    const isPublic = isPublicStatus(form.status) && form.is_visible;
    const statusTone = isPublic ? 'badge-visible' : 'badge-hidden';
    const visibilityCopy = isPublic
        ? 'El torneo esta visible en superficies publicas.'
        : form.is_visible
            ? 'La visibilidad esta encendida, pero el estado todavia no publica el torneo.'
            : 'El torneo permanece oculto para el publico.';

    const updateForm = <K extends keyof PublicationState>(key: K, value: PublicationState[K]) => {
        setForm((current) => ({
            ...current,
            [key]: value,
        }));
        setMessage(null);
    };

    const applyStatus = (status: TournamentStatus) => {
        setForm((current) => ({
            ...current,
            status,
            is_visible: isPublicStatus(status),
        }));
        setMessage(null);
    };

    async function handleSave() {
        setIsSaving(true);
        setMessage(null);

        try {
            const nextState = { ...form };
            // No enviar sync_locked si no cambio: evita fallar el guardado si la
            // migracion de tournaments.sync_locked todavia no esta aplicada.
            const { sync_locked: nextSyncLocked, ...baseUpdates } = nextState;
            const updates: Record<string, unknown> = nextSyncLocked !== savedState.sync_locked
                ? { ...baseUpdates, sync_locked: nextSyncLocked }
                : baseUpdates;
            await updateEntity('tournament', id, updates);
            setSavedState(nextState);
            setForm(nextState);
            setMessage({ type: 'success', text: 'Publicacion actualizada.' });
            router.refresh();
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'No se pudo actualizar la publicacion.',
            });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="tab-content active transition-all">
            <div className="basalt-grid">
                <section className="basalt-card basalt-card-span-8">
                    <span className="basalt-section-kicker">Publicacion</span>
                    <h3 className="basalt-section-title">Estado y visibilidad</h3>
                    <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.6, maxWidth: 760 }}>
                        Controla si el torneo esta en borrador, publicado, activo o archivado, y si debe verse en catalogo,
                        busqueda, home y listados publicos.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
                        {STATUS_OPTIONS.map((option) => {
                            const isSelected = form.status === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => applyStatus(option.value)}
                                    className={`basalt-btn ${isSelected ? 'basalt-btn-primary' : ''}`}
                                    style={{
                                        alignItems: 'flex-start',
                                        flexDirection: 'column',
                                        minHeight: 132,
                                        padding: 16,
                                        textAlign: 'left',
                                        justifyContent: 'flex-start',
                                        whiteSpace: 'normal',
                                    }}
                                    aria-pressed={isSelected}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Radio size={15} />
                                        {option.label}
                                    </span>
                                    <small style={{ color: isSelected ? 'rgba(0,0,0,0.7)' : 'var(--text-dim)', lineHeight: 1.5 }}>
                                        {option.hint}
                                    </small>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <aside className="basalt-card basalt-card-span-4">
                    <span className="basalt-section-kicker">Salida publica</span>
                    <h3 className="basalt-section-title">Resumen</h3>

                    <div className="basalt-metric-group" style={{ marginBottom: 18 }}>
                        <span className={`basalt-badge badge-${form.status}`}>
                            <span className="basalt-badge-prefix">Lifecycle</span>
                            <span className="basalt-badge-dot" />
                            <span>{statusLabel(form.status).toUpperCase()}</span>
                        </span>
                        <span className={`basalt-badge ${statusTone}`}>
                            <span className="basalt-badge-prefix">Visibility</span>
                            <span className="basalt-badge-dot" />
                            <span>{isPublic ? 'PUBLIC' : 'HIDDEN'}</span>
                        </span>
                    </div>

                    <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
                        {visibilityCopy}
                    </p>

                    <div style={{ display: 'grid', gap: 10 }}>
                        <button
                            type="button"
                            className={`basalt-btn ${form.is_visible ? 'basalt-btn-primary' : ''}`}
                            onClick={() => updateForm('is_visible', !form.is_visible)}
                            aria-pressed={form.is_visible}
                            style={{ justifyContent: 'space-between' }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {form.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                                Visible
                            </span>
                            <span>{form.is_visible ? 'ON' : 'OFF'}</span>
                        </button>

                        <button
                            type="button"
                            className={`basalt-btn ${form.is_popular ? 'basalt-btn-primary' : ''}`}
                            onClick={() => updateForm('is_popular', !form.is_popular)}
                            aria-pressed={form.is_popular}
                            style={{ justifyContent: 'space-between' }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {form.is_popular ? <Star size={16} /> : <StarOff size={16} />}
                                Destacado
                            </span>
                            <span>{form.is_popular ? 'ON' : 'OFF'}</span>
                        </button>

                        <button
                            type="button"
                            className={`basalt-btn ${form.sync_locked ? 'basalt-btn-primary' : ''}`}
                            onClick={() => updateForm('sync_locked', !form.sync_locked)}
                            aria-pressed={form.sync_locked}
                            style={{ justifyContent: 'space-between' }}
                            title="Si esta activo, los procesos automaticos (syncs externos, webhook WhatsApp, imports) no pueden modificar este torneo. La edicion manual sigue permitida."
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {form.sync_locked ? <Lock size={16} /> : <LockOpen size={16} />}
                                Bloquear sincronizacion automatica
                            </span>
                            <span>{form.sync_locked ? 'ON' : 'OFF'}</span>
                        </button>
                    </div>
                </aside>

                <section className="basalt-card basalt-card-span-12">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <span className="basalt-section-kicker">Guardado</span>
                            <h3 className="basalt-section-title" style={{ marginBottom: 0 }}>
                                {isDirty ? 'Cambios pendientes' : 'Publicacion sincronizada'}
                            </h3>
                        </div>

                        <button
                            type="button"
                            className="basalt-btn basalt-btn-primary"
                            onClick={() => void handleSave()}
                            disabled={isSaving || !isDirty}
                        >
                            {isSaving ? 'Guardando...' : 'Guardar publicacion'}
                        </button>
                    </div>

                    {message && (
                        <div
                            className={`basalt-toast is-${message.type}`}
                            role={message.type === 'error' ? 'alert' : 'status'}
                            style={{ position: 'static', marginTop: 18 }}
                        >
                            {message.text}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
