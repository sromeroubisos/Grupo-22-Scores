# Rediseño del Gestor de Torneos — Informe y propuesta

**Proyecto:** Grupo-22-Scores · **Fecha:** 9 may 2026
**Alcance auditado:** lista de torneos, wizard de creación, pantalla de gestión por pestañas (resumen, detalles, formato, estructura, participantes, operación, relacionados, auditoría) y la app pública del torneo.
**Foco:** mobile-first real, curva de aprendizaje rápida, menos clics, refresh estético.

---

## 1. Mapa de pantallas auditadas

| Pantalla | Ruta | Archivo | Líneas |
|---|---|---|---|
| Lista de torneos (Super Admin) | `/admin/super/torneos` | `src/app/admin/super/torneos/page.tsx` | 889 |
| Crear/Editar torneo (Wizard 5 pasos) | `/admin/super/torneos/crear` | `src/app/admin/super/torneos/crear/page.tsx` | 1764 |
| Gestión de torneo (8 pestañas) | `/admin/entities/[id]/manage?type=tournament` | `src/components/admin/entities/tournament/*` | ~14 mil líneas |
| Pendientes de revisión | `/admin/super/torneos/pendientes` | `pendientes/page.tsx` | 308 |
| Ingesta automática | `/admin/super/torneos/ingesta` | `ingesta/page.tsx` | 591 |
| Torneos externos (API) | `/admin/super/torneos/externos/[id]` | `externos/[id]/page.tsx` | 1851 |
| Lista pública / `tournaments/[id]` | `/tournaments` y `/tournaments/[id]` | `src/app/tournaments/*` | — |

Las 8 pestañas internas son: **Resumen, Detalles, Formato, Estructura, Participantes, Operación, Relacionados, Auditoría** (`TOURNAMENT_TABS` en `TournamentTabs.tsx:24`).

---

## 2. Diagnóstico — qué está doliendo y por qué

### 2.1 Mobile sufre porque el diseño es desktop-first con parches

Encontré `src/components/admin/entities/tournament/tournament-mobile.css` con **4880 líneas** dedicadas casi exclusivamente a tapar agujeros de mobile (overflow horizontal, grids que colapsan mal, tipografías que se rompen). Esto es síntoma claro de que la base no está pensada para mobile, sino que se está reduciendo lo de desktop a la fuerza.

**Evidencias concretas:**

- `tournament-mobile.css:33-77` se dedica solo a anular `grid-cols-N` de Tailwind para que no exploten en mobile. Es una guerra contra el propio sistema de utilidades.
- En la lista (`super/torneos/page.tsx:486-547`) la **filter bar** tiene 5 filtros + 4 labels en una sola fila con `display: flex` y `gap: 12`. En mobile pasa a scroll horizontal o salta de línea de manera desordenada.
- El stepper del wizard (`crear/page.tsx:1036-1051`) usa pills horizontales de 5 elementos con texto + ícono. En 360px ya pierde labels.
- El `cardGrid` de torneos (líneas 639-…) tiene checkbox + logo 40×40 + título + 2 líneas de meta + botón estrella + botón ⋮ + menú flotante. En 360px no entra y se apila feo.
- La pestaña Resumen (`TournamentSummaryTab.tsx:29-187`) usa `basalt-card-span-8` / `span-4` — un grid de 12 columnas que en mobile se aplana a una columna larguísima sin priorización.

### 2.2 Curva de aprendizaje alta — el usuario nuevo no sabe por dónde empezar

- En la pantalla de gestión hay **8 pestañas** (`TournamentTabs.tsx:24-33`) sin onboarding ni "siguiente paso recomendado" obvio. El usuario aterriza en Resumen y ve 6 tarjetas sin contexto: "estructura", "salud de datos", "monitor", "ruta sugerida", etc.
- El **wizard de creación tiene 5 pasos** y el paso 1 ya pide: nombre, deporte (32 opciones en grid), audiencia pública, temporada, categoría, clasificación de edad, país, unión, logo. Es densidad cognitiva muy alta para el primer impacto.
- Hay terminología inconsistente: "Inaugurar Torneo", "Nuevo Torneo", "Crear", "Configuración General", "Jurisdicción y Alcance", "Identidad Visual", "Sección Pública" — palabras correctas pero sin un patrón claro. El usuario nuevo no sabe qué significa "Jurisdicción y Alcance" hasta abrirlo.
- El "Resumen operativo" muestra `data.slug || 'SIN-SLUG'` con `font-mono` en mayúsculas (`TournamentSummaryTab.tsx:46-47`). Para un usuario que no es dev, ver `SIN-SLUG` como título principal es desconcertante.
- No hay **tour guiado** ni **empty states productivos**. Cuando no hay torneos, dice "No se encontraron torneos con los filtros actuales" (`page.tsx:627`). Si es la primera vez del usuario, debería decir "Creá tu primer torneo" con CTA grande.

### 2.3 Demasiados clics — el flujo es largo y burocrático

- Crear un torneo simple ("Liga de 8 equipos, ida y vuelta") requiere navegar 5 pasos del wizard aunque el 80% de los campos no se cambian. No hay modo express ni plantillas.
- Activar/desactivar un torneo desde la lista requiere: clic en ⋮ → esperar dropdown → clic en "Activar". Dos clics + espera + lectura de menú para una acción binaria que debería ser un toggle directo.
- Para vincular un torneo a una unión: ⋮ → "Vincular Org/Unión" → modal → seleccionar → confirmar. 4 clics + cambio de contexto.
- Editar metadata pasa por 8 pestañas, no por edición inline rápida. Si solo quiero cambiar el nombre, hago: lista → clic torneo → tab Detalles → editar → guardar → volver. **5 navegaciones**.
- **Bulk actions están escondidas**: la barra de selección masiva (`page.tsx:549-615`) solo aparece si hay torneos filtrados, y el usuario tiene que descubrir los checkboxes. No hay shortcut visual.

### 2.4 Estilo visual — funciona pero está datado y es inconsistente

- El tema oscuro usa estética "tactical/console" con `font-mono`, kickers en mayúsculas, números grandes (`font-mono`, `text-[10px] uppercase tracking-wider`). Es atractivo pero **chocan con la lógica de cards limpias** del dashboard `Improved_Squad_Management_Dashboard.webp` (que es claro, blanco, bordes suaves). No hay un mismo lenguaje visual en todo el producto.
- Hay **3 sistemas CSS** conviviendo en la pestaña de torneos: `basalt.css` (6004 líneas), `tournament-mobile.css` (4880 líneas), `phase-wizard.css` (1184), `tournament-participants-flash.css`, `fixture-management.css`, `participants-premium.css`, `historical-season-import.css`, `tournament-structure.css`. Cada autor tiende a sumar otra layer en lugar de extender el design system.
- Tipografía: el wizard usa labels en mayúsculas con `font-feature-settings`, mientras que el resto de las pestañas usa títulos en sentence case. Inconsistencia.
- Colores hardcodeados: `'#34d399'`, `'#facc15'`, `'rgba(0, 163, 101, 0.65)'` aparecen en múltiples archivos en lugar de variables. `PLAN_CLUB_ADMIN_THEME.md` ya menciona esta deuda.
- Demasiados emojis decorativos mezclados con íconos lucide-react: 🏆, 🔗, 🌐, 🇦🇷, etc. El uso es inconsistente — a veces ícono, a veces emoji.

### 2.5 Información sobrecargada en la lista

La tarjeta de torneo en la lista muestra: checkbox + logo + nombre + badge API + season + sport + categoría + organización + estrella popular + menú ⋮ + estadística "X seguidores" + input "Prioridad". **11 elementos** en una sola card. En mobile se vuelve un muro.

### 2.6 Mobile-specific: problemas concretos

- El **sticky header** (`TournamentHeader`) en mobile + el bottom-sheet selector de tabs (`basalt-tabs-sheet`) suman ~180px verticales antes de ver contenido en una pantalla de 667px. Se pierde >25% del viewport en chrome.
- Modificar números (cantidad de equipos, etc.) usa botones `−` / `+` con input en medio (`structure-counter-shell` en `tournament-mobile.css:84-95`). En mobile, el input numérico activa teclado numérico y el layout se rompe.
- Drawers laterales en mobile **no son full-screen**: el `AddParticipantDrawer` y `UpsertParticipantDrawer` usan `drawer-premium.css` con animación lateral. En 360px se ven cortados; debería ser bottom-sheet full-height.

---

## 3. Principios de rediseño

Antes de las propuestas, estos son los principios que me guiaron:

**P1. Mobile-first real.** Empezar el diseño del componente desde 360px y crecer, no al revés. Eliminar la capa `tournament-mobile.css` y reemplazar por componentes que ya nacen responsive.

**P2. Camino feliz en 1 minuto.** Un usuario que crea su primer torneo debería poder hacerlo eligiendo una **plantilla** ("Liga clásica de 8 equipos", "Copa por eliminación", "Torneo de Grupos+Playoff") y completar solo nombre + temporada. El wizard de 5 pasos queda como modo avanzado.

**P3. Acciones visibles, no escondidas.** Toggle directo en lugar de menú ⋮ para acciones binarias frecuentes (activar/popular/visible). Bulk actions con barra fija al hacer scroll.

**P4. Densidad por contexto.** Lista en mobile = 1 card por fila con info esencial (nombre + estado + sport). Lista en desktop = grilla responsive con info enriquecida. **No la misma card escalada.**

**P5. Lenguaje consistente y humano.** "Crear torneo" en lugar de "Inaugurar torneo". "Estado" en lugar de "Lifecycle actual del torneo". Verbos directos.

**P6. Un solo design system.** Variables CSS unificadas (`--surface-1/2/3`, `--text-primary/secondary/dim`, `--accent`, `--success`, `--warning`, `--danger`), 1 escala tipográfica, 1 sistema de espaciado (4/8/12/16/24/32). Eliminar las 4 capas CSS conflictivas.

---

## 4. Propuestas — pantalla por pantalla

### 4.1 Lista de torneos (`/admin/super/torneos`)

**Problemas resueltos:** densidad, descubribilidad, mobile, demasiados clics.

**Cambios clave:**

1. **Header sticky** con: búsqueda prominente (con ⌘K), botón primario "Crear torneo", contador "X torneos · Y publicados".
2. **Filtros como chips** en lugar de selects: `[Todos los deportes ▾] [2026 ▾] [Argentina ▾] [Activos ▾]`. Tap-friendly. En mobile colapsan a un botón "Filtros" que abre bottom-sheet.
3. **Card simplificada** (mobile y desktop):
   - Logo (32px) + nombre + badge de estado a color.
   - Línea secundaria: deporte · temporada · país.
   - Acciones a la derecha: toggle de visibilidad (👁), estrella (popular), `⋯` solo para destructivas.
   - **Tap en la card = abrir detalle.** No tap-targets diminutos.
4. **Selección masiva**: long-press en mobile, click en checkbox flotante en desktop. La barra de bulk se convierte en una **bottom sheet flotante** que aparece sobre el contenido al haber selección.
5. **Vista compacta vs. tarjeta**: toggle en el header, persistido por usuario.
6. **Empty state productivo**: ilustración + "No tenés torneos aún. Empezá con una plantilla:" + 3 plantillas prearmadas.

### 4.2 Wizard de creación

**Problemas resueltos:** curva de aprendizaje, demasiados pasos, mobile.

**Cambios clave:**

1. **Pantalla 0: Plantilla.** Antes del wizard, una pantalla con 4 cards grandes:
   - 🏆 **Liga clásica** — Round-robin, todos contra todos
   - 🥊 **Eliminación directa** — Llaves
   - 🎯 **Grupos + Playoff** — Más popular para rugby/fútbol
   - ⚙️ **Personalizado** — Acceso al wizard completo

2. **Wizard reducido a 3 pasos visibles:**
   - **Paso 1 — Lo básico:** nombre, deporte, temporada (auto-2026), categoría. **El logo y la sección pública pasan a "Detalles" post-creación.**
   - **Paso 2 — Estructura:** la plantilla ya viene precargada; el usuario solo confirma cantidad de equipos.
   - **Paso 3 — Participantes:** opcional; permite "Saltar y completar después".

   Reglas avanzadas (puntos, bonus rugby, fase base, jurisdicción) quedan en una pestaña "Más opciones" que se expande in-line en cada paso.

3. **Stepper mobile-friendly:** en mobile, header pequeño con `Paso 2 de 3 · Estructura` + barra de progreso lineal. En desktop, el stepper actual.

4. **Botones de navegación fijos abajo** en mobile (`safe-area-inset-bottom`), siempre visibles. "Atrás" secundario, "Siguiente" primario, ambos con el mismo alto que la touch zone (44pt).

5. **Validación inline en vivo**, no al hacer "Siguiente". Si el nombre tiene <3 caracteres, el botón se desactiva con mensaje arriba "Ingresá un nombre para continuar".

6. **Hero del wizard se elimina en mobile** (los pills "Status: READY · Season: 2026 · Sport: RUGBY · Fase base: LIGA" ocupan demasiado en pantalla chica). En desktop sí se mantiene como confirmación visual.

### 4.3 Pantalla de gestión (8 pestañas → 5 + secundarias)

**Reagrupación propuesta:**

| Antes (8) | Después (5 principales + 3 secundarias) |
|---|---|
| Resumen | **Resumen** (con quick actions) |
| Detalles | **Detalles** (fusiona Detalles + Formato porque conceptualmente son lo mismo: identidad y reglas del torneo) |
| Formato | (fusionada con Detalles) |
| Estructura | **Estructura** (fases) |
| Participantes | **Participantes** |
| Operación | **Operación** (fixture + tabla + resultados) |
| Relacionados | menú "Más" → Relacionados |
| Auditoría | menú "Más" → Auditoría |

**Cambios visuales:**

1. **En mobile:** las 5 pestañas principales como **bottom-tab-bar fija** (estilo nativo de iOS/Android). Las secundarias en un drawer "Más".
2. **En desktop:** sidebar izquierdo persistente con las 5 secciones + collapse al ícono. La barra `basalt-tabs-desktop-head` actual ocupa demasiado espacio horizontal.
3. **Pestaña Resumen rediseñada** — hoy tiene 6 tarjetas dispersas; propuesta:
   - **Card 1: Estado actual** (1 línea grande con `Activo · Visible · 12 equipos`).
   - **Card 2: Acciones rápidas** (botones grandes: "Cargar resultados", "Editar fixture", "Publicar nueva fecha").
   - **Card 3: Salud del torneo** (lista compacta de issues con CTA al tab que los resuelve).
   - **Card 4: Próximo evento** (banner con la próxima fecha programada).
4. **El "completion %"** del torneo aparece en el header de la pantalla, no como número aislado.

### 4.4 Pestaña Participantes

- En mobile: **lista de tarjetas verticales** con logo + nombre + badge tipo + estado, swipe-to-action (→ editar, ← archivar).
- En desktop: tabla densa actual mejorada con columnas configurables (ya existe `TableColumnSelector.tsx` — usarlo).
- **Bulk import** como CTA prominente en empty state. Hoy está enterrado.
- El drawer de agregar participante en mobile = **bottom-sheet full-height** con `dismiss-by-drag` (no laterales con animación que pierde contexto).

### 4.5 Pestaña Operación / Fixture

- Reemplazar el fixture en grilla densa por una vista de **timeline vertical de fechas** en mobile (por jornada). Cada fecha colapsable.
- En desktop, sí grilla.
- Botón flotante (FAB) "Cargar resultado" siempre accesible.

---

## 5. Microcopy — propuestas concretas

| Antes | Después |
|---|---|
| Inaugurar Torneo | Crear torneo |
| Configuración General | Información básica |
| Jurisdicción y Alcance | Dónde se juega y quién lo organiza |
| Identidad Visual | Logo y colores |
| Lifecycle actual del torneo | Estado |
| Salida pública y catálogo | ¿Es público? |
| ESTRUCTURA DE FASES — Configura cómo se organizan los partidos | Fases — cómo se juega |
| SISTEMA DE PUNTUACIÓN — Define los puntos por victoria, empate o derrota | Puntos por partido |
| RESUMEN Y CONFIRMACIÓN — Revisa la información antes de finalizar | Revisá antes de publicar |
| No se encontraron torneos con los filtros actuales | Sin resultados con esos filtros. [Limpiar filtros] |
| SIN-SLUG | Sin identificador asignado |

---

## 6. Sistema visual unificado (extracto)

```css
:root {
    /* superficies */
    --surface-0: #0a0d12;       /* fondo app */
    --surface-1: #11151c;       /* tarjetas */
    --surface-2: #181d26;       /* tarjetas hover */
    --surface-3: #232934;       /* dividers / inputs */

    /* texto */
    --text-primary: #f4f6fa;
    --text-secondary: #b6bdcc;
    --text-dim: #6b7280;

    /* acento (verde institucional) */
    --accent: #00a365;
    --accent-soft: rgba(0, 163, 101, 0.12);

    /* semánticos */
    --success: #34d399;
    --warning: #facc15;
    --danger: #f87171;

    /* tipografía */
    --font-sans: 'Inter', system-ui;
    --font-mono: 'JetBrains Mono', monospace;

    /* tipografía: 1 sola escala */
    --t-xs: 11px;   /* meta/captions */
    --t-sm: 13px;   /* body secundario */
    --t-base: 15px; /* body principal */
    --t-lg: 18px;   /* títulos secundarios */
    --t-xl: 22px;   /* títulos primarios */
    --t-2xl: 28px;  /* hero */

    /* espaciado: múltiplos de 4 */
    --sp-1: 4px; --sp-2: 8px; --sp-3: 12px;
    --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;

    /* radios */
    --r-sm: 6px; --r-md: 10px; --r-lg: 14px; --r-xl: 22px;

    /* breakpoints (referencia, no son CSS vars en sí) */
    /* mobile: 0–639  ·  tablet: 640–1023  ·  desktop: ≥1024 */
}

/* targets táctiles */
button, [role="button"] {
    min-height: 44px;
    min-width: 44px;
}
```

---

## 7. Plan de implementación priorizado

### Sprint 1 — Quick wins (1 semana)

- [ ] Renombrar microcopy según sección 5 (búsqueda y reemplazo en `crear/page.tsx`, `TournamentSummaryTab.tsx`, `TournamentTabs.tsx`).
- [ ] Reemplazar el dropdown ⋮ por toggle directo para activar/popular/visible en la lista (`page.tsx:687-737`).
- [ ] Agregar empty state productivo con CTA "Crear primer torneo" cuando `tournaments.length === 0`.
- [ ] En mobile, hacer que los drawers de participantes sean bottom-sheet full-height (modificar `drawer-premium.css`).
- [ ] Fijar la barra de navegación del wizard al fondo en mobile con `position: sticky; bottom: 0; safe-area-inset-bottom`.

### Sprint 2 — Mobile-first (2 semanas)

- [ ] Reescribir `TournamentTabs.tsx` para que en mobile sea **bottom-tab-bar nativa** con 5 íconos.
- [ ] Reducir el wizard de 5 a 3 pasos visibles agrupando Reglas + Publicar como detalles inline expandibles.
- [ ] Crear el componente `TemplatePicker` (pantalla 0 del wizard).
- [ ] Reemplazar la card de la lista por el componente nuevo (mockup adjunto).
- [ ] Eliminar las 4880 líneas de `tournament-mobile.css` y reescribir el sistema de grilla para que sea mobile-first nativo.

### Sprint 3 — Refresh visual (2 semanas)

- [ ] Aplicar el sistema de variables de la sección 6 a todos los archivos `.css` de `tournament/`.
- [ ] Unificar tipografía (sentence case en todo, salvo IDs).
- [ ] Eliminar emojis decorativos en favor de íconos lucide-react.
- [ ] Rediseño de la pestaña Resumen con las 4 cards propuestas en 4.3.

### Sprint 4 — Onboarding (1 semana)

- [ ] Tour guiado de 4 pasos al primer login del super admin.
- [ ] Tooltips contextuales en términos jerga (slug, fase base, audience, ruleset).
- [ ] Plantillas precargadas con "ejemplo de torneo" listo para clonar.

---

## 8. Mockups

Ver archivo adjunto: **`gestor_torneos_mockups.html`** (abrir en navegador para verlos navegables).

Contiene:

1. **Lista de torneos** — desktop y mobile.
2. **Wizard simplificado paso 1** — desktop y mobile.
3. **Pantalla de gestión** — pestaña Resumen rediseñada.
4. **Bottom-tab-bar mobile** del gestor.
5. **Empty state** con plantillas.

---

## 9. Métricas para validar

Para medir si las mejoras funcionan, sugiero trackear:

- **Time-to-first-tournament**: tiempo desde "Crear cuenta" hasta `tournaments.length === 1`. Objetivo: < 90 segundos.
- **Tasks-per-session en mobile**: % de sesiones donde se completa al menos 1 acción CRUD desde mobile. Objetivo: > 40% (probablemente hoy es < 15%).
- **Drop-off del wizard por paso**: % que abandona en paso 1 vs paso 5. Objetivo: < 20% en cada paso.
- **Clicks por acción frecuente**: activar torneo. Objetivo: 1 click. Hoy: 2.
- **Soporte tickets sobre "cómo crear/configurar torneo"**: objetivo a 3 meses: -50%.
