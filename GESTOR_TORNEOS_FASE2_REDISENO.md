# Gestor de Torneos — Fase 2: Propuesta de rediseño

**Proyecto:** Grupo-22-Scores · **Fecha:** 2026-07-23
**Alcance:** refactor quirúrgico (aprobado). No tocar MercadoPago/pagos. Sin dependencias nuevas.
**Documento hermano:** `GESTOR_TORNEOS_FASE2_CSS.md` (saneamiento de CSS, separado a pedido).

---

## 2.1 Nueva estructura de información

**Recomendación:** 5 tabs primarios + menú "Más" (2) + Publicación absorbida en el header. Medios eliminado.

| Tab | Rol | Cambio vs hoy |
|---|---|---|
| **Resumen** | Landing con estado real + acciones rápidas | Reconstruir (hoy es fachada) |
| **Configuración** | Identidad + reglas del torneo | Fusión Detalles + Formato |
| **Fases** | Estructura competitiva | Rename Estructura; sin cambios de lógica |
| **Equipos** | Participantes | Rename; quitar drawer Historial muerto |
| **Operación** | Fixture · Tabla · Estadísticas · Sync | Fixture solo si subtab activo; limpiar legacy |
| *Más → Relacionados* | Torneos vinculados | Baja frecuencia → secundario |
| *Más → Auditoría* | Bitácora | Baja frecuencia → secundario |
| ~~Publicación~~ | Status + visibilidad | Absorber en el control de estado del header |
| ~~Medios~~ | — | Eliminar (stub huérfano) |

### Patrón de navegación por breakpoint
**Recomendación:** híbrido — **bottom-tab-bar nativa en móvil**, **rail horizontal compacto en desktop**, "Más" como sheet/menú en ambos.
Por qué: los 5 primarios entran en una thumb-zone de 5 slots; el rail actual (`basalt-tabs-desktop-head`) come demasiado alto vertical. Se conserva el patrón bottom-bar que ya funciona (auditoría mobile lo validó), se le quita el doble render.

| Breakpoint | Navegación |
|---|---|
| ~375px móvil | Bottom-tab-bar fija (5 íconos: Resumen · Config · Fases · Equipos · Operar) + "Más" en el 5º slot abre sheet con Relacionados/Auditoría |
| ~768px tablet | Rail horizontal scrollable + "Más" como dropdown |
| ~1440px desktop | Rail horizontal completo (label + ícono) + "Más" dropdown; header con control de estado (Publicación) |

### Patrón de dato por tipo (con estrategia móvil explícita)

| Vista | Dato | Patrón desktop | Estrategia móvil (elegida) |
|---|---|---|---|
| Resumen | KPIs + salud | Cards en grid | Cards apiladas 1-col, priorizadas (estado → acciones → salud → próximo) |
| Configuración | Formulario | 2-col (form + preview logo) | 1-col, preview colapsable arriba |
| Fases | Lista de fases + wizard | Lista + card inline | Lista + bottom-sheet de config (ya existe) |
| **Equipos** | **Tabla densa participantes** | Tabla con columnas configurables | **Cards apiladas** (nombre+escudo+badge+estado), acción por tap; NO tabla escalada |
| **Operación/Tabla** | **Standings** | Tabla completa | **Columnas priorizadas + expand** (Pos, Equipo, Pts visibles; resto en expand) |
| **Operación/Fixture** | **Matriz de partidos** | Grilla por jornada | **Timeline vertical por fecha**, cada fecha colapsable; FAB "Cargar resultado" |

Justificación de las 3 tablas densas: participantes son entidades independientes → **cards** (mejor tap-target, sin scroll horizontal). Standings es comparativo → **priorizar columnas** (perder columnas no rompe la lectura de posición). Fixture es relacional por fecha → **timeline** (el eje natural es la jornada, no la grilla).

---

## 2.2 Wireframes (ASCII) — 375 / 768 / 1440

### Shell + navegación

```
── 375px (móvil) ─────────────      ── 768px (tablet) ───────────────────
┌───────────────────────────┐      ┌────────────────────────────────────┐
│ ‹ Torneo · 2026    ● Activo│      │ ‹ Super Rugby Americas · 2026  ●Act │
│   [Guardar]            ⋯   │      │  [Recalcular][Guardar]          ⋯   │
├───────────────────────────┤      ├────────────────────────────────────┤
│                           │      │ [Resumen][Config][Fases][Equipos]…› │
│      {contenido tab}      │      ├────────────────────────────────────┤
│                           │      │        {contenido tab}             │
│                           │      │                                    │
├───────────────────────────┤      └────────────────────────────────────┘
│ ▣    ⚙    ◱    ⛁    ⋯     │
│Resu Conf Fase Equi Más    │      ── 1440px (desktop) ────────────────────────────
└───────────────────────────┘      ┌──────────────────────────────────────────────┐
  bottom-tab-bar fija               │ ‹ Super Rugby Americas · 2026  ●Activo ●Público│
                                    │   Gestión del torneo   [Recalcular][Guardar] ⋯│
                                    ├──────────────────────────────────────────────┤
                                    │ [▣ Resumen][⚙ Config][◱ Fases][⛁ Equipos]…  ›│
                                    ├──────────────────────────────────────────────┤
                                    │  {contenido tab, max-width contenedor}       │
                                    └──────────────────────────────────────────────┘
```

### Resumen (reconstruido, datos reales)

```
── 375px ───────────────────       ── 1440px ───────────────────────────────────
┌──────────────────────────┐       ┌───────────────┬───────────────┬────────────┐
│ ESTADO                    │       │ ESTADO        │ ACCIONES      │ SALUD      │
│ ● Activo · Público        │       │ ● Activo      │ [Cargar res.] │ ✓ 12 equip │
│ 12 equipos · 3 fases      │       │ Público·12 eq │ [Editar fix.] │ ⚠ 2 sin log│
├──────────────────────────┤       │ ▓▓▓▓▓░░ 71%   │ [Publicar]    │ ✓ Tabla ok │
│ ACCIONES RÁPIDAS          │       ├───────────────┴───────────────┴────────────┤
│ [Cargar resultado]        │       │ PRÓXIMO EVENTO                             │
│ [Editar fixture]          │       │ Sáb 26/07 15:00 · Jaguares vs Dogos        │
│ [Publicar fecha]          │       └────────────────────────────────────────────┘
├──────────────────────────┤        (grid 3-col → 1-col apilado en móvil;
│ SALUD DEL TORNEO          │         cada card enlaza al tab que resuelve el issue)
│ ⚠ 2 equipos sin logo  →  │
│ ✓ Tabla recalculada       │        NOTA: todos los datos vienen de fetch real
├──────────────────────────┤        (matchCount con count:'exact', próximo
│ PRÓXIMO: Sáb 26/07 15:00 │        partido con GET /matches?upcoming). Cero
│ Jaguares vs Dogos         │        placeholders hardcodeados.
└──────────────────────────┘
```

### Equipos / Participantes (cards en móvil, tabla en desktop)

```
── 375px (cards, NO tabla) ─────      ── 1440px (tabla con columnas config) ──────────
┌──────────────────────────┐         ┌─────────────────────────────────────────────┐
│ Equipos (12)   [+ Agregar]│         │ Equipos (12)  [Buscar][Filtro][+ Agregar][⋮] │
│ [Buscar…]        [Filtros]│         ├───┬────────────────┬───────┬────────┬────────┤
├──────────────────────────┤         │ ☐ │ Equipo         │ Grupo │ Fase   │ Estado │
│ ┌──────────────────────┐ │         ├───┼────────────────┼───────┼────────┼────────┤
│ │ [◈] Jaguares      ⋮ │ │         │ ☐ │ [◈] Jaguares   │  A    │ Regular│ ● Activo│
│ │     Grupo A · Activo │ │         │ ☐ │ [◈] Dogos XV   │  A    │ Regular│ ● Activo│
│ └──────────────────────┘ │         │ …                                            │
│ ┌──────────────────────┐ │         └─────────────────────────────────────────────┘
│ │ [◈] Dogos XV      ⋮ │ │          scroll container propio (overflow-x contenido)
│ │     Grupo A · Activo │ │          columnas via TableColumnSelector existente
│ └──────────────────────┘ │
│  … (load-more, no “todos”)│         Empty state: ilustración + [Importar equipos]
└──────────────────────────┘          prominente (hoy enterrado)
```

### Operación / Fixture (timeline móvil, grilla desktop)

```
── 375px (timeline por fecha) ──      ── 1440px (grilla por jornada) ─────────────────
┌──────────────────────────┐         ┌─────────────────────────────────────────────┐
│ [Fixture][Tabla][Stats][∿]│        │ [Fixture][Tabla][Estadísticas][Sync]         │
├──────────────────────────┤         ├─────────────────────────────────────────────┤
│ ▸ Fecha 1 · 26/07        │         │ Fecha 1 · 26/07        Fecha 2 · 02/08       │
│   Jaguares 24–17 Dogos    │        │ ┌─────────────────┐   ┌─────────────────┐    │
│   Pampas  — Olimpia       │        │ │Jaguares 24–17 D.│   │Pampas 12–12 Oli.│    │
│ ▾ Fecha 2 · 02/08        │         │ │[editar]         │   │[editar]         │    │
│   (colapsada)             │         │ └─────────────────┘   └─────────────────┘    │
├──────────────────────────┤         └─────────────────────────────────────────────┘
│           (  + FAB  )     │          FAB "Cargar resultado" fijo abajo-derecha
└──────────────────────────┘          en ambos; editor = bottom-sheet en móvil
```

### Configuración (fusión Detalles+Formato) y Fases: formularios
- **Configuración** móvil: 1-col, preview de logo colapsable arriba, secciones acordeón (Identidad · Ubicación · Reglas/Puntos). Desktop: 2-col (form + preview sticky).
- **Fases** móvil: lista de fases + bottom-sheet de configuración (patrón ya existente, sano). Desktop: lista + wizard inline.

---

## 2.3 Sistema de diseño (design tokens)

Un único set canónico (reemplaza los 164 custom props fragmentados). Base: verde institucional `#00a365` ya en uso.

```
/* SUPERFICIES (dark, base actual) */
--surface-0:#0a0d12  --surface-1:#11151c  --surface-2:#181d26  --surface-3:#232934
/* TEXTO */
--text-primary:#f4f6fa  --text-secondary:#b6bdcc  --text-dim:#6b7280
/* BORDES / muted */
--border:#232934  --border-strong:#333b47  --muted:rgba(255,255,255,.06)
/* ACENTO + SEMÁNTICOS */
--accent:#00a365  --accent-soft:rgba(0,163,101,.12)
--success:#34d399  --warning:#facc15  --danger:#f87171  --info:#38bdf8
/* TIPOGRAFÍA (1 escala) */
--t-xs:11px  --t-sm:13px  --t-base:15px  --t-lg:18px  --t-xl:22px  --t-2xl:28px
/* ESPACIADO (múltiplos de 4) */
--sp-1:4  --sp-2:8  --sp-3:12  --sp-4:16  --sp-5:24  --sp-6:32  --sp-7:48
/* RADIOS */  --r-sm:6  --r-md:10  --r-lg:14  --r-xl:22
/* SOMBRAS */ --sh-1:0 1px 2px rgba(0,0,0,.3)  --sh-2:0 4px 16px rgba(0,0,0,.4)
/* Z-INDEX (escala, reemplaza 42 mágicos) */
--z-base:0  --z-sticky:100  --z-header:200  --z-dropdown:300
--z-overlay:400  --z-drawer:500  --z-modal:600  --z-toast:700
/* BREAKPOINTS canónicos (matan los 26 actuales) */
sm:640  md:768  lg:1024  xl:1280   (mobile-first, min-width)
```

### Estados obligatorios por vista
| Estado | Regla |
|---|---|
| **Loading** | Skeleton por bloque (no spinner de página completa) |
| **Empty** | Ilustración + copy humano + CTA (ej. "Sin equipos aún · [Importar]") |
| **Error** | Card de error con retry, mensaje propio (no SQL crudo) |
| **Success** | Feedback inline (toast 2-3s / check verde), sin recargar toda la vista |

### Responsive (reglas duras)
- Mobile-first, `min-width`. Breakpoints: **640 / 768 / 1024 / 1280**. Nada de anchos fijos px en layout — usar `%`, `fr`, `clamp()`, `minmax(0,…)`.
- Tablas densas: contenedor `overflow-x:auto` propio; el body de la página nunca scrollea horizontal.
- Modales/drawers: `max-height` + scroll interno; en móvil, bottom-sheet full-height.

### Accesibilidad mínima (AA)
- Contraste AA en texto/estados. Foco visible en todos los interactivos.
- Navegación por teclado en tabs (`role="tablist"` + flechas) y en modales (trap + Escape — `useDialog` ya lo hace).
- `aria` en tabs/modales; labels en todos los inputs. `prefers-reduced-motion` respetado globalmente.

---

## 2.4 Plan de performance

### Qué se vuelve Server Component
- `TournamentRightSidebar` (hoy CC por arrastre; es markup + `<Link>`) → SC.
- Cabeceras/paneles estáticos de tabs sin interacción → SC donde se pueda; mantener CC solo el editor interactivo.

### Estrategia de carga
| Dato | Estrategia |
|---|---|
| Datos del torneo (identidad, ruleset) | Server render (ya llega por props) |
| Tab activo | Server render condicional (ya existe) |
| Tabs no abiertos | **Lazy** — sin fetch hasta abrir (Operación ya usa `dynamic()`; extender) |
| Prefetch | **Honrar el kill-switch** (fix P0-1); reactivar prefetch throttled solo tras cachear el barrido |
| Fixture en Operación | Fetch **solo si `subtab=fixture`** (hoy es eager siempre) |

### Caché y TTL (con SWR, ya instalado)
| Tipo de dato | Caché |
|---|---|
| Barrido de temporadas | Persistir por torneo (memoryCache + durable, patrón `resolvedTournamentIds.ts`) |
| Fases / participantes (semi-estático) | SWR con `dedupingInterval` ~30s |
| Standings / resultados (vivo) | SWR revalidate on focus, TTL corto |
| Catálogo de clubes | Server-side typeahead (no traer 2000 filas) |

### Paginación / virtualización
- Participantes: `.limit()` por defecto + load-more; virtualizar si >100.
- Standings/fixture: proyección de columnas + límites explícitos.

### Guards de validación (antes de tocar la DB)
- `isUuid(id/phaseId/matchId/seasonId)` en el borde de: `groups` GET, `fixture` GET, `phases/[phaseId]` PATCH/DELETE, y cualquier route del gestor que hoy no valide. → 400/404 antes de 22P02.

### Sin dependencias nuevas
Todo el plan usa lo ya instalado: **SWR** (dedup/caché), **clsx + tailwind-merge** (clases), **Tailwind 4** (layout), **CSS Modules** (scope). No se agrega nada.
