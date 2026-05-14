# Plan: Soporte Completo de Tema Claro/Oscuro en Club Admin

## Estado Actual
- El proyecto usa `data-theme="dark|light"` + variables CSS globales (`--color-bg-*`, `--color-text-*`).
- **NO** usa clases `dark:` de Tailwind.
- El club-admin ya tiene algunos overrides de light mode (`flash-club-ui.css`, `vitreous-club.css`, `club-admin-mobile.css`) pero **muchos archivos críticos carecen completamente de soporte light**.

---

## Hallazgos de la Auditoría

### 🔴 CSS Críticos sin soporte light mode
| Archivo | Líneas | Problema |
|---|---|---|
| `src/app/club-admin/styles/club-admin-design-system.css` | ~400 | Override light INCOMPLETO: fondos/textos siguen con fallback dark `#0a0a0b` |
| `src/components/admin/entities/club/ClubPerformanceTab.module.css` | ~2.867 | Dark-only masivo, sin `[data-theme="light"]` |
| `src/components/admin/entities/club/ClubStaffPerformanceSuite.module.css` | ~423 | Dark-only, sin `[data-theme="light"]` |
| `src/app/club-admin/matches/[id]/ClubMatchWorkspace.module.css` | ~2.937 | Dark-only, sin `[data-theme="light"]` |
| `src/components/admin/entities/club/pizarra/pizarra.css` | ~1.508 | Dark-only, sin `[data-theme="light"]` |
| `src/components/admin/ui/crystalline.css` | ~300 | Variables `--crys-*` dark-only, afecta a KPICard, StrataRail, GlassCard, shells |

### 🔴 Componentes TSX con colores hardcodeados (inline styles / Tailwind arbitrary values)
| Archivo | Severidad | Problema |
|---|---|---|
| `ClubMatchWorkspace.tsx` | CRÍTICO | Decenas de inline styles con `rgba(255,255,255,...)`, `#f8fafc`, `#93c5fd`, etc. |
| `ClubMatchWorkspace.charts.tsx` | CRÍTICO | Todo el archivo usa colores de chart fijos oscuros |
| `ClubSquadBuilder.tsx` | CRÍTICO | ~50+ clases Tailwind arbitrarias: `bg-[#0f0f0f]`, `text-[#f8fafc]`, `border-[rgba(255,255,255,0.08)]` |
| `CreateInternalMatchModal.tsx` | ALTO | Inline styles masivos con fondos oscuros, bordes blancos semitransparentes |
| `ClubTrainingCreateModal.tsx` | ALTO | Inline styles con `rgba(255,255,255,0.03)`, `#fca5a5`, etc. |
| `ClubEntrenamientosTab.tsx` | ALTO | `BLOCK_TYPE_COLORS` hardcodeados + inline gradients |
| `ClubIdentityTab.tsx` | MEDIO | `bg-[rgba(255,255,255,0.02)]`, `border-[rgba(255,255,255,0.2)]`, etc. |
| `ClubStaffTab.tsx` | MEDIO | `text-amber-500`, `text-green-500` hardcodeados |
| `ClubFixtureResultsTab.tsx` | MEDIO | `bg-[#111118]`, `bg-white/5` |
| `ClubPizarraTab.tsx` | MEDIO | `color: '#22c55e'`, `color: '#ef4444'` inline |
| `ClubDataHealthCard.tsx` | MEDIO | Glows y bordes con rgba hardcodeados |
| `ClubNextMatchesCard.tsx` | MEDIO | Fondos con `rgba(59,130,246,0.12)` |
| `ClubSeasonStatsPanel.tsx` | MEDIO | `color: '#ef4444'`, `rgba(255,255,255,0.6)` |
| `ClubUsersTab.tsx` | BAJO | `borderTop: '1px solid rgba(255,255,255,0.08)'` |
| `ClubManageShell.tsx` | BAJO | Fallback hex en style prop `--accent: '#3b82f6'` |
| `TabPlaceholder.tsx` | BAJO | `bg-[#0a0a0c]`, `text-[#3b82f6]` |
| `CSVImportModal.tsx` | BAJO | `code style={{ color: '#fff' }}` |
| `shells/ClubTrainingShell.tsx` | BAJO | `rgba(255,255,255,0.01)`, `rgba(5,7,10,0.4)` |

### ✅ Componentes/Rutas LIMPIAS (no necesitan cambios)
- `src/app/club-admin/layout.tsx`, `page.tsx`, `matches/page.tsx`, `matches/[id]/page.tsx`, `clubes/crear/page.tsx`, `clubes/[id]/planteles/[squadId]/page.tsx`
- `ClubManageHeader.tsx`, `ClubManageTabs.tsx`, `ClubSummaryHero.tsx`, `ClubMobileConsole.tsx`, `ClubContentStudioTab.tsx`, `ClubSponsorsTab.tsx`, `ClubStandingsOverviewTab.tsx`, `ClubRelatedClubsTab.tsx`, `ClubAccessHub.tsx`

---

## Estrategia de Implementación

### Fase 1: CSS Modules y Design System (Fundación)
**Objetivo**: Que TODOS los archivos CSS de club-admin tengan un bloque `[data-theme="light"]` funcional.

1. **`club-admin-design-system.css`**: Completar el bloque light con overrides para `--ca-bg`, `--ca-surface`, `--ca-surface-elevated`, `--ca-text`, `--ca-text-secondary`, `--ca-border`, `--ca-glass`, etc.
2. **`ClubPerformanceTab.module.css`**: Crear bloque `[data-theme="light"] .performanceTab` con tokens claros.
3. **`ClubStaffPerformanceSuite.module.css`**: Crear bloque light.
4. **`ClubMatchWorkspace.module.css`**: Crear bloque light.
5. **`pizarra/pizarra.css`**: Crear bloque light (solo UI contenedores/toolbars, NO colores funcionales de campo).
6. **`crystalline.css`**: Crear bloque `[data-theme="light"]` para todas las variables `--crys-*`.

### Fase 2: Componentes TSX — Migración a Variables CSS
**Objetivo**: Eliminar colores hardcodeados inline y Tailwind arbitrarios.

**Patrón a seguir**:
- Reemplazar `style={{ color: '#93c5fd' }}` → `style={{ color: 'var(--ca-accent)' }}`
- Reemplazar `bg-[#0f0f0f]` → `bg-[var(--ca-bg)]` o clases del design system
- Reemplazar `border-[rgba(255,255,255,0.08)]` → `border-[var(--ca-border)]`
- Reemplazar `text-[#f8fafc]` → `text-[var(--ca-text)]`

**Orden de prioridad**:
1. `ClubSquadBuilder.tsx` (limpieza masiva de clases arbitrarias)
2. `ClubMatchWorkspace.tsx` + `.charts.tsx` (inline styles masivos)
3. `CreateInternalMatchModal.tsx`, `ClubTrainingCreateModal.tsx`, `ClubEntrenamientosTab.tsx`
4. Resto de componentes de severidad MEDIO/BAJO

### Fase 3: Charts y Gráficos
- Los colores de datos (barras verdes/azules) pueden mantenerse como acentos semánticos.
- Los ejes, grids, labels y fondos de chart deben migrar a variables CSS (`--color-text-secondary`, `--color-bg-secondary`).

### Fase 4: Validación Visual
- Probar cada ruta de club-admin en ambos temas:
  - `/club-admin`
  - `/club-admin/matches`
  - `/club-admin/matches/[id]`
  - `/club-admin/clubes/crear`
  - `/club-admin/clubes/[id]/planteles/[squadId]`

---

## Decisiones Arquitectónicas Pendientes

1. **¿Usar `dark:` de Tailwind o seguir con `[data-theme="light"]` en CSS?**
   - **Recomendación**: Mantener la estrategia actual del proyecto (`[data-theme="light"]` + variables CSS). Es consistente con el resto de la app y no requiere refactor masivo de Tailwind.

2. **¿Crear un `useTheme` hook?**
   - **Recomendación**: NO es necesario para la mayoría de casos. Solo si algún componente necesita lógica condicional compleja en JS (ej. charts que cambian arrays de colores). Para eso, un hook simple de `data-theme` es suficiente.

3. **¿Qué hacer con los colores funcionales de la pizarra (césped verde, líneas blancas)?**
   - **Recomendación**: Dejarlos fijos. Son representaciones físicas, no UI.

---

## Estimación de Esfuerzo

| Fase | Archivos afectados | Estimación |
|---|---|---|
| Fase 1 (CSS modules) | 6 archivos CSS | ~2-3h |
| Fase 2 (TSX migration) | ~15 componentes | ~4-6h |
| Fase 3 (Charts) | 4 componentes | ~1-2h |
| Fase 4 (Validación) | 5 rutas | ~1-2h |
| **Total** | | **~8-13h** |

---

## Riesgos

- **Regresiones visuales en dark mode**: Al tocar CSS modules masivos, podemos romper el tema oscuro que hoy funciona. Se debe validar visualmente después de cada fase.
- **Tailwind arbitrary values**: Reemplazar `bg-[#0f0f0f]` por `bg-[var(--ca-bg)]` requiere que la variable esté definida en el scope CSS del componente.
- **Complejidad de ClubMatchWorkspace**: Es un archivo monolítico (~3.800 líneas). Los cambios deben ser quirúrgicos.
