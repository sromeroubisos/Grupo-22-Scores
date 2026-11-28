/**
 * Forma de la respuesta de `GET /api/overlay` (ver `src/lib/server/overlayFeed.ts`).
 * Vive aparte del servidor para que el cliente la importe sin arrastrar Supabase.
 *
 * Los partidos van "crudos", con la forma que lee `toOverlayMatch`: el cliente
 * los pasa por ahí y reloj, estado y marcador se resuelven igual que en el
 * marcador de un partido solo.
 */

export type OverlayFeedKind = 'partidos' | 'fecha' | 'dia' | 'home' | 'playoff' | 'jugador' | 'tabla' | 'goleadores' | 'noticia' | 'grupo';

export interface OverlayBracketRound {
  name: string;
  /** Payload de partido + `code` (llave) + `winnerSide`. */
  matches: Array<Record<string, unknown>>;
}

export interface OverlayBracketCup {
  name: string;
  rounds: OverlayBracketRound[];
}

export interface OverlayPlayerStats {
  matches: number;
  starts: number;
  points: number;
  tries: number;
  conversions: number;
  penalties: number;
  dropGoals: number;
  yellowCards: number;
  redCards: number;
  wins: number;
  draws: number;
  losses: number;
  minutes: number | null;
}

export interface OverlayPlayer {
  id: string;
  name: string;
  photo: string | null;
  position: string | null;
  number: number | null;
  age: number | null;
  club: { name: string; short: string; logo: string | null; color: string | null } | null;
  scope: string;
  stats: OverlayPlayerStats;
  recent: Array<{
    id: string;
    date: string | null;
    result: 'win' | 'loss' | 'draw' | null;
    rival: string;
    score: string | null;
    points: number;
  }>;
}

export interface OverlayStandingRow {
  position: number;
  teamId: string | null;
  name: string;
  logo: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  bonus: number;
  points: number;
  form: string | null;
  /** Zona, cuando la fase tiene más de una (la tabla se muestra por zonas). */
  group: string | null;
}

export interface OverlayLeaderRow {
  rank: number;
  name: string;
  club: string | null;
  clubLogo: string | null;
  value: number;
  matches: number | null;
}

export interface OverlayNews {
  id: string;
  title: string;
  summary: string | null;
  image: string | null;
  publishedAt: string | null;
  sport: string | null;
  path: string;
}

export interface OverlayFeed {
  kind: OverlayFeedKind;
  title: string;
  subtitle: string | null;
  logo: string | null;
  matches?: Array<Record<string, unknown>>;
  bracket?: { cups: OverlayBracketCup[] };
  player?: OverlayPlayer;
  table?: { rows: OverlayStandingRow[]; sport: string | null };
  leaders?: { stat: string; label: string; unit: string; rows: OverlayLeaderRow[]; official: boolean };
  news?: OverlayNews;
  /** Hubo más partidos que el tope: el gráfico lo dice en vez de cortar callado. */
  truncated?: boolean;
}
