# TICKET — `NEXT_PUBLIC_RAPIDAPI_KEY` expuesta en el bundle cliente

**Prioridad:** ALTA · **Estado:** RESUELTO (2026-07-30) · **Detectado:** 2026-07-23 (durante Fase 3 del gestor de torneos)

## Qué pasaba
El build de producción emitía la advertencia:
```
[FlashScore] Using NEXT_PUBLIC_RAPIDAPI_KEY (exposed in the client bundle).
Create the server-only env var RAPIDAPI_KEY and remove NEXT_PUBLIC_RAPIDAPI_KEY.
```
El prefijo `NEXT_PUBLIC_` hace que Next incruste la clave en **cualquier bundle cliente que la referencie**. Es el hallazgo **M10** de `AUDITORIA_FRAGILIDAD_DB.md`.

## Corrección al diagnóstico original
La versión previa de este ticket daba por hecho que la clave ya era extraíble desde el navegador. **No lo era.** Se verificó contra un build de producción fresco: el valor no aparecía en ninguno de los 179 chunks JS de `.next/static`.

El motivo es que Next inlinea una `NEXT_PUBLIC_*` **solo** en los chunks que la referencian, y `flashscore.ts` se importaba únicamente desde rutas de API y `lib/server/` — ningún componente `'use client'` lo alcanzaba. La advertencia saltaba porque el código comprobaba *el nombre* de la variable, no porque el valor se hubiera filtrado.

O sea: era un arma cargada, no un disparo. Un solo `import` desde un componente cliente la publicaba sin que nadie se enterara. **Por eso no hizo falta rotar la clave** (punto 4 del plan original, descartado).

## Qué se hizo
1. `.env.local`: `NEXT_PUBLIC_RAPIDAPI_KEY` → `RAPIDAPI_KEY`.
2. `src/lib/services/flashscore.ts`: se eliminó la referencia a `process.env.NEXT_PUBLIC_RAPIDAPI_KEY`. Sin esa referencia **no queda nada que incrustar**, con lo que la filtración se cierra estructuralmente aunque alguien importe el módulo desde el cliente.
3. Mismo archivo: guarda `typeof window !== 'undefined'` que convierte un import desde cliente en un error ruidoso, y `console.error` si falta la clave.
4. `RAPIDAPI_HOST` pasa a aceptarse como nombre propio; `NEXT_PUBLIC_RAPIDAPI_HOST` sigue valiendo como fallback (un hostname no es secreto).
5. `scripts/dev-perf-lab.mjs`: `RAPIDAPI_KEY` sumada a `NEUTRALIZE_KEYS`.
6. `docs/ARQUITECTURA_API.md`: documentado el carácter server-only.

## Verificación (2026-07-30)
- `npx tsc --noEmit` → 0 errores.
- `npm run build` → compila, sin la advertencia `[FlashScore] Using NEXT_PUBLIC_...` y sin `Missing RAPIDAPI_KEY` (la clave se toma bien con el nombre nuevo).
- `grep -r "NEXT_PUBLIC_RAPIDAPI_KEY" src/` → 0 resultados.
- Valor de la clave buscado en los 179 chunks de `.next/static` → 0 coincidencias.

## Pendiente — acción manual en Vercel
**El fallback ya no existe.** Antes del próximo deploy hay que crear `RAPIDAPI_KEY` (server-only) en las env vars de Vercel y borrar `NEXT_PUBLIC_RAPIDAPI_KEY`. Si se deploya sin ese paso, FlashScore queda sin clave y los requests fallan.
