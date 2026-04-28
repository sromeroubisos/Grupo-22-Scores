# Club Admin — Lineamientos Visuales y Sistema de Diseño

> **Versión:** 1.0  
> **Fecha:** 2026-04-28  
> **Alcance:** Todas las pantallas y componentes bajo `/club-admin`

---

## 1. Diagnóstico de la situación anterior

### Problemas identificados

| Problema | Impacto | Ejemplo concreto |
|---|---|---|
| **Múltiples sistemas CSS paralelos** | Alto | `vitreous-club.css` (7.618 líneas), `flash-club-ui.css` (522 líneas), `ClubMatchWorkspace.module.css` (1.730 líneas), `basalt-club.css` (189 líneas) — cada uno con sus propias variables, botones, cards y badges. |
| **Colores de acento inconsistentes** | Alto | Esmeralda `#00a365` en global, azul `#3b82f6` en club-admin, amarillo `#FFD700` en basalt. El usuario no percibe una marca unificada. |
| **Botones duplicados** | Alto | La clase `.btn` está definida en ≥4 archivos con estilos ligeramente diferentes. |
| **Sin componentes UI base** | Alto | No existía `Button`, `Badge`, `Card`, `Input`, `Modal` como componentes React reutilizables. Todo se hacía con clases CSS globales o inline. |
| **Estilos inline abundantes** | Medio | `ClubMatchWorkspace.tsx`, `ClubDataHealthCard.tsx`, `ClubFixtureResultsTab.tsx` usan `style={{...}}` extensivamente para layout y color. |
| **CSS no modularizado** | Medio | `vitreous-club.css` contiene layout, navegación, cards, tablas, badges, animaciones y estados de error en un solo archivo. |
| **Tipografía inconsistente** | Medio | Mezcla de Outfit, Inter, Montserrat y JetBrains Mono sin reglas claras de cuándo usar cada una. |
| **Responsive fragmentado** | Medio | Algunos componentes usan media queries en CSS, otros usan clases Tailwind responsive, sin un sistema coherente. |
| **Accesibilidad deficiente** | Medio | Focus states no uniformes, contrastes variables, selects nativos sin estilizar consistentemente. |

### Hallazgos por categoría

#### Estructura visual
- El layout de club-admin usa un grid de 280px + 1fr para sidebar + contenido, pero está hardcodeado en CSS.
- Las cards usan 4 bordes radius diferentes: `16px`, `18px`, `20px`, `22px`, `24px`, `28px` en la misma vista.
- Los paddings varían arbitrariamente: `1rem`, `1.15rem`, `1.2rem`, `1.25rem`, `1.5rem`, `1.7rem`.

#### CSS existente
- 88 archivos `.css` + 64 archivos `.module.css` en todo el proyecto.
- Variables CSS duplicadas: `--tm-bg`, `--bg`, `--color-bg-primary`, `--bg-void` apuntan al mismo concepto.
- Uso de `rgba()` hardcodeado en lugar de variables CSS en decenas de lugares.

#### Componentización
- `ClubManageShell.tsx` y `TournamentManageShell.tsx` implementan el mismo patrón (dirty state, save con Ctrl+S, toast, action footer) sin compartir código.
- `TabPlaceholder` existe en dos versiones con el mismo nombre.
- `ImportParticipantsDrawer` y `ImportParticipantsDrawerV2` coexisten.

---

## 2. Sistema de diseño unificado (implementado)

### 2.1 Tokens CSS

Archivo fuente: `src/app/club-admin/styles/club-admin-design-system.css`

Todos los componentes y páginas de Club Admin deben usar estas variables:

```css
/* Accent */
--ca-accent: #3b82f6;
--ca-accent-hover: #2563eb;
--ca-accent-glow: rgba(59, 130, 246, 0.35);
--ca-accent-subtle: rgba(59, 130, 246, 0.12);

/* Backgrounds (heredan del tema global) */
--ca-bg: var(--color-bg-primary);
--ca-surface: var(--color-bg-secondary);
--ca-surface-elevated: var(--color-bg-tertiary);
--ca-surface-hover: var(--color-bg-hover);

/* Borders */
--ca-border: var(--color-border);
--ca-border-light: var(--color-border-light);

/* Text */
--ca-text: var(--color-text-primary);
--ca-text-secondary: var(--color-text-secondary);
--ca-text-muted: var(--color-text-muted);

/* Semantic */
--ca-success: #22c55e;
--ca-warning: #f59e0b;
--ca-danger: #ef4444;
--ca-info: #3b82f6;
```

> **Regla de oro:** Nunca hardcodear colores en componentes de Club Admin. Siempre usar `var(--ca-*)` o las clases utilitarias del design system.

### 2.2 Paleta de colores

| Token | Dark | Light | Uso |
|---|---|---|---|
| `--ca-accent` | `#3b82f6` | `#2563eb` | Botones primarios, badges info, focus states |
| `--ca-success` | `#22c55e` | `#16a34a` | Estados exitosos, badges success |
| `--ca-warning` | `#f59e0b` | `#ca8a04` | Advertencias, indicador de cambios sin guardar |
| `--ca-danger` | `#ef4444` | `#dc2626` | Errores, eliminación, badges danger |
| `--ca-text` | `#f2f2f2` | `#111827` | Texto principal |
| `--ca-text-secondary` | `#a1a1aa` | `#4b5563` | Texto secundario, descripciones |
| `--ca-text-muted` | `#52525b` | `#9ca3af` | Placeholders, texto deshabilitado |

### 2.3 Tipografía

| Uso | Fuente | Tamaño | Peso |
|---|---|---|---|
| UI general | Inter | `--ca-text-sm` (14px) | 400–600 |
| Títulos de card | Inter | `--ca-text-sm` (14px) | 800 (uppercase, tracking-widest) |
| Títulos de página | Inter | `--ca-text-3xl` (30px) | 800 |
| Kicker/label | Inter | `--ca-text-xs` (12px) | 700 (uppercase, tracking-wide) |
| Monospace (stats, IDs) | JetBrains Mono | `--ca-text-xs`–`sm` | 500–600 |

> **Prohibido:** usar `font-black` + `uppercase` + `tracking-[0.24em]` combinaciones arbitrarias. Usar las clases definidas en el design system.

### 2.4 Espaciado

Usar la escala unificada:

```
--ca-space-1: 0.25rem   (4px)
--ca-space-2: 0.5rem    (8px)
--ca-space-3: 0.75rem   (12px)
--ca-space-4: 1rem      (16px)
--ca-space-5: 1.25rem   (20px)
--ca-space-6: 1.5rem    (24px)
--ca-space-8: 2rem      (32px)
```

### 2.5 Border radius

```
--ca-radius-sm:  0.375rem  (6px)   → inputs, badges
--ca-radius-md:  0.5rem    (8px)   → botones pequeños
--ca-radius-lg:  0.75rem   (12px)  → botones, selects
--ca-radius-xl:  1rem      (16px)  → cards pequeñas
--ca-radius-2xl: 1.5rem    (24px)  → cards principales
```

> **Regla:** No usar valores arbitrarios como `rounded-[28px]`. Elegir el token más cercano.

---

## 3. Componentes base (implementados)

Ubicación: `src/components/admin/ui/`

### `Button`
```tsx
<Button variant="primary" size="md" isLoading={false}>
  Guardar
</Button>
```

**Variantes:** `primary` | `secondary` | `ghost` | `danger`  
**Tamaños:** `sm` | `md` | `lg`

### `Badge`
```tsx
<Badge variant="success" dot>Publicado</Badge>
```

**Variantes:** `default` | `success` | `warning` | `danger` | `info` | `live`

### `Card`
```tsx
<Card interactive padding="md">
  <CardHeader>
    <CardTitle>Jugadores</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### `Input` / `Select` / `Textarea`
```tsx
<Input label="Nombre" placeholder="Ej: Club Atlético" error={error?.name} />
<Select label="Deporte" options={[{ value: 'rugby', label: 'Rugby' }]} />
```

### `Modal`
```tsx
<Modal isOpen={open} onClose={close} title="Confirmar" size="sm" footer={...}>
  Contenido
</Modal>
```

### `EmptyState`
```tsx
<EmptyState
  kicker="Club Admin"
  title="No hay clubes asignados"
  description="..."
  icon={<Users className="h-8 w-8" />}
  actions={[{ label: 'Volver', href: '/club-admin' }]}
/>
```

---

## 4. Reglas de migración

### ✅ Hacer
1. **Usar siempre las variables CSS del design system** en nuevos componentes.
2. **Importar componentes base** desde `@/components/admin/ui` en lugar de crear botones/cards/badges custom.
3. **Aplicar `data-club-admin="true"`** o la clase `club-admin-scope` en contenedores de club-admin para activar los tokens.
4. **Usar focus-visible** para estados de foco accesibles.
5. **Usar la escala de espaciado y radius** en lugar de valores arbitrarios.

### ❌ No hacer
1. **No crear nuevos archivos `.css` grandes** para subsecciones de club-admin. Usar CSS Modules solo cuando sea estrictamente necesario.
2. **No usar estilos inline** (`style={{...}}`) salvo para valores dinámicos calculados (ej: porcentajes de barra de progreso).
3. **No hardcodear colores** como `#3b82f6`, `#22c55e`, etc. Usar `var(--ca-accent)`, `var(--ca-success)`.
4. **No duplicar componentes** que ya existen en `src/components/admin/ui/`.
5. **No mezclar sistemas de diseño** en la misma página (no combinar clases de `vitreous-club.css` con clases del nuevo design system sin refactorizar).

---

## 5. Plan de migración priorizado

### Prioridad 1 — Hecho ✅
- [x] Crear sistema de tokens CSS unificado (`club-admin-design-system.css`)
- [x] Crear componentes UI base (`Button`, `Badge`, `Card`, `Input`, `Select`, `Textarea`, `Modal`, `EmptyState`)
- [x] Crear layout de club-admin que importe el design system
- [x] Refactorizar estados de error en `club-admin/page.tsx`
- [x] Refactorizar estado de error en `club-admin/matches/[id]/page.tsx`
- [x] Refactorizar `ClubManageHeader.tsx` para usar `Button` y `Badge`
- [x] Refactorizar `ClubManageTabs.tsx` para usar `Select`

### Prioridad 2 — Próximo
- [ ] Refactorizar `ClubAccessHub.tsx` para usar `Card` y tokens del design system
- [ ] Refactorizar `ClubMatchWorkspace.tsx` para eliminar estilos inline masivos
- [ ] Crear componente `Table` base y aplicar a tablas de club-admin
- [ ] Normalizar modales/drawers existentes para usar `Modal`
- [ ] Refactorizar `ClubManageShell.tsx` para usar `Card` en lugar de `.card` de vitreous

### Prioridad 3 — Mediano plazo
- [ ] Dividir `vitreous-club.css` en módulos temáticos (layout, nav, cards, access, etc.)
- [ ] Unificar `ClubManageShell.tsx` y `TournamentManageShell.tsx` en un `EntityShell` abstracto
- [ ] Migrar todos los estilos inline restantes en tabs de club-admin
- [ ] Auditar contraste y accesibilidad con herramientas automatizadas
- [ ] Documentar patrones de responsive para club-admin

### Prioridad 4 — Largo plazo
- [ ] Evaluar migración completa a Tailwind + CSS variables (eliminar CSS files grandes)
- [ ] Crear storybook o documentación visual de componentes
- [ ] Implementar pruebas visuales con Playwright

---

## 6. Responsive

### Breakpoints

Usar los breakpoints estándar de Tailwind:

```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Reglas específicas de Club Admin

- **Sidebar:** En `< 1024px`, colapsar a bottom sheet o menú hamburguesa.
- **Cards grid:** `grid-cols-1` en mobile, `grid-cols-2` en tablet, `grid-cols-3` en desktop.
- **Tables:** En mobile `< 768px`, convertir a cards apiladas o usar scroll horizontal con `overflow-x-auto`.
- **Empty states:** Reducir padding y tamaño de título en mobile.

### Mobile-first

Todos los nuevos estilos deben escribirse mobile-first:

```css
/* Mobile por defecto */
.my-grid {
  grid-template-columns: 1fr;
}

/* Tablet+ */
@media (min-width: 768px) {
  .my-grid {
    grid-template-columns: 1fr 1fr;
  }
}
```

---

## 7. Accesibilidad

### Focus states
- Todos los elementos interactivos deben tener `focus-visible` visible.
- El color de foco es `--ca-accent` con un `outline-offset: 2px`.
- No eliminar outlines sin proporcionar alternativa.

### Contraste
- Texto principal sobre fondo: ratio mínimo 4.5:1.
- Texto grande (>18px bold) sobre fondo: ratio mínimo 3:1.
- Badges y chips: asegurar que el texto sea legible sobre el fondo del badge.

### Semántica
- Usar `<button>` para acciones, `<a>` para navegación.
- Los modales deben tener `role="dialog"`, `aria-modal="true"`, y cerrarse con `Escape`.
- Los selects deben tener `<label>` asociado.

### Motion
- Respetar `prefers-reduced-motion`.
- El design system ya incluye la media query correspondiente.

---

## 8. Archivos clave

| Archivo | Rol |
|---|---|
| `src/app/club-admin/styles/club-admin-design-system.css` | Tokens y clases utilitarias del sistema |
| `src/app/club-admin/layout.tsx` | Layout que aplica el scope del design system |
| `src/components/admin/ui/Button.tsx` | Botón unificado |
| `src/components/admin/ui/Badge.tsx` | Badge unificado |
| `src/components/admin/ui/Card.tsx` | Card con subcomponentes |
| `src/components/admin/ui/Input.tsx` | Input, Select, Textarea |
| `src/components/admin/ui/Modal.tsx` | Modal con portal y accesibilidad |
| `src/components/admin/ui/EmptyState.tsx` | Estados vacíos/error normalizados |
| `src/components/admin/ui/index.ts` | Exports centralizados |

---

## 9. Cómo agregar una nueva pantalla en Club Admin

1. Crear la página en `src/app/club-admin/nueva-ruta/page.tsx`.
2. Heredar automáticamente el layout de `club-admin/layout.tsx` (ya aplica `data-club-admin="true"`).
3. Importar componentes base desde `@/components/admin/ui`.
4. Usar las clases del design system: `ca-card`, `ca-btn`, `ca-btn--primary`, etc.
5. No crear CSS nuevo salvo que sea estrictamente necesario; preferir Tailwind + variables CSS.
6. Si se necesita CSS específico, usar CSS Modules (`*.module.css`) y las variables `--ca-*`.

---

*Documento mantenido por el equipo de frontend. Actualizar cuando se agreguen nuevos tokens o componentes.*
