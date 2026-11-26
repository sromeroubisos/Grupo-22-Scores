'use client';

import type { CSSProperties } from 'react';
import {
  clockText,
  kickoffParts,
  teamCards,
  type TeamCards,
  plateFor,
  type OverlayClock,
  type OverlayEvent,
  type OverlayMatch,
  type OverlayPlate,
  type OverlaySide,
  type OverlayTeam,
} from '@/lib/overlay/matchOverlayModel';
import type { OverlayConfig } from '../_lib/config';
import OverlayStage from './OverlayStage';
import { Crest, G22Card } from './G22Card';
import styles from './g22.module.css';

type ShownTeam = OverlayTeam & { short: string; color: string };

/** Lo que suma en el resumen de anotadores: tries, penales y drops (las conversiones van implícitas). */
const SUMMARY_TYPES = new Set(['try', 'penalty_try', 'penalty_goal', 'penalty', 'drop_goal', 'goal', 'touchdown', 'field_goal']);
const SUMMARY_LABEL: Record<string, string> = {
  try: 'Try', penalty_try: 'Try penal', penalty_goal: 'Penal', penalty: 'Penal', drop_goal: 'Drop',
  goal: 'Gol', touchdown: 'TD', field_goal: 'FG',
};

function summaryFor(events: OverlayEvent[], side: OverlaySide) {
  return events
    .filter((event) => event.team === side && SUMMARY_TYPES.has(event.type) && plateFor(event, { substitutions: false }))
    .sort((a, b) => a.order - b.order)
    .slice(-5);
}

function lastName(name: string | null) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
}

/**
 * La tarjeta de un partido con la marca G22: escudos grandes, marcador en
 * Dharma Gothic, estado (hora, EN VIVO con reloj, FINAL), los anotadores de
 * cada lado y, cuando entra un try o una tarjeta, la placa adentro de la misma
 * tarjeta.
 */
export default function MatchCard({
  match,
  home,
  away,
  clock,
  bump,
  plate,
  plateLeaving,
  config,
  now,
}: {
  match: OverlayMatch;
  home: ShownTeam;
  away: ShownTeam;
  clock: OverlayClock;
  bump: Record<OverlaySide, number>;
  plate: OverlayPlate | null;
  plateLeaving: boolean;
  config: OverlayConfig;
  /** El reloj de pantalla de MatchOverlay: con él corren los sin-bin. */
  now: number;
}) {
  const hasScore = home.score !== null && away.score !== null;
  const winner = match.phase === 'final' && hasScore && home.score !== away.score
    ? ((home.score ?? 0) > (away.score ?? 0) ? 'home' : 'away')
    : null;
  const kickoff = kickoffParts(match.dateTime);
  const homeSummary = summaryFor(match.events, 'home');
  const awaySummary = summaryFor(match.events, 'away');
  const plateTeam = plate?.team === 'home' ? home : plate?.team === 'away' ? away : null;
  const cards = config.showCards ? teamCards(match, now) : null;
  const time = clockText(clock, config.clockMode);

  // A qué parte del torneo pertenece (fase, zona, fecha) y, en la previa, el día.
  const subtitle = [match.context ?? match.round, match.phase === 'scheduled' ? kickoff.day : null].filter(Boolean).join(' · ') || null;

  return (
    <OverlayStage config={config} ready>
      <G22Card
        title={config.title ?? match.tournament?.name ?? 'Partido'}
        subtitle={subtitle}
        logo={match.tournament?.logo ?? null}
        width={860}
        footer={(
          <>
            <span>{match.phase === 'live' ? 'Resultado en vivo' : match.phase === 'final' ? 'Resultado final' : 'Próximo partido'}</span>
            <span>g22scores.com</span>
          </>
        )}
      >
        <div className={styles.matchCard}>
          <BigTeam team={home} lost={winner === 'away'} cards={cards?.home} />
          <div className={styles.matchCenter}>
            {hasScore ? (
              <div className={styles.matchScore}>
                <span key={`h${bump.home}`} className={bump.home ? styles.bump : undefined} data-win={winner === 'home' ? '' : undefined}>
                  {home.score}
                </span>
                <span className={styles.rowDash}>-</span>
                <span key={`a${bump.away}`} className={bump.away ? styles.bump : undefined} data-win={winner === 'away' ? '' : undefined}>
                  {away.score}
                </span>
              </div>
            ) : (
              <div className={styles.matchTime}>{kickoff.time}</div>
            )}
            {config.showClock ? (
              <span className={styles.pill} data-phase={match.phase} data-expired={clock.expired ? '' : undefined}>
                {time ? <span className={styles.pillClock}>{time}</span> : match.phase === 'scheduled' ? 'Previa' : clock.label}
              </span>
            ) : null}
          </div>
          <BigTeam team={away} lost={winner === 'home'} cards={cards?.away} />
        </div>

        {homeSummary.length || awaySummary.length ? (
          <div className={styles.scorers}>
            <ul>{homeSummary.map((event) => <SummaryItem key={event.id} event={event} />)}</ul>
            <ul>{awaySummary.map((event) => <SummaryItem key={event.id} event={event} />)}</ul>
          </div>
        ) : null}

        {plate ? (
          <div
            key={plate.key}
            className={styles.plate}
            data-tone={plate.tone}
            data-leaving={plateLeaving ? '' : undefined}
            style={plate.tone === 'score' && plateTeam ? ({ '--ov-plate': plateTeam.color } as CSSProperties) : undefined}
          >
            {plateTeam ? <Crest src={plateTeam.logo} name={plateTeam.name} /> : null}
            <span className={styles.plateTitle}>{plate.title}</span>
            <span className={styles.platePlayer}>{plate.player ?? plateTeam?.short ?? ''}</span>
            {plate.minute !== null ? <span className={styles.plateMinute}>{plate.minute}&apos;</span> : null}
          </div>
        ) : null}
      </G22Card>
    </OverlayStage>
  );
}

function BigTeam({ team, lost, cards }: { team: ShownTeam; lost: boolean; cards?: TeamCards }) {
  return (
    <div className={styles.matchTeam} data-lost={lost ? '' : undefined}>
      <Crest src={team.logo} name={team.name} />
      <span className={styles.matchTeamName}>{team.short}</span>
      {cards && (cards.yellow || cards.red) ? (
        <span className={styles.cards}>
          {Array.from({ length: Math.min(cards.yellow, 4) }, (_, i) => <span key={`y${i}`} className={styles.cardPip} data-tone="yellow" />)}
          {Array.from({ length: Math.min(cards.red, 3) }, (_, i) => <span key={`r${i}`} className={styles.cardPip} data-tone="red" />)}
          {cards.sinBins.map((remaining, i) => (
            <span key={`s${i}`} className={styles.sinbin}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function SummaryItem({ event }: { event: OverlayEvent }) {
  return (
    <li>
      <b>{lastName(event.player) || SUMMARY_LABEL[event.type]}</b>{' '}
      {event.player ? `${SUMMARY_LABEL[event.type] ?? ''} ` : ''}
      {event.minute !== null ? `${event.minute}'` : ''}
    </li>
  );
}
