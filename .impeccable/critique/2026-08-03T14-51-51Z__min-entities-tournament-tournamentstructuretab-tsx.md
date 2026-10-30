---
target: pestaña Estructura del gestor de torneos
total_score: 24
p0_count: 1
p1_count: 2
timestamp: 2026-08-03T14-51-51Z
slug: min-entities-tournament-tournamentstructuretab-tsx
---
⚠️ DEGRADED: single-context (la sesión prohíbe subagentes salvo pedido explícito)

# Crítica — Pestaña Estructura del gestor de torneos

## Design Health Score

| # | Heurística | Puntaje | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Feedback bueno en guardado; el asistente no dice qué pasos faltan hasta llegar |
| 2 | Sistema ↔ mundo real | 2 | "Modelo competitivo", "Consola competitiva", "circuito" sin definir; Título Caso mezclado |
| 3 | Control y libertad | 3 | Se puede cancelar y volver; sin deshacer tras borrar fase |
| 4 | Consistencia | 3 | Ya alineado al shell; quedan tres vocabularios de panel |
| 5 | Prevención de errores | 3 | Validación real por paso; borrar fase pide confirmación |
| 6 | Reconocer > recordar | 2 | 6 pasos con estado que no se ve desde afuera |
| 7 | Flexibilidad | 1 | Sin atajos de teclado, sin acciones masivas |
| 8 | Estética y minimalismo | 2 | 6 pasos + 4 métricas + lista de fases + constructor en una pantalla |
| 9 | Recuperación de errores | 3 | Mensajes claros y en español |
| 10 | Ayuda | 2 | Hay glosario, pero la ayuda contextual es despareja |
| **Total** | | **24/40** | **Aceptable** |

## Veredicto de anti-patrones

Detector determinista: `[]` — cero hallazgos en los cuatro archivos.
Evaluación propia: no parece hecho por IA. Parece hecho por **tres personas distintas en tres momentos**.

## Data fantasma

Escrito en la base y leído por NADIE:
- `statsAssignment` / `playerStats.assignOnlyToStarters` — Paso 5. Tres apariciones en todo el repo: el formulario, su relectura y el tipo.
- `playerStats.behavior.*` (whenToAttribute, eligibility.rules, attribution.howToApply) — 0 lectores.
- `matchFormat.behavior.*` (seriesLength, winnerDetermination, aggregateMethod, tieResolution) — 0 lectores; los dos "lectores" que aparecen son escritores del mismo blob.
- `eligiblePlayers` — 0 apariciones fuera del literal que lo escribe.

Real, con consumidores verificados:
pointsSystem (7), tiebreakers (12), tableColumns (3), group_names (5), groupLabels (4),
advanceCount (4, phaseFlow), circuit.pointsByPlacement (2), carryOverPreviousPhase (3,
standingsCarryOver), fixedRoster (4, lineups/fixture/matchCenter), legs (generate-rounds).

## Prioridades

- **[P0] El Paso 5 configura la nada.** Corregido en esta pasada con marca "Sin efecto todavía".
- **[P1] 40 líneas de ficción por fase guardada.** Los blobs `behavior`/`attribution` son documentación escrita en la base.
- **[P1] Sin atajos ni acciones masivas** en un asistente de 6 pasos.
- **[P2] Vocabulario inventado** sin glosario en el punto de uso.
- **[P2] Una pantalla, cuatro tareas.**

## Corregido en esta pasada

- 7 encabezados declaraban `text-2xl`/`text-xl`/`text-lg` + `font-extrabold` + `tracking-tight`: utilidades muertas (la escala sin capa del shell les gana). El código decía 24px, la pantalla mostraba 15px.
- 26 `text-white` → `var(--text-main)`.
- Marca honesta en el control sin motor.
