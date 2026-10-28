'use client';

/**
 * Anuncio de una jugada importante mientras el partido esta en vivo y el
 * hincha lo tiene abierto. No es una notificacion: es una escena. La pantalla
 * se oscurece, el escudo del club entra al medio, la jugada cae en grande con
 * sus puntos, y minuto + jugador quedan en chico debajo.
 *
 * Se anuncia SOLO lo que llega nuevo despues de la primera carga: los ids que
 * ya estaban al abrir la ficha son la linea de base y no suenan. Si el
 * partido no esta en vivo no se anuncia nada (un partido terminado cargado a
 * mano no tiene por que disparar siete escenas seguidas).
 */
import React, { useEffect, useRef, useState } from 'react';
import { EVENT_COLORS } from '@/components/match/eventPresentation';
import styles from './EventAnnouncement.module.css';

type RawEvent = Record<string, unknown>;
type Side = { name: string; logo: string | null };

type Announcement = {
    key: string;
    type: string;
    kind: 'play' | 'card' | 'sub';
    title: string;
    points: number | null;
    minute: number | null;
    player: string | null;
    /** Cambio: quien entra (`player` es quien sale). */
    incoming: string | null;
    club: string;
    logo: string | null;
    color: string;
    ms: number;
};

// Rugby 15. Rugby league puntua distinto: ahi no se muestra el +N en vez de
// mostrar uno equivocado.
const RUGBY_POINTS: Record<string, number> = {
    try: 5,
    penalty_try: 7,
    conversion: 2,
    penalty_goal: 3,
    drop_goal: 3,
};

const TITLES: Record<string, string> = {
    try: 'TRY',
    penalty_try: 'TRY DE PENAL',
    conversion: 'CONVERSIÓN',
    penalty_goal: 'PENAL',
    drop_goal: 'DROP',
    goal: 'GOL',
    yellow_card: 'AMARILLA',
    card_yellow: 'AMARILLA',
    red_card: 'ROJA',
    card_red: 'ROJA',
    substitution: 'CAMBIO',
};

const FALLBACK_COLOR: Record<string, string> = {
    substitution: '#38bdf8',
    yellow_card: '#eab308',
    card_yellow: '#eab308',
    red_card: '#ef4444',
    card_red: '#ef4444',
};

// Duran 2,5 s (jugadas) y 2 s (cambios) contando la salida: es una escena que
// pasa, no un cartel que hay que leer. Un toque la cierra antes.
const SHOW_MS = 2200;
const SHOW_SUB_MS = 1700;
const LEAVE_MS = 300;
const MAX_QUEUE = 3;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function isRugbyUnion(sportId: string | null | undefined) {
    const s = String(sportId || '').toLowerCase();
    return s.startsWith('rugby') && !s.includes('league');
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
}

function kindOf(type: string): Announcement['kind'] {
    if (type === 'substitution') return 'sub';
    if (/yellow|red|card/.test(type)) return 'card';
    return 'play';
}

export default function EventAnnouncement({
    matchId,
    ready,
    status,
    sportId,
    events,
    home,
    away,
}: {
    matchId: string;
    /** La primera carga ya llego: recien ahi se toma la linea de base. */
    ready: boolean;
    status: string | null | undefined;
    sportId: string | null | undefined;
    events: RawEvent[];
    home: Side;
    away: Side;
}) {
    const seen = useRef<{ matchId: string; ids: Set<string> } | null>(null);
    const queue = useRef<Announcement[]>([]);
    const [current, setCurrent] = useState<Announcement | null>(null);
    const [leaving, setLeaving] = useState(false);
    const timers = useRef<number[]>([]);

    const clearTimers = () => {
        timers.current.forEach((t) => window.clearTimeout(t));
        timers.current = [];
    };

    // Saca el siguiente de la cola, lo muestra, y programa su salida.
    const showNext = React.useCallback(() => {
        const next = queue.current.shift();
        if (!next) {
            setCurrent(null);
            setLeaving(false);
            return;
        }
        setLeaving(false);
        setCurrent(next);
        timers.current.push(
            window.setTimeout(() => setLeaving(true), next.ms),
            window.setTimeout(showNext, next.ms + LEAVE_MS),
        );
    }, []);

    const dismiss = () => {
        clearTimers();
        setLeaving(true);
        timers.current.push(window.setTimeout(showNext, LEAVE_MS));
    };

    useEffect(() => {
        if (!ready) return;

        // Otro partido (o primera vez): todo lo que ya existe es la base.
        if (!seen.current || seen.current.matchId !== matchId) {
            clearTimers();
            queue.current = [];
            setCurrent(null);
            seen.current = {
                matchId,
                ids: new Set(events.map((e) => text(e.id)).filter(Boolean)),
            };
            return;
        }

        const known = seen.current.ids;
        const fresh: RawEvent[] = [];
        for (const e of events) {
            const id = text(e.id);
            // Sin id propio (`local-event-N`) no se puede saber si es nuevo:
            // el indice se corre cuando entra una jugada anterior.
            if (!id || id.startsWith('local-event-') || known.has(id)) continue;
            known.add(id);
            fresh.push(e);
        }
        if (fresh.length === 0 || String(status || '').toLowerCase() !== 'live') return;

        const union = isRugbyUnion(sportId);
        const added: Announcement[] = [];
        for (const e of fresh) {
            const type = text(e.type);
            const title = TITLES[type];
            if (!title) continue;
            const kind = kindOf(type);
            const side = e.team === 'away' ? away : e.team === 'home' ? home : null;
            const minute = Number(e.minute ?? e.time);
            const player = text(e.playerName) || text(e.player_name) || text(e.player);
            const description = text(e.detail) || text(e.description);
            const incoming =
                kind === 'sub'
                    ? text(e.subPlayer) ||
                      text(e.sub_player) ||
                      text(e.secondaryPlayerName) ||
                      text(e.secondary_player_name) ||
                      (/^entra:?\s*(.+)$/i.exec(description)?.[1]?.trim() ?? '')
                    : '';
            added.push({
                key: text(e.id),
                type,
                kind,
                title,
                points: union && type in RUGBY_POINTS ? RUGBY_POINTS[type] : null,
                minute: Number.isFinite(minute) && minute > 0 ? minute : null,
                player: player && player !== 'Jugador' ? player : null,
                incoming: incoming || null,
                club: side?.name ?? '',
                logo: side?.logo ?? null,
                color: EVENT_COLORS[type] ?? FALLBACK_COLOR[type] ?? '#22c55e',
                ms: kind === 'sub' ? SHOW_SUB_MS : SHOW_MS,
            });
        }
        if (added.length === 0) return;

        // Si se juntaron muchas (la pestana estuvo en segundo plano), quedan
        // las ultimas: contar el partido de hace diez minutos no sirve.
        queue.current = [...queue.current, ...added].slice(-MAX_QUEUE);
        if (!current) showNext();
    }, [ready, matchId, events, status, sportId, home, away, current, showNext]);

    useEffect(() => () => clearTimers(), []);

    const a = current;
    const label = a
        ? a.kind === 'sub'
            ? `Cambio en ${a.club}${a.minute ? `, minuto ${a.minute}` : ''}${a.incoming ? `, entra ${a.incoming}` : ''}${a.player ? `, sale ${a.player}` : ''}`
            : `${a.title}${a.points ? `, más ${a.points}` : ''}. ${a.club}${a.minute ? `, minuto ${a.minute}` : ''}${a.player ? `, ${a.player}` : ''}`
        : '';

    return (
        <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
            {a ? (
                <button
                    key={a.key}
                    type="button"
                    className={`${styles.stage} ${leaving ? styles.leaving : ''}`}
                    style={{ '--ev-color': a.color } as React.CSSProperties}
                    onClick={dismiss}
                    aria-label={`${label}. Cerrar aviso`}
                >
                    <span className={styles.scrim} aria-hidden="true" />
                    <span className={styles.content} aria-hidden="true">
                        <span className={styles.crestWrap}>
                            <span className={styles.ring} />
                            <span className={styles.crest}>
                                {a.logo ? <img src={a.logo} alt="" loading="lazy" /> : <span className={styles.initials}>{initials(a.club)}</span>}
                            </span>
                        </span>
                        <span className={styles.headline}>
                            {a.kind === 'card' ? <span className={styles.cardGlyph} /> : null}
                            <span className={styles.title} data-len={a.title.length > 8 ? 'xl' : a.title.length > 5 ? 'l' : 's'}>{a.title}</span>
                            {a.points ? <span className={styles.points}>+{a.points}</span> : null}
                        </span>
                        {a.kind === 'sub' ? (
                            <span className={styles.swap}>
                                {a.incoming ? <span className={styles.in}><b>Entra</b> {a.incoming}</span> : null}
                                {a.player ? <span className={styles.out}><b>Sale</b> {a.player}</span> : null}
                            </span>
                        ) : null}
                        <span className={styles.meta}>
                            {a.minute ? <span>{a.minute}&apos;</span> : null}
                            {a.kind !== 'sub' && a.player ? <span>{a.player}</span> : null}
                            {a.club ? <span>{a.club}</span> : null}
                        </span>
                    </span>
                </button>
            ) : null}
        </div>
    );
}
