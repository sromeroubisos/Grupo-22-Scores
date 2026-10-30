// Locomoción: cómo se mueve un jugador de rugby de verdad.
//
// Cada jugador es un cuerpo con posición y velocidad. Corre hacia el punto que le
// marca el guion de la jugada (choreography.ts), pero con los límites de una
// persona: velocidad máxima por puesto (un ala corre a 9,3 m/s, un pilar a 6,4),
// aceleración limitada (de parado a velocidad punta lleva casi dos segundos), frenado
// y giros que cuestan tiempo, y reacciones escalonadas. Si no llega a tiempo, llega
// tarde: la jugada siguiente lo encuentra donde quedó, sin saltos.
//
// La pelota es de quien la lleva, vuela con los pases y las patadas (con altura) o
// está en el suelo. Paso fijo de 0,05 s: misma secuencia de jugadas, mismo movimiento,
// a cualquier velocidad de cuadros.

import type { RugbyPosition } from '../../types/index.ts'
import type { Side } from '../types.ts'
import { buildScript, VMAX, type Kf, type Script } from './choreography.ts'
import type { Dot, MotionBall, MotionBody, Play } from './types.ts'

export { VMAX }

/** Paso de la física, en segundos de partido. */
export const STEP = 0.05

/** Aceleración al arrancar, frenado y cambio de dirección, en m/s². */
const ACCEL = 4.4
const BRAKE = 6.5
const TURN = 7.5
const MAX_ACCEL = 9.5
/** Velocidad máxima de la pelota en pases y patadas, en m/s. */
const BALL_MAX_SPEED = 26
/** Distancia a la que dos jugadores empiezan a esquivarse, en metros. */
const PERSONAL_SPACE = 1.25

export interface MotionOptions {
  /** Multiplicador de velocidad de cada jugador (por ejemplo, según su atributo de velocidad). */
  speedScale?: (side: Side, position: RugbyPosition) => number
}

interface Target { x: number; y: number; speed: number }
interface Flight { fromX: number; fromY: number; toX: number; toY: number; t0: number; dur: number; apex: number; catcher?: string }

export class Motion {
  private readonly bodies: MotionBody[]
  private readonly byKey = new Map<string, MotionBody>()
  private readonly vmax = new Map<string, number>()
  private readonly targets = new Map<string, Target>()
  private readonly kfIndex = new Map<string, number>()
  private readonly ball: MotionBall
  private script: Script | null = null
  private elapsed = 0
  private carry = 0
  private cueIndex = 0
  private flight: Flight | null = null
  /** Cambia con cada jugada: quien mira sabe cuándo empezó una nueva. */
  scriptId = 0

  constructor(initial: Dot[], holder: string | null, opts: MotionOptions = {}) {
    this.bodies = initial.map((d) => ({ key: d.key, side: d.side, position: d.position, x: d.x, y: d.y, vx: 0, vy: 0, z: 0 }))
    for (const b of this.bodies) {
      this.byKey.set(b.key, b)
      this.vmax.set(b.key, VMAX[b.position] * (opts.speedScale?.(b.side, b.position) ?? 1))
      this.targets.set(b.key, { x: b.x, y: b.y, speed: 0 })
    }
    const h = holder ? this.byKey.get(holder) : undefined
    this.ball = { x: h?.x ?? 50, y: h?.y ?? 35, z: 0, holder: h ? h.key : null }
  }

  /** Empieza la jugada: arma su guion a partir de dónde está cada uno ahora. */
  begin(play: Play, next: Play | undefined, prev: Play | undefined): void {
    this.script = buildScript({ play, next, prev, bodies: this.bodies, ball: this.ball })
    this.elapsed = 0
    this.carry = 0
    this.cueIndex = 0
    this.kfIndex.clear()
    this.scriptId++
  }

  get finished(): boolean {
    return !this.script || this.elapsed >= this.script.duration
  }

  /** Segundos que lleva la jugada y lo que dura, para mostrar progreso. */
  get progress(): { elapsed: number; duration: number } {
    return { elapsed: this.elapsed, duration: this.script?.duration ?? 0 }
  }

  step(dt: number): void {
    this.carry += dt
    while (this.carry >= STEP) {
      this.carry -= STEP
      this.tick()
    }
  }

  /** Corre lo que falta de la jugada de golpe: para saltar al final. */
  settle(): void {
    for (let i = 0; i < 4000 && !this.finished; i++) this.tick()
  }

  snapshot(): { bodies: ReadonlyArray<MotionBody>; ball: Readonly<MotionBall> } {
    return { bodies: this.bodies, ball: this.ball }
  }

  // ──────────────────────────────────── física ────────────────────────────────────

  private tick(): void {
    const s = this.script
    if (s && this.elapsed < s.duration) {
      this.elapsed += STEP
      this.applyKeyframes(s)
      this.applyCues(s)
    }
    this.integrateBodies(s?.separate ?? false)
    this.integrateBall()
    this.integrateJumps(s)
  }

  private applyKeyframes(s: Script): void {
    for (const [key, list] of s.paths) {
      let i = this.kfIndex.get(key) ?? 0
      while (i < list.length && list[i].t <= this.elapsed) {
        const k: Kf = list[i]
        this.targets.set(key, { x: k.x, y: k.y, speed: k.speed })
        i++
      }
      this.kfIndex.set(key, i)
    }
  }

  private applyCues(s: Script): void {
    while (this.cueIndex < s.cues.length && s.cues[this.cueIndex].t <= this.elapsed) {
      const cue = s.cues[this.cueIndex++]
      if (cue.kind === 'ground') {
        // La pelota se apoya en el suelo; si está lejos, rueda hasta ahí.
        const d = Math.hypot(cue.at.x - this.ball.x, cue.at.y - this.ball.y)
        this.ball.holder = null
        if (d > 0.6) {
          this.flight = { fromX: this.ball.x, fromY: this.ball.y, toX: cue.at.x, toY: cue.at.y, t0: this.elapsed, dur: Math.max(0.25, d / BALL_MAX_SPEED), apex: 0.02 }
        } else {
          this.flight = null
          this.ball.x = cue.at.x
          this.ball.y = cue.at.y
          this.ball.z = 0
        }
      } else if (cue.kind === 'flight') {
        // Un pase o una patada no superan la velocidad que una persona le puede dar a la pelota.
        const d = Math.hypot(cue.to.x - this.ball.x, cue.to.y - this.ball.y)
        this.flight = { fromX: this.ball.x, fromY: this.ball.y, toX: cue.to.x, toY: cue.to.y, t0: this.elapsed, dur: Math.max(0.1, cue.dur, d / BALL_MAX_SPEED), apex: cue.apex, catcher: cue.catcher }
        this.ball.holder = null
      } else {
        const h = this.byKey.get(cue.key)
        if (!h) continue
        const d = Math.hypot(h.x - this.ball.x, h.y - this.ball.y)
        if (d > 0.9) {
          // La pelota no se teletransporta: va hasta quien la toma.
          this.flight = { fromX: this.ball.x, fromY: this.ball.y, toX: h.x, toY: h.y, t0: this.elapsed, dur: Math.max(0.2, d / BALL_MAX_SPEED), apex: 0.04, catcher: cue.key }
          this.ball.holder = null
        } else {
          this.ball.holder = cue.key
          this.flight = null
        }
      }
    }
  }

  private integrateBodies(separate: boolean): void {
    const n = this.bodies.length
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i]
      const t = this.targets.get(b.key)!
      const dx = t.x - b.x
      const dy = t.y - b.y
      const d = Math.hypot(dx, dy)
      const speed = Math.hypot(b.vx, b.vy)
      const cap = (this.vmax.get(b.key) ?? 8) * t.speed

      if (d < 0.06 && speed < 0.25) {
        b.vx = 0
        b.vy = 0
        b.x = t.x
        b.y = t.y
        continue
      }
      // Velocidad que quiere llevar: la de su ritmo, frenando a tiempo para llegar parado.
      const want = Math.min(cap, Math.sqrt(2 * BRAKE * 0.85 * d))
      const ux = d > 1e-6 ? dx / d : 0
      const uy = d > 1e-6 ? dy / d : 0
      const dvx = ux * want - b.vx
      const dvy = uy * want - b.vy
      // El cambio de velocidad se reparte en lo que acelera o frena (a lo largo del movimiento) y
      // lo que gira (de costado): girar a toda velocidad cuesta más que ir recto.
      let ax = dvx
      let ay = dvy
      if (speed > 0.3) {
        const hx = b.vx / speed
        const hy = b.vy / speed
        const par = dvx * hx + dvy * hy
        const perpX = dvx - par * hx
        const perpY = dvy - par * hy
        const perp = Math.hypot(perpX, perpY)
        const parLim = (par >= 0 ? ACCEL : BRAKE) * STEP
        const parC = Math.max(-BRAKE * STEP, Math.min(parLim, par))
        const k = perp > TURN * STEP ? (TURN * STEP) / perp : 1
        ax = parC * hx + perpX * k
        ay = parC * hy + perpY * k
      } else {
        const m = Math.hypot(dvx, dvy)
        const lim = ACCEL * STEP
        if (m > lim) { ax = (dvx / m) * lim; ay = (dvy / m) * lim }
      }
      // Ninguna persona cambia su velocidad a más de ~9,5 m/s² entre frenar y girar.
      const am = Math.hypot(ax, ay)
      if (am > MAX_ACCEL * STEP) {
        ax *= (MAX_ACCEL * STEP) / am
        ay *= (MAX_ACCEL * STEP) / am
      }
      b.vx += ax
      b.vy += ay
      if (separate) {
        let sx = 0
        let sy = 0
        for (let j = 0; j < n; j++) {
          if (j === i) continue
          const o = this.bodies[j]
          const ox = b.x - o.x
          const oy = b.y - o.y
          const od = Math.hypot(ox, oy)
          if (od > 1e-4 && od < PERSONAL_SPACE) {
            const push = (PERSONAL_SPACE - od) / PERSONAL_SPACE
            sx += (ox / od) * push
            sy += (oy / od) * push
          }
        }
        const sm = Math.hypot(sx, sy)
        if (sm > 1e-6) {
          const k = Math.min(sm, 1) * 3 * STEP / sm
          b.vx += sx * k
          b.vy += sy * k
        }
      }
      const limit = this.vmax.get(b.key) ?? 8
      const v = Math.hypot(b.vx, b.vy)
      if (v > limit) {
        b.vx *= limit / v
        b.vy *= limit / v
      }
    }
    for (const b of this.bodies) {
      b.x += b.vx * STEP
      b.y += b.vy * STEP
    }
  }

  private integrateBall(): void {
    const f = this.flight
    if (f) {
      const target = f.catcher ? this.byKey.get(f.catcher) : undefined
      if (target) {
        // Un pase va a las manos de quien lo recibe, esté donde esté: la pelota lo persigue
        // sin pasar la velocidad que una persona le puede dar.
        const remaining = Math.max(STEP, f.t0 + f.dur - this.elapsed)
        const dx = target.x - this.ball.x
        const dy = target.y - this.ball.y
        const d = Math.hypot(dx, dy)
        if (d < 0.35) {
          this.ball.x = target.x
          this.ball.y = target.y
          this.ball.z = 0.12
          this.ball.holder = target.key
          this.flight = null
          return
        }
        const stepLen = Math.min(d, Math.max(d * STEP / remaining, 0), BALL_MAX_SPEED * STEP)
        this.ball.x += (dx / d) * stepLen
        this.ball.y += (dy / d) * stepLen
        const u = Math.min(1, (this.elapsed - f.t0) / f.dur)
        this.ball.z = f.apex * 4 * u * (1 - u)
        if (this.elapsed - f.t0 > f.dur + 3) {
          this.ball.holder = target.key
          this.flight = null
        }
        return
      }
      const u = (this.elapsed - f.t0) / f.dur
      if (u >= 1) {
        this.ball.x = f.toX
        this.ball.y = f.toY
        this.ball.z = 0
        this.ball.holder = null
        this.flight = null
      } else {
        this.ball.x = f.fromX + (f.toX - f.fromX) * u
        this.ball.y = f.fromY + (f.toY - f.fromY) * u
        this.ball.z = f.apex * 4 * u * (1 - u)
      }
      return
    }
    const h = this.ball.holder ? this.byKey.get(this.ball.holder) : undefined
    if (h) {
      this.ball.x = h.x
      this.ball.y = h.y
      this.ball.z = 0.12
    }
  }

  private integrateJumps(s: Script | null): void {
    for (const b of this.bodies) b.z = 0
    if (!s) return
    for (const j of s.jumps) {
      if (this.elapsed >= j.t0 && this.elapsed <= j.t1) {
        const b = this.byKey.get(j.key)
        if (b) b.z = Math.max(b.z, j.h * Math.sin((Math.PI * (this.elapsed - j.t0)) / (j.t1 - j.t0)))
      }
    }
  }
}
