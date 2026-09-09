/**
 * Avisos de fútbol externo: comienzo, gol, expulsión y final.
 *
 * Las notificaciones del sitio nacen de triggers de Postgres sobre `matches` y
 * `match_events`. El fútbol de ESPN no pasa por esas tablas —vive en
 * `external_match_cache`, que `live-sync` reescribe cada minuto—, así que
 * nunca disparaba un aviso. Este módulo cierra ese hueco desde el mismo cron:
 * compara lo que ESPN trae ahora con la última fila guardada y de la
 * diferencia salen los hechos.
 *
 * Qué se avisa y de dónde sale cada cosa:
 *
 * - **Comienzo**: la fila estaba programada (o no existía) y ahora está en
 *   vivo. Si el cron se enteró tarde —el partido va por el minuto 60— no se
 *   avisa: un "empezó" a los sesenta minutos es ruido.
 * - **Gol**: el marcador subió respecto de la fila guardada. El autor sale de
 *   los hechos que ESPN publica con el marcador (`liveEvents`); si no está,
 *   el aviso dice el gol y el marcador, que es lo que importa.
 * - **Expulsión**: no cambia marcador ni estado, así que se lee de los hechos
 *   y se limita a las recientes (cinco minutos). La clave del aviso la hace
 *   única por partido, club, minuto y jugador.
 * - **Final**: la fila estaba en vivo y ESPN ya no la lista entre los vivos.
 *   El marcador final se toma del listado completo del día, no de la fila
 *   guardada, que tiene el último marcador visto en vivo.
 *
 * Destinatarios: quien tiene en favoritos a cualquiera de los dos clubes o a
 * la liga. Un hincha quiere el gol en contra tanto como el propio.
 *
 * Idempotente por diseño: `user_notifications` es única por
 * `(user_id, trigger_key)` y el insert ignora duplicados, así que un cron que
 * corre dos veces sobre el mismo estado no avisa dos veces.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Match, MatchLiveEvent } from '@/types/match';

export interface PreviousLiveState {
    id: string;
    status: string;
    score: { home: number | null; away: number | null } | null;
}

export type FootballChangeKind = 'kickoff' | 'goal' | 'red-card' | 'final';

export interface FootballChange {
    kind: FootballChangeKind;
    match: Match;
    /** El club del hecho (el que hizo el gol, el que sufrió la roja). */
    teamId: string | null;
    teamName: string | null;
    playerName: string | null;
    minute: string | null;
    homeScore: number | null;
    awayScore: number | null;
    /** Gol en contra o de penal: cambia el texto, no el aviso. */
    goalKind?: 'goal' | 'own-goal' | 'penalty-goal';
    triggerKey: string;
}

/** Si el cron descubre un partido ya avanzado, no avisa que "empezó". */
const KICKOFF_MAX_MINUTE = 10;
/** Una roja se avisa si es de los últimos minutos; las viejas ya se vieron. */
const RED_CARD_MAX_AGE_MINUTES = 5;

function scoreOf(match: Match): { home: number | null; away: number | null } {
    return {
        home: typeof match.score?.home === 'number' ? match.score.home : null,
        away: typeof match.score?.away === 'number' ? match.score.away : null,
    };
}

/** "45'+2" → 47, "HT" → 45, "90'" → 90. Sin número, null. */
export function minuteNumber(raw: string | null | undefined): number | null {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    if (/^ht$/i.test(value)) return 45;
    const m = /(\d+)'?(?:\s*\+\s*(\d+))?/.exec(value);
    if (!m) return null;
    const base = Number(m[1]);
    const extra = m[2] ? Number(m[2]) : 0;
    return Number.isFinite(base) ? base + extra : null;
}

function goalsOf(match: Match, teamId: string | null): MatchLiveEvent[] {
    if (!teamId) return [];
    return (match.liveEvents ?? [])
        .filter((e) => (e.kind === 'goal' || e.kind === 'own-goal' || e.kind === 'penalty-goal') && e.teamId === teamId)
        .sort((a, b) => (a.minuteNumber ?? -1) - (b.minuteNumber ?? -1));
}

function nameOfTeam(match: Match, teamId: string | null): string | null {
    if (!teamId) return null;
    if (teamId === match.homeTeamId) return match.homeTeamName;
    if (teamId === match.awayTeamId) return match.awayTeamName;
    return null;
}

/**
 * Los goles nuevos de un lado. Si el marcador subió de 1 a 3, son dos hechos
 * con dos claves (`2-0` y `3-0`), cada uno con su autor si ESPN lo publicó:
 * los últimos goles de ese club, en orden.
 */
function goalChanges(match: Match, side: 'home' | 'away', before: number, after: number): FootballChange[] {
    const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
    const goals = goalsOf(match, teamId);
    const changes: FootballChange[] = [];
    const total = after - before;
    for (let i = 0; i < total; i += 1) {
        const scoredSoFar = before + i + 1;
        const home = side === 'home' ? scoredSoFar : scoreOf(match).home;
        const away = side === 'away' ? scoredSoFar : scoreOf(match).away;
        // El gol i-ésimo de esta tanda es el (total - i)-ésimo contando desde el final.
        const event = goals[goals.length - (total - i)] ?? null;
        changes.push({
            kind: 'goal',
            match,
            teamId,
            teamName: nameOfTeam(match, teamId),
            playerName: event?.playerName ?? null,
            minute: event?.minute ?? match.currentMinute ?? null,
            homeScore: home,
            awayScore: away,
            goalKind: event?.kind === 'own-goal' || event?.kind === 'penalty-goal' ? event.kind : 'goal',
            triggerKey: `football:goal:${match.id}:${home ?? '?'}-${away ?? '?'}`,
        });
    }
    return changes;
}

function redCardChanges(match: Match): FootballChange[] {
    const now = minuteNumber(match.currentMinute);
    if (now === null) return [];
    return (match.liveEvents ?? [])
        .filter((e) => e.kind === 'red-card')
        .filter((e) => e.minuteNumber !== null && now - e.minuteNumber <= RED_CARD_MAX_AGE_MINUTES)
        .map((e) => {
            const { home, away } = scoreOf(match);
            const key = `${e.teamId ?? 'x'}:${e.minuteNumber}:${(e.playerName ?? '').toLowerCase().replace(/\s+/g, '-')}`;
            return {
                kind: 'red-card' as const,
                match,
                teamId: e.teamId,
                teamName: nameOfTeam(match, e.teamId),
                playerName: e.playerName,
                minute: e.minute,
                homeScore: home,
                awayScore: away,
                triggerKey: `football:red:${match.id}:${key}`,
            };
        });
}

/**
 * Los hechos nuevos, comparando el estado de ahora con el guardado.
 *
 * `live` es lo que ESPN da en vivo; `finished` son los partidos del día ya
 * terminados, para el marcador final; `previous` es la fila guardada por el
 * cron anterior, por id.
 */
export function detectFootballChanges(
    previous: Map<string, PreviousLiveState>,
    live: Match[],
    finished: Match[],
): FootballChange[] {
    const changes: FootballChange[] = [];

    for (const match of live) {
        const before = previous.get(match.id);
        const now = scoreOf(match);

        const wasLive = before?.status === 'live';
        if (!wasLive) {
            const minute = minuteNumber(match.currentMinute);
            const recent = minute === null ? before?.status === 'scheduled' : minute <= KICKOFF_MAX_MINUTE;
            if (recent) {
                changes.push({
                    kind: 'kickoff',
                    match,
                    teamId: null,
                    teamName: null,
                    playerName: null,
                    minute: match.currentMinute ?? null,
                    homeScore: now.home,
                    awayScore: now.away,
                    triggerKey: `football:kickoff:${match.id}`,
                });
            }
        }

        // Sin fila anterior no hay contra qué comparar: el primer marcador que
        // se ve no es un gol, es el estado. Sin esto, descubrir un partido 2-1
        // en el minuto 70 avisaría tres goles de golpe.
        if (before?.score) {
            const prevHome = typeof before.score.home === 'number' ? before.score.home : null;
            const prevAway = typeof before.score.away === 'number' ? before.score.away : null;
            if (prevHome !== null && now.home !== null && now.home > prevHome) {
                changes.push(...goalChanges(match, 'home', prevHome, now.home));
            }
            if (prevAway !== null && now.away !== null && now.away > prevAway) {
                changes.push(...goalChanges(match, 'away', prevAway, now.away));
            }
        }

        changes.push(...redCardChanges(match));
    }

    const liveIds = new Set(live.map((m) => m.id));
    for (const match of finished) {
        if (match.status !== 'final' || liveIds.has(match.id)) continue;
        const before = previous.get(match.id);
        if (before?.status !== 'live') continue;
        const { home, away } = scoreOf(match);
        changes.push({
            kind: 'final',
            match,
            teamId: null,
            teamName: null,
            playerName: null,
            minute: null,
            homeScore: home,
            awayScore: away,
            triggerKey: `football:final:${match.id}`,
        });
    }

    return changes;
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

function marcador(change: FootballChange): string {
    const { match, homeScore, awayScore } = change;
    return `${match.homeTeamName} ${homeScore ?? 0}-${awayScore ?? 0} ${match.awayTeamName}`;
}

function minuto(change: FootballChange): string {
    const n = minuteNumber(change.minute);
    return n === null ? '' : `Min ${n}: `;
}

export function describeChange(change: FootballChange): { title: string; body: string } {
    const league = change.match.leagueName ? ` en ${change.match.leagueName}` : '';
    switch (change.kind) {
        case 'kickoff':
            return {
                title: 'Empezó el partido',
                body: `${change.match.homeTeamName} vs ${change.match.awayTeamName}${league}. Ya se juega.`,
            };
        case 'goal': {
            const club = change.teamName ?? 'tu club';
            const autor = change.playerName ? ` ${change.playerName}.` : '';
            const como = change.goalKind === 'penalty-goal' ? ' De penal.' : change.goalKind === 'own-goal' ? ' En contra.' : '';
            return {
                title: change.goalKind === 'own-goal' ? `Gol en contra para ${club}` : `Gol de ${club}`,
                body: `${minuto(change)}${autor}${como} ${marcador(change)}.`.replace(/\s+/g, ' ').trim(),
            };
        }
        case 'red-card': {
            const club = change.teamName ?? 'tu club';
            const quien = change.playerName ? ` para ${change.playerName}` : '';
            return {
                title: `Expulsado en ${club}`,
                body: `${minuto(change)}roja${quien}. ${marcador(change)}.`,
            };
        }
        case 'final':
        default:
            return {
                title: 'Partido finalizado',
                body: `Final: ${marcador(change)}${league}.`,
            };
    }
}

// ---------------------------------------------------------------------------
// Destinatarios y escritura
// ---------------------------------------------------------------------------

type LooseClient = {
    from: (table: string) => any;
};

function idVariants(ids: Array<string | null | undefined>): string[] {
    const out = new Set<string>();
    for (const id of ids) {
        const raw = String(id ?? '').trim();
        if (!raw) continue;
        out.add(raw);
        out.add(raw.toLowerCase());
    }
    return [...out];
}

function inList(values: string[]): string {
    return `(${values.map((v) => `"${v.replace(/"/g, '')}"`).join(',')})`;
}

async function recipientsFor(db: LooseClient, match: Match): Promise<Map<string, string[]>> {
    const clubIds = idVariants([match.homeTeamId, match.awayTeamId]);
    const leagueIds = idVariants([match.tournamentId]);
    const users = new Map<string, string[]>();

    const add = (userId: unknown, source: string) => {
        if (typeof userId !== 'string' || !userId) return;
        const sources = users.get(userId) ?? [];
        if (!sources.includes(source)) sources.push(source);
        users.set(userId, sources);
    };

    if (clubIds.length > 0) {
        const list = inList(clubIds);
        const { data, error } = await db
            .from('user_favorite_clubs')
            .select('user_id')
            .or(`club_id.in.${list},canonical_club_id.in.${list}`);
        if (error) throw error;
        for (const row of data ?? []) add(row.user_id, 'club');
    }

    if (leagueIds.length > 0) {
        const list = inList(leagueIds);
        const { data, error } = await db
            .from('user_favorite_leagues')
            .select('user_id')
            .or(`league_id.in.${list},canonical_league_id.in.${list}`);
        if (error) throw error;
        for (const row of data ?? []) add(row.user_id, 'tournament');
    }

    return users;
}

export interface FootballNotifyResult {
    changes: number;
    notifications: number;
    skipped?: 'missing_table';
}

/**
 * Escribe los avisos. Los destinatarios se buscan una vez por partido, no por
 * hecho: tres goles del mismo partido son tres filas por usuario y una sola
 * consulta de favoritos.
 */
export async function notifyFootballChanges(
    changes: FootballChange[],
    supabase: SupabaseClient,
): Promise<FootballNotifyResult> {
    if (changes.length === 0) return { changes: 0, notifications: 0 };
    const db = supabase as unknown as LooseClient;

    const byMatch = new Map<string, FootballChange[]>();
    for (const change of changes) {
        const list = byMatch.get(change.match.id) ?? [];
        list.push(change);
        byMatch.set(change.match.id, list);
    }

    const rows: Record<string, unknown>[] = [];
    for (const [, list] of byMatch) {
        const match = list[0].match;
        const recipients = await recipientsFor(db, match);
        if (recipients.size === 0) continue;

        for (const change of list) {
            const { title, body } = describeChange(change);
            for (const [userId, sources] of recipients) {
                rows.push({
                    user_id: userId,
                    type: change.kind === 'final' ? 'match_finished' : 'team_event',
                    title,
                    body,
                    entity_type: 'match',
                    entity_id: match.id,
                    // Sin fila en `matches`: el partido es externo. La ficha se
                    // abre por `entity_id`, que el Match Center resuelve solo.
                    match_id: null,
                    club_id: null,
                    tournament_id: null,
                    event_id: null,
                    trigger_key: change.triggerKey,
                    metadata: {
                        sport: 'football',
                        provider: 'espn',
                        eventType: change.kind,
                        goalKind: change.goalKind ?? null,
                        sources,
                        externalMatchId: match.id,
                        homeTeamId: match.homeTeamId,
                        awayTeamId: match.awayTeamId,
                        homeTeam: match.homeTeamName,
                        awayTeam: match.awayTeamName,
                        homeScore: change.homeScore,
                        awayScore: change.awayScore,
                        minute: change.minute,
                        playerName: change.playerName,
                        clubName: change.teamName,
                        tournamentId: match.tournamentId,
                        tournamentName: match.leagueName ?? null,
                    },
                });
            }
        }
    }

    if (rows.length === 0) return { changes: changes.length, notifications: 0 };

    const { error } = await db
        .from('user_notifications')
        .upsert(rows, { onConflict: 'user_id,trigger_key', ignoreDuplicates: true });

    if (error) {
        if (error.code === '42P01' || /user_notifications/.test(String(error.message))) {
            console.warn('[football-notify] user_notifications no existe: no se escribió ningún aviso.');
            return { changes: changes.length, notifications: 0, skipped: 'missing_table' };
        }
        throw error;
    }

    // `ignoreDuplicates` no dice cuántas entraron: se informa lo intentado.
    return { changes: changes.length, notifications: rows.length };
}
