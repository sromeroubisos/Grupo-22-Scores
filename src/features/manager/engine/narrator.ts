// Generación de narración en español para los eventos del partido.
// Plantillas con sustitución de nombres. Variedad para evitar repetición.

import type { MatchTeam, Side } from './types.ts'
import type { RNG } from './rng.ts'

interface Ctx {
  rng: RNG
  attTeam: MatchTeam
  defTeam: MatchTeam
  attSide: Side
}

const pick = (rng: RNG, arr: string[]) => arr[Math.floor(rng.next() * arr.length)]

// ---- frases por situación ----

export function narrateKickoff(ctx: Ctx): string {
  return pick(ctx.rng, [
    `${ctx.attTeam.clubName} pone el balón en juego.`,
    `Saque de centro de ${ctx.attTeam.clubName}.`,
    `Comienza el partido. Saque inicial de ${ctx.attTeam.clubName}.`
  ])
}

export function narrateScrum(ctx: Ctx, won: boolean): string {
  if (won) return pick(ctx.rng, [
    `Melé limpia para ${ctx.attTeam.clubName}.`,
    `El paquete de ${ctx.attTeam.shortName} domina la melé y saca balón.`,
    `Balón limpio en melé para ${ctx.attTeam.clubName}.`
  ])
  return pick(ctx.rng, [
    `Penal en melé a favor de ${ctx.defTeam.clubName} — la primera línea de ${ctx.attTeam.shortName} cede.`,
    `Hunde la melé ${ctx.defTeam.shortName}, penal claro.`,
    `${ctx.defTeam.clubName} aplasta la melé y consigue penal.`
  ])
}

export function narrateLineout(ctx: Ctx, won: boolean): string {
  if (won) return pick(ctx.rng, [
    `Touch limpio para ${ctx.attTeam.clubName}.`,
    `Salto perfectamente sincronizado, ${ctx.attTeam.shortName} se queda con la touch.`,
    `${ctx.attTeam.shortName} gana la touch sin oposición.`
  ])
  return pick(ctx.rng, [
    `¡Robo en touch! ${ctx.defTeam.clubName} se lleva el balón.`,
    `Lanzamiento desviado, ${ctx.defTeam.shortName} aprovecha y captura.`,
    `Mal salto de ${ctx.attTeam.shortName}, balón para ${ctx.defTeam.clubName}.`
  ])
}

export function narrateOpenPlayGain(ctx: Ctx, meters: number): string {
  if (meters >= 20) return pick(ctx.rng, [
    `¡Gran ruptura de ${ctx.attTeam.clubName}! Avanzan más de 20 metros.`,
    `${ctx.attTeam.shortName} parte la línea defensiva con una preciosa carrera.`,
    `Línea defensiva de ${ctx.defTeam.shortName} desbordada, ${ctx.attTeam.shortName} avanza con peligro.`
  ])
  if (meters >= 10) return pick(ctx.rng, [
    `${ctx.attTeam.shortName} suma metros con paciencia, +${meters}m.`,
    `Buena fase de ${ctx.attTeam.clubName}, ganan terreno.`,
    `${ctx.attTeam.shortName} avanza con un offload preciso.`
  ])
  return pick(ctx.rng, [
    `${ctx.attTeam.shortName} mantiene posesión sin avanzar mucho.`,
    `Fase trabada, defensa firme de ${ctx.defTeam.shortName}.`,
    `Pick & go de ${ctx.attTeam.shortName}, pocos metros.`
  ])
}

export function narrateTurnover(ctx: Ctx): string {
  return pick(ctx.rng, [
    `¡Robo de ${ctx.defTeam.clubName} en el ruck!`,
    `${ctx.defTeam.shortName} consigue el turnover.`,
    `Pierde el balón ${ctx.attTeam.shortName} — turnover para ${ctx.defTeam.shortName}.`,
    `Penal en el ruck contra ${ctx.attTeam.shortName} — no soltó el balón.`
  ])
}

export function narrateKickToTouch(ctx: Ctx, meters: number): string {
  return pick(ctx.rng, [
    `Despeje a touch de ${ctx.attTeam.shortName}, gana ${meters}m.`,
    `${ctx.attTeam.shortName} patea fuera, ganando ${meters}m de territorio.`,
    `Gran patada de ${ctx.attTeam.shortName} buscando la touch (${meters}m).`
  ])
}

export function narrateBoxKick(ctx: Ctx, meters: number): string {
  return pick(ctx.rng, [
    `Box-kick del 9 de ${ctx.attTeam.shortName} (${meters}m).`,
    `Patada al hueco del medio melé de ${ctx.attTeam.shortName}.`,
    `${ctx.attTeam.shortName} cambia el juego con una patada táctica.`
  ])
}

export function narrateTry(ctx: Ctx): string {
  return pick(ctx.rng, [
    `¡ENSAYO de ${ctx.attTeam.clubName}!`,
    `¡Apoya en el en-goal! Ensayo para ${ctx.attTeam.shortName}.`,
    `¡ENSAYO! ${ctx.attTeam.clubName} cruza la línea de marca.`,
    `¡Tremendo ensayo de ${ctx.attTeam.clubName}!`
  ])
}

export function narrateConversion(ctx: Ctx, made: boolean): string {
  if (made) return pick(ctx.rng, [
    `Conversión convertida.`,
    `El 10 de ${ctx.attTeam.shortName} no falla la conversión.`,
    `Patada limpia, suma los 2 puntos.`
  ])
  return pick(ctx.rng, [
    `Falla la conversión.`,
    `Se va desviada la patada.`,
    `Mala patada, no entra la conversión.`
  ])
}

export function narratePenaltyKick(ctx: Ctx, made: boolean): string {
  if (made) return pick(ctx.rng, [
    `Patada de penal de ${ctx.attTeam.shortName}: ¡adentro! +3 puntos.`,
    `${ctx.attTeam.shortName} no falla a palos. 3 puntos.`,
    `Penal convertido por ${ctx.attTeam.clubName}.`
  ])
  return pick(ctx.rng, [
    `Falla el penal a palos ${ctx.attTeam.shortName}.`,
    `Patada de penal desviada, no suma puntos.`,
    `${ctx.attTeam.shortName} no aprovecha la oportunidad a palos.`
  ])
}

export function narrateDropGoal(ctx: Ctx, made: boolean): string {
  if (made) return pick(ctx.rng, [
    `¡DROP! El 10 de ${ctx.attTeam.shortName} suma 3 puntos.`,
    `Drop goal magistral de ${ctx.attTeam.shortName}.`,
    `${ctx.attTeam.clubName} anota un drop goal.`
  ])
  return pick(ctx.rng, [
    `Intenta el drop ${ctx.attTeam.shortName} pero se va alto.`,
    `Drop goal fallado.`
  ])
}

export function narratePenaltyToTouch(ctx: Ctx): string {
  return pick(ctx.rng, [
    `${ctx.attTeam.shortName} elige patear a touch desde el penal.`,
    `${ctx.attTeam.clubName} busca la touch para mantener presión.`
  ])
}

export function narratePenaltyWon(ctx: Ctx): string {
  return pick(ctx.rng, [
    `Penal a favor de ${ctx.attTeam.shortName}.`,
    `Indisciplina de ${ctx.defTeam.shortName} — penal en contra.`,
    `${ctx.attTeam.clubName} consigue un penal en zona peligrosa.`
  ])
}

export function narrateMaulDrive(ctx: Ctx, meters: number): string {
  return pick(ctx.rng, [
    `Maul de ${ctx.attTeam.shortName} avanza ${meters}m hacia el en-goal.`,
    `Conducción del maul muy efectiva, +${meters}m.`,
    `${ctx.attTeam.shortName} mantiene el maul vivo y suma metros.`
  ])
}

export function narrateHalfEnd(): string {
  return 'Final del primer tiempo.'
}
export function narrateFullTime(): string {
  return 'Suena el silbato. Final del partido.'
}

// ============ Narradores para eventos nuevos (descomposición open play) ============

export function narrateTackle(ctx: Ctx): string {
  return pick(ctx.rng, [
    `Placaje firme de ${ctx.defTeam.shortName}.`,
    `${ctx.defTeam.shortName} para el avance con un tackle limpio.`,
    `Bien plantado el placaje, va al suelo.`,
    `Tackle dominante de la defensa.`,
    `${ctx.defTeam.shortName} sujeta al portador y lo lleva al suelo.`
  ])
}

export function narrateOffload(ctx: Ctx): string {
  return pick(ctx.rng, [
    `¡Offload de ${ctx.attTeam.shortName}! El balón sigue vivo.`,
    `Pase corto en el contacto, ${ctx.attTeam.clubName} mantiene la fase.`,
    `Magnífico offload tras el contacto, continúa el ataque.`,
    `${ctx.attTeam.shortName} libera el balón antes de caer al suelo.`
  ])
}

export function narrateJackal(ctx: Ctx): string {
  return pick(ctx.rng, [
    `¡Robo en el suelo! ${ctx.defTeam.shortName} arranca la pelota.`,
    `Jackal limpio de ${ctx.defTeam.shortName}, posesión rival.`,
    `${ctx.defTeam.clubName} llega primero al ruck y se queda con el balón.`,
    `Turnover decisivo en el breakdown a favor de ${ctx.defTeam.shortName}.`
  ])
}

export function narrateRuck(ctx: Ctx, fastBall: boolean): string {
  if (fastBall) return pick(ctx.rng, [
    `Ruck rápido, ${ctx.attTeam.shortName} saca el balón al instante.`,
    `Limpieza eficaz en el ruck, salida rápida.`,
    `${ctx.attTeam.shortName} domina el breakdown y reparte rápido.`
  ])
  return pick(ctx.rng, [
    `Ruck lento, la defensa se reorganiza.`,
    `${ctx.attTeam.shortName} tarda en limpiar, balón ralentizado.`,
    `Salida lenta del ruck, la defensa coge posiciones.`
  ])
}

export function narrateLineBreak(ctx: Ctx): string {
  return pick(ctx.rng, [
    `¡Rompe la línea ${ctx.attTeam.shortName}! Espacio abierto.`,
    `Penetración en la defensa, ${ctx.attTeam.clubName} corre al espacio.`,
    `¡Quiebra a la defensa! ${ctx.attTeam.shortName} encuentra el hueco.`,
    `Line break clarísimo de ${ctx.attTeam.shortName}.`
  ])
}

export function narrateKnockOn(ctx: Ctx, rain: boolean): string {
  if (rain) return pick(ctx.rng, [
    `Knock-on con el balón resbalando. Melé para ${ctx.defTeam.shortName}.`,
    `Se le cae el balón con el suelo húmedo. Melé rival.`,
    `Knock-on por culpa de la lluvia, posesión para ${ctx.defTeam.shortName}.`
  ])
  return pick(ctx.rng, [
    `Knock-on. Melé para ${ctx.defTeam.shortName}.`,
    `Se le escapa el balón hacia delante. Melé rival.`,
    `Adelantado, posesión para ${ctx.defTeam.clubName}.`
  ])
}

// ============ Fase 2: granularidad de eventos ============

export function narrateScrumReset(ctx: Ctx, resetNum: number): string {
  return pick(ctx.rng, [
    `Melé colapsada (reset ${resetNum}/3), el árbitro la repite.`,
    `Se cae la melé otra vez — repetición ${resetNum}/3.`,
    `Reset de melé ${resetNum}/3, el ref ordena rearmar.`
  ])
}

export function narrateScrumCollapse(ctx: Ctx): string {
  return pick(ctx.rng, [
    `Tercer colapso seguido — el árbitro penaliza a ${ctx.attTeam.shortName}.`,
    `Ya basta: penal contra ${ctx.attTeam.shortName} por colapsar repetidamente.`,
    `El ref ya no aguanta — penal a favor de ${ctx.defTeam.shortName}.`
  ])
}

export function narrateMaulForm(ctx: Ctx): string {
  return pick(ctx.rng, [
    `${ctx.attTeam.shortName} forma el maul tras el catch.`,
    `Maul armado por ${ctx.attTeam.clubName}, empiezan a empujar.`,
    `${ctx.attTeam.shortName} liga el maul y avanza hacia el en-goal.`
  ])
}

export function narrateMaulStall(ctx: Ctx): string {
  return pick(ctx.rng, [
    `El maul se para — penal para ${ctx.defTeam.shortName}.`,
    `Maul detenido, sanción para ${ctx.attTeam.shortName}.`,
    `${ctx.defTeam.shortName} aguanta el maul; el ref pita penal.`
  ])
}

export function narrateMaulCollapse(ctx: Ctx): string {
  return pick(ctx.rng, [
    `El maul colapsa ilegalmente — free kick para ${ctx.defTeam.shortName}.`,
    `${ctx.attTeam.shortName} derriba el maul, ${ctx.defTeam.shortName} elige melé.`,
    `Maul colapsado, ${ctx.defTeam.shortName} recupera con golpe franco.`
  ])
}

export function narrateMaulUseIt(ctx: Ctx): string {
  return pick(ctx.rng, [
    `${ctx.attTeam.shortName} saca del maul antes del use-it.`,
    `${ctx.attTeam.clubName} libera la pelota del maul y continúa el ataque.`,
    `Buen timing del 9: saca del maul y reparte.`
  ])
}

export function narrateRuckPickGo(ctx: Ctx): string {
  return pick(ctx.rng, [
    `Pick & go cerca del ruck.`,
    `${ctx.attTeam.shortName} recoge y empuja desde el ruck.`,
    `Pick & go del 9, gana pocos metros.`,
    `Forwards de ${ctx.attTeam.shortName} pick&go, suman a base de impactos.`
  ])
}

export function narrateRuckUseItWarn(): string {
  return `El árbitro grita "¡use it!" — hay que sacarlo ya.`
}

export function narrateGrubber(ctx: Ctx, recovered: boolean): string {
  if (recovered) return pick(ctx.rng, [
    `¡Grubber perfecto de ${ctx.attTeam.shortName} y lo recuperan!`,
    `${ctx.attTeam.shortName} cuelga un grubber por detrás y vuelve a por él.`
  ])
  return pick(ctx.rng, [
    `Grubber de ${ctx.attTeam.shortName} — la defensa lo controla.`,
    `Patada rasera que no encuentra a nadie.`
  ])
}

export function narrateChipKick(ctx: Ctx, recovered: boolean): string {
  if (recovered) return pick(ctx.rng, [
    `¡Chip kick magistral! ${ctx.attTeam.shortName} salta la línea defensiva.`,
    `Chip por encima — ${ctx.attTeam.shortName} regathera detrás.`
  ])
  return pick(ctx.rng, [
    `Chip kick de ${ctx.attTeam.shortName} que no llega a buen puerto.`,
    `Patadita por encima sin éxito, ${ctx.defTeam.shortName} recupera.`
  ])
}

export function narrateCrossKick(ctx: Ctx, recovered: boolean): string {
  if (recovered) return pick(ctx.rng, [
    `¡Cross kick precioso de ${ctx.attTeam.shortName}!`,
    `${ctx.attTeam.shortName} cambia el ala con un cruzado perfecto.`
  ])
  return pick(ctx.rng, [
    `Cross kick que se va largo, ${ctx.defTeam.shortName} recibe sin problema.`,
    `Patada cruzada de ${ctx.attTeam.shortName} sin pareja.`
  ])
}

export function narrateBoxKickChase(ctx: Ctx, won: boolean): string {
  if (won) return pick(ctx.rng, [
    `¡Los chasers de ${ctx.attTeam.shortName} recuperan el contestable!`,
    `Presión enorme arriba — ${ctx.attTeam.shortName} regathera el box-kick.`,
    `${ctx.attTeam.shortName} gana el aéreo, mantienen posesión.`
  ])
  return pick(ctx.rng, [
    `${ctx.defTeam.shortName} asegura la recepción del box-kick.`,
    `Catch limpio del back-three de ${ctx.defTeam.shortName}.`,
    `El zaguero de ${ctx.defTeam.shortName} controla sin problema.`
  ])
}

export function narrateMarkCalled(ctx: Ctx): string {
  return pick(ctx.rng, [
    `¡Mark! El zaguero de ${ctx.attTeam.shortName} pide la marca en su 22.`,
    `${ctx.attTeam.shortName} llama mark dentro del 22, juego parado.`
  ])
}

export function narrateQuickTap(ctx: Ctx): string {
  return pick(ctx.rng, [
    `Tap & go de ${ctx.attTeam.shortName} — buscan sorprender a la defensa.`,
    `${ctx.attTeam.clubName} juega el penal rápido sin esperar.`,
    `¡Quick tap! ${ctx.attTeam.shortName} no le da tiempo a organizarse al rival.`
  ])
}

export function narrateDropGoalAttempt(ctx: Ctx): string {
  return pick(ctx.rng, [
    `${ctx.attTeam.shortName} se prepara para el drop…`,
    `El 10 de ${ctx.attTeam.shortName} se sitúa en pocket — va a probar el drop.`,
    `¡Atención al drop de ${ctx.attTeam.shortName}!`
  ])
}

