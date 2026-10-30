// Definiciones declarativas de ciclos mundialistas.
//
// Cada ciclo (RWC 2027 M, WRWC 2025 F, WRWC 2029 F) se modela como un
// `QualificationCycle` con N `QualificationSlot`s. La fuente de cada slot
// declara cómo se asigna; el motor `qualificationPathfinder.resolveSlots`
// reads competition standings para llenar los slots a medida que terminan
// las competencias regionales.

import type {
  QualificationCycle,
  QualificationSlot,
  QualificationPlayoff,
  Gender
} from '../types/index.ts'
import { newId } from '../utils/id.ts'
import { RWC_2023_TOP_TWELVE, WRWC_2021_TOP_FOUR } from './rwc2023.ts'

function slot(label: string, source: QualificationSlot['source']): QualificationSlot {
  return {
    id: newId('qslot'),
    label,
    source,
    assignedCountryId: null,
    outcome: 'pending'
  }
}

function playoff(id: string, label: string): QualificationPlayoff {
  return {
    id, label,
    winnerCountryId: null,
    loserCountryId: null
  }
}

/** RWC 2027 (Australia) — 24 selecciones. Distribución oficial:
 *    12 ya clasificadas de Francia 2023 (top-3 de cada pool)
 *  + 4 de Rugby Europe Championship
 *  + 1 de Rugby Africa Cup
 *  + 1 de Asia Rugby Championship
 *  + 1 del Sudamericano
 *  + 3 de Pacific Nations Cup (top 3 elegibles)
 *  + 1 play-off Sudamérica-Pacífico
 *  + 1 Final Qualification Tournament (campeón) */
export function buildRWC2027MenCycle(): QualificationCycle {
  const slots: QualificationSlot[] = []

  // 1-12: clasificadas por Francia 2023.
  for (const r of RWC_2023_TOP_TWELVE) {
    slots.push(slot(
      `RWC 2023 Pool ${r.pool} - ${r.position}º (${r.countryCode})`,
      { kind: 'previous_rwc', rwcEdition: 2023, minPosition: r.position, maxPosition: r.position }
    ))
  }

  // 13-16: Europa (REC top 4).
  for (let pos = 1; pos <= 4; pos++) {
    slots.push(slot(
      `Europa ${pos} — REC ${pos}º`,
      { kind: 'competition_winner', competitionShortName: 'REC', position: pos }
    ))
  }

  // 17: África (Africa Cup campeón).
  slots.push(slot(
    'África 1 — Africa Cup 1º',
    { kind: 'competition_winner', competitionShortName: 'AFR_CUP', position: 1 }
  ))

  // 18: Asia (Asia Championship campeón).
  slots.push(slot(
    'Asia 1 — Asia Rugby Championship 1º',
    { kind: 'competition_winner', competitionShortName: 'ASI_CH', position: 1 }
  ))

  // 19: Sudamérica (Sudamericano campeón).
  slots.push(slot(
    'Sudamérica 1 — Sudamericano 1º',
    { kind: 'competition_winner', competitionShortName: 'SAR_CH', position: 1 }
  ))

  // 20-22: Pacífico (PNC top 3).
  for (let pos = 1; pos <= 3; pos++) {
    slots.push(slot(
      `Pacífico ${pos} — Pacific Nations Cup ${pos}º`,
      { kind: 'competition_winner', competitionShortName: 'PNC', position: pos }
    ))
  }

  // 23: Play-off Sudamérica-Pacífico.
  slots.push(slot(
    'Play-off Sudamérica vs Pacífico',
    { kind: 'playoff_winner', playoffId: 'sar_pac_playoff_rwc27' }
  ))

  // 24: Ganador del FQT en Dubái.
  slots.push(slot(
    'FQT 1º — Final Qualification Tournament',
    { kind: 'fqt_position', position: 1 }
  ))

  const playoffs: QualificationPlayoff[] = [
    playoff('sar_pac_playoff_rwc27', 'Sudamérica 2º vs Pacífico 4º elegible')
  ]

  return {
    id: newId('cycle'),
    targetEvent: 'RWC',
    edition: 2027,
    gender: 'men',
    totalSlots: 24,
    slots,
    playoffs,
    completedAt: null
  }
}

/** WRWC 2025 (Inglaterra) — 16 selecciones. Distribución:
 *    4 ya aseguradas (host + semifinalistas WRWC 2021)
 *  + 1 Europa (Women's Six Nations 2024)
 *  + 1 África (Africa Women's Cup 2024)
 *  + 1 Asia (Asia Women's Championship 2024)
 *  + 1 Oceanía (Oceania Women's Championship 2024)
 *  + 1 Sudamérica (Brasil/Colombia play-off → BRA)
 *  + 1 Pacific Four
 *  + 6 WXV (mejores no clasificadas tras WXV 2024) */
export function buildWRWC2025WomenCycle(): QualificationCycle {
  const slots: QualificationSlot[] = []

  // 1: anfitrión Inglaterra
  // 2-4: semifinalistas WRWC 2021 (NZL, FRA, CAN). NZL ya está como anfitrión
  //      moral; aquí lo modelamos como pre-asignación independiente.
  for (const r of WRWC_2021_TOP_FOUR) {
    slots.push(slot(
      r.countryCode === 'ENG' ? 'Anfitrión (Inglaterra)' : `Semifinalista WRWC 2021 (${r.countryCode})`,
      { kind: 'fixed', countryCode: r.countryCode }
    ))
  }

  // 5: Europa — campeona REC 2024 (en la práctica WAL o ESP; modelo: top de W_REC).
  slots.push(slot(
    'Europa 1 — Rugby Europe Women Championship 1º',
    { kind: 'competition_winner', competitionShortName: 'W_REC', position: 1 }
  ))

  // 6: África — Africa Women's Cup campeona.
  slots.push(slot(
    'África 1 — Africa Women Cup 1º',
    { kind: 'competition_winner', competitionShortName: 'W_AFR_CUP', position: 1 }
  ))

  // 7: Asia — Asia Women's Championship campeona.
  slots.push(slot(
    'Asia 1 — Asia Rugby Women Championship 1º',
    { kind: 'competition_winner', competitionShortName: 'W_ASI_CH', position: 1 }
  ))

  // 8: Oceanía — Oceania Women's Championship campeona.
  slots.push(slot(
    'Oceanía 1 — Oceania Rugby Women Championship 1º',
    { kind: 'competition_winner', competitionShortName: 'W_OCE_CH', position: 1 }
  ))

  // 9: Sudamérica — Americas Trophy Women campeona (BRA en 2024).
  slots.push(slot(
    'Sudamérica 1 — Americas Rugby Trophy Women 1º',
    { kind: 'competition_winner', competitionShortName: 'W_SAR_T', position: 1 }
  ))

  // 10: Pacific Four campeona (top no ya clasificada — modelo: top 1 simple).
  slots.push(slot(
    'Pacific Four 1 — Pacific Four Series 1º',
    { kind: 'competition_winner', competitionShortName: 'P4', position: 1 }
  ))

  // 11-16: WXV — mejores 6 selecciones no clasificadas tras WXV 2024.
  //        Modelo simplificado: top 6 de WXV.
  for (let pos = 1; pos <= 6; pos++) {
    slots.push(slot(
      `WXV ${pos}º`,
      { kind: 'competition_winner', competitionShortName: 'WXV', position: pos }
    ))
  }

  return {
    id: newId('cycle'),
    targetEvent: 'WRWC',
    edition: 2025,
    gender: 'women',
    totalSlots: 16,
    slots,
    playoffs: [],
    completedAt: null
  }
}

/** WRWC 2029 (Australia, sede confirmada). World Rugby aún no ha publicado el
 *  desglose definitivo de plazas. Hasta que lo haga, clonamos el modelo 2025
 *  como plantilla y ajustamos la edición/anfitrión. Cuando aparezca el
 *  reglamento real, basta editar esta función. */
export function buildWRWC2029WomenCycle(): QualificationCycle {
  const template = buildWRWC2025WomenCycle()
  return {
    ...template,
    id: newId('cycle'),
    edition: 2029,
    completedAt: null,
    slots: template.slots.map((s) => ({
      ...s, id: newId('qslot'),
      assignedCountryId: null, outcome: 'pending' as const
    })),
    playoffs: template.playoffs.map((p) => ({
      ...p, winnerCountryId: null, loserCountryId: null
    }))
  }
}

/** Builds todos los ciclos activos en el world demo. */
export function buildAllQualificationCycles(): QualificationCycle[] {
  return [
    buildRWC2027MenCycle(),
    buildWRWC2025WomenCycle(),
    buildWRWC2029WomenCycle()
  ]
}
