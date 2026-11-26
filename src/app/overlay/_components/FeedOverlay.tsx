'use client';

/* eslint-disable @next/next/no-img-element -- foto y escudos por proxy de la misma origen. */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { kickoffParts, overlayClock, toOverlayMatch, type OverlayMatch } from '@/lib/overlay/matchOverlayModel';
import type { OverlayFeed, OverlayFeedKind, OverlayLeaderRow, OverlayNews, OverlayPlayer, OverlayStandingRow } from '@/lib/overlay/overlayFeedTypes';
import type { OverlayConfig } from '../_lib/config';
import { demoFeed } from '../_lib/demo';
import OverlayStage from './OverlayStage';
import { Crest, G22Card, LiveDot, MatchRow, PageDots, SetupHint } from './G22Card';
import styles from './g22.module.css';

/** Cada cuánto se relee: rápido si hay algo en juego, tranquilo si no. */
const POLL_LIVE_MS = 5_000;
const POLL_IDLE_MS = 30_000;
const POLL_PLAYER_MS = 120_000;
const POLL_ERROR_MS = 8_000;

type State =
  | { status: 'loading' }
  | { status: 'ok'; feed: OverlayFeed }
  | { status: 'error'; message: string };

function useOverlayFeed(kind: OverlayFeedKind, query: string, demo: boolean): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  const hasDataRef = useRef(false);

  useEffect(() => {
    // La muestra se arma DESPUÉS de montar: usa la hora actual y, armada en el
    // render, el servidor y el navegador escribían horas distintas (hidratación rota).
    if (demo) {
      hasDataRef.current = true;
      setState({ status: 'ok', feed: demoFeed(kind) });
      return undefined;
    }
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const tick = async () => {
      let wait = POLL_ERROR_MS;
      try {
        const response = await fetch(`/api/overlay?tipo=${kind}&${query}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (response.ok && body && !body.error) {
          const feed = body as OverlayFeed;
          hasDataRef.current = true;
          setState({ status: 'ok', feed });
          const all = [...(feed.matches ?? []), ...(feed.bracket?.cups.flatMap((c) => c.rounds.flatMap((r) => r.matches)) ?? [])];
          const anyLive = all.some((m) => toOverlayMatch(m)?.phase === 'live');
          wait = kind === 'jugador' ? POLL_PLAYER_MS : anyLive ? POLL_LIVE_MS : POLL_IDLE_MS;
        } else if (!hasDataRef.current) {
          // Con datos en pantalla, una falla suelta no los borra: se reintenta.
          setState({ status: 'error', message: body?.error ?? `Error ${response.status}` });
        }
      } catch {
        if (!cancelled && !hasDataRef.current) setState({ status: 'error', message: 'Sin conexión con g22scores. Reintentando…' });
      }
      if (!cancelled) timer = window.setTimeout(tick, wait);
    };

    void tick();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [kind, query, demo]);

  return state;
}

/** Reloj de pantalla: los partidos en vivo corren entre lecturas. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

/** Índice de página que avanza solo cada `seconds` (o fijo, si se pidió uno). */
function useRotation(count: number, seconds: number, fixed: number | null = null) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (fixed !== null || count <= 1) return undefined;
    const interval = window.setInterval(() => setIndex((current) => (current + 1) % count), seconds * 1000);
    return () => window.clearInterval(interval);
  }, [count, seconds, fixed]);
  if (fixed !== null) return Math.min(Math.max(0, fixed), Math.max(0, count - 1));
  return count ? index % count : 0;
}

export default function FeedOverlay({
  kind,
  query,
  config,
}: {
  kind: OverlayFeedKind;
  /** Los parámetros de datos ya armados (`torneo=…&ronda=…`), sin `tipo`. */
  query: string;
  config: OverlayConfig;
}) {
  const state = useOverlayFeed(kind, query, config.demo);

  if (state.status === 'error') return <SetupHint>G22 · {state.message}</SetupHint>;
  const feed = state.status === 'ok' ? state.feed : null;

  return (
    <OverlayStage config={config} ready={feed !== null}>
      {feed ? <FeedCard feed={feed} config={config} /> : null}
    </OverlayStage>
  );
}

function FeedCard({ feed, config }: { feed: OverlayFeed; config: OverlayConfig }) {
  if (feed.kind === 'jugador' && feed.player) return <PlayerCard feed={feed} player={feed.player} />;
  if (feed.kind === 'tabla' && feed.table) return <TableCard feed={feed} rows={feed.table.rows} config={config} />;
  if (feed.kind === 'goleadores' && feed.leaders) return <LeadersCard feed={feed} config={config} />;
  if (feed.kind === 'noticia' && feed.news) return <NewsCard feed={feed} news={feed.news} config={config} />;
  if (feed.kind === 'playoff' && feed.bracket) return <BracketCard feed={feed} config={config} />;
  return <ListCard feed={feed} config={config} />;
}

/* ─── lista: partidos elegidos, una fecha, un día ─── */

function ListCard({ feed, config }: { feed: OverlayFeed; config: OverlayConfig }) {
  const entries = useMemo(
    () => (feed.matches ?? [])
      .map((raw) => ({ match: toOverlayMatch(raw), group: typeof raw.group === 'string' ? raw.group : null }))
      .filter((entry): entry is { match: OverlayMatch; group: string | null } => entry.match !== null),
    [feed.matches],
  );
  const matches = entries.map((entry) => entry.match);
  const pages = useMemo(() => {
    const out: Array<typeof entries> = [];
    for (let i = 0; i < entries.length; i += config.rows) out.push(entries.slice(i, i + config.rows));
    return out;
  }, [entries, config.rows]);
  const page = useRotation(pages.length, config.rotate);
  const now = useNow(matches.some((m) => m.phase === 'live'));
  const live = matches.filter((m) => m.phase === 'live').length;
  const count = `${matches.length} ${matches.length === 1 ? 'partido' : 'partidos'}`;
  // La home y el día mezclan torneos: cada torneo lleva su rótulo arriba.
  const grouped = entries.some((entry) => entry.group);

  return (
    <G22Card
      title={config.title ?? feed.title}
      subtitle={feed.subtitle}
      logo={feed.logo}
      width={900}
      footer={(
        <>
          <span>{live ? `${live} en vivo` : count}{feed.truncated ? ' · hay más' : ''}</span>
          <PageDots count={pages.length} active={page} />
          <span>g22scores.com</span>
        </>
      )}
    >
      {pages.length ? (
        <div className={styles.page} key={page}>
          {pages[page].map((entry, index) => {
            const previous = index > 0 ? pages[page][index - 1].group : null;
            const header = grouped && entry.group && (index === 0 || entry.group !== previous);
            return (
              <div key={entry.match.id} className={styles.rowWrap}>
                {header ? <div className={styles.groupHeader}>{entry.group}</div> : null}
                <MatchRow match={entry.match} now={now} index={index} />
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>No hay partidos para mostrar.</p>
      )}
    </G22Card>
  );
}

/* ─── cuadro de playoff ─── */

/**
 * ¿El cuadro es una llave de eliminación (cada ronda tiene la mitad de
 * partidos que la anterior)? Si sí, se dibuja como llave con las líneas que
 * unen los cruces; si no (copas de clasificación: final, 3° y 4°, 5° y 6°…),
 * en columnas.
 */
function isTree(rounds: Array<{ matches: unknown[] }>) {
  if (rounds.length < 2) return false;
  return rounds.every((round, index) => index === 0 || round.matches.length * 2 === rounds[index - 1].matches.length);
}

function BracketCard({ feed, config }: { feed: OverlayFeed; config: OverlayConfig }) {
  const cups = useMemo(() => (feed.bracket?.cups ?? []).filter((cup) => cup.rounds.some((r) => r.matches.length)), [feed.bracket]);
  const cupIndex = useRotation(cups.length, Math.max(config.rotate, 12), config.cup !== null ? config.cup - 1 : null);
  const cup = cups[cupIndex];
  const anyLive = useMemo(
    () => cups.some((c) => c.rounds.some((r) => r.matches.some((m) => toOverlayMatch(m)?.phase === 'live'))),
    [cups],
  );
  const now = useNow(anyLive);
  const subtitle = [feed.subtitle, cups.length > 1 ? cup?.name : null].filter(Boolean).join(' · ');
  const rounds = cup?.rounds.filter((round) => round.matches.length) ?? [];
  const tree = config.bracketView !== 'columnas' && isTree(rounds);

  const tie = (raw: Record<string, unknown>, index: number) => {
    const match = toOverlayMatch(raw);
    if (!match) return null;
    const winner = (raw.winnerSide as 'home' | 'away' | null | undefined) ?? null;
    return <Tie key={match.id} match={match} winner={winner} now={now} index={index} />;
  };

  return (
    <G22Card
      title={config.title ?? feed.title}
      subtitle={subtitle}
      logo={feed.logo}
      footer={(
        <>
          <span>{cup?.name ?? 'Playoff'}</span>
          <PageDots count={cups.length} active={cupIndex} />
          <span>g22scores.com</span>
        </>
      )}
    >
      {!cup ? (
        <p className={styles.empty}>El cuadro todavía no tiene partidos.</p>
      ) : tree ? (
        <div className={styles.tree} key={cupIndex}>
          {rounds.map((round, roundIndex) => {
            const last = roundIndex === rounds.length - 1;
            const pairs: Array<Array<Record<string, unknown>>> = [];
            if (last) pairs.push(round.matches);
            else for (let i = 0; i < round.matches.length; i += 2) pairs.push(round.matches.slice(i, i + 2));
            return (
              <div className={styles.treeRound} key={round.name} data-first={roundIndex === 0 ? '' : undefined}>
                <div className={styles.bracketRoundName}>{round.name}</div>
                <div className={styles.treeSlots}>
                  {pairs.map((pair, pairIndex) => (
                    <div className={last ? styles.treeFinal : styles.treePair} key={pairIndex}>
                      {pair.map((raw, i) => (
                        <div className={styles.treeSlot} key={String(raw.id)}>{tie(raw, pairIndex * 2 + i)}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.bracket} key={cupIndex}>
          {rounds.map((round) => (
            <div className={styles.bracketRound} key={round.name}>
              <div className={styles.bracketRoundName}>{round.name}</div>
              <div className={styles.bracketMatches}>{round.matches.map((raw, index) => tie(raw, index))}</div>
            </div>
          ))}
        </div>
      )}
    </G22Card>
  );
}

/** Estado de una llave en una línea: "EN VIVO 34:12", "FINAL", "SÁB 22/11 · 15:30". */
function tieStatus(match: OverlayMatch, now: number) {
  if (match.phase === 'live') {
    const clock = overlayClock(match, now);
    return <><span><LiveDot /> EN VIVO</span><span>{clock.time ?? clock.label}</span></>;
  }
  if (match.phase === 'final') return <><span>FINAL</span><span /></>;
  const kickoff = kickoffParts(match.dateTime);
  return <><span>{kickoff.day}</span><span>{kickoff.time}</span></>;
}

function Tie({ match, winner, now, index }: { match: OverlayMatch; winner: 'home' | 'away' | null; now: number; index: number }) {
  const line = (side: 'home' | 'away') => {
    const team = match[side];
    return (
      <div
        className={styles.tieLine}
        data-win={winner === side ? '' : undefined}
        data-lost={winner && winner !== side ? '' : undefined}
      >
        <Crest src={team.logo} name={team.name} />
        <span className={styles.tieName}>{team.short}</span>
        <span className={styles.tieScore}>{team.score ?? ''}</span>
      </div>
    );
  };
  return (
    <div className={styles.tie} data-phase={match.phase} style={{ '--ov-i': index } as CSSProperties}>
      {line('home')}
      {line('away')}
      <div className={styles.tieMeta}>{tieStatus(match, now)}</div>
    </div>
  );
}

/* ─── jugador ─── */

function PlayerCard({ feed, player }: { feed: OverlayFeed; player: OverlayPlayer }) {
  const s = player.stats;
  const stats: Array<{ label: string; value: number | string; hero?: boolean }> = [
    { label: 'Puntos', value: s.points, hero: true },
    { label: 'Partidos', value: s.matches },
    { label: 'Tries', value: s.tries },
    { label: 'Conversiones', value: s.conversions },
    { label: 'Penales', value: s.penalties },
    { label: 'Tarjetas', value: s.yellowCards + s.redCards },
  ];
  const clubColor = player.club?.color ?? null;
  const photoStyle = clubColor
    ? ({ '--ov-club': clubColor, '--ov-club-glow': `${clubColor}88` } as CSSProperties)
    : undefined;

  return (
    <G22Card
      title={feed.title}
      subtitle={feed.subtitle}
      width={820}
      accent={clubColor}
      footer={(
        <>
          <span>{s.matches} PJ · {s.wins}G {s.draws}E {s.losses}P</span>
          <span>g22scores.com</span>
        </>
      )}
    >
      <div className={styles.player}>
        <div className={styles.playerPhoto} style={photoStyle}>
          {player.photo ? <img src={player.photo} alt="" /> : <span className={styles.playerNumber}>{player.number ?? '·'}</span>}
          {player.club ? (
            <span className={styles.playerClubBadge}><Crest src={player.club.logo} name={player.club.name} /></span>
          ) : null}
        </div>
        <div className={styles.playerInfo}>
          <div className={styles.playerMeta}>
            {player.position ? <span className={styles.pill}>{player.position}</span> : null}
            {player.number !== null ? <span className={styles.pill}>#{player.number}</span> : null}
            {player.club ? <span className={styles.pill}>{player.club.short}</span> : null}
          </div>
          <div className={styles.statGrid}>
            {stats.map((stat, index) => (
              <div className={styles.stat} key={stat.label} data-hero={stat.hero ? '' : undefined} style={{ '--ov-i': index } as CSSProperties}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
          {player.recent.length ? (
            <div className={styles.form}>
              {player.recent.map((match) => (
                <div className={styles.formItem} key={match.id} data-result={match.result ?? undefined}>
                  <b>{match.score ?? '—'}</b>
                  <span>vs {match.rival}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </G22Card>
  );
}

/* ─── tabla de posiciones ─── */

function TableCard({ feed, rows, config }: { feed: OverlayFeed; rows: OverlayStandingRow[]; config: OverlayConfig }) {
  const pages = useMemo(() => {
    const size = Math.max(config.rows, 4);
    const out: OverlayStandingRow[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
  }, [rows, config.rows]);
  const page = useRotation(pages.length, config.rotate);
  const showBonus = rows.some((row) => row.bonus > 0);
  const showDraws = rows.some((row) => row.drawn > 0);

  return (
    <G22Card
      title={config.title ?? feed.title}
      subtitle={feed.subtitle}
      logo={feed.logo}
      width={900}
      footer={(
        <>
          <span>Tabla de posiciones</span>
          <PageDots count={pages.length} active={page} />
          <span>g22scores.com</span>
        </>
      )}
    >
      <div className={styles.table} key={page} data-bonus={showBonus ? '' : undefined} data-draws={showDraws ? '' : undefined}>
        <div className={styles.tableHead}>
          <span>#</span>
          <span>Equipo</span>
          <span>PJ</span>
          <span>G</span>
          {showDraws ? <span>E</span> : null}
          <span>P</span>
          <span>DIF</span>
          {showBonus ? <span>BON</span> : null}
          <span>PTS</span>
        </div>
        {(pages[page] ?? []).map((row, index) => {
          const previous = index > 0 ? pages[page][index - 1].group : null;
          const header = row.group && (index === 0 || row.group !== previous);
          const diff = row.diff > 0 ? `+${row.diff}` : String(row.diff);
          return (
            <div key={`${row.group ?? ''}-${row.teamId ?? row.name}`} className={styles.rowWrap}>
              {header ? <div className={styles.groupHeader}>{row.group}</div> : null}
              <div className={styles.tableRow} style={{ '--ov-i': index } as CSSProperties} data-top={row.position <= 1 ? '' : undefined}>
                <span className={styles.tablePos}>{row.position}</span>
                <span className={styles.tableTeam}>
                  <Crest src={row.logo} name={row.name} />
                  <span className={styles.rowName}>{row.name}</span>
                </span>
                <span>{row.played}</span>
                <span>{row.won}</span>
                {showDraws ? <span>{row.drawn}</span> : null}
                <span>{row.lost}</span>
                <span>{diff}</span>
                {showBonus ? <span>{row.bonus}</span> : null}
                <span className={styles.tablePts}>{row.points}</span>
              </div>
            </div>
          );
        })}
      </div>
    </G22Card>
  );
}

/* ─── goleadores / tryman ─── */

function LeadersCard({ feed, config }: { feed: OverlayFeed; config: OverlayConfig }) {
  const rows = useMemo(() => feed.leaders?.rows ?? [], [feed.leaders]);
  const unit = feed.leaders?.unit ?? '';
  const official = Boolean(feed.leaders?.official);
  const pages = useMemo(() => {
    const size = Math.max(config.rows, 3);
    const out: OverlayLeaderRow[][] = [];
    for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
    return out;
  }, [rows, config.rows]);
  const page = useRotation(pages.length, config.rotate);

  return (
    <G22Card
      title={config.title ?? feed.title}
      subtitle={feed.subtitle}
      logo={feed.logo}
      width={760}
      footer={(
        <>
          <span>{official ? 'Datos oficiales' : 'Según las planillas cargadas'}</span>
          <PageDots count={pages.length} active={page} />
          <span>g22scores.com</span>
        </>
      )}
    >
      {rows.length ? (
        <div className={styles.page} key={page}>
          {(pages[page] ?? []).map((row, index) => (
            <div
              className={styles.leader}
              key={`${row.rank}-${row.name}`}
              data-first={row.rank === 1 ? '' : undefined}
              style={{ '--ov-i': index } as CSSProperties}
            >
              <span className={styles.leaderRank}>{row.rank}</span>
              <Crest src={row.clubLogo} name={row.club ?? row.name} />
              <span className={styles.leaderInfo}>
                <span className={styles.leaderName}>{row.name}</span>
                {row.club ? <span className={styles.leaderClub}>{row.club}{row.matches ? ` · ${row.matches} PJ` : ''}</span> : null}
              </span>
              <span className={styles.leaderValue}>{row.value}<small>{unit}</small></span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Todavía no hay datos cargados.</p>
      )}
    </G22Card>
  );
}

/* ─── noticia ─── */

function NewsCard({ feed, news, config }: { feed: OverlayFeed; news: OverlayNews; config: OverlayConfig }) {
  return (
    <G22Card
      title={config.title ?? feed.title}
      subtitle={feed.subtitle}
      width={news.image ? 980 : 760}
      footer={(
        <>
          <span>Leé la nota completa</span>
          <span>g22scores.com</span>
        </>
      )}
    >
      <div className={styles.news} data-image={news.image ? '' : undefined}>
        {news.image ? <img src={news.image} alt="" className={styles.newsImage} /> : null}
        <div className={styles.newsText}>
          <h2 className={styles.newsTitle}>{news.title}</h2>
          {news.summary ? <p className={styles.newsSummary}>{news.summary}</p> : null}
        </div>
      </div>
    </G22Card>
  );
}
