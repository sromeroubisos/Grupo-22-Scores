// La transmisión del partido: convierte cada evento del motor en una jugada con
// lugar en la cancha, protagonistas con nombre y estadísticas corriendo.
//
// El motor sabe quién tiene la pelota y en qué cuarto del campo, pero no dónde
// exactamente ni quién la lleva. Acá se resuelve eso SIN tocar el azar del partido:
// el lugar sale de la zona del evento más una deriva sembrada con (partido, número
// de jugada), y el protagonista lo elige el mismo código que después reparte las
// estadísticas (`chooseEventActors`), así que el relato y la planilla no se
// contradicen. Misma semilla, mismas decisiones ⇒ misma transmisión.

import type { Player, RugbyPosition } from '../../types/index.ts'
import type { EventType, MatchEvent, MatchTeam, Side, Zone } from '../types.ts'
import {
  buildPresence, chooseEventActors, designatedKicker,
  type EventActors, type SubLog
} from '../playerMatchStats.ts'
import { createRNG } from '../rng.ts'
import { formationFor } from './formations.ts'
import type { BroadcastStats, Dot, Play, PlayActor, PlayKind, Pt, SideCounts } from './types.ts'

type Slots = Map<RugbyPosition, Player>

/** Tramo de la cancha (en metros desde el propio in-goal del que ataca) de cada zona. */
const ZONE_RANGE: Record<Zone, [number, number]> = {
  own22: [4, 22],
  midOwn: [22, 50],
  midOpp: [50, 78],
  opp22: [78, 96]
}

const KIND: Partial<Record<EventType, PlayKind>> = {
  kickoff: 'kickoff',
  scrum_won: 'scrum', scrum_penalty: 'scrum', scrum_reset: 'scrum', scrum_collapse: 'scrum',
  lineout_won: 'lineout', lineout_lost: 'lineout',
  maul_form: 'maul', maul_drive: 'maul', maul_stall: 'maul', maul_collapse: 'maul', maul_use_it: 'maul',
  penalty_kick: 'goal', penalty_kick_missed: 'goal', drop_goal: 'goal', drop_goal_missed: 'goal',
  drop_goal_attempt: 'goal', conversion: 'goal',
  try: 'try',
  kick_to_touch: 'kick', box_kick: 'kick', box_kick_chase_won: 'kick', box_kick_chase_lost: 'kick',
  grubber: 'kick', chip_kick: 'kick', cross_kick: 'kick', penalty_to_touch: 'kick',
  penalty_won: 'penalty', quick_tap: 'penalty', mark_called: 'penalty',
  half_end: 'idle', full_time: 'idle'
}

/** Eventos donde la pelota cambia de manos y la jugada se dibuja desde quien la queda. */
const SWITCHES_BALL = new Set<EventType>(['jackal_steal', 'turnover', 'penalty_won'])

/** Eventos que cortan la cadena de fases de una posesión. */
const BREAKS_PHASES = new Set<EventType>([
  'kickoff', 'scrum_won', 'scrum_penalty', 'scrum_reset', 'scrum_collapse',
  'lineout_won', 'lineout_lost', 'maul_form', 'maul_stall', 'maul_collapse',
  'penalty_kick', 'penalty_kick_missed', 'drop_goal', 'drop_goal_missed', 'conversion', 'try',
  'kick_to_touch', 'box_kick', 'grubber', 'chip_kick', 'cross_kick', 'penalty_to_touch',
  'penalty_won', 'quick_tap', 'turnover', 'jackal_steal', 'knock_on', 'half_end', 'full_time'
])

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const round1 = (n: number) => Math.round(n * 10) / 10

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

const zeroCounts = (): SideCounts => ({ home: 0, away: 0 })
const emptyStats = (): BroadcastStats => ({
  possession: zeroCounts(), territory: zeroCounts(), tackles: zeroCounts(), rucks: zeroCounts(),
  scrums: zeroCounts(), lineouts: zeroCounts(), turnovers: zeroCounts(), penalties: zeroCounts(),
  tries: zeroCounts()
})
const cloneStats = (s: BroadcastStats): BroadcastStats => ({
  possession: { ...s.possession }, territory: { ...s.territory }, tackles: { ...s.tackles },
  rucks: { ...s.rucks }, scrums: { ...s.scrums }, lineouts: { ...s.lineouts },
  turnovers: { ...s.turnovers }, penalties: { ...s.penalties }, tries: { ...s.tries }
})

/** Sentido del ataque de `side`: en el primer tiempo el local ataca hacia +x y en el
 *  segundo los equipos cambian de lado. */
export function attackDir(side: Side, half: 1 | 2): 1 | -1 {
  return (side === 'home') === (half === 1) ? 1 : -1
}

export interface BroadcastInit {
  matchId: string
  home: MatchTeam
  away: MatchTeam
}

export class Broadcast {
  /** Lista inmutable por tramos: cambia de identidad cada vez que suma jugadas, así
   *  la pantalla puede memoizar sobre ella. */
  plays: Play[] = []
  private readonly init: BroadcastInit
  private half: 1 | 2 = 1
  private lastX: number | null = null
  private lastY = 35
  private tryY = 35
  private phase = 0
  private lastAttacker: Side | null = null
  private stats = emptyStats()
  private lastMinute = 0
  private lastPlay: Play | null = null

  constructor(init: BroadcastInit) {
    this.init = init
  }

  /** Suma las jugadas de los eventos nuevos. `subs` son los cambios hechos hasta
   *  ahora (los dos lados): definen quién estaba en cancha en cada minuto. */
  extend(events: ReadonlyArray<MatchEvent>, subs: SubLog): void {
    if (events.length <= this.plays.length) return
    const { home, away, matchId } = this.init
    const presence = {
      home: buildPresence({ starters: home.starters, bench: home.bench }, subs, 'home'),
      away: buildPresence({ starters: away.starters, bench: away.bench }, subs, 'away')
    }
    const next = this.plays.slice()
    for (let i = next.length; i < events.length; i++) next.push(this.buildPlay(i, events[i], presence, matchId))
    this.plays = next
  }

  /** Protagonistas por evento, en el orden de `result.events`, para que la planilla
   *  de estadísticas acredite a quien el relato nombró. */
  eventActors(): Array<EventActors | undefined> {
    return this.plays.map((p) => (p.primary ? p.actors : undefined))
  }

  private teamName(side: Side): string {
    return (side === 'home' ? this.init.home : this.init.away).clubName
  }

  private buildPlay(
    index: number,
    ev: MatchEvent,
    presence: { home: ReturnType<typeof buildPresence>; away: ReturnType<typeof buildPresence> },
    matchId: string
  ): Play {
    // Las zonas del motor son desde la mirada de `ev.possession`; pero en una pelota recuperada
    // o un penal el equipo que queda con la pelota es el beneficiado, y es el que se dibuja atacando.
    const frame = ev.possession
    const attacker: Side = ev.side && SWITCHES_BALL.has(ev.type) ? ev.side : frame
    const dir = attackDir(attacker, this.half)
    const kind = this.kindOf(ev)
    const rng = createRNG(hashSeed(matchId, 'play', String(index)))
    const u = () => rng.next()

    // Quiénes están en cancha en ese minuto.
    const slotsOf = (s: Side): Slots => presence[s].on(ev.minute)
    const evSide = ev.side ?? attacker
    const homeSlots = slotsOf('home')
    const awaySlots = slotsOf('away')
    const sideSlots = evSide === 'home' ? homeSlots : awaySlots
    const oppSlots = evSide === 'home' ? awaySlots : homeSlots

    // Protagonista.
    const actors: EventActors = ev.side ? chooseEventActors(ev, sideSlots, oppSlots, () => u(), undefined) : {}
    let primary = this.toActor(actors.primary, actors.primarySide, homeSlots, awaySlots)
    if (!primary) {
      // Sin estadística propia pero con un protagonista claro para el relato.
      const fallback = this.narrativeActor(ev, kind, sideSlots)
      if (fallback) primary = this.toActor(fallback.player, fallback.side, homeSlots, awaySlots)
    }

    // Lugar de la pelota.
    const ball = kind === 'idle' ? this.currentBall() : this.placeBall(ev, kind, attackDir(frame, this.half), u)

    // Fases seguidas.
    if (this.lastAttacker !== attacker || BREAKS_PHASES.has(ev.type)) this.phase = 0
    if (ev.type === 'ruck_won' || ev.type === 'ruck_slow_ball' || ev.type === 'ruck_pickgo') this.phase += 1
    this.lastAttacker = attacker

    // Estadísticas: el tiempo desde la jugada anterior se le suma a quien tenía la pelota.
    this.accumulate(ev, attacker)

    const play: Play = {
      index,
      minute: ev.minute,
      half: this.half,
      attacker,
      dir,
      type: ev.type,
      kind,
      ball,
      phase: this.phase,
      headline: this.headline(ev, primary, attacker),
      detail: ev.text,
      actors,
      primary,
      stats: cloneStats(this.stats)
    }
    if (ev.type === 'half_end') this.half = 2
    this.lastPlay = play
    return play
  }

  private kindOf(ev: MatchEvent): PlayKind {
    const direct = KIND[ev.type]
    if (direct) return direct
    if (ev.type === 'commentary') {
      switch (ev.phase) {
        case 'conversion': return 'goal'
        case 'penalty': return 'penalty'
        case 'scrum': return 'scrum'
        case 'lineout': return 'lineout'
        case 'kickoff':
        case 'restart': return 'kickoff'
        default: return 'idle'
      }
    }
    return 'ruck'
  }

  private currentBall(): Pt {
    return { x: this.lastX ?? 50, y: this.lastY }
  }

  /** La pelota en metros. Continúa desde donde estaba, dentro del tramo de la zona del
   *  evento; las jugadas fijas tienen su sitio propio. */
  private placeBall(ev: MatchEvent, kind: PlayKind, dir: 1 | -1, u: () => number): Pt {
    const goalX = dir === 1 ? 100 : 0
    let x: number
    let y: number

    if (kind === 'kickoff') {
      x = 50; y = 35
    } else if (kind === 'try') {
      y = clamp(this.lastY + (u() - 0.5) * 16, 10, 60)
      x = goalX + dir * 3
      this.tryY = y
    } else if (kind === 'goal' && (ev.type === 'conversion' || ev.phase === 'conversion')) {
      // La conversión se patea en línea con el ensayo, tan atrás como quiera el pateador.
      x = goalX - dir * (9 + u() * 9)
      y = this.tryY
    } else {
      const [lo, hi] = ZONE_RANGE[ev.zone]
      const prevM = this.lastX === null ? 50 : dir === 1 ? this.lastX : 100 - this.lastX
      const drift = u()
      const m = prevM >= lo && prevM <= hi
        ? clamp(prevM + (drift - 0.38) * 8, lo, hi)
        : prevM < lo ? lo + drift * (hi - lo) * 0.35 : hi - drift * (hi - lo) * 0.35
      x = dir === 1 ? m : 100 - m
      if (kind === 'lineout') {
        y = u() < 0.5 ? 1 : 69
      } else if (kind === 'scrum') {
        y = clamp(this.lastY, 14, 56)
      } else if (kind === 'goal' || kind === 'penalty' || kind === 'maul') {
        y = clamp(this.lastY, 8, 62)
      } else {
        y = clamp(this.lastY + (u() - 0.5) * 18, 6, 64)
      }
    }

    x = round1(x)
    y = round1(y)
    this.lastX = x
    this.lastY = y
    return { x, y }
  }

  /** Estadísticas corriendo: tiempo de posesión y de territorio, y conteos. */
  private accumulate(ev: MatchEvent, attacker: Side): void {
    // El tiempo transcurrido se le acredita a quien tenía la pelota hasta ahora.
    const prev = this.lastPlay
    if (prev) {
      const dt = Math.max(0, ev.minute - this.lastMinute)
      this.stats.possession[prev.attacker] += dt
      const inOppHalf = (side: Side) => (attackDir(side, prev.half) === 1 ? prev.ball.x > 50 : prev.ball.x < 50)
      this.stats.territory[inOppHalf('home') ? 'home' : 'away'] += dt
    }
    this.lastMinute = ev.minute

    const s = ev.side ?? attacker
    switch (ev.type) {
      case 'tackle': this.stats.tackles[s] += 1; break
      case 'ruck_won':
      case 'ruck_slow_ball': this.stats.rucks[s] += 1; break
      case 'scrum_won': this.stats.scrums[attacker] += 1; break
      case 'scrum_penalty': this.stats.scrums[attacker] += 1; this.stats.penalties[s] += 1; break
      case 'lineout_won':
      case 'lineout_lost': this.stats.lineouts[attacker] += 1; break
      case 'turnover':
      case 'jackal_steal': this.stats.turnovers[s] += 1; break
      case 'penalty_won':
      case 'scrum_collapse':
      case 'maul_stall': this.stats.penalties[s] += 1; break
      case 'try': this.stats.tries[s] += 1; break
      default: break
    }
  }

  private toActor(
    player: Player | undefined,
    side: Side | undefined,
    homeSlots: Slots,
    awaySlots: Slots
  ): PlayActor | undefined {
    if (!player || !side) return undefined
    const slots = side === 'home' ? homeSlots : awaySlots
    for (const [position, p] of slots) {
      if (p.id === player.id) return { player, side, position }
    }
    return { player, side, position: player.primaryPosition as RugbyPosition }
  }

  /** Protagonista para el relato en eventos que no suman estadística individual. */
  private narrativeActor(ev: MatchEvent, kind: PlayKind, sideSlots: Slots): { player: Player; side: Side } | undefined {
    if (!ev.side) return undefined
    if (kind === 'kickoff') {
      const p = sideSlots.get(10) ?? sideSlots.get(15)
      return p ? { player: p, side: ev.side } : undefined
    }
    if (ev.type === 'drop_goal_attempt' || (kind === 'goal' && ev.type === 'commentary')) {
      const p = designatedKicker(sideSlots)
      return p ? { player: p, side: ev.side } : undefined
    }
    return undefined
  }

  private headline(ev: MatchEvent, primary: PlayActor | undefined, attacker: Side): string {
    const team = this.teamName(ev.side ?? attacker)
    const who = primary ? `${primary.player.lastName} (${primary.position})` : team
    const phase = this.phase
    switch (ev.type) {
      case 'kickoff': return `${who} da el saque`
      case 'try': return `Ensayo de ${who}`
      case 'conversion': return `${who} convierte`
      case 'penalty_kick': return `${who} acierta los palos`
      case 'penalty_kick_missed': return `${who} falla el penal`
      case 'drop_goal': return `${who} acierta el drop`
      case 'drop_goal_missed': return `${who} erra el drop`
      case 'drop_goal_attempt': return `${who} intenta el drop`
      case 'tackle': return `${who} placa`
      case 'tackle_break': return `${who} se escapa del placaje`
      case 'line_break': return `${who} rompe la línea`
      case 'offload': return `${who} descarga en el placaje`
      case 'knock_on': return `Knock-on de ${who}`
      case 'jackal_steal': return `${who} roba la pelota en el suelo`
      case 'turnover': return `${team} recupera la pelota`
      case 'ruck_pickgo': return `${who} agarra y se va`
      case 'ruck_won': return `Ruck rápido de ${team}`
      case 'ruck_slow_ball': return `Ruck lento de ${team}`
      case 'ruck_form': return 'Se forma el ruck'
      case 'ruck_use_it_warn': return 'El árbitro avisa: usen la pelota'
      case 'phase_play': return phase > 0 ? `Fase ${phase} de ${team}` : `${team} sigue en ataque`
      case 'box_kick': return `${who} saca el box kick`
      case 'box_kick_chase_won': return `${team} gana la pelota aérea`
      case 'box_kick_chase_lost': return `Pelota aérea para ${team}`
      case 'kick_to_touch': return `${who} patea a touch`
      case 'grubber': return `${who} pica la pelota rasa`
      case 'chip_kick': return `${who} pasa la pelota por arriba`
      case 'cross_kick': return `${who} cruza la pelota al ala`
      case 'penalty_won': return `Penal para ${team}`
      case 'penalty_to_touch': return `${team} elige la touch`
      case 'quick_tap': return `${team} lo juega rápido`
      case 'mark_called': return `Mark de ${team}`
      case 'scrum_won': return `Melé de ${this.teamName(attacker)}: sale limpia`
      case 'scrum_penalty': return `Penal en la melé para ${team}`
      case 'scrum_reset': return 'Melé colapsada, se repite'
      case 'scrum_collapse': return `Penal por colapso para ${team}`
      case 'lineout_won': return primary ? `Touch de ${this.teamName(attacker)}: salta ${who}` : `Touch de ${this.teamName(attacker)}`
      case 'lineout_lost': return primary ? `${who} tira mal y ${team} se queda con la pelota` : `${team} le roba la touch`
      case 'maul_form': return `${team} forma el maul`
      case 'maul_drive': return `El maul de ${team} avanza`
      case 'maul_stall': return `Maul parado: penal para ${team}`
      case 'maul_collapse': return `Maul derribado: melé para ${team}`
      case 'maul_use_it': return `${team} saca la pelota del maul`
      case 'half_end': return 'Final del primer tiempo'
      case 'full_time': return 'Final del partido'
      default: return ev.text
    }
  }
}

/** Los 30 jugadores de una jugada, con quien lleva o patea la pelota sobre ella. */
export function dotsFor(play: Play): Dot[] {
  const focusKinds: PlayKind[] = ['ruck', 'kick', 'goal', 'try', 'kickoff']
  const focus = play.primary && focusKinds.includes(play.kind)
    ? { side: play.primary.side, position: play.primary.position }
    : undefined
  return formationFor({ kind: play.kind, attacker: play.attacker, dir: play.dir, ball: play.ball, focus })
}
