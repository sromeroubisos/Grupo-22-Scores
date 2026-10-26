'use client';

/**
 * La identidad del torneo: escudo, nombre y estado.
 *
 * En escritorio esto vive partido en dos: el nombre en `TournamentDetailsTab`
 * (36 KB con union, pais, categoria, formato y proveedor externo) y el estado en
 * el menu del `TournamentHeader`. Aca van juntos porque son las tres cosas que
 * se corrigen desde el telefono; el resto sigue en el gestor completo.
 *
 * El escudo pasa por `persistTournamentLogo` ANTES de guardarse: un data URI de
 * un mega en `tournaments.logo_url` es lo que ya hizo estallar el payload de
 * otras pantallas. La funcion lo sube al bucket y devuelve una URL corta.
 */

import { useState } from 'react';
import { ExternalLink, ImageUp } from 'lucide-react';
import { updateEntity } from '@/app/admin/entities/actions';
import { persistTournamentLogo } from '@/lib/utils/persistTournamentLogo';
import type { Database } from '@/lib/database.types';
import { tournamentStatusLabel } from './shared';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

const STATUSES = ['draft', 'published', 'active', 'archived'] as const;

/** La misma regla que `TournamentManageShell`: visible solo publicado o en curso. */
function visibilityForStatus(status: string): boolean {
    return status === 'published' || status === 'active';
}

const STATUS_HELP: Record<string, string> = {
    draft: 'No lo ve nadie fuera del gestor.',
    published: 'Visible en el sitio, todavia sin jugarse.',
    active: 'Visible y en juego.',
    archived: 'Fuera del sitio, se conserva el historial.',
};

/** 1,5 MB de archivo. Por encima, el base64 no entra comodo en el action. */
const MAX_LOGO_BYTES = 1_500_000;

export function TournamentIdentityView({
    id,
    data,
    crestSrc,
    fullManagerHref,
    onSaved,
    onError,
}: {
    id: string;
    data: TournamentRow;
    crestSrc: string | null;
    fullManagerHref: string;
    onSaved: (message: string) => void;
    onError: (message: string) => void;
}) {
    const [name, setName] = useState(data.name ?? '');
    const [displayName, setDisplayName] = useState(data.display_name ?? '');
    const [status, setStatus] = useState<string>(data.status);
    const [preview, setPreview] = useState<string | null>(crestSrc);
    const [pendingLogo, setPendingLogo] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const trimmed = name.trim();
    const missing = !trimmed ? 'El torneo necesita un nombre.' : null;

    const dirty =
        trimmed !== (data.name ?? '')
        || displayName.trim() !== (data.display_name ?? '')
        || status !== data.status
        || pendingLogo !== null;

    function onPickFile(file: File | null) {
        if (!file) return;
        if (file.size > MAX_LOGO_BYTES) {
            onError('El escudo pesa mas de 1,5 MB. Subi uno mas liviano.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : null;
            if (!result) {
                onError('No se pudo leer el archivo.');
                return;
            }
            setPendingLogo(result);
            setPreview(result);
        };
        reader.onerror = () => onError('No se pudo leer el archivo.');
        reader.readAsDataURL(file);
    }

    async function save() {
        if (missing || saving) return;
        setSaving(true);
        try {
            const updates: Record<string, unknown> = {
                name: trimmed,
                display_name: displayName.trim() || null,
                status,
                is_visible: visibilityForStatus(status),
            };

            if (pendingLogo) {
                // Sube primero: si el bucket falla, no se guarda un data URI
                // gigante en la columna.
                const persisted = await persistTournamentLogo(id, pendingLogo);
                if (!persisted) {
                    onError('No se pudo subir el escudo. No se guardo nada.');
                    return;
                }
                updates.logo_url = persisted;
            }

            await updateEntity('tournament', id, updates);
            setPendingLogo(null);
            onSaved('Torneo actualizado.');
        } catch (error) {
            onError(
                `No se pudo guardar: ${error instanceof Error ? error.message : 'error desconocido'}`,
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="gtm-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {preview ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={preview}
                        alt={`Escudo de ${trimmed || 'el torneo'}`}
                        width={64}
                        height={64}
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 12,
                            objectFit: 'contain',
                            background: 'var(--gtm-raised)',
                            padding: 4,
                            flex: 'none',
                        }}
                    />
                ) : (
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 12,
                            background: 'var(--gtm-raised)',
                            flex: 'none',
                        }}
                        aria-hidden="true"
                    />
                )}
                <div className="gtm-grow">
                    <label className="gtm-btn" style={{ cursor: 'pointer' }}>
                        <ImageUp size={18} />
                        Cambiar escudo
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={(event) => onPickFile(event.target.files?.[0] ?? null)}
                            style={{ display: 'none' }}
                        />
                    </label>
                    <div className="gtm-help" style={{ marginTop: 6 }}>
                        PNG, JPG, WEBP o SVG. Hasta 1,5 MB.
                    </div>
                </div>
            </div>

            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-t-name">Nombre del torneo</label>
                <input
                    id="gtm-t-name"
                    className={`gtm-input${missing ? ' gtm-input-invalid' : ''}`}
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                    aria-invalid={Boolean(missing)}
                />
            </div>

            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-t-display">Nombre corto</label>
                <span className="gtm-help">
                    El que se usa donde no entra el largo. Vacio para usar el nombre completo.
                </span>
                <input
                    id="gtm-t-display"
                    className="gtm-input"
                    value={displayName}
                    maxLength={60}
                    placeholder={trimmed}
                    onChange={(event) => setDisplayName(event.target.value)}
                />
            </div>

            <div className="gtm-field">
                <span className="gtm-label" id="gtm-t-status">Estado</span>
                <div className="gtm-chip-grid" role="radiogroup" aria-labelledby="gtm-t-status">
                    {STATUSES.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={status === value}
                            className="gtm-chip"
                            onClick={() => setStatus(value)}
                        >
                            {tournamentStatusLabel(value)}
                        </button>
                    ))}
                </div>
                <span className="gtm-help">{STATUS_HELP[status] ?? ''}</span>
            </div>

            <div style={{ marginTop: 4 }}>
                <button
                    type="button"
                    className="gtm-btn gtm-btn-primary"
                    disabled={Boolean(missing) || !dirty || saving}
                    onClick={save}
                >
                    {saving ? 'Guardando' : 'Guardar cambios'}
                </button>
                {missing ? (
                    <div className="gtm-btn-hint">{missing}</div>
                ) : !dirty ? (
                    <div className="gtm-btn-hint">No hay cambios para guardar.</div>
                ) : null}
            </div>

            <div className="gtm-section-title">Lo que no esta aca</div>
            <a className="gtm-btn" href={fullManagerHref}>
                <ExternalLink size={18} />
                Union, pais, categoria y formato
            </a>
        </>
    );
}
