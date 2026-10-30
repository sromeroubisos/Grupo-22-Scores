# Gestor de Torneos — Baseline de performance (antes de tocar nada)

**Fecha:** 2026-07-23 · **Página:** `/admin/entities/[id]/manage?type=tournament`
**Propósito:** foto del "antes" para comparar contra el "después" en Fase 3 (criterio de aceptación: reportar el número).

> **Importante sobre el método:** el peso de CSS/JS y los conteos de requests derivados del código son medibles ahora y son reales. **TTI y el waterfall de red en vivo requieren una sesión autenticada real** (login de admin + un torneo con datos), que no es alcanzable de forma headless en este entorno. Para esos, abajo dejo una **receta repetible** que el equipo corre idéntica antes y después.

---

## 1. Peso de assets (source bytes, pre-minify/gzip) — REAL

### CSS del módulo `src/components/admin/entities/tournament/`
- **Total: 962,2 KB en 16 archivos.**
- Top ofensores: `tournament-mobile.css` 249,7 KB · `basalt.css` 153,3 KB · `tournament-structure.css` 140,4 KB · `tournament-participants-flash.css` 88,9 KB · `fixture-management.css` 70,8 KB · `phase-wizard.css` 50,9 KB.
- Solo 5 CSS Modules (limpios): ~106 KB del total. El resto (~856 KB) es CSS global side-effect.

### TSX del mismo módulo
- **Total: 1.348,5 KB en 53 archivos** (incluye código muerto: `.backup`, `.old`, árbol fixture legacy).
- Los archivos >400 líneas suman la mayor parte (ver Fase 1 §1).

### JS bundle del route (First Load JS) — LIMITACIÓN REGISTRADA
No se pudo cerrar el número de bundle JS por route. Motivos (todos verificados 2026-07-23):
1. **Next 16.1.6 no imprime la tabla `Size / First Load JS` por route** en este proyecto — en NINGÚN modo (Turbopack default, `next build --experimental-analyze`, ni webpack). El route sale en el árbol sin columna de tamaño.
2. **`@next/bundle-analyzer` (webpack) no puede correr**: `next build --webpack` falla a compilar por un patrón **repo-wide** — 4 `.module.css` definen variables en `:root`, que el css-loader de webpack rechaza en pure-mode (`onboarding.module.css`, `TournamentRelatedTab.module.css`, `TournamentStatsTab.module.css`, `TournamentFormatTab.module.css`). Turbopack (el build de prod) lo tolera. `:global(:root)` tampoco pasa pure-mode.
3. `next build --experimental-analyze` (Turbopack) genera treemaps whole-app en `.next/diagnostics/analyze/`, no un número por route.

**Se desbloquea gratis más adelante:** la remediación de CSS (Fase 3) mueve esos `:root` del gestor a un archivo de tokens global único (ver `GESTOR_TORNEOS_FASE2_CSS.md`). Cuando eso pase, `next build --webpack` + `@next/bundle-analyzer` van a poder correr y dar el número. El dep quedó instalado y cableado (`ANALYZE=true`), listo para ese momento.

**El número que movemos es el CSS: 962 KB → objetivo <300 KB.** Ese es el payload dominante y medible.

---

## 2. Requests / round-trips — DERIVADO DEL CÓDIGO (real, no runtime)

### Aterrizaje en `?tab=resumen` (default), admin global, cache fría
| Origen | Round-trips DB |
|---|---|
| `getSession` | 1 |
| `resolveEntity` (`select('*')`) | 1 |
| `buildTournamentSeasonNavigation` (barrido temporadas, loops) | ~9 |
| match-count (`matches.select('id')` completo) | 1 |
| **Server render (una vez)** | **~12** |
| Cliente en Resumen (props puras) | 0 |
| **Prefetch (P0-1): 3 renders RSC completos en idle + 1 por hover** | **+33 y creciendo** |
| **Total real en ~2,5s** | **~45** |

### Apertura de `?tab=operacion`
| Origen | Costo |
|---|---|
| Server render (getSession + resolveEntity + barrido ~9) | ~11 round-trips |
| Cliente: `GET /phases` (2 queries) | 1 HTTP |
| Cliente: `GET /fixture` (6 queries, **re-carga phases**) | 1 HTTP |
| Cliente: `GET /groups?phaseId=` | 1 HTTP |
| Prefetch (P0-1) | +33 |

**Porción redundante identificada:** el prefetch storm (~33), la doble carga de phases, y el re-resolve de `current_season_id` por cada route (4× en Participantes).

**Efecto esperado del fix de prefetch (P0-1):** elimina el balloon → Resumen queda en **~12 y estable** (sin escalada). Este es el before/after clave del parche que vas a aplicar.

---

## 3. Receta repetible para TTI + red en vivo (corré idéntica antes y después)

**A. DevTools Network**
1. Chrome → DevTools → Network → ✔ Disable cache → Preserve log.
2. Navegar a `/admin/entities/<ID_REAL>/manage?type=tournament&tab=resumen` (logueado como admin).
3. Registrar: **nº de requests**, **DOMContentLoaded**, **Load**, y en Performance panel el **LCP/TTI**.
4. Repetir para `&tab=operacion&subtab=fixture`.
5. Pasar el mouse por los 9 tabs y anotar cuántos requests extra dispara (mide el prefetch storm).

**B. Lighthouse (mobile)**
- DevTools → Lighthouse → Mobile → Performance + Accessibility → sobre la misma URL. Guardar Performance score, TBT, LCP, CLS, y el audit de tap-targets <44px.

**C. (Opcional) Playwright con sesión sembrada**
- Script que loguee una vez, guarde `storageState`, y mida `page.goto` + `performance.getEntriesByType('navigation')` + `page.on('request')` count. Puedo armarlo si querés automatizar el before/after.

---

## 4. Targets (criterios de aceptación Fase 3)
- Requests en Resumen: de ~45 (con balloon) → **~12 estable** tras P0-1; objetivo final **<10** tras cachear el barrido (P1-1).
- CSS shipped: de **962 KB** → objetivo **<300 KB** (tokens + Modules, matar globals).
- Cero overflow horizontal en 375/768/1024/1440.
- TTI mobile: medir con la receta; objetivo mejora ≥40% tras P0-1+P1-1.
