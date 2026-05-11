# Tournament Engine — fundaciones pro (etapa 2)

Este directorio contiene el **skeleton** del motor profesional de torneos para la próxima
etapa del rediseño. La etapa 1 (UI nueva con plantillas + 3 pasos + modo avanzado vía
PhaseCreator existente) ya está en producción en `src/app/admin/super/torneos/crear/page.tsx`.

## Módulos

### `bonusEngine.ts`
Reglas de bonus evaluables por motor. Reemplaza los campos hardcoded
`pointsBonusTry` / `pointsBonusLoss` por una lista flexible de reglas, cada una
con condición evaluable (`campo + operador + valor + aplica a + modo de cómputo`).

Define:
- `BonusRule` — el shape de cada regla.
- `BONUS_PRESETS` — plantillas pre-configuradas (rugby ofensivo, defensivo, valla invicta, etc.).
- `evaluateBonusRule(rule, ctx)` — stub del evaluador por partido.
- `describeBonusRule(rule)` — stub del describer humano.

### `criteriaEngine.ts`
Criterios de desempate funcionales. Cada criterio es una función comparadora pura
con opciones (head-to-head: directo vs mini-tabla, scope: toda la fase vs solo
entre empatados, etc.) y un simulador para validar el orden.

Define:
- `TiebreakCriterion` — el shape de cada criterio con opciones.
- `CRITERION_CATALOG` — los 8 criterios reales del sistema actual con su fórmula.
- `simulateTiebreak(criteria, tied)` — stub del simulador con trace paso a paso.
- `compareTeams(criteria, a, b, tied)` — stub del comparador para `sort()`.

### `phaseFlow.ts`
Flujo declarado entre fases. Cada fase declara explícitamente `inputs`
(de dónde vienen los equipos) y `outputs` (a dónde van los clasificados).
El motor encadena las fases automáticamente cuando se cierra una fase.

Define:
- `PhaseFlow` — declaración por fase.
- `PhaseInputSource` y `PhaseOutputDestination` — taggable union de orígenes/destinos.
- `validateFlow(flow)` — stub del validador (cupos, ciclos, huérfanas).
- `resolveTransitions(closedPhaseId, flow, standings)` — stub del encadenador.

## Plan de implementación (etapa 2)

### Sprint A · Persistencia (sin lógica nueva)
1. Migración SQL: extender `tournaments.ruleset` y `phases.settings` con los nuevos campos jsonb.
2. Backfill: convertir `pointsBonusTry`/`pointsBonusLoss` existentes a 1-2 reglas en `bonusEngine`.
3. APIs CRUD: `/api/tournaments/[id]/bonus-rules`, `/api/phases/[id]/criteria`, `/api/phases/[id]/flow`.

### Sprint B · Motor de bonus
1. Implementar `evaluateBonusRule` con tests unitarios.
2. Hook en el guardado de resultados de partido: recalcular bonus al guardar.
3. UI editor de reglas (etapa actual del mockup, ya diseñada).
4. Simulador inline mostrando últimos N partidos.

### Sprint C · Motor de criterios
1. Implementar `simulateTiebreak` y `compareTeams` con tests.
2. Hook en cálculo de standings.
3. UI reordenable de criterios con simulador.

### Sprint D · Phase flow
1. Implementar `validateFlow` y `resolveTransitions`.
2. UI grafo visual de fases con flechas etiquetadas.
3. Trigger automático al cerrar una fase: pre-cargar la siguiente.

## Por qué skeleton primero

Estos archivos definen los **shapes** y **API públicas** que la UI nueva va a consumir.
Empezar con los tipos permite:
- La UI del editor profesional puede tipar correctamente sin esperar al motor.
- Los tests de las APIs pueden escribirse primero.
- Las migraciones SQL salen alineadas con los tipos.
- Cualquier persona que vea estos archivos sabe qué se viene y dónde meter sus cambios.

Los `TODO` en cada función marcan qué falta implementar concretamente.
