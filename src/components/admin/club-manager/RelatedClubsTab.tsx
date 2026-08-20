'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Link2, Loader2, Plus, Search, Unlink } from 'lucide-react';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';

interface RelatedClubsTabProps {
    clubId: string;
    navigationMode: ClubConsoleMode;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type FamilyClub = {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    parentClubName: string | null;
    isRoot: boolean;
    isCurrent: boolean;
};

type FamilySummary = {
    rootClubId: string;
    rootClubName: string | null;
    clubs: FamilyClub[];
};

type Candidate = { id: string; name: string; city?: string | null; sport?: string | null };

export function RelatedClubsTab({ clubId, navigationMode, notify }: RelatedClubsTabProps) {
    const [family, setFamily] = useState<FamilySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canWrite, setCanWrite] = useState(true);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Candidate[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const searchToken = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/family`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la familia del club.');
            setFamily(payload?.data ?? null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudo cargar la familia del club.');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => { void load(); }, [load]);

    // Búsqueda con freno: escribir rápido no dispara una consulta por tecla, y
    // un resultado viejo que llega tarde no pisa al nuevo (searchToken).
    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults(null);
            return;
        }

        const token = ++searchToken.current;
        setSearching(true);
        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch(`/api/admin/clubs?search=${encodeURIComponent(term)}&limit=20`, { cache: 'no-store' });
                const payload = await response.json().catch(() => null);
                if (token !== searchToken.current) return;
                const rows = Array.isArray(payload) ? payload : payload?.data;
                setResults(Array.isArray(rows) ? rows : []);
            } catch {
                if (token === searchToken.current) setResults([]);
            } finally {
                if (token === searchToken.current) setSearching(false);
            }
        }, 320);

        return () => window.clearTimeout(timer);
    }, [query]);

    const currentIds = new Set((family?.clubs ?? []).map((club) => club.id));

    const link = async (candidate: Candidate) => {
        setBusyId(candidate.id);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/family`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId: candidate.id }),
            });
            const payload = await response.json().catch(() => null);

            if (response.status === 401 || response.status === 403) {
                setCanWrite(false);
                throw new Error(payload?.error || 'No tenés permisos para cambiar esta familia.');
            }
            if (!response.ok) throw new Error(payload?.error || 'No se pudo vincular el club.');

            setQuery('');
            setResults(null);
            setFamily(payload?.data ?? null);
            notify(`${candidate.name} quedó vinculado`);
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo vincular el club.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const unlink = async (club: FamilyClub) => {
        if (!window.confirm(`¿Desvincular a ${club.name} de la familia?`)) return;

        setBusyId(club.id);
        try {
            const params = new URLSearchParams({ clubId: club.id });
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(clubId)}/family?${params.toString()}`,
                { method: 'DELETE' },
            );
            const payload = await response.json().catch(() => null);

            if (response.status === 401 || response.status === 403) {
                setCanWrite(false);
                throw new Error(payload?.error || 'No tenés permisos para cambiar esta familia.');
            }
            if (!response.ok) throw new Error(payload?.error || 'No se pudo desvincular el club.');

            setFamily(payload?.data ?? null);
            notify(`${club.name} quedó desvinculado`);
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo desvincular el club.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <div className="cm-loading">Cargando la familia del club...</div>;
    }

    const members = family?.clubs ?? [];

    return (
        <>
            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Vincular un club</h2>
                        <p>
                            Los clubes de una familia comparten planteles y accesos.
                            {family?.rootClubName ? ` La base es ${family.rootClubName}.` : ''}
                        </p>
                    </div>
                </div>

                {canWrite ? (
                    <>
                        <div className="cm-search">
                            <div className="cm-input-prefixed" style={{ flex: '1 1 220px' }}>
                                <Search size={14} className="cm-input-prefix" aria-hidden="true" />
                                <input
                                    className="cm-input"
                                    style={{ paddingLeft: 34 }}
                                    placeholder="Buscar un club por nombre"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    aria-label="Buscar un club para vincular"
                                />
                            </div>
                        </div>

                        {query.trim().length > 0 && query.trim().length < 2 && (
                            <p className="cm-hint" style={{ marginTop: 8 }}>Escribí al menos dos letras.</p>
                        )}

                        {searching && <p className="cm-hint" style={{ marginTop: 8 }}>Buscando...</p>}

                        {results && !searching && (
                            results.length === 0 ? (
                                <p className="cm-hint" style={{ marginTop: 8 }}>Ningún club coincide con esa búsqueda.</p>
                            ) : (
                                <div className="cm-results">
                                    {results.map((candidate) => {
                                        const already = currentIds.has(candidate.id);
                                        return (
                                            <div key={candidate.id} className="cm-row">
                                                <div className="cm-row-main">
                                                    <div className="cm-row-title">{candidate.name}</div>
                                                    <div className="cm-row-sub">
                                                        {[candidate.city, candidate.sport].filter(Boolean).join(' · ') || candidate.id}
                                                    </div>
                                                </div>
                                                <div className="cm-row-actions">
                                                    {already ? (
                                                        <span className="cm-badge">Ya vinculado</span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="cm-btn cm-btn-sm"
                                                            onClick={() => link(candidate)}
                                                            disabled={busyId === candidate.id}
                                                        >
                                                            {busyId === candidate.id
                                                                ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                                                                : <Plus size={13} aria-hidden="true" />}
                                                            Vincular
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </>
                ) : (
                    <div className="cm-notice">
                        Solo un administrador global puede vincular o desvincular clubes. Podés ver la
                        familia, pero no cambiarla.
                    </div>
                )}
            </section>

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Familia</h2>
                        <p>{members.length === 1 ? 'Un club' : `${members.length} clubes`} en esta familia.</p>
                    </div>
                </div>

                {error && <div className="cm-alert">{error}</div>}

                {!error && members.length <= 1 ? (
                    <div className="cm-empty">
                        <strong>Este club no tiene familia</strong>
                        Vinculá las ramas del club —damas, juveniles, hockey— para que compartan
                        planteles y accesos.
                    </div>
                ) : (
                    <div className="cm-list">
                        {members.map((club) => (
                            <div key={club.id} className={`cm-row${club.isCurrent ? ' cm-row-current' : ''}`}>
                                <span className="cm-avatar" aria-hidden="true">
                                    {club.logoUrl ? <img src={club.logoUrl} alt="" /> : <Link2 size={15} />}
                                </span>
                                <div className="cm-row-main">
                                    <div className="cm-row-title">{club.name}</div>
                                    <div className="cm-row-sub">
                                        {club.isRoot
                                            ? 'Club base de la familia'
                                            : club.parentClubName
                                                ? `Depende de ${club.parentClubName}`
                                                : 'Vinculado a la familia'}
                                        {club.sport ? ` · ${club.sport}` : ''}
                                    </div>
                                </div>
                                <div className="cm-row-actions">
                                    {club.isCurrent && <span className="cm-badge cm-badge-accent">Este club</span>}
                                    {!club.isCurrent && (
                                        <Link
                                            href={buildClubManageHref(club.id, 'general', navigationMode)}
                                            prefetch={false}
                                            className="cm-btn cm-btn-sm"
                                        >
                                            Abrir
                                        </Link>
                                    )}
                                    {canWrite && !club.isRoot && (
                                        <button
                                            type="button"
                                            className="cm-btn cm-btn-danger cm-btn-icon"
                                            onClick={() => unlink(club)}
                                            disabled={busyId === club.id}
                                            aria-label={`Desvincular a ${club.name}`}
                                        >
                                            {busyId === club.id
                                                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                                : <Unlink size={14} aria-hidden="true" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    );
}
