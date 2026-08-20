'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Plus, Star, Trash2 } from 'lucide-react';

interface VenuesTabProps {
    clubId: string;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type Venue = {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    maps_link?: string | null;
    is_primary?: boolean | null;
};

const EMPTY = { name: '', address: '', city: '', maps_link: '', is_primary: false };

export function VenuesTab({ clubId, notify }: VenuesTabProps) {
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/venues`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las sedes.');
            setVenues(Array.isArray(payload?.data) ? payload.data : []);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las sedes.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    const create = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/venues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name.trim(),
                    address: form.address.trim() || null,
                    city: form.city.trim() || null,
                    maps_link: form.maps_link.trim() || null,
                    is_primary: form.is_primary,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo crear la sede.');
            setForm(EMPTY);
            await load();
            notify('Sede agregada');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo crear la sede.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (venue: Venue) => {
        if (!window.confirm(`¿Borrar la sede ${venue.name}?`)) return;
        setBusyId(venue.id);
        try {
            const params = new URLSearchParams({ venue_id: venue.id });
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(clubId)}/venues?${params.toString()}`,
                { method: 'DELETE' },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo borrar la sede.');
            await load();
            notify('Sede borrada');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo borrar la sede.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <div className="cm-loading">Cargando sedes...</div>;
    }

    return (
        <>
            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Agregar una sede</h2>
                        <p>La cancha donde el club hace de local. La principal es la que se muestra en la ficha.</p>
                    </div>
                </div>

                <div className="cm-grid cm-grid-2">
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-venue-name">Nombre</label>
                        <input
                            id="cm-venue-name"
                            className="cm-input"
                            placeholder="Estadio de La Tablada"
                            value={form.name}
                            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        />
                    </div>
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-venue-city">Ciudad</label>
                        <input
                            id="cm-venue-city"
                            className="cm-input"
                            placeholder="Córdoba"
                            value={form.city}
                            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                        />
                    </div>
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-venue-address">Dirección</label>
                        <input
                            id="cm-venue-address"
                            className="cm-input"
                            placeholder="Av. Vélez Sarsfield 1234"
                            value={form.address}
                            onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                        />
                    </div>
                    <div className="cm-field">
                        <label className="cm-label" htmlFor="cm-venue-maps">Link de Maps</label>
                        <input
                            id="cm-venue-maps"
                            className="cm-input"
                            placeholder="https://maps.app.goo.gl/..."
                            value={form.maps_link}
                            onChange={(event) => setForm((prev) => ({ ...prev, maps_link: event.target.value }))}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="cm-switch"
                        role="switch"
                        aria-checked={form.is_primary}
                        onClick={() => setForm((prev) => ({ ...prev, is_primary: !prev.is_primary }))}
                    >
                        <span className="cm-switch-track"><span className="cm-switch-thumb" /></span>
                        Es la sede principal
                    </button>
                    <button
                        type="button"
                        className="cm-btn cm-btn-primary"
                        style={{ marginLeft: 'auto' }}
                        onClick={create}
                        disabled={saving || !form.name.trim()}
                        title={!form.name.trim() ? 'Escribí el nombre de la sede para agregarla.' : undefined}
                    >
                        {saving
                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            : <Plus size={14} aria-hidden="true" />}
                        Agregar
                    </button>
                </div>
            </section>

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Sedes</h2>
                        <p>{venues.length === 1 ? 'Una sede cargada.' : `${venues.length} sedes cargadas.`}</p>
                    </div>
                </div>

                {error && <div className="cm-alert">{error}</div>}

                {!error && venues.length === 0 ? (
                    <div className="cm-empty">
                        <strong>Sin sedes</strong>
                        Cargá al menos una para que la ficha del club diga dónde juega.
                    </div>
                ) : (
                    <div className="cm-list">
                        {venues.map((venue) => (
                            <div key={venue.id} className={`cm-row${venue.is_primary ? ' cm-row-current' : ''}`}>
                                <span className="cm-avatar" aria-hidden="true"><MapPin size={15} /></span>
                                <div className="cm-row-main">
                                    <div className="cm-row-title">{venue.name}</div>
                                    <div className="cm-row-sub">
                                        {[venue.address, venue.city].filter(Boolean).join(' · ') || 'Sin dirección cargada'}
                                    </div>
                                </div>
                                <div className="cm-row-actions">
                                    {venue.is_primary && (
                                        <span className="cm-badge cm-badge-accent">
                                            <Star size={10} aria-hidden="true" style={{ marginRight: 4 }} />
                                            Principal
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="cm-btn cm-btn-danger cm-btn-icon"
                                        onClick={() => remove(venue)}
                                        disabled={busyId === venue.id}
                                        aria-label={`Borrar la sede ${venue.name}`}
                                    >
                                        {busyId === venue.id
                                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                            : <Trash2 size={14} aria-hidden="true" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    );
}
