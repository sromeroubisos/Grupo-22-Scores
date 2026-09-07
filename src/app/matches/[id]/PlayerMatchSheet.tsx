'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EVENT_COLORS, EventTypeIcon, cleanDescription, labelForType } from '@/components/match/eventPresentation';
import { compareMatchPeriodValues } from '@/lib/matchPeriods';
import { ratingScaleVars } from '@/lib/matches/ratingScale';
import {
    type PlayerMetricTone,
    type PlayerStatsTableRow,
    formatPlayerMetricValue,
    getPlayerMetricMeta,
    parseNumericStat,
} from '@/lib/playerStats';

import styles from './page.module.css';

/**
 * Con que se pide la ficha: lo que sabe el lugar donde se cliqueo el nombre.
 *
 * La lista de la alineacion sabe el numero y el puesto; la cronologia sabe
 * apenas el nombre. Lo que falte lo completa la tabla de estadisticas, asi que
 * el que llama no tiene que resolver nada antes de abrir.
 */
export type PlayerSheetIdentity = {
    playerId?: string | null;
    name: string;
    team?: 'home' | 'away' | null;
    teamName?: string | null;
    number?: number | null;
    position?: string | null;
    rating?: number | null;
    isCaptain?: boolean;
};

export type PlayerSheetMetric = {
    id: string;
    label: string;
    value: string;
    tone: PlayerMetricTone;
    /** El cero se muestra apagado: "0 amarillas" no es una marca del partido. */
    isZero: boolean;
};

export type PlayerSheetEvent = {
    key: string;
    type: string;
    label: string;
    detail: string;
    minute: number | null;
    color: string;
    /** El cambio en el que ENTRA: el mismo evento nombra a dos jugadores. */
    incoming: boolean;
};

export type PlayerSheetSubject = {
    key: string;
    playerId: string | null;
    name: string;
    team: 'home' | 'away' | null;
    teamName: string;
    number: number | null;
    position: string | null;
    rating: number | null;
    isCaptain: boolean;
    metrics: PlayerSheetMetric[];
    events: PlayerSheetEvent[];
};

export type PlayerSheetTableData = {
    rows: PlayerStatsTableRow[];
    metricIds: string[];
    metricLabels: Record<string, string>;
};

/**
 * Metricas que la lista NO repite.
 *
 * - `matchesPlayed` es de temporada y la fila la arrastra como 1: dentro de la
 *   ficha de UN partido no dice nada y ocupa el mismo renglon que un try.
 * - `rating` ya esta en la cabecera, en su chapa de color. Listarlo abajo es
 *   escribir el mismo numero dos veces con distinto peso.
 */
const METRICS_HIDDEN_IN_SHEET = new Set(['matchesPlayed', 'rating']);

function nameKey(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Si dos nombres del mismo partido son la misma persona.
 *
 * La cronologia de varios proveedores nombra por APELLIDO ("Reihana") mientras
 * la planilla trae el nombre completo ("Josh Reihana"). Por eso, cuando UNO de
 * los dos es una sola palabra, alcanza con que coincida el ultimo token.
 *
 * Dos nombres completos distintos NO se cruzan aunque compartan apellido: los
 * hermanos en el mismo plantel son moneda corriente en rugby, y mezclar sus
 * fichas es peor que no abrir ninguna.
 */
function sameName(left: string, right: string) {
    if (!left || !right) return false;
    if (left === right) return true;

    const leftParts = left.split(' ');
    const rightParts = right.split(' ');
    if (leftParts.length > 1 && rightParts.length > 1) return false;

    return leftParts[leftParts.length - 1] === rightParts[rightParts.length - 1];
}

/** Palabras que no aportan por si solas al comparar un detalle con su rotulo. */
const DETAIL_STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'por', 'a', 'y']);

/**
 * Si el detalle del evento agrega algo dentro de ESTA ficha.
 *
 * "Conversión de Reihana", bajo el rotulo "Conversion" y en la ficha de
 * Reihana, es el mismo dato escrito tres veces. "Amarilla — juego peligroso"
 * si dice algo que no esta en ningun otro lado.
 */
function detailAddsSomething(detail: string, label: string, playerNameKeys: string[]) {
    const known = new Set<string>();
    nameKey(label).split(' ').forEach((word) => word && known.add(word));
    playerNameKeys.forEach((key) => key.split(' ').forEach((word) => word && known.add(word)));

    return nameKey(detail)
        .split(' ')
        .some((word) => word && !known.has(word) && !DETAIL_STOPWORDS.has(word));
}

function readMinute(event: Record<string, unknown>) {
    const raw = Number(event?.minute ?? event?.time);
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
}

/**
 * Si el evento habla de este jugador.
 *
 * Cuando los dos lados tienen id manda el id y el nombre no opina: dos
 * homonimos en el mismo partido son dos fichas distintas. Recien sin id se cae
 * al nombre plegado, que es todo lo que publica media docena de proveedores.
 */
function eventNamesPlayer(eventId: string, eventName: unknown, playerId: string | null, playerNameKeys: string[]) {
    if (playerId && eventId) return eventId === playerId;
    const eventKey = nameKey(eventName);
    if (!eventKey) return false;
    return playerNameKeys.some((key) => sameName(key, eventKey));
}

/**
 * Arma la ficha con lo que la pantalla ya tiene: la tabla de estadisticas del
 * partido y la cronologia. No pide nada a la red, asi que abre en el acto y
 * funciona igual con el partido en vivo.
 */
export function resolvePlayerSheetSubject(args: {
    identity: PlayerSheetIdentity;
    table: PlayerSheetTableData;
    events: unknown[];
    homeName: string;
    awayName: string;
}): PlayerSheetSubject {
    const { identity, table } = args;
    const wantedId = readText(identity.playerId) || null;
    const wantedNameKey = nameKey(identity.name);

    // El mismo apellido en los dos clubes es la regla y no la excepcion: si
    // quien abre la ficha sabe de que lado juega, se respeta.
    const sameSide = (candidate: PlayerStatsTableRow) =>
        !identity.team || !candidate.team || identity.team === candidate.team;

    const byId = wantedId ? table.rows.find((candidate) => candidate.playerId === wantedId) : undefined;
    const byExactName = table.rows.find(
        (candidate) => sameSide(candidate) && nameKey(candidate.name) === wantedNameKey,
    );
    // Por apellido solo si queda UN candidato: con dos que lo comparten en el
    // mismo plantel, abrir la ficha equivocada es peor que no abrir ninguna.
    const bySurname = table.rows.filter(
        (candidate) => sameSide(candidate) && sameName(nameKey(candidate.name), wantedNameKey),
    );

    const row = byId || byExactName || (bySurname.length === 1 ? bySurname[0] : null) || null;

    const playerId = wantedId || row?.playerId || null;
    // El nombre de la planilla le gana al del evento: "Josh Reihana" es la
    // ficha, "Reihana" es como lo nombro el relato.
    const name = row?.name || readText(identity.name) || 'Jugador';
    const nameKeys = [wantedNameKey, nameKey(name)].filter(Boolean);
    const team = identity.team ?? row?.team ?? null;
    const teamName =
        readText(identity.teamName) ||
        row?.teamName ||
        (team === 'home' ? args.homeName : team === 'away' ? args.awayName : '');

    const metrics: PlayerSheetMetric[] = row
        ? table.metricIds
              .filter((metricId) => !METRICS_HIDDEN_IN_SHEET.has(metricId))
              .filter((metricId) => {
                  const value = row.metrics[metricId];
                  return value != null && value !== '';
              })
              .map((metricId) => {
                  const meta = getPlayerMetricMeta(metricId, table.metricLabels[metricId]);
                  const raw = row.metrics[metricId];
                  return {
                      id: metricId,
                      label: meta.label,
                      value: formatPlayerMetricValue(metricId, raw, table.metricLabels[metricId]),
                      tone: meta.tone ?? 'neutral',
                      isZero: (parseNumericStat(raw) ?? 0) === 0,
                  };
              })
        : [];

    const list = Array.isArray(args.events) ? args.events : [];
    // Mismo orden que la cronologia: periodo, `order` de la planilla y recien
    // despues el minuto. Sin esto el final del partido cae entre dos jugadas
    // de su mismo minuto.
    const chronological = list
        .map((event, index) => ({ event: (event || {}) as Record<string, unknown>, index }))
        .sort((left, right) => {
            const period = compareMatchPeriodValues(left.event?.period, right.event?.period);
            if (period !== 0) return period;
            const order = (Number(left.event?.order) || 0) - (Number(right.event?.order) || 0);
            if (order !== 0) return order;
            return (Number(left.event?.minute) || 0) - (Number(right.event?.minute) || 0) || left.index - right.index;
        });

    const events: PlayerSheetEvent[] = [];
    chronological.forEach(({ event, index }) => {
        const type = String(event?.type || 'note');
        const isOwn = eventNamesPlayer(readText(event?.playerId), event?.player, playerId, nameKeys);
        const isIncoming = eventNamesPlayer(readText(event?.subPlayerId), event?.subPlayer, playerId, nameKeys);
        if (!isOwn && !isIncoming) return;

        const incoming = isIncoming && !isOwn;
        const label = incoming ? 'Entra' : labelForType(type);
        const detail = cleanDescription(String(event?.description ?? ''), type);
        events.push({
            key: `${index}-${type}`,
            type,
            label,
            detail: detailAddsSomething(detail, label, nameKeys) ? detail : '',
            minute: readMinute(event),
            color: EVENT_COLORS[type.toLowerCase()] || EVENT_COLORS.default,
            incoming,
        });
    });

    return {
        key: row?.key || playerId || `${team || 'neutral'}:${nameKey(name)}`,
        playerId,
        name,
        team,
        teamName,
        number: identity.number ?? row?.number ?? null,
        position: identity.position ?? row?.position ?? null,
        rating: typeof identity.rating === 'number' ? identity.rating : row?.rating ?? null,
        isCaptain: Boolean(identity.isCaptain || row?.isCaptain),
        metrics,
        events,
    };
}

/**
 * Las caras que ya se pidieron en esta visita, incluido el "no tiene" (null).
 *
 * Vive fuera del componente a proposito: en un partido se abren diez fichas y
 * se vuelve sobre las mismas dos o tres. Sin esto, cerrar y reabrir la ficha de
 * un jugador vuelve a pedir su foto.
 */
const photoCache = new Map<string, string | null>();

type Props = {
    subject: PlayerSheetSubject | null;
    onClose: () => void;
};

/**
 * La ficha de un jugador DENTRO del partido: todo lo que el partido dice de el,
 * y la puerta a su perfil.
 *
 * Es una ficha y no un salto al perfil porque son dos preguntas distintas: el
 * que esta leyendo un partido quiere saber que hizo HOY, no la carrera entera.
 * Antes el nombre se llevaba al lector afuera de la pantalla y volver costaba
 * perder el lugar de lectura.
 */
export default function PlayerMatchSheet({ subject, onClose }: Props) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const open = subject != null;

    const playerId = subject?.playerId ?? null;
    const [photo, setPhoto] = useState<string | null>(() => (playerId ? photoCache.get(playerId) ?? null : null));

    // La cara se pide recien al abrir la ficha, y de a una. Adentro del partido
    // no viaja ninguna: `people.photo_url` guarda base64 y un plantel entero de
    // fotos que nadie mira son megabytes por visita.
    useEffect(() => {
        if (!playerId) {
            setPhoto(null);
            return;
        }

        if (photoCache.has(playerId)) {
            setPhoto(photoCache.get(playerId) ?? null);
            return;
        }

        let cancelado = false;
        setPhoto(null);

        fetch(`/api/players/${encodeURIComponent(playerId)}/foto`)
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => {
                const resuelta = typeof payload?.photo === 'string' && payload.photo ? payload.photo : null;
                photoCache.set(playerId, resuelta);
                if (!cancelado) setPhoto(resuelta);
            })
            // Sin foto la ficha se dibuja igual, con la inicial: no hay nada
            // que avisarle al lector.
            .catch(() => {});

        return () => {
            cancelado = true;
        };
    }, [playerId]);

    useEffect(() => {
        if (!open) return;

        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panelRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            // Volver al nombre que se cliqueo: sin esto el foco cae al principio
            // del documento y el que navega por teclado pierde la lista.
            const previous = restoreFocusRef.current;
            if (previous && document.contains(previous)) previous.focus();
        };
    }, [open, onClose]);

    if (!subject) return null;

    const titleId = 'player-match-sheet-title';
    const hasMetrics = subject.metrics.length > 0;
    const hasEvents = subject.events.length > 0;

    return (
        <div
            className={styles.pmSheetOverlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={styles.pmSheet}
            >
                <header className={styles.pmSheetHeader}>
                    {/* El círculo va siempre, con foto o con la inicial: si
                        apareciera recién cuando llega la imagen, la cabecera
                        entera se correría a mitad de lectura. */}
                    <div className={styles.pmSheetAvatar}>
                        {photo ? (
                            <img
                                src={photo}
                                // El nombre está al lado: repetirlo acá se lo
                                // haría escuchar dos veces al lector de pantalla.
                                alt=""
                                loading="lazy"
                                className={styles.pmSheetAvatarPhoto}
                            />
                        ) : (
                            <span aria-hidden="true">{subject.name.charAt(0)}</span>
                        )}
                    </div>
                    <div className={styles.pmSheetIdentity}>
                        <div className={styles.pmSheetNameRow}>
                            {subject.number != null && <span className={styles.pmSheetNumber}>{subject.number}</span>}
                            <h2 id={titleId} className={styles.pmSheetName}>{subject.name}</h2>
                            {subject.isCaptain && <span className={styles.pmSheetCaptain} title="Capitán">C</span>}
                        </div>
                        <p className={styles.pmSheetMeta}>
                            {subject.teamName || 'Sin club'}
                            {subject.position ? ` · ${subject.position}` : ''}
                        </p>
                    </div>
                    <div className={styles.pmSheetHeaderActions}>
                        {typeof subject.rating === 'number' && (
                            <span
                                className={styles.playerRatingMeta}
                                style={ratingScaleVars(subject.rating) as React.CSSProperties}
                            >
                                {subject.rating.toFixed(1)}
                            </span>
                        )}
                        <button
                            type="button"
                            className={styles.pmSheetClose}
                            onClick={onClose}
                            aria-label="Cerrar la ficha del jugador"
                        >
                            ×
                        </button>
                    </div>
                </header>

                <div className={styles.pmSheetBody}>
                    <section className={styles.pmSheetSection}>
                        <h3 className={styles.pmSheetSectionTitle}>Su partido</h3>
                        {hasMetrics ? (
                            <dl className={styles.pmSheetStats}>
                                {subject.metrics.map((metric) => (
                                    <div
                                        key={metric.id}
                                        className={`${styles.pmSheetStatRow} ${metric.isZero ? styles.pmSheetStatRowZero : ''}`}
                                    >
                                        <dt className={styles.pmSheetStatLabel}>{metric.label}</dt>
                                        <dd
                                            className={`${styles.pmSheetStatValue} ${
                                                metric.isZero
                                                    ? ''
                                                    : metric.tone === 'danger'
                                                    ? styles.pmSheetStatValueDanger
                                                    : metric.tone === 'caution'
                                                    ? styles.pmSheetStatValueCaution
                                                    : ''
                                            }`}
                                        >
                                            {metric.value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className={styles.pmSheetEmpty}>
                                No hay estadísticas individuales cargadas para este jugador en el partido.
                            </p>
                        )}
                    </section>

                    {hasEvents && (
                        <section className={styles.pmSheetSection}>
                            <h3 className={styles.pmSheetSectionTitle}>En la cronología</h3>
                            <ul className={styles.pmSheetEvents}>
                                {subject.events.map((event) => (
                                    <li key={event.key} className={styles.pmSheetEvent}>
                                        {/* Sin minuto no va guion: varios proveedores no lo
                                            publican nunca, y una columna entera de rayas es
                                            ruido. La celda vacía mantiene la grilla. */}
                                        <span className={styles.pmSheetEventMinute}>
                                            {event.minute != null ? `${event.minute}'` : ''}
                                        </span>
                                        <span className={styles.pmSheetEventIcon} style={{ color: event.color }}>
                                            <EventTypeIcon type={event.type} className={styles.pmSheetEventIconSvg} />
                                        </span>
                                        <span className={styles.pmSheetEventText}>
                                            <span className={styles.pmSheetEventLabel} style={{ color: event.color }}>
                                                {event.label}
                                            </span>
                                            {event.detail && <span className={styles.pmSheetEventDetail}>{event.detail}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>

                <footer className={styles.pmSheetFooter}>
                    {subject.playerId ? (
                        <Link href={`/players/${subject.playerId}`} className={styles.pmSheetProfileLink}>
                            Ver perfil
                        </Link>
                    ) : (
                        <span className={styles.pmSheetNoProfile}>
                            Todavía no tiene ficha propia en el sitio.
                        </span>
                    )}
                    <button type="button" className={styles.pmSheetCloseText} onClick={onClose}>
                        Cerrar
                    </button>
                </footer>
            </div>
        </div>
    );
}
