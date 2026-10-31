'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, X } from 'lucide-react';
import './fixture-generator-wizard.css';

export type PickedTeam = {
    clubId: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    /** Nombre de la zona elegida; null deja que el asistente la reparta. */
    zone: string | null;
};

type ClubRow = {
    id: string;
    name: string;
    short_name?: string | null;
    slug?: string | null;
    logo_url?: string | null;
    sport_id?: string | null;
    city?: string | null;
};

type Props = {
    open: boolean;
    sportId: string;
    picked: PickedTeam[];
    onChange: (next: PickedTeam[]) => void;
    onClose: () => void;
};

const PAGE = 40;

async function searchClubs(query: string, signal: AbortSignal): Promise<ClubRow[]> {
    const q = new URLSearchParams({ limit: String(PAGE), offset: '0', divisions: '0' });
    if (query) q.set('search', query);
    let response = await fetch(`/api/admin/torneo/clubs?${q.toString()}`, { signal, credentials: 'include' });
    // Un rol sin acceso al panel de torneos cae al catálogo global, como hace Participantes.
    if (response.status === 401 || response.status === 403) {
        const g = new URLSearchParams({ include_hidden: 'true', limit: String(PAGE), offset: '0' });
        if (query) g.set('search', query);
        response = await fetch(`/api/clubs?${g.toString()}`, { signal, credentials: 'include' });
    }
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const json = await response.json().catch(() => null);
    return Array.isArray(json?.data) ? (json.data as ClubRow[]) : [];
}

export function TeamPickerModal({ open, sportId, picked, onChange, onClose }: Props) {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<ClubRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [onlySport, setOnlySport] = useState(Boolean(sportId));
    const inputRef = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Búsqueda en el servidor con debounce: el catálogo completo pesa demasiado para bajarlo entero.
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                setRows(await searchClubs(query.trim(), controller.signal));
            } catch (e) {
                if ((e as { name?: string })?.name === 'AbortError') return;
                setError('No se pudo buscar. Probá de nuevo.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 250);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [open, query]);

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    const pickedIds = useMemo(() => new Set(picked.map((t) => t.clubId)), [picked]);
    const visible = useMemo(() => {
        const sport = sportId.toLowerCase();
        return onlySport && sport ? rows.filter((r) => !r.sport_id || r.sport_id.toLowerCase() === sport) : rows;
    }, [rows, onlySport, sportId]);

    const toggle = (row: ClubRow) => {
        if (pickedIds.has(row.id)) {
            onChange(picked.filter((t) => t.clubId !== row.id));
            return;
        }
        onChange([...picked, { clubId: row.id, name: row.name, shortName: row.short_name ?? row.slug ?? null, logoUrl: row.logo_url ?? null, zone: null }]);
    };

    if (!open || !mounted) return null;

    return createPortal(
        <div className="tpm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="tpm" role="dialog" aria-modal="true" aria-label="Buscar equipos">
                <header className="tpm-head">
                    <h5>Buscar equipos</h5>
                    <button type="button" className="tpm-x" aria-label="Cerrar buscador" onClick={onClose}><X size={18} /></button>
                </header>

                <label className="tpm-search">
                    <Search size={16} aria-hidden="true" />
                    <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Escribí el nombre del club" aria-label="Buscar club por nombre" />
                </label>

                {sportId && (
                    <label className="operation-toggle">
                        <input type="checkbox" checked={onlySport} onChange={(e) => setOnlySport(e.target.checked)} />
                        <span>Solo clubes de este deporte</span>
                    </label>
                )}

                <ul className="tpm-list" aria-busy={loading}>
                    {error && <li className="tpm-empty" role="alert">{error}</li>}
                    {!error && !loading && visible.length === 0 && <li className="tpm-empty">{query ? 'Ningún club coincide con la búsqueda.' : 'Escribí para buscar un club.'}</li>}
                    {visible.map((row) => {
                        const on = pickedIds.has(row.id);
                        return (
                            <li key={row.id}>
                                <button type="button" className={`tpm-row ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggle(row)}>
                                    {row.logo_url
                                        ? <img src={row.logo_url} alt="" loading="lazy" width={28} height={28} />
                                        : <span className="tpm-crest" aria-hidden="true">{row.name.slice(0, 1)}</span>}
                                    <span className="tpm-name">{row.name}{row.city ? <small>{row.city}</small> : null}</span>
                                    <span className="tpm-check" aria-hidden="true">{on ? <Check size={16} /> : null}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                <footer className="tpm-foot">
                    <span>{picked.length === 0 ? 'Todavía no elegiste equipos.' : `${picked.length} equipo${picked.length === 1 ? '' : 's'} elegido${picked.length === 1 ? '' : 's'}`}</span>
                    <button type="button" className="basalt-btn basalt-btn-primary" onClick={onClose}>Listo</button>
                </footer>
            </div>
        </div>,
        document.body,
    );
}
