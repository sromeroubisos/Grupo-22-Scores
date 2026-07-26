import {
    MATCH_CLOCK_MODES,
    applyClockTransition,
    createEmptyClock,
    normalizeStoredClock,
    type MatchClockMode,
    type MatchClockTransition,
    type StoredMatchClock,
} from '@/lib/matchClock';

/**
 * Resolucion server-side del reloj.
 *
 * El cliente declara INTENCION (start / pause / set / keep); los numeros y el
 * ancla los pone el server. Por eso el minuto que termina persistido no depende
 * del reloj del celular del operador.
 */

type SupabaseLike = {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    from: (table: string) => any;
};

export function parseClockTransition(raw: unknown): MatchClockTransition | null {
    if (!raw || typeof raw !== 'object') return null;

    const source = raw as Record<string, unknown>;
    const mode = String(source.mode || '').trim() as MatchClockMode;
    if (!MATCH_CLOCK_MODES.includes(mode)) return null;

    const transition: MatchClockTransition = { mode };

    if (typeof source.period === 'string' && source.period.trim()) {
        transition.period = source.period.trim();
    }
    // En 'pause' el server ignora seconds a proposito: se calcula contra el
    // ancla guardada. Se parsea igual para no romper la forma del payload.
    if (source.seconds !== undefined && source.seconds !== null) {
        const seconds = Number(source.seconds);
        if (Number.isFinite(seconds)) transition.seconds = Math.max(0, Math.trunc(seconds));
    }
    if (typeof source.running === 'boolean') {
        transition.running = source.running;
    }

    return transition;
}

function isMissingFunctionError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    const code = String(error.code || '');
    const message = String(error.message || '').toLowerCase();
    return code === 'PGRST202'
        || code === '42883'
        || message.includes('could not find the function')
        || message.includes('does not exist');
}

export interface MatchClockTransitionResult {
    clock: StoredMatchClock | null;
    /** false -> el caller degrada al snapshot en el array de eventos */
    persisted: boolean;
    viaFallback: boolean;
}

/**
 * Aplica la transicion de forma atomica via funcion Postgres. Si la funcion no
 * existe todavia (deploy sin migrar), cae al path JS: select -> resolver ->
 * update. El fallback NO es atomico y reabre la ventana de dos operadores, por
 * eso se registra en el resultado; el ancla igual sale de hora de server.
 */
export async function runMatchClockTransition(
    client: SupabaseLike,
    matchId: string,
    transition: MatchClockTransition,
): Promise<MatchClockTransitionResult> {
    const { data, error } = await client.rpc('match_clock_transition', {
        p_match_id: matchId,
        p_mode: transition.mode,
        p_period: transition.period ?? null,
        p_seconds: transition.seconds ?? null,
        p_running: transition.running ?? null,
    });

    if (!error) {
        return { clock: normalizeStoredClock(data), persisted: true, viaFallback: false };
    }

    if (!isMissingFunctionError(error)) {
        // Columna clock inexistente u otro fallo real: el caller degrada al
        // snapshot en eventos (CLOCK_SNAPSHOT_EVENT_TYPE).
        return { clock: null, persisted: false, viaFallback: false };
    }

    return runTransitionFallback(client, matchId, transition);
}

async function runTransitionFallback(
    client: SupabaseLike,
    matchId: string,
    transition: MatchClockTransition,
): Promise<MatchClockTransitionResult> {
    const { data: row, error: readError } = await client
        .from('matches')
        .select('clock')
        .eq('id', matchId)
        .maybeSingle();

    if (readError) {
        return { clock: null, persisted: false, viaFallback: true };
    }

    const current = row ? normalizeStoredClock((row as { clock?: unknown }).clock) : createEmptyClock();
    // Hora de SERVER (Vercel), no del navegador. Es el punto de todo esto.
    const next = applyClockTransition(current, transition, new Date().toISOString());

    const { error: writeError } = await client
        .from('matches')
        .update({ clock: next })
        .eq('id', matchId);

    if (writeError) {
        return { clock: next, persisted: false, viaFallback: true };
    }

    return { clock: next, persisted: true, viaFallback: true };
}

/**
 * Path degradado: no hay columna clock. Se resuelve igual para que el snapshot
 * en el array de eventos quede coherente, pero sin estado previo confiable.
 */
export function resolveClockWithoutColumn(transition: MatchClockTransition): StoredMatchClock {
    return applyClockTransition(createEmptyClock(), transition, new Date().toISOString());
}
