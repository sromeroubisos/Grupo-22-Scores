// Bandeja de entrada: genera items derivados del estado del mundo.
// No se persisten — se calculan al vuelo cada vez.

import type { World, ID, Player, Match, Contract } from '../types/index.ts'
import { ageFromDOB, formatDateES, daysBetween } from '../utils/date.ts'
import { getLastMatch, getNextMatch } from './season.ts'
import { isSeasonComplete, getSeasonChampions } from './seasonRollover.ts'

export type InboxItemType =
  | 'result'
  | 'next_match'
  | 'injury'
  | 'contract_expiring'
  | 'cup_advance'
  | 'finance'
  | 'board'
  | 'season_end'
  | 'world_news_upset'
  | 'world_news_qualification'
  | 'world_news_cycle_completed'

export interface InboxItem {
  id: string
  type: InboxItemType
  priority: 'high' | 'medium' | 'low'
  title: string
  body: string
  date: string
  action?: { label: string; path: string }
}

/** Genera la inbox del manager para su club gestionado. */
export function generateInbox(world: World, clubId: ID): InboxItem[] {
  const items: InboxItem[] = []
  const club = world.clubs.find((c) => c.id === clubId)

  // Item de fin de temporada (prioritario si aplica)
  if (club && isSeasonComplete(world)) {
    const champions = getSeasonChampions(world)
    const mineChamp = champions.find((c) => c.championClubId === clubId)
    items.push({
      id: `season_end_${world.seasonYear}`,
      type: 'season_end',
      priority: 'high',
      title: mineChamp
        ? `🏆 ¡Campeones de ${mineChamp.competitionName}!`
        : `Fin de la temporada ${world.seasonYear}-${world.seasonYear + 1}`,
      body: champions.map((c) => `${c.competitionName}: ${c.championClubName}`).join(' · ') || 'Sin campeones definidos.',
      date: world.currentDate,
      action: { label: 'Avanzar a próxima temporada →', path: '/dashboard' }
    })
  }

  if (!club) return items

  // 1. Próximo partido
  const next = getNextMatch(world, clubId)
  if (next) {
    const home = world.clubs.find((c) => c.id === next.homeClubId)
    const away = world.clubs.find((c) => c.id === next.awayClubId)
    const competition = world.competitions.find((c) => c.id === next.competitionId)
    items.push({
      id: `next_${next.id}`,
      type: 'next_match',
      priority: 'high',
      title: `Próximo partido: ${home?.shortName} vs ${away?.shortName}`,
      body: `${competition?.name} · Jornada ${next.round} · ${formatDateES(next.date)}`,
      date: next.date,
      action: { label: 'Ver calendario', path: '/calendar' }
    })
  }

  // 2. Resultado del último partido
  const last = getLastMatch(world, clubId)
  if (last && last.result) {
    const home = world.clubs.find((c) => c.id === last.homeClubId)
    const away = world.clubs.find((c) => c.id === last.awayClubId)
    const myScore = last.homeClubId === clubId ? last.result.homeScore : last.result.awayScore
    const opScore = last.homeClubId === clubId ? last.result.awayScore : last.result.homeScore
    const verdict = myScore > opScore ? '✓ Victoria' : myScore < opScore ? '✗ Derrota' : '— Empate'
    items.push({
      id: `result_${last.id}`,
      type: 'result',
      priority: 'high',
      title: `${verdict}: ${home?.shortName} ${last.result.homeScore}-${last.result.awayScore} ${away?.shortName}`,
      body: `${last.result.homeTries} ensayos vs ${last.result.awayTries} ensayos · ${formatDateES(last.date)}`,
      date: last.date,
      action: { label: 'Ver clasificación', path: '/standings' }
    })
  }

  // 3. Lesiones activas
  const injuredPlayers = world.players.filter((p) => p.clubId === clubId && p.injury && p.injury.weeksOut > 0)
  if (injuredPlayers.length > 0) {
    items.push({
      id: `injuries_${world.currentDate}`,
      type: 'injury',
      priority: injuredPlayers.length >= 5 ? 'high' : 'medium',
      title: `🚑 ${injuredPlayers.length} jugadores lesionados`,
      body: injuredPlayers.slice(0, 4).map((p) => `${p.firstName} ${p.lastName} — ${p.injury!.weeksOut}w`).join(' · ') +
        (injuredPlayers.length > 4 ? ` · y ${injuredPlayers.length - 4} más` : ''),
      date: world.currentDate,
      action: { label: 'Ver plantilla', path: '/squad' }
    })
  }

  // 4. Contratos a punto de expirar (< 6 meses)
  const myPlayers = world.players.filter((p) => p.clubId === clubId)
  const expiring: Array<{ player: Player; contract: Contract; days: number }> = []
  for (const p of myPlayers) {
    const c = world.contracts.find((ct) => ct.id === p.contractId)
    if (!c) continue
    const days = Math.round((new Date(c.endDate).getTime() - new Date(world.currentDate).getTime()) / 86400000)
    if (days > 0 && days < 180) expiring.push({ player: p, contract: c, days })
  }
  if (expiring.length > 0) {
    const top3 = expiring.sort((a, b) => a.days - b.days).slice(0, 3)
    items.push({
      id: `expiring_${world.currentDate}`,
      type: 'contract_expiring',
      priority: 'medium',
      title: `⚠ ${expiring.length} contratos expiran en menos de 6 meses`,
      body: top3.map((e) => `${e.player.firstName} ${e.player.lastName} (${e.days}d)`).join(' · '),
      date: world.currentDate,
      action: { label: 'Ver finanzas', path: '/finances' }
    })
  }

  // 5. Avance en Champions Cup
  const ccup = world.competitions.find((c) => c.format === 'european')
  if (ccup && ccup.clubIds.includes(clubId)) {
    const myCupMatches = world.matches.filter(
      (m) => m.competitionId === ccup.id && (m.homeClubId === clubId || m.awayClubId === clubId)
    ).sort((a, b) => b.date.localeCompare(a.date))
    const lastCup = myCupMatches.find((m) => m.played)
    if (lastCup && lastCup.result) {
      const home = world.clubs.find((c) => c.id === lastCup.homeClubId)
      const away = world.clubs.find((c) => c.id === lastCup.awayClubId)
      const won = (lastCup.homeClubId === clubId && lastCup.result.homeScore > lastCup.result.awayScore) ||
                  (lastCup.awayClubId === clubId && lastCup.result.awayScore > lastCup.result.homeScore)
      items.push({
        id: `cup_${lastCup.id}`,
        type: 'cup_advance',
        priority: 'high',
        title: won ? `🏆 ¡Avanzas en Champions Cup!` : `Eliminado de Champions Cup`,
        body: `${home?.shortName} ${lastCup.result.homeScore}-${lastCup.result.awayScore} ${away?.shortName}`,
        date: lastCup.date,
        action: { label: 'Ver bracket', path: '/europe' }
      })
    }
  }

  // 6. Salud financiera
  if (club.finances.cash < 100_000) {
    items.push({
      id: `finance_warn_${world.currentDate}`,
      type: 'finance',
      priority: 'high',
      title: '💰 Tesorería baja',
      body: `Solo ${club.finances.cash.toLocaleString('es-ES')} € en caja. Considera vender un jugador o pedir presupuesto.`,
      date: world.currentDate,
      action: { label: 'Ver finanzas', path: '/finances' }
    })
  }

  // 7. Mensaje de la directiva
  const exp = world.boardExpectations[clubId]
  if (exp && exp.boardConfidence < 40) {
    items.push({
      id: `board_warn_${world.currentDate}`,
      type: 'board',
      priority: 'high',
      title: '⚠ La directiva está descontenta',
      body: `Confianza: ${exp.boardConfidence}/100. La situación es crítica.`,
      date: world.currentDate,
      action: { label: 'Ver directiva', path: '/board' }
    })
  } else if (exp && exp.boardConfidence > 85) {
    items.push({
      id: `board_good_${world.currentDate}`,
      type: 'board',
      priority: 'low',
      title: '✓ La directiva confía plenamente en ti',
      body: `Confianza: ${exp.boardConfidence}/100.`,
      date: world.currentDate,
      action: { label: 'Ver directiva', path: '/board' }
    })
  }

  // 8. Noticias mundiales (independientes del club): batacazos del ranking,
  //    nuevas clasificadas para Mundiales, ciclos completados.
  items.push(...generateWorldNews(world))

  // Ordenar por prioridad
  const prio = { high: 0, medium: 1, low: 2 }
  return items.sort((a, b) => prio[a.priority] - prio[b.priority])
}

/** Genera items derivados de eventos globales (rankings, mundiales).
 *  Independiente del club gestionado. */
function generateWorldNews(world: World): InboxItem[] {
  const items: InboxItem[] = []
  const today = world.currentDate

  // 8a. Batacazos del ranking en los últimos 7 días.
  const recentUpsets = (world.rankingHistory ?? []).filter((ch) => {
    if (ch.flavor !== 'upset' && ch.flavor !== 'rwc_upset') return false
    return daysBetween(ch.date, today) <= 7 && ch.date <= today
  })
  // Mostrar hasta 3 batacazos más recientes.
  const topUpsets = recentUpsets.slice(-3).reverse()
  for (const ch of topUpsets) {
    const winner = ch.homeDelta > 0 ? ch.homeCountryId : ch.awayCountryId
    const loser = ch.homeDelta > 0 ? ch.awayCountryId : ch.homeCountryId
    const winnerCountry = world.countries.find((c) => c.id === winner)
    const loserCountry = world.countries.find((c) => c.id === loser)
    if (!winnerCountry || !loserCountry) continue
    const delta = Math.abs(ch.homeDelta).toFixed(2)
    const isRWC = ch.flavor === 'rwc_upset'
    items.push({
      id: `upset_${ch.matchId}`,
      type: 'world_news_upset',
      priority: 'low',
      title: isRWC
        ? `🌍 Batacazo mundialista: ${winnerCountry.code} sorprende a ${loserCountry.code}`
        : `🌍 Batacazo: ${winnerCountry.code} bate a ${loserCountry.code}`,
      body: `${winnerCountry.name} suma +${delta} puntos World Rugby; ${loserCountry.name} pierde la misma cantidad.`,
      date: ch.date,
      action: { label: 'Ver ranking', path: '/ranking' }
    })
  }

  // 8b. Nuevas clasificadas para Mundial en los últimos 14 días.
  //     Se detecta por slots con assignedCountryId cuya fuente terminó recientemente.
  const cycles = world.qualificationCycles ?? []
  const recentlyAssigned: Array<{ cycleId: string; countryId: ID; cycleLabel: string; date: string }> = []
  for (const cycle of cycles) {
    if (cycle.completedAt && daysBetween(cycle.completedAt, today) <= 30) {
      items.push({
        id: `cycle_done_${cycle.id}`,
        type: 'world_news_cycle_completed',
        priority: 'medium',
        title: `🏆 Clasificación ${cycle.targetEvent} ${cycle.edition} ${cycle.gender === 'women' ? 'F' : 'M'} completa`,
        body: `Las ${cycle.totalSlots} selecciones para ${cycle.targetEvent} ${cycle.edition} ya están definidas.`,
        date: cycle.completedAt,
        action: { label: 'Ver clasificación', path: '/qualifications' }
      })
    }
    for (const slot of cycle.slots) {
      if (!slot.assignedCountryId) continue
      // Detectar cuándo se "rellenó" este slot: si la fuente es competition_winner,
      // mirar la fecha del último partido de esa competición. Si es reciente, generar.
      const src = slot.source
      if (src.kind !== 'competition_winner') continue
      const comp = world.competitions.find((c) => c.shortName === src.competitionShortName)
      if (!comp) continue
      const compMatches = world.matches.filter((m) => m.competitionId === comp.id && m.played)
      if (compMatches.length === 0) continue
      const lastDate = compMatches.reduce((a, m) => m.date > a ? m.date : a, compMatches[0].date)
      if (daysBetween(lastDate, today) > 14) continue
      recentlyAssigned.push({
        cycleId: cycle.id,
        countryId: slot.assignedCountryId,
        cycleLabel: `${cycle.targetEvent} ${cycle.edition}${cycle.gender === 'women' ? ' F' : ''}`,
        date: lastDate
      })
    }
  }
  // Mostrar hasta 4 clasificadas recientes, deduplicadas por countryId+cycleId.
  const seen = new Set<string>()
  const topAssigned = recentlyAssigned
    .filter((r) => {
      const key = `${r.cycleId}|${r.countryId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(-4).reverse()
  for (const r of topAssigned) {
    const country = world.countries.find((c) => c.id === r.countryId)
    if (!country) continue
    items.push({
      id: `qual_${r.cycleId}_${r.countryId}`,
      type: 'world_news_qualification',
      priority: 'low',
      title: `🌍 ${country.code} clasifica para ${r.cycleLabel}`,
      body: `${country.name} asegura su plaza tras el cierre de su competencia regional.`,
      date: r.date,
      action: { label: 'Ver clasificación', path: '/qualifications' }
    })
  }

  return items
}
