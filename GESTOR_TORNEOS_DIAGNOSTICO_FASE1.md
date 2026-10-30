# Gestor de Torneos — Diagnóstico Fase 1

**Proyecto:** Grupo-22-Scores · **Fecha:** 2026-07-23
**Página auditada:** `/admin/entities/[id]/manage?type=tournament`
**Entry point:** `src/app/admin/entities/[id]/manage/page.tsx` (Server Component) → `src/components/admin/entities/tournament/TournamentManageShell.tsx` (Client) → tab activo.
**Alcance:** solo diagnóstico. Ningún archivo de la app modificado en esta fase.

> **Regla dura del proyecto:** no tocar MercadoPago, checkout, webhooks de pago ni tablas de pagos en ninguna fase.

---

## Decisiones tomadas al cierre de Fase 1

| Decisión | Valor |
|---|---|
| **Alcance del rediseño** | Refactor quirúrgico (conservar lógica sana, no reescritura desde cero) |
| **Prioridad de implementación (Fase 3)** | P0 primero — dejar de caerse antes de tocar estética |
| **Dirección de IA** | Consistente con la memoria previa: adaptar/refactorizar, no reinventar la arquitectura |

---

## 0. Tensión de dirección (resuelta)

La memoria del proyecto y `GESTOR_TORNEOS_AUDITORIA_MOBILE.md` fijaron el rumbo previo en *"adaptar el flujo actual responsive, NO rediseñar la IA"* y *"eliminar duplicados mobile/desktop"*. El pedido de "reinventar" se resolvió como **refactor quirúrgico agresivo**: se conserva el server-render y la lógica probada (Estructura, Operación, Participantes, Relacionados, Publicación, Auditoría), y se ataca el daño real (P0, doble-DOM, CSS global fuera de control).

---

## 1. Árbol de componentes y modelo de render

La página raíz es **Server Component** y **solo monta el tab activo** (render condicional `&&`, `page.tsx:484-549`). No hay client-tab-switcher que monte los 9 tabs. `layout.tsx` está vacío.

```
manage/page.tsx                                    [SC]  fetch server-side, monta SOLO el tab activo
└─ TournamentManageShell                           [CC]  653 líneas — JUSTIFICADO
   └─ TournamentDraftProvider (TournamentDirtyCtx)  [CC]  único context a nivel shell
      └─ TournamentManageShellInner                 [CC]
         ├─ TournamentHeader                        [CC]  443 líneas — 2 menús portalizados inline
         ├─ TournamentTabs                          [CC]  422 líneas — nav router.push(?tab=)
         ├─ <main>{children = tab activo}</main>    [SC/CC] slot desde el server; operación/fixture monta FixtureProvider (641) acá, scoped
         ├─ TournamentRightSidebar                  [CC]  103 líneas — ARRASTRE (0 hooks, podría ser SC); solo si tab=resumen
         ├─ footer (Recalcular / Guardar)
         ├─ HistoricalSeasonImportDrawer            [CC]  siempre montado, open-gated
         └─ TournamentSeasonCreationModal           [CC]  siempre montado, open-gated
```

| Componente | `use client` | Justificación | Líneas | >400 |
|---|---|---|---|---|
| TournamentManageShell | sí | JUSTIFICADO (6 useState, save/recalc/export, Ctrl+S, beforeunload) | 653 | ✅ fragmentar |
| TournamentHeader | sí | JUSTIFICADO (2 portales, menús) | 443 | ✅ fragmentar |
| FixtureContext | sí | JUSTIFICADO (fuera del shell, scoped a fixture) | 641 | ✅ fragmentar |
| TournamentContext | sí | JUSTIFICADO (crea el context) | 281 | — |
| DarkSelect / useDialog / AccordionSection | sí | JUSTIFICADO | <210 | — |
| **TournamentRightSidebar** | sí | **ARRASTRE** — 0 hooks, markup estático + `<Link>`; client solo por recibir callback del padre | 103 | — |

**Riesgo de render #1 (P1):** `TournamentDirtyCtx` es un context grueso. Cada `setSectionDraft` (una por **tecleo** en Detalles/Formato) muta `drafts` → nuevo value → **re-render de todo el chrome** + **`JSON.stringify`+`localStorage.setItem` sincrónico por keystroke** (`TournamentContext.tsx:151-165`). El subtree del tab se salva por ref estable, pero el chrome tipea con lag.

### Archivos > 400 líneas (candidatos a fragmentar)

| Archivo | Líneas |
|---|---|
| TournamentStructureTab.tsx | 2692 |
| TournamentOperationFixtureWorkspace.tsx | 2246 |
| TournamentParticipantsTab.tsx | 2047 |
| TournamentFixtureTab.tsx (**huérfano**) | 1923 |
| PlayoffBuilderPanel.tsx | 1126 |
| TournamentSeasonCreationModal.tsx | 722 |
| TournamentDetailsTab.tsx | 687 |
| TournamentManageShell.tsx | 653 |
| FixtureContext.tsx | 641 |
| StandingsTable.tsx / TournamentStandingsTab.tsx | 641 / 637 |
| TournamentOperationTab.tsx | 593 |
| FixtureMatchEditor.tsx (**huérfano**) | 572 |
| FlashScoreSyncPanel.tsx | 564 |
| UpsertParticipantDrawer.tsx | 563 |
| TournamentStatsTab.tsx | 548 |
| TournamentRelatedTab.tsx | 528 |

### Código muerto (borrar)

- `TournamentStructureTab.backup.tsx`, `TournamentParticipantsTab.old.tsx`, `TournamentParticipantsTab.tsx.backup`, `AddParticipantDrawer.tsx.backup`.
- Árbol fixture legacy huérfano (no montado por nadie): `TournamentFixtureTab.tsx`, `FixtureMatchEditor.tsx`, `FixtureMatchTable.tsx`, `FixtureHeader.tsx`, `FixtureSidebar.tsx`, `TournamentTableTab.tsx`. La superficie viva es `TournamentOperationFixtureWorkspace.tsx`.
- `ImportParticipantsDrawer.tsx` (v1) — solo referenciado por el `.old`; la tab viva usa `ImportParticipantsDrawerV2`.

---

## 2. Fichas por tab

Los 9 tabs de `TOURNAMENT_TABS` (`TournamentTabs.tsx:27-37`) + `medios` (huérfano, fuera de la nav).

### Resumen — `?tab=resumen` (default)
- **Función:** landing de estado (badges, completion, salud, próximo evento).
- **Datos:** todo por props del server, sin fetch cliente. Único dato vivo: `matchCount`, calculado con `matches.select('id').eq('tournament_id',id)` + `.length` — **sin `count:'exact'`, sin `.limit()`** (`page.tsx:419`).
- **Fetch:** ninguno en cliente.
- **Responsive:** doble render (`tournament-summary-mobile` + `-desktop` ambos en el DOM, swap por CSS).
- **Estado: ADORNO.** Pasos de progreso 3-5 fijos en `false`; links de salud `href="#"` muertos; "PRÓXIMA FECHA: Sin partidos", "ÚLTIMO RECÁLCULO --" hardcodeados.

### Detalles — `?tab=detalles`
- **Función:** editor de identidad (nombre, slug, temporada, deporte, unión, país, bonus). Guarda con `updateEntity` (server action).
- **Datos:** props. `unions`/`countries` con `.select(...)` **sin `.limit()`** (`page.tsx:417,421`). Sin fetch en mount.
- **Responsive:** bloque `tournament-details-mobile` (~150 líneas JSX, `:270-418`) **renderizado pero `display:none` en TODOS los breakpoints** → JSX muerto en el DOM. En mobile se ve el form legacy forzado a 1 columna.
- **Estado: FUNCIONA con lastre** (bloque mobile muerto + lista de países duplicada hardcode + server).

### Formato — `?tab=formato`
- **Función:** editor del catálogo `ruleset.matchEvents` (tipo/etiqueta/puntos). Fuente de la consola de partido.
- **Datos:** props (`ruleset`), sin red. Prop `matchCount` **fantasma** (no se usa, llega 0).
- **Responsive:** bloque `tournament-format-mobile` (`:200-296`) **nunca visible** (mismo patrón que Detalles).
- **Estado: FUNCIONA con lastre.**

### Estructura — `?tab=estructura`
- **Función:** constructor de fases (liga/grupos/playoff), modelo competitivo, plantel fijo, puntos, tiebreakers, cuadro.
- **Datos:** `loadPhases()` **eager on-mount** → `GET /api/tournaments/[id]/phases`, que hace `select('*')` sin `.limit()` (**el propio código loguea `logOverfetchWarning`**, `phases/route.ts:62-65`). `PlayoffBuilderPanel` es **lazy** (al expandir).
- **Responsive:** **sin bloque mobile paralelo** — adaptación in-place con bottom-sheet. La única tab sana en responsive.
- **Estado: FUNCIONA.**

### Participantes — `?tab=participantes`
- **Función:** CRUD de participantes, grupos, asignación de fase, import-por-pegado, export.
- **Datos:** **4 fetches EAGER en mount** (`participants?full=true`, `groups`, `phases`, `phase-participants` — `:223-230`). `full=true` **sin `.limit()`** por contrato. `loadClubs` = `GET /api/admin/torneo/clubs?limit=2000` (lazy). Bulk delete/import/create = **N+1** (`Promise.all(map(fetch))`).
- **Responsive:** doble render (`tsm-participant-list` mobile + `participants-table` desktop; las listas divergen: mobile pagina, desktop renderiza todo).
- **Estado: FUNCIONA.** Sub-feature **"Historial de Cambios" = ADORNO** — pega a `GET .../participants/audit` que **no existe**; la UI dice "estará disponible próximamente".

### Operación — `?tab=operacion&subtab={fixture|tabla|estadisticas|sincronizacion}`
- **Función:** núcleo operativo. Orquestador + 4 subtabs `dynamic()` (lazy).
- **Datos:** orquestador hace `loadPhases` eager **+ `refreshFixture()` en mount SIN importar el subtab** (`:270-274` → `GET /fixture`) → trae el fixture completo aunque abras Tabla/Estadísticas/Sync. El `/fixture` **re-consulta phases** (ya cargadas) + tournament+rounds+matches+participants, matches **sin `.limit()`**.
- **Subtabs:** Fixture (`TournamentOperationFixtureWorkspace`, 2246), Tabla (standings), Estadísticas, Sincronización — todas FUNCIONAN. Sin polling.
- **Responsive:** doble render (mobile section + desktop context card + subtabs bar).
- **Estado: FUNCIONA.** Código muerto adjunto (ver §1).

### Relacionados — `?tab=related`
- **Función:** mapa interno + CRUD de torneos vinculados.
- **Datos:** props del server; refresh/mutación solo on-action. Sin fetch eager.
- **Estado: FUNCIONA.** Baja frecuencia.

### Publicación — `?tab=publicacion`
- **Función:** status (draft/published/active/archived) + toggles `is_visible`/`is_popular`/`sync_locked`.
- **Datos:** solo props; `updateEntity` on-save. Prop `matchCount` **sin usar**.
- **Estado: FUNCIONA.** Solapa con controles del header.

### Auditoría — `?tab=audit`
- **Función:** últimas 50 mutaciones. `AuditSection` es Server Component.
- **Datos:** `admin_audit_log.select('*')...limit(50)` (`AuditSection.tsx:11-17`) — **tiene `.limit()`**, pero `select('*')`.
- **Estado: FUNCIONA.** Baja frecuencia.

### Medios — `?tab=medios`
- **NO está en la nav ni aliasado.** Solo se llega tipeando la URL. Componente entero: `return <TabPlaceholder title="Medios y Branding" />`.
- **Estado: ADORNO.** Stub de 3 líneas, huérfano.

---

## 3. Tabla resumen

| Tab | Estado | Costo de datos | Rompe en | Acción propuesta |
|---|---|---|---|---|
| **Resumen** | 🟡 ADORNO (datos fake) | `matches` completo p/ contar (P1-2); resto props | ≤767 doble render; grid 12-col se aplana | Reconstruir con datos reales o absorber en header |
| **Detalles** | 🟢 FUNCIONA c/ lastre | unions+countries sin limit; bloque `-mobile` muerto | Mobile: form legacy 1-col apretado | Fusionar con Formato; borrar bloque muerto |
| **Formato** | 🟢 FUNCIONA c/ lastre | props; prop `matchCount` muerto; bloque muerto | Mobile: consola legacy 1-col | Fusionar en Configuración |
| **Estructura** | 🟢 FUNCIONA | `GET /phases select('*')` eager | Bracket ancho desborda <380 | Mantener; proyectar columnas; renombrar "Fases" |
| **Participantes** | 🟢 FUNCIONA (Historial=ADORNO) | 4 fetches eager; `full=true` sin limit; bulk N+1; clubs 2000 | ≤767 doble render | Mantener; endpoint bulk; borrar drawer Historial |
| **Operación** | 🟢 FUNCIONA | phases + **fixture eager aunque subtab≠fixture** | doble render; segmented <380 | Mantener; fixture solo si subtab=fixture; borrar legacy |
| **Relacionados** | 🟢 FUNCIONA | props + refresh on-action | ok (cards) | Mover a "Más" |
| **Publicación** | 🟢 FUNCIONA | props; `matchCount` sin usar | ok | Absorber en header/status |
| **Auditoría** | 🟢 FUNCIONA | `select('*').limit(50)` server | mobile oculta col (sin scroll) | Mover a "Más" |
| **Medios** | 🔴 ADORNO (stub huérfano) | ninguno | n/a | Eliminar |

---

## 4. Diagnóstico de performance

**Estimación de requests al aterrizar en Resumen:** ~12 round-trips DB seriales en el server render (getSession + resolveEntity + barrido de temporadas ~9 + count de matches), **que escalan a ~45 en ~2,5s solo por el prefetch** (P0-1). Cliente en Resumen: 0 fetches. *(Números a medir de verdad en Fase 3 con instrumentación — criterio de aceptación.)*

### Causa raíz de las caídas — P0-1
El prefetch de tabs **evade el kill-switch** `DISABLE_ADMIN_PREFETCH`. En `TournamentTabs.tsx:114`, `isSameTournamentManageHref` siempre es `true` para estos hrefs, así que el `return` de guarda nunca dispara y `router.prefetch()` corre siempre. **Cada prefetch es un render RSC completo de `page.tsx`**, que re-ejecuta el barrido de temporadas (P1-1) + `resolveEntity`. Idle prefetchea 4 tabs, hover/focus las 9 → ~4 renders de página concurrentes × ~10-15 round-trips seriales contra **DB cross-region** (Vercel us-east ↔ Supabase us-west) → **satura el pool de conexiones**.

### Otros
- **P1-1** `buildTournamentSeasonNavigation` corre en cada render de cualquier tab, con loops `while(grew)` (4 queries/iter) y un `like('slug','base-%')` **sin filtro sport/country** (scan de slugs). ~9-13 round-trips por render.
- **P1-2** count de matches trayendo todas las filas (→ `count:'exact', head:true`).
- **P1-3** `/fixture` re-consulta phases ya cargadas (doble carga por apertura de Operación); `select('*')`; matches sin `.limit()`.
- **P1-4** cada route re-resuelve `current_season_id`; Participantes lo hace 4× en mount.
- **Shell** re-render de chrome + `localStorage` sincrónico por tecleo. `FixtureContext` value **sin `useMemo`** → cascada de re-renders.
- **Doble DOM** mobile+desktop en Resumen/Detalles/Formato/Participantes/Operación.

### Guards UUID faltantes (22P02 → 500)
- `groups/route.ts` GET — `tournamentId` sin validar (outlier: sus hermanos sí validan).
- `fixture/route.ts` GET — `id` sin validar.
- `phases/[phaseId]/route.ts` PATCH & DELETE — `phaseId` sin validar.

### A verificar
Memoria `perf_edit_bottleneck`: guardar un resultado dispara el **rebuild síncrono del ranking de temporada** (~800-1200 round-trips seriales) → cuelga/cae en el path de Operación→Fixture. Confirmar si sigue en el request path antes de Fase 3.

---

## 5. Diagnóstico de CSS

- **≈36.000 líneas** en 16 archivos; **83% globales** por side-effect import → clases globales, **169 nombres definidos en ≥2 archivos** (gana el último import). Solo 5 CSS Modules están limpios.
- **3.099 `!important`** — `tournament-mobile.css` concentra ~1.900 (62%); con `tournament-structure` + `phase-wizard` = 95%. Guerra de especificidad autoalimentada.
- **z-index sin escala:** 42 valores mágicos (997/998/999, 2000/2001, 2290…), 4 capas de modal descoordinadas → colisiones de stacking.
- **26 breakpoints** distintos: 7 anchos de "teléfono" (379/380/390/419/420/479/480) y pares off-by-one (767/768, 1023/1024, 1099/1100…).
- **Literales hardcodeados** pese a 164 custom props definidas (fragmentadas por archivo): blanco 106×, verde `#00a365` ~115×, rampa blanco-alpha 600+×, bordes slate ~140×.
- **Overflow responsive:** sidebars de ancho fijo (`320/340/260/300px` min en `basalt.css`), grids de columnas fijas sin contenedor scrollable (`TournamentFormatTab.module.css:331` fila 6-col ~760px min), solo 2/14 archivos respetan `prefers-reduced-motion`.

### Inventario CSS

| Archivo | Líneas (aprox) | Enfoque | `!important` | `@media` |
|---|---|---|---|---|
| tournament-mobile.css | ~6.100 | Global | ~1.913 | 35 |
| basalt.css | ~5.300 | Global | 72 | 26 |
| tournament-structure.css | ~3.900 | Global | 895 | 22 |
| tournament-participants-flash.css | ~2.900 | Global | 3 | 12 |
| fixture-management.css | ~2.640 | Global | 43 | 8 |
| standings/TournamentStandingsTab.module.css | ~1.840 | Module ✅ | 8 | 3 |
| phase-wizard.css | ~1.815 | Global | 134 | 9 |
| participants-premium.css | ~1.242 | Global | 0 | 3 |
| PlayoffBuilderPanel.module.css | ~1.197 | Module ✅ | 1 | 4 |
| TournamentFormatTab.module.css | ~961 | Module ✅ | 9 | 7 |
| TournamentRelatedTab.module.css | ~952 | Module ✅ | 0 | 4 |
| fixture-kinetic.css | ~635 | Global | 8 | 4 |
| historical-season-import.css | ~604 | Global | 11 | 2 |
| drawer-premium.css | ~575 | Global | 0 | 2 |
| TournamentStatsTab.module.css | ~446 | Module ✅ | 2 | 2 |
| season-creation.css | ~388 | Global | 0 | 2 |

---

## 6. Problemas priorizados

### P0 — rompe/cuelga la página
1. Prefetch evade el kill-switch → tormenta de renders RSC → satura pool de conexiones (**la causa de las caídas**).
2. Guards UUID faltantes: `groups` GET, `fixture` GET, `phases/[phaseId]` PATCH/DELETE → 500.
3. *(verificar)* Rebuild síncrono de ranking de temporada al guardar resultado → cuelga.

### P1 — lento
4. Barrido de temporadas en cada render (scan de slugs sin filtro).
5. Count de matches por fetch completo.
6. `/fixture` recarga phases + `select('*')` + matches sin límite.
7. `current_season_id` re-resuelto por route (4× en Participantes).
8. Chrome re-renderiza + localStorage sincrónico por tecleo; `FixtureContext` sin memo.
9. Doble DOM mobile+desktop en 5 tabs.

### P2 — UX / redundante
10. Bulk participantes N+1; `full=true` sin límite; catálogo 2000 filas.
11. Fixture eager aunque el subtab no sea fixture; 4 fetches eager en Participantes.
12. Overflow: sidebars fijos, grids sin scroll container, breakpoints incoherentes.
13. Código muerto: `.backup`/`.old`, árbol fixture legacy, `Medios` stub, drawer Historial (endpoint inexistente).

### P3 — cosmético
14. Guerra de `!important`, z-index mágico, literales sin token, tokens fragmentados.
15. Microcopy (`SIN-SLUG`, jerga), emojis mezclados con lucide.
16. A11y: reduced-motion, foco visible, semántica `tablist`.

---

## 7. Propuesta de nueva arquitectura de información

De **9 tabs (+1 huérfano) → 5 primarios + "Más" (2) + Publicación absorbida**.

| Actual | Propuesta | Por qué |
|---|---|---|
| Resumen | **Resumen** (reconstruir con datos reales) | Buen landing, pero hoy es fachada; darle datos vivos o absorberlo |
| Detalles + Formato | **Configuración** (fusión) | Ambos editan identidad/reglas del torneo; menos saltos |
| Estructura | **Fases** | Sana; solo rename + proyección de columnas |
| Participantes | **Equipos** | Sana; quitar drawer Historial muerto |
| Operación | **Operación** | Núcleo operativo; limpiar árbol legacy huérfano |
| Relacionados | → **"Más"** | Baja frecuencia |
| Auditoría | → **"Más"** | Read-only, baja frecuencia |
| Publicación | **Absorber en header/status** | Status + visibilidad ya viven en el header |
| Medios | **Eliminar** | Stub huérfano |

---

## 8. Criterios de aceptación (para Fase 3)

- Cero overflow horizontal en 375px, 768px, 1024px, 1440px.
- Ningún tab dispara fetch hasta abrirse (salvo el default).
- Ninguna query sin `.limit()` y sin selección explícita de columnas.
- Todos los params de ruta validados antes de la query.
- Todos los estados (loading/empty/error) implementados en cada tab.
- Cero clases CSS muertas y cero valores hardcodeados fuera de tokens.
- Tiempo de carga inicial y cantidad de requests medidos antes/después, con el número reportado.

---

## Fuentes reconciliadas
- `GESTOR_TORNEOS_REDISEÑO.md` (2026-05-09) — propuesta de rediseño previa.
- `GESTOR_TORNEOS_AUDITORIA_MOBILE.md` (2026-05-09) — post-mortem de la adaptación mobile (13 bugs, ~44% hecho).
- `AUDITORIA_FRAGILIDAD_DB.md` (2026-07-01) — fragilidad DB (season_id TEXT vs UUID, delete-then-insert de standings, params sin validar).
- Memoria del proyecto: `perf_edit_bottleneck_rootcause`, `uuid_external_id_outage`, `mobile_adaptation_direction`.
