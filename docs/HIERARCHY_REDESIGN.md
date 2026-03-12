# Rediseño de Jerarquía Visual - Configuración de Planteles

## 🎯 Problema Identificado

La versión anterior presentaba múltiples problemas de jerarquía visual:

### ❌ Antes:
1. **Títulos compitiendo**: "Configuración de planteles", "Unión Cordobesa..." y "Divisiones registradas" competían por atención
2. **"Ver todos" sin sentido**: El botón no aportaba valor cuando ya se mostraba todo
3. **Items parecían inputs**: Las divisiones se veían como campos de formulario
4. **Layout encerrado**: Demasiado margen muerto, contenido apretado
5. **Contraste bajo**: Tipografía gris lavada, difícil de leer
6. **CTAs confusos**: "Gestionar estructura" como acción primaria sin contexto
7. **Botones sin jerarquía**: Todas las acciones con el mismo peso visual

---

## ✅ Solución Implementada

### 1. **Jerarquía Clara de Contenido**

```
┌─ Page Header (subtle, context)
│  • Configuración de planteles (18px, weight 650)
│  • Unión · Temporada (13px, mono, dim)
│
└─ Main Panel (focus area)
   ┌─ Panel Top Bar
   │  • Divisiones (4) ← Título + contador como chip
   │  • [Buscar] [Crear división] [Gestionar estructura]
   │
   └─ Grid 2 columnas
      • División cards (clickeables, hover effect)
```

**Orden de lectura:**
1. Título de página (contexto general)
2. Subtítulo (meta información)
3. Panel principal (contenido actionable)
4. Items individuales

---

### 2. **Panel Card System**

En lugar de items flotantes, ahora hay un **panel contenedor** premium:

```css
.panel {
    max-width: 1200px;
    margin: 0 auto;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(20, 20, 22, 0.55);
    backdrop-filter: blur(10px);
}
```

**Características:**
- Fondo translúcido con blur
- Borde sutil anodizado
- Max-width para evitar dispersión
- Padding generoso pero balanceado

---

### 3. **Panel Top Bar - Organización Clara**

```html
<div class="panel-top">
  <!-- Izquierda: Título contextual -->
  <div class="panel-title">
    <h2>Divisiones</h2>
    <span class="chip-count">4</span>
  </div>

  <!-- Derecha: Acciones -->
  <div class="panel-actions">
    <input class="search" placeholder="Buscar división..." />
    <button class="btn btn-primary">Crear división</button>
    <button class="btn">Gestionar estructura</button>
  </div>
</div>
```

**Mejoras:**
- ✅ Contador como chip pequeño (no texto grande)
- ✅ Search integrado en la barra de acciones
- ✅ Botón primario claro: **Crear división**
- ✅ Botón secundario: Gestionar estructura

---

### 4. **Row Cards - De "Inputs" a "Clickeables"**

#### Antes (parecía input):
```
┌─────────────────────────────┐
│ ○ PLANTER SUPERIOR          │ ← Parecía radio button
└─────────────────────────────┘
```

#### Después (card clickeable):
```
┌─────────────────────────────────────────┐
│ Plantel Superior               [Activa] │
│ 34 jugadores · Top 10                ⋯ │
└─────────────────────────────────────────┘
   ↑ Hover effect + translateY(-1px)
```

**Estructura:**
```html
<button class="row" onclick="openSquad()">
  <div class="row-main">
    <div class="row-title">Nombre división</div>
    <div class="row-meta muted">Metadatos</div>
  </div>
  <div class="row-actions">
    <span class="chip chip-ok">Activa</span>
    <button class="kebab">⋯</button>
  </div>
</button>
```

**CSS clave:**
```css
.row {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 10, 11, 0.35);
    cursor: pointer;
    transition: all 0.15s ease;
}

.row:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(10, 10, 11, 0.55);
}
```

---

### 5. **Grid 2 Columnas con Spacing Real**

```css
.grid-2 {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

@media (max-width: 900px) {
    .grid-2 {
        grid-template-columns: 1fr;
    }
}
```

**Ventajas:**
- Uso eficiente del espacio horizontal
- Gap consistente (10px)
- Responsive automático
- Max-width del panel evita dispersión

---

### 6. **Tipografía con Contraste Mejorado**

#### Variables actualizadas:
```css
:root {
    --text-main: #f4f4f5;           /* Antes: #e5e5e5 */
    --text-dim: rgba(244,244,245,0.55); /* Más visible */
}
```

#### Tamaños refinados:
```css
.page-head h1 {
    font-size: 18px;        /* Antes: 28px (demasiado grande) */
    font-weight: 650;       /* Medio, no black */
}

.panel-title h2 {
    font-size: 18px;        /* Consistente con h1 */
    font-weight: 650;
}

.row-title {
    font-size: 14px;        /* Legible, no abrumador */
    font-weight: 650;
}

.row-meta {
    font-size: 12px;        /* Secundario */
    color: var(--text-dim);
}
```

---

### 7. **Sistema de Botones con Jerarquía Clara**

#### Primario (Crear división):
```css
.btn-primary {
    background: #3b82f6;
    color: white;
    font-weight: 700;      /* Más fuerte */
    box-shadow: 0 0 15px rgba(59,130,246,0.3); /* Glow al hover */
}
```

#### Secundario (Gestionar estructura):
```css
.btn {
    background: #1c1c1f;
    border: 1px solid rgba(255,255,255,0.08);
    font-weight: 600;      /* Normal */
}
```

#### Terciario (Kebab menu):
```css
.kebab {
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
}
```

**Jerarquía visual:**
1. **Crear división** → Azul brillante, glow
2. **Gestionar estructura** → Gris elevado
3. **Kebab (...)** → Minimal, transparente

---

### 8. **Search Input Premium**

```css
.search {
    width: 260px;
    background: rgba(0, 0, 0, 0.25);    /* Sutil */
    border: 1px solid rgba(255,255,255,0.08);
    padding: 10px 12px 10px 38px;       /* Espacio para icon */
    border-radius: 10px;
}

.search:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.1); /* Ring */
}
```

**Icon interno:**
```html
<div class="search-wrapper">
  <Search class="search-icon" />
  <input class="search" />
</div>
```

---

### 9. **Status Chips - Semántica Visual**

```css
.chip {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    font-family: 'JetBrains Mono';
}

.chip-ok {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.2);
}

.chip-draft {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
}
```

**Estados:**
- ✅ **Activa**: Verde (#10b981)
- 📝 **Borrador**: Gris azulado (#94a3b8)
- 📦 **Archivada**: Gris metálico (#a1a1aa)

---

### 10. **Empty State Mejorado**

```html
<div class="empty-state">
  <Users class="empty-icon" /> <!-- 48px, opacity 0.15 -->
  <p class="empty-text">Aún no hay divisiones registradas</p>
  <button class="btn btn-primary">
    <Plus /> Crear primera división
  </button>
</div>
```

**Mejoras:**
- Icon grande pero sutil (opacity 0.15)
- Mensaje contextual según si hay búsqueda activa
- CTA claro para empezar

---

## 📊 Comparación Antes/Después

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Título principal** | 28px, black, competía | 18px, 650, contexto sutil |
| **Panel container** | Sin panel, items flotantes | Panel glassmorphism |
| **Max width** | Sin límite, disperso | 1200px centrado |
| **Padding lateral** | ~40px inconsistente | 24px consistente |
| **Grid columns** | Layout vertical | 2 columnas responsive |
| **Gap entre items** | Variable | 10px fijo |
| **Row style** | Parecía input | Card clickeable |
| **Hover effect** | Básico | translateY(-1px) + border |
| **CTA principal** | "Gestionar estructura" | "Crear división" |
| **Contador** | Texto normal grande | Chip pequeño (#4) |
| **Contraste texto** | #737373 (bajo) | rgba(244,245,0.55) |
| **Status visual** | Dot pequeño | Chip semántico |
| **Acciones por row** | Múltiples botones | Kebab menu ⋯ |

---

## 🎨 Paleta de Colores Refinada

```css
/* Fondos */
--bg-void: #0a0a0b;                      /* App background */
--surface-panel: rgba(20,20,22,0.55);    /* Main panel */
--surface-row: rgba(10,10,11,0.35);      /* Row default */
--surface-row-hover: rgba(10,10,11,0.55); /* Row hover */

/* Bordes */
--border-subtle: rgba(255,255,255,0.06);  /* Líneas internas */
--border-standard: rgba(255,255,255,0.08); /* Default */
--border-heavy: rgba(255,255,255,0.16);   /* Hover/focus */

/* Texto */
--text-main: #f4f4f5;                    /* Títulos, labels */
--text-dim: rgba(244,244,245,0.55);      /* Secundario */

/* Accent */
--accent-primary: #3b82f6;               /* Azul principal */
--accent-glow: rgba(59,130,246,0.3);     /* Glow effect */
```

---

## 📱 Responsive Behavior

### Desktop (> 900px):
```
┌────────────────────────────────────────┐
│ Divisiones (4)    [Search] [Crear] [...] │
├────────────────────────────────────────┤
│ ┌─────────┐  ┌─────────┐             │
│ │ Card 1  │  │ Card 2  │             │
│ └─────────┘  └─────────┘             │
│ ┌─────────┐  ┌─────────┐             │
│ │ Card 3  │  │ Card 4  │             │
│ └─────────┘  └─────────┘             │
└────────────────────────────────────────┘
```

### Mobile (< 768px):
```
┌──────────────────┐
│ Divisiones   (4) │
│ [Search]         │
│ [Crear división] │
│ [Gest. estruct.] │
├──────────────────┤
│ ┌──────────────┐ │
│ │ Card 1       │ │
│ └──────────────┘ │
│ ┌──────────────┐ │
│ │ Card 2       │ │
│ └──────────────┘ │
└──────────────────┘
```

---

## ♿ Mejoras de Accesibilidad

1. **Focus rings visibles**:
```css
*:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}
```

2. **Elementos semánticos**:
```html
<header class="page-head">...</header>
<section class="panel">...</section>
<button class="row">...</button>  <!-- No div clickeable -->
```

3. **Reduced motion**:
```css
@media (prefers-reduced-motion: reduce) {
    * { transition-duration: 0.01ms !important; }
}
```

4. **Contraste WCAG AA**:
- Text main: #f4f4f5 sobre #0a0a0b → **17.8:1** ✅
- Chips: Colores con suficiente contraste
- Borders: Visibles pero no agresivos

---

## 🚀 Performance

### Mejoras de rendering:
- **Menos DOM nodes**: Estructura simplificada
- **CSS Grid nativo**: Sin librerías
- **Transform para animaciones**: GPU-accelerated
- **Backdrop-filter**: Con fallback
- **Transiciones cortas**: 0.15s (antes 0.2s)

### Bundle size:
- **Antes**: Icons + Toolbar complejo
- **Después**: Solo 3 icons (Search, Plus, MoreVertical, Users)
- **Reducción estimada**: ~15% del componente

---

## 📋 Checklist de Implementación

- [x] Rediseñar estructura HTML
- [x] Reescribir CSS con nueva jerarquía
- [x] Implementar panel glassmorphism
- [x] Grid 2 columnas responsive
- [x] Row cards clickeables
- [x] Status chips semánticos
- [x] Search input premium
- [x] Sistema de botones con jerarquía
- [x] Empty state mejorado
- [x] Responsive mobile
- [x] Focus states accesibles
- [x] Reduced motion support
- [x] Documentación completa

---

## 🎓 Principios de Diseño Aplicados

1. **Visual Hierarchy**: El ojo va de título → panel → items
2. **Progressive Disclosure**: Solo mostrar lo esencial primero
3. **Affordances**: Cards clickeables se ven clickeables
4. **Consistency**: Spacing, borders, colors consistentes
5. **Feedback**: Hover, focus, active states claros
6. **Proximity**: Elementos relacionados agrupados
7. **Contrast**: Texto legible, borders sutiles pero presentes
8. **Simplicity**: Menos elementos compitiendo por atención

---

**Última actualización**: 2026-02-25
**Autor**: UX/UI Refactor - Hierarchy Redesign
**Status**: ✅ Implementado y documentado
