'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    applyClockTransition,
    computeElapsedSeconds,
    createEmptyClock,
    formatClockLabel,
    getPeriodOffsetSeconds,
    normalizeStoredClock,
    resolveClockTransitionForEvent,
    resolveEventMinute,
    type MatchClockTransition,
    type StoredMatchClock,
} from '@/lib/matchClock';
import { normalizeMatchPeriod } from '@/lib/matchPeriods';

/**
 * Reloj del partido, AISLADO.
 *
 * El estado del reloj no comparte nada con `match`, `localEvents` ni con lo que
 * toca applyMatchResponse: guardar un evento no puede frenarlo, rebobinarlo ni
 * recrear su interval. Esa era la causa original del bug.
 *
 * El setInterval de 1s es SOLO re-render. El valor siempre se recalcula contra
 * el ancla del server, asi que sobrevive a refresh, a la pestana en background
 * (donde el navegador throttlea el interval) y al cambio de dispositivo.
 */

export interface UseMatchClockOptions {
    /** matches.clock crudo, en cualquiera de sus formas historicas */
    initialClock: unknown;
    sportId: string | null | undefined;
    /** kickoff, para sembrar el reloj de un partido que ya esta en vivo sin reloj cargado */
    kickoffIso?: string | null;
    initialStatus?: string;
    /**
     * Persiste la intencion y devuelve el clock que respondio el server (o null).
     * El caller lo encola donde corresponda; el hook no sabe de endpoints.
     */
    persistTransition: (transition: MatchClockTransition) => Promise<unknown>;
}

interface ManualDraft {
    minute: string;
    seconds: string;
}

function seedFromKickoff(clock: StoredMatchClock, kickoffIso: string | null | undefined, status?: string) {
    // Mismo gesto que el viejo deriveClockFromKickoff, pero una sola vez al
    // montar y sin efecto reactivo: si el partido ya esta en vivo y nadie toco
    // el reloj, se ancla al kickoff. No se persiste hasta que el operador
    // toque algo, y ahi el 'pause' calcula el corrido real contra esa ancla.
    if (status !== 'live') return clock;
    if (clock.is_running || clock.accumulated_seconds > 0 || clock.period_started_at) return clock;
    if (!kickoffIso) return clock;

    const kickoff = Date.parse(kickoffIso);
    if (!Number.isFinite(kickoff) || kickoff > Date.now()) return clock;

    return {
        ...clock,
        period_started_at: new Date(kickoff).toISOString(),
        is_running: true,
        period: clock.period && clock.period !== 'PRE' ? clock.period : '1T',
    };
}

export function useMatchClock({
    initialClock,
    sportId,
    kickoffIso,
    initialStatus,
    persistTransition,
}: UseMatchClockOptions) {
    const [clock, setClock] = useState<StoredMatchClock>(
        () => seedFromKickoff(normalizeStoredClock(initialClock), kickoffIso, initialStatus),
    );
    const clockRef = useRef(clock);
    clockRef.current = clock;

    /**
     * Transiciones en vuelo. Mientras haya alguna, lo que entra por realtime o
     * por la respuesta de otro PATCH se ignora: si no, el eco de un guardado
     * viejo rebobina el reloj que el operador acaba de mover.
     */
    const pendingRef = useRef(0);
    /** deriva del reloj del dispositivo respecto del server, en ms */
    const skewMsRef = useRef(0);

    // Pre-mount nowMs = el ancla, o sea elapsed === accumulated. Deterministico
    // en SSR y en el primer render del cliente: no hay hydration mismatch.
    const [mountedNowMs, setMountedNowMs] = useState<number | null>(null);
    useEffect(() => {
        setMountedNowMs(Date.now());
    }, []);

    const nowMs = mountedNowMs === null
        ? (clock.period_started_at ? Date.parse(clock.period_started_at) : 0)
        : mountedNowMs + skewMsRef.current;

    // Tick de render. Solo mientras corre, y su unica dep es el booleano: no se
    // recrea por nada que pase en el resto del componente.
    useEffect(() => {
        if (!clock.is_running) return;

        const intervalId = window.setInterval(() => {
            setMountedNowMs(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [clock.is_running]);

    const elapsedSeconds = computeElapsedSeconds(clock, nowMs);
    const label = formatClockLabel(clock, nowMs);

    /* ─── override manual MIN/SEG ─── */

    // null = no se esta editando -> los inputs muestran el valor derivado.
    // Mientras es != null el tick NO lo toca: el usuario esta tipeando.
    const [manualDraft, setManualDraft] = useState<ManualDraft | null>(null);

    const runTransition = useCallback(async (transition: MatchClockTransition) => {
        const previous = clockRef.current;
        const nowIso = new Date(Date.now() + skewMsRef.current).toISOString();
        // updated_at server-only: null mientras es optimista.
        const optimistic = { ...applyClockTransition(previous, transition, nowIso), updated_at: null };

        pendingRef.current += 1;
        clockRef.current = optimistic;
        setClock(optimistic);
        setMountedNowMs(Date.now());

        try {
            const startedAt = Date.now();
            const serverClock = await persistTransition(transition);
            const settledAt = Date.now();

            if (serverClock) {
                const normalized = normalizeStoredClock(serverClock);
                if (normalized.updated_at) {
                    // Recalibra contra hora de server, descontando medio RTT.
                    const serverNow = Date.parse(normalized.updated_at) + Math.round((settledAt - startedAt) / 2);
                    if (Number.isFinite(serverNow)) {
                        skewMsRef.current = serverNow - settledAt;
                    }
                    clockRef.current = normalized;
                    setClock(normalized);
                    setMountedNowMs(Date.now());
                }
            }
        } catch (error) {
            clockRef.current = previous;
            setClock(previous);
            throw error;
        } finally {
            pendingRef.current -= 1;
        }
    }, [persistTransition]);

    /**
     * Entrada desde realtime o desde la respuesta de un PATCH ajeno.
     * pending > 0 -> se ignora. pending == 0 -> se compara updated_at de server
     * contra updated_at de server (nunca contra una marca del dispositivo).
     */
    const applyServerClock = useCallback((raw: unknown) => {
        if (pendingRef.current > 0) return;

        const incoming = normalizeStoredClock(raw);
        if (!incoming.updated_at) return;

        setClock((prev) => {
            if (prev.updated_at && Date.parse(incoming.updated_at as string) <= Date.parse(prev.updated_at)) {
                return prev;
            }
            clockRef.current = incoming;
            return incoming;
        });
        setMountedNowMs(Date.now());
    }, []);

    /* ─── handlers ─── */

    const start = useCallback(() => {
        const current = clockRef.current;
        const period = current.period && current.period !== 'PRE' ? current.period : '1T';
        return runTransition({ mode: 'start', period });
    }, [runTransition]);

    const pause = useCallback(() => runTransition({ mode: 'pause' }), [runTransition]);

    const reset = useCallback(
        () => runTransition({ mode: 'set', seconds: 0, period: 'PRE', running: false }),
        [runTransition],
    );

    const changePeriod = useCallback((period: string) => {
        // Cambiar el periodo a mano NO rebasa el acumulado: el rebase es del
        // evento de arranque. Aca solo se re-rotula.
        return runTransition({ mode: 'keep', period: normalizeMatchPeriod(period) });
    }, [runTransition]);

    /** Rebase explicito al offset del periodo elegido (boton "ir al inicio del periodo"). */
    const rebaseToPeriodStart = useCallback((period: string) => {
        const normalized = normalizeMatchPeriod(period);
        return runTransition({
            mode: 'set',
            period: normalized,
            seconds: getPeriodOffsetSeconds(sportId, normalized),
            running: false,
        });
    }, [runTransition, sportId]);

    const beginManualEdit = useCallback(() => {
        const current = clockRef.current;
        const total = computeElapsedSeconds(current, Date.now() + skewMsRef.current);
        setManualDraft({
            minute: String(Math.floor(total / 60)),
            seconds: String(total % 60),
        });
    }, []);

    const changeManualField = useCallback((field: keyof ManualDraft, value: string) => {
        setManualDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
    }, []);

    const cancelManualEdit = useCallback(() => setManualDraft(null), []);

    /** El override manual ajusta accumulated_seconds, nunca al reves. */
    const commitManualEdit = useCallback(async () => {
        const draft = manualDraft;
        setManualDraft(null);
        if (!draft) return;

        const minute = Math.max(0, Math.trunc(Number(draft.minute) || 0));
        const seconds = Math.min(59, Math.max(0, Math.trunc(Number(draft.seconds) || 0)));
        const target = minute * 60 + seconds;
        const current = clockRef.current;

        if (target === computeElapsedSeconds(current, Date.now() + skewMsRef.current)) return;

        // Si estaba corriendo sigue corriendo, re-anclado al nuevo valor.
        await runTransition({ mode: 'set', seconds: target, running: current.is_running });
    }, [manualDraft, runTransition]);

    /**
     * Transicion que dispara un evento de reloj al guardarse.
     * Devuelve null cuando el evento no toca el reloj.
     */
    const resolveEventTransition = useCallback(
        (eventType: string) => resolveClockTransitionForEvent(eventType, clockRef.current, sportId),
        [sportId],
    );

    /** Minuto CALCULADO al momento del click, no el estado del reloj. */
    const readEventMinute = useCallback(
        () => resolveEventMinute(clockRef.current, Date.now() + skewMsRef.current),
        [],
    );

    const manualValues = useMemo(() => ({
        minute: manualDraft ? manualDraft.minute : String(Math.floor(elapsedSeconds / 60)),
        seconds: manualDraft ? manualDraft.seconds : String(elapsedSeconds % 60),
        isEditing: manualDraft !== null,
    }), [elapsedSeconds, manualDraft]);

    return {
        clock,
        elapsedSeconds,
        elapsedMinute: Math.floor(elapsedSeconds / 60),
        label,
        period: clock.period,
        isRunning: clock.is_running,
        hasProgress: elapsedSeconds > 0,
        /** true mientras hay transiciones sin confirmar por el server */
        isSyncing: pendingRef.current > 0,

        start,
        pause,
        reset,
        changePeriod,
        rebaseToPeriodStart,
        runTransition,
        applyServerClock,

        manual: manualValues,
        beginManualEdit,
        changeManualField,
        cancelManualEdit,
        commitManualEdit,

        resolveEventTransition,
        readEventMinute,
    };
}

export const EMPTY_MATCH_CLOCK = createEmptyClock();
