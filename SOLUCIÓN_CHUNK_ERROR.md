# Solución para ChunkLoadError en Next.js

## Error
```
Failed to load chunk /_next/static/chunks/src_app_layout_tsx_1cf6b850._.js
ChunkLoadError at RootLayout (src\app\layout.tsx:46:9)
```

## 🔧 Solución Rápida (Recomendada)

### Opción 1: Usar el script automático

1. **Detén el servidor** (Ctrl+C en la terminal donde corre `npm run dev`)

2. **Ejecuta el script de limpieza:**
   ```bash
   # En Windows
   fix-chunk-error.bat

   # O manualmente:
   taskkill /F /IM node.exe /T
   rmdir /s /q .next
   rmdir /s /q node_modules\.cache
   rmdir /s /q .turbo
   ```

3. **Reinicia el servidor:**
   ```bash
   npm run dev
   ```

4. **Refresca el navegador** con Ctrl+F5 (hard refresh)

---

## 🔧 Solución Alternativa (Si persiste el error)

### Opción 2: Desactivar Turbopack temporalmente

Si el error persiste después de limpiar el caché, desactiva Turbopack:

1. **Edita package.json:**
   ```json
   {
     "scripts": {
       "dev": "next dev --turbopack=false",
       "dev:turbo": "next dev",
       "build": "next build",
       "start": "next start"
     }
   }
   ```

2. **Limpia y reinicia:**
   ```bash
   npm run dev
   ```

3. **Para volver a usar Turbopack:**
   ```bash
   npm run dev:turbo
   ```

---

## 🔧 Solución Completa (Si nada más funciona)

### Opción 3: Limpieza profunda

1. **Detén el servidor:**
   ```bash
   Ctrl+C
   ```

2. **Limpia todo:**
   ```bash
   # Detener todos los procesos Node
   taskkill /F /IM node.exe /T

   # Eliminar carpetas de caché
   rmdir /s /q .next
   rmdir /s /q node_modules\.cache
   rmdir /s /q .turbo
   rmdir /s /q node_modules

   # Reinstalar dependencias
   npm install
   ```

3. **Reinicia:**
   ```bash
   npm run dev
   ```

---

## 🔍 Causa del Error

Este error ocurre por:
- ✅ **Caché corrupto** de Turbopack/Next.js (.next folder)
- ✅ **Hot Module Replacement** (HMR) fallando
- ✅ **Importaciones circulares** o problemáticas
- ✅ **Cambios en tipos TypeScript** que requieren rebuild

## ✅ Prevención

Para evitar este error en el futuro:

1. **Después de cambios grandes en tipos:**
   ```bash
   # Detén el servidor
   Ctrl+C
   # Limpia .next
   rmdir /s /q .next
   # Reinicia
   npm run dev
   ```

2. **Si modificas archivos de contexto (como AuthContext):**
   - Detén y reinicia el servidor
   - Hace hard refresh en el navegador (Ctrl+F5)

3. **Configura scripts útiles en package.json:**
   ```json
   {
     "scripts": {
       "dev": "next dev",
       "dev:clean": "rm -rf .next && next dev",
       "dev:turbo": "next dev --turbopack",
       "dev:no-turbo": "next dev --turbopack=false"
     }
   }
   ```

---

## 📝 Notas Adicionales

### Turbopack en Next.js 16
Next.js 16 usa Turbopack por defecto para `npm run dev`. Turbopack es más rápido pero puede tener problemas de caché.

### Comandos de limpieza rápida
```bash
# Crear alias en tu terminal
alias next-clean="rm -rf .next node_modules/.cache .turbo && echo 'Cache limpiado'"

# Usar:
next-clean && npm run dev
```

### Si usas VSCode
Agrega esta tarea en `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Clean Next.js Cache",
      "type": "shell",
      "command": "rm -rf .next node_modules/.cache .turbo",
      "problemMatcher": []
    }
  ]
}
```

---

## 🆘 Si nada funciona

Si después de todas estas soluciones el error persiste:

1. **Verifica que no haya imports circulares:**
   - AuthContext.tsx → layout.tsx → AuthContext.tsx

2. **Verifica versiones compatibles:**
   ```bash
   npm list next react react-dom
   ```
   Deben ser compatibles (actualmente: Next 16.1.6, React 19.2.3)

3. **Revisa el código de AuthContext:**
   - Asegúrate que usa `'use client'` al inicio
   - No debe tener imports de servidor

4. **Último recurso - borra y reinstala:**
   ```bash
   rm -rf node_modules package-lock.json .next
   npm cache clean --force
   npm install
   npm run dev
   ```

---

**Última actualización:** 9 de febrero de 2026
