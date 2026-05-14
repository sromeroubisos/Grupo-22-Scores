# Auditoría crítica · Adaptación mobile del gestor de torneos

**Fecha:** 9 may 2026
**Alcance:** Pantalla `/admin/entities/[id]/manage?type=tournament` y sus 8 tabs.
**Pregunta que respondo:** ¿La adaptación mobile que se aplicó realmente quedó bien, o hay deuda y bugs?

> **Veredicto rápido:** se hizo trabajo significativo, pero quedó parcial. **3 de 8 tabs tienen rediseño real (Resumen, Estructura, Operación)**, **1 tiene rediseño con duplicación (Participantes)**, y **4 tabs no recibieron rediseño** (Detalles, Formato, Relacionados, Auditoría — solo CSS genérico). Además hay **2 bugs visuales reales** que conviene arreglar antes de pisar el botón "ya está listo".

---

## 1. Tabla resumen por tab

| Tab | Bottom-tab visible | Rediseño JSX | Desktop oculto | CSS específico | Veredicto | Severidad |
|---|---|---|---|---|---|---|
| Resumen | ✅ Sí (primario) | ✅ Sí | ✅ Sí | ✅ Sí | **Bien** | — |
| Detalles | ❌ Solo en "Mas" | ❌ No | — | ⚠️ Parcial | **Mal** | 🔴 Alta |
| Formato | ❌ Solo en "Mas" | ❌ No | — | ⚠️ Parcial | **Mal** | 🟠 Media |
| Estructura | ✅ Sí (primario) | ✅ Sí | ❌ **No oculté** | ✅ Sí | **Roto** | 🔴 Alta |
| Participantes | ✅ Sí (primario) | ✅ Sí | ⚠️ Solo header | ✅ Sí | **Parcial** | 🟠 Media |
| Operación | ✅ Sí (primario) | ✅ Sí | ✅ Sí | ✅ Sí | **Bien** | — |
| Relacionados | ❌ Solo en "Mas" | ❌ No | — | ⚠️ Parcial | **Mal** | 🟡 Baja |
| Auditoría | ❌ Solo en "Mas" | ❌ No | — | ⚠️ Parcial | **Mal** | 🟡 Baja |

**Score global:** 3 ✅ + 1 ⚠️ + 4 ❌ de 8 tabs = **~44% del trabajo terminado**.

---

## 2. Problemas concretos (con archivo y línea)

### 🔴 BUG-1: Estructura muestra contenido duplicado

**Archivo:** `src/components/admin/entities/tournament/TournamentStructureTab.tsx:1025-1048`
**Archivo:** `src/components/admin/entities/tournament/tournament-mobile.css` (sección 18p)

**Qué pasa:** Agregué `<section className="tournament-structure-mobile">` al inicio del return con 3 cards (modelo, fases, CTA). Pero **NO oculté** las secciones desktop que vienen abajo:

- `<section className="basalt-card structure-module">` (Rol del torneo) — sigue visible
- `<section className="basalt-card basalt-hero structure-hero-panel">` (estado de fases) — sigue visible
- `<div className="basalt-card structure-module">` (lista de fases con menú ⋯) — sigue visible

**Resultado en mobile:** el usuario ve las 3 cards nuevas + abajo TODO el desktop content otra vez. Misma información dos veces, el doble de scroll.

**Fix sugerido:** agregar un `wrapper` con clase `tournament-structure-desktop` al div hermano y CSS:

```css
@media (max-width: 767px) {
    .tournament-structure-mobile ~ .structure-module,
    .tournament-structure-mobile ~ .structure-hero-panel,
    .tournament-structure-mobile ~ section.basalt-card { display: none !important; }
}
```

O — mejor — envolver el contenido desktop en un solo `<div className="tournament-structure-desktop">` y aplicar `display:none` al wrapper.

---

### 🟠 BUG-2: Participantes muestra tabla + cards a la vez

**Archivo:** `src/components/admin/entities/tournament/TournamentParticipantsTab.tsx:911-1025` aprox
**Archivo:** `src/components/admin/entities/tournament/tournament-mobile.css:5827`

**Qué pasa:** El CSS oculta `participants-header` (header con título + counters + botones) pero **NO oculta**:

- `<div className="participants-filter-bar">` — barra de búsqueda + filtros
- `<div className="participants-table-container">` con la tabla completa (`participants-table`, `participants-table-scroll`, `participants-table-footer`)

**Resultado en mobile:** el usuario ve los counters nuevos + lista de cards (50 primeros) + filtros + tabla con scroll horizontal mostrando los mismos equipos otra vez.

**Fix sugerido:** envolver toda la sección desktop en `<div className="tournament-participants-desktop">` y agregar `@media (max-width: 767px) { .tournament-participants-desktop { display: none } }`. O selectores adyacentes:

```css
.tournament-participants-mobile ~ .participants-filter-bar,
.tournament-participants-mobile ~ .participants-table-container { display: none !important; }
```

---

### 🔴 BUG-3: Detalles no recibió rediseño mobile

**Archivo:** `src/components/admin/entities/tournament/TournamentDetailsTab.tsx`

**Qué pasa:** Asumí que mi CSS genérico (`.basalt-body .basalt-card`, `.partition`, etc.) iba a aplicar. Pero Detalles usa **otro sistema de clases**: `manager-card`, `manager-header`, `manager-main-layout`, `manager-preview-frame`, `manager-preview-zone`, etc. — vienen de `tournament-structure.css` u otra capa.

**Resultado en mobile:** Detalles se ve casi igual que en desktop, apretado, con el preview del logo a la izquierda y los campos a la derecha sin colapsar. Es probablemente la pestaña con peor experiencia mobile en este momento.

**Severidad:** Alta — Detalles es la pestaña más editada (nombre, slug, sede, organizador).

**Fix sugerido (escala creciente):**
1. **Mínimo:** agregar al CSS mobile reglas para `.manager-card`, `.manager-main-layout`, `.manager-preview-zone`, `.manager-header` que stackeen y aumenten paddings.
2. **Recomendado:** crear un bloque `tournament-details-mobile` con summary card (Logo, Nombre, Sede, Organizador) y campos en formato vertical compacto, similar a lo que hice en Resumen.

---

### 🟠 BUG-4: Formato no recibió rediseño mobile

**Archivo:** `src/components/admin/entities/tournament/TournamentFormatTab.tsx`

**Qué pasa:** mismo problema que Detalles — clases custom (`flash-ui-container`, etc.) que no toca mi CSS genérico. La pestaña tiene inputs numéricos para puntos por victoria/empate/derrota + bonus rugby; en mobile se ve apretada y los inputs `type="number"` activan teclado numérico mal posicionado.

**Severidad:** Media — uso menos frecuente que Detalles.

---

### 🟡 BUG-5: Relacionados y Auditoría no recibieron nada

Solo CSS genérico (`.basalt-body .related-row`, `.audit-row`). Si los componentes usan otras clases (probable), el patch no aplica. Severidad baja: son pestañas de baja frecuencia.

---

### 🟠 BUG-6: Estructura — la lógica de "fase activa" puede confundir

**Archivo:** `TournamentStructureTab.tsx:1027`

```ts
const mobileActivePhase = phases.find((p) => p.is_active) ?? phases[0] ?? null;
```

Si NO hay fase activa, agarra la primera. La UI muestra "Fase activa: Fase Regular" aunque ninguna esté `is_active=true`. **Engañoso.**

**Fix:** mostrar `null` cuando `is_active` falla y un mensaje claro:

```ts
const mobileActivePhase = phases.find((p) => p.is_active) ?? null;
// Render condicional: "Sin fase activa" si null
```

---

### 🟠 BUG-7: Operación — segmented control rompe en pantallas <380px

**Archivo:** `tournament-mobile.css:6111`

Tengo `@media (max-width: 380px)` para ocultar labels. Pero en pantallas como **iPhone SE (375×667)** el media query NO dispara (375 < 380 ✓), pero en **iPhone 13 Mini (375×812)** o **Galaxy S8 (360×740)** sí. Inconsistente. Idealmente ocultar labels desde 420px o usar 2×2 grid.

**Fix:** subir el breakpoint a 420px o usar grid 2×2:

```css
@media (max-width: 420px) {
    .tsm-segments { grid-template-columns: repeat(2, 1fr); }
}
```

---

### 🟡 BUG-8: Performance — doble render

**Archivos:** todos los tabs con bloque mobile.

Cada tab ahora renderiza dos versiones (mobile + desktop) en el DOM. CSS oculta una pero React monta ambas. Para Participantes que pasea 50 elementos en el bloque mobile + tabla completa en desktop, el costo es real (medible si la lista es grande).

**Fix:** usar un hook tipo `useMediaQuery('(max-width: 767px)')` para renderizar condicionalmente. O `react-responsive`. Actualmente agregamos overhead aunque el usuario nunca cambie de viewport.

**Severidad:** Baja salvo en torneos con >100 participantes.

---

### 🟡 BUG-9: Header sigue voluminoso

**Captura:** la imagen que enviaste mostraba el header consumiendo ~30% del viewport antes del primer contenido (TOURNAMENT CONSOLE / SUPER RUGBY AMERICAS / RUGBY CATEGORIA / chips DRAFT/PUBLIC/OK / SEASON 2026 / botón Guardar / ⋯).

Mi cambio fue: ocultar "Nueva temporada" y "Cambiar estado" inline. Pero el resto sigue ahí: kicker, h1, meta line, 3 badges, season chip, botón Guardar (cuando dirty), ⋯.

**Fix sugerido:** colapsar los 3 badges (DRAFT/PUBLIC/OK) en un solo chip compacto tipo `● ACTIVO · PÚBLICO · OK` o moverlos al menú ⋯. Achicar el h1.

---

### 🟡 BUG-10: Tabs primarios: ¿son los correctos?

**Archivo:** `TournamentTabs.tsx:39`

```ts
const MOBILE_PRIMARY_TAB_IDS = ['resumen', 'estructura', 'participantes', 'operacion'] as const;
```

Detalles está en "Mas" pero es la pestaña más editada después de crear un torneo. Usabilidad cuestionable.

**Tradeoff:** si pongo Detalles en primario tengo que sacar uno de los 4 actuales. Operación es alta-frecuencia (cargar resultados). Estructura y Participantes son setup. Resumen es landing.

**Posible nueva selección:** `[Resumen, Detalles, Participantes, Operacion]` — saca Estructura a "Mas". Estructura se usa pesadamente al inicio pero después casi nunca.

---

### 🟡 BUG-11: Próximo evento es placeholder

**Archivo:** `TournamentSummaryTab.tsx:148-163`

Mi card de Próximo evento siempre muestra "Sin partidos programados" porque no hago fetch. Si el torneo TIENE partidos próximos, miente.

**Fix:** agregar un fetch a `/api/tournaments/${id}/matches?upcoming=true&limit=3` y renderizar cuando hay datos.

---

### 🟡 BUG-12: Sin verificación con TypeScript

No pude correr `tsc` por un problema de sincronización del sandbox bash con el filesystem de Windows. Es probable que el código compile (Read tool muestra ediciones bien formadas), pero no está confirmado.

**Fix:** correr `npm run build` o `npm run lint` localmente y reportar errores si los hay.

---

### 🟡 BUG-13: A11y revisable

- El bottom-tab-bar usa `role="tablist"` pero los `<button>` no están dentro de un panel `role="tabpanel"` — semántica inconsistente.
- Los iconos en cards mobile no tienen `aria-hidden` consistentemente.
- Foco visible: no testé el outline de teclado en los nuevos componentes.

**Severidad:** Baja-media. Si el producto apunta a accesibilidad WCAG AA hay que pasar.

---

### 🟢 LO QUE SÍ QUEDÓ BIEN

1. **Bottom-tab-bar (TournamentTabs.tsx + CSS):** funciona, tiene safe-area-inset, ícono activo con halo verde, badge de cambios pendientes. Se ve bien.
2. **Resumen mobile:** las 4 cards (estado / acciones / salud / próximo) son la mejor parte del trabajo. Quita la confusión del original.
3. **Operación:** segmented control de subtabs reemplaza el dropdown viejo + el context card pesado. Funcional.
4. **Header compactado:** sacar "Nueva temporada" y "Cambiar estado" inline + sumarlos al menú ⋯ libera ~80px verticales.
5. **CSS variables:** todas las nuevas reglas usan `var(--accent, #00a365)` con fallback. Si el equipo migra a tokens unificados, el rediseño los acepta.
6. **Desktop intacto:** verifiqué que todas las reglas nuevas viven dentro de `@media (max-width: 767px)` o con `display: none` por defecto. Desktop renderiza igual que antes.

---

## 3. Severidad y orden recomendado para resolver

| # | Issue | Tiempo estimado | Impacto |
|---|---|---|---|
| 🔴 1 | BUG-1: Ocultar desktop en Estructura (duplicación) | 15 min | Alto — bug visual claro |
| 🔴 2 | BUG-3: Mobile redesign de Detalles | 2-3 h | Alto — pestaña frecuente |
| 🟠 3 | BUG-2: Ocultar tabla desktop en Participantes | 15 min | Alto — duplicación |
| 🟠 4 | BUG-4: Mobile redesign de Formato | 1-2 h | Medio |
| 🟠 5 | BUG-6: Lógica `mobileActivePhase` honesta | 5 min | Bajo pero crítico para confianza |
| 🟠 6 | BUG-7: Breakpoint segmented control | 5 min | Bajo |
| 🟡 7 | BUG-12: Correr `tsc` y `lint` | 15 min | Medio — riesgo de runtime errors |
| 🟡 8 | BUG-9: Compactar más el header | 30 min | Medio — UX |
| 🟡 9 | BUG-11: Fetch de próximo evento real | 30 min | Bajo — credibilidad |
| 🟡 10 | BUG-5: Relacionados/Auditoría | 1 h c/u | Bajo |
| 🟡 11 | BUG-8: Render condicional con useMediaQuery | 1 h | Bajo |
| 🟡 12 | BUG-13: Pase A11y completo | 2 h | Medio si apuntan WCAG |
| 🟡 13 | BUG-10: Reevaluar tabs primarios | 5 min decisión + 5 min código | Bajo |

**Total estimado para llegar a "todo bien":** ~10-13 horas de trabajo más.

---

## 4. Mi recomendación

**Para shippear ya** una versión mobile aceptable, lo mínimo es:
- Resolver BUG-1 (Estructura duplicada) — 15 min
- Resolver BUG-2 (Participantes duplicada) — 15 min
- Resolver BUG-6 (fase activa engañosa) — 5 min
- Correr `tsc` y `lint` — 15 min

Eso son ~50 min y elimina los bugs visibles más obvios.

**Para que el gestor de torneo individual sea realmente mobile-first**, además hay que rediseñar Detalles y Formato (BUG-3 y BUG-4) — son ~3-5 horas adicionales.

**Para llegar al 100%** (los 4 tabs primarios + 4 secundarios + a11y + perf), son las 10-13 horas.

---

## 5. Métricas para validar después de los fixes

Si los aplicás, podés validar con:

- **Visual diff manual:** abrir cada tab en mobile (DevTools 360×740 y 414×896) y verificar que NO hay duplicación de contenido.
- **Lighthouse mobile:** correr en `/admin/entities/[id]/manage?type=tournament` y comparar score Accessibility/Performance/Best Practices antes vs después.
- **Tap-target audit:** Lighthouse marca los botones <44pt automáticamente.
- **Time-to-first-action:** medir cuántos taps hace falta para "Cargar un resultado" desde el tab activo. Objetivo: 1-2 taps desde el bottom-tab-bar.

---

## 6. Conclusión honesta

El trabajo que hice **avanzó la situación** pero no la cerró:

- **Antes:** 0% mobile-first, todo apretado y rompible.
- **Después de mi pase:** Resumen y Operación quedaron decentes; Estructura y Participantes tienen rediseño pero con bugs de duplicación; Detalles, Formato, Relacionados, Auditoría siguen mal.
- **Para "estar bien":** faltan ~50 min de bugfix + 3-5 h de rediseño de Detalles/Formato.

No mentiría si te dijera "mobile listo para todos los tabs" — solo está listo para 2-3 de los 8. La parte crítica para el usuario diario es Detalles, y esa quedó intacta.
