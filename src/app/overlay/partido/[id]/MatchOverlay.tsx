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
import { shotFromFreshEvents, shotView, type ShotClock, type ShotView } from '@/lib/overlay/shotClock';
import { planRules } from '@/lib/overlay/overlayPlan';
import { teamLabels } from '@/lib/overlay/teamAcronym';
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
/** Pase entre partidos de un marcador manual: lo que sale y lo que entra (coincide con el CSS). */
const SWAP_OUT_MS = 380;
const SWAP_IN_MS = 760;
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
      // Tries de la muestra (3 a 2), para ver el contador de tries.
      { id: 'demo-t1', type: 'try', team: 'home', player: 'Juan Pérez', minute: 8, detail: '', order: 0 },
      { id: 'demo-t2', type: 'try', team: 'away', player: 'Martín Gómez', minute: 17, detail: '', order: 0 },
      { id: 'demo-t3', type: 'try', team: 'home', player: 'Lucas Romero', minute: 39, detail: '', order: 0 },
      { id: 'demo-t4', type: 'try', team: 'home', player: 'Juan Pérez', minute: 58, detail: '', order: 0 },
      { id: 'demo-t5', type: 'try', team: 'away', player: 'Tomás Díaz', minute: 66, detail: '', order: 0 },
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
  // Cuenta de la conversión en un partido de G22 (con la hora local). En el
  // manual la maneja el panel y viene con el estado.
  const [localShot, setLocalShot] = useState<ShotClock | null>(null);

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
  // Marcador manual con varios partidos: al pasar a otro, lo de adentro (escudos,
  // nombres, números) sale y entra de a poco y los colores se van mezclando.
  const [swap, setSwap] = useState<'out' | 'in' | null>(null);
  const gameRef = useRef<string | null>(null);
  const swapOutRef = useRef(false);
  const pendingRef = useRef<OverlayMatch | null>(null);
  const swapTimers = useRef<number[]>([]);

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
    const gameId = next.manual?.gameId ?? null;
    // Mientras sale el partido anterior, se guarda lo último que llegó del nuevo.
    if (swapOutRef.current) {
      pendingRef.current = next;
      seenRef.current = new Set(next.events.map((event) => event.id));
      prevScoreRef.current = { home: next.home.score, away: next.away.score };
      return;
    }
    if (gameId && gameRef.current && gameId !== gameRef.current) {
      gameRef.current = gameId;
      // Otro partido: lo que ya tiene no se anuncia (ni placas ni festejo).
      seenRef.current = new Set(next.events.map((event) => event.id));
      prevScoreRef.current = { home: next.home.score, away: next.away.score };
      queueRef.current = [];
      for (const timer of fxTimers.current) window.clearTimeout(timer);
      setFx(null);
      setHeld(null);
      pendingRef.current = next;
      swapOutRef.current = true;
      for (const timer of swapTimers.current) window.clearTimeout(timer);
      setSwap('out');
      swapTimers.current = [
        window.setTimeout(() => {
          swapOutRef.current = false;
          const incoming = pendingRef.current;
          if (incoming) {
            matchRef.current = incoming;
            setMatch(incoming);
          }
          setSwap('in');
        }, SWAP_OUT_MS),
        window.setTimeout(() => setSwap(null), SWAP_OUT_MS + SWAP_IN_MS),
      ];
      return;
    }
    if (gameId) gameRef.current = gameId;

    // La primera lectura no anuncia nada: el overlay puede abrirse a mitad de
    // partido y no tiene que recitar todo lo que ya pasó.
    let plates: OverlayPlate[] = [];
    if (!seenRef.current) {
      seenRef.current = new Set(next.events.map((event) => event.id));
    } else {
      if (!manual && config.conversion > 0) {
        const seen = seenRef.current;
        const fresh = next.events.filter((event) => !seen.has(event.id)).sort((a, b) => a.order - b.order);
        if (fresh.length) setLocalShot((current) => shotFromFreshEvents(current, fresh, Date.now(), config.conversion));
      }
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
  }, [config.showPlates, config.substitutions, config.conversion, enqueue, manual, usesFx]);

  useEffect(() => () => {
    for (const timer of fxTimers.current) window.clearTimeout(timer);
    for (const timer of swapTimers.current) window.clearTimeout(timer);
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
  const shotSource = match?.manual ? match.manual.shot ?? null : localShot;
  const live = match?.phase === 'live' || Boolean(shotSource?.endsAt);
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
    // El nombre completo: el que escribió el usuario o el del club en G22.
    name: config.homeFull ?? match.home.name,
    score: held ? held.home : match.home.score,
    ...teamLabels(config.nameMode, config.homeName, config.homeFull ?? match.home.name, match.home.short),
    // Sin el plan de colores, los de G22 aunque el partido (o el panel) traiga los del club.
    color: config.homeColor ?? (config.lockColors ? null : match.home.color) ?? (chromaGreen ? '#38bdf8' : DEFAULT_HOME_COLOR),
  };
  const away = {
    ...match.away,
    name: config.awayFull ?? match.away.name,
    score: held ? held.away : match.away.score,
    ...teamLabels(config.nameMode, config.awayName, config.awayFull ?? match.away.name, match.away.short),
    color: config.awayColor ?? (config.lockColors ? null : match.away.color) ?? DEFAULT_AWAY_COLOR,
  };
  // El logo del torneo es premium: el subido en el generador o, si no, el del torneo en G22.
  // Sin premium, en su lugar va el de G22.
  const tournamentLogo = planRules(config.plan).tournamentLogo ? (config.logo ?? realLogo(match.tournament?.logo ?? null)) : null;
  const withLogo = match.tournament ? { ...match, tournament: { ...match.tournament, logo: tournamentLogo } } : match;
  const shownRaw = context && !withLogo.context ? { ...withLogo, context } : withLogo;
  // "Copa de Plata · Fecha 3 · Copa de Plata": la fase y la zona a veces llegan repetidas.
  const shown = { ...shownRaw, context: dedupeSegments(shownRaw.context) };
  const clock = overlayClock(match, now);
  // La versión por defecto: la tarjeta G22 (escudos grandes, marcador,
  // anotadores y la placa del último evento adentro).
  if (config.style === 'tarjeta') {
    return (
      <div className={styles.swapWrap} data-swap={swap ?? undefined}>
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
      </div>
    );
  }

  // La presentación es un zócalo: sin `pos`, va abajo.
  const position = !config.positionSet && config.style === 'presentacion' ? 'abajo' : config.position;
  const vertical = position.startsWith('abajo') ? 'bottom' : position.startsWith('arriba') ? 'top' : 'middle';
  const horizontal = position.endsWith('izq') ? 'left' : position.endsWith('der') ? 'right' : 'center';

  const stageStyle = {
    '--ov-scale': config.scale,
    '--ov-margin': `${config.margin}px`,
    '--ov-home': home.color,
    '--ov-away': away.color,
    '--ov-home-ink': inkOn(home.color),
    '--ov-away-ink': inkOn(away.color),
    ...fontVars(config.fonts),
  } as CSSProperties;

  // Cuadro, paneles y presentación ya llevan el torneo adentro.
  const ownHeader = config.style === 'cuadro' || config.style === 'paneles' || config.style === 'presentacion';
  const tournamentLine = !ownHeader && config.showTournament && (match.tournament || shown.context)
    ? [match.tournament?.name, shown.context ?? match.round].filter(Boolean).join(' · ')
    : null;

  const plateTeam = plate?.team === 'home' ? home : plate?.team === 'away' ? away : null;
  const cards = config.showCards ? teamCards(match, now) : null;
  const time = clockText(clock, config.clockMode);
  // El período (1T, 2T) solo si el usuario lo pidió (`periodo=1`): por defecto, solo el tiempo.
  const period = config.showPeriod && time ? clock.label : null;
  const clockProps = { clock, time, phase: match.phase };
  // El manual corre con la hora del servidor; el de G22, con la local.
  const shot = shotView(shotSource, now + (match.manual?.offsetMs ?? 0));
  const logo = tournamentLogo;
  // Con logo de torneo, también va chico en el centro de cada marcador (junto al reloj).
  const tourLogo = tournamentLogo ? <TourLogo src={tournamentLogo} className={styles.centerLogo} /> : null;
  const tag = config.title ?? shown.context ?? match.round;
  // Contador de tries (`tries=1`): sale al lado de las tarjetas en todos los estilos.
  const countTries = (side: OverlaySide) => match.events
    .filter((event) => event.team === side && (event.type === 'try' || event.type === 'penalty_try')).length;
  const tries = config.showTries ? { home: countTries('home'), away: countTries('away') } : null;
  const noCards: TeamCards = { yellow: 0, red: 0, sinBins: [] };
  const marks: Record<OverlaySide, Marks> | null = cards || tries
    ? {
      home: { ...(cards?.home ?? noCards), tries: tries?.home ?? null },
      away: { ...(cards?.away ?? noCards), tries: tries?.away ?? null },
    }
    : null;

  return (
    <div className={styles.stage} style={stageStyle} data-chroma={chromaGreen ? 'verde' : undefined} data-swap={swap ?? undefined}>
      {fx && config.celebration === 'cinta' ? <CelebrationBand fx={fx} team={fx.side === 'home' ? home : away} /> : null}
      <div className={styles.anchor} data-v={vertical} data-h={horizontal}>
        {tournamentLine ? (
          <div className={styles.tournament}>
            {tournamentLogo ? <TourLogo src={tournamentLogo} className={styles.tournamentLogo} /> : null}
            <span>{tournamentLine}</span>
          </div>
        ) : null}

        <div className={styles.board} data-style={config.style} data-fx={fx ? fx.side : undefined}>
        {fx && config.celebration === 'marcador' && config.style !== 'pestana' ? <ScoreFxLayer fx={fx} color={(fx.side === 'home' ? home : away).color} /> : null}
        {config.style === 'barra' ? (
          <div className={styles.bar} data-phase={match.phase}>
            <TeamCell team={home} side="home" wide cards={marks?.home} />
            <div className={styles.barScore}>
              <Score value={home.score} bump={bump.home} />
              <span className={styles.barDash}>–</span>
              <Score value={away.score} bump={bump.away} />
            </div>
            <TeamCell team={away} side="away" wide cards={marks?.away} />
            {config.showClock ? <ClockCell {...clockProps} /> : null}
          </div>
        ) : config.style === 'franja' ? (
          <div className={styles.franja} data-phase={match.phase}>
            <div className={styles.fTeam} data-side="home">
              <Crest team={home} />
              <span className={styles.fName}>{home.short}</span>
              <Pips cards={marks?.home} />
            </div>
            <div className={styles.fScore}><Score value={home.score} bump={bump.home} bare /></div>
            {config.showClock ? (
              <div className={styles.fCenter} data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                {time ? <span className={styles.fTime}>{time}</span> : <span className={styles.fLabel}>{clock.label}</span>}
              </div>
            ) : <div className={styles.fDivider} />}
            <div className={styles.fScore}><Score value={away.score} bump={bump.away} bare /></div>
            <div className={styles.fTeam} data-side="away">
              <Pips cards={marks?.away} />
              <span className={styles.fName}>{away.short}</span>
              <Crest team={away} />
            </div>
          </div>
        ) : config.style === 'compacto' ? (
          <div className={styles.compact} data-phase={match.phase}>
            <span className={styles.cCrest} data-side="home"><Crest team={home} /></span>
            <span className={styles.cName}>{home.short}</span>
            <Pips cards={marks?.home} />
            <span className={styles.cScore}>
              <Score value={home.score} bump={bump.home} bare />
              {/* El reloj entre los dos resultados: así queda al medio exacto. */}
              {config.showClock
                ? <span className={styles.cClock} data-expired={clock.expired ? '' : undefined}>{time ?? clock.label}</span>
                : <span className={styles.cDash}>-</span>}
              <Score value={away.score} bump={bump.away} bare />
            </span>
            <Pips cards={marks?.away} />
            <span className={styles.cName}>{away.short}</span>
            <span className={styles.cCrest} data-side="away"><Crest team={away} /></span>
          </div>
        ) : config.style === 'escudos' ? (
          <div className={styles.crests} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              const crest = (
                <span className={styles.crestTeam} data-side={side} key={side}>
                  <span className={styles.crestBig}><Crest team={team} /></span>
                  <span className={styles.crestName}>{team.short}</span>
                  <Pips cards={marks?.[side]} />
                </span>
              );
              // El centro (resultado y reloj) va entre los dos escudos.
              return side === 'home' ? [crest, (
                <span className={styles.crestCenter} key="center">
                {tourLogo}
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
            <span className={styles.stripTeam} data-side="home"><Crest team={home} /><span className={styles.stripName}>{home.short}</span><Pips cards={marks?.home} /></span>
            <span className={styles.stripScore}><Score value={home.score} bump={bump.home} bare /></span>
            {config.showClock ? (
              <span className={styles.stripClock} data-expired={clock.expired ? '' : undefined}>{time ?? clock.label}</span>
            ) : <span className={styles.stripSep} />}
            <span className={styles.stripScore}><Score value={away.score} bump={bump.away} bare /></span>
            <span className={styles.stripTeam} data-side="away"><Pips cards={marks?.away} /><span className={styles.stripName}>{away.short}</span><Crest team={away} /></span>
          </div>
        ) : config.style === 'central' || config.style === 'rotulo' || config.style === 'tablero' || config.style === 'agua' || config.style === 'claro' ? (
          // Cinco estilos con la misma estructura (club | centro | club) y distinta piel:
          // el centro siempre cae al medio exacto (grilla 1fr auto 1fr).
          <div className={styles.sym} data-skin={config.style} data-phase={match.phase}>
            {config.style !== 'central' && config.style !== 'claro' && config.showClock && period ? (
              <span className={styles.symTab}>{period}</span>
            ) : null}
            <div className={styles.symBar}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                const half = (
                  <div className={styles.symTeam} data-side={side} key={side}>
                    <span className={styles.symMark} aria-hidden="true"><Crest team={team} /></span>
                    <span className={styles.symCrest}><Crest team={team} /></span>
                    <span className={styles.symText}>
                      <span className={styles.symName}>{team.short}</span>
                      <span className={styles.symSub}><Pips cards={marks?.[side]} /></span>
                    </span>
                    <span className={styles.symScore}><Score value={team.score} bump={bump[side]} bare /></span>
                  </div>
                );
                return side === 'home' ? [half, (
                  <div className={styles.symMid} key="mid" data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                    <b className={styles.symTime}>{config.showClock ? time ?? clock.label : clock.label}</b>
                    {(config.style === 'central' || config.style === 'claro') && config.showClock && period ? (
                      <span className={styles.symPeriod}>{period}</span>
                    ) : null}
                  </div>
                )] : [half];
              })}
            </div>
          </div>
        ) : config.style === 'tablilla' ? (
          <div className={styles.tablilla} data-phase={match.phase}>
            <div className={styles.tlRow}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                return (
                  <div className={styles.tlTeam} data-side={side} key={side}>
                    <span className={styles.tlTop}>
                      <Crest team={team} />
                      <span className={styles.tlScore}><Score value={team.score} bump={bump[side]} bare /></span>
                    </span>
                    <span className={styles.tlName}>{team.short}</span>
                    <Pips cards={marks?.[side]} />
                  </div>
                );
              })}
            </div>
            {config.showClock ? (
              <div className={styles.tlFoot} data-expired={clock.expired ? '' : undefined}>
                <span>{period ?? ''}</span>
                <b>{time ?? clock.label}</b>
                <span aria-hidden="true" />
              </div>
            ) : null}
          </div>
        ) : config.style === 'linea' ? (
          <div className={styles.linea} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              return (
                <div className={styles.nTeam} data-side={side} key={side}>
                  <span className={styles.nBlock}>
                    <Crest team={team} />
                    <span className={styles.nName}>{wideName(team)}</span>
                    <Pips cards={marks?.[side]} />
                  </span>
                  <span className={styles.nScore}><Score value={team.score} bump={bump[side]} bare /></span>
                </div>
              );
            })}
            {config.showClock ? (
              <div className={styles.nInfo} data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                {period ? <span className={styles.nPeriod}>{period}</span> : null}
                <b className={styles.nTime}>{time ?? clock.label}</b>
              </div>
            ) : null}
          </div>
        ) : config.style === 'pisos' ? (
          <div className={styles.pisos} data-phase={match.phase}>
            <div className={styles.sTop}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                return (
                  <div className={styles.sTeam} data-side={side} key={side}>
                    <span className={styles.sCrest}><Crest team={team} /></span>
                    <span className={styles.sName}>{team.short}</span>
                    <Pips cards={marks?.[side]} />
                    <span className={styles.sScore}><Score value={team.score} bump={bump[side]} bare /></span>
                  </div>
                );
              })}
            </div>
            {config.showClock || tag ? (
              <div className={styles.sInfo} data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                {config.showClock && period ? <span className={styles.sPeriod}>{period}</span> : null}
                {config.showClock ? <b className={styles.sTime}>{time ?? clock.label}</b> : null}
                {tag ? <span className={styles.sTag}>{tag}</span> : null}
              </div>
            ) : null}
          </div>
        ) : config.style === 'caja' ? (
          <div className={styles.caja} data-phase={match.phase}>
            <div className={styles.cjRow}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                return (
                  <div className={styles.cjTeam} data-side={side} key={side}>
                    <span className={styles.cjMark} aria-hidden="true"><Crest team={team} /></span>
                    <span className={styles.cjName}>{team.short}</span>
                    <span className={styles.cjScore}><Score value={team.score} bump={bump[side]} bare /></span>
                    <span className={styles.cjPips}><Pips cards={marks?.[side]} /></span>
                  </div>
                );
              })}
            </div>
            {config.showClock ? (
              <div className={styles.cjFoot} data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                <span>{period ?? ''}</span>
                <b>{time ?? clock.label}</b>
              </div>
            ) : null}
          </div>
        ) : config.style === 'sesgado' ? (
          <div className={styles.sesgado} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              const block = (
                <div className={styles.gTeam} data-side={side} key={side}>
                  <span className={styles.gInner}>
                    <Crest team={team} />
                    <span className={styles.gText}><span className={styles.gName}>{team.short}</span><Pips cards={marks?.[side]} /></span>
                    <span className={styles.gScore}><Score value={team.score} bump={bump[side]} bare /></span>
                  </span>
                </div>
              );
              return side === 'home' ? [block, (
                <div className={styles.gMid} key="mid" data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                  <span className={styles.gInner}>
                    {config.showClock && period ? <span className={styles.gPeriod}>{period}</span> : null}
                    <b className={styles.gTime}>{config.showClock ? time ?? clock.label : clock.label}</b>
                  </span>
                </div>
              )] : [block];
            })}
          </div>
        ) : config.style === 'degrade' ? (
          <div className={styles.degrade} data-phase={match.phase}>
            {config.showClock && period ? <span className={styles.dTab}>{period}</span> : null}
            <div className={styles.dBar}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                const half = (
                  <div className={styles.dTeam} data-side={side} key={side}>
                    <span className={styles.dCrest}><Crest team={team} /></span>
                    <span className={styles.dName}>{team.short}</span>
                    <Pips cards={marks?.[side]} />
                    <span className={styles.dScore}><Score value={team.score} bump={bump[side]} bare /></span>
                  </div>
                );
                return side === 'home' ? [half, (
                  <div className={styles.dMid} key="mid" data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                    <b>{config.showClock ? time ?? clock.label : clock.label}</b>
                  </div>
                )] : [half];
              })}
            </div>
          </div>
        ) : config.style === 'medallon' ? (
          <div className={styles.medallon} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              const half = (
                <div className={styles.mHalf} data-side={side} key={side}>
                  <span className={styles.mCrest}><Crest team={team} /></span>
                  <span className={styles.mNums}>
                    <span className={styles.mScore}><Score value={team.score} bump={bump[side]} bare /></span>
                    <span className={styles.mStat}>{team.short}</span>
                  </span>
                  <span className={styles.mPips}><Pips cards={marks?.[side]} /></span>
                </div>
              );
              // El medallón (período, reloj y la estadística de abajo) va entre las dos mitades.
              return side === 'home' ? [half, (
                <div className={styles.mCoin} key="coin" data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                  {config.showClock && period ? <span className={styles.mPeriod}>{period}</span> : null}
                  <b className={styles.mTime}>{config.showClock ? time ?? clock.label : clock.label}</b>
                </div>
              )] : [half];
            })}
          </div>
        ) : config.style === 'capsula' ? (
          <div className={styles.capsula} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              const half = (
                <div className={styles.kHalf} data-side={side} key={side}>
                  <span className={styles.kCrest}><Crest team={team} /></span>
                  <span className={styles.kName}>{wideName(team)}</span>
                  <Pips cards={marks?.[side]} />
                  <span className={styles.kScore}><Score value={team.score} bump={bump[side]} bare /></span>
                </div>
              );
              return side === 'home' ? [half, (
                <div className={styles.kMid} key="mid" data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                  {config.showClock && period ? <span className={styles.kPeriod}>{period}</span> : null}
                  <b className={styles.kTime}>{config.showClock ? time ?? clock.label : clock.label}</b>
                </div>
              )] : [half];
            })}
          </div>
        ) : config.style === 'flotante' ? (
          <div className={styles.flotante} data-phase={match.phase}>
            {(['home', 'away'] as const).map((side) => {
              const team = side === 'home' ? home : away;
              const half = (
                <div className={styles.lSide} data-side={side} key={side}>
                  <span className={styles.lCrest}><Crest team={team} /></span>
                  <span className={styles.lScore}><Score value={team.score} bump={bump[side]} bare /></span>
                  <span className={styles.lPips}><b className={styles.lName}>{team.short}</b><Pips cards={marks?.[side]} /></span>
                </div>
              );
              return side === 'home' ? [half, (
                <div className={styles.lMid} key="mid" data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                  {config.showClock && period ? <span className={styles.lPeriod}>{period}</span> : null}
                  <b>{config.showClock ? time ?? clock.label : clock.label}</b>
                </div>
              )] : [half];
            })}
          </div>
        ) : config.style === 'pestana' ? (
          <div className={styles.pestana} data-phase={match.phase}>
            {config.showClock ? (
              <div className={styles.tTab} data-expired={clock.expired ? '' : undefined}>
                {period ? <span className={styles.tPeriod}>{period}</span> : null}
                <span className={styles.tTime}>{time ?? clock.label}</span>
              </div>
            ) : null}
            <div className={styles.tBar}>
              <span className={styles.tName} data-side="home"><Crest team={home} /><span className={styles.tSigla}>{home.short}</span><Pips cards={marks?.home} /></span>
              <span className={styles.tScore}><Score value={home.score} bump={bump.home} bare /></span>
              {/* El logo gira y muestra los puntos del tanto ("+5") mientras dura el festejo. */}
              <span className={styles.tLogo} data-flip={fx ? '' : undefined} style={fx ? ({ '--fx-color': (fx.side === 'home' ? home : away).color, '--fx-ink': inkOn((fx.side === 'home' ? home : away).color) } as CSSProperties) : undefined}>
                <span className={styles.tLogoFront}><LeadLogo logo={logo} /></span>
                <span className={styles.tLogoBack}>{fx ? `+${fx.points}` : ''}</span>
              </span>
              <span className={styles.tScore}><Score value={away.score} bump={bump.away} bare /></span>
              <span className={styles.tName} data-side="away"><Pips cards={marks?.away} /><span className={styles.tSigla}>{away.short}</span><Crest team={away} /></span>
            </div>
          </div>
        ) : config.style === 'cuadro' ? (
          <div className={styles.cuadro} data-phase={match.phase}>
            {match.tournament?.name || tag ? (
              <div className={styles.qHead}>
                <span className={styles.qTitle}>{match.tournament?.name ?? ''}</span>
                {tag ? <span className={styles.qSub}>{tag}</span> : null}
              </div>
            ) : null}
            <div className={styles.qBody}>
              <div className={styles.qSide} data-expired={clock.expired ? '' : undefined}>
                <span className={styles.qLogo}><LeadLogo logo={logo} /></span>
                {config.showClock ? (
                  <span className={styles.qClock}>
                    {period ? <span className={styles.qPeriod}>{period}</span> : null}
                    <span className={styles.qTime}>{time ?? clock.label}</span>
                  </span>
                ) : null}
              </div>
              <div className={styles.qRows}>
                {(['home', 'away'] as const).map((side) => {
                  const team = side === 'home' ? home : away;
                  return (
                    <div className={styles.qRow} data-side={side} key={side}>
                      <span className={styles.qCrest}><Crest team={team} /></span>
                      <span className={styles.qFill}>
                        <Pips cards={marks?.[side]} />
                        <span className={styles.qName}>{team.short}</span>
                        <span className={styles.qScore}><Score value={team.score} bump={bump[side]} bare /></span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : config.style === 'paneles' ? (
          <div className={styles.paneles} data-phase={match.phase}>
            <div className={styles.pTop}>
              <div className={styles.pLead}><LeadLogo logo={logo} /></div>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                return (
                  <div className={styles.pPanel} data-side={side} key={side}>
                    <span className={styles.pHead}><Crest team={team} /><span className={styles.pName}>{team.short}</span></span>
                    <span className={styles.pScore}><Score value={team.score} bump={bump[side]} bare /></span>
                    <span className={styles.pPips}><Pips cards={marks?.[side]} /></span>
                  </div>
                );
              })}
            </div>
            {config.showClock ? (
              <div className={styles.pFoot} data-expired={clock.expired ? '' : undefined}>
                <span className={styles.pTime}>{time ?? clock.label}</span>
                {period ? <span className={styles.pPeriod}>{period}</span> : null}
              </div>
            ) : null}
          </div>
        ) : config.style === 'presentacion' ? (
          <div className={styles.presentacion} data-phase={match.phase}>
            {tag ? <span className={styles.prTag}>{tag}</span> : null}
            <div className={styles.prBar}>
              <div className={styles.prTeam} data-side="home">
                <Crest team={home} />
                <span className={styles.prName}>{wideName(home)}</span>
                <Pips cards={marks?.home} />
                {match.phase !== 'scheduled' ? <span className={styles.prScore}><Score value={home.score} bump={bump.home} bare /></span> : null}
              </div>
              <div className={styles.prMid}>
                <LeadLogo logo={logo} />
                {match.tournament?.name ? <span className={styles.prTour}>{match.tournament.name}</span> : null}
                {config.showClock && match.phase !== 'scheduled' ? (
                  <b className={styles.prClock} data-expired={clock.expired ? '' : undefined}>{time ?? clock.label}</b>
                ) : null}
              </div>
              <div className={styles.prTeam} data-side="away">
                {match.phase !== 'scheduled' ? <span className={styles.prScore}><Score value={away.score} bump={bump.away} bare /></span> : null}
                <Pips cards={marks?.away} />
                <span className={styles.prName}>{wideName(away)}</span>
                <Crest team={away} />
              </div>
            </div>
          </div>
        ) : config.style === 'bloques' ? (
          <div className={styles.blocks} data-phase={match.phase}>
            <div className={styles.blockRow}>
              {(['home', 'away'] as const).map((side) => {
                const team = side === 'home' ? home : away;
                return (
                  <div className={styles.block} data-side={side} key={side}>
                    {/* Arriba, el club en su color; abajo, sobre oscuro, el resultado. */}
                    <span className={styles.blockHead}>
                      <Crest team={team} />
                      <span className={styles.blockName}>{team.short}</span>
                    </span>
                    <span className={styles.blockScore}><Score value={team.score} bump={bump[side]} bare /></span>
                    <Pips cards={marks?.[side]} />
                  </div>
                );
              })}
            </div>
            {config.showClock ? (
              <div className={styles.blockClock} data-expired={clock.expired ? '' : undefined}>
                {tourLogo}
                {time ? <b>{time}</b> : <span>{clock.label}</span>}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.bug} data-phase={match.phase}>
            <div className={styles.rows}>
              <div className={styles.row}>
                <TeamCell team={home} side="home" cards={marks?.home} />
                <Score value={home.score} bump={bump.home} />
              </div>
              <div className={styles.row}>
                <TeamCell team={away} side="away" cards={marks?.away} />
                <Score value={away.score} bump={bump.away} />
              </div>
            </div>
            {config.showClock ? <ClockCell {...clockProps} /> : null}
          </div>
        )}
        </div>

        {cards ? <SinBins cards={cards} home={home} away={away} /> : null}
        {shot ? <ShotClockChip shot={shot} home={home} away={away} /> : null}

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

/**
 * El logo del torneo que viene de G22 pasa por el proxy de escudos, que sin logo
 * cargado devuelve un monograma ("SD"): en un marcador eso es ruido. Se pide sin
 * monograma y, si no hay logo, la imagen se saca sola.
 */
function realLogo(url: string | null): string | null {
  if (!url) return null;
  if (!url.includes('/api/assets/team-logo') || url.includes('noFallback=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}noFallback=1`;
}

/** Los que no cargaron: el marcador se rearma con cada sondeo y no hay que volver a pedirlos. */
const MISSING_LOGOS = new Set<string>();

function TourLogo({ src, className }: { src: string; className: string }) {
  const [broken, setBroken] = useState(() => MISSING_LOGOS.has(src));
  if (broken) return null;
  return <img src={src} alt="" className={className} onError={() => { MISSING_LOGOS.add(src); setBroken(true); }} />;
}

/** Saca los tramos repetidos de un "A · B · A" (sin distinguir mayúsculas). */
function dedupeSegments(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  const seen = new Set<string>();
  return text.split(' · ').filter((part) => {
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(' · ');
}

/** Texto oscuro sobre colores claros, blanco sobre oscuros: el nombre siempre se lee. */
function inkOn(hex: string): string {
  const raw = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#04110b' : '#ffffff';
}

type ShownTeam = { short: string; name: string; logo: string | null; color: string; /** Lo que muestran los estilos anchos (nombre completo o sigla, según elija el usuario). */ wide?: string };

/** Los estilos anchos: el nombre completo, la sigla o lo que haya elegido el usuario (ver `teamLabels`). */
function wideName(team: ShownTeam): string {
  return team.wide ?? team.name.toUpperCase();
}

function Crest({ team }: { team: ShownTeam }) {
  return team.logo
    ? <img src={team.logo} alt="" className={styles.teamLogo} />
    : <span className={styles.teamLogoFallback} aria-hidden="true">{team.short.slice(0, 1)}</span>;
}

/** Tarjetas como en la planilla: un rectángulo amarillo o rojo por tarjeta (hasta 3, después el número). */
function Pips({ cards }: { cards?: Marks }) {
  // Siempre ocupa su lugar (vacío si no hay tarjetas): así los dos lados miden
  // lo mismo y los números quedan alineados.
  const hasTries = cards?.tries !== null && cards?.tries !== undefined;
  if (!cards || (!cards.yellow && !cards.red && !hasTries)) return <span className={styles.pips} aria-hidden="true" />;
  const pips = (count: number, tone: 'yellow' | 'red') => count <= 3
    ? Array.from({ length: count }, (_, i) => <span key={`${tone}${i}`} className={styles.pip} data-tone={tone} />)
    : [<span key={tone} className={styles.pip} data-tone={tone} data-count="">{count}</span>];
  return (
    <span className={styles.pips} aria-label={`${hasTries ? `${cards.tries} tries, ` : ''}${cards.yellow} amarillas, ${cards.red} rojas`}>
      {/* El contador de tries: una T y el número. */}
      {hasTries ? (
        <span className={styles.tryCount}><b aria-hidden="true">T</b>{cards.tries}</span>
      ) : null}
      {pips(cards.yellow, 'yellow')}
      {pips(cards.red, 'red')}
    </span>
  );
}

/** Lo que cuelga al lado del nombre: tarjetas y, si se pidió, los tries. */
type Marks = TeamCards & { tries: number | null };

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

/**
 * Shot clock debajo del marcador: el rótulo (CONVERSIÓN, TMO…), el tiempo
 * grande y una barra del color del club que se vacía. Los últimos 10, en rojo.
 */
function ShotClockChip({ shot, home, away }: { shot: ShotView; home: ShownTeam; away: ShownTeam }) {
  const team = shot.team === 'home' ? home : shot.team === 'away' ? away : null;
  return (
    <div
      className={styles.shot}
      data-urgent={shot.urgent ? '' : undefined}
      data-done={shot.done ? '' : undefined}
      data-paused={shot.paused ? '' : undefined}
      style={{ '--ov-team': team?.color ?? 'var(--ov-brand)' } as CSSProperties}
      role="timer"
    >
      {team ? <span className={styles.shotTeam}>{team.short}</span> : null}
      <span className={styles.shotLabel}>{shot.label}</span>
      <span className={styles.shotTime}>{shot.time}</span>
      <span className={styles.shotBar} aria-hidden="true">
        <span style={{ transform: `scaleX(${shot.progress})` }} />
      </span>
    </div>
  );
}

/**
 * El festejo a lo ancho: una banda del color del club entra por abajo, el tipo
 * de tanto corre repetido (TRY · TRY · TRY) y una palabra gigante la cruza.
 * Abajo a la izquierda, quién lo hizo. Dura lo mismo que el efecto (FX_MS).
 */
function CelebrationBand({ fx, team }: { fx: ScoreFx; team: ShownTeam }) {
  const words = Array.from({ length: 14 }, (_, index) => (
    <span key={index} className={styles.cintaWord}>{fx.title}<i aria-hidden="true">✓</i></span>
  ));
  return (
    <div
      className={styles.cinta}
      key={fx.key}
      role="status"
      style={{ '--fx-color': team.color, '--fx-ink': inkOn(team.color), '--fx-ms': `${FX_MS}ms` } as CSSProperties}
    >
      <div className={styles.cintaTrack} aria-hidden="true">{words}{words}</div>
      <b className={styles.cintaBig} aria-hidden="true">{fx.title}</b>
      <span className={styles.cintaWho}>
        {team.logo ? <img src={team.logo} alt="" /> : null}
        <span>{fx.title} · {fx.player ?? team.short} <em>+{fx.points}</em></span>
      </span>
    </div>
  );
}

/** El logo del torneo, o el de G22 si no tiene. */
function LeadLogo({ logo }: { logo: string | null }) {
  const [missing, setMissing] = useState(() => !logo || MISSING_LOGOS.has(logo));
  if (missing || !logo) return <img src="/header-logo.png" alt="" data-g22="" />;
  return <img src={logo} alt="" onError={() => { MISSING_LOGOS.add(logo); setMissing(true); }} />;
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
  cards?: Marks;
}) {
  return (
    <div className={styles.team} data-side={side} data-wide={wide ? '' : undefined}>
      <span className={styles.teamStrip} aria-hidden="true" />
      <Crest team={team} />
      <span className={styles.teamName}>{wide ? wideName(team) : team.short}</span>
      <Pips cards={cards} />
    </div>
  );
}

function Score({ value, bump, bare = false }: { value: number | null; bump: number; bare?: boolean }) {
  const inner = (
    // La key reinicia la animación cada vez que el marcador sube.
    <span key={bump} className={bump > 0 ? `${styles.num} ${styles.scoreBump}` : styles.num}>
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
