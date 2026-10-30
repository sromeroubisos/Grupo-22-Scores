// Coreografía: qué hace cada jugador en cada jugada del partido.
//
// Cada evento del motor se traduce a un GUION: a qué punto va cada jugador, cuándo
// arranca (los tres cuartos reaccionan antes que los pilares), a qué fracción de su
// velocidad máxima corre, y quién tiene la pelota en cada momento (los pases, la
// patada, el salto de la touch). El guion no mueve a nadie: lo recorre `motion.ts`
// con física real (aceleración limitada, giros, velocidad máxima por puesto), y los
// jugadores que no llegan a tiempo llegan tarde, como en la cancha.
//
// Los tiempos son segundos de partido real: un ruck rápido dura unos tres, una melé
// ocho. Puro y determinista: sin azar fuera del hash de (jugada, jugador).

import type { RugbyPosition } from '../../types/index.ts'
import type { Side } from '../types.ts'
import { formationFor, wideInfo } from './formations.ts'
import type { MotionBall, MotionBody, Play, Pt } from './types.ts'

/** El jugador va hacia (x, y) a partir del instante `t`, a una fracción de su velocidad máxima. */
export interface Kf { t: number; x: number; y: number; speed: number }

export type BallCue =
  | { t: number; kind: 'hold'; key: string }
  | { t: number; kind: 'flight'; to: Pt; dur: number; apex: number; catcher?: string }
  | { t: number; kind: 'ground'; at: Pt }

export interface Jump { key: string; t0: number; t1: number; h: number }

export interface Script {
  duration: number
  paths: Map<string, Kf[]>
  cues: BallCue[]
  jumps: Jump[]
  /** True si los jugadores corren en espacio abierto y se esquivan; false en melé, touch y maul. */
  separate: boolean
}

export interface ScriptCtx {
  play: Play
  next?: Play
  prev?: Play
  bodies: ReadonlyArray<MotionBody>
  ball: MotionBall
}

/** Velocidad máxima de carrera por puesto, en metros por segundo. */
export const VMAX: Record<RugbyPosition, number> = {
  1: 6.4, 2: 6.8, 3: 6.4, 4: 6.9, 5: 6.9, 6: 7.4, 7: 7.6, 8: 7.5,
  9: 7.7, 10: 8.0, 11: 9.3, 12: 8.3, 13: 8.5, 14: 9.3, 15: 8.7
}

const SPEED = {
  stand: 0.2,
  walk: 0.32,
  jog: 0.55,
  run: 0.8,
  fast: 0.92,
  sprint: 1
}

function hash01(...parts: Array<string | number>): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    const s = String(part)
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = (h * 0x01000193) >>> 0
    }
  }
  return h / 4294967296
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home')
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

class Builder {
  readonly paths = new Map<string, Kf[]>()
  readonly cues: BallCue[] = []
  readonly jumps: Jump[] = []
  /** Para cuándo está lista la jugada. */
  duration = 3
  separate = true

  go(key: string, t: number, x: number, y: number, speed: number): void {
    const list = this.paths.get(key) ?? []
    // Nadie sale por la línea de touch ni de pelota muerta.
    list.push({ t, x: clamp(x, -8, 108), y: clamp(y, 1.5, 68.5), speed })
    this.paths.set(key, list)
  }

  /** Reemplaza todo lo que se había programado para ese jugador. */
  only(key: string): void {
    this.paths.delete(key)
  }

  hold(t: number, key: string): void { this.cues.push({ t, kind: 'hold', key }) }
  flight(t: number, to: Pt, dur: number, apex: number, catcher?: string): void {
    this.cues.push({ t, kind: 'flight', to, dur, apex, catcher })
  }
  ground(t: number, at: Pt): void { this.cues.push({ t, kind: 'ground', at }) }
  jump(key: string, t0: number, t1: number, h: number): void { this.jumps.push({ key, t0, t1, h }) }

  build(): Script {
    for (const list of this.paths.values()) list.sort((a, b) => a.t - b.t)
    this.cues.sort((a, b) => a.t - b.t)
    return { duration: this.duration, paths: this.paths, cues: this.cues, jumps: this.jumps, separate: this.separate }
  }
}

/** Atajos para leer la jugada. */
class View {
  readonly att: Side
  readonly def: Side
  readonly dir: 1 | -1
  readonly P: Pt
  readonly ctx: ScriptCtx
  constructor(ctx: ScriptCtx) {
    this.ctx = ctx
    this.att = ctx.play.attacker
    this.def = other(ctx.play.attacker)
    this.dir = ctx.play.dir
    this.P = ctx.play.ball
  }

  body(side: Side, position: RugbyPosition): MotionBody {
    return this.ctx.bodies.find((b) => b.side === side && b.position === position) as MotionBody
  }

  byKey(key: string | null): MotionBody | undefined {
    return key ? this.ctx.bodies.find((b) => b.key === key) : undefined
  }

  /** Jugadores de un lado, del más cercano a `to` al más lejano. */
  nearest(side: Side, to: Pt, exclude: ReadonlySet<string> = new Set(), only?: RugbyPosition[]): MotionBody[] {
    return this.ctx.bodies
      .filter((b) => b.side === side && !exclude.has(b.key) && (!only || only.includes(b.position)))
      .sort((a, b) => dist(a, to) - dist(b, to) || a.position - b.position)
  }

  delay(b: MotionBody, base?: number): number {
    const own = base ?? (b.position >= 9 ? 0.12 : 0.28)
    return own + hash01(this.ctx.play.index, b.key) * 0.35
  }

  /** Dónde se pone cada uno en la formación de esta jugada, anclada en `ball`. */
  slots(kind: Play['kind'], attacker: Side, dir: 1 | -1, ball: Pt, extra: { scrumGap?: number; scrumPush?: number } = {}): Map<string, Pt> {
    const out = new Map<string, Pt>()
    for (const d of formationFor({ kind, attacker, dir, ball, ...extra })) out.set(d.key, { x: d.x, y: d.y })
    return out
  }
}

/** Todos van a su sitio de la formación, a una velocidad parecida, escalonados. */
function baseline(b: Builder, v: View, slots: Map<string, Pt>, speed: number, skip: ReadonlySet<string> = new Set(), at = 0): void {
  for (const body of v.ctx.bodies) {
    if (skip.has(body.key)) continue
    const slot = slots.get(body.key)
    if (slot) b.go(body.key, at + v.delay(body), slot.x, slot.y, speed)
  }
}

function stay(b: Builder, v: View, speed = SPEED.stand): void {
  for (const body of v.ctx.bodies) b.go(body.key, 0, body.x, body.y, speed)
}

const timeToReach = (body: MotionBody, to: Pt, frac = 1): number => dist(body, to) / (VMAX[body.position] * frac)

// ────────────────────────────── el reparto de la pelota ──────────────────────────────

interface Distribution {
  carrier: MotionBody
  /** Instante en que el que sigue con la pelota la recibe. */
  tCatch: number
  used: Set<string>
}

/**
 * El 9 saca la pelota del ruck y la distribuye: a un grupo de delanteros (un pase
 * corto y plano) o por la línea de tres cuartos, de a un pase por jugador. Cada
 * receptor sale a la línea antes de recibir. El que la recibe al final corre a `Q`.
 */
function distribute(b: Builder, v: View, from: Pt, Q: Pt, t0: number, prefer?: MotionBody): Distribution {
  const { att, dir } = v
  const idx = v.ctx.play.index
  const nine = v.body(att, 9)
  const { wingWide, wingShort } = wideInfo(dir, from.y)
  const backLine: RugbyPosition[] = [10, 12, 13, wingWide]

  let carrier: MotionBody
  if (prefer && prefer.side === att && prefer.position !== 9) {
    carrier = prefer
  } else {
    const pods: RugbyPosition[] = [1, 2, 3, 6, 7]
    const backs: RugbyPosition[] = [10, 12, 13, wingWide, wingShort]
    const position = hash01(idx, 'carrier') < 0.52
      ? pods[Math.floor(hash01(idx, 'pod') * pods.length)]
      : backs[Math.floor(hash01(idx, 'back') * backs.length)]
    carrier = v.body(att, position)
  }

  const route: MotionBody[] = []
  if (backLine.includes(carrier.position)) {
    for (const p of backLine.slice(0, backLine.indexOf(carrier.position) + 1)) route.push(v.body(att, p))
  } else if (carrier.position >= 9) {
    route.push(v.body(att, 10), carrier)
  } else {
    route.push(carrier)
  }

  const used = new Set<string>([nine.key, ...route.map((r) => r.key)])
  let holder = nine
  let t = t0 + 0.65
  b.hold(t0, nine.key)
  let tCatch = t
  route.forEach((r, i) => {
    const last = i === route.length - 1
    const catchAt: Pt = { x: r.x + dir * 1.8, y: r.y }
    const hop = clamp(dist(holder, catchAt) / 16, 0.35, 0.85)
    // Sale a la línea antes de recibir, para recibir en carrera.
    b.go(r.key, Math.max(t0, t + hop - 0.95), catchAt.x, catchAt.y, SPEED.fast)
    b.flight(t, catchAt, hop, 0.08, r.key)
    tCatch = t + hop
    if (last) {
      b.go(r.key, tCatch, Q.x, Q.y, SPEED.sprint)
    } else {
      // El que pasa sigue corriendo de señuelo.
      b.go(r.key, tCatch + 0.12, catchAt.x + dir * 4, catchAt.y, SPEED.run)
    }
    holder = r
    t = tCatch + 0.12
  })

  // Dos apoyos corren detrás del portador, uno a cada lado.
  const supporters = v.nearest(att, Q, used).filter((s) => s.position !== 15).slice(0, 2)
  supporters.forEach((s, i) => {
    b.go(s.key, tCatch + 0.2, Q.x - dir * (3.4 + i * 0.8), Q.y + (i === 0 ? -3.2 : 3.2), SPEED.fast)
    used.add(s.key)
  })
  return { carrier, tCatch, used }
}

// ───────────────────────────────── guiones por jugada ─────────────────────────────────

/** El jugador que, según la jugada siguiente, tiene que llevar la pelota (el que va a anotar, a romper). */
function preferredCarrier(v: View): MotionBody | undefined {
  const next = v.ctx.next
  if (!next || next.attacker !== v.att || !next.primary || next.primary.side !== v.att) return undefined
  if (next.type === 'try' || next.type === 'line_break' || next.type === 'tackle_break') {
    return v.body(next.primary.side, next.primary.position)
  }
  return undefined
}

function tackleScript(b: Builder, v: View): void {
  const { att, def, dir, P } = v
  const holder = v.byKey(v.ctx.ball.holder)
  const used = new Set<string>()
  let carrier: MotionBody
  let arrive: number
  if (!holder || holder.side !== att || holder.position === 9 || dist(holder, P) > 10) {
    const start = holder && holder.side === att ? holder : v.body(att, 9)
    const d = distribute(b, v, { x: start.x, y: start.y }, P, 0, undefined)
    carrier = d.carrier
    d.used.forEach((k) => used.add(k))
    arrive = d.tCatch + timeToReach(carrier, P) + 0.3
  } else {
    carrier = holder
    used.add(carrier.key)
    b.hold(0, carrier.key)
    b.go(carrier.key, 0, P.x, P.y, SPEED.sprint)
    arrive = timeToReach(carrier, P) + 0.2
  }
  const [first, second] = v.nearest(def, P, new Set(), [4, 5, 6, 7, 8, 12, 13, 1, 2, 3, 10, 9, 11, 14])
  used.add(first.key)
  const tFirst = Math.max(0.4, arrive - 0.5)
  b.go(first.key, 0, P.x + dir * 2.2, P.y, SPEED.run)
  b.go(first.key, tFirst, P.x + dir * 0.5, P.y, SPEED.sprint)
  used.add(second.key)
  b.go(second.key, 0.2, P.x + dir * 3, P.y + 1.2, SPEED.run)
  b.go(second.key, tFirst + 0.35, P.x + dir * 0.9, P.y + 0.9, SPEED.fast)

  const slots = v.slots('ruck', att, dir, P)
  baseline(b, v, slots, SPEED.jog, used)
  b.duration = clamp(arrive + 1.0, 2.4, 4.8)
}

function ruckScript(b: Builder, v: View, slow: boolean): void {
  const { att, def, dir, P } = v
  const dur = slow ? 4.8 : 3.0
  const { wide } = wideInfo(dir, P.y)
  const used = new Set<string>()
  const carrier = v.byKey(v.ctx.ball.holder)
  b.ground(0.25, { x: P.x - dir * 0.5, y: P.y })

  if (carrier && carrier.side === att) {
    used.add(carrier.key)
    b.go(carrier.key, 0.3, P.x - dir * 0.1, P.y, SPEED.walk)
  }
  const nine = v.body(att, 9)
  used.add(nine.key)
  const cleaners = v.nearest(att, P, used).filter((c) => c.position !== 15).slice(0, 3)
  const spots: Array<[number, number]> = [[0.9, -0.9], [1.5, 0.8], [2.1, -0.1]]
  cleaners.forEach((c, i) => {
    used.add(c.key)
    b.go(c.key, i * 0.22 + 0.05, P.x - dir * spots[i][0], P.y + spots[i][1], SPEED.sprint)
  })
  b.go(nine.key, 0.5, P.x - dir * 1.4, P.y + wide * 1.2, SPEED.fast)
  b.hold(dur - 0.45, nine.key)

  const slots = v.slots('ruck', att, dir, P)
  // El que placó se queda sobre la pelota un rato (más si es lenta: intenta robarla) y después se retira.
  const [jackal, helper] = v.nearest(def, P)
  used.add(jackal.key)
  const leave = slow ? 2.5 : 1.0
  b.go(jackal.key, 0, P.x + dir * 0.6, P.y - 0.3, SPEED.fast)
  const js = slots.get(jackal.key)
  if (js) b.go(jackal.key, leave, js.x, js.y, SPEED.run)
  used.add(helper.key)
  const hs = slots.get(helper.key)
  if (hs) b.go(helper.key, 0.4, hs.x, hs.y, SPEED.run)
  baseline(b, v, slots, SPEED.jog, used)
  b.duration = dur
}

function phasePlayScript(b: Builder, v: View): void {
  const { att, dir } = v
  const Q = v.P
  const P0 = v.ctx.prev?.ball ?? { x: Q.x - dir * 5, y: Q.y }
  const prefer = preferredCarrier(v)
  const d = distribute(b, v, P0, Q, 0, prefer)
  // La defensa sube en línea hacia donde va la pelota.
  const slots = v.slots('ruck', att, dir, Q)
  baseline(b, v, slots, SPEED.run, d.used)
  b.duration = clamp(d.tCatch + 1.7, 3.0, 4.8)
}

function pickGoScript(b: Builder, v: View): void {
  const { att, dir, P } = v
  const nine = v.body(att, 9)
  const to: Pt = { x: P.x, y: P.y }
  b.hold(0, nine.key)
  b.go(nine.key, 0.2, to.x, to.y, SPEED.sprint)
  const used = new Set<string>([nine.key])
  v.nearest(att, to, used).slice(0, 2).forEach((s, i) => {
    used.add(s.key)
    b.go(s.key, 0.3, to.x - dir * (2.5 + i), to.y + (i ? 1.8 : -1.8), SPEED.fast)
  })
  baseline(b, v, v.slots('ruck', att, dir, to), SPEED.run, used)
  b.duration = 2.2
}

function breakScript(b: Builder, v: View, big: boolean): void {
  const { att, def, dir } = v
  const Q = v.P
  const P0 = v.ctx.prev?.ball ?? { x: Q.x - dir * 8, y: Q.y }
  const holder = v.byKey(v.ctx.ball.holder)
  const preferred = preferredCarrier(v)
  const carrier = preferred ?? (holder && holder.side === att ? holder : v.nearest(att, P0)[0])
  if (!holder || holder.key !== carrier.key) b.hold(0, carrier.key)
  else b.hold(0, carrier.key)
  // Un cambio de ritmo y un quiebre a mitad de camino.
  const mid: Pt = { x: (carrier.x + Q.x) / 2, y: (carrier.y + Q.y) / 2 + (hash01(v.ctx.play.index, 'step') < 0.5 ? -2.2 : 2.2) }
  b.go(carrier.key, 0, mid.x, mid.y, SPEED.sprint)
  b.go(carrier.key, timeToReach(carrier, mid) * 0.95, Q.x, Q.y, SPEED.sprint)
  const used = new Set<string>([carrier.key])
  // Los que pierden el duelo se dan vuelta y lo persiguen.
  v.nearest(def, P0).slice(0, 3).forEach((c, i) => {
    used.add(c.key)
    b.go(c.key, 0.15 + i * 0.1, P0.x + dir * 1.0, P0.y + (i - 1) * 2, SPEED.sprint)
    b.go(c.key, 0.9, Q.x - dir * (3 + i * 2), Q.y + (i - 1) * 2.5, SPEED.sprint)
  })
  v.nearest(att, Q, used).filter((s) => s.position !== 15).slice(0, 2).forEach((s, i) => {
    used.add(s.key)
    b.go(s.key, 0.3, Q.x - dir * (4 + i * 2), Q.y + (i ? 3 : -3), SPEED.sprint)
  })
  baseline(b, v, v.slots('ruck', att, dir, Q), SPEED.run, used)
  b.duration = clamp(timeToReach(carrier, Q) + 1.4, big ? 3.6 : 3.0, 5.2)
}

function offloadScript(b: Builder, v: View): void {
  const { att, dir, P } = v
  const carrier = v.byKey(v.ctx.ball.holder)
  const exclude = new Set<string>(carrier ? [carrier.key] : [])
  const target = v.nearest(att, P, exclude).filter((s) => s.position !== 15)[0]
  const to: Pt = { x: P.x + dir * 2, y: P.y + 1.4 }
  b.go(target.key, 0, to.x, to.y, SPEED.sprint)
  b.flight(0.3, to, 0.35, 0.05, target.key)
  b.go(target.key, 0.7, P.x + dir * 7, P.y + 1.4, SPEED.sprint)
  baseline(b, v, v.slots('ruck', att, dir, P), SPEED.run, new Set([target.key]))
  b.duration = 2.4
}

function knockOnScript(b: Builder, v: View): void {
  const { att, dir, P } = v
  const carrier = v.byKey(v.ctx.ball.holder)
  const lands: Pt = { x: P.x + dir * 4.5, y: P.y + (hash01(v.ctx.play.index, 'ko') - 0.5) * 3 }
  if (carrier) b.flight(0.1, lands, 0.55, 0.12)
  b.ground(0.7, lands)
  baseline(b, v, v.slots('ruck', att, dir, P), SPEED.walk)
  b.duration = 2.4
}

function stealScript(b: Builder, v: View): void {
  const { att, dir, P } = v
  const primary = v.ctx.play.primary
  const thief = primary && primary.side === att ? v.body(att, primary.position) : v.nearest(att, P)[0]
  b.go(thief.key, 0, P.x, P.y, SPEED.sprint)
  b.hold(timeToReach(thief, P) + 0.3, thief.key)
  baseline(b, v, v.slots('ruck', att, dir, P), SPEED.jog, new Set([thief.key]))
  b.duration = clamp(timeToReach(thief, P) + 1.6, 2.4, 4)
}

function penaltyScript(b: Builder, v: View, quick: boolean): void {
  const { att, dir, P } = v
  const nine = v.body(att, 9)
  const slots = v.slots('penalty', att, dir, P)
  if (quick) {
    b.go(nine.key, 0, P.x, P.y, SPEED.run)
    b.ground(0.1, P)
    b.hold(0.7, nine.key)
    b.go(nine.key, 1.0, P.x + dir * 3, P.y, SPEED.sprint)
    baseline(b, v, slots, SPEED.run, new Set([nine.key]))
    b.duration = 2.2
    return
  }
  b.ground(0.4, P)
  baseline(b, v, slots, SPEED.walk)
  b.go(nine.key, 0.3, P.x - dir * 1.2, P.y, SPEED.jog)
  b.hold(3.6, nine.key)
  b.duration = 4.6
}

// ────────────────────────────────── melé y touch ──────────────────────────────────

function scrumScript(b: Builder, v: View): void {
  const { att, def, dir, P } = v
  const type = v.ctx.play.type
  b.separate = false
  const nine = v.body(att, 9)
  const apart = v.slots('scrum', att, dir, P, { scrumGap: 2.4 })
  const bind = v.slots('scrum', att, dir, P)
  const winnerPush = type === 'scrum_reset' ? 0 : 1.3
  const pushed = v.slots('scrum', att, dir, P, { scrumPush: winnerPush })
  const isPack = (k: string) => {
    const pos = Number(k.split('-')[1])
    return pos >= 1 && pos <= 8
  }
  baseline(b, v, apart, SPEED.walk)
  // Agachados, atados y listos: el contacto es corto y fuerte.
  const engage = 3.4
  for (const body of v.ctx.bodies) {
    if (!isPack(body.key)) continue
    const s = bind.get(body.key)
    if (s) b.go(body.key, engage + hash01(v.ctx.play.index, body.key) * 0.15, s.x, s.y, SPEED.sprint)
    const p = pushed.get(body.key)
    if (p) b.go(body.key, engage + 1.6, p.x, p.y, 0.25)
  }
  if (type === 'scrum_reset' || type === 'scrum_collapse') {
    for (const body of v.ctx.bodies) {
      if (!isPack(body.key)) continue
      const s = apart.get(body.key)
      if (s) b.go(body.key, 5.4, s.x, s.y, SPEED.walk)
    }
  }
  b.hold(0, nine.key)
  b.go(nine.key, 3.6, P.x - dir * 0.9, P.y + wideInfo(dir, P.y).wide * 1.4, SPEED.jog)
  b.flight(4.9, P, 0.35, 0.05)
  b.ground(5.3, { x: P.x - dir * 0.2, y: P.y })
  if (type === 'scrum_won') {
    // El 8 controla con los pies y el 9 recoge la pelota al costado.
    b.ground(6.4, { x: P.x - dir * (2.6 + winnerPush), y: P.y })
    b.go(nine.key, 6.4, P.x - dir * (3.2 + winnerPush), P.y + wideInfo(dir, P.y).wide * 1.8, SPEED.run)
    b.hold(7.6, nine.key)
  }
  void def
  b.duration = type === 'scrum_won' ? 8.6 : type === 'scrum_reset' ? 6.6 : 6.4
}

function lineoutScript(b: Builder, v: View): void {
  const { att, def, dir, P } = v
  const type = v.ctx.play.type
  b.separate = false
  const lost = type === 'lineout_lost'
  const thrower = v.body(att, 2)
  const slots = v.slots('lineout', att, dir, P)
  baseline(b, v, slots, SPEED.jog)
  b.hold(0, thrower.key)

  const primary = v.ctx.play.primary
  const winnerSide = lost ? def : att
  const jumperPos: RugbyPosition = !lost && primary && primary.side === att && [4, 5, 6, 7, 8].includes(primary.position)
    ? primary.position
    : 5
  const jumper = v.body(winnerSide, jumperPos)
  const jumpSlot = slots.get(jumper.key) ?? { x: P.x, y: P.y }
  const apexAt: Pt = { x: jumpSlot.x, y: jumpSlot.y }
  b.flight(4.7, apexAt, 0.55, 0.12, jumper.key)
  b.jump(jumper.key, 4.7, 6.0, 1)
  // Los dos de al lado lo levantan.
  v.nearest(winnerSide, apexAt, new Set([jumper.key]), [4, 5, 6, 7, 8, 1, 3]).slice(0, 2).forEach((l) => b.jump(l.key, 4.8, 5.8, 0.25))
  const nine = v.body(winnerSide, 9)
  b.flight(6.2, { x: nine.x, y: nine.y }, 0.55, 0.08, nine.key)
  b.go(nine.key, 3.6, nine.x, nine.y, SPEED.stand)
  b.duration = 7.4
}

function maulScript(b: Builder, v: View): void {
  const { att, dir, P } = v
  const type = v.ctx.play.type
  b.separate = false
  const carrier = v.byKey(v.ctx.ball.holder)
  const slots = v.slots('maul', att, dir, P)
  baseline(b, v, slots, type === 'maul_drive' ? SPEED.walk : SPEED.jog)
  if (!carrier || carrier.side !== att) b.hold(0, v.body(att, 5).key)
  if (type === 'maul_use_it') {
    const nine = v.body(att, 9)
    b.flight(1.6, { x: nine.x, y: nine.y }, 0.5, 0.06, nine.key)
  }
  b.duration = type === 'maul_use_it' ? 2.8 : 3.4
}

// ────────────────────────────────── patadas ──────────────────────────────────

function kickScript(b: Builder, v: View, from: Pt): void {
  const { att, def, dir } = v
  const play = v.ctx.play
  const L = v.ctx.next?.ball ?? { x: from.x + dir * 30, y: from.y }
  const primary = play.primary
  const kicker = primary && primary.side === att ? v.body(att, primary.position) : v.body(att, 10)
  const grubber = play.type === 'grubber'
  const flightDist = dist(from, L)
  const tFlight = clamp(flightDist / (grubber ? 11 : 21), 0.9, 3.8)
  const tKick = 1.0
  const apex = grubber ? 0.05 : clamp(flightDist / 32, 0.25, 1)

  b.hold(0, kicker.key)
  b.go(kicker.key, 0, from.x + dir * 1.6, from.y, SPEED.run)
  const receiverSide = def
  const [receiver] = v.nearest(receiverSide, L, new Set(), [15, 11, 14, 10, 12, 13])
  const next = v.ctx.next
  const stolen = !!next && next.attacker !== att
  const catcher = stolen ? receiver.key : undefined
  b.flight(tKick, L, tFlight, apex, catcher)
  if (!catcher) b.ground(tKick + tFlight, L)

  // Los que persiguen: los rápidos en línea hacia donde cae la pelota, el resto detrás.
  const used = new Set<string>([kicker.key])
  const chasersOrder = v.ctx.bodies
    .filter((c) => c.side === att && c.key !== kicker.key && c.position !== 9)
    .sort((a, c) => a.y - c.y)
  const fastPositions: RugbyPosition[] = [11, 12, 13, 14, 15, 6, 7, 8]
  const fast = chasersOrder.filter((c) => fastPositions.includes(c.position))
  fast.forEach((c, i) => {
    used.add(c.key)
    const lane = L.y + (i - (fast.length - 1) / 2) * 3.8
    b.go(c.key, tKick + 0.05 + hash01(play.index, c.key) * 0.3, L.x - dir * (1.2 + (i % 2) * 1.2), lane, SPEED.sprint)
  })
  chasersOrder.filter((c) => !used.has(c.key)).forEach((c, i) => {
    used.add(c.key)
    b.go(c.key, tKick + 0.3 + hash01(play.index, c.key) * 0.4, L.x - dir * (13 + (i % 3) * 2), L.y + (i - 2) * 3, SPEED.jog)
  })
  b.go(v.body(att, 9).key, tKick + 0.4, L.x - dir * 18, L.y, SPEED.jog)
  used.add(v.body(att, 9).key)

  // El que recibe se acomoda bajo la pelota y los suyos se abren detrás.
  const retreat = v.slots('ruck', receiverSide, (-dir) as 1 | -1, L)
  b.go(receiver.key, tKick * 0.6, L.x, L.y, SPEED.fast)
  baseline(b, v, retreat, SPEED.run, new Set([...used, receiver.key]), tKick * 0.5)
  b.duration = tKick + tFlight + 1.5
}

function kickoffScript(b: Builder, v: View): void {
  kickScript(b, v, v.P)
  b.duration += 0.6
}

function goalScript(b: Builder, v: View, made: boolean): void {
  const { att, dir, P } = v
  const play = v.ctx.play
  const primary = play.primary
  const kicker = primary && primary.side === att ? v.body(att, primary.position) : v.body(att, 10)
  const goalX = dir === 1 ? 100 : 0
  const miss = (hash01(play.index, 'miss') < 0.5 ? -1 : 1) * (made ? 0.4 : 5.8)
  const G: Pt = { x: goalX + dir * 6, y: 35 + miss }
  const tFlight = clamp(dist(P, G) / 23, 1.0, 3.0)
  const slots = v.slots('goal', att, dir, P)
  baseline(b, v, slots, SPEED.walk, new Set([kicker.key]))
  b.hold(0, kicker.key)
  // Da unos pasos hacia atrás, mira los palos y toma carrera.
  b.go(kicker.key, 0, P.x - dir * 3.0, P.y - 0.8, SPEED.walk)
  b.go(kicker.key, 2.6, P.x + dir * 0.5, P.y, SPEED.jog)
  b.flight(3.5, G, tFlight, 0.9)
  b.ground(3.5 + tFlight, G)
  b.duration = 3.5 + tFlight + 1.3
}

function afterGoalScript(b: Builder, v: View): void {
  const { att, dir, P } = v
  baseline(b, v, v.slots('goal', att, dir, P), SPEED.walk)
  b.duration = 1.8
}

function tryScript(b: Builder, v: View): void {
  const { att, def, dir } = v
  const T = v.P
  b.separate = true
  const primary = v.ctx.play.primary
  const holder = v.byKey(v.ctx.ball.holder)
  const scorer = primary && primary.side === att
    ? v.body(att, primary.position)
    : holder && holder.side === att ? holder : v.nearest(att, T)[0]
  let t0 = 0
  if (!holder || holder.key !== scorer.key) {
    if (holder && holder.side === att) {
      b.flight(0, { x: scorer.x + dir * 1.2, y: scorer.y }, 0.4, 0.06, scorer.key)
      t0 = 0.4
    } else {
      b.hold(0, scorer.key)
    }
  }
  const arrive = t0 + timeToReach(scorer, T) + 0.1
  b.go(scorer.key, t0, T.x, T.y, SPEED.sprint)
  const used = new Set<string>([scorer.key])
  v.nearest(def, T, new Set(), [11, 14, 15, 12, 13, 8, 7, 6]).slice(0, 3).forEach((c, i) => {
    used.add(c.key)
    b.go(c.key, 0.2, T.x - dir * (5 + i * 2), T.y + (i - 1) * 3, SPEED.sprint)
  })
  // Los suyos corren a acompañarlo y festejan en el in-goal.
  const celebrate = v.slots('try', att, dir, T)
  baseline(b, v, celebrate, SPEED.jog, used, Math.max(0, arrive - 0.5))
  v.ctx.bodies.filter((c) => c.side === att && !used.has(c.key)).forEach((c) => {
    b.go(c.key, 0, T.x - dir * 10, T.y + (hash01(v.ctx.play.index, c.key) - 0.5) * 24, SPEED.run)
  })
  b.ground(arrive + 0.1, T)
  b.duration = arrive + 2.6
}

function idleScript(b: Builder, v: View, long: boolean): void {
  stay(b, v, SPEED.stand)
  b.duration = long ? 4 : 1.8
}

// ──────────────────────────────────── público ────────────────────────────────────

export function buildScript(ctx: ScriptCtx): Script {
  const v = new View(ctx)
  const b = new Builder()
  const play = ctx.play
  switch (play.type) {
    case 'kickoff': kickoffScript(b, v); break
    case 'tackle': tackleScript(b, v); break
    case 'ruck_won': case 'ruck_form': ruckScript(b, v, false); break
    case 'ruck_slow_ball': ruckScript(b, v, true); break
    case 'phase_play': phasePlayScript(b, v); break
    case 'ruck_pickgo': pickGoScript(b, v); break
    case 'line_break': breakScript(b, v, true); break
    case 'tackle_break': breakScript(b, v, false); break
    case 'offload': offloadScript(b, v); break
    case 'knock_on': knockOnScript(b, v); break
    case 'jackal_steal': case 'turnover': stealScript(b, v); break
    case 'quick_tap': penaltyScript(b, v, true); break
    case 'penalty_won': case 'mark_called': penaltyScript(b, v, false); break
    case 'scrum_won': case 'scrum_penalty': case 'scrum_reset': case 'scrum_collapse': scrumScript(b, v); break
    case 'lineout_won': case 'lineout_lost': lineoutScript(b, v); break
    case 'maul_form': case 'maul_drive': case 'maul_stall': case 'maul_collapse': case 'maul_use_it': maulScript(b, v); break
    case 'kick_to_touch': case 'box_kick': case 'grubber': case 'chip_kick': case 'cross_kick':
      kickScript(b, v, v.P); break
    case 'penalty_to_touch': {
      baseline(b, v, v.slots('kick', play.attacker, play.dir, v.P), SPEED.walk)
      b.duration = 1.8
      break
    }
    case 'box_kick_chase_won': case 'box_kick_chase_lost': {
      const side = play.primary?.side ?? play.attacker
      const winner = v.nearest(side, v.P)[0]
      b.go(winner.key, 0, v.P.x, v.P.y, SPEED.sprint)
      b.hold(timeToReach(winner, v.P) + 0.2, winner.key)
      baseline(b, v, v.slots('ruck', side, side === play.attacker ? play.dir : (-play.dir) as 1 | -1, v.P), SPEED.run, new Set([winner.key]))
      b.duration = 2.6
      break
    }
    case 'penalty_kick': goalScript(b, v, true); break
    case 'penalty_kick_missed': goalScript(b, v, false); break
    case 'conversion': goalScript(b, v, true); break
    case 'drop_goal_attempt': goalScript(b, v, ctx.next?.type === 'drop_goal'); break
    case 'drop_goal': case 'drop_goal_missed': afterGoalScript(b, v); break
    case 'try': tryScript(b, v); break
    case 'half_end': idleScript(b, v, true); break
    case 'commentary':
      if (play.kind === 'goal') goalScript(b, v, false)
      else idleScript(b, v, false)
      break
    default: idleScript(b, v, false)
  }
  return b.build()
}
