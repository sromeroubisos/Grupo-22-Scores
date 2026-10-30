# Gestor de Torneos — Fase 2: Saneamiento de CSS (documento separado)

**Fecha:** 2026-07-23 · **Alcance:** solo la estrategia de CSS. Los tokens (valores) viven en `GESTOR_TORNEOS_FASE2_REDISENO.md §2.3`; acá va el **plan de migración**.
**Regla:** sin dependencias nuevas (Tailwind 4 + CSS Modules ya instalados). No tocar CSS de checkout/billing.

---

## 1. Estado actual (medido)

| Métrica | Valor |
|---|---|
| CSS total del módulo | **962 KB** en 16 archivos |
| % global (side-effect import) | **83%** (~856 KB) — clases globales, colisionan |
| `!important` | **3.099** (tournament-mobile ~1.913 = 62%; +structure +phase-wizard = 95%) |
| Clases definidas en ≥2 archivos | **169** → gana el último import |
| z-index distintos | **42** valores mágicos, 4 capas de modal descoordinadas |
| Breakpoints distintos | **26** (7 anchos de "teléfono", 5 pares off-by-one) |
| Literales hardcodeados | blanco 106× · verde `#00a365` ~115× · rampa blanco-alpha 600+× |
| CSS Modules limpios | 5 archivos (~106 KB) — única base sana |

---

## 2. Arquitectura destino

**Recomendación:** 3 capas, mobile-first, cero CSS global nuevo.
1. **Tokens** — un único `:root` en un archivo global chico (los valores de §2.3). Reemplaza los 164 custom props fragmentados.
2. **Layout / utilidades** — Tailwind 4 (ya en uso) para grid/flex/spacing responsive. Mata los grids de columnas fijas.
3. **Componente** — **CSS Modules por tab** (scope garantizado, sin colisiones ni `!important`). Reemplaza los sheets globales.

Los sheets globales (`basalt.css`, `tournament-structure.css`, `phase-wizard.css`, `tournament-participants-flash.css`, `fixture-management.css`, `fixture-kinetic.css`, `participants-premium.css`, `drawer-premium.css`, `historical-season-import.css`, `season-creation.css`) **se retiran progresivamente**, uno por tab, a medida que Fase 3 reescribe cada tab en su Module.

**Excepción — `tournament-mobile.css` NO se migra: se mata (ver §6).**

---

## 3. Kill-list

### CSS de código muerto (borrar directo, sin migrar)
- Acoplado a `TournamentStructureTab.backup.tsx`, `TournamentParticipantsTab.old.tsx`, `TournamentParticipantsTab.tsx.backup`, `AddParticipantDrawer.tsx.backup`.
- `ImportParticipantsDrawer.tsx` (v1) y su CSS.
- Árbol fixture legacy (`TournamentFixtureTab`, `FixtureMatchEditor`, `FixtureMatchTable`, `FixtureHeader`, `FixtureSidebar`, `TournamentTableTab`) → revisar qué CSS de `fixture-management.css`/`fixture-kinetic.css` queda huérfano al borrarlos.

### Duplicación a colapsar
- Participantes carga **dos design languages**: `tournament-participants-flash.css` (89 KB) + `participants-premium.css` (32 KB) + `drawer-premium.css` (14 KB). Colapsar a un Module de Equipos + un Module de drawer compartido.
- `basalt.css` re-declara z-index/utilidades que `fixture-management.css` repite (`z-index:44/55`). Deduplicar contra la escala de tokens.

---

## 4. Reglas de erradicación

### `!important` → 0
- Causa raíz: sheets globales que pelean entre sí. Al pasar a Modules (scope), el `!important` deja de ser necesario. Regla dura: **ningún Module nuevo puede tener `!important`** (lint/review lo bloquea).

### z-index → escala de 8 niveles
Mapear los 42 valores mágicos a `--z-*` (base/sticky/header/dropdown/overlay/drawer/modal/toast). Un único "modal layer" (`--z-modal`) elimina las colisiones actuales (2000/2001 vs 2100/2101 vs 2290).

### Breakpoints → 4 canónicos
`sm:640 · md:768 · lg:1024 · xl:1280` (min-width, mobile-first). Erradicar los 7 anchos de teléfono (379/380/390/419/420/479/480) y los pares off-by-one (767/768, 1023/1024, 1099/1100, 1279/1280). Un solo boundary de "teléfono": `< sm (640)`.

### Overflow → contenedores fluidos
- Sacar todo `width:Npx` de layout; usar `%`/`fr`/`clamp()`/`minmax(0,…)`.
- Sidebars con `minmax` de piso fijo (320/340/260/300px) → `minmax(0, …)` + colapso a 1-col bajo `lg`.
- Toda tabla densa → wrapper `overflow-x:auto` propio (nunca el body).

### Color → tokens
Blanco (`#fff`/`#ffffff` 106×) → `--text-primary`/`--surface-*`. Rampa blanco-alpha (600+×) → `--surface-1..3`/`--muted`. Verde `#00a365` (~115×) → `--accent`. Prohibido literal de color en Modules nuevos.

### Motion → reducido
`prefers-reduced-motion` global (hoy solo 2/14 archivos lo respetan).

---

## 5. Secuencia (atada al orden de Fase 3: P0 → P3)

| Paso | Acción CSS | Depende de |
|---|---|---|
| 0 | Crear archivo de tokens (`:root`) + escala z-index + 4 breakpoints | — |
| 1 | Borrar CSS de código muerto (kill-list §3) | Validación de equipo del ADORNO/legacy |
| 2 | Migrar shell + navegación a Module + tokens; matar doble-DOM en el shell | Paso 0 |
| 3..N | Por cada tab (orden P0→P3): reescribir su CSS en Module, retirar el sheet global correspondiente, quitar su `!important` | Reescritura del tab en Fase 3 |
| Final | Borrar los sheets globales ya sin referencias; verificar 0 colisiones | Todos los tabs migrados |

**Criterio de salida:** CSS shipped < 300 KB, 0 `!important` en Modules nuevos, 0 clases en ≥2 archivos, escala z-index única, 4 breakpoints, 0 literales de color fuera de tokens.

---

## 6. Fecha de muerte de `tournament-mobile.css` (decisión del usuario, 2026-07-23)

**`tournament-mobile.css` (250 KB, ~1.913 `!important`) NO se migra: se elimina de una.** No existe por diseño propio — existe solo para **anular** el CSS desktop en los bloques `-mobile` paralelos del doble-DOM. En cuanto el doble-DOM muere, cada regla del archivo queda muerta al mismo tiempo.

**Condición de muerte (hito duro, no gradual):**
1. Reemplazar el doble-DOM por **un único árbol responsive** por tab (Tailwind mobile-first + Module con tokens), tab por tab: Resumen → Configuración → Fases → Equipos → Operación.
2. A medida que cada tab pasa a árbol único, se borran sus reglas asociadas de `tournament-mobile.css`.
3. **Cuando el último tab queda en árbol único, `tournament-mobile.css` se BORRA COMPLETO** y se saca su `import` de `TournamentManageShell.tsx:22`. No se conserva ninguna regla "por las dudas".

**Gate de verificación antes de borrar el archivo:** `grep -r "tournament-mobile" src/` debe dar 0 resultados fuera del propio archivo, y una pasada visual en 375/768/1024/1440 sin duplicación ni overflow. Recién ahí se elimina.

**Prioridad:** es el mayor ahorro individual de CSS (250 KB = 26% del total) y la causa del doble-DOM (P1). Su muerte va atada al hito de "eliminar doble-DOM", que en el orden P0→P3 cae temprano en el bloque estructural (P1), no al final.
