'use client';

/**
 * Competidores: quienes juegan el torneo, y el alta desde el telefono.
 *
 * TRES DECISIONES QUE CONVIENE SABER
 *
 * 1. **Dos acciones, ancladas al pie.** "Agregar club" busca en el catalogo;
 *    "Crear club" da de alta uno que no existe. Van fijas porque el alta es lo
 *    que se viene a hacer a esta pantalla, y con veinte clubes cargados un
 *    boton al final de la lista queda a tres pantallazos de scroll.
 *
 * 2. **El catalogo se busca en el servidor, no se baja entero.** El gestor de
 *    escritorio se trae los ~900 clubes paginando y filtra en memoria. En un
 *    telefono eso es datos y espera para nada, y ademas `clubs.logo_url` guarda
 *    escudos en base64. `/api/admin/torneo/clubs` acepta `search` y devuelve el
 *    escudo ya resuelto por el proxy, asi que aca se pide de a 25 y filtrado.
 *
 * 3. **Crear avisa antes de crear.** La hoja de alta busca el nombre mientras
 *    se escribe y muestra lo parecido que ya existe. "Liceo R.C." y "Liceo
 *    Rugby Club" como dos clubes distintos es un problema conocido de este
 *    proyecto, y fusionarlos despues sale mucho mas caro que mirar la lista.
 *
 * Lo que sigue viviendo solo en el gestor completo: importar por Excel, subir
 * escudos y resolver variantes/divisiones de un club.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { Crest } from '../Crest';
import { EmptyState, SkeletonList, Sheet, type MobileParticipant } from './shared';

type CatalogClub = {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
};

/** Cual de las dos hojas esta abierta. */
type SheetKind = null | 'buscar' | 'crear';

/** Lo que tarda en dejar de tipear antes de salir a buscar. */
const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 25;

async function readError(response: Response, fallback: string): Promise<string> {
    try {
        const payload = await response.json();
        return payload?.error || fallback;
    } catch {
        return fallback;
    }
}

export function CompetitorsView({
    tournamentId,
    sportId,
    seasonId,
    participants,
    loading,
    fullManagerHref,
    onChanged,
    onToast,
}: {
    tournamentId: string;
    sportId: string | null;
    seasonId: string | null;
    participants: MobileParticipant[];
    loading: boolean;
    fullManagerHref: string;
    onChanged: () => Promise<void> | void;
    onToast: (tone: 'ok' | 'err', message: string) => void;
}) {
    const [sheet, setSheet] = useState<SheetKind>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CatalogClub[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [nuevaSigla, setNuevaSigla] = useState('');
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);

    /* Los clubes que ya estan en el torneo no se ofrecen de nuevo: el mismo
       club dos veces rompe la tabla de posiciones. */
    const alreadyIn = useMemo(
        () => new Set(participants.map((p) => p.clubId).filter(Boolean) as string[]),
        [participants],
    );

    const ordered = useMemo(
        () => [...participants].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [participants],
    );

    /* Cada busqueda lleva su numero: si vuelve una vieja despues de una nueva,
       se descarta. Sin esto, tipear rapido deja en pantalla el resultado de un
       prefijo anterior. */
    const searchSeq = useRef(0);

    /* La misma busqueda sirve a las dos hojas: en "buscar" es la lista para
       elegir, y en "crear" es el aviso de lo parecido que ya existe. */
    useEffect(() => {
        if (!sheet) return;

        const term = query.trim();
        if (term.length < 2) {
            setResults(null);
            setSearchError(null);
            setSearching(false);
            return;
        }

        const seq = ++searchSeq.current;
        setSearching(true);
        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch(
                    `/api/admin/torneo/clubs?search=${encodeURIComponent(term)}&limit=${RESULT_LIMIT}&divisions=0`,
                );
                if (seq !== searchSeq.current) return;

                if (response.status === 401 || response.status === 403) {
                    setResults([]);
                    setSearchError('Tu rol no puede buscar en el catalogo de clubes. El alta queda en el gestor completo.');
                    return;
                }
                if (!response.ok) {
                    setResults([]);
                    setSearchError(await readError(response, `Error ${response.status}`));
                    return;
                }

                const payload = await response.json();
                if (seq !== searchSeq.current) return;
                setResults(Array.isArray(payload?.data) ? (payload.data as CatalogClub[]) : []);
                setSearchError(null);
            } catch {
                if (seq !== searchSeq.current) return;
                setResults([]);
                setSearchError('No se pudo buscar. Revisa la conexion.');
            } finally {
                if (seq === searchSeq.current) setSearching(false);
            }
        }, DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [query, sheet]);

    const closeSheet = useCallback(() => {
        setSheet(null);
        setQuery('');
        setResults(null);
        setSearchError(null);
        setSelected(new Set());
        setNuevaSigla('');
    }, []);

    function toggle(clubId: string) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(clubId)) next.delete(clubId);
            else next.add(clubId);
            return next;
        });
    }

    /** Alta de un club que ya existe en el catalogo. */
    async function addClub(club: CatalogClub): Promise<void> {
        const response = await fetch(`/api/tournaments/${tournamentId}/participants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                club_id: club.id,
                name: club.name,
                short_code: club.short_name ?? null,
                type: 'club',
                status: 'active',
                seasonId,
            }),
        });
        if (!response.ok) throw new Error(await readError(response, `No se pudo agregar ${club.name}`));
    }

    async function addSelected() {
        if (!results || selected.size === 0 || saving) return;
        setSaving(true);
        const elegidos = results.filter((club) => selected.has(club.id));

        /* En serie y no con Promise.all: el alta toca tres tablas por
           participante. Ademas, si una falla, las anteriores ya quedaron
           hechas y hay que poder decir cuantas entraron. */
        let hechas = 0;
        try {
            for (const club of elegidos) {
                await addClub(club);
                hechas += 1;
            }
            onToast('ok', hechas === 1 ? 'Club agregado' : `${hechas} clubes agregados`);
            closeSheet();
        } catch (error) {
            const detalle = error instanceof Error ? error.message : 'Error al agregar';
            onToast('err', hechas > 0 ? `${detalle}. Entraron ${hechas} de ${elegidos.length}.` : detalle);
        } finally {
            setSaving(false);
            await onChanged();
        }
    }

    /** Crear un club que no esta en el catalogo, y dejarlo anotado en el torneo. */
    async function createAndAdd() {
        const name = query.trim();
        if (name.length < 2 || saving) return;
        setSaving(true);
        try {
            const response = await fetch('/api/admin/torneo/clubs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    short_name: nuevaSigla.trim() || null,
                    sport: sportId || 'rugby',
                    is_visible: true,
                }),
            });
            if (!response.ok) throw new Error(await readError(response, 'No se pudo crear el club'));

            const payload = await response.json();
            const club = payload?.data as CatalogClub | undefined;
            if (!club?.id) throw new Error('El club se creo pero la respuesta vino vacia');

            await addClub(club);
            onToast('ok', `${club.name} creado y agregado`);
            closeSheet();
        } catch (error) {
            onToast('err', error instanceof Error ? error.message : 'Error al crear el club');
        } finally {
            setSaving(false);
            await onChanged();
        }
    }

    async function removeParticipant(participant: MobileParticipant) {
        if (removing) return;
        const ok = window.confirm(
            `Quitar a ${participant.name} del torneo. Si ya jugo partidos, sus resultados quedan sin dueño.`,
        );
        if (!ok) return;

        setRemoving(participant.id);
        try {
            const response = await fetch(
                `/api/tournaments/${tournamentId}/participants?id=${encodeURIComponent(participant.id)}`,
                { method: 'DELETE' },
            );
            if (!response.ok) throw new Error(await readError(response, 'No se pudo quitar'));
            onToast('ok', `${participant.name} quedo fuera del torneo`);
        } catch (error) {
            onToast('err', error instanceof Error ? error.message : 'Error al quitar');
        } finally {
            setRemoving(null);
            await onChanged();
        }
    }

    const term = query.trim();
    const visibles = (results ?? []).filter((club) => !alreadyIn.has(club.id));

    const buscarSheet = sheet === 'buscar' ? (
        <Sheet title="Agregar club" onClose={closeSheet}>
            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-club-search">Buscar en el catalogo</label>
                <div style={{ position: 'relative' }}>
                    <Search
                        size={18}
                        aria-hidden="true"
                        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}
                    />
                    <input
                        id="gtm-club-search"
                        className="gtm-input"
                        style={{ paddingLeft: 38 }}
                        type="search"
                        inputMode="search"
                        autoComplete="off"
                        placeholder="Nombre del club"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
                <span className="gtm-help">
                    {term.length < 2
                        ? 'Escribi al menos dos letras.'
                        : searching
                            ? 'Buscando...'
                            : `${visibles.length} resultado${visibles.length === 1 ? '' : 's'}`}
                </span>
            </div>

            {searchError ? <div className="gtm-error">{searchError}</div> : null}

            {searching && results === null ? <SkeletonList rows={4} height={52} /> : null}

            {visibles.map((club) => (
                <label key={club.id} className="gtm-row-card" style={{ minHeight: 60, cursor: 'pointer' }}>
                    <span className="gtm-check" style={{ minHeight: 0 }}>
                        <input
                            type="checkbox"
                            checked={selected.has(club.id)}
                            onChange={() => toggle(club.id)}
                            disabled={saving}
                        />
                    </span>
                    <Crest
                        club={{
                            id: club.id,
                            name: club.name,
                            shortName: club.short_name ?? null,
                            logo: club.logo_url ?? null,
                        }}
                        size="lg"
                    />
                    <div className="gtm-row-body">
                        <div className="gtm-row-title">{club.name}</div>
                        {club.short_name ? <div className="gtm-row-meta">{club.short_name}</div> : null}
                    </div>
                </label>
            ))}

            {results !== null && !searching && visibles.length === 0 && !searchError ? (
                <span className="gtm-help">
                    No hay ningun club con ese nombre. Si de verdad no existe, cerra y usa Crear club.
                </span>
            ) : null}

            <button
                type="button"
                className="gtm-btn gtm-btn-primary"
                style={{ marginTop: 10 }}
                onClick={() => void addSelected()}
                disabled={saving || selected.size === 0}
            >
                {saving
                    ? 'Agregando...'
                    : selected.size === 0
                        ? 'Elegi al menos un club'
                        : `Agregar ${selected.size} club${selected.size === 1 ? '' : 'es'}`}
            </button>
        </Sheet>
    ) : null;

    const crearSheet = sheet === 'crear' ? (
        <Sheet title="Crear club" onClose={closeSheet}>
            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-club-nuevo">Nombre completo</label>
                <input
                    id="gtm-club-nuevo"
                    className="gtm-input"
                    autoComplete="off"
                    placeholder="Club Atletico Ejemplo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                <span className="gtm-help">Como se llama el club, entero.</span>
            </div>

            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-club-sigla">Sigla (opcional)</label>
                <input
                    id="gtm-club-sigla"
                    className="gtm-input"
                    autoComplete="off"
                    maxLength={20}
                    placeholder="CAE"
                    value={nuevaSigla}
                    onChange={(event) => setNuevaSigla(event.target.value)}
                />
                <span className="gtm-help">Es la que se ve en la tabla y en las placas.</span>
            </div>

            {/* El aviso de duplicado: se busca mientras escribe y se muestra lo
                parecido que ya existe, con su escudo, para que se note antes de
                crear una segunda ficha del mismo club. */}
            {visibles.length > 0 ? (
                <>
                    <div className="gtm-error">
                        Ya hay {visibles.length === 1 ? 'un club parecido' : `${visibles.length} clubes parecidos`}.
                        Si es alguno de estos, cerra y agregalo desde Agregar club.
                    </div>
                    {visibles.slice(0, 5).map((club) => (
                        <div key={club.id} className="gtm-row-card" style={{ cursor: 'default', minHeight: 52 }}>
                            <Crest
                                club={{
                                    id: club.id,
                                    name: club.name,
                                    shortName: club.short_name ?? null,
                                    logo: club.logo_url ?? null,
                                }}
                                size="lg"
                            />
                            <div className="gtm-row-body">
                                <div className="gtm-row-title">{club.name}</div>
                                {club.short_name ? <div className="gtm-row-meta">{club.short_name}</div> : null}
                            </div>
                        </div>
                    ))}
                </>
            ) : null}

            <button
                type="button"
                className="gtm-btn gtm-btn-primary"
                style={{ marginTop: 10 }}
                onClick={() => void createAndAdd()}
                disabled={saving || term.length < 2}
            >
                {saving
                    ? 'Creando...'
                    : term.length < 2
                        ? 'Escribi el nombre del club'
                        : 'Crear y agregar al torneo'}
            </button>
        </Sheet>
    ) : null;

    const barra = (
        <div className="gtm-actionbar">
            <button
                type="button"
                className="gtm-btn gtm-btn-primary"
                onClick={() => setSheet('buscar')}
            >
                <Plus size={18} aria-hidden="true" />
                Agregar club
            </button>
            <button
                type="button"
                className="gtm-btn"
                onClick={() => setSheet('crear')}
            >
                Crear club
            </button>
        </div>
    );

    if (loading) return <SkeletonList rows={6} height={60} />;

    if (participants.length === 0) {
        return (
            <>
                <EmptyState
                    title="Sin equipos"
                    text="El torneo todavia no tiene clubes. Buscalos en el catalogo, o crea uno si no esta cargado."
                />
                {barra}
                {buscarSheet}
                {crearSheet}
            </>
        );
    }

    return (
        <>
            <div className="gtm-section-title">
                {participants.length} {participants.length === 1 ? 'equipo' : 'equipos'}
            </div>

            {ordered.map((participant) => (
                <div
                    key={participant.id}
                    className="gtm-row-card"
                    style={{ cursor: 'default', minHeight: 60 }}
                >
                    <Crest
                        club={{
                            id: participant.clubId,
                            name: participant.name,
                            shortName: participant.shortCode,
                            logo: participant.logo,
                        }}
                        size="lg"
                    />
                    <div className="gtm-row-body">
                        <div className="gtm-row-title">{participant.name}</div>
                        {participant.shortCode ? (
                            <div className="gtm-row-meta">{participant.shortCode}</div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="gtm-icon-btn"
                        aria-label={`Quitar a ${participant.name} del torneo`}
                        onClick={() => void removeParticipant(participant)}
                        disabled={removing !== null}
                    >
                        <Trash2 size={18} aria-hidden="true" />
                    </button>
                </div>
            ))}

            <a className="gtm-btn-hint" href={fullManagerHref} style={{ display: 'inline-flex', gap: 6, marginTop: 10 }}>
                <ExternalLink size={14} aria-hidden="true" />
                Importar por Excel, escudos y variantes: gestor completo
            </a>

            {barra}
            {buscarSheet}
            {crearSheet}
        </>
    );
}
