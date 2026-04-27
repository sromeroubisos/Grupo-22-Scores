'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './MatchTimeline.module.css';
import { type LocalPublicEvent } from '@/lib/localMatchData';
import { buildMatchEventDefinitionMap, getDefaultMatchEventDefinitions, type MatchEventDefinition } from '@/lib/matchEventCatalog';
import { getConfiguredEventPoints } from '@/lib/matchStatsFromEvents';
import { isGoalKickAttemptEvent, parseSubstitutionIncomingPlayer } from '@/lib/matchEventStats';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FilterKey = 'all' | 'points' | 'fouls' | 'substitutions' | 'cards' | 'kicks';

type TimelineEvent = LocalPublicEvent & {
  subPlayer?: string | null;
  subPlayerId?: string | null;
};

type TeamInfo = {
  name: string;
  logo?: string | null;
};

type Props = {
  events: TimelineEvent[];
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  sportId?: string | number | null;
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

const TYPE_LABELS: Record<string, string> = {
  try: 'Try',
  penalty_try: 'Penalty Try',
  conversion: 'Conversion',
  penalty: 'Penal',
  penalty_goal: 'Penal a los palos',
  drop_goal: 'Drop',
  goal: 'Gol',
  own_goal: 'Gol en contra',
  yellow_card: 'Tarjeta amarilla',
  red_card: 'Tarjeta roja',
  card_yellow: 'Tarjeta amarilla',
  card_red: 'Tarjeta roja',
  substitution: 'Cambio',
  kick: 'Patada',
  line: 'Line',
  scrum: 'Scrum',
  tackle: 'Tackle',
  penalty_conceded: 'Penal concedido',
  penalty_won: 'Penal ganado',
  knock_on: 'Knock-on',
  forward_pass: 'Pase forward',
  handling_error: 'Error de manejo',
  turnover_lost: 'Turnover perdido',
  turnover_won: 'Turnover ganado',
  ruck: 'Ruck',
  maul: 'Maul',
  recovery: 'Recuperacion',
  entradas_22: 'Entradas en 22',
  pass: 'Pase',
  injury: 'Lesion',
  free_kick: 'Free Kick',
  foul: 'Falta',
  match_start: 'Inicio del partido',
  match_half: 'Entretiempo',
  match_end: 'Final del partido',
  start_period: 'Inicio de periodo',
  end_period: 'Fin de periodo',
  touchdown: 'Touchdown',
  field_goal: 'Field goal',
  extra_point: 'Punto extra',
  two_point_conversion: 'Conversion de 2',
  safety: 'Safety',
  run: 'Carrera',
  home_run: 'Home run',
  point: 'Punto',
  ace: 'Ace',
  block_point: 'Bloqueo',
  seven_meter_goal: 'Gol de 7m',
  free_throw: 'Tiro libre',
  two_pointer: 'Doble',
  three_pointer: 'Triple',
  timeout: 'Tiempo muerto',
  green_card: 'Tarjeta verde',
};

const EVENT_COLORS: Record<string, string> = {
  try: '#22c55e',
  goal: '#22c55e',
  touchdown: '#22c55e',
  point: '#22c55e',
  ace: '#22c55e',
  block_point: '#22c55e',
  run: '#22c55e',
  home_run: '#22c55e',
  conversion: '#3b82f6',
  penalty_goal: '#3b82f6',
  drop_goal: '#3b82f6',
  penalty: '#3b82f6',
  field_goal: '#3b82f6',
  kick: '#60a5fa',
  free_kick: '#60a5fa',
  penalty_conceded: '#f43f5e',
  penalty_won: '#f43f5e',
  foul: '#f43f5e',
  knock_on: '#f43f5e',
  forward_pass: '#f43f5e',
  handling_error: '#f43f5e',
  turnover_lost: '#f43f5e',
  yellow_card: '#eab308',
  card_yellow: '#eab308',
  green_card: '#22c55e',
  red_card: '#ef4444',
  card_red: '#ef4444',
  substitution: '#8b5cf6',
  line: '#9ca3af',
  scrum: '#9ca3af',
  tackle: '#9ca3af',
  ruck: '#9ca3af',
  maul: '#9ca3af',
  recovery: '#9ca3af',
  entradas_22: '#9ca3af',
  pass: '#9ca3af',
  injury: '#f97316',
  timeout: '#9ca3af',
  match_start: '#9ca3af',
  match_half: '#9ca3af',
  match_end: '#9ca3af',
  start_period: '#9ca3af',
  end_period: '#9ca3af',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function eventKey(evt: TimelineEvent): string {
  return `${evt.minute}|${evt.type}|${evt.team || '-'}|${evt.player || '-'}|${evt.description || '-'}`;
}

function getEventPoints(
  evt: Pick<TimelineEvent, 'type' | 'description'>,
  definitionMap: Record<string, MatchEventDefinition>,
): number {
  return getConfiguredEventPoints({ type: evt.type, detail: evt.description }, definitionMap);
}

function getEventCategories(type: string): FilterKey[] {
  const t = type.toLowerCase();
  const cats: FilterKey[] = [];

  const pointTypes = [
    'try', 'penalty_try', 'conversion', 'penalty', 'penalty_goal', 'drop_goal',
    'goal', 'own_goal', 'touchdown', 'field_goal', 'extra_point',
    'two_point_conversion', 'safety', 'run', 'home_run', 'point', 'ace',
    'block_point', 'seven_meter_goal', 'free_throw', 'two_pointer', 'three_pointer',
  ];
  if (pointTypes.includes(t)) cats.push('points');

  const kickTypes = ['kick', 'conversion', 'penalty_goal', 'drop_goal', 'field_goal', 'penalty', 'free_kick'];
  if (kickTypes.includes(t)) cats.push('kicks');

  const cardTypes = ['yellow_card', 'red_card', 'card_yellow', 'card_red', 'green_card'];
  if (cardTypes.includes(t)) cats.push('cards');

  if (t === 'substitution') cats.push('substitutions');

  const foulTypes = [
    'knock_on', 'forward_pass', 'penalty_conceded', 'handling_error',
    'turnover_lost', 'foul', 'two_min_suspension', 'penalty_won',
  ];
  if (foulTypes.includes(t)) cats.push('fouls');

  return cats;
}

function labelForType(type: string): string {
  return TYPE_LABELS[type.toLowerCase()] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanDescription(desc: string, type: string): string {
  let cleaned = String(desc || '')
    .replace(/\[palos:(ok|miss)\]/gi, '')
    .replace(/^Dist:\s*/i, '')
    .trim();

  if (!cleaned) return '';

  const t = type.toLowerCase();
  if (t === 'substitution' && cleaned.toLowerCase().startsWith('entra:')) {
    return cleaned;
  }

  // For goal-kick attempts, append outcome from the original description
  if (isGoalKickAttemptEvent({ type, detail: desc })) {
    const raw = String(desc || '').toLowerCase();
    if (/fallad[ao]|errad[ao]|erró|falló|no convert|\bmissed\b/.test(raw) || /\[palos:miss\]/i.test(String(desc || ''))) {
      cleaned = cleaned ? `${cleaned} · fallada` : 'Fallada';
    } else if (/convertid|acertad|made|\bok\b/.test(raw) || /\[palos:ok\]/i.test(String(desc || ''))) {
      cleaned = cleaned ? `${cleaned} · acertada` : 'Acertada';
    }
  }

  return cleaned;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function IconTry({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <ellipse cx="12" cy="12" rx="10" ry="6" />
      <line x1="8" y1="9" x2="8" y2="15" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
      <line x1="16" y1="9" x2="16" y2="15" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
    </svg>
  );
}

function IconGoal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function IconConversion({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 18V6M18 18V6M6 6h12" />
      <circle cx="12" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

function IconPenalty({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function IconDropGoal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v10M9 7l3-3 3 3" />
      <circle cx="12" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}

function IconCardYellow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="5" y="3" width="14" height="18" rx="2" />
    </svg>
  );
}

function IconCardRed({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="5" y="3" width="14" height="18" rx="2" />
    </svg>
  );
}

function IconSubstitution({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 3l5 5-5 5M8 21l-5-5 5-5" />
      <path d="M21 8h-8M3 16h8" />
    </svg>
  );
}

function IconLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="20" x2="20" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <circle cx="12" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

function IconScrum({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="12" r="4" />
      <circle cx="15" cy="12" r="4" />
      <path d="M9 16v4M15 16v4" />
    </svg>
  );
}

function IconKick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 16c0-2 2-4 5-4h6c3 0 5 2 5 4v2H4z" fill="currentColor" />
      <path d="M9 12V8a3 3 0 013-3" />
    </svg>
  );
}

function IconTackle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3" />
      <circle cx="15" cy="8" r="3" />
      <path d="M7 12l-2 6M17 12l2 6M9 12l3 4 3-4" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconDefault({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function EventTypeIcon({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  if (t.includes('try')) return <IconTry className={className} />;
  if (t === 'goal' || t === 'own_goal' || t === 'point' || t === 'ace' || t === 'block_point') return <IconGoal className={className} />;
  if (t === 'touchdown' || t === 'run' || t === 'home_run') return <IconGoal className={className} />;
  if (t === 'conversion') return <IconConversion className={className} />;
  if ((t === 'penalty' || t === 'penalty_goal') && !t.includes('conceded') && !t.includes('won')) return <IconPenalty className={className} />;
  if (t === 'drop_goal') return <IconDropGoal className={className} />;
  if (t === 'field_goal') return <IconPenalty className={className} />;
  if (t.includes('yellow') || t === 'card_yellow') return <IconCardYellow className={className} />;
  if (t.includes('red') || t === 'card_red') return <IconCardRed className={className} />;
  if (t.includes('green') || t === 'green_card') return <IconCardYellow className={className} />;
  if (t.includes('subst')) return <IconSubstitution className={className} />;
  if (t.includes('line')) return <IconLine className={className} />;
  if (t.includes('scrum')) return <IconScrum className={className} />;
  if (t.includes('kick') || t === 'free_kick') return <IconKick className={className} />;
  if (t.includes('tackle')) return <IconTackle className={className} />;
  if (t.includes('match_') || t.includes('period') || t.includes('timeout')) return <IconClock className={className} />;
  return <IconDefault className={className} />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MatchTimeline({ events, homeTeam, awayTeam, sportId }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const definitionMap = useMemo(
    () => buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions(String(sportId || 'rugby'))),
    [sportId],
  );

  /* ---- Cálculo de marcadores en orden cronológico ---- */
  const scoreMap = useMemo(() => {
    const map = new Map<string, { home: number; away: number; points: number }>();
    const sorted = [...events].sort((a, b) => a.minute - b.minute || eventKey(a).localeCompare(eventKey(b)));
    let home = 0;
    let away = 0;
    for (const evt of sorted) {
      const pts = getEventPoints(evt, definitionMap);
      if (pts > 0 && evt.team) {
        if (evt.team === 'home') home += pts;
        else away += pts;
      }
      map.set(eventKey(evt), { home, away, points: pts });
    }
    return map;
  }, [definitionMap, events]);

  /* ---- Filtrado ---- */
  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return events;
    return events.filter((evt) => getEventCategories(evt.type).includes(activeFilter));
  }, [events, activeFilter]);

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

  /* ---- Agrupación por minuto (descendente) ---- */
  const minuteGroups = useMemo(() => {
    const map = new Map<number, { minute: number; home: TimelineEvent[]; away: TimelineEvent[]; neutral: TimelineEvent[] }>();
    for (const evt of filteredEvents) {
      const minute = evt.minute;
      if (!map.has(minute)) {
        map.set(minute, { minute, home: [], away: [], neutral: [] });
      }
      const g = map.get(minute)!;
      if (evt.team === 'home') g.home.push(evt);
      else if (evt.team === 'away') g.away.push(evt);
      else g.neutral.push(evt);
    }
    return Array.from(map.values()).sort((a, b) => b.minute - a.minute);
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
              <div key={group.minute} className={styles.minuteGroup}>
                <div className={styles.minuteBadge}>{group.minute}&apos;</div>

                {/* Home events */}
                {group.home.length > 0 && (
                  <div className={`${styles.eventsCol} ${styles.eventsColHome}`}>
                    {group.home.map((evt, idx) => (
                      <EventCard key={`${eventKey(evt)}-h${idx}`} evt={evt} scoreMap={scoreMap} homeName={homeTeam.name} awayName={awayTeam.name} />
                    ))}
                  </div>
                )}

                {/* Away events */}
                {group.away.length > 0 && (
                  <div className={`${styles.eventsCol} ${styles.eventsColAway}`}>
                    {group.away.map((evt, idx) => (
                      <EventCard key={`${eventKey(evt)}-a${idx}`} evt={evt} scoreMap={scoreMap} homeName={homeTeam.name} awayName={awayTeam.name} />
                    ))}
                  </div>
                )}

                {/* Neutral events (span full width) */}
                {group.neutral.length > 0 && (
                  <div className={`${styles.eventsCol} ${styles.eventsColNeutral}`}>
                    {group.neutral.map((evt, idx) => (
                      <EventCard key={`${eventKey(evt)}-n${idx}`} evt={evt} scoreMap={scoreMap} homeName={homeTeam.name} awayName={awayTeam.name} />
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

function EventCard({
  evt,
  scoreMap,
  homeName,
  awayName,
}: {
  evt: TimelineEvent;
  scoreMap: Map<string, { home: number; away: number; points: number }>;
  homeName: string;
  awayName: string;
}) {
  const score = scoreMap.get(eventKey(evt));
  const color = EVENT_COLORS[evt.type.toLowerCase()] || EVENT_COLORS.default;
  const label = labelForType(evt.type);
  const detail = cleanDescription(evt.description, evt.type);
  const isScoreEvent = (score?.points ?? 0) > 0;
  const isSubstitution = evt.type.toLowerCase().includes('subst');
  const incomingPlayer = evt.subPlayer || parseSubstitutionIncomingPlayer(evt.description);
  const incomingPlayerId = evt.subPlayer ? evt.subPlayerId : null;

  const isClockEvent = ['match_start', 'match_half', 'match_end', 'start_period', 'end_period', 'timeout'].includes(evt.type.toLowerCase());
  const hasRealPlayer = Boolean(evt.player) && evt.player !== 'Jugador';
  const playerName = evt.player || 'Jugador';
  const playerLink = evt.playerId ? (
    <Link href={`/players/${evt.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      {playerName}
    </Link>
  ) : (
    playerName
  );

  const teamLabel = evt.team === 'home' ? homeName : evt.team === 'away' ? awayName : '';

  return (
    <div className={styles.eventCard}>
      <div className={styles.eventCardAccent} style={{ background: color }} />

      {isSubstitution ? (
        <>
          <div className={styles.eventPlayerName}>
            Sale: <span className={styles.subOut}>{playerLink}</span>
          </div>
          <div className={styles.eventTypeRow}>
            <EventTypeIcon type={evt.type} className={styles.eventIconSvg} />
            <span style={{ color }}>{label}</span>
          </div>
          {incomingPlayer && (
            <div className={styles.eventSubDetail}>
              Entra:{' '}
              {incomingPlayerId ? (
                <Link href={`/players/${incomingPlayerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <span className={styles.subIn}>{incomingPlayer}</span>
                </Link>
              ) : (
                <span className={styles.subIn}>{incomingPlayer}</span>
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
              Marcador {score.home}–{score.away}
            </div>
          )}
        </>
      )}
    </div>
  );
}
