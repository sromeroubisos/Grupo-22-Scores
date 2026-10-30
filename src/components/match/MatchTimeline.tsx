'use client';

import React, { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './MatchTimeline.module.css';
import { type LocalPublicEvent } from '@/lib/localMatchData';
import { buildMatchEventDefinitionMap, getBaseMatchEventDefinitions, type MatchEventDefinition } from '@/lib/matchEventCatalog';
import { getConfiguredEventPoints } from '@/lib/matchStatsFromEvents';
import { parseSubstitutionIncomingPlayer } from '@/lib/matchEventStats';
import { EVENT_COLORS, EventTypeIcon, cleanDescription, labelForType } from './eventPresentation';
import { compareMatchPeriodValues, getMatchPeriodLabel } from '@/lib/matchPeriods';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FilterKey = 'all' | 'points' | 'fouls' | 'substitutions' | 'cards' | 'kicks';

type TimelineEvent = LocalPublicEvent & {
  subPlayer?: string | null;
  subPlayerId?: string | null;
  /**
   * Lo que valio el tanto, cuando la fuente lo publica. Ultimate Sevens cuenta
   * tries de 7 y conversiones de 1, 2 o 4: con la tabla del deporte el
   * marcador parcial de la cronologia mentia.
   */
  points?: number | null;
};

type TeamInfo = {
  name: string;
  logo?: string | null;
};

/** Con que se nombra a un jugador cuando se lo cliquea en la cronologia. */
export type TimelinePlayerRef = {
  playerId: string | null;
  name: string;
  team: 'home' | 'away' | null;
};

type Props = {
  events: TimelineEvent[];
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  sportId?: string | number | null;
  /**
   * Reglamento del torneo, cuando el deporte lo tiene (futbol americano:
   * tackle o flag). Con el, un flag pull resuelve su definicion en vez de caer
   * al rotulo generico. Sin el, el catalogo del deporte, como siempre.
   */
  tournamentRuleset?: Record<string, unknown> | null;
  /**
   * Que hacer al cliquear un nombre. La pantalla publica del partido abre la
   * ficha del jugador; el gestor no pasa nada y el nombre sigue siendo un
   * enlace al perfil, que es lo que ahi hace falta.
   */
  onPlayerClick?: (player: TimelinePlayerRef) => void;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'points', label: 'Puntos' },
  { key: 'kicks', label: 'Kicks' },
  { key: 'fouls', label: 'Faltas' },
  { key: 'substitutions', label: 'Cambios' },
  { key: 'cards', label: 'Tarjetas' },
];



/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function eventKey(evt: TimelineEvent): string {
  return `${evt.period}|${evt.order}|${evt.minute}|${evt.type}|${evt.team || '-'}|${evt.player || '-'}|${evt.description || '-'}`;
}

function getEventPoints(
  evt: Pick<TimelineEvent, 'type' | 'description' | 'points'>,
  definitionMap: Record<string, MatchEventDefinition>,
): number {
  // El valor que publica la fuente manda sobre el del catalogo del deporte.
  if (typeof evt.points === 'number' && Number.isFinite(evt.points)) return evt.points;
  return getConfiguredEventPoints({ type: evt.type, detail: evt.description }, definitionMap);
}

function getEventCategories(type: string): FilterKey[] {
  const t = type.toLowerCase();
  const cats: FilterKey[] = [];

  const pointTypes = [
    'try', 'penalty_try', 'conversion', 'penalty', 'penalty_goal', 'drop_goal',
    'goal', 'own_goal', 'touchdown', 'field_goal', 'extra_point',
    'two_point_conversion', 'safety', 'run', 'home_run', 'point', 'ace',
    'block_point', 'seven_meter_goal', 'seven_meter', 'free_throw', 'two_pointer', 'three_pointer',
  ];
  if (pointTypes.includes(t)) cats.push('points');

  const kickTypes = ['kick', 'conversion', 'penalty_goal', 'drop_goal', 'field_goal', 'penalty', 'free_kick'];
  if (kickTypes.includes(t)) cats.push('kicks');

  const cardTypes = ['yellow_card', 'red_card', 'card_yellow', 'card_red', 'green_card', 'blue_card'];
  if (cardTypes.includes(t)) cats.push('cards');

  if (t === 'substitution') cats.push('substitutions');

  const foulTypes = [
    'knock_on', 'forward_pass', 'penalty_committed', 'handling_error',
    'turnover_lost', 'foul', 'two_min_suspension',
    'interception', 'fumble', 'turnover_on_downs',
  ];
  if (foulTypes.includes(t)) cats.push('fouls');

  return cats;
}


function getTimelineEventOrder(evt: TimelineEvent, fallback: number) {
  const rawOrder = (evt as unknown as Record<string, unknown>).order;
  if (rawOrder === null || rawOrder === undefined || rawOrder === '') return fallback;
  const parsed = Number(rawOrder);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function sortTimelineEvents(events: TimelineEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const periodDiff = compareMatchPeriodValues(left.event.period, right.event.period);
      if (periodDiff !== 0) return periodDiff;

      const orderDiff = getTimelineEventOrder(left.event, left.index) - getTimelineEventOrder(right.event, right.index);
      if (orderDiff !== 0) return orderDiff;

      return left.event.minute - right.event.minute || eventKey(left.event).localeCompare(eventKey(right.event));
    })
    .map(({ event }) => event);
}



/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

// Memoizado: durante un partido en vivo el detalle se re-renderiza cada segundo
// para refrescar el reloj. Sin esto se reconcilia toda la timeline (una tarjeta
// con SVG por evento) 60 veces por minuto sin que cambie nada.
export default memo(MatchTimeline);

function MatchTimeline({ events, homeTeam, awayTeam, sportId, tournamentRuleset, onPlayerClick }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const definitionMap = useMemo(
    () => buildMatchEventDefinitionMap(getBaseMatchEventDefinitions(String(sportId || 'rugby'), tournamentRuleset ?? null)),
    [sportId, tournamentRuleset],
  );
  const chronologicalEvents = useMemo(() => sortTimelineEvents(events), [events]);

  /* ---- Cálculo de marcadores en orden cronológico ---- */
  const scoreMap = useMemo(() => {
    const map = new Map<string, { home: number; away: number; points: number }>();
    let home = 0;
    let away = 0;
    for (const evt of chronologicalEvents) {
      const pts = getEventPoints(evt, definitionMap);
      if (pts > 0 && evt.team) {
        if (evt.team === 'home') home += pts;
        else away += pts;
      }
      map.set(eventKey(evt), { home, away, points: pts });
    }
    return map;
  }, [chronologicalEvents, definitionMap]);

  /* ---- Filtrado ---- */
  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return chronologicalEvents;
    return chronologicalEvents.filter((evt) => getEventCategories(evt.type).includes(activeFilter));
  }, [activeFilter, chronologicalEvents]);

  /* ---- Resumen según filtro activo ---- */
  const summary = useMemo(() => {
    let total = 0;
    let tries = 0;
    let penalties = 0;
    let kicks = 0;
    for (const evt of filteredEvents) {
      total++;
      const t = evt.type.toLowerCase();
      if (t === 'try' || t === 'penalty_try') tries++;
      if (t === 'penalty' || t === 'penalty_goal' || t === 'penalty_try') penalties++;
      if (['kick', 'conversion', 'penalty_goal', 'drop_goal', 'field_goal'].includes(t)) kicks++;
    }
    return { total, tries, penalties, kicks };
  }, [filteredEvents]);

  /* ---- Agrupación por periodo y minuto ---- */
  const minuteGroups = useMemo(() => {
    const map = new Map<string, { key: string; minute: number; period: string; order: number; home: TimelineEvent[]; away: TimelineEvent[]; neutral: TimelineEvent[] }>();
    filteredEvents.forEach((evt, index) => {
      const groupKey = `${evt.period}:${evt.minute}`;
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          key: groupKey,
          minute: evt.minute,
          period: evt.period,
          order: getTimelineEventOrder(evt, index),
          home: [],
          away: [],
          neutral: [],
        });
      }
      const g = map.get(groupKey)!;
      if (evt.team === 'home') g.home.push(evt);
      else if (evt.team === 'away') g.away.push(evt);
      else g.neutral.push(evt);
    });
    return Array.from(map.values())
      .sort((a, b) => {
        const periodDiff = compareMatchPeriodValues(a.period, b.period);
        if (periodDiff !== 0) return periodDiff;
        return a.order - b.order || a.minute - b.minute;
      })
      // Show the most recent events first; the cumulative score in `scoreMap`
      // is computed from chronological order and therefore stays consistent.
      .reverse();
  }, [filteredEvents]);

  const hasEvents = filteredEvents.length > 0;

  /* ---- Render ---- */
  return (
    <div className={styles.timeline}>
      {/* Header */}
      <div className={styles.timelineHeader}>
        <h3 className={styles.timelineTitle}>Cronología del partido</h3>
        <p className={styles.timelineSubtitle}>Eventos clave minuto a minuto</p>
        <div className={styles.timelineSummary}>
          <span>
            <strong>{summary.total}</strong> eventos
          </span>
          {summary.tries > 0 && (
            <span>
              <strong>{summary.tries}</strong> tries
            </span>
          )}
          {summary.penalties > 0 && (
            <span>
              <strong>{summary.penalties}</strong> penales
            </span>
          )}
          {summary.kicks > 0 && (
            <span>
              <strong>{summary.kicks}</strong> kicks
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className={styles.timelineFilters}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`${styles.filterBtn} ${activeFilter === f.key ? styles.filterBtnActive : ''}`}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Team header */}
      <div className={styles.timelineTeamHeader}>
        <div className={styles.teamHeaderCol}>
          <span>{homeTeam.name}</span>
          {homeTeam.logo ? (
            <img src={homeTeam.logo} alt="" className={styles.teamHeaderLogo} />
          ) : (
            <div className={styles.teamHeaderPlaceholder} />
          )}
        </div>
        <div />
        <div className={styles.teamHeaderCol}>
          {awayTeam.logo ? (
            <img src={awayTeam.logo} alt="" className={styles.teamHeaderLogo} />
          ) : (
            <div className={styles.teamHeaderPlaceholder} />
          )}
          <span>{awayTeam.name}</span>
        </div>
      </div>

      {/* Timeline body */}
      {!hasEvents ? (
        <div className={styles.emptyState}>Aún no han ocurrido eventos significativos.</div>
      ) : (
        <div className={styles.timelineBody}>
          {minuteGroups.map((group) => {
            return (
              <div key={group.key} className={styles.minuteGroup}>
                <div className={styles.minuteBadge}>
                  <span>{group.minute}&apos;</span>
                  <small>{getMatchPeriodLabel(group.period)}</small>
                </div>

                {/* Home events */}
                {group.home.length > 0 && (
                  <div className={`${styles.eventsCol} ${styles.eventsColHome}`}>
                    {group.home.map((evt, idx) => (
                      <EventCard key={`${eventKey(evt)}-h${idx}`} evt={evt} scoreMap={scoreMap} homeName={homeTeam.name} awayName={awayTeam.name} onPlayerClick={onPlayerClick} />
                    ))}
                  </div>
                )}

                {/* Away events */}
                {group.away.length > 0 && (
                  <div className={`${styles.eventsCol} ${styles.eventsColAway}`}>
                    {group.away.map((evt, idx) => (
                      <EventCard key={`${eventKey(evt)}-a${idx}`} evt={evt} scoreMap={scoreMap} homeName={homeTeam.name} awayName={awayTeam.name} onPlayerClick={onPlayerClick} />
                    ))}
                  </div>
                )}

                {/* Neutral events (span full width) */}
                {group.neutral.length > 0 && (
                  <div className={`${styles.eventsCol} ${styles.eventsColNeutral}`}>
                    {group.neutral.map((evt, idx) => (
                      <EventCard key={`${eventKey(evt)}-n${idx}`} evt={evt} scoreMap={scoreMap} homeName={homeTeam.name} awayName={awayTeam.name} onPlayerClick={onPlayerClick} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event Card sub-component                                           */
/* ------------------------------------------------------------------ */

const EventCard = memo(EventCardBase);

function EventCardBase({
  evt,
  scoreMap,
  homeName,
  awayName,
  onPlayerClick,
}: {
  evt: TimelineEvent;
  scoreMap: Map<string, { home: number; away: number; points: number }>;
  homeName: string;
  awayName: string;
  onPlayerClick?: (player: TimelinePlayerRef) => void;
}) {
  const score = scoreMap.get(eventKey(evt));
  const color = EVENT_COLORS[evt.type.toLowerCase()] || EVENT_COLORS.default;
  const label = labelForType(evt.type);
  const detail = cleanDescription(evt.description, evt.type);
  const isScoreEvent = (score?.points ?? 0) > 0;
  const isSubstitution = evt.type.toLowerCase().includes('subst');
  const isTemporarySub = isSubstitution && /\[temporal\]/i.test(String(evt.description || ''));
  const incomingPlayer = evt.subPlayer || parseSubstitutionIncomingPlayer(evt.description);
  const incomingPlayerId = evt.subPlayer ? evt.subPlayerId : null;

  const isClockEvent = ['match_start', 'match_half', 'match_end', 'start_period', 'end_period', 'timeout'].includes(evt.type.toLowerCase());
  const hasRealPlayer = Boolean(evt.player) && evt.player !== 'Jugador';
  const playerName = evt.player || 'Jugador';

  /**
   * El nombre en la tarjeta. Con `onPlayerClick` abre la ficha del jugador
   * dentro del partido —incluso sin id, porque la ficha igual sabe contar lo
   * que hizo—; sin el callback se comporta como siempre y enlaza al perfil.
   */
  const renderPlayer = (name: string, playerId: string | null, wrap?: (content: React.ReactNode) => React.ReactNode) => {
    const content = wrap ? wrap(name) : name;
    if (onPlayerClick) {
      return (
        <button
          type="button"
          className={styles.eventPlayerButton}
          onClick={() => onPlayerClick({ playerId, name, team: evt.team ?? null })}
          aria-haspopup="dialog"
          aria-label={`Ficha de ${name} en el partido`}
        >
          {content}
        </button>
      );
    }
    if (playerId) {
      return (
        <Link href={`/players/${playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          {content}
        </Link>
      );
    }
    return content;
  };

  const playerLink = renderPlayer(playerName, evt.playerId ?? null);

  const teamLabel = evt.team === 'home' ? homeName : evt.team === 'away' ? awayName : '';

  return (
    <div className={`${styles.eventCard} ${isSubstitution ? styles.eventCardSub : ''}`}>
      <div className={styles.eventCardAccent} style={{ background: color }} />

      {isSubstitution ? (
        <>
          <div className={styles.eventPlayerName}>
            Sale: <span className={styles.subOut}>{playerLink}</span>
          </div>
          <div className={styles.eventTypeRow}>
            <EventTypeIcon type={evt.type} className={styles.eventIconSvg} />
            <span style={{ color }}>{isTemporarySub ? 'Cambio temporal' : label}</span>
          </div>
          {incomingPlayer && (
            <div className={styles.eventSubDetail}>
              Entra:{' '}
              {renderPlayer(
                incomingPlayer,
                incomingPlayerId ?? null,
                (content) => <span className={styles.subIn}>{content}</span>,
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {hasRealPlayer && !isClockEvent ? (
            <div className={styles.eventPlayerName}>{playerLink}</div>
          ) : (
            <div className={styles.eventPlayerName} style={{ color }}>{label}</div>
          )}
          <div className={styles.eventTypeRow}>
            <EventTypeIcon type={evt.type} className={styles.eventIconSvg} />
            {hasRealPlayer && !isClockEvent ? (
              <span style={{ color }}>{label}</span>
            ) : teamLabel ? (
              <span>{teamLabel}</span>
            ) : (
              <span style={{ color }}>{label}</span>
            )}
          </div>
          {detail && <div className={styles.eventDetailText}>{detail}</div>}
          {isScoreEvent && score && (
            <div className={styles.eventScoreBadge}>
              <span className={styles.eventPoints}>+{score.points}</span>
              Marcador {score.home}–{score.away}
            </div>
          )}
        </>
      )}
    </div>
  );
}
