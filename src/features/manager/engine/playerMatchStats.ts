// Atribuidor post-hoc de estadísticas por jugador y cálculo de rating 0,0–9,9.
//
// El motor (matchEngine + phases) genera un MatchResult con events[] y contadores
// agregados por equipo. Para atribuir cada acción a un jugador concreto sin
// reescribir el motor, este módulo recorre events[] tras la simulación y reparte
// cada evento al jugador en cancha que más plausiblemente lo protagonizó,
// respetando el log de sustituciones.
//
// El resultado son PlayerMatchStats por cada jugador que pisó cancha (titular
// que jugó >0 min o suplente que entró). Cada jugador recibe además un rating
// 0,0–9,9 derivado de sus stats, la posición y el resultado del equipo.

import type { ID, Player, RugbyPosition, PlayerMatchStats, MatchSub } from '../types/index.ts'
import type { EventType, MatchEvent, MatchResult, Side } from './types.ts'
import { createRNG } from './rng.ts'

export type SubLog = MatchSub[]

export interface Lineup {
  starters: Player[]
  bench: Player[]
}

/** Probabilidad relativa de anotar un ensayo por posición (de playerStats.ts). */
const TRY_WEIGHT: Record<RugbyPosition, number> = {
  1: 0.3, 2: 0.5, 3: 0.3, 4: 0.4, 5: 0.4,
  6: 0.6, 7: 0.7, 8: 1.0,
  9: 0.5, 10: 0.7,
  11: 1.6, 12: 1.0, 13: 1.2, 14: 1.6, 15: 1.0
}

/** Posiciones por rol funcional, para elegir candidato según el tipo de evento. */
const FRONT_ROW: RugbyPosition[] = [1, 2, 3]
const LOCKS: RugbyPosition[] = [4, 5]
const BACK_ROW: RugbyPosition[] = [6, 7, 8]
const HALF_BACKS: RugbyPosition[] = [9, 10]
const CENTRES: RugbyPosition[] = [12, 13]
const BACK_THREE: RugbyPosition[] = [11, 14, 15]
const FORWARDS: RugbyPosition[] = [...FRONT_ROW, ...LOCKS, ...BACK_ROW]
const BACKS: RugbyPosition[] = [9, 10, 11, 12, 13, 14, 15]

const TOTAL_MINUTES = 80

function emptyStats(playerId: ID, side: Side, position: RugbyPosition): PlayerMatchStats {
  return {
    playerId, side, position,
    minutesPlayed: 0,
    tries: 0, tryAssists: 0,
    tackles: 0, missedTackles: 0,
    carries: 0, metresGained: 0,
    lineBreaks: 0, offloads: 0,
    turnoversWon: 0,
    handlingErrors: 0,
    penaltiesConceded: 0,
    cards: { yellow: 0, red: 0 },
    kicksFromHand: 0,
    kicksAtPosts: { attempted: 0, made: 0 },
    rating: 0
  }
}

/** Aplica el log de sustituciones a la alineación inicial y devuelve, por minuto,
 *  el mapeo posición → playerId y los minutos jugados por cada jugador del lado. */
export function buildPresence(lineup: Lineup, subs: SubLog, side: Side): {
  on: (minute: number) => Map<RugbyPosition, Player>
  minutes: Map<ID, number>
  positionOf: Map<ID, RugbyPosition>
} {
  // Estado inicial: starters cubren su posición primaria
  const initial = new Map<RugbyPosition, Player>()
  for (const p of lineup.starters) {
    initial.set(p.primaryPosition as RugbyPosition, p)
  }
  const positionOf = new Map<ID, RugbyPosition>()
  for (const p of lineup.starters) positionOf.set(p.id, p.primaryPosition as RugbyPosition)

  // Sólo subs del mismo lado, ordenadas por minuto
  const sideSubs = subs.filter((s) => s.side === side).sort((a, b) => a.minute - b.minute)

  // Precomputar slots a lo largo del partido. Como el motor solo trabaja por
  // minuto entero, generamos un snapshot por minuto. Para no gastar memoria,
  // devolvemos una función `on(minute)` que aplica subs hasta ese minuto.
  const benchById = new Map(lineup.bench.map((p) => [p.id, p] as const))
  const starterById = new Map(lineup.starters.map((p) => [p.id, p] as const))

  const computeOn = (minute: number) => {
    const slots = new Map(initial)
    const offIds = new Set<ID>()
    for (const sub of sideSubs) {
      if (sub.minute > minute) break
      // Localizar la posición actual del jugador que sale
      let posOfOff: RugbyPosition | undefined
      for (const [pos, pl] of slots) {
        if (pl.id === sub.off) { posOfOff = pos; break }
      }
      if (!posOfOff) continue
      const inPlayer = benchById.get(sub.on) ?? starterById.get(sub.on)
      if (!inPlayer) continue
      slots.set(posOfOff, inPlayer)
      offIds.add(sub.off)
      positionOf.set(inPlayer.id, posOfOff)
    }
    return slots
  }
  // Se pide por cada evento del partido (cientos) y casi todos caen en minutos repetidos:
  // el resultado solo depende del minuto, y quien lo recibe solo lo LEE.
  const cache = new Map<number, Map<RugbyPosition, Player>>()
  const on = (minute: number) => {
    let slots = cache.get(minute)
    if (!slots) {
      slots = computeOn(minute)
      cache.set(minute, slots)
    }
    return slots
  }

  // Calcular minutos jugados por jugador (titulares + suplentes que entraron)
  const minutes = new Map<ID, number>()
  // Comenzar todos los starters con 80 y descontar al minuto que sale (si sale)
  for (const p of lineup.starters) minutes.set(p.id, TOTAL_MINUTES)
  for (const sub of sideSubs) {
    // El que sale: jugó del 0 al sub.minute
    const offMin = Math.max(0, Math.min(TOTAL_MINUTES, sub.minute))
    if (minutes.has(sub.off)) {
      minutes.set(sub.off, offMin)
    }
    // El que entra: jugó del sub.minute al final
    const onMin = Math.max(0, TOTAL_MINUTES - offMin)
    minutes.set(sub.on, (minutes.get(sub.on) ?? 0) + onMin)
  }

  return { on, minutes, positionOf }
}

/** Elige un jugador candidato de entre los slots del lado, dada una lista de
 *  posiciones preferidas y un atributo de tie-break ("higher is better"). */
function pickByPositions(
  slots: Map<RugbyPosition, Player>,
  positions: RugbyPosition[],
  scorer: (p: Player) => number,
  rng: () => number
): Player | undefined {
  const candidates: Array<{ p: Player; w: number }> = []
  for (const pos of positions) {
    const p = slots.get(pos)
    if (p) candidates.push({ p, w: Math.max(0.01, scorer(p)) })
  }
  if (candidates.length === 0) return undefined
  const total = candidates.reduce((a, c) => a + c.w, 0)
  let r = rng() * total
  for (const c of candidates) {
    r -= c.w
    if (r <= 0) return c.p
  }
  return candidates[candidates.length - 1].p
}

/** Pateador designado del lado: 10 si está en cancha y tiene buen kickPosts;
 *  si no, 15. Estable a lo largo del partido salvo subs. */
export function designatedKicker(slots: Map<RugbyPosition, Player>): Player | undefined {
  const fly = slots.get(10)
  const fb = slots.get(15)
  if (fly && fb) {
    return (fly.attributes.technical.kickPosts >= fb.attributes.technical.kickPosts) ? fly : fb
  }
  return fly ?? fb ?? slots.get(12) ?? slots.get(9)
}

/** Quién protagoniza un evento. `primary` es el jugador al que se le acredita la
 *  acción; `secondary` solo existe en el ensayo (el pase decisivo). */
export interface EventActors {
  primary?: Player
  /** Lado al que pertenece `primary`: en un placaje es el defensor. */
  primarySide?: Side
  secondary?: Player
}

function otherSide(side: Side): Side { return side === 'home' ? 'away' : 'home' }

/** Elige al protagonista de un evento entre los jugadores en cancha. Consume `rng`
 *  exactamente igual que antes de separar la elección de la acreditación. */
export function chooseEventActors(
  ev: MatchEvent,
  evSlots: Map<RugbyPosition, Player>,
  evDefenderSlots: Map<RugbyPosition, Player>,
  rng: () => number,
  tryScorerForMinute?: Player
): EventActors {
  if (!ev.side) return {}
  // En estos eventos `ev.side` es quien se BENEFICIA (el que placa, el que recibe la
  // melé o la touch), pero el protagonista es el rival: el que comete el error. Se
  // da vuelta el lado para elegirlo entre los jugadores correctos.
  const blamesOpponent = ev.type === 'knock_on' || ev.type === 'lineout_lost'
    || ev.type === 'scrum_collapse' || ev.type === 'tackle'
  const side = blamesOpponent ? otherSide(ev.side) : ev.side
  const slots = blamesOpponent ? evDefenderSlots : evSlots
  const defenderSlots = blamesOpponent ? evSlots : evDefenderSlots
  const own = (primary: Player | undefined): EventActors => ({ primary, primarySide: side })

  switch (ev.type as EventType) {
    case 'try': {
      // Si tryScorerForMinute viene predeterminado (de buildPlayedMatch), úsalo.
      // Si no, escoger por TRY_WEIGHT entre los que están en cancha.
      const scorer = tryScorerForMinute ?? pickByPositions(
        slots,
        [...BACK_THREE, ...CENTRES, 10, 8, 9, 7, 6],
        (p) => TRY_WEIGHT[p.primaryPosition as RugbyPosition] ?? 0.5,
        rng
      )
      // Asistencia: un back distinto al try-scorer
      const assistCandidates = [10, 12, 13, 9, 15, 11, 14] as RugbyPosition[]
      let assist: Player | undefined
      for (const pos of assistCandidates) {
        const p = slots.get(pos)
        if (p && p.id !== scorer?.id) { assist = p; break }
      }
      return { primary: scorer, primarySide: side, secondary: assist }
    }
    case 'conversion':
    case 'penalty_kick':
    case 'drop_goal':
    case 'penalty_kick_missed':
    case 'drop_goal_missed':
      return own(designatedKicker(slots))
    case 'tackle': {
      // Tackle es del DEFENSOR, lado contrario a quien tenía la posesión.
      const defender = pickByPositions(
        defenderSlots,
        ev.zone === 'opp22' || ev.zone === 'midOpp' ? [12, 13, 7, 6, 8, 11, 14, 15] : [...BACK_ROW, ...LOCKS, ...FRONT_ROW],
        (p) => p.attributes.technical.tackle * 5,
        rng
      )
      return { primary: defender, primarySide: otherSide(side) }
    }
    case 'line_break':
    case 'tackle_break':
      return own(pickByPositions(
        slots,
        [...BACK_THREE, ...CENTRES, 10, 8, 7, 9],
        (p) => p.attributes.physical.pace * 3 + p.attributes.technical.ballCarry * 2,
        rng
      ))
    case 'offload':
      return own(pickByPositions(
        slots,
        [8, 12, 13, ...BACK_THREE, ...BACK_ROW],
        (p) => p.attributes.technical.handling * 3 + p.attributes.technical.passShort * 2,
        rng
      ))
    case 'knock_on':
      return own(pickByPositions(
        slots,
        [...BACK_THREE, ...CENTRES, 9, 10, 8],
        (p) => Math.max(1, 25 - p.attributes.technical.handling),
        rng
      ))
    case 'jackal_steal':
    case 'turnover':
      return own(pickByPositions(
        slots,
        [7, 6, 8, ...LOCKS],
        (p) => p.attributes.mental.anticipation * 3 + p.attributes.technical.tackle * 2,
        rng
      ))
    case 'ruck_pickgo':
      return own(pickByPositions(
        slots,
        [9, 8],
        (p) => p.attributes.technical.passShort * 2 + p.attributes.physical.power * 2,
        rng
      ))
    case 'box_kick':
    case 'box_kick_chase_won':
    case 'box_kick_chase_lost':
      return own(slots.get(9))
    case 'kick_to_touch':
    case 'grubber':
    case 'chip_kick':
    case 'cross_kick':
      return own(slots.get(10) ?? slots.get(15) ?? slots.get(9))
    case 'penalty_to_touch':
    case 'penalty_won':
      // El penalti ganado normalmente lo provoca el defensor o el atacante atropellado.
      return own(pickByPositions(
        slots,
        [...BACK_ROW, ...HALF_BACKS, ...FRONT_ROW],
        (p) => p.attributes.mental.workrate * 2 + p.attributes.mental.discipline * 2,
        rng
      ))
    case 'scrum_won':
    case 'scrum_penalty':
      // Crédito al 8, que es quien lleva el balón al salir de la melé.
      return own(slots.get(8))
    case 'lineout_won':
      // Salta uno de los saltadores (no suma estadística individual).
      return own(pickByPositions(slots, [4, 5, 6, 7], (p) => p.attributes.technical.lineoutJump * 5, rng))
    case 'lineout_lost':
      // Pequeño descuento al hooker (handling) cuando se pierde tu touch.
      return own(slots.get(2))
    case 'yellow_card':
    case 'scrum_collapse':
      // Yellow lo paga el más expuesto. Scrum collapse repetido típico del pilar (1 o 3).
      return own(ev.type === 'yellow_card'
        ? pickByPositions(slots, [...BACK_ROW, ...HALF_BACKS, ...FRONT_ROW], (p) => Math.max(1, 25 - p.attributes.mental.discipline), rng)
        : pickByPositions(slots, [1, 3], (p) => Math.max(1, 25 - p.attributes.technical.scrum), rng))
    default:
      // Eventos puramente narrativos (commentary, kickoff, half_end, full_time,
      // maul_*, ruck_*, scrum_reset, mark_called, quick_tap, drop_goal_attempt,
      // phase_play, ruck_use_it_warn) no atribuyen stat individual.
      return {}
  }
}

/** Acredita el evento a quien lo protagonizó. */
export function applyEventActors(
  ev: MatchEvent,
  actors: EventActors,
  stats: Map<ID, PlayerMatchStats>
): void {
  const inc = (p: Player | undefined, fn: (s: PlayerMatchStats) => void) => {
    if (!p) return
    const s = stats.get(p.id)
    if (s) fn(s)
  }
  const { primary, secondary } = actors

  switch (ev.type as EventType) {
    case 'try':
      inc(primary, (s) => { s.tries += 1; s.carries += 1; s.metresGained += 10 })
      inc(secondary, (s) => { s.tryAssists += 1 })
      return
    case 'conversion':
    case 'penalty_kick':
    case 'drop_goal':
      inc(primary, (s) => {
        s.kicksAtPosts.attempted += 1
        s.kicksAtPosts.made += 1
        // Drop goal cuenta como kick desde la mano también
        if (ev.type === 'drop_goal') s.kicksFromHand += 1
      })
      return
    case 'penalty_kick_missed':
    case 'drop_goal_missed':
      inc(primary, (s) => { s.kicksAtPosts.attempted += 1 })
      return
    case 'tackle':
      inc(primary, (s) => { s.tackles += 1 })
      return
    case 'line_break':
    case 'tackle_break':
      inc(primary, (s) => { s.lineBreaks += 1; s.carries += 1; s.metresGained += 12 })
      return
    case 'offload':
      inc(primary, (s) => { s.offloads += 1; s.carries += 1; s.metresGained += 4 })
      return
    case 'knock_on':
      inc(primary, (s) => { s.handlingErrors += 1 })
      return
    case 'jackal_steal':
    case 'turnover':
      inc(primary, (s) => { s.turnoversWon += 1; s.tackles += 1 })
      return
    case 'ruck_pickgo':
      inc(primary, (s) => { s.carries += 1; s.metresGained += 3 })
      return
    case 'box_kick':
    case 'box_kick_chase_won':
    case 'box_kick_chase_lost':
    case 'kick_to_touch':
    case 'grubber':
    case 'chip_kick':
    case 'cross_kick':
      inc(primary, (s) => { s.kicksFromHand += 1 })
      return
    case 'penalty_to_touch':
    case 'penalty_won':
      inc(primary, (s) => { s.turnoversWon += 1 })
      return
    case 'scrum_won':
    case 'scrum_penalty':
      inc(primary, (s) => { s.carries += 1 })
      return
    case 'lineout_lost':
      inc(primary, (s) => { s.handlingErrors += 1 })
      return
    case 'yellow_card':
    case 'scrum_collapse':
      inc(primary, (s) => {
        if (ev.type === 'yellow_card') s.cards.yellow += 1
        s.penaltiesConceded += 1
      })
      return
    default:
      return
  }
}

/** Atribuye un evento concreto al jugador más plausible del side propietario. */
function attributeEvent(
  ev: MatchEvent,
  stats: Map<ID, PlayerMatchStats>,
  slots: Map<RugbyPosition, Player>,
  defenderSlots: Map<RugbyPosition, Player>,
  rng: () => number,
  tryScorerForMinute: Player | undefined
): void {
  if (!ev.side) return
  applyEventActors(ev, chooseEventActors(ev, slots, defenderSlots, rng, tryScorerForMinute), stats)
}

/** Calcula rating 0,0–9,9 con 1 decimal. */
function computeRating(
  stat: PlayerMatchStats,
  teamResult: 'win' | 'draw' | 'loss',
  rng: () => number
): number {
  if (stat.minutesPlayed <= 0) return 0
  if (stat.minutesPlayed < 10) {
    const base = teamResult === 'win' ? 6.0 : teamResult === 'loss' ? 5.5 : 5.8
    return Math.round((base + (rng() - 0.5) * 0.2) * 10) / 10
  }

  let r = 6.0
  r += stat.tries * 1.2
  r += stat.tryAssists * 0.6
  r += stat.lineBreaks * 0.4
  if (stat.tackles > 10) r += Math.min(0.8, (stat.tackles - 10) * 0.05)
  r += stat.offloads * 0.2
  r += stat.turnoversWon * 0.4
  r += stat.kicksAtPosts.made * 0.15
  if (stat.kicksAtPosts.attempted > stat.kicksAtPosts.made) {
    r -= (stat.kicksAtPosts.attempted - stat.kicksAtPosts.made) * 0.2
  }
  r -= stat.handlingErrors * 0.3
  r -= stat.missedTackles * 0.2
  r -= stat.penaltiesConceded * 0.15
  r -= stat.cards.yellow * 0.8
  r -= stat.cards.red * 1.5

  r += teamResult === 'win' ? 0.3 : teamResult === 'loss' ? -0.3 : 0

  // Pequeño jitter determinista (±0.1) para diferenciar empates
  r += (rng() - 0.5) * 0.2

  if (r < 0) r = 0
  if (r > 9.9) r = 9.9
  return Math.round(r * 10) / 10
}

/** Hash determinista a partir de strings (FNV-1a). */
function hashSeed(...parts: string[]): number {
  let h = 0x811c9dc5
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = (h * 0x01000193) >>> 0
    }
  }
  return h >>> 0
}

export interface AttributeOpts {
  matchId: string
  homeStarters: Player[]
  homeBench: Player[]
  awayStarters: Player[]
  awayBench: Player[]
  subs: SubLog
  homeTryScorers?: ID[]
  awayTryScorers?: ID[]
  /** Protagonistas ya elegidos, uno por evento de `result.events` (mismo índice).
   *  Los usa el partido en vivo para que las estadísticas coincidan con lo que
   *  el relato dijo. Un hueco (undefined) se atribuye como siempre. */
  eventActors?: Array<EventActors | undefined>
  result: MatchResult
}

export function attributePlayerStats(opts: AttributeOpts): PlayerMatchStats[] {
  const home: Lineup = { starters: opts.homeStarters, bench: opts.homeBench }
  const away: Lineup = { starters: opts.awayStarters, bench: opts.awayBench }
  const homePresence = buildPresence(home, opts.subs, 'home')
  const awayPresence = buildPresence(away, opts.subs, 'away')

  const allPlayers = new Map<ID, Player>()
  for (const p of [...home.starters, ...home.bench, ...away.starters, ...away.bench]) {
    allPlayers.set(p.id, p)
  }

  const stats = new Map<ID, PlayerMatchStats>()

  // Inicializar PlayerMatchStats sólo para jugadores que jugaron >0 minutos
  const initSide = (side: Side, presence: typeof homePresence, lineup: Lineup) => {
    for (const p of [...lineup.starters, ...lineup.bench]) {
      const min = presence.minutes.get(p.id) ?? 0
      if (min <= 0) continue
      const pos = presence.positionOf.get(p.id) ?? (p.primaryPosition as RugbyPosition)
      const s = emptyStats(p.id, side, pos)
      s.minutesPlayed = Math.max(0, Math.min(TOTAL_MINUTES, min))
      stats.set(p.id, s)
    }
  }
  initSide('home', homePresence, home)
  initSide('away', awayPresence, away)

  // Cola de tryScorers ya distribuidos en buildPlayedMatch, para mantener
  // coherencia con la UI. Los consumimos en orden de aparición de eventos 'try'.
  const homeTryQ = [...(opts.homeTryScorers ?? [])]
  const awayTryQ = [...(opts.awayTryScorers ?? [])]

  const rngObj = createRNG(hashSeed(opts.matchId, 'attribute'))
  const rng = () => rngObj.next()

  for (let evIndex = 0; evIndex < opts.result.events.length; evIndex++) {
    const ev = opts.result.events[evIndex]
    if (!ev.side) continue
    const given = opts.eventActors?.[evIndex]
    if (given) {
      applyEventActors(ev, given, stats)
      continue
    }
    const isHome = ev.side === 'home'
    const slots = isHome ? homePresence.on(ev.minute) : awayPresence.on(ev.minute)
    const defenderSlots = isHome ? awayPresence.on(ev.minute) : homePresence.on(ev.minute)

    let predeterminedTryScorer: Player | undefined
    if (ev.type === 'try') {
      const q = isHome ? homeTryQ : awayTryQ
      const id = q.shift()
      if (id) {
        const candidate = allPlayers.get(id)
        if (candidate) predeterminedTryScorer = candidate
      }
    }

    attributeEvent(ev, stats, slots, defenderSlots, rng, predeterminedTryScorer)
  }

  // Resultado del equipo desde el marcador final
  const homeRes: 'win' | 'draw' | 'loss' =
    opts.result.finalScore.home > opts.result.finalScore.away ? 'win' :
    opts.result.finalScore.home < opts.result.finalScore.away ? 'loss' : 'draw'
  const awayRes: 'win' | 'draw' | 'loss' = homeRes === 'win' ? 'loss' : homeRes === 'loss' ? 'win' : 'draw'

  // Calcular rating al final
  for (const s of stats.values()) {
    const teamRes = s.side === 'home' ? homeRes : awayRes
    const playerRngObj = createRNG(hashSeed(opts.matchId, s.playerId))
    s.rating = computeRating(s, teamRes, () => playerRngObj.next())
  }

  return [...stats.values()]
}

/** Heurística de IA: genera 3–5 subs para un equipo entre el min 50 y el 75.
 *  Las posiciones a cambiar prefieren forwards (más fatiga). Seed determinista. */
export function autoSubsFor(side: Side, lineup: { starters: Player[]; bench: Player[] }, seed: number): SubLog {
  if (lineup.bench.length === 0) return []
  const rngObj = createRNG(seed)
  const rng = () => rngObj.next()
  const targetCount = 3 + Math.floor(rng() * 3) // 3..5
  const log: SubLog = []
  const usedBench = new Set<ID>()
  const replacedStarters = new Set<ID>()

  // Posiciones candidatas a sub: típicas en rugby (1, 2, 3, 4/5, 6/7, 9, 10/12, 14/15)
  const order: RugbyPosition[][] = [
    [1], [3], [2], [4, 5], [6, 7, 8], [9], [10, 12, 13], [11, 14, 15]
  ]

  for (let i = 0; i < targetCount && i < order.length; i++) {
    const positions = order[i]
    const starter = lineup.starters.find((p) => positions.includes(p.primaryPosition as RugbyPosition) && !replacedStarters.has(p.id))
    if (!starter) continue
    const replacement = lineup.bench.find((p) =>
      !usedBench.has(p.id) && (
        positions.includes(p.primaryPosition as RugbyPosition) ||
        p.secondaryPositions.some((sp) => positions.includes(sp as RugbyPosition))
      )
    )
    if (!replacement) continue
    const minute = 50 + Math.floor(rng() * 26) // 50..75
    log.push({ side, minute, off: starter.id, on: replacement.id })
    usedBench.add(replacement.id)
    replacedStarters.add(starter.id)
  }
  return log.sort((a, b) => a.minute - b.minute)
}
