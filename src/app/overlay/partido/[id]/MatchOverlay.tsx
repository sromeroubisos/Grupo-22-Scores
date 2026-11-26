'use client';

/* eslint-disable @next/next/no-img-element -- escudos chicos y de la misma
   origen; next/image en un navegador embebido de OBS no suma nada y agrega un
   pedido más por escudo. */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  newPlates,
  overlayClock,
  toOverlayMatch,
  type OverlayMatch,
  type OverlayPlate,
  type OverlaySide,
  clockText,
  teamCards,
  type OverlayClock,
  type TeamCards,
} from '@/lib/overlay/matchOverlayModel';
import { manualToOverlayMatch, readManualState } from '@/lib/overlay/manualOverlay';
import styles from './overlay.module.css';

import type { OverlayConfig } from '../../_lib/config';
import MatchCard from '../../_components/MatchCard';
import { fontVars } from '../../_lib/fonts';

export type { OverlayConfig };

/**
 * Cada cuánto se relee el partido. En vivo, 3 s: el planillero carga el try
 * unos segundos después de que pasa, así que la placa sale casi a la par del
 * replay. La previa se mira seguido para no perder el arranque; el final, casi
 * nada (solo por si corrigen el resultado).
 */
const POLL_MS = { live: 3_000, scheduled: 5_000, other: 10_000, final: 30_000, error: 5_000 } as const;
const PLATE_VISIBLE_MS = 6_500;
const PLATE_EXIT_MS = 450;
const DEFAULT_HOME_COLOR = '#00a365';
const DEFAULT_AWAY_COLOR = '#f2f2f2';

/** Partido de muestra para ubicar el gráfico sin un partido real (`?prueba=1`). */
function demoMatch(): OverlayMatch {
  return {
    id: 'demo',
    phase: 'live',
    rawStatus: 'live',
    sportRef: 'rugby',
    clock: {
      // 79:45 del segundo tiempo: a los 15 segundos se cumple el tiempo y el
      // reloj se pone en rojo — la muestra enseña ese momento.
      period_started_at: new Date(Date.now() - (39 * 60 + 45) * 1000).toISOString(),
      accumulated_seconds: 40 * 60,
      is_running: true,
      period: '2T',
      updated_at: null,
      minute: 0,
      seconds: 0,
      running: true,
      syncedAt: null,
    },
    legacyClock: null,
    providerTime: null,
    dateTime: null,
    tournament: { name: 'Torneo de prueba', logo: null },
    round: 'Fecha 1',
    context: 'Copa de Oro · Zona A · Fecha 1',
    home: { name: 'Club Local', short: 'Club Local', logo: null, color: null, score: 24 },
    away: { name: 'Club Visitante', short: 'Club Visitante', logo: null, color: null, score: 17 },
    events: [
      { id: 'demo-y1', type: 'yellow_card', team: 'home', player: 'Juan Pérez', minute: 22, detail: '', order: 1 },
      { id: 'demo-r1', type: 'red_card', team: 'away', player: 'Martín Gómez', minute: 31, detail: '', order: 2 },
      { id: 'demo-y2', type: 'yellow_card', team: 'away', player: 'Tomás Díaz', minute: 72, detail: '', order: 3 },
    ],
  };
}

/** Cuánto dura el efecto del tanto sobre el marcador (después se actualiza el resultado). */
const FX_MS = 2_800;

type ScoreFx = { key: number; side: OverlaySide; title: string; player: string | null; points: number };

const DEMO_EVENTS: Array<{ type: string; team: OverlaySide; player: string | null; points: number }> = [
  { type: 'try', team: 'home', player: 'Juan Pérez', points: 5 },
  { type: 'conversion', team: 'home', player: 'Juan Pérez', points: 2 },
  { type: 'penalty_goal', team: 'away', player: null, points: 3 },
  { type: 'yellow_card', team: 'home', player: 'Lucas Romero', points: 0 },
];

type Failure = 'not-found' | 'unreachable' | null;

export default function MatchOverlay({
  matchId,
  config,
  manual = false,
}: {
  matchId: string;
  config: OverlayConfig;
  /** El ID es de un marcador MANUAL (`/overlay/manual`): lo maneja el productor desde su panel. */
  manual?: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  // Fase, zona y fecha del partido: el GET del partido no trae sus nombres, el
  // feed de overlays sí. Se pide una vez (no cambian durante el partido).
  const [context, setContext] = useState<string | null>(null);
  useEffect(() => {
    if (manual || config.demo || !/^[0-9a-f-]{36}$/i.test(matchId)) return undefined;
    let cancelled = false;
    fetch(`/api/overlay?tipo=partidos&ids=${encodeURIComponent(matchId)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const label = body?.matches?.[0]?.context_label;
        if (!cancelled && typeof label === 'string' && label) setContext(label);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [matchId, manual, config.demo]);
  const [match, setMatch] = useState<OverlayMatch | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [now, setNow] = useState(() => Date.now());
  const [plate, setPlate] = useState<OverlayPlate | null>(null);
  const [plateLeaving, setPlateLeaving] = useState(false);
  const [bump, setBump] = useState<Record<OverlaySide, number>>({ home: 0, away: 0 });

  const queueRef = useRef<OverlayPlate[]>([]);
  // El tanto sobre el marcador: se pinta del color del club, dice TRY y quién,
  // titila el +N y recién cuando el +N "cae" se actualiza el resultado.
  const [fx, setFx] = useState<ScoreFx | null>(null);
  const [held, setHeld] = useState<Record<OverlaySide, number | null> | null>(null);
  const fxTimers = useRef<number[]>([]);
  const matchRef = useRef<OverlayMatch | null>(null);
  const usesFx = config.style !== 'tarjeta';
  const showingRef = useRef(false);
  const seenRef = useRef<Set<string> | null>(null);
  const prevScoreRef = useRef<Record<OverlaySide, number | null> | null>(null);
  const hasMatchRef = useRef(false);
  const plateTimersRef = useRef<number[]>([]);

  /* ─── cola de placas: una por vez, cada una su tiempo al aire ─── */
  const pump = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    setPlateLeaving(false);
    setPlate(next);
    plateTimersRef.current.push(
      window.setTimeout(() => setPlateLeaving(true), PLATE_VISIBLE_MS),
      window.setTimeout(() => {
        setPlate(null);
        setPlateLeaving(false);
        showingRef.current = false;
        pump();
      }, PLATE_VISIBLE_MS + PLATE_EXIT_MS),
    );
  }, []);

  useEffect(() => () => {
    for (const timer of plateTimersRef.current) window.clearTimeout(timer);
  }, []);

  const enqueue = useCallback((plates: OverlayPlate[]) => {
    if (!plates.length) return;
    queueRef.current.push(...plates);
    // Una cola larga al aire es peor que perder una placa: quedan las 3 últimas.
    if (queueRef.current.length > 3) queueRef.current = queueRef.current.slice(-3);
    pump();
  }, [pump]);

  const ingest = useCallback((next: OverlayMatch) => {
    // La primera lectura no anuncia nada: el overlay puede abrirse a mitad de
    // partido y no tiene que recitar todo lo que ya pasó.
    let plates: OverlayPlate[] = [];
    if (!seenRef.current) {
      seenRef.current = new Set(next.events.map((event) => event.id));
    } else {
      plates = newPlates(next.events, seenRef.current, { substitutions: config.substitutions });
      for (const event of next.events) seenRef.current.add(event.id);
      // En los marcadores el tanto se anuncia SOBRE el marcador (el efecto);
      // abajo quedan solo las tarjetas y los cambios.
      if (config.showPlates) enqueue(usesFx ? plates.filter((plate) => plate.tone !== 'score') : plates);
    }

    const prev = prevScoreRef.current;
    if (prev) {
      const sides = (['home', 'away'] as const).filter((side) => {
        const before = prev[side];
        const after = next[side].score;
        return before !== null && after !== null && after > before;
      });
      if (sides.length && usesFx && config.showPlates) {
        const side = sides[0];
        const plate = [...plates].reverse().find((item) => item.team === side && item.tone === 'score');
        const points = (next[side].score ?? 0) - (prev[side] ?? 0);
        for (const timer of fxTimers.current) window.clearTimeout(timer);
        setHeld({ home: prev.home, away: prev.away });
        setFx({ key: Date.now(), side, title: plate?.title ?? 'PUNTOS', player: plate?.player ?? null, points });
        fxTimers.current = [window.setTimeout(() => {
          setFx(null);
          setHeld(null);
          setBump((current) => ({
            home: sides.includes('home') ? current.home + 1 : current.home,
            away: sides.includes('away') ? current.away + 1 : current.away,
          }));
        }, FX_MS)];
      } else if (sides.length) {
        setBump((current) => ({
          home: sides.includes('home') ? current.home + 1 : current.home,
          away: sides.includes('away') ? current.away + 1 : current.away,
        }));
      }
    }
    prevScoreRef.current = { home: next.home.score, away: next.away.score };
    hasMatchRef.current = true;
    matchRef.current = next;
    setMatch(next);
  }, [config.showPlates, config.substitutions, enqueue, usesFx]);

  useEffect(() => () => {
    for (const timer of fxTimers.current) window.clearTimeout(timer);
  }, []);

  /* ─── lectura periódica ─── */
  useEffect(() => {
    if (config.demo) {
      const demo = demoMatch();
      hasMatchRef.current = true;
      seenRef.current = new Set(demo.events.map((event) => event.id));
      prevScoreRef.current = { home: demo.home.score, away: demo.away.score };
      matchRef.current = demo;
      setMatch(demo);
      return undefined;
    }
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const tick = async () => {
      let wait: number = POLL_MS.error;
      controller = new AbortController();
      const abortTimer = window.setTimeout(() => controller?.abort(), 15_000);
      try {
        // El parámetro saltea el caché del CDN (s-maxage=5 del vivo): para un
        // gráfico al aire cada segundo de atraso se nota.
        const url = manual
          ? `/api/overlay/control/${encodeURIComponent(matchId)}`
          : `/api/matches/${encodeURIComponent(matchId)}?overlay=${Date.now()}`;
        const requestedAt = Date.now();
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (response.status === 404) {
          // Un 404 suelto con el partido ya en pantalla no lo borra: se sigue
          // mostrando lo último bueno y se reintenta.
          if (!hasMatchRef.current) setFailure('not-found');
          wait = POLL_MS.scheduled;
        } else if (response.ok && manual) {
          // Marcador manual: se relee cada segundo (lo maneja una persona en
          // vivo) y el reloj se corrige con la hora del servidor.
          const body = await response.json();
          const state = readManualState('marcador', body.state);
          const serverNow = Date.parse(body.serverNow);
          const offset = Number.isFinite(serverNow) ? serverNow - (requestedAt + Date.now()) / 2 : 0;
          ingest(manualToOverlayMatch(matchId, state, offset));
          setHidden(!state.visible);
          setFailure(null);
          wait = 1_000;
        } else if (response.ok) {
          const parsed = toOverlayMatch(await response.json());
          if (parsed) {
            ingest(parsed);
            setFailure(null);
            wait = POLL_MS[parsed.phase];
          } else if (!hasMatchRef.current) {
            setFailure('not-found');
          }
        } else if (!hasMatchRef.current) {
          setFailure('unreachable');
        }
      } catch {
        if (!cancelled && !hasMatchRef.current) setFailure('unreachable');
      } finally {
        window.clearTimeout(abortTimer);
      }
      if (!cancelled) timer = window.setTimeout(tick, wait);
    };

    void tick();
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [matchId, config.demo, ingest, manual]);

  /* ─── modo prueba: anota de verdad (try, conversión, penal, amarilla) para ver el efecto ─── */
  useEffect(() => {
    if (!config.demo || !config.showPlates) return undefined;
    let index = 0;
    const fire = () => {
      const current = matchRef.current;
      if (!current) return;
      const sample = DEMO_EVENTS[index % DEMO_EVENTS.length];
      index += 1;
      const side = sample.team;
      ingest({
        ...current,
        [side]: { ...current[side], score: (current[side].score ?? 0) + sample.points },
        events: [...current.events, {
          id: `demo-${index}`, type: sample.type, team: side, player: sample.player,
          minute: 70 + index, detail: '', order: current.events.length,
        }],
      });
    };
    const firstShot = window.setTimeout(fire, 2_000);
    const interval = window.setInterval(fire, 8_000);
    return () => {
      window.clearTimeout(firstShot);
      window.clearInterval(interval);
    };
  }, [config.demo, config.showPlates, ingest]);

  /* ─── reloj local: corre entre lecturas ─── */
  const live = match?.phase === 'live';
  useEffect(() => {
    if (!live) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [live]);

  // El panel lo ocultó: no se dibuja nada (al volver, entra animado de nuevo).
  if (hidden) return null;

  if (!match) {
    if (!failure) return null;
    // Solo lo ve quien arma la escena: si el ID está mal, que se entere ahí y
    // no cuando ya salió al aire un recuadro vacío.
    return (
      <div className={styles.setupHint} role="status">
        {failure === 'not-found'
          ? `G22 · No se encontró el partido «${matchId}» o no es público.`
          : 'G22 · Sin conexión con g22scores. Reintentando…'}
      </div>
    );
  }

  // Sobre chroma verde, un acento verde se lo come el keyer: el local por
  // defecto pasa a celeste (y el CSS cambia el verde de marca a blanco).
  const chromaGreen = config.background === '#00b140';
  const home = {
    ...match.home,
    score: held ? held.home : match.home.score,
    short: (config.homeName ?? match.home.short).toUpperCase(),
    color: config.homeColor ?? match.home.color ?? (chromaGreen ? '#38bdf8' : DEFAULT_HOME_COLOR),
  };
  const away = {
    ...match.away,
    score: held ? held.away : match.away.score,
    short: (config.awayName ?? match.away.short).toUpperCase(),
    color: config.awayColor ?? match.away.color ?? DEFAULT_AWAY_COLOR,
  };
  const shown = context && !match.context ? { ...match, context } : match;
  const clock = overlayClock(match, now);
  // La versión por defecto: la tarjeta G22 (escudos grandes, marcador,
  // anotadores y la placa del último evento adentro).
  if (config.style === 'tarjeta') {
    return (
      <MatchCard
        match={shown}
        home={home}
        away={away}
        clock={clock}
        bump={bump}
        plate={plate}
        plateLeaving={plateLeaving}
        config={config}
        now={now}
      />
    );
  }

  const vertical = config.position.startsWith('abajo') ? 'bottom' : config.position.startsWith('arriba') ? 'top' : 'middle';
  const horizontal = config.position.endsWith('izq') ? 'left' : config.position.endsWith('der') ? 'right' : 'center';

  const stageStyle = {
    '--ov-scale': config.scale,
    '--ov-margin': `${config.margin}px`,
    '--ov-home': home.color,
    '--ov-away': away.color,
    '--ov-home-ink': inkOn(home.color),
    '--ov-away-ink': inkOn(away.color),
    ...fontVars(config.fonts),
  } as CSSProperties;

  const tournamentLine = config.showTournament && (match.tournament || shown.context)
    ? [match.tournament?.name, shown.context ?? match.round].filter(Boolean).join(' · ')
    : null;

  const plateTeam = plate?.team === 'home' ? home : plate?.team === 'away' ? away : null;
  const cards = config.showCards ? teamCards(match, now) : null;
  const time = clockText(clock, config.clockMode);
  const clockProps = { clock, time, phase: match.phase };

  return (
    <div className={styles.stage} style={stageStyle} data-chroma={chromaGreen ? 'verde' : undefined}>
      <div className={styles.anchor} data-v={vertical} data-h={horizontal}>
        {tournamentLine ? (
          <div className={styles.tournament}>
            {match.tournament?.logo ? <img src={match.tournament.logo} alt="" className={styles.tournamentLogo} /> : null}
            <span>{tournamentLine}</span>
          </div>
        ) : null}

        <div className={styles.board} data-fx={fx ? fx.side : undefined}>
        {fx ? <ScoreFxLayer fx={fx} color={(fx.side === 'home' ? home : away).color} /> : null}
        {config.style === 'barra' ? (
          <div className={styles.bar} data-phase={match.phase}>
            <TeamCell team={home} side="home" wide cards={cards?.home} />
            <div className={styles.barScore}>
              <Score value={home.score} bump={bump.home} />
              <span className={styles.barDash}>–</span>
              <Score value={away.score} bump={bump.away} />
            </div>
            <TeamCell team={away} side="away" wide cards={cards?.away} />
            {config.showClock ? <ClockCell {...clockProps} /> : null}
          </div>
        ) : config.style === 'franja' ? (
          <div className={styles.franja} data-phase={match.phase}>
            <div className={styles.fTeam} data-side="home">
              <Crest team={home} />
              <span className={styles.fName}>{home.short}</span>
              <Pips cards={cards?.home} />
            </div>
            <div className={styles.fScore}><Score value={home.score} bump={bump.home} bare /></div>
            {config.showClock ? (
              <div className={styles.fCenter} data-expired={clock.expired ? '' : undefined}>
                {time ? <span className={styles.fTime}>{time}</span> : <span className={styles.fLabel}>{clock.label}</span>}
              </div>
            ) : <div className={styles.fDivider} />}
            <div className={styles.fScore}><Score value={away.score} bump={bump.away} bare /></div>
            <div className={styles.fTeam} data-side="away">
              <Pips cards={cards?.away} />
              <span className={styles.fName}>{away.short}</span>
              <Crest team={away} />
            </div>
          </div>
        ) : config.style === 'compacto' ? (
          <div className={styles.compact} data-phase={match.phase}>
            <span className={styles.cDot} style={{ background: home.color }} aria-hidden="true" />
            <span className={styles.cName}>{home.short}</span>
            <Pips cards={cards?.home} />
            <span className={styles.cScore}>
              <Score value={home.score} bump={bump.home} bare />
              <span className={styles.cDash}>-</span>
              <Score value={away.score} bump={bump.away} bare />
            </span>
            <Pips cards={cards?.away} />
            <span className={styles.cName}>{away.short}</span>
            <span className={styles.cDot} style={{ background: away.color }} aria-hidden="true" />
            {config.showClock ? (
              <span className={styles.cClock} data-expired={clock.expired ? '' : undefined}>{time ?? clock.label}</span>
            ) : null}
          </div>
        ) : config.style === 'escudos' ? (
          <div className={styles.crests} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              const crest = (
                <span className={styles.crestTeam} data-side={side} key={side}>
                  <span className={styles.crestBig}><Crest team={team} /></span>
                  <span className={styles.crestName}>{team.short}</span>
                  <Pips cards={cards?.[side]} />
                </span>
              );
              // El centro (resultado y reloj) va entre los dos escudos.
              return side === 'home' ? [crest, (
                <span className={styles.crestCenter} key="center">
                  <span className={styles.crestScores}>
                    <span className={styles.crestScore}><Score value={home.score} bump={bump.home} bare /></span>
                    <span className={styles.crestDash}>-</span>
                    <span className={styles.crestScore}><Score value={away.score} bump={bump.away} bare /></span>
                  </span>
                  {config.showClock ? (
                    <span className={styles.crestClock} data-expired={clock.expired ? '' : undefined}>{time ?? clock.label}</span>
                  ) : null}
                </span>
              )] : [crest];
            })}
          </div>
        ) : config.style === 'tira' ? (
          <div className={styles.strip} data-phase={match.phase}>
            <span className={styles.stripTeam} data-side="home"><span className={styles.stripName}>{home.short}</span><Pips cards={cards?.home} /></span>
            <span className={styles.stripScore}><Score value={home.score} bump={bump.home} bare /></span>
            {config.showClock ? (
              <span className={styles.stripClock} data-expired={clock.expired ? '' : undefined}>{time ?? clock.label}</span>
            ) : <span className={styles.stripSep} />}
            <span className={styles.stripScore}><Score value={away.score} bump={bump.away} bare /></span>
            <span className={styles.stripTeam} data-side="away"><Pips cards={cards?.away} /><span className={styles.stripName}>{away.short}</span></span>
          </div>
        ) : config.style === 'bloques' ? (
          <div className={styles.blocks} data-phase={match.phase}>
            <div className={styles.blockRow}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                return (
                  <div className={styles.block} data-side={side} key={side}>
                    <span className={styles.blockBand} aria-hidden="true" />
                    <Crest team={team} />
                    <span className={styles.blockScore}><Score value={team.score} bump={bump[side]} bare /></span>
                    <span className={styles.blockName}>{team.short}</span>
                    <Pips cards={cards?.[side]} />
                  </div>
                );
              })}
            </div>
            {config.showClock ? (
              <div className={styles.blockClock} data-expired={clock.expired ? '' : undefined}>
                {time ? <b>{time}</b> : <span>{clock.label}</span>}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.bug} data-phase={match.phase}>
            <div className={styles.rows}>
              <div className={styles.row}>
                <TeamCell team={home} side="home" cards={cards?.home} />
                <Score value={home.score} bump={bump.home} />
              </div>
              <div className={styles.row}>
                <TeamCell team={away} side="away" cards={cards?.away} />
                <Score value={away.score} bump={bump.away} />
              </div>
            </div>
            {config.showClock ? <ClockCell {...clockProps} /> : null}
          </div>
        )}
        </div>

        {cards ? <SinBins cards={cards} home={home} away={away} /> : null}

        <div className={styles.plateSlot}>
          {plate ? (
            <div
              key={plate.key}
              className={styles.plate}
              data-tone={plate.tone}
              data-leaving={plateLeaving ? '' : undefined}
              style={{ '--ov-team': plateTeam?.color ?? DEFAULT_HOME_COLOR } as CSSProperties}
            >
              <span className={styles.plateAccent} aria-hidden="true" />
              {plateTeam?.logo ? <img src={plateTeam.logo} alt="" className={styles.plateLogo} /> : null}
              <span className={styles.plateTitle}>{plate.title}</span>
              {plate.player ? <span className={styles.platePlayer}>{plate.player}</span> : null}
              {plateTeam ? <span className={styles.plateTeam}>{plateTeam.short}</span> : null}
              {plate.minute !== null ? <span className={styles.plateMinute}>{plate.minute}&apos;</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Texto oscuro sobre colores claros, blanco sobre oscuros: el nombre siempre se lee. */
function inkOn(hex: string): string {
  const raw = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#04110b' : '#ffffff';
}

type ShownTeam = { short: string; name: string; logo: string | null; color: string };

function Crest({ team }: { team: ShownTeam }) {
  return team.logo
    ? <img src={team.logo} alt="" className={styles.teamLogo} />
    : <span className={styles.teamLogoFallback} aria-hidden="true">{team.short.slice(0, 1)}</span>;
}

/** Tarjetas como en la planilla: un rectángulo amarillo o rojo por tarjeta (hasta 3, después el número). */
function Pips({ cards }: { cards?: TeamCards }) {
  // Siempre ocupa su lugar (vacío si no hay tarjetas): así los dos lados miden
  // lo mismo y los números quedan alineados.
  if (!cards || (!cards.yellow && !cards.red)) return <span className={styles.pips} aria-hidden="true" />;
  const pips = (count: number, tone: 'yellow' | 'red') => count <= 3
    ? Array.from({ length: count }, (_, i) => <span key={`${tone}${i}`} className={styles.pip} data-tone={tone} />)
    : [<span key={tone} className={styles.pip} data-tone={tone} data-count="">{count}</span>];
  return (
    <span className={styles.pips} aria-label={`${cards.yellow} amarillas, ${cards.red} rojas`}>
      {pips(cards.yellow, 'yellow')}
      {pips(cards.red, 'red')}
    </span>
  );
}

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Los sin-bin que siguen corriendo, como un módulo que se despliega debajo del
 * marcador: la sigla del equipo, la amarilla y lo que le falta para volver.
 */
function SinBins({ cards, home, away }: { cards: Record<OverlaySide, TeamCards>; home: ShownTeam; away: ShownTeam }) {
  const items = (['home', 'away'] as const).flatMap((side) =>
    cards[side].sinBins.map((remaining, index) => ({ side, remaining, key: `${side}-${index}` })));
  if (!items.length) return null;
  return (
    <div className={styles.sinbins}>
      {items.map((item) => (
        <span className={styles.sinbin} key={item.key} style={{ '--ov-team': (item.side === 'home' ? home : away).color } as CSSProperties}>
          <span className={styles.sinbinTeam}>{(item.side === 'home' ? home : away).short}</span>
          <span className={styles.pip} data-tone="yellow" />
          <span className={styles.sinbinTime}>{mmss(item.remaining)}</span>
        </span>
      ))}
    </div>
  );
}

function TeamCell({
  team,
  side,
  wide = false,
  cards,
}: {
  team: ShownTeam;
  side: OverlaySide;
  wide?: boolean;
  cards?: TeamCards;
}) {
  return (
    <div className={styles.team} data-side={side} data-wide={wide ? '' : undefined}>
      <span className={styles.teamStrip} aria-hidden="true" />
      <Crest team={team} />
      <span className={styles.teamName}>{wide ? team.name.toUpperCase() : team.short}</span>
      <Pips cards={cards} />
    </div>
  );
}

function Score({ value, bump, bare = false }: { value: number | null; bump: number; bare?: boolean }) {
  const inner = (
    // La key reinicia la animación cada vez que el marcador sube.
    <span key={bump} className={bump > 0 ? styles.scoreBump : undefined}>
      {value === null ? '–' : value}
    </span>
  );
  return bare ? inner : <span className={styles.score}>{inner}</span>;
}

function ClockCell({ clock, time, phase }: { clock: OverlayClock; time: string | null; phase: OverlayMatch['phase'] }) {
  return (
    <div
      className={styles.clock}
      data-phase={phase}
      data-has-time={time ? '' : undefined}
      data-expired={clock.expired ? '' : undefined}
    >
      {/* Solo el tiempo: sin punto ni 1T/2T. Sin tiempo corriendo, el rótulo (FINAL, PREVIA). */}
      {time ? <span className={styles.clockTime}>{time}</span> : <span className={styles.clockLabel}>{clock.label}</span>}
    </div>
  );
}

/**
 * El tanto sobre el marcador: una franja del color del club barre el marcador,
 * dice el tipo (TRY, PENAL, GOL…) y quién lo hizo; el +N titila y después cae
 * hacia el resultado de ese lado, que se actualiza cuando el efecto termina.
 */
function ScoreFxLayer({ fx, color }: { fx: ScoreFx; color: string }) {
  return (
    <div
      className={styles.fx}
      data-side={fx.side}
      key={fx.key}
      style={{ '--fx-color': color, '--fx-ink': inkOn(color), '--fx-ms': `${FX_MS}ms` } as CSSProperties}
      role="status"
    >
      <span className={styles.fxText}>
        <b className={styles.fxTitle}>{fx.title}</b>
        {fx.player ? <span className={styles.fxPlayer}>{fx.player}</span> : null}
      </span>
      <span className={styles.fxPoints}>+{fx.points}</span>
    </div>
  );
}
