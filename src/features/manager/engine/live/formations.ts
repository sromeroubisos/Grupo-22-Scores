// Formaciones: dónde está cada uno de los 30 jugadores en cada tipo de jugada.
//
// No hay movimiento simulado. Cada jugada del motor se traduce a la formación que
// el rugby real tiene en ese momento (la melé 3-4-1 contra 3-4-1, las dos filas de
// la touch, el ruck con sus dos grupos de delanteros y la línea de tres cuartos, la
// línea defensiva plana) y la pantalla anima el paso de una a la otra. Puro y
// determinista: la misma jugada da siempre los mismos 30 puntos.

import type { RugbyPosition } from '../../types/index.ts'
import type { Side } from '../types.ts'
import type { Dot, PlayKind, Pt } from './types.ts'

export interface FormationInput {
  kind: PlayKind
  attacker: Side
  /** Sentido del ataque sobre x: +1 o -1. */
  dir: 1 | -1
  ball: Pt
  /** Quién lleva o patea la pelota: se lo deja sobre ella. */
  focus?: { side: Side; position: RugbyPosition }
  /** Separación extra entre los dos packs de una melé, para la aproximación previa al contacto. */
  scrumGap?: number
  /** Metros que se corre toda la melé hacia el lado del que ataca (el empuje). */
  scrumPush?: number
}

const PITCH_W = 70

const round1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home')

function dot(side: Side, position: RugbyPosition, x: number, y: number): Dot {
  return {
    key: `${side}-${position}`,
    side,
    position,
    x: round1(clamp(x, -8, 108)),
    y: round1(clamp(y, 2, PITCH_W - 2))
  }
}

const ALL: RugbyPosition[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

/** Y de un punto "a la izquierda" del equipo que ataca hacia `dir`: con el ataque
 *  hacia +x, la izquierda es y chico (el eje y crece hacia abajo en pantalla). */
function leftIsLowY(dir: 1 | -1): boolean {
  return dir === 1
}

/** Hacia qué lado hay más cancha y qué ala queda de ese lado. */
export function wideInfo(dir: 1 | -1, by: number): { wide: 1 | -1; wingWide: RugbyPosition; wingShort: RugbyPosition } {
  const wide = by < PITCH_W / 2 ? 1 : -1
  const wingWide: RugbyPosition = (wide === 1) === leftIsLowY(dir) ? 14 : 11
  return { wide, wingWide, wingShort: wingWide === 14 ? 11 : 14 }
}

// ───────────────────────────── ruck / juego abierto ─────────────────────────────

/** El equipo que ataca después de un ruck: el 9 en la base, tres delanteros sobre la
 *  pelota, dos grupos de delanteros a los costados y los tres cuartos en línea hacia
 *  el lado ancho. */
function attackShape(side: Side, dir: 1 | -1, ball: Pt): Dot[] {
  const { x: bx, y: by } = ball
  // Se ataca hacia donde hay más cancha.
  const wide = by < PITCH_W / 2 ? 1 : -1
  const back = (n: number) => bx - dir * n
  const wingWide: RugbyPosition = (wide === 1) === leftIsLowY(dir) ? 14 : 11
  const wingShort: RugbyPosition = wingWide === 14 ? 11 : 14

  const out: Dot[] = []
  // Sobre el ruck.
  ;([8, 4, 5] as RugbyPosition[]).forEach((p, i) => out.push(dot(side, p, back(0.9 + i * 0.8), by + (i - 1) * 0.9)))
  // Grupo ancho de delanteros y grupo corto.
  ;([1, 2, 3] as RugbyPosition[]).forEach((p, i) => out.push(dot(side, p, back(6.5), by + wide * (7.5 + i * 1.6))))
  ;([6, 7] as RugbyPosition[]).forEach((p, i) => out.push(dot(side, p, back(5.5), by - wide * (8 + i * 1.6))))
  // Medio scrum y línea de tres cuartos.
  out.push(dot(side, 9, back(1.3), by + wide * 1.3))
  out.push(dot(side, 10, back(6), by + wide * 6))
  out.push(dot(side, 12, back(8), by + wide * 13))
  out.push(dot(side, 13, back(9.5), by + wide * 20))
  out.push(dot(side, wingWide, back(10), by + wide * 29))
  out.push(dot(side, wingShort, back(14), by - wide * 16))
  out.push(dot(side, 15, back(22), by - wide * 5))
  return out
}

/** Línea defensiva plana a `gap` metros del ruck, con el zaguero atrás. */
function defenceShape(side: Side, dir: 1 | -1, ball: Pt, gap: number): Dot[] {
  const { x: bx, y: by } = ball
  // Orden de izquierda a derecha del propio equipo defensor (su izquierda es la
  // opuesta a la del atacante, porque miran para el otro lado).
  const lr: RugbyPosition[] = [11, 4, 1, 6, 12, 10, 7, 8, 2, 13, 3, 5, 14]
  const defDir = (-dir) as 1 | -1
  const lowFirst = leftIsLowY(defDir)
  const start = clamp(by - 24, 3, PITCH_W - 3 - 48)
  const out: Dot[] = []
  lr.forEach((p, i) => {
    const slot = lowFirst ? i : lr.length - 1 - i
    // La línea no es una regla: el que está más cerca del ruck se adelanta un poco.
    const y = start + slot * 4
    const x = bx + dir * (gap + (Math.abs(y - by) < 5 ? 0.6 : 0))
    out.push(dot(side, p, x, y))
  })
  out.push(dot(side, 9, bx + dir * (gap + 1.2), by - 1.4))
  out.push(dot(side, 15, bx + dir * (gap + 24), 35 + (by - 35) * 0.5))
  return out
}

// ──────────────────────────────────── melé ────────────────────────────────────

/** Melé 3-4-1 contra 3-4-1 sobre la marca; el medio scrum del equipo que pone la
 *  pelota, al costado del túnel; los tres cuartos detrás de cada pack. */
function scrumShapes(feeding: Side, dir: 1 | -1, ball: Pt, gap = 0, push = 0): Dot[] {
  const { x: bx, y: by } = ball
  const defending = other(feeding)
  const out: Dot[] = []

  const pack = (side: Side, sign: 1 | -1, mirrored: boolean) => {
    // sign: hacia dónde queda el pack respecto de la marca (x).
    const row = (n: number) => bx + sign * (n + gap) + dir * push
    const lat = (n: number) => (mirrored ? -n : n)
    out.push(dot(side, 1, row(0.7), by + lat(-1.3)))
    out.push(dot(side, 2, row(0.7), by))
    out.push(dot(side, 3, row(0.7), by + lat(1.3)))
    out.push(dot(side, 4, row(1.7), by + lat(-0.7)))
    out.push(dot(side, 5, row(1.7), by + lat(0.7)))
    out.push(dot(side, 6, row(2.4), by + lat(-2.0)))
    out.push(dot(side, 7, row(2.4), by + lat(2.0)))
    out.push(dot(side, 8, row(2.9), by))
  }
  pack(feeding, -dir as 1 | -1, false)
  pack(defending, dir, true)

  // Tres cuartos de cada lado: el atacante abre hacia el lado ancho.
  const wide = by < PITCH_W / 2 ? 1 : -1
  const wingWide: RugbyPosition = (wide === 1) === leftIsLowY(dir) ? 14 : 11
  const wingShort: RugbyPosition = wingWide === 14 ? 11 : 14
  const back = (n: number) => bx - dir * n
  out.push(dot(feeding, 9, back(0.8), by + wide * 2.4))
  out.push(dot(feeding, 10, back(8), by + wide * 7))
  out.push(dot(feeding, 12, back(10.5), by + wide * 14))
  out.push(dot(feeding, 13, back(13), by + wide * 21))
  out.push(dot(feeding, wingWide, back(14), by + wide * 30))
  out.push(dot(feeding, wingShort, back(15), by - wide * 22))
  out.push(dot(feeding, 15, back(24), by - wide * 4))

  // El que defiende queda 5 metros detrás del último pie de su pack.
  const fwd = (n: number) => bx + dir * n
  out.push(dot(defending, 9, fwd(0.8), by - wide * 2.4))
  out.push(dot(defending, 10, fwd(9), by + wide * 7))
  out.push(dot(defending, 12, fwd(9.5), by + wide * 13))
  out.push(dot(defending, 13, fwd(10), by + wide * 19))
  out.push(dot(defending, wingWide === 14 ? 11 : 14, fwd(10.5), by + wide * 28))
  out.push(dot(defending, wingWide === 14 ? 14 : 11, fwd(11), by - wide * 20))
  out.push(dot(defending, 15, fwd(24), by + wide * 4))
  return out
}

// ──────────────────────────────────── touch ────────────────────────────────────

/** Touch: dos filas perpendiculares a la línea de touch, el lanzador afuera, el 9 y
 *  los tres cuartos a una distancia de diez metros. */
function lineoutShapes(throwing: Side, dir: 1 | -1, ball: Pt): Dot[] {
  const { x: bx } = ball
  const ty = ball.y < PITCH_W / 2 ? 0 : PITCH_W
  const e = ty === 0 ? 1 : -1
  const defending = other(throwing)
  const out: Dot[] = []
  const order: RugbyPosition[] = [4, 5, 6, 7, 8, 1, 3]

  order.forEach((p, i) => {
    const y = ty + e * (5.5 + i * 1.7)
    out.push(dot(throwing, p, bx - dir * 0.6, y))
    out.push(dot(defending, p, bx + dir * 0.6, y))
  })
  // Quien tira.
  out.push(dot(throwing, 2, bx, ty + e * 0.6))
  out.push(dot(defending, 2, bx + dir * 2.5, ty + e * 6))
  // El 9 detrás de la fila.
  out.push(dot(throwing, 9, bx - dir * 3, ty + e * 19))
  out.push(dot(defending, 9, bx + dir * 3, ty + e * 19))

  // Tres cuartos: línea diagonal hacia adentro de la cancha.
  const wingA: RugbyPosition = e === 1 ? (leftIsLowY(dir) ? 11 : 14) : (leftIsLowY(dir) ? 14 : 11)
  const wingB: RugbyPosition = wingA === 11 ? 14 : 11
  const ys = [24, 31, 38, 46]
  const backs: RugbyPosition[] = [10, 12, 13, wingB]
  backs.forEach((p, i) => out.push(dot(throwing, p, bx - dir * (9 + i * 1.5), ty + e * ys[i])))
  out.push(dot(throwing, wingA, bx - dir * 9, ty + e * 10))
  out.push(dot(throwing, 15, bx - dir * 24, ty + e * 28))

  const defBacks: RugbyPosition[] = [10, 12, 13, wingB === 11 ? 14 : 11]
  defBacks.forEach((p, i) => out.push(dot(defending, p, bx + dir * (10 + i * 1.5), ty + e * ys[i])))
  out.push(dot(defending, wingA === 11 ? 14 : 11, bx + dir * 10, ty + e * 10))
  out.push(dot(defending, 15, bx + dir * 24, ty + e * 28))
  return out
}

// ──────────────────────────────────── saque ────────────────────────────────────

/** Saque desde la mitad de cancha: el que patea en línea sobre el medio, el que
 *  recibe repartido con el 15 atrás. */
function kickoffShapes(kicking: Side, dir: 1 | -1): Dot[] {
  const receiving = other(kicking)
  const out: Dot[] = []
  const kickerRow: RugbyPosition[] = [11, 4, 1, 6, 12, 8, 7, 10, 2, 13, 3, 5, 14, 9, 15]
  kickerRow.forEach((p, i) => out.push(dot(kicking, p, 50 - dir * (p === 10 ? 0 : 1.5), 5 + i * (60 / 14))))
  const recv: Array<[RugbyPosition, number, number]> = [
    [1, 12, 22], [2, 12, 26], [3, 12, 30], [4, 14, 38], [5, 14, 42],
    [6, 13, 50], [7, 13, 18], [8, 16, 34],
    [9, 20, 36], [10, 22, 30], [12, 26, 22], [13, 26, 46], [11, 32, 8], [14, 32, 62], [15, 40, 35]
  ]
  recv.forEach(([p, ahead, y]) => out.push(dot(receiving, p, 50 + dir * ahead, y)))
  return out
}

// ──────────────────────────────── patada a palos ────────────────────────────────

/** Patada a los palos (penal, conversión o drop): el pateador sobre la marca, los
 *  suyos detrás y el rival en fila sobre la línea de gol. */
function goalKickShapes(kicking: Side, dir: 1 | -1, ball: Pt, kicker: RugbyPosition): Dot[] {
  const { x: bx, y: by } = ball
  const defending = other(kicking)
  const goalX = dir === 1 ? 100 : 0
  const out: Dot[] = []
  ALL.forEach((p, i) => out.push(dot(defending, p, goalX - dir * 0.6, 35 + (i - 7) * 3)))
  const mates = ALL.filter((p) => p !== kicker)
  mates.forEach((p, i) => out.push(dot(kicking, p, bx - dir * (7 + (i % 3) * 2), by + (i - 7) * 2.6)))
  out.push(dot(kicking, kicker, bx, by))
  return out
}

// ──────────────────────────────────── ensayo ────────────────────────────────────

function tryShapes(scoring: Side, dir: 1 | -1, ball: Pt): Dot[] {
  const { x: bx, y: by } = ball
  const conceding = other(scoring)
  const goalX = dir === 1 ? 100 : 0
  const out: Dot[] = []
  ALL.forEach((p, i) => out.push(dot(scoring, p, bx - dir * (2.5 + (i % 3) * 3), by + ((i % 5) - 2) * 3.4)))
  ALL.forEach((p, i) => out.push(dot(conceding, p, goalX - dir * (7 + (i % 3) * 3), 12 + i * 3.4)))
  return out
}

// ───────────────────────────────────── maul ─────────────────────────────────────

function maulShapes(driving: Side, dir: 1 | -1, ball: Pt): Dot[] {
  const { x: bx, y: by } = ball
  const defending = other(driving)
  const out: Dot[] = []
  const pack: RugbyPosition[] = [5, 4, 8, 2, 6, 7, 1, 3]
  pack.forEach((p, i) => out.push(dot(driving, p, bx - dir * (0.3 + i * 0.85), by + (i % 2 === 0 ? -0.5 : 0.5))))
  const stoppers: RugbyPosition[] = [4, 5, 6, 7, 8]
  stoppers.forEach((p, i) => out.push(dot(defending, p, bx + dir * (0.9 + i * 0.85), by + (i % 2 === 0 ? 0.5 : -0.5))))
  const rest: RugbyPosition[] = [1, 2, 3]
  rest.forEach((p, i) => out.push(dot(defending, p, bx + dir * 5, by - 4 + i * 4)))
  const wide = by < PITCH_W / 2 ? 1 : -1
  const backs: RugbyPosition[] = [9, 10, 12, 13, 14, 11, 15]
  backs.forEach((p, i) => {
    out.push(dot(driving, p, bx - dir * (9 + i * 1.2), by + wide * (4 + i * 4.5) * (i % 2 === 0 ? 1 : -0.6)))
    out.push(dot(defending, p, bx + dir * (7 + i * 1.2), by + wide * (3 + i * 4.5) * (i % 2 === 0 ? 1 : -0.6)))
  })
  return out
}

// ─────────────────────────────────── público ───────────────────────────────────

/** Los 30 puntos de una jugada. Quien lleva o patea la pelota queda sobre ella. */
export function formationFor(input: FormationInput): Dot[] {
  const { kind, attacker, dir, ball, focus } = input
  const defender = other(attacker)
  let dots: Dot[]

  switch (kind) {
    case 'scrum':
      dots = scrumShapes(attacker, dir, ball, input.scrumGap ?? 0, input.scrumPush ?? 0)
      break
    case 'lineout':
      dots = lineoutShapes(attacker, dir, ball)
      break
    case 'kickoff':
      dots = kickoffShapes(attacker, dir)
      break
    case 'goal':
      dots = goalKickShapes(attacker, dir, ball, focus?.side === attacker ? focus.position : 10)
      break
    case 'try':
      dots = tryShapes(attacker, dir, ball)
      break
    case 'maul':
      dots = maulShapes(attacker, dir, ball)
      break
    case 'penalty':
      // Los que atacan se ordenan alrededor de la marca; el rival retrocede 10 metros.
      dots = [...attackShape(attacker, dir, ball), ...defenceShape(defender, dir, ball, 10)]
      break
    case 'kick':
      // Los que patean quedan en línea detrás del pateador; el rival, más profundo.
      dots = [...attackShape(attacker, dir, ball), ...defenceShape(defender, dir, ball, 7)]
      break
    default:
      dots = [...attackShape(attacker, dir, ball), ...defenceShape(defender, dir, ball, 1.6)]
  }

  if (focus && kind !== 'try') {
    const at = dots.find((d) => d.side === focus.side && d.position === focus.position)
    if (at) {
      at.x = round1(ball.x - dir * 0.4 * (focus.side === attacker ? 1 : -1))
      at.y = round1(clamp(ball.y, 2, PITCH_W - 2))
    }
  }
  if (focus && kind === 'try') {
    const at = dots.find((d) => d.side === focus.side && d.position === focus.position)
    if (at) { at.x = round1(ball.x); at.y = round1(ball.y) }
  }
  return dots
}
