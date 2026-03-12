# Troubleshooting UI - Club Management Interface

**Fecha:** 2026-02-24
**Issue:** El UI no se está acomodando correctamente

---

## 🔍 Diagnóstico

Si el UI no se ve como se esperaba, aquí están los posibles problemas y soluciones:

### **Problema 1: Los estilos no se están aplicando**

**Síntoma:** La página se ve con estilos básicos de Tailwind pero sin el tema "Monolith"

**Causa:** El archivo `vitreous-club.css` solo se importa en el componente, no globalmente

**Solución:**

1. Verifica que el servidor de desarrollo esté corriendo:
   ```bash
   npm run dev
   ```

2. Limpia la caché de Next.js:
   ```bash
   rm -rf .next
   npm run dev
   ```

3. Forzar recarga en el navegador:
   - Chrome/Edge: `Ctrl + Shift + R` (Windows) o `Cmd + Shift + R` (Mac)
   - Firefox: `Ctrl + F5`

---

### **Problema 2: El grid no se ve correctamente**

**Síntoma:** El sidebar se apila debajo del contenido principal en lugar de estar al lado

**Causa:** Tailwind no está aplicando las clases responsive correctamente

**Solución:**

Verifica que las clases de Tailwind estén correctas:

```tsx
{/* Debe tener estas clases */}
<main className="grid grid-cols-12 gap-8 px-8 py-8">
  <div className="col-span-12 lg:col-span-9">
    {/* Contenido principal */}
  </div>
  <aside className="col-span-12 lg:col-span-3">
    {/* Sidebar */}
  </aside>
</main>
```

---

### **Problema 3: El header no es sticky**

**Síntoma:** El header se desplaza con el contenido al hacer scroll

**Causa:** Los estilos de `position: sticky` no se están aplicando

**Solución:**

Verifica en el CSS que existan estas clases:

```css
.sticky-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(10, 10, 10, 0.8);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--monolith-border);
}
```

Y que el componente las use:

```tsx
<header className="sticky-header px-8 py-4">
  {/* Contenido del header */}
</header>
```

---

### **Problema 4: Los cards no tienen efecto 3D**

**Síntoma:** Los cards se ven planos sin el efecto de sombra

**Causa:** El pseudo-elemento `::after` no se está renderizando

**Solución:**

Verifica que la clase `.monolith-card` tenga el pseudo-elemento:

```css
.monolith-card {
    background: var(--monolith-surface);
    border: 1px solid var(--monolith-border);
    position: relative;
    border-radius: 0.375rem;
}

.monolith-card::after {
    content: '';
    position: absolute;
    bottom: -4px;
    right: -4px;
    width: 100%;
    height: 100%;
    border-right: 1px solid rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    z-index: -1;
    pointer-events: none;
}
```

---

### **Problema 5: Los inputs no se ven bien**

**Síntoma:** Los inputs tienen estilo por defecto del navegador

**Causa:** Los estilos globales no se están aplicando a inputs/selects

**Solución:**

Añade estos estilos al archivo CSS:

```css
input, select, textarea {
    background: #1a1a1a;
    border: 1px solid var(--monolith-border);
    color: white;
    padding: 0.5rem;
    border-radius: 0.375rem;
    outline: none;
    transition: border-color 0.2s;
    font-size: 14px;
}

input:focus, select:focus, textarea:focus {
    border-color: var(--monolith-accent);
}
```

---

## 🎯 Checklist de Verificación

Marca cada item que hayas verificado:

- [ ] El servidor de desarrollo está corriendo (`npm run dev`)
- [ ] La URL es correcta: `http://localhost:3001/admin/entities/[slug]/manage?type=club`
- [ ] El archivo `vitreous-club.css` está en `src/components/admin/entities/club/`
- [ ] El CSS se importa en `ClubManageShell.tsx`: `import './vitreous-club.css';`
- [ ] Las variables CSS están definidas en `:root` en `vitreous-club.css`
- [ ] El navegador no tiene caché (haz `Ctrl + Shift + R`)
- [ ] No hay errores en la consola del navegador (F12 → Console)
- [ ] No hay errores en la terminal donde corre el servidor

---

## 🔧 Solución Rápida: Reset Completo

Si nada funciona, prueba estos pasos en orden:

### **Paso 1: Limpiar todo**

```bash
# En la terminal del proyecto
cd /c/Users/srome/OneDrive/Escritorio/Grupo-22-Scores

# Matar cualquier proceso de Node.js
taskkill /F /IM node.exe

# Eliminar archivos temporales
rm -rf .next
rm -rf node_modules/.cache

# Reiniciar el servidor
npm run dev
```

### **Paso 2: Verificar en el navegador**

1. Abre DevTools (F12)
2. Ve a la pestaña **Network**
3. Marca "Disable cache"
4. Recarga la página (F5)
5. Verifica que `vitreous-club.css` se esté cargando

### **Paso 3: Inspeccionar elementos**

1. Click derecho en un card → "Inspeccionar elemento"
2. Verifica que tenga la clase `monolith-card`
3. En el panel de estilos, busca `.monolith-card` y verifica que los estilos se apliquen
4. Si los estilos están tachados, hay un conflicto de CSS

---

## 📸 Cómo Debe Verse (Referencia Visual)

### **Header:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [LOGO] Club Atlético Pumas · 2024                              │
│        [Active] [Visible] [Health: WARNING]                     │
│        RUGBY · ARG/BUENOS AIRES/CABA · URBA                     │
│                                    [VISTA PÚBLICA] [GUARDAR]    │
└─────────────────────────────────────────────────────────────────┘
```

### **Tabs:**
```
┌─────────────────────────────────────────────────────────────────┐
│ RESUMEN  IDENTIDAD  PLANTELES  STAFF  COMPETENCIAS  ...        │
│ ════════                                                        │
└─────────────────────────────────────────────────────────────────┘
```

### **Layout Principal:**
```
┌────────────────────────────────────┬───────────────────┐
│                                    │ VALIDACIONES LIVE │
│  HERO CARD (Logo + Stats)          │ ✓ Nombre y Slug OK│
│                                    │ ⚠ Falta logo      │
│                                    │ ✗ Sin unión       │
│  ┌─────────────┬──────────────┐   │                   │
│  │  PLANTELES  │ SALUD DATOS  │   │ PROGRESO PERFIL   │
│  │  ACTIVOS    │              │   │ ████████░░ 65%    │
│  │             │              │   │                   │
│  └─────────────┴──────────────┘   │ ACCIONES RÁPIDAS  │
│                                    │ • Crear plantel   │
│                                    │ • Vincular comp   │
│                                    │                   │
└────────────────────────────────────┴───────────────────┘
```

---

## 🎨 Colores Esperados

Si los colores no coinciden, verifica las variables CSS:

| Elemento | Color Esperado | Variable CSS |
|----------|----------------|--------------|
| Fondo principal | `#0a0a0a` (negro oscuro) | `--monolith-bg` |
| Cards | `#141414` (gris muy oscuro) | `--monolith-surface` |
| Bordes | `#262626` (gris oscuro) | `--monolith-border` |
| Acento azul | `#3b82f6` | `--monolith-accent` |
| Texto principal | `#e5e5e5` (blanco grisáceo) | `--text-main` |

---

## 🐛 Debugging Avanzado

### **Verificar que los estilos se carguen:**

Abre la consola del navegador y ejecuta:

```javascript
// Verificar que las variables CSS estén definidas
getComputedStyle(document.documentElement).getPropertyValue('--monolith-bg')
// Debe retornar: "#0a0a0a" o "rgb(10, 10, 10)"

// Verificar que el elemento tenga la clase correcta
document.querySelector('.monolith-card')
// Debe retornar: un elemento HTML (no null)

// Verificar estilos aplicados
getComputedStyle(document.querySelector('.monolith-card')).backgroundColor
// Debe retornar: "rgb(20, 20, 20)" (que es #141414)
```

### **Verificar conflictos de CSS:**

1. Inspecciona un elemento con DevTools
2. En el panel "Styles", busca estilos tachados
3. Si hay conflictos, aumenta la especificidad:

```css
/* Antes */
.monolith-card { ... }

/* Después (más específico) */
.basalt-ui .monolith-card { ... }
```

---

## 🚀 Si Todo Falla...

Contacta con el equipo y proporciona:

1. **Screenshot** de cómo se ve actualmente
2. **Console logs** (F12 → Console)
3. **Network tab** mostrando los CSS cargados
4. **Versión de Node.js:** `node --version`
5. **Versión de Next.js:** (del package.json)

---

## 📚 Archivos Relacionados

- [ClubManageHeader.tsx](../src/components/admin/entities/club/ClubManageHeader.tsx)
- [ClubManageTabs.tsx](../src/components/admin/entities/club/ClubManageTabs.tsx)
- [ClubManageShell.tsx](../src/components/admin/entities/club/ClubManageShell.tsx)
- [vitreous-club.css](../src/components/admin/entities/club/vitreous-club.css)
- [globals.css](../src/app/globals.css)

---

**Última actualización:** 2026-02-24
