'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { toOverlayMatch, type OverlayMatch, type OverlayTeam } from '@/lib/overlay/matchOverlayModel';
import type { OverlayConfig } from '../../_lib/config';
import OverlayStage from '../../_components/OverlayStage';
import { Crest, G22Card, SetupHint } from '../../_components/G22Card';
import styles from '../../_components/g22.module.css';

/**
 * Formaciones de un partido: las dos listas lado a lado, o un equipo solo. En
 * rugby, un equipo solo se dibuja en la cancha con cada número en su puesto
 * (1 a 15); en el resto de los deportes, o si la planilla no trae los dorsales
 * de titular, en lista.
 */

type Player = { number: number | null; name: string; position: string | null; starter: boolean; captain: boolean };
type Lineups = { home: Player[]; away: Player[] };

/** Dónde va cada dorsal de rugby en la cancha (x, y en %), de los forwards (arriba) al fullback. */
const RUGBY_SPOTS: Record<number, [number, number]> = {
  1: [36, 9], 2: [50, 9], 3: [64, 9],
  4: [43, 22], 5: [57, 22],
  6: [30, 34], 8: [50, 37], 7: [70, 34],
  9: [42, 50],
  10: [30, 60],
  12: [45, 70], 13: [61, 75],
  11: [12, 78], 14: [88, 78],
  15: [50, 87],
};

function readLineup(raw: unknown): Player[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const number = Number(row.number ?? row.jerseyNumber);
    const role = String(row.role ?? '').toLowerCase();
    const validNumber = Number.isFinite(number) ? number : null;
    return {
      number: validNumber,
      name: String(row.name ?? row.playerName ?? '').trim() || `Jugador ${index + 1}`,
      position: typeof row.position === 'string' && row.position.trim() ? row.position.trim() : null,
      // Sin rol cargado, el dorsal decide: del 1 al 15 es titular.
      starter: role ? role === 'starter' || role === 'titular' : validNumber !== null && validNumber <= 15,
      captain: Boolean(row.isCaptain ?? row.captain),
    };
  });
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
}

const DEMO_NAMES = ['Gómez', 'Pérez', 'Díaz', 'Romero', 'Ruiz', 'Sosa', 'Acosta', 'Benítez', 'Medina', 'Herrera',
  'Suárez', 'Aguirre', 'Giménez', 'Molina', 'Castro', 'Rojas', 'Ortiz', 'Silva', 'Torres', 'Ríos', 'Luna', 'Vera', 'Ramos'];

function demoLineup(offset: number): Player[] {
  return Array.from({ length: 23 }, (_, i) => ({
    number: i + 1,
    name: `J. ${DEMO_NAMES[(i + offset) % DEMO_NAMES.length]}`,
    position: null,
    starter: i < 15,
    captain: i === 7,
  }));
}

export default function FormationOverlay({
  matchId,
  config,
  side,
  view,
}: {
  matchId: string;
  config: OverlayConfig;
  side: 'ambos' | 'local' | 'visita';
  view: 'auto' | 'cancha' | 'lista';
}) {
  const [match, setMatch] = useState<OverlayMatch | null>(null);
  const [lineups, setLineups] = useState<Lineups | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    if (config.demo) {
      setMatch(toOverlayMatch({
        id: 'demo', status: 'scheduled', round_label: 'Fecha 7', sport_id: 'rugby',
        homeClub: { name: 'Club Local', short_name: 'Local', primary_color: '#00a365' },
        awayClub: { name: 'Club Visitante', short_name: 'Visitante', primary_color: '#2563eb' },
        tournament: { name: 'Torneo de prueba' },
      }));
      setLineups({ home: demoLineup(0), away: demoLineup(7) });
      return undefined;
    }
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.ok && body) {
          hasData.current = true;
          setMatch(toOverlayMatch(body));
          const raw = (body.lineups ?? body.match?.lineups ?? {}) as Record<string, unknown>;
          setLineups({ home: readLineup(raw.home), away: readLineup(raw.away) });
          setFailure(null);
        } else if (!hasData.current) {
          setFailure(response.status === 404 ? `No se encontró el partido «${matchId}» o no es público.` : 'No se pudo leer el partido.');
        }
      } catch {
        if (!cancelled && !hasData.current) setFailure('Sin conexión con g22scores. Reintentando…');
      }
      // Las formaciones casi no cambian: se releen cada minuto por si las cargan tarde.
      if (!cancelled) timer = window.setTimeout(tick, 60_000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [matchId, config.demo]);

  if (failure) return <SetupHint>G22 · {failure}</SetupHint>;
  const empty = Boolean(lineups && !lineups.home.length && !lineups.away.length);

  return (
    <OverlayStage config={config} ready={Boolean(match && lineups)}>
      {match && lineups ? (
        <FormationCard match={match} lineups={lineups} side={side} view={view} config={config} empty={empty} />
      ) : null}
    </OverlayStage>
  );
}

function FormationCard({
  match,
  lineups,
  side,
  view,
  config,
  empty,
}: {
  match: OverlayMatch;
  lineups: Lineups;
  side: 'ambos' | 'local' | 'visita';
  view: 'auto' | 'cancha' | 'lista';
  config: OverlayConfig;
  empty: boolean;
}) {
  const subtitle = [match.context ?? match.round, 'Formaciones'].filter(Boolean).join(' · ');
  const title = config.title ?? match.tournament?.name ?? 'Formaciones';

  if (empty) {
    return (
      <G22Card title={title} subtitle={subtitle} logo={match.tournament?.logo} width={760} footer={<span>g22scores.com</span>}>
        <p className={styles.empty}>Todavía no hay formaciones cargadas para este partido.</p>
      </G22Card>
    );
  }

  if (side === 'ambos') {
    return (
      <G22Card title={title} subtitle={subtitle} logo={match.tournament?.logo} width={1100} footer={<><span>Formaciones</span><span>g22scores.com</span></>}>
        <div className={styles.lineups}>
          <LineupList team={match.home} players={lineups.home} color={match.home.color} />
          <LineupList team={match.away} players={lineups.away} color={match.away.color} />
        </div>
      </G22Card>
    );
  }

  const team = side === 'local' ? match.home : match.away;
  const players = side === 'local' ? lineups.home : lineups.away;
  const starters = players.filter((player) => player.starter);
  const sportId = String((typeof match.sportRef === 'string' ? match.sportRef : match.sportRef?.sportId) ?? '');
  const rugby = !sportId || sportId.includes('rugby');
  const fitsPitch = starters.length >= 13 && starters.every((player) => player.number !== null && RUGBY_SPOTS[player.number]);
  const pitch = view === 'cancha' || (view === 'auto' && rugby && fitsPitch);

  return (
    <G22Card
      title={team.name}
      subtitle={[match.tournament?.name, subtitle].filter(Boolean).join(' · ')}
      logo={team.logo}
      width={pitch ? 980 : 620}
      accent={team.color}
      footer={<><span>{side === 'local' ? 'Local' : 'Visitante'}</span><span>g22scores.com</span></>}
    >
      {pitch ? (
        <div className={styles.pitchWrap}>
          <div className={styles.pitch} style={{ '--ov-team': team.color ?? '#00a365' } as CSSProperties}>
            <span className={styles.pitchLine} style={{ top: '30%' }} />
            <span className={styles.pitchLine} style={{ top: '66%' }} />
            {starters.map((player, index) => {
              const spot = player.number !== null ? RUGBY_SPOTS[player.number] : null;
              if (!spot) return null;
              return (
                <span
                  key={`${player.number}-${player.name}`}
                  className={styles.pitchPlayer}
                  style={{ left: `${spot[0]}%`, top: `${spot[1]}%`, '--ov-i': index } as CSSProperties}
                >
                  <b>{player.number}</b>
                  <span>{lastName(player.name)}{player.captain ? ' (C)' : ''}</span>
                </span>
              );
            })}
          </div>
          <Bench players={players.filter((player) => !player.starter)} />
        </div>
      ) : (
        <LineupList team={team} players={players} color={team.color} hideHeader />
      )}
    </G22Card>
  );
}

function LineupList({ team, players, color, hideHeader = false }: { team: OverlayTeam; players: Player[]; color: string | null; hideHeader?: boolean }) {
  const starters = players.filter((player) => player.starter);
  const bench = players.filter((player) => !player.starter);
  return (
    <div className={styles.lineup} style={{ '--ov-team': color ?? '#00a365' } as CSSProperties}>
      {!hideHeader ? (
        <div className={styles.lineupHead}>
          <Crest src={team.logo} name={team.name} />
          <span>{team.name}</span>
        </div>
      ) : null}
      <ol className={styles.lineupList}>
        {starters.map((player, index) => (
          <li key={`${player.number}-${player.name}`} style={{ '--ov-i': index } as CSSProperties}>
            <b>{player.number ?? '·'}</b>
            <span>{player.name}{player.captain ? ' (C)' : ''}</span>
            {player.position ? <small>{player.position}</small> : null}
          </li>
        ))}
      </ol>
      <Bench players={bench} />
    </div>
  );
}

function Bench({ players }: { players: Player[] }) {
  if (!players.length) return null;
  return (
    <div className={styles.bench}>
      <span className={styles.benchTitle}>Suplentes</span>
      <span className={styles.benchNames}>
        {players.map((player) => `${player.number ?? ''} ${lastName(player.name)}`.trim()).join(' · ')}
      </span>
    </div>
  );
}
