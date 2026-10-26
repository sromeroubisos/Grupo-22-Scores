'use client';

/**
 * Las dos hojas que gestionan la fase por dentro: la FECHA y las ETIQUETAS.
 *
 * La fecha es un periodo, no un dia — la regla y el porque estan en
 * `lib/matchWeekend.ts`, que sale de medir 7.893 rondas de la base. Aca se
 * expone: al crear una fecha se propone el fin de semana completo, y si dos
 * fechas consecutivas caen en el mismo, se ofrece unirlas.
 */

import { useEffect, useState } from 'react';
import { Merge, Trash2 } from 'lucide-react';
import {
    formatPeriod,
    isDayKey,
    nominalPeriodOf,
    periodKeyOf,
    type Period,
} from '@/lib/matchWeekend';
import { Sheet, type MobilePhase, type PhaseZone } from './shared';

// ── HOJA DE FECHA ────────────────────────────────────────────────────────

export function RoundSheet({
    tournamentId,
    phaseId,
    round,
    nextRound,
    onClose,
    onDone,
    onError,
}: {
    tournamentId: string;
    phaseId: string;
    /** `null` para dar de alta. */
    round: { id: string; name: string; period: Period | null; matchIds: string[] } | null;
    /** La fecha siguiente, si existe: habilita unir cuando son el mismo finde. */
    nextRound: { id: string; name: string; period: Period | null; matchIds: string[] } | null;
    onClose: () => void;
    onDone: (message: string) => Promise<void>;
    onError: (message: string) => void;
}) {
    const isNew = round === null;

    const [name, setName] = useState(round?.name ?? '');
    const [start, setStart] = useState(round?.period?.start ?? '');
    const [end, setEnd] = useState(round?.period?.end ?? '');
    const [saving, setSaving] = useState(false);
    const [confirm, setConfirm] = useState<'delete' | 'merge' | null>(null);

    const period: Period | null = isDayKey(start)
        ? { start, end: isDayKey(end) && end >= start ? end : start }
        : null;

    const invalidRange = Boolean(start) && Boolean(end) && end < start;
    const missing = !name.trim()
        ? 'La fecha necesita un nombre.'
        : invalidRange
            ? 'El periodo termina antes de empezar.'
            : null;

    /* Si el gestor pone un dia de fin de semana, se le ofrece el bloque entero:
       es el caso del 96% de los partidos y evita que el domingo quede afuera. */
    const suggestion = isDayKey(start) ? nominalPeriodOf(start) : null;
    const canSuggest = Boolean(
        suggestion && (start !== suggestion.start || (end || start) !== suggestion.end),
    );

    const sameWeekendAsNext = Boolean(
        round?.period && nextRound?.period
        && periodKeyOf(round.period.end) === periodKeyOf(nextRound.period.start),
    );

    async function readError(response: Response, verb: string) {
        let message = `Error ${response.status}`;
        try {
            const payload = await response.json();
            message = payload.error || message;
        } catch {
            // Sin JSON queda el codigo.
        }
        onError(`No se pudo ${verb}: ${message}`);
    }

    async function save() {
        if (missing || saving) return;
        setSaving(true);
        try {
            const body = {
                phaseId,
                name: name.trim(),
                startDate: period?.start ?? null,
                endDate: period?.end ?? null,
            };
            const response = await fetch(
                isNew
                    ? `/api/tournaments/${tournamentId}/fixture/rounds`
                    : `/api/tournaments/${tournamentId}/fixture/rounds/${round.id}`,
                {
                    method: isNew ? 'POST' : 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
            );
            if (response.ok) {
                await onDone(isNew ? 'Fecha creada.' : 'Fecha guardada.');
                return;
            }
            await readError(response, isNew ? 'crear la fecha' : 'guardar la fecha');
        } catch (error) {
            onError(`No se pudo guardar: ${error instanceof Error ? error.message : 'error de red'}`);
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (isNew || saving) return;
        setSaving(true);
        try {
            const response = await fetch(
                `/api/tournaments/${tournamentId}/fixture/rounds/${round.id}?force=1`,
                { method: 'DELETE' },
            );
            if (response.ok) {
                await onDone('Fecha eliminada.');
                return;
            }
            await readError(response, 'eliminar la fecha');
        } catch (error) {
            onError(`No se pudo eliminar: ${error instanceof Error ? error.message : 'error de red'}`);
        } finally {
            setSaving(false);
        }
    }

    /**
     * Unir con la siguiente: los partidos de la fecha de abajo se mudan a esta y
     * la de abajo se borra. Es la reparacion de los 808 pares.
     *
     * Se mueve partido por partido y no en lote porque el PATCH de partido es el
     * unico que dispara el recalculo de la fase; un update directo a la tabla
     * dejaria la tabla de posiciones mintiendo.
     */
    async function merge() {
        if (!round || !nextRound || saving) return;
        setSaving(true);
        try {
            for (const matchId of nextRound.matchIds) {
                const response = await fetch(
                    `/api/tournaments/${tournamentId}/matches/${matchId}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roundId: round.id }),
                    },
                );
                if (!response.ok) {
                    await readError(response, 'mover los partidos');
                    return;
                }
            }

            const merged: Period | null = round.period && nextRound.period
                ? {
                    start: round.period.start < nextRound.period.start
                        ? round.period.start
                        : nextRound.period.start,
                    end: round.period.end > nextRound.period.end
                        ? round.period.end
                        : nextRound.period.end,
                }
                : round.period;

            await fetch(`/api/tournaments/${tournamentId}/fixture/rounds/${round.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: round.name,
                    startDate: merged?.start ?? null,
                    endDate: merged?.end ?? null,
                }),
            });

            const deleted = await fetch(
                `/api/tournaments/${tournamentId}/fixture/rounds/${nextRound.id}?force=1`,
                { method: 'DELETE' },
            );
            if (!deleted.ok) {
                await readError(deleted, 'borrar la fecha vacia');
                return;
            }

            await onDone(`"${nextRound.name}" se unio a "${round.name}".`);
        } catch (error) {
            onError(`No se pudo unir: ${error instanceof Error ? error.message : 'error de red'}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Sheet title={isNew ? 'Nueva fecha' : 'Editar fecha'} onClose={onClose}>
            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-r-name">Nombre</label>
                <input
                    id="gtm-r-name"
                    className={`gtm-input${!name.trim() ? ' gtm-input-invalid' : ''}`}
                    value={name}
                    maxLength={40}
                    placeholder="Fecha 1"
                    onChange={(event) => setName(event.target.value)}
                />
            </div>

            <div className="gtm-field">
                <span className="gtm-label">Periodo</span>
                <span className="gtm-help">
                    Una fecha es un periodo, no un dia: si se juega sabado y domingo, los dos dias
                    son la misma fecha.
                </span>
                <div className="gtm-pair">
                    <input
                        type="date"
                        className="gtm-input"
                        value={start}
                        onChange={(event) => setStart(event.target.value)}
                        aria-label="Primer dia"
                    />
                    <input
                        type="date"
                        className={`gtm-input${invalidRange ? ' gtm-input-invalid' : ''}`}
                        value={end}
                        min={start || undefined}
                        onChange={(event) => setEnd(event.target.value)}
                        aria-label="Ultimo dia"
                    />
                </div>
                {period ? <span className="gtm-period">{formatPeriod(period)}</span> : null}
                {canSuggest && suggestion ? (
                    <button
                        type="button"
                        className="gtm-btn"
                        onClick={() => { setStart(suggestion.start); setEnd(suggestion.end); }}
                    >
                        Usar el fin de semana entero ({formatPeriod(suggestion)})
                    </button>
                ) : null}
            </div>

            <button
                type="button"
                className="gtm-btn gtm-btn-primary"
                disabled={Boolean(missing) || saving}
                onClick={save}
            >
                {saving ? 'Guardando' : isNew ? 'Crear fecha' : 'Guardar fecha'}
            </button>
            {missing ? <div className="gtm-btn-hint">{missing}</div> : null}

            {sameWeekendAsNext && nextRound && round ? (
                confirm === 'merge' ? (
                    <>
                        <div className="gtm-notice">
                            <div className="gtm-notice-body">
                                Los {nextRound.matchIds.length} partidos de &quot;{nextRound.name}&quot;
                                pasan a &quot;{round.name}&quot;, y &quot;{nextRound.name}&quot; se
                                borra. Se deshace solo a mano.
                            </div>
                        </div>
                        <button
                            type="button"
                            className="gtm-btn gtm-btn-primary"
                            onClick={merge}
                            disabled={saving}
                        >
                            {saving ? 'Uniendo' : 'Sí, unir'}
                        </button>
                        <button
                            type="button"
                            className="gtm-btn"
                            onClick={() => setConfirm(null)}
                            disabled={saving}
                        >
                            No, volver
                        </button>
                    </>
                ) : (
                    <>
                        <div className="gtm-notice">
                            <div className="gtm-notice-body">
                                &quot;{nextRound.name}&quot; cae en el mismo fin de semana que esta
                                fecha. Lo mas probable es que sean una sola.
                            </div>
                        </div>
                        <button
                            type="button"
                            className="gtm-btn"
                            onClick={() => setConfirm('merge')}
                            disabled={saving}
                        >
                            <Merge size={18} />
                            Unir con &quot;{nextRound.name}&quot;
                        </button>
                    </>
                )
            ) : null}

            {!isNew && round ? (
                confirm === 'delete' ? (
                    <>
                        <div className="gtm-notice">
                            <div className="gtm-notice-body">
                                Se borra la fecha. Sus {round.matchIds.length} partidos NO se borran:
                                quedan sin fecha asignada y desaparecen del calendario, pero siguen
                                contando para la tabla.
                            </div>
                        </div>
                        <button
                            type="button"
                            className="gtm-btn gtm-btn-danger"
                            onClick={remove}
                            disabled={saving}
                        >
                            <Trash2 size={18} />
                            Si, eliminar
                        </button>
                        <button
                            type="button"
                            className="gtm-btn"
                            onClick={() => setConfirm(null)}
                            disabled={saving}
                        >
                            No, volver
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="gtm-btn gtm-btn-danger"
                        onClick={() => setConfirm('delete')}
                        disabled={saving}
                    >
                        <Trash2 size={18} />
                        Eliminar fecha
                    </button>
                )
            ) : null}

            <button type="button" className="gtm-btn" onClick={onClose} disabled={saving}>
                Cancelar
            </button>
        </Sheet>
    );
}

// ── HOJA DE ETIQUETAS ────────────────────────────────────────────────────

/**
 * `fetch` que nombra el paso cuando se cae la red.
 *
 * El navegador tira "Failed to fetch" sin decir a que URL, y guardar una
 * etiqueta son tres llamadas a dos endpoints distintos: con el mensaje pelado
 * no hay forma de saber cual se cayo. El `paso` viaja hasta el cartel.
 */
async function pedir(paso: string, url: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (error) {
        const detalle = error instanceof Error ? error.message : 'error de red';
        throw new Error(`${paso}: ${detalle}`);
    }
}

/** Como viaja una etiqueta en `settings.groupLabels` y en `ui_labels`. */
type LabelDef = { id?: string; name?: string; color?: string };

/** Una fila de `team_labels` con su etiqueta unida. */
type TeamLabelRow = {
    id: string;
    label_id?: string | null;
    position?: number | null;
    label?: { id?: string; name?: string; color?: string } | null;
};

/**
 * Deja `team_labels` igual a lo que pide el formulario, con el minimo de
 * escrituras: borra solo lo que sobra y crea solo lo que falta. Borrar todo y
 * recrear era mas simple, pero en un telefono se nota y ademas hace parpadear
 * la banda de color de la tabla mientras tanto.
 */
async function syncTeamLabels(
    tournamentId: string,
    phaseId: string,
    deseadas: { labelId?: string; positions: number[] }[],
): Promise<void> {
    const actualesRes = await pedir(
        'al leer las posiciones ya asignadas',
        `/api/admin/team-labels?tournament_id=${encodeURIComponent(tournamentId)}&phase_id=${encodeURIComponent(phaseId)}`,
    );
    const actuales: TeamLabelRow[] = actualesRes.ok
        ? ((await actualesRes.json())?.data ?? [])
        : [];

    const clave = (labelId: string, position: number) => `${labelId}#${position}`;

    const quiero = new Set<string>();
    for (const zone of deseadas) {
        if (!zone.labelId) continue;
        for (const position of zone.positions) quiero.add(clave(zone.labelId, position));
    }

    const tengo = new Map<string, string>();
    for (const row of actuales) {
        const labelId = row.label_id ?? row.label?.id;
        if (!labelId || typeof row.position !== 'number') continue;
        tengo.set(clave(labelId, row.position), row.id);
    }

    const borrar = Array.from(tengo).filter(([key]) => !quiero.has(key)).map(([, id]) => id);
    const crear = Array.from(quiero).filter((key) => !tengo.has(key));

    // Filas chicas e independientes entre si: van en paralelo.
    const respuestas = await Promise.all([
        ...borrar.map((id) => pedir(
            'al quitar una posicion',
            `/api/admin/team-labels/${id}`,
            { method: 'DELETE' },
        )),
        ...crear.map((key) => {
            const [labelId, position] = key.split('#');
            return pedir('al asignar una posicion', '/api/admin/team-labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label_id: labelId,
                    position: Number(position),
                    tournament_id: tournamentId,
                    phase_id: phaseId,
                }),
            });
        }),
    ]);

    /* Se mira el status de cada una: si el servidor rechaza una asignacion, la
       etiqueta queda definida pero sin pintar ninguna fila, que es exactamente
       el sintoma "la guarde y no se ve". */
    const fallada = respuestas.find((response) => !response.ok);
    if (fallada) {
        let message = `Error ${fallada.status}`;
        try {
            const body = await fallada.json();
            message = body?.error || message;
        } catch {
            // Sin JSON queda el codigo.
        }
        throw new Error(`al asignar las posiciones: ${message}`);
    }
}

const ZONE_COLORS = ['#22C55E', '#38BDF8', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6'];

/** "1-4" o "1,2,5" -> [1,2,3,4]. Lo que no sea un numero se descarta. */
function parsePositions(raw: string): number[] {
    const out = new Set<number>();
    for (const chunk of raw.split(',')) {
        const range = chunk.trim().match(/^(\d+)\s*-\s*(\d+)$/);
        if (range) {
            const from = Number(range[1]);
            const to = Number(range[2]);
            for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) out.add(index);
            continue;
        }
        const single = Number(chunk.trim());
        if (Number.isInteger(single) && single > 0) out.add(single);
    }
    return [...out].sort((a, b) => a - b);
}

function formatPositions(positions: number[] | undefined): string {
    if (!positions || positions.length === 0) return '';
    return positions.join(',');
}

/**
 * Etiquetas de la tabla (las bandas de color de "clasifica" / "desciende").
 *
 * Guardarlas son DOS escrituras, no una, y por eso antes no se veia nada:
 *
 * 1. `settings.groupLabels` de la fase define la etiqueta —nombre y color— y el
 *    PATCH la sincroniza contra `ui_labels`, devolviendo el id de cada una. El
 *    campo se llama `name`: `normalizePhaseLabels` descarta en silencio todo lo
 *    que no lo traiga, asi que mandar `label` guardaba una lista vacia con un
 *    200 y un cartel de exito arriba.
 * 2. `team_labels` es la ASIGNACION, y va por POSICION (`club_id` siempre null).
 *    Es la unica de las dos que pinta la fila en la web. Sin este paso la
 *    etiqueta existe, el gestor la ofrece, y en la tabla no se ve nada.
 *
 * `settings.tableTags` parece lo mismo y no lo lee nadie: no usarlo.
 */
export function LabelsSheet({
    tournamentId,
    phase,
    onClose,
    onDone,
    onError,
}: {
    tournamentId: string;
    phase: MobilePhase;
    onClose: () => void;
    onDone: (message: string) => Promise<void>;
    onError: (message: string) => void;
}) {
    const existing = Array.isArray((phase.settings as { groupLabels?: unknown }).groupLabels)
        ? ((phase.settings as { groupLabels?: LabelDef[] }).groupLabels ?? [])
        : [];

    const [zones, setZones] = useState<PhaseZone[]>(() => existing.map((label, index) => ({
        id: label.id,
        // En la base la etiqueta se llama `name`; adentro de esta hoja se sigue
        // llamando `label` para no tocar el formulario.
        label: label.name ?? '',
        color: label.color ?? ZONE_COLORS[index % ZONE_COLORS.length],
        positions: [],
    })));
    const [raw, setRaw] = useState<string[]>(() => existing.map(() => ''));
    const [saving, setSaving] = useState(false);

    /* Las posiciones no estan en la fase: viven en `team_labels`. Se piden al
       abrir para que el formulario muestre lo que hay de verdad y no un campo
       vacio que, al guardar, borraria la asignacion que ya existia. */
    useEffect(() => {
        let cancelado = false;

        void (async () => {
            try {
                const response = await fetch(
                    `/api/admin/team-labels?tournament_id=${encodeURIComponent(tournamentId)}&phase_id=${encodeURIComponent(phase.id)}`,
                );
                if (!response.ok) return;
                const payload = await response.json();
                if (cancelado) return;

                const rows = (Array.isArray(payload?.data) ? payload.data : []) as TeamLabelRow[];
                const porEtiqueta = new Map<string, { name: string; color: string; positions: number[] }>();

                for (const row of rows) {
                    const labelId = row.label_id ?? row.label?.id;
                    if (!labelId || typeof row.position !== 'number') continue;
                    const actual = porEtiqueta.get(labelId) ?? {
                        name: row.label?.name ?? '',
                        color: row.label?.color ?? ZONE_COLORS[porEtiqueta.size % ZONE_COLORS.length],
                        positions: [] as number[],
                    };
                    actual.positions.push(row.position);
                    porEtiqueta.set(labelId, actual);
                }

                if (porEtiqueta.size === 0) return;

                const cargadas: PhaseZone[] = Array.from(porEtiqueta, ([id, item]) => ({
                    id,
                    label: item.name,
                    color: item.color,
                    positions: [...item.positions].sort((a, b) => a - b),
                }));

                /* Las que estan en los settings pero todavia no tienen ninguna
                   posicion asignada tambien se muestran: si no, desapareceria
                   del formulario una etiqueta a medio configurar. */
                const conAsignacion = new Set(cargadas.map((zone) => zone.id));
                for (const zone of existing) {
                    if (zone.id && conAsignacion.has(zone.id)) continue;
                    cargadas.push({
                        id: zone.id,
                        label: zone.name ?? '',
                        color: zone.color ?? ZONE_COLORS[0],
                        positions: [],
                    });
                }

                setZones(cargadas);
                setRaw(cargadas.map((zone) => formatPositions(zone.positions)));
            } catch {
                // Sin asignaciones se sigue con lo que traen los settings.
            }
        })();

        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournamentId, phase.id]);

    function addZone() {
        setZones((current) => [
            ...current,
            {
                id: undefined,
                label: '',
                color: ZONE_COLORS[current.length % ZONE_COLORS.length],
                positions: [],
            },
        ]);
        setRaw((current) => [...current, '']);
    }

    function removeZone(index: number) {
        setZones((current) => current.filter((_, position) => position !== index));
        setRaw((current) => current.filter((_, position) => position !== index));
    }

    async function save() {
        if (saving) return;
        setSaving(true);
        try {
            /* Se pliegan por nombre ANTES de mandar. `normalizePhaseLabels`
               descarta las repetidas del lado del servidor, asi que dos zonas
               con el mismo nombre volverian como una sola y los ids dejarian de
               corresponderse con la lista mandada: de ahi en adelante cada
               etiqueta se llevaria el id de otra. */
            const porNombre = new Map<string, { id?: string; name: string; color: string; positions: number[] }>();
            zones.forEach((zone, index) => {
                const name = (zone.label ?? '').trim();
                const positions = parsePositions(raw[index] ?? '');
                if (!name || positions.length === 0) return;

                const clave = name.toLowerCase();
                const previa = porNombre.get(clave);
                if (previa) {
                    previa.positions = Array.from(new Set([...previa.positions, ...positions]));
                    return;
                }
                porNombre.set(clave, { id: zone.id, name, color: zone.color, positions });
            });

            const deseadas = Array.from(porNombre.values());

            /* PASO 1 — la definicion. El endpoint PISA `settings` entero, no lo
               mezcla: hay que mandar el objeto completo con `groupLabels`
               reemplazado, o se borran el puntaje y los desempates. */
            const response = await pedir(
                'al guardar la etiqueta en la fase',
                `/api/tournaments/${tournamentId}/phases/${phase.id}`,
                {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: phase.name,
                    phase_type: phase.phaseType,
                    settings: {
                        ...phase.settings,
                        groupLabels: deseadas.map((zone) => ({
                            ...(zone.id ? { id: zone.id } : {}),
                            name: zone.name,
                            colorMode: 'manual',
                            color: zone.color,
                        })),
                    },
                }),
                },
            );

            if (!response.ok) {
                let message = `Error ${response.status}`;
                try {
                    const body = await response.json();
                    message = body.error || message;
                } catch {
                    // Sin JSON queda el codigo.
                }
                onError(`No se pudieron guardar las etiquetas: ${message}`);
                return;
            }

            /* El PATCH devuelve la fase con `groupLabels` ya sincronizado contra
               `ui_labels`: de ahi sale el id que necesita la asignacion, y
               vuelven en el mismo orden en que se mandaron. */
            const guardada = await response.json();
            const sincronizadas = (guardada?.data?.settings?.groupLabels ?? []) as LabelDef[];

            const conId = deseadas
                .map((zone, index) => ({ ...zone, labelId: sincronizadas[index]?.id ?? zone.id }))
                .filter((zone) => zone.labelId);

            // PASO 2 — la asignacion por posicion, que es la que pinta la fila.
            try {
                await syncTeamLabels(tournamentId, phase.id, conId);
            } catch (error) {
                /* El paso 1 ya quedo escrito. Decir "no se pudo guardar" seria
                   mentir y llevaria a cargarlas de nuevo; lo que falta es la
                   asignacion, y sin ella la etiqueta existe pero no pinta. */
                const detalle = error instanceof Error ? error.message : 'error de red';
                onError(`La etiqueta quedo guardada, pero no se pudieron asignar las posiciones (${detalle}). En la tabla todavia no se va a ver.`);
                await onDone('Etiquetas guardadas a medias.');
                return;
            }

            await onDone('Etiquetas guardadas.');
        } catch (error) {
            onError(`No se pudo guardar ${error instanceof Error ? error.message : 'por un error de red'}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Sheet title="Etiquetas de la tabla" onClose={onClose}>
            <p className="gtm-sheet-text">
                Pintan las posiciones que clasifican o descienden. Van con su sigla al lado del
                color, para que se lean sin distinguir el verde del ambar.
            </p>

            <div className="gtm-scroll-list">
                {zones.map((zone, index) => (
                    <div key={zone.id ?? index} className="gtm-card" style={{ padding: 12 }}>
                        <div className="gtm-row" style={{ marginBottom: 8 }}>
                            <input
                                className="gtm-input gtm-grow"
                                value={zone.label ?? ''}
                                maxLength={30}
                                placeholder="Semifinales"
                                aria-label={`Nombre de la etiqueta ${index + 1}`}
                                onChange={(event) => setZones((current) => current.map(
                                    (item, position) => (position === index
                                        ? { ...item, label: event.target.value }
                                        : item),
                                ))}
                            />
                            <button
                                type="button"
                                className="gtm-icon-btn"
                                aria-label={`Quitar la etiqueta ${index + 1}`}
                                onClick={() => removeZone(index)}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <input
                            className="gtm-input"
                            value={raw[index] ?? ''}
                            placeholder="1-4"
                            aria-label={`Posiciones de la etiqueta ${index + 1}`}
                            onChange={(event) => setRaw((current) => current.map(
                                (item, position) => (position === index ? event.target.value : item),
                            ))}
                        />
                        <span className="gtm-help">Posiciones: 1-4, o 1,2,5.</span>
                        <div className="gtm-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                            {ZONE_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    className="gtm-swatch"
                                    style={{ background: color }}
                                    aria-label={`Color ${color}`}
                                    aria-pressed={zone.color === color}
                                    onClick={() => setZones((current) => current.map(
                                        (item, position) => (position === index
                                            ? { ...item, color }
                                            : item),
                                    ))}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <button type="button" className="gtm-btn" onClick={addZone}>
                Agregar etiqueta
            </button>
            <button type="button" className="gtm-btn gtm-btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando' : 'Guardar etiquetas'}
            </button>
            <span className="gtm-help">
                Las que queden sin nombre o sin posiciones no se guardan.
            </span>
            <button type="button" className="gtm-btn" onClick={onClose} disabled={saving}>
                Cancelar
            </button>
        </Sheet>
    );
}
