'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Plus } from 'lucide-react';
import PanelMatchForm, { type PanelFamilyClub } from '@/app/clubs/[id]/PanelMatchForm';
import { APP_TIMEZONE } from '@/lib/timezone';

interface MatchTabProps {
    clubId: string;
    publicHref: string;
    onDone: () => void;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

/** Hoy en la hora del sitio, como `YYYY-MM-DD`: lo que espera el campo fecha. */
function todayKey(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

/**
 * "Crear partido" dentro del gestor de club.
 *
 * Es el MISMO formulario que el panel de la ficha pública (`PanelMatchForm`):
 * los botones de edad, la creación de categorías y el alta por
 * `/api/clubs/[id]/panel-matches`. Dos formularios distintos para lo mismo
 * terminarían diciendo cosas distintas; acá solo cambia la puerta.
 *
 * La familia (club base + categorías) sale de `/api/clubs/[id]/categories`, que
 * ya la devuelve con `isBase` y pide permiso de administración del club.
 */
export function MatchTab({ clubId, publicHref, onDone, notify }: MatchTabProps) {
    const [family, setFamily] = useState<PanelFamilyClub[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState(false);
    // Remonta el formulario limpio para "Cargar otro".
    const [formKey, setFormKey] = useState(0);

    const load = useCallback(async () => {
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar las categorías del club.');
            const rows = Array.isArray(payload.categories) ? payload.categories : [];
            setFamily(rows.map((row: { id: string; name: string; isBase: boolean }) => ({
                id: row.id,
                name: row.name,
                isBase: Boolean(row.isBase),
            })));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las categorías del club.');
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    if (error) {
        return (
            <section className="cm-card">
                <div className="cm-alert">{error}</div>
                <button type="button" className="cm-btn" style={{ marginTop: 12 }} onClick={() => { void load(); }}>
                    Reintentar
                </button>
            </section>
        );
    }

    if (!family) {
        return <div className="cm-loading">Cargando las categorías del club...</div>;
    }

    if (created) {
        return (
            <section className="cm-card cm-match-done" role="status">
                <span className="cm-match-done-icon" aria-hidden="true">
                    <CheckCircle2 size={28} />
                </span>
                <h2>Partido cargado</h2>
                <p>Ya figura en la agenda del club. Desde la ficha del partido se carga el resultado.</p>
                <div className="cm-match-done-actions">
                    <button
                        type="button"
                        className="cm-btn cm-btn-primary"
                        onClick={() => {
                            setCreated(false);
                            setFormKey((value) => value + 1);
                        }}
                    >
                        <Plus size={14} aria-hidden="true" />
                        Cargar otro
                    </button>
                    <Link href={publicHref} prefetch={false} target="_blank" rel="noreferrer" className="cm-btn">
                        <ExternalLink size={14} aria-hidden="true" />
                        Ver la agenda en la ficha
                    </Link>
                </div>
            </section>
        );
    }

    return (
        // Sin `cm-card`: el formulario ya trae su propia caja (`.panelForm`).
        <div className="cm-match-card">
            <PanelMatchForm
                key={formKey}
                clubId={clubId}
                familyClubs={family}
                defaultDate={todayKey()}
                onCancel={onDone}
                onCreated={() => {
                    setCreated(true);
                    notify('Partido cargado');
                    // Las categorías creadas desde el formulario ya existen: se
                    // releen para que "Cargar otro" las muestre como propias.
                    void load();
                }}
            />
        </div>
    );
}
