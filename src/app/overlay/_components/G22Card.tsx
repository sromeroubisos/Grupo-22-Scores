'use client';

/* eslint-disable @next/next/no-img-element -- escudos chicos por el proxy de la
   misma origen; next/image en el navegador embebido de OBS no suma nada. */

import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  kickoffParts,
  overlayClock,
  type OverlayMatch,
  type OverlayTeam,
} from '@/lib/overlay/matchOverlayModel';
import styles from './g22.module.css';

/**
 * La tarjeta con la marca de G22: encabezado con el wordmark, título en Dharma
 * Gothic, bajada en verde y el logo del torneo; cuerpo libre; pie opcional.
 * Es la misma pieza para un partido, una fecha, un playoff o un jugador.
 */
export function G22Card({
  title,
  subtitle,
  logo,
  width,
  children,
  footer,
  accent,
}: {
  title: string;
  subtitle?: string | null;
  logo?: string | null;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** Color del club/torneo para el filete de arriba. Por defecto, el verde G22. */
  accent?: string | null;
}) {
  const style = {
    ...(width ? { width: `${width}px` } : null),
    ...(accent ? { '--ov-accent': accent } : null),
  } as CSSProperties;
  return (
    <section className={styles.card} style={style}>
      <header className={styles.cardHead}>
        <img src="/header-logo.png" alt="G22 Scores" className={styles.wordmark} />
        <span className={styles.headRule} aria-hidden="true" />
        <div className={styles.headText}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {logo ? <Crest src={logo} name="" className={styles.headLogo} /> : null}
      </header>
      <div className={styles.cardBody}>{children}</div>
      {footer !== undefined ? <footer className={styles.cardFoot}>{footer}</footer> : null}
    </section>
  );
}

/** Escudo con respaldo: si la imagen no carga, la inicial en un círculo (nunca un ícono roto al aire). */
export function Crest({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className={`${styles.crestFallback} ${className ?? ''}`} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || '·'}
      </span>
    );
  }
  return <img src={src} alt="" className={`${styles.crest} ${className ?? ''}`} onError={() => setBroken(true)} />;
}

export function LiveDot() {
  return <span className={styles.liveDot} aria-hidden="true" />;
}

/** Qué dice la columna de estado de una fila: hora, EN VIVO con reloj, FINAL. */
export function StatusCell({ match, now }: { match: OverlayMatch; now: number }) {
  if (match.phase === 'live') {
    const clock = overlayClock(match, now);
    return (
      <div className={styles.status} data-phase="live" data-expired={clock.expired ? '' : undefined}>
        <span className={styles.statusTop}><LiveDot /> EN VIVO</span>
        <span className={styles.statusMain}>{clock.time ?? clock.label}</span>
      </div>
    );
  }
  if (match.phase === 'final') {
    return (
      <div className={styles.status} data-phase="final">
        <span className={styles.statusMain}>FINAL</span>
      </div>
    );
  }
  const kickoff = kickoffParts(match.dateTime);
  return (
    <div className={styles.status} data-phase={match.phase}>
      <span className={styles.statusTop}>{match.phase === 'other' ? match.rawStatus.toUpperCase() : kickoff.day}</span>
      <span className={styles.statusMain}>{kickoff.time}</span>
    </div>
  );
}

function winnerOf(match: OverlayMatch): 'home' | 'away' | null {
  if (match.phase !== 'final' || match.home.score === null || match.away.score === null) return null;
  if (match.home.score > match.away.score) return 'home';
  if (match.away.score > match.home.score) return 'away';
  return null;
}

function TeamSide({ team, side, lost }: { team: OverlayTeam; side: 'home' | 'away'; lost: boolean }) {
  return (
    <div className={styles.rowTeam} data-side={side} data-lost={lost ? '' : undefined}>
      <Crest src={team.logo} name={team.name} />
      <span className={styles.rowName}>{team.short}</span>
    </div>
  );
}

/** Una fila de lista: estado · local · marcador · visitante. */
export function MatchRow({ match, now, index = 0 }: { match: OverlayMatch; now: number; index?: number }) {
  const winner = winnerOf(match);
  const hasScore = match.home.score !== null && match.away.score !== null;
  return (
    <div
      className={styles.row}
      data-phase={match.phase}
      data-context={match.context ? '' : undefined}
      style={{ '--ov-i': index } as CSSProperties}
    >
      {match.context ? <span className={styles.rowContext}>{match.context}</span> : null}
      <StatusCell match={match} now={now} />
      <TeamSide team={match.home} side="home" lost={winner === 'away'} />
      <div className={styles.rowScore} data-empty={hasScore ? undefined : ''}>
        {hasScore ? (
          <>
            <span data-win={winner === 'home' ? '' : undefined}>{match.home.score}</span>
            <span className={styles.rowDash}>-</span>
            <span data-win={winner === 'away' ? '' : undefined}>{match.away.score}</span>
          </>
        ) : (
          <span className={styles.rowVs}>vs</span>
        )}
      </div>
      <TeamSide team={match.away} side="away" lost={winner === 'home'} />
    </div>
  );
}

/** Puntitos de página para las listas que rotan. */
export function PageDots({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null;
  return (
    <span className={styles.dots} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-on={i === active ? '' : undefined} />
      ))}
    </span>
  );
}

export function SetupHint({ children }: { children: ReactNode }) {
  return <div className={styles.setupHint} role="status">{children}</div>;
}
