'use client';

/**
 * El plantel de la fase: quien la juega y quien no.
 *
 * Sale de `tournament_phase_participants`, que es la tabla que decide si un
 * club entra en la tabla de posiciones de ESTA fase. Un club puede estar en el
 * torneo y no en la fase — es justo lo que pasa con los que quedan afuera entre
 * la primera fase y el playoff.
 *
 * `fixture.participants[].id` ES el `participant_id` que pide el endpoint, no
 * el id del club: pasarle el `clubId` da un 400 de "no pertenece a este
 * torneo", que es un error dificil de leer.
 *
 * El endpoint puede contestar `tableReady: false` cuando la tabla no existe en
 * la base viva. Eso no es "no hay nadie": se dice con todas las letras en vez
 * de mostrar una lista vacia que invita a cargar todo de nuevo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Crest } from '../Crest';
import { EmptyState, SkeletonList, type MobileParticipant } from './shared';

type Assignment = {
    participant_id: string;
    phase_id: string;
    status?: string | null;
};

export function PhaseRosterView({
    tournamentId,
    phaseId,
    participants,
    onToast,
}: {
    tournamentId: string;
    phaseId: string;
    participants: MobileParticipant[];
    onToast: (tone: 'ok' | 'err', message: string) => void;
}) {
    const [inPhase, setInPhase] = useState<Set<string> | null>(null);
    const [tableReady, setTableReady] = useState(true);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/phase-participants`);
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            setTableReady(data.tableReady !== false);
            const assignments: Assignment[] = Array.isArray(data.assignments) ? data.assignments : [];
            setInPhase(new Set(
                assignments
                    .filter((item) => item.phase_id === phaseId && item.status !== 'removed')
                    .map((item) => item.participant_id),
            ));
        } catch {
            setInPhase(null);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [tournamentId, phaseId]);

    useEffect(() => { void load(); }, [load]);

    const ordered = useMemo(
        () => [...participants].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        [participants],
    );

    async function toggle(participantId: string, isIn: boolean) {
        if (saving || !inPhase) return;
        setSaving(true);

        // Optimista: en un telefono, tocar y esperar 400 ms a que la casilla se
        // marque se siente roto. Si el servidor rechaza, se revierte.
        const previous = new Set(inPhase);
        const next = new Set(inPhase);
        if (isIn) next.delete(participantId); else next.add(participantId);
        setInPhase(next);

        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/phase-participants`, {
                method: isIn ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phaseId, participantIds: [participantId] }),
            });

            if (!response.ok) {
                let message = `Error ${response.status}`;
                try {
                    const payload = await response.json();
                    message = payload.error || message;
                } catch {
                    // Sin JSON queda el codigo.
                }
                setInPhase(previous);
                onToast('err', message);
            }
        } catch (error) {
            setInPhase(previous);
            onToast('err', error instanceof Error ? error.message : 'Error de red');
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <SkeletonList rows={6} height={52} />;

    if (failed) {
        return (
            <EmptyState
                title="No se pudo leer el plantel"
                text="La consulta fallo. Volve a entrar a la fase para reintentar."
            />
        );
    }

    if (!tableReady) {
        return (
            <EmptyState
                title="El plantel por fase no esta disponible"
                text="La tabla tournament_phase_participants no existe en esta base. Hasta que se corra su migracion, la fase toma todos los competidores del torneo."
            />
        );
    }

    if (ordered.length === 0) {
        return (
            <EmptyState
                title="El torneo no tiene competidores"
                text="Primero hay que darlos de alta en el torneo; recien despues se eligen los de la fase."
            />
        );
    }

    const count = inPhase?.size ?? 0;

    return (
        <>
            <div className="gtm-section-title">
                {count} de {ordered.length} en esta fase
            </div>
            <span className="gtm-help">
                Tocar una fila la suma o la saca. Los que no estan no entran en la tabla de
                posiciones de la fase.
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ordered.map((participant) => {
                    const isIn = inPhase?.has(participant.id) ?? false;
                    return (
                        <button
                            key={participant.id}
                            type="button"
                            className="gtm-pick-row"
                            aria-pressed={isIn}
                            onClick={() => toggle(participant.id, isIn)}
                        >
                            <span className="gtm-pick-mark" aria-hidden="true">
                                <Check size={16} />
                            </span>
                            <Crest
                                club={{
                                    id: participant.clubId,
                                    name: participant.name,
                                    shortName: participant.shortCode,
                                    logo: participant.logo,
                                }}
                                size="md"
                            />
                            <span className="gtm-grow gtm-team-name">{participant.name}</span>
                            {participant.shortCode ? (
                                <span className="gtm-row-meta">{participant.shortCode}</span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
