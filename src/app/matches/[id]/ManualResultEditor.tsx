'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Carga manual del resultado de un partido de World Rugby que la fuente no
 * publica. Solo super admin. La fuente oficial manda en cuanto publica el
 * partido: la carga queda guardada pero sin efecto.
 */

type ManualStatus = 'live' | 'halftime' | 'final';

export type ManualResultSnapshot = {
    status: ManualStatus;
    homeScore: number;
    awayScore: number;
    homeTries: number | null;
    awayTries: number | null;
    minute: number | null;
    updatedAt?: string;
    active?: boolean;
};

type Props = {
    open: boolean;
    matchId: string;
    homeTeamName: string;
    awayTeamName: string;
    current: ManualResultSnapshot | null;
    onClose: () => void;
    onSaved: () => void;
};

const STATUS_OPTIONS: { value: ManualStatus; label: string }[] = [
    { value: 'live', label: 'En juego' },
    { value: 'halftime', label: 'Entretiempo' },
    { value: 'final', label: 'Final' },
];

const toText = (value: number | null | undefined) => (typeof value === 'number' ? String(value) : '');

function toCount(value: string): number | null {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return Number(trimmed);
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 16,
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid var(--color-glass-border, rgba(255,255,255,0.12))',
    color: 'var(--color-text-primary, #eee)',
    borderRadius: 8,
};

const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary, #9aa)',
};

const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: 'var(--color-text-tertiary, #888)',
};

const ghostButton: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    background: 'transparent',
    border: '1px solid var(--color-glass-border, rgba(255,255,255,0.15))',
    color: 'var(--color-text-primary, #eee)',
    cursor: 'pointer',
};

export default function ManualResultEditor({ open, matchId, homeTeamName, awayTeamName, current, onClose, onSaved }: Props) {
    const [status, setStatus] = useState<ManualStatus>('final');
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');
    const [homeTries, setHomeTries] = useState('');
    const [awayTries, setAwayTries] = useState('');
    const [minute, setMinute] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Solo al abrir: la ficha se refresca sola cada 15 s y no tiene que pisar
    // lo que se está escribiendo.
    useEffect(() => {
        if (!open) return;
        setStatus(current?.status ?? 'final');
        setHomeScore(toText(current?.homeScore));
        setAwayScore(toText(current?.awayScore));
        setHomeTries(toText(current?.homeTries));
        setAwayTries(toText(current?.awayTries));
        setMinute(toText(current?.minute));
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !saving) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, saving, onClose]);

    if (!open || typeof document === 'undefined') return null;

    const home = toCount(homeScore);
    const away = toCount(awayScore);
    const triesHome = toCount(homeTries);
    const triesAway = toCount(awayTries);
    const triesHalf = (homeTries.trim() !== '') !== (awayTries.trim() !== '');
    const missing = home === null || away === null
        ? 'Completá el marcador de los dos lados.'
        : triesHalf
            ? 'Cargá los tries de los dos lados, o de ninguno.'
            : null;

    const endpoint = `/api/admin/super/matches/${encodeURIComponent(matchId)}/result-override`;

    async function send(method: 'PUT' | 'DELETE') {
        setSaving(true);
        setError(null);
        try {
            const response = await fetch(endpoint, {
                method,
                headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
                body: method === 'PUT'
                    ? JSON.stringify({
                        status,
                        homeScore: home,
                        awayScore: away,
                        homeTries: triesHome,
                        awayTries: triesAway,
                        minute: status === 'live' ? toCount(minute) : null,
                    })
                    : undefined,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar.');
            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar.');
        } finally {
            setSaving(false);
        }
    }

    const sideFields = (
        label: string,
        score: string,
        setScore: (value: string) => void,
        tries: string,
        setTries: (value: string) => void,
    ) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
            <label style={fieldStyle}>
                Puntos
                <input inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} style={inputStyle} />
            </label>
            <label style={fieldStyle}>
                Tries (opcional, para el bonus)
                <input inputMode="numeric" value={tries} onChange={(e) => setTries(e.target.value)} style={inputStyle} />
            </label>
        </div>
    );

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Cargar resultado"
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
        >
            <div style={{
                width: 'min(480px, 100%)',
                background: 'var(--color-bg-secondary, #111)',
                border: '1px solid var(--color-glass-border, rgba(255,255,255,0.1))',
                borderRadius: 16, padding: 20,
                display: 'flex', flexDirection: 'column', gap: 16,
                maxHeight: '90vh', overflowY: 'auto',
            }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary, #eee)' }}>Cargar resultado</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #888)', marginTop: 4, lineHeight: 1.45 }}>
                        Se muestra mientras World Rugby no publique el partido. Cuando lo publique, manda el dato oficial.
                    </div>
                    {current && (
                        <div role="status" style={{ fontSize: 12, marginTop: 8, color: current.active ? 'var(--color-accent, #10b981)' : 'var(--color-text-secondary, #9aa)' }}>
                            {current.active
                                ? 'Hoy se muestra tu carga.'
                                : 'World Rugby ya publicó este partido: tu carga está guardada pero no se muestra.'}
                        </div>
                    )}
                </div>

                <div role="radiogroup" aria-label="Estado del partido" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {STATUS_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={status === option.value}
                            onClick={() => setStatus(option.value)}
                            style={{
                                ...ghostButton,
                                padding: '6px 12px',
                                borderRadius: 999,
                                background: status === option.value ? 'var(--color-accent, #10b981)' : 'transparent',
                                color: status === option.value ? '#fff' : 'var(--color-text-primary, #eee)',
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {sideFields(homeTeamName, homeScore, setHomeScore, homeTries, setHomeTries)}
                    {sideFields(awayTeamName, awayScore, setAwayScore, awayTries, setAwayTries)}
                </div>

                {status === 'live' && (
                    <label style={fieldStyle}>
                        Minuto (opcional)
                        <input inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} style={inputStyle} />
                    </label>
                )}

                {(error || missing) && (
                    <div role={error ? 'alert' : undefined} style={{ fontSize: 12, color: error ? 'var(--color-danger, #f87171)' : 'var(--color-text-tertiary, #888)' }}>
                        {error || missing}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    {current ? (
                        <button type="button" onClick={() => send('DELETE')} disabled={saving} style={{ ...ghostButton, color: 'var(--color-text-secondary, #9aa)' }}>
                            Volver a World Rugby
                        </button>
                    ) : <span />}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={onClose} disabled={saving} style={ghostButton}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => send('PUT')}
                            disabled={saving || Boolean(missing)}
                            style={{
                                ...ghostButton,
                                fontWeight: 800,
                                border: 'none',
                                background: 'var(--color-accent, #10b981)',
                                color: '#fff',
                                cursor: saving || missing ? 'not-allowed' : 'pointer',
                                opacity: saving || missing ? 0.6 : 1,
                            }}
                        >
                            {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
