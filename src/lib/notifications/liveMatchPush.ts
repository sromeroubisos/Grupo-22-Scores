/**
 * Pasada de avisos en vivo (la llama el cron de push cada minuto).
 *
 * Por cada partido en juego —o terminado hace poco— mira quien lo sigue (club o
 * liga en favoritos) y tiene el celular suscripto, compara con lo ultimo que se le
 * mando (`user_match_push_state`) y manda UN push que reemplaza al anterior.
 * La decision de que cambio y el texto viven en `livePush.ts` (puro y testeado).
 *
 * El acceso a la base y el envio entran por parametro: asi corre en un test sin red.
 */
import {
    FINAL_STATUS_VALUES,
    LIVE_STATUS_VALUES,
    buildLiveMessage,
    decideLive,
    describePlay,
    isIosUserAgent,
    isNotifiablePlay,
    minuteOf,
    phaseOf,
    type LivePhase,
    type LiveSentState,
    type LiveSnapshot,
} from '@/lib/notifications/livePush';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type LiveSub = {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent: string | null;
};

export type LivePushPayload = {
    id: string;
    title: string;
    body: string;
    entity_type: 'match';
    entity_id: string;
    match_id: string;
    kind: 'live';
    tag: string;
    silent: boolean;
    renotify: boolean;
    requireInteraction: boolean;
    url: string;
    timestamp: number;
};

export type LiveSendResult = { ok: boolean; expired: boolean; error?: string };
export type LiveSender = (sub: LiveSub, payload: LivePushPayload) => Promise<LiveSendResult>;

export type LivePassStats = {
    matches: number;
    pairs: number;
    sent: number;
    failed: number;
    skipped: number;
};

/** Un final se avisa si el partido se cerro hace poco; mas viejo es una carga. */
const FINAL_WINDOW_MS = 45 * 60 * 1000;
/** Un partido que empezo hace mas que esto no es un "en vivo" creible. */
const MATCH_AGE_LIMIT_MS = 30 * 60 * 60 * 1000;
const STATE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const CHUNK = 100;
const CONCURRENCY = 8;

function chunk<T>(items: T[], size = CHUNK): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

async function selectIn<T>(
    db: Db,
    table: string,
    columns: string,
    column: string,
    values: string[],
    extra?: (query: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
    const rows: T[] = [];
    for (const part of chunk(values)) {
        let query = db.from(table).select(columns).in(column, part);
        if (extra) query = extra(query);
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...((data ?? []) as T[]));
    }
    return rows;
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
    let index = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
        while (index < items.length) {
            const current = items[index];
            index += 1;
            await worker(current);
        }
    });
    await Promise.all(runners);
}

type MatchRow = {
    id: string;
    sport_id: string | null;
    status: string;
    score: { home?: unknown; away?: unknown } | null;
    clock: Record<string, unknown> | null;
    home_club_id: string | null;
    away_club_id: string | null;
    tournament_id: string | null;
    date_time: string | null;
    updated_at: string | null;
    is_visible: boolean | null;
};

type StateRow = {
    user_id: string;
    match_id: string;
    home: number;
    away: number;
    phase: LivePhase;
    red_cards: number;
    minute: number | null;
    closed: boolean;
    pushed_at: string;
};

const toScore = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

export async function runLivePushPass(input: {
    db: Db;
    send: LiveSender;
    onExpired: (sub: LiveSub, reason: string) => Promise<void>;
    now?: number;
}): Promise<LivePassStats> {
    const { db, send, onExpired } = input;
    const now = input.now ?? Date.now();
    const stats: LivePassStats = { matches: 0, pairs: 0, sent: 0, failed: 0, skipped: 0 };

    const matchColumns = 'id, sport_id, status, score, clock, home_club_id, away_club_id, tournament_id, date_time, updated_at, is_visible';
    const oldestDate = new Date(now - MATCH_AGE_LIMIT_MS).toISOString();

    const [liveRes, finalRes] = await Promise.all([
        db.from('matches').select(matchColumns).in('status', LIVE_STATUS_VALUES).gte('date_time', oldestDate).limit(300),
        db.from('matches').select(matchColumns).in('status', FINAL_STATUS_VALUES)
            .gte('updated_at', new Date(now - FINAL_WINDOW_MS).toISOString())
            .gte('date_time', oldestDate)
            .limit(300),
    ]);
    if (liveRes.error) throw new Error(`matches(live): ${liveRes.error.message}`);
    if (finalRes.error) throw new Error(`matches(final): ${finalRes.error.message}`);

    const matches = [...(liveRes.data ?? []), ...(finalRes.data ?? [])] as MatchRow[];
    stats.matches = matches.length;
    if (matches.length === 0) return stats;

    // Solo los celulares suscriptos importan: son pocos frente a los seguidores.
    const { data: subRows, error: subError } = await db
        .from('user_push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth, user_agent')
        .eq('enabled', true)
        .limit(5000);
    if (subError) throw new Error(`user_push_subscriptions: ${subError.message}`);

    const subsByUser = new Map<string, LiveSub[]>();
    for (const sub of (subRows ?? []) as LiveSub[]) {
        const list = subsByUser.get(sub.user_id) ?? [];
        list.push(sub);
        subsByUser.set(sub.user_id, list);
    }
    const subUserIds = [...subsByUser.keys()].sort();
    if (subUserIds.length === 0) return stats;

    const matchIds = matches.map((m) => m.id).sort();
    const clubIds = [...new Set(matches.flatMap((m) => [m.home_club_id, m.away_club_id]).filter((id): id is string => Boolean(id)))].sort();
    const tournamentIds = [...new Set(matches.map((m) => m.tournament_id).filter((id): id is string => Boolean(id)))].sort();

    const [clubs, tournaments, events, favClubs, favLeagues, states] = await Promise.all([
        selectIn<{ id: string; name: string | null; short_name: string | null }>(db, 'clubs', 'id, name, short_name', 'id', clubIds),
        selectIn<{ id: string; external_id: string | null; is_visible: boolean | null }>(db, 'tournaments', 'id, external_id, is_visible', 'id', tournamentIds),
        selectIn<{ id: string; match_id: string; club_id: string | null; event_type: string | null; player_name: string | null; created_at: string }>(
            db, 'match_events', 'id, match_id, club_id, event_type, player_name, created_at', 'match_id', matchIds,
        ),
        selectIn<{ user_id: string; club_id: string | null; canonical_club_id: string | null }>(
            db, 'user_favorite_clubs', 'user_id, club_id, canonical_club_id', 'user_id', subUserIds,
        ),
        selectIn<{ user_id: string; league_id: string | null; canonical_league_id: string | null }>(
            db, 'user_favorite_leagues', 'user_id, league_id, canonical_league_id', 'user_id', subUserIds,
        ),
        selectIn<StateRow>(
            db, 'user_match_push_state', 'user_id, match_id, home, away, phase, red_cards, minute, closed, pushed_at', 'user_id', subUserIds,
            (query) => query.in('match_id', matchIds),
        ),
    ]);

    const clubName = new Map(clubs.map((c) => [c.id, c.short_name || c.name || 'Club']));
    const tournamentById = new Map(tournaments.map((t) => [t.id, t]));
    const stateByKey = new Map(states.map((s) => [`${s.user_id}:${s.match_id}`, s]));

    const favClubsByUser = new Map<string, Set<string>>();
    for (const fav of favClubs) {
        const set = favClubsByUser.get(fav.user_id) ?? new Set<string>();
        if (fav.club_id) set.add(fav.club_id);
        if (fav.canonical_club_id) set.add(fav.canonical_club_id);
        favClubsByUser.set(fav.user_id, set);
    }
    const favLeaguesByUser = new Map<string, Set<string>>();
    for (const fav of favLeagues) {
        const set = favLeaguesByUser.get(fav.user_id) ?? new Set<string>();
        if (fav.league_id) set.add(fav.league_id);
        if (fav.canonical_league_id) set.add(fav.canonical_league_id);
        favLeaguesByUser.set(fav.user_id, set);
    }

    // Ultima jugada que importa y cantidad de rojas, por partido.
    const eventsByMatch = new Map<string, typeof events>();
    for (const event of events) {
        const list = eventsByMatch.get(event.match_id) ?? [];
        list.push(event);
        eventsByMatch.set(event.match_id, list);
    }

    type Job = { sub: LiveSub; user: string; matchId: string; payload: LivePushPayload; next: LiveSnapshot; };
    const jobs: Job[] = [];

    for (const match of matches) {
        const tournament = match.tournament_id ? tournamentById.get(match.tournament_id) : undefined;
        // Mismo criterio que el aviso de final: lo oculto no se publica.
        if (match.is_visible === false || tournament?.is_visible === false) continue;

        const matchEvents = (eventsByMatch.get(match.id) ?? [])
            .filter((e) => isNotifiablePlay(e.event_type))
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        const last = matchEvents[0];

        const snapshot: LiveSnapshot = {
            matchId: match.id,
            sportId: match.sport_id,
            homeName: match.home_club_id ? clubName.get(match.home_club_id) ?? 'Local' : 'Local',
            awayName: match.away_club_id ? clubName.get(match.away_club_id) ?? 'Visitante' : 'Visitante',
            home: toScore(match.score?.home),
            away: toScore(match.score?.away),
            phase: phaseOf(match.status, match.clock),
            minute: minuteOf(match.clock, now),
            redCards: matchEvents.filter((e) => e.event_type === 'card_red').length,
            lastPlay: last ? describePlay(last.event_type, last.player_name, last.club_id ? clubName.get(last.club_id) : null) : null,
        };

        const followedIds = [match.home_club_id, match.away_club_id].filter((id): id is string => Boolean(id));
        const leagueIds = [match.tournament_id, tournament?.external_id].filter((id): id is string => Boolean(id));

        for (const userId of subUserIds) {
            const follows =
                followedIds.some((id) => favClubsByUser.get(userId)?.has(id)) ||
                leagueIds.some((id) => favLeaguesByUser.get(userId)?.has(id));
            if (!follows) continue;
            stats.pairs += 1;

            const row = stateByKey.get(`${userId}:${match.id}`);
            if (row?.closed) {
                stats.skipped += 1;
                continue;
            }

            const prev: LiveSentState | null = row
                ? { home: row.home, away: row.away, phase: row.phase, redCards: row.red_cards, minute: row.minute, pushedAt: Date.parse(row.pushed_at) }
                : null;

            const subs = subsByUser.get(userId) ?? [];
            const canTick = subs.some((s) => !isIosUserAgent(s.user_agent));
            const decision = decideLive(prev, snapshot, now, canTick);
            if (!decision) {
                stats.skipped += 1;
                continue;
            }

            // iPhone no admite aviso fijo ni refresco silencioso: solo hitos.
            const targets = decision.kind === 'tick' ? subs.filter((s) => !isIosUserAgent(s.user_agent)) : subs;

            for (const sub of targets) {
                const message = buildLiveMessage(snapshot, decision, !isIosUserAgent(sub.user_agent));
                jobs.push({
                    sub,
                    user: userId,
                    matchId: match.id,
                    next: snapshot,
                    payload: {
                        id: `live:${match.id}:${now}`,
                        title: message.title,
                        body: message.body,
                        entity_type: 'match',
                        entity_id: match.id,
                        match_id: match.id,
                        kind: 'live',
                        tag: message.tag,
                        silent: message.silent,
                        renotify: message.renotify,
                        requireInteraction: message.requireInteraction,
                        url: `/matches/${match.id}`,
                        timestamp: now,
                    },
                });
            }
        }
    }

    // Quien recibio al menos un push de cada (usuario, partido) avanza su estado;
    // si todos fallaron por algo transitorio el estado NO avanza y se reintenta.
    const delivered = new Map<string, Job>();

    await pool(jobs, CONCURRENCY, async (job) => {
        let result: LiveSendResult;
        try {
            result = await send(job.sub, job.payload);
        } catch (error) {
            result = { ok: false, expired: false, error: error instanceof Error ? error.message : 'send_failed' };
        }

        if (result.ok) {
            stats.sent += 1;
            delivered.set(`${job.user}:${job.matchId}`, job);
            return;
        }

        stats.failed += 1;
        if (result.expired) await onExpired(job.sub, result.error || 'expired');
    });

    const upserts = [...delivered.values()].map((job) => ({
        user_id: job.user,
        match_id: job.matchId,
        home: job.next.home,
        away: job.next.away,
        phase: job.next.phase,
        red_cards: job.next.redCards,
        minute: job.next.minute,
        closed: job.next.phase === 'final',
        pushed_at: new Date(now).toISOString(),
    }));

    for (const part of chunk(upserts, 200)) {
        const { error } = await db.from('user_match_push_state').upsert(part, { onConflict: 'user_id,match_id' });
        if (error) throw new Error(`user_match_push_state: ${error.message}`);
    }

    await db.from('user_match_push_state').delete().lt('pushed_at', new Date(now - STATE_RETENTION_MS).toISOString());

    return stats;
}
