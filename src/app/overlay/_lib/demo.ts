import type { OverlayFeed, OverlayFeedKind } from '@/lib/overlay/overlayFeedTypes';

/**
 * Datos de muestra (`?prueba=1`): para ubicar y encuadrar el gráfico en OBS/vMix
 * antes de que haya un partido, y para la vista previa del generador. Nombres
 * inventados a propósito: nada de esto puede confundirse con un resultado real.
 */

const CLUBS = [
  ['Club Local', 'Local'],
  ['Club Visitante', 'Visitante'],
  ['Atlético Norte', 'Atl. Norte'],
  ['Deportivo Sur', 'Dep. Sur'],
  ['Universitario Oeste', 'Univ. Oeste'],
  ['Club del Este', 'Del Este'],
  ['Sportivo Centro', 'Sp. Centro'],
  ['Social del Río', 'Del Río'],
] as const;

const CONTEXTS = ['Copa de Oro · Zona A · Fecha 7', 'Copa de Oro · Zona B · Fecha 7', 'Playoff · Cuartos de final'];

function team(index: number) {
  const [name, short] = CLUBS[index % CLUBS.length];
  return { name, short_name: short, logo: null, primary_color: null };
}

function iso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function match(id: string, home: number, away: number, status: string, score: [number, number] | null, minutesFromNow = 0) {
  return {
    id,
    status,
    date_time: iso(minutesFromNow),
    score: score ? { home: score[0], away: score[1] } : null,
    clock: status === 'live'
      ? { accumulated_seconds: 40 * 60, period_started_at: iso(-14), is_running: true, period: '2T' }
      : null,
    sport_id: 'rugby',
    context_label: CONTEXTS[(home + away) % CONTEXTS.length],
    homeClub: team(home),
    awayClub: team(away),
    tournament: { name: 'Torneo de prueba' },
  };
}

const LIST = [
  match('d1', 0, 1, 'live', [24, 17]),
  match('d2', 2, 3, 'final', [31, 12], -120),
  match('d3', 4, 5, 'final', [19, 22], -150),
  match('d4', 6, 7, 'scheduled', null, 90),
  match('d5', 1, 2, 'scheduled', null, 150),
  match('d6', 3, 4, 'scheduled', null, 1500),
];

export function demoFeed(kind: OverlayFeedKind): OverlayFeed {
  if (kind === 'jugador') {
    return {
      kind,
      title: 'Juan Pérez',
      subtitle: 'Torneo de prueba',
      logo: null,
      player: {
        id: 'demo',
        name: 'Juan Pérez',
        photo: null,
        position: 'Apertura',
        number: 10,
        age: null,
        club: { name: 'Club Local', short: 'Local', logo: null, color: '#00a365' },
        scope: 'Torneo de prueba',
        stats: {
          matches: 12, starts: 11, points: 128, tries: 4, conversions: 24, penalties: 20,
          dropGoals: 0, yellowCards: 1, redCards: 0, wins: 8, draws: 1, losses: 3, minutes: 860,
        },
        recent: [
          { id: 'r1', date: null, result: 'win', rival: 'Atl. Norte', score: '27-13', points: 12 },
          { id: 'r2', date: null, result: 'win', rival: 'Dep. Sur', score: '19-15', points: 9 },
          { id: 'r3', date: null, result: 'loss', rival: 'Univ. Oeste', score: '10-24', points: 5 },
          { id: 'r4', date: null, result: 'draw', rival: 'Del Este', score: '18-18', points: 8 },
          { id: 'r5', date: null, result: 'win', rival: 'Sp. Centro', score: '35-7', points: 15 },
        ],
      },
    };
  }

  if (kind === 'playoff') {
    return {
      kind,
      title: 'Torneo de prueba',
      subtitle: 'Playoff',
      logo: null,
      bracket: {
        cups: [{
          name: 'Copa de Oro',
          rounds: [
            {
              name: 'Semifinales',
              matches: [
                { ...match('s1', 0, 7, 'final', [28, 10], -2880), winnerSide: 'home' },
                { ...match('s2', 2, 4, 'final', [15, 21], -2900), winnerSide: 'away' },
              ],
            },
            { name: 'Final', matches: [match('f1', 0, 4, 'live', [13, 12])] },
          ],
        }],
      },
    };
  }

  if (kind === 'tabla') {
    const names = ['Club Local', 'Atlético Norte', 'Club Visitante', 'Deportivo Sur', 'Universitario Oeste', 'Club del Este', 'Sportivo Centro', 'Social del Río'];
    return {
      kind,
      title: 'Torneo de prueba',
      subtitle: 'Tabla de posiciones',
      logo: null,
      table: {
        sport: 'rugby',
        rows: names.map((name, index) => ({
          position: index + 1, teamId: null, name, logo: null,
          played: 10, won: 9 - index, drawn: index % 3 === 0 ? 1 : 0, lost: index, pointsFor: 300 - index * 25,
          pointsAgainst: 120 + index * 18, diff: 180 - index * 43, bonus: Math.max(0, 6 - index), points: 44 - index * 5,
          form: null, group: null,
        })),
      },
    };
  }

  if (kind === 'goleadores') {
    return {
      kind,
      title: 'Torneo de prueba',
      subtitle: 'Máximos anotadores',
      logo: null,
      leaders: {
        stat: 'puntos', label: 'Máximos anotadores', unit: 'PTS', official: false,
        rows: [
          { rank: 1, name: 'Juan Pérez', club: 'Club Local', clubLogo: null, value: 128, matches: 12 },
          { rank: 2, name: 'Martín Gómez', club: 'Atlético Norte', clubLogo: null, value: 97, matches: 11 },
          { rank: 3, name: 'Tomás Díaz', club: 'Deportivo Sur', clubLogo: null, value: 88, matches: 12 },
          { rank: 4, name: 'Lucas Romero', club: 'Club del Este', clubLogo: null, value: 61, matches: 10 },
          { rank: 5, name: 'Santiago Ruiz', club: 'Sportivo Centro', clubLogo: null, value: 55, matches: 9 },
        ],
      },
    };
  }

  if (kind === 'noticia') {
    return {
      kind,
      title: 'G22 Noticias',
      subtitle: 'Rugby',
      logo: null,
      news: {
        id: 'demo', title: 'Título de prueba para ver cómo queda la placa', image: null,
        summary: 'La bajada de la nota va acá, en dos o tres líneas, para que se lea al aire sin apuro.',
        publishedAt: null, sport: 'rugby', path: '/noticias',
      },
    };
  }

  if (kind === 'home') {
    return {
      kind,
      title: 'Partidos del día',
      subtitle: 'Sábado',
      logo: null,
      matches: LIST.map((item, index) => ({ ...item, group: index < 3 ? 'Torneo de prueba' : 'Otro torneo' })),
    };
  }

  const titles: Record<string, [string, string | null]> = {
    partidos: ['Partidos', null],
    fecha: ['Torneo de prueba', 'Fecha 7'],
    dia: ['Partidos del día', 'Sábado'],
  };
  const [title, subtitle] = titles[kind] ?? ['Partidos', null];
  return { kind, title, subtitle, logo: null, matches: LIST };
}
