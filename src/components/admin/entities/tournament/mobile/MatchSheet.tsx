'use client';

/**
 * El partido, entero, en una hoja.
 *
 * Alta y edicion en el mismo formulario: los campos son los mismos y partirlo
 * en dos pantallas obliga a mantener dos veces la misma validacion.
 *
 * DOS COSAS QUE NO SON OBVIAS
 *
 * 1. **La hora que se escribe es la del torneo, no la del navegador.** El input
 *    da "2026-03-14" y "16:00" en hora local argentina; la columna
 *    `matches.date_time` guarda ISO en UTC. La conversion va por
 *    `combineLocalDateTimeToUtcIso`, que resuelve el offset del dia — un
 *    `new Date('2026-03-14T16:00')` usa la zona del telefono y en el celular de
 *    alguien de gira mueve todos los partidos.
 *
 * 2. **Los clubes van en un `<select>` nativo.** Con veinte clubes, el selector
 *    del sistema operativo es mejor que cualquier lista propia: se abre a
 *    pantalla completa, tiene salto por tecla y ya sabe de accesibilidad.
 */

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
    APP_TIMEZONE,
    combineLocalDateTimeToUtcIso,
    toInputDateInTimeZone,
    toInputTimeInTimeZone,
} from '@/lib/timezone';
import { Sheet, matchStatusLabel, type MobileMatch, type MobileParticipant } from './shared';

const STATUSES = ['scheduled', 'live', 'final', 'postponed', 'suspended', 'cancelled'] as const;

export function MatchSheet({
    tournamentId,
    phaseId,
    roundId,
    match,
    participants,
    onClose,
    onDone,
    onError,
}: {
    tournamentId: string;
    phaseId: string;
    /** La fecha a la que se cuelga un partido nuevo. Al editar no se usa. */
    roundId: string | null;
    /** `null` para dar de alta. */
    match: MobileMatch | null;
    participants: MobileParticipant[];
    onClose: () => void;
    onDone: (message: string) => Promise<void>;
    onError: (message: string) => void;
}) {
    const isNew = match === null;

    const [homeId, setHomeId] = useState(match?.homeClub?.id ?? match?.homeClubId ?? '');
    const [awayId, setAwayId] = useState(match?.awayClub?.id ?? match?.awayClubId ?? '');
    const [date, setDate] = useState(() => toInputDateInTimeZone(match?.dateTime, APP_TIMEZONE));
    const [time, setTime] = useState(
        () => toInputTimeInTimeZone(match?.dateTime, APP_TIMEZONE) || '16:00',
    );
    const [venue, setVenue] = useState(match?.venue ?? '');
    const [status, setStatus] = useState<string>(match?.status ?? 'scheduled');
    const [home, setHome] = useState(String(match?.score?.home ?? 0));
    const [away, setAway] = useState(String(match?.score?.away ?? 0));
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const options = [...participants]
        .filter((participant) => participant.clubId)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const sameClub = Boolean(homeId) && homeId === awayId;
    const missing = sameClub
        ? 'Local y visitante no pueden ser el mismo club.'
        : (isNew && !date)
            ? 'Elegi el dia del partido.'
            : null;

    function buildBody() {
        const body: Record<string, unknown> = {
            phaseId,
            homeClubId: homeId || null,
            awayClubId: awayId || null,
            venue: venue.trim() || null,
            status,
            score: { home: Number(home) || 0, away: Number(away) || 0 },
        };
        if (isNew) body.roundId = roundId;
        // Sin dia no se manda `dateTime`: mandar cadena vacia deja la columna en
        // una fecha invalida y el partido desaparece de todos los listados.
        if (date) body.dateTime = combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
        return body;
    }

    async function readError(response: Response, verb: string) {
        let message = `Error ${response.status}`;
        try {
            const payload = await response.json();
            message = payload.error || payload.message || message;
        } catch {
            // Sin JSON queda el codigo.
        }
        onError(`No se pudo ${verb}: ${message}`);
    }

    async function save() {
        if (missing || saving) return;
        setSaving(true);
        try {
            const response = await fetch(
                isNew
                    ? `/api/tournaments/${tournamentId}/matches`
                    : `/api/tournaments/${tournamentId}/matches/${match.id}`,
                {
                    method: isNew ? 'POST' : 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildBody()),
                },
            );
            if (response.ok) {
                await onDone(isNew ? 'Partido creado.' : 'Partido guardado.');
                return;
            }
            await readError(response, isNew ? 'crear el partido' : 'guardar el partido');
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
                `/api/tournaments/${tournamentId}/matches/${match.id}`,
                { method: 'DELETE' },
            );
            if (response.ok) {
                await onDone('Partido eliminado.');
                return;
            }
            await readError(response, 'eliminar el partido');
        } catch (error) {
            onError(`No se pudo eliminar: ${error instanceof Error ? error.message : 'error de red'}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Sheet title={isNew ? 'Nuevo partido' : 'Editar partido'} onClose={onClose}>
            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-m-home">Local</label>
                <select
                    id="gtm-m-home"
                    className="gtm-input"
                    value={homeId}
                    onChange={(event) => setHomeId(event.target.value)}
                >
                    <option value="">A definir</option>
                    {options.map((participant) => (
                        <option key={participant.id} value={participant.clubId ?? ''}>
                            {participant.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-m-away">Visitante</label>
                <select
                    id="gtm-m-away"
                    className={`gtm-input${sameClub ? ' gtm-input-invalid' : ''}`}
                    value={awayId}
                    onChange={(event) => setAwayId(event.target.value)}
                    aria-invalid={sameClub}
                >
                    <option value="">A definir</option>
                    {options.map((participant) => (
                        <option key={participant.id} value={participant.clubId ?? ''}>
                            {participant.name}
                        </option>
                    ))}
                </select>
                {sameClub ? (
                    <span className="gtm-error" role="alert">
                        Local y visitante no pueden ser el mismo club.
                    </span>
                ) : null}
            </div>

            <div className="gtm-pair">
                <div className="gtm-field">
                    <label className="gtm-label" htmlFor="gtm-m-date">Dia</label>
                    <input
                        id="gtm-m-date"
                        type="date"
                        className="gtm-input"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>
                <div className="gtm-field">
                    <label className="gtm-label" htmlFor="gtm-m-time">Hora</label>
                    <input
                        id="gtm-m-time"
                        type="time"
                        className="gtm-input"
                        value={time}
                        onChange={(event) => setTime(event.target.value)}
                    />
                </div>
            </div>
            <span className="gtm-help">Hora de Argentina.</span>

            <div className="gtm-field">
                <label className="gtm-label" htmlFor="gtm-m-venue">Cancha</label>
                <input
                    id="gtm-m-venue"
                    className="gtm-input"
                    value={venue}
                    maxLength={120}
                    placeholder="Opcional"
                    onChange={(event) => setVenue(event.target.value)}
                />
            </div>

            <div className="gtm-field">
                <span className="gtm-label" id="gtm-m-status">Estado</span>
                <div className="gtm-chip-grid" role="radiogroup" aria-labelledby="gtm-m-status">
                    {STATUSES.map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={status === value}
                            className="gtm-chip"
                            onClick={() => setStatus(value)}
                        >
                            {matchStatusLabel(value)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="gtm-field">
                <span className="gtm-label">Marcador</span>
                <div className="gtm-pair">
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className="gtm-input gtm-input-num"
                        value={home}
                        onChange={(event) => setHome(event.target.value)}
                        aria-label="Puntos del local"
                    />
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className="gtm-input gtm-input-num"
                        value={away}
                        onChange={(event) => setAway(event.target.value)}
                        aria-label="Puntos del visitante"
                    />
                </div>
                <span className="gtm-help">
                    La tabla se recalcula sola cuando el partido queda finalizado.
                </span>
            </div>

            <button
                type="button"
                className="gtm-btn gtm-btn-primary"
                disabled={Boolean(missing) || saving}
                onClick={save}
            >
                {saving ? 'Guardando' : isNew ? 'Crear partido' : 'Guardar partido'}
            </button>
            {missing ? <div className="gtm-btn-hint">{missing}</div> : null}

            {!isNew ? (
                confirmDelete ? (
                    <>
                        <div className="gtm-notice">
                            <div className="gtm-notice-body">
                                Se borra el partido y su marcador. La tabla de la fase se recalcula
                                sin el.
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
                            onClick={() => setConfirmDelete(false)}
                            disabled={saving}
                        >
                            No, volver
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="gtm-btn gtm-btn-danger"
                        onClick={() => setConfirmDelete(true)}
                        disabled={saving}
                    >
                        <Trash2 size={18} />
                        Eliminar partido
                    </button>
                )
            ) : null}

            <button type="button" className="gtm-btn" onClick={onClose} disabled={saving}>
                Cancelar
            </button>
        </Sheet>
    );
}
